// My team — what each engineer and technician did, from what the sheets
// already record (who confirmed / validated / closed something, and when).
// ModuleAccess.js (maTeamHistory_) calls teamCollect_ for GET getTeamHistory,
// then scopes it to the manager's contractor and marks work done while
// covering for someone. Nothing here is entered by hand.
//
// Technicians: routes submitted (on time = by the due date + duration),
//   routes in hand now and overdue.
// Engineers: routes confirmed or returned, lab reports uploaded / validated /
//   returned, closures requested, closures decided (ACC), actions
//   rescheduled. "On time" for an answer = within TEAM_RESPONSE_DAYS of
//   the request.

var TEAM_RESPONSE_DAYS = 3;

function teamDayDiff_(a, b) {
  var x = maYmd_(a), y = maYmd_(b);
  if (!x || !y) return null;
  return Math.round((new Date(y + "T00:00:00Z") - new Date(x + "T00:00:00Z")) / 86400000);
}

function teamCollect_(from, to) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var events = [];
  var open = {};
  var teams = {};
  var team = function (c) {
    c = c || "—";
    // open / overdue: the Team page's "Open work" per contractor (routes, actions, lab reports)
    if (!teams[c]) teams[c] = { contractor: c, waiting: 0, overdue: 0, open: 0, openRoutes: 0, openActions: 0, openReports: 0 };
    return teams[c];
  };
  var ev = function (who, when, kind, label, title, contractor, side, link, days) {
    var date = maYmd_(when);
    if (!who || !date || date < from || date > to) return;
    events.push({
      who: String(who).trim(), date: date, kind: kind, label: label, title: title, contractor: contractor || "", side: side, link: link,
      days: days === null || days === undefined ? null : days,
      onTime: days === null || days === undefined ? null : days <= TEAM_RESPONSE_DAYS,
    });
  };

  // Routes
  readSheet(ss, "ROUTINES", true).forEach(function (r) {
    var id = String(r[0] || "").trim();
    if (!id) return;
    var c = String(r[3] || "").trim();
    var name = String(r[12] || id);
    var link = { page: "routines", recordId: id };
    var st = normRouteStatus_(r[5]);
    var tech = String(r[2] || "").trim().toLowerCase();
    if (r[6] && tech) {
      var due = asDate_(r[14]);
      var limit = due ? new Date(due.getTime() + (parseInt(r[18], 10) || 0) * 86400000) : null;
      var e = { who: tech, date: maYmd_(r[6]), kind: "route-submitted", label: "Route submitted", title: name, contractor: c, side: "Technician", link: link, days: null, onTime: limit ? maYmd_(r[6]) <= maYmd_(limit) : null };
      if (e.date >= from && e.date <= to) events.push(e);
    }
    if (r[7] && r[8]) ev(r[7], r[8], "route-confirmed", "Route confirmed", name, c, "Contractor", link, teamDayDiff_(r[6], r[8]));
    if (r[20] && r[21]) ev(r[20], r[21], "route-returned", "Route returned to the technician", name, c, "Contractor", link, teamDayDiff_(r[6], r[21]));
    if (tech && (st === ROUTE_STATUS.ASSIGNED || st === ROUTE_STATUS.IN_PROGRESS || st === ROUTE_STATUS.PAUSED)) {
      if (!open[tech]) open[tech] = { open: 0, overdue: 0, contractor: c };
      open[tech].open++;
      if (isRouteRowOverdue_(r, today)) open[tech].overdue++;
    }
    if (st === ROUTE_STATUS.WAITING) team(c).waiting++;
    if (c && st !== ROUTE_STATUS.CONFIRMED && st !== ROUTE_STATUS.CANCELLED) {
      team(c).open++; team(c).openRoutes++;
      if (isRouteRowOverdue_(r, today)) team(c).overdue++;
    }
  });

  // Lab reports
  var lpContractor = getLpContractorMap_();
  readSheet(ss, "Data_Entry", true).forEach(function (r) {
    var lp = String(r[0] || "").trim();
    if (!lp) return;
    var c = lpContractor[lp] || "";
    var title = lp + (r[LAB_COL.UID] ? " · " + r[LAB_COL.UID] : "");
    var link = { page: "oilreport", recordId: "" };
    if (r[LAB_COL.UPLOADED_BY] && r[LAB_COL.UPLOADED_DATE]) ev(r[LAB_COL.UPLOADED_BY], r[LAB_COL.UPLOADED_DATE], "lab-uploaded", "Lab report uploaded", title, c, "Contractor", link, null);
    if (r[LAB_COL.VALIDATED_BY] && r[LAB_COL.VALIDATED_DATE]) ev(r[LAB_COL.VALIDATED_BY], r[LAB_COL.VALIDATED_DATE], "lab-validated", "Lab report validated", title, c, "Contractor", link, teamDayDiff_(r[LAB_COL.UPLOADED_DATE], r[LAB_COL.VALIDATED_DATE]));
    if (r[LAB_COL.RETURNED_BY] && r[LAB_COL.RETURNED_DATE]) ev(r[LAB_COL.RETURNED_BY], r[LAB_COL.RETURNED_DATE], "lab-returned", "Lab report returned", title, c, "Contractor", link, teamDayDiff_(r[LAB_COL.UPLOADED_DATE], r[LAB_COL.RETURNED_DATE]));
    if (String(r[LAB_COL.STATUS] || "").trim() === LAB_STATUS.PENDING) { team(c).waiting++; if (c) { team(c).open++; team(c).openReports++; } }
  });

  // Actions
  readSheet(ss, "Action Tracker", true).forEach(function (r) {
    var no = String(r[ACTION_COL.AC_NO] || "").trim();
    if (!no) return;
    var c = actionContractor_(r);
    var title = no + " · " + String(r[ACTION_COL.LP] || "");
    var link = { page: "actions", recordId: no };
    if (r[ACTION_COL.CLOSURE_BY] && r[ACTION_COL.CLOSURE_DATE]) ev(r[ACTION_COL.CLOSURE_BY], r[ACTION_COL.CLOSURE_DATE], "closure-requested", "Closure requested", title, c, "Contractor", link, null);
    if (r[ACTION_COL.DECISION_BY] && r[ACTION_COL.DECISION_DATE]) {
      var approved = /approv/i.test(String(r[ACTION_COL.DECISION] || ""));
      ev(r[ACTION_COL.DECISION_BY], r[ACTION_COL.DECISION_DATE], approved ? "closure-approved" : "closure-returned", approved ? "Closure approved" : "Closure returned", title, c, "ACC", link, teamDayDiff_(r[ACTION_COL.CLOSURE_DATE], r[ACTION_COL.DECISION_DATE]));
    }
    if (r[ACTION_COL.RESCHEDULED_BY] && r[ACTION_COL.RESCHEDULED_DATE]) ev(r[ACTION_COL.RESCHEDULED_BY], r[ACTION_COL.RESCHEDULED_DATE], "action-rescheduled", "Action rescheduled", title, c, "Contractor", link, null);
    var st = normActionStatus_(r[ACTION_COL.STATUS]);
    if (st === ACTION_STATUS.DRAFT) team(c).waiting++;
    if (st === ACTION_STATUS.CLOSURE_REQUESTED) team("ACC").waiting++;
    if (isActionRowOverdue_(r, today)) team(c).overdue++;
    if (c && st !== ACTION_STATUS.CLOSED) { team(c).open++; team(c).openActions++; }
  });

  return { events: events, open: open, teams: Object.keys(teams).filter(function (k) { return k !== "—"; }).map(function (k) { return teams[k]; }) };
}

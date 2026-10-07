// Phase 7 — managers.
//
//  - Escalation: a route or action still overdue 10 days after it became
//    overdue goes to that contractor's manager(s) and the ACC manager(s)
//    (the "ACC managers" / "<contractor> managers" lists in Module Access).
//    Run as part of runDailyOilNotifications; repeated once a week while
//    the item stays overdue.
//  - Team workload (GET getTeamWorkload): per contractor, the open work and
//    what's late — routes per technician, actions by status, lab reports
//    waiting for validation, open suggestions, low-stock products. A
//    contractor's people see their own contractor; ACC sees every one.

var ESCALATE_AFTER_DAYS = 10;
var OPEN_ROUTE_STATUSES = ["Draft", "Assigned", "In Progress"];

// First day a route counts as overdue (due + duration + 7 + 1), or null.
function routeOverdueFrom_(r) {
  var due = asDate_(r[14]);
  if (!due) return null;
  return new Date(due.getTime() + ((parseInt(r[18], 10) || 0) + ROUTE_OVERDUE_GRACE_DAYS + 1) * 86400000);
}

function isRouteRowOverdue_(r, today) {
  var st = normRouteStatus_(r[5]);
  if (OPEN_ROUTE_STATUSES.indexOf(st) === -1) return false;
  var from = routeOverdueFrom_(r);
  return !!from && today.getTime() >= from.getTime();
}

function escalateLongOverdue_(ss, today, sent, newKeys) {
  var cutoff = today.getTime() - ESCALATE_AFTER_DAYS * 86400000;
  var byContractor = {};
  function add(contractor, line, key) {
    if (sent[key]) return;
    newKeys.push(key);
    contractor = contractor || "";
    if (!byContractor[contractor]) byContractor[contractor] = [];
    byContractor[contractor].push(line);
  }

  readSheet(ss, "ROUTINES", true).forEach(function (r) {
    if (!isRouteRowOverdue_(r, today)) return;
    var from = routeOverdueFrom_(r);
    if (from.getTime() > cutoff) return;
    var id = String(r[0] || "").trim();
    add(String(r[3] || "").trim(), "Route " + (r[12] || id) + " — overdue since " + formatDateForEmail_(from) + " (" + normRouteStatus_(r[5]) + ", " + (r[2] || "no technician") + ")", "escalate|route|" + id + "|" + weekKey_(today));
  });

  readSheet(ss, "Action Tracker", true).forEach(function (r) {
    if (!isActionRowOverdue_(r, today)) return;
    var end = actionDueEnd_(r);
    var since = new Date(end.getTime() + 86400000);
    if (since.getTime() > cutoff) return;
    var acNo = String(r[ACTION_COL.AC_NO] || "").trim();
    var lp = String(r[ACTION_COL.LP] || "").trim();
    add(actionContractor_(r), "Action " + acNo + " (" + lp + ") — overdue since " + formatDateForEmail_(since) + ": " + String(r[ACTION_COL.AGREED] || "").trim(), "escalate|action|" + acNo + "|" + lp + "|" + weekKey_(today));
  });

  var accManagers = maResponsibleEmails_(MA_RESP.ACC_MANAGER, "");
  var total = 0;
  Object.keys(byContractor).forEach(function (contractor) {
    var lines = byContractor[contractor];
    var people = accManagers.slice();
    if (contractor && contractor !== "ACC") {
      maResponsibleEmails_(MA_RESP.CONTRACTOR_MANAGER, contractor).forEach(function (e) { if (people.indexOf(e) === -1) people.push(e); });
    }
    var msg = lines.length + " item(s) still overdue " + ESCALATE_AFTER_DAYS + "+ days" + (contractor ? " for " + contractor : "") + ": " + lines.join("; ");
    recordInAppNotificationForEach_(ss, people, "overdue-escalation", msg, contractor, "team", "");
    if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: escalation — " + lines.length + " item(s) overdue " + ESCALATE_AFTER_DAYS + "+ days" + (contractor ? " (" + contractor + ")" : ""), body: lines.join("\n") });
    total += lines.length;
  });
  return total;
}

function getTeamWorkload(scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var data = {};
  function bucket(c) {
    c = c || "—";
    if (!data[c]) {
      data[c] = {
        contractor: c,
        routes: { draft: 0, assigned: 0, inProgress: 0, waitingApproval: 0, overdue: 0, returned: 0 },
        actions: { draft: 0, open: 0, overdue: 0, waitingStoppage: 0, closureRequested: 0 },
        labReportsPending: 0,
        suggestionsOpen: 0,
        lowStock: 0,
        technicians: {}
      };
    }
    return data[c];
  }
  function tech(b, email) {
    if (!b.technicians[email]) b.technicians[email] = { email: email, assigned: 0, inProgress: 0, returned: 0, waitingApproval: 0, overdue: 0 };
    return b.technicians[email];
  }

  readSheet(ss, "ROUTINES", true).forEach(function (r) {
    var c = String(r[3] || "").trim();
    if (scope && c !== scope) return;
    var st = normRouteStatus_(r[5]);
    var b = bucket(c);
    var who = String(r[2] || "").trim();
    var t = who ? tech(b, who) : null;
    var returned = isRouteReturnedRow_(r, st);
    var overdue = isRouteRowOverdue_(r, today);
    if (st === ROUTE_STATUS.DRAFT) b.routes.draft++;
    else if (st === ROUTE_STATUS.ASSIGNED) { b.routes.assigned++; if (t) t.assigned++; }
    else if (st === ROUTE_STATUS.IN_PROGRESS) { b.routes.inProgress++; if (t) t.inProgress++; }
    else if (st === ROUTE_STATUS.WAITING) { b.routes.waitingApproval++; if (t) t.waitingApproval++; }
    if (returned) { b.routes.returned++; if (t) t.returned++; }
    if (overdue) { b.routes.overdue++; if (t) t.overdue++; }
  });

  readSheet(ss, "Action Tracker", true).forEach(function (r) {
    if (!String(r[ACTION_COL.AC_NO] || "").trim()) return;
    var c = actionContractor_(r);
    if (scope && c !== scope) return;
    var st = normActionStatus_(r[ACTION_COL.STATUS]);
    var b = bucket(c);
    if (st === ACTION_STATUS.DRAFT) b.actions.draft++;
    else if (st === ACTION_STATUS.OPEN) b.actions.open++;
    else if (st === ACTION_STATUS.WAITING) b.actions.waitingStoppage++;
    else if (st === ACTION_STATUS.CLOSURE_REQUESTED) b.actions.closureRequested++;
    if (isActionRowOverdue_(r, today)) b.actions.overdue++;
  });

  var lpContractor = getLpContractorMap_();
  readSheet(ss, "Data_Entry", true).forEach(function (r) {
    if (String(r[LAB_COL.STATUS] || "").trim() !== LAB_STATUS.PENDING) return;
    var c = lpContractor[String(r[0] || "").trim()] || "";
    if (scope && c !== scope) return;
    bucket(c).labReportsPending++;
  });

  getSuggestions(scope, false).suggestions.forEach(function (sg) { bucket(sg.contractor).suggestionsOpen++; });

  var stockById = {};
  readSheet(ss, "Oil Inventory LOG", true).forEach(function (r) {
    var id = String(r[1] || "").trim();
    var q = parseFloat(r[3]) || 0;
    var t = String(r[2] || "").trim();
    var d = t === "Receipt" ? Math.abs(q) : t === "Issue" ? -Math.abs(q) : t === "Adjustment" ? q : 0;
    stockById[id] = (stockById[id] || 0) + d;
  });
  readSheet(ss, "Oil Inventory", true).forEach(function (p) {
    var id = String(p[0] || "").trim();
    if (!id) return;
    var c = String(p[16] || "").trim();
    if (scope && c !== scope) return;
    var level = parseFloat(p[7]);
    if (isNaN(level)) return;
    if ((stockById[id] || 0) <= level) bucket(c).lowStock++;
  });

  // Technicians listed in Module Access show up even with nothing assigned.
  Object.keys(data).concat(scope ? [scope] : []).forEach(function (c) {
    if (!c || c === "—" || c === "ACC") return;
    maTechnicians_(c).forEach(function (p) { tech(bucket(c), p.email); });
  });

  var list = Object.keys(data).sort().map(function (c) {
    var b = data[c];
    b.technicians = Object.keys(b.technicians).sort().map(function (k) { return b.technicians[k]; });
    return b;
  });
  return { contractors: list, generatedAt: new Date().toISOString() };
}

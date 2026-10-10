// ─── My team — work history for managers ─────────────────────────────────
// ModuleAccess.js (maTeamHistory_) calls teamCollect_ for GET
// getTeamHistory, then scopes it to the manager's contractor and marks work
// done while covering for someone. Everything comes from what the sheets
// already record (Submitted / Confirmed / Reviewed / Closed by + at).
//
// Technicians: routes submitted (on time = by the planned date), routes in
//   hand now and overdue.
// Contractor engineers: routes confirmed, reports sent (on time = by the
//   45-day due date), closures requested.
// ACC engineers: reports reviewed, actions closed. "On time" for an answer
//   = within VTEAM_RESPONSE_DAYS of the request.

var VTEAM_RESPONSE_DAYS = 3;

function vteamDays_(a, b) {
  a = vlDate_(a); b = vlDate_(b);
  if (!a || !b) return null;
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function teamCollect_(from, to) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = vlToday_();
  var events = [];
  var open = {};
  var teams = {};
  var team = function (c) {
    // open / overdue: the Team page's "Open work" per contractor (reports, routes, actions)
    if (!teams[c]) teams[c] = { contractor: c, waiting: 0, overdue: 0, open: 0, openRoutes: 0, openActions: 0, openReports: 0 };
    return teams[c];
  };
  var ev = function (who, when, kind, label, title, contractor, side, link, days, onTime) {
    var date = vlDate_(when);
    if (!who || !date || date < from || date > to) return;
    if (onTime === undefined) onTime = days === null || days === undefined ? null : days <= VTEAM_RESPONSE_DAYS;
    events.push({ who: String(who).trim(), date: date, kind: kind, label: label, title: title, contractor: contractor || '', side: side, link: link, days: days === undefined ? null : days, onTime: onTime });
  };

  vlRead_(ss, SHEET_VROUTES).rows.forEach(function (raw) {
    var r = vrOut_(raw, today);
    var id = r['Route ID'];
    if (!id) return;
    var c = r['Contractor'];
    var title = r['Name'] || id;
    var link = { page: 'routes', recordId: id };
    if (r['Submitted by'] && r['Submitted at']) {
      var sub = vlDate_(r['Submitted at']);
      ev(r['Submitted by'], r['Submitted at'], 'route-submitted', 'Route submitted', title, c, 'Technician', link, null, r['Planned date'] ? sub <= vlDate_(r['Planned date']) : null);
    }
    if (r['Confirmed by'] && r['Confirmed at']) ev(r['Confirmed by'], r['Confirmed at'], 'route-confirmed', 'Route confirmed', title, c, 'Contractor', link, vteamDays_(r['Submitted at'], r['Confirmed at']));
    var tech = String(r['Technician'] || '').toLowerCase();
    if (tech && ['Assigned', 'In Progress', 'Returned'].indexOf(r['Status']) !== -1) {
      if (!open[tech]) open[tech] = { open: 0, overdue: 0, contractor: c };
      open[tech].open++;
      if (r.overdue) open[tech].overdue++;
    }
    if (r['Status'] === 'Submitted') team(c).waiting++;
    if (c && ['Confirmed', 'Cancelled'].indexOf(r['Status']) === -1) {
      team(c).open++; team(c).openRoutes++;
      if (r.overdue) team(c).overdue++;
    }
  });

  vlRead_(ss, SHEET_VLOG).rows.forEach(function (raw) {
    var r = vlReportOut_(raw, today);
    var id = r['Report ID'];
    if (!id) return;
    var c = r['Contractor'];
    var title = c + ' ' + (r['Report scope'] || '') + ' ' + (r['Month'] || '');
    var link = { page: 'log', recordId: id };
    if (r['Submitted by'] && r['Submitted at']) {
      var sent = vlDate_(r['Submitted at']);
      ev(r['Submitted by'], r['Submitted at'], 'report-sent', 'Report sent to ACC', title, c, 'Contractor', link, null, r['Due date'] ? sent <= r['Due date'] : null);
    }
    if (r['Reviewed by'] && r['Reviewed at']) {
      var returned = r['Workflow status'] === 'Returned';
      ev(r['Reviewed by'], r['Reviewed at'], returned ? 'report-returned' : 'report-approved', returned ? 'Report returned' : 'Report approved', title, c, 'ACC', link, vteamDays_(r['Submitted at'], r['Reviewed at']));
    }
    if (['Draft', 'Returned'].indexOf(r['Workflow status']) !== -1) team(c).waiting++;
    if (r['Workflow status'] === 'ACC review') team('ACC').waiting++;
    if (c && ['Approved', 'Closed', 'Historic'].indexOf(r['Workflow status']) === -1) {
      team(c).open++; team(c).openReports++;
      if (r['Due date'] && r['Due date'] < today && ['Draft', 'Returned'].indexOf(r['Workflow status']) !== -1) team(c).overdue++;
    }
  });

  vlRead_(ss, SHEET_VACTIONS).rows.forEach(function (raw) {
    var a = vaOut_(raw);
    var id = a['Action ID'];
    if (!id) return;
    var c = a['Contractor'];
    var title = id + ' · ' + (a['Equipment ID'] || '');
    var link = { page: 'actions', recordId: id };
    if (a['Closure requested by'] && a['Closure requested at']) ev(a['Closure requested by'], a['Closure requested at'], 'closure-requested', 'Closure requested', title, c, 'Contractor', link, null);
    if (a['Closed by'] && a['Closed at']) ev(a['Closed by'], a['Closed at'], 'action-closed', 'Action closed', title, c, 'ACC', link, vteamDays_(a['Closure requested at'], a['Closed at']));
    if (a['Status'] === 'Draft') team(String(a['Contractor recommendation'] || '').trim() ? 'ACC' : c).waiting++;
    if (a['Status'] === 'Closure Requested') team('ACC').waiting++;
    if (['Open', 'Waiting Stoppage'].indexOf(a['Status']) !== -1 && a['Due date'] && a['Due date'] < today) team(c).overdue++;
    if (c && ['Closed', 'Cancelled'].indexOf(a['Status']) === -1) { team(c).open++; team(c).openActions++; }
  });

  return { events: events, open: open, teams: Object.keys(teams).filter(function (k) { return k; }).map(function (k) { return teams[k]; }) };
}

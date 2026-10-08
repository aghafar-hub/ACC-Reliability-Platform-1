// ─── My Work (platform My Work page, GET getMyWork) ───────────────────────
// Same answer shape as every module (frontend/src/myWork.ts):
//   { moduleId, moduleName, sections: [{ id, title, hint, severity, total,
//     items: [{ id, title, subtitle, meta, flag, link: { page, recordId } }] }] }
// Sections by role (a person with several roles gets them all):
//   Technician — their open vibration routes (the checklist opens in My Work).
//   Contractor Engineer — routes to confirm, routes with no technician,
//     measurements due, reports to send, actions waiting for their
//     recommendation, their actions due.
//   ACC Engineer — reports to review, actions to agree, closures to approve,
//     overdue reports.
//   Managers / App Owner — escalations (10+ days late). View only.

var VMW_MAX = 15;
var VMW_ESCALATE_DAYS = 10;

function vmwSection_(id, title, hint, severity, items) {
  return { id: id, title: title, hint: hint, severity: severity, total: items.length, items: items.slice(0, VMW_MAX) };
}

function handleGetMyWork(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var me = who.me;
  var roles = (session && session.roles) || [];
  var manager = maIsAdmin_(session) || roles.indexOf('ROLE-MGR') !== -1 || roles.indexOf('ROLE-CMGR') !== -1;
  var today = vlToday_();
  var soon = vlAddDays_(today, 7);
  var late = vlAddDays_(today, -VMW_ESCALATE_DAYS);
  var sections = [];
  var out = { moduleId: MA_CONFIG.moduleId, moduleName: MA_CONFIG.moduleName, sections: sections, generatedAt: new Date().toISOString() };
  if (!session) return out;

  var routes = vlRead_(ss, SHEET_VROUTES).rows.map(function (r) { return vrOut_(r, today); });
  var actions = vlRead_(ss, SHEET_VACTIONS).rows.map(vaOut_);
  var reports = vlRead_(ss, SHEET_VLOG).rows.map(function (r) { return vlReportOut_(r, today); });
  var own = function (c) { return !me.contractor || c === me.contractor; };
  var routeItem = function (r, extra) {
    return { id: r['Route ID'], title: r['Name'], subtitle: (r['Points done'] || 0) + ' / ' + (r['Points'] || 0) + ' points · ' + r['Type'] + (r['Technician'] ? ' · ' + r['Technician'] : ''),
      meta: 'Planned ' + r['Planned date'] + (extra || ''), flag: r['Status'] === 'Returned' ? 'returned' : r.overdue ? 'overdue' : '', link: { page: 'routes', recordId: r['Route ID'] } };
  };
  var actionItem = function (a, meta) {
    return { id: a['Action ID'], title: a['Action ID'] + ' · ' + a['Equipment ID'] + ' ' + a['Equipment name'], subtitle: a['Severity'] + ' · ' + (a['Agreed action'] || a['Contractor recommendation'] || 'recommendations to enter'),
      meta: meta, flag: a['Due date'] && a['Due date'] < today && ['Open', 'Waiting Stoppage'].indexOf(a['Status']) !== -1 ? 'overdue' : '', link: { page: 'actions', recordId: a['Action ID'] } };
  };
  var reportItem = function (r, meta, flag) {
    return { id: r['Report ID'], title: r['Contractor'] + ' · ' + r['Report scope'] + ' · ' + r['Month'], subtitle: r['Workflow status'] + ' · ' + r['Report status'], meta: meta, flag: flag || '', link: { page: 'log', recordId: r['Report ID'] } };
  };

  if (who.tech) {
    var mine = routes.filter(function (r) { return String(r['Technician']).toLowerCase() === String(me.email).toLowerCase() && ['Assigned', 'In Progress', 'Returned'].indexOf(r['Status']) !== -1; })
      .sort(function (a, b) { return a['Planned date'] < b['Planned date'] ? -1 : 1; });
    sections.push(vmwSection_('vib-my-routes', 'My vibration routes', 'Tick each point when measured, then submit for your engineer.', 'action', mine.map(function (r) { return routeItem(r); })));
  }
  if (who.engineer) {
    var c = me.contractor;
    sections.push(vmwSection_('vib-routes-confirm', 'Routes to confirm', 'Submitted by the technician — confirm or return.', 'action',
      routes.filter(function (r) { return r['Contractor'] === c && r['Status'] === 'Submitted'; }).map(function (r) { return routeItem(r, ' · submitted ' + String(r['Submitted at']).slice(0, 10)); })));
    sections.push(vmwSection_('vib-routes-unassigned', 'Routes with no technician', 'Includes ACC emergency routes.', 'warning',
      routes.filter(function (r) { return r['Contractor'] === c && r['Status'] === 'Unassigned'; }).map(function (r) { return routeItem(r, r['Type'] === 'Emergency' ? ' · ACC emergency' : ''); })));
    try {
      var master = vlMasterData_(ss);
      var allRoutes = {};
      vlRead_(ss, SHEET_VROUTES).rows.forEach(function (r) { allRoutes[r['Route ID']] = r; });
      var sugg = vrSuggestions_(ss, master, me, 7, allRoutes).list;
      sections.push(vmwSection_('vib-due', 'Measurements due in 7 days', 'Interval due or follow-up readings — put them on a route.', 'info',
        sugg.map(function (s) { return { id: s.key, title: s.equipmentId + ' · ' + s.name, subtitle: s.reason, meta: 'Due ' + s.due, flag: s.overdue ? 'overdue' : 'due', link: { page: 'routes' } }; })));
    } catch (e) {}
    sections.push(vmwSection_('vib-reports-send', 'Reports to send to ACC', 'Draft or returned reports, and months past the 45-day deadline.', 'action',
      reports.filter(function (r) { return r['Contractor'] === c && (['Draft', 'Returned'].indexOf(r['Workflow status']) !== -1); })
        .map(function (r) { return reportItem(r, 'Due ' + r['Due date'], r['Workflow status'] === 'Returned' ? 'returned' : r['Report status'] === 'Overdue' ? 'overdue' : ''); })));
    sections.push(vmwSection_('vib-actions-rec', 'Actions waiting for your recommendation', 'Draft actions from report findings.', 'action',
      actions.filter(function (a) { return a['Contractor'] === c && a['Status'] === 'Draft' && !String(a['Contractor recommendation'] || '').trim(); }).map(function (a) { return actionItem(a, 'Created ' + String(a['Created at']).slice(0, 10)); })));
    sections.push(vmwSection_('vib-actions-due', 'Your actions due', 'Open actions due within 7 days or past due.', 'warning',
      actions.filter(function (a) { return a['Contractor'] === c && ['Open', 'Waiting Stoppage'].indexOf(a['Status']) !== -1 && a['Due date'] && a['Due date'] <= soon; })
        .sort(function (a, b) { return a['Due date'] < b['Due date'] ? -1 : 1; }).map(function (a) { return actionItem(a, 'Due ' + a['Due date'] + ' · ' + (a['Owner'] || 'no owner')); })));
  }
  if (who.acc) {
    sections.push(vmwSection_('vib-reports-review', 'Reports to review', 'Sent by the contractor — approve or return.', 'action',
      reports.filter(function (r) { return r['Workflow status'] === 'ACC review'; }).map(function (r) { return reportItem(r, 'Received ' + r['Received date']); })));
    sections.push(vmwSection_('vib-actions-agree', 'Actions to agree', 'Draft actions — add the ACC recommendation, agreed action, owner and due date.', 'action',
      actions.filter(function (a) { return a['Status'] === 'Draft'; }).map(function (a) { return actionItem(a, a['Contractor'] + (String(a['Contractor recommendation'] || '').trim() ? ' · contractor recommendation in' : ' · waiting for the contractor')); })));
    sections.push(vmwSection_('vib-closures', 'Closures to approve', 'The contractor asks to close — check the evidence.', 'action',
      actions.filter(function (a) { return a['Status'] === 'Closure Requested'; }).map(function (a) { return actionItem(a, 'Requested ' + String(a['Closure requested at']).slice(0, 10) + ' by ' + a['Closure requested by']); })));
    sections.push(vmwSection_('vib-reports-overdue', 'Overdue reports', 'Past the 45-day deadline with no report sent.', 'warning',
      reports.filter(function (r) { return r['Report status'] === 'Overdue'; }).map(function (r) { return reportItem(r, 'Was due ' + r['Due date'], 'overdue'); })));
  }
  if (manager) {
    var esc = [];
    actions.filter(function (a) { return own(a['Contractor']) && ['Open', 'Waiting Stoppage'].indexOf(a['Status']) !== -1 && a['Due date'] && a['Due date'] < late; })
      .forEach(function (a) { esc.push(actionItem(a, 'Due ' + a['Due date'] + ' · ' + (a['Owner'] || 'no owner'))); });
    routes.filter(function (r) { return own(r['Contractor']) && r.overdue && r['Planned date'] < late; }).forEach(function (r) { esc.push(routeItem(r)); });
    reports.filter(function (r) { return own(r['Contractor']) && r['Report status'] === 'Overdue' && r['Due date'] < late; }).forEach(function (r) { esc.push(reportItem(r, 'Was due ' + r['Due date'], 'overdue')); });
    sections.push(vmwSection_('vib-escalations', 'Escalations', VMW_ESCALATE_DAYS + '+ days late — for follow-up with the team.', 'warning', esc));
  }
  out.sections = sections.filter(function (s) { return s.total > 0 || s.id === 'vib-my-routes'; });
  return out;
}

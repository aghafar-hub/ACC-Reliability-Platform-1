// ─── Vibration routes (workflow "Route Planning & Assignment" and
// "Technician Route Execution") ─────────────────────────────────────────────
//
// Suggestions (worked out on every read, nothing to maintain):
//   - Interval due: an Active machine whose last measurement + its interval
//     (Limits.js, default 30 days) falls within the window, or never measured.
//     Overdue only after VL_GRACE_DAYS (7) more days (MeasurementTracker.js).
//   - Follow-up: an action with "Follow-up reading = Yes" (Open / Waiting
//     Stoppage) — due the action's last finding date + its follow-up days,
//     until the machine is measured again after that finding.
//   No suggestion for a machine already on an active route (no duplicate
//   active work). A suggestion can be dismissed with a reason (kept in
//   "Vibration Route Suggestions") or turned into a route (linked to it and
//   to its source action).
//
// Routes: the contractor engineer groups its own machines into a route, sets
// the date and assigns a technician. ACC engineers can raise an Emergency
// route for any machine (the contractor engineer assigns the technician).
//   Unassigned → Assigned → In Progress → Submitted → Closed
//                                  ↑            ↓ Returned (reason) → technician fixes → Submitted
//   Cancelled (with reason) at any time before Closed.
// The technician ticks Done per VIB point (or skips it with a reason), adds
// equipment and route comments and submits. A route is submitted only when
// every point is done or skipped — a partial route stays open. The contractor
// engineer confirms (closes) it or returns it; closing notifies ACC (no ACC
// approval gate). Done means the field work was done — readings and the
// report come through the Vibration Log.

var SHEET_VROUTES = 'Vibration Routes';
var SHEET_VRPOINTS = 'Vibration Route Points';
var SHEET_VRSUGG = 'Vibration Route Suggestions';
var VROUTE_HEADERS = [
  'Route ID', 'Name', 'Contractor', 'Report scope', 'Type', 'Status', 'Planned date', 'Technician', 'Reason',
  'Source action', 'Source suggestions', 'Machines', 'Points', 'Points done', 'Route comment', 'Created by', 'Created at',
  'Submitted by', 'Submitted at', 'Confirmed by', 'Confirmed at', 'Return reason', 'Cancel reason', 'Updated at'
];
var VRPOINT_HEADERS = ['Route ID', 'Equipment ID', 'VIB ID', 'Point', 'Done', 'Skip reason', 'Equipment comment', 'Done by', 'Done at'];
var VRSUGG_HEADERS = ['Key', 'Equipment ID', 'Reason', 'Status', 'Note', 'By', 'At'];
var VR_ACTIVE = ['Unassigned', 'Assigned', 'In Progress', 'Submitted', 'Returned'];
var VR_TYPES = ['Scheduled', 'Follow-up', 'Emergency'];

function vrRoles_(session) {
  var roles = (session && session.roles) || [];
  var has = function (r) { return roles.indexOf(r) !== -1; };
  var me = vlActor_(session);
  return {
    me: me,
    tech: has('ROLE-TECH'),
    engineer: !!me.contractor && me.contractor !== 'NONE' && (has('ROLE-CENG') || has('ROLE-CMGR')),
    acc: me.canApprove,
  };
}

function vrOut_(r, today) {
  var o = {};
  VROUTE_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; });
  o['Planned date'] = vlDate_(r['Planned date']);
  o.overdue = VR_ACTIVE.indexOf(String(r['Status'])) !== -1 && String(r['Status']) !== 'Submitted' && o['Planned date'] && o['Planned date'] < today;
  return o;
}

function vrSuggestions_(ss, master, me, windowDays, routes) {
  var today = vlToday_();
  var until = vlAddDays_(today, windowDays);
  var last = vtLastMeasured_(ss); // MeasurementTracker.js: readings + the old tracker months
  var busy = {};
  vlRead_(ss, SHEET_VRPOINTS).rows.forEach(function (p) {
    var r = routes[p['Route ID']];
    if (r && VR_ACTIVE.indexOf(String(r['Status'])) !== -1) busy[p['Equipment ID']] = p['Route ID'];
  });
  var dismissed = {};
  vlRead_(ss, SHEET_VRSUGG).rows.forEach(function (s) { if (s['Status'] === 'Dismissed') dismissed[s['Key']] = s; });
  var out = [];
  // follow-ups first (they win over an interval suggestion for the same machine)
  var follow = {};
  vlRead_(ss, SHEET_VACTIONS).rows.forEach(function (a) {
    if (['Open', 'Waiting Stoppage'].indexOf(String(a['Status'])) === -1 || a['Follow-up reading'] !== 'Yes') return;
    var eq = master.eq[a['Equipment ID']];
    if (!eq || eq.inactive || (me.contractor && eq.contractor !== me.contractor)) return;
    var from = vlDate_(a['Last finding date']) || vlDate_(a['Created at']);
    var days = vlNum_(a['Follow-up days']) || 30;
    if (!from || (last[eq.id] && last[eq.id] > from)) return;
    var due = vlAddDays_(from, days);
    var key = 'FU|' + a['Action ID'] + '|' + due;
    follow[eq.id] = true;
    if (dismissed[key] || busy[eq.id] || due > until) return;
    out.push({ key: key, equipmentId: eq.id, name: eq.name, contractor: eq.contractor, scope: eq.scope, type: 'Follow-up',
      reason: a['Severity'] + ' — follow-up reading of ' + a['Action ID'], sourceAction: a['Action ID'], due: due,
      priority: a['Severity'] === 'Danger' ? 'High' : 'Normal', overdue: due < today });
  });
  Object.keys(master.eq).forEach(function (id) {
    var eq = master.eq[id];
    if (!eq.vibIds || eq.inactive || !eq.scope || (me.contractor && eq.contractor !== me.contractor) || follow[id]) return;
    var due = last[id] ? vlAddDays_(last[id], eq.interval || VL_DEFAULT_INTERVAL) : today;
    var key = 'IV|' + id + '|' + due;
    if (dismissed[key] || busy[id] || due > until) return;
    out.push({ key: key, equipmentId: id, name: eq.name, contractor: eq.contractor, scope: eq.scope, type: 'Scheduled',
      reason: last[id] ? 'Every ' + (eq.interval || VL_DEFAULT_INTERVAL) + ' days — last measured ' + last[id] : 'Never measured', sourceAction: '',
      due: due, priority: 'Normal', overdue: (last[id] ? vlAddDays_(due, VL_GRACE_DAYS) : due) < today, lastMeasured: last[id] || '' });
  });
  out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.equipmentId < b.equipmentId ? -1 : 1; });
  return { list: out, busy: busy, last: last };
}

function handleGetVibRoutes(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var me = who.me;
  var today = vlToday_();
  var master = vlMasterData_(ss);
  var all = {};
  vlRead_(ss, SHEET_VROUTES).rows.forEach(function (r) { all[r['Route ID']] = r; });
  var mine = function (r) {
    if (who.tech && !who.engineer && !who.acc) return String(r['Technician']).toLowerCase() === String(me.email).toLowerCase();
    return !me.contractor || r['Contractor'] === me.contractor;
  };
  var routes = Object.keys(all).map(function (k) { return all[k]; }).filter(mine).map(function (r) { return vrOut_(r, today); });
  var windowDays = Math.min(120, Math.max(1, vlNum_(params.days) || 30));
  var sugg = (who.tech && !who.engineer && !who.acc) ? { list: [], last: {} } : vrSuggestions_(ss, master, me, windowDays, all);
  var technicians = [];
  try {
    technicians = (me.contractor ? maTechnicians_(me.contractor) : maTechnicians_('')).map(function (p) { return { email: p.email, name: p.displayName || p.email, contractor: p.contractor }; });
  } catch (e) {}
  var machines = Object.keys(master.eq).sort().map(function (id) {
    var x = master.eq[id];
    return { equipmentId: id, name: x.name, contractor: x.contractor, scope: x.scope, interval: x.interval, inactive: x.inactive,
      lastMeasured: sugg.last[id] || '', nextDue: sugg.last[id] ? vlAddDays_(sugg.last[id], x.interval || VL_DEFAULT_INTERVAL) : '',
      onRoute: sugg.busy ? sugg.busy[id] || '' : '' };
  }).filter(function (m) { return m.contractor && (!me.contractor || m.contractor === me.contractor); });
  return { status: 'ok', today: today, windowDays: windowDays, routes: routes, suggestions: sugg.list, technicians: technicians,
    machines: (who.tech && !who.engineer && !who.acc) ? [] : machines,
    me: { email: me.email, contractor: me.contractor, acc: me.acc, canApprove: me.canApprove, tech: who.tech, engineer: who.engineer } };
}

function handleGetVibRoute(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var r = vlRead_(ss, SHEET_VROUTES).rows.filter(function (x) { return x['Route ID'] === params.routeId; })[0];
  if (!r) return { status: 'error', error: 'Route not found.' };
  if (!vrCanSee_(who, r)) return { status: 'error', error: 'This route is not yours.' };
  var points = vlRead_(ss, SHEET_VRPOINTS).rows.filter(function (p) { return p['Route ID'] === r['Route ID']; }).map(function (p) {
    var o = {}; VRPOINT_HEADERS.forEach(function (h) { o[h] = p[h] === undefined ? '' : p[h]; }); return o;
  });
  var history = vlRead_(ss, SHEET_VAUDIT).rows.filter(function (a) { return a['Record'] === r['Route ID']; }).map(function (a) {
    return { when: String(a['When']), who: a['Who'], action: a['Action'], details: a['Details'] };
  });
  var technicians = [];
  try { technicians = maTechnicians_(r['Contractor']).map(function (p) { return { email: p.email, name: p.displayName || p.email }; }); } catch (e) {}
  return { status: 'ok', route: vrOut_(r, vlToday_()), points: points, history: history, technicians: technicians,
    me: { email: who.me.email, contractor: who.me.contractor, acc: who.me.acc, canApprove: who.me.canApprove, tech: who.tech, engineer: who.engineer } };
}

function vrCanSee_(who, r) {
  if (who.acc || (!who.me.contractor && who.me.acc)) return true;
  if (who.engineer && r['Contractor'] === who.me.contractor) return true;
  if (who.me.contractor && r['Contractor'] === who.me.contractor && !who.tech) return true;
  return String(r['Technician']).toLowerCase() === String(who.me.email).toLowerCase();
}

// link: { routeId, contractor, tech } — tech: the technician's notice opens the
// checklist in My Work; the others open the route on the Routes page.
function vrNotify_(to, subject, body, me, link) {
  try {
    var list = (to || []).filter(function (e, i) { return e && to.indexOf(e) === i && e !== me.email; });
    if (link) vnAdd_(SpreadsheetApp.getActiveSpreadsheet(), list, 'vib-route', subject, link.contractor, link.tech ? 'mywork-route' : 'routes', link.routeId, me);
    if (list.length) msSendMail_({ to: list.join(','), subject: subject, body: body + '\n\nOpen the ACC Reliability Platform → My Work.' });
  } catch (e) {}
}

// params: { route: { name, type, plannedDate, technician, contractor, machines: [eqId], reason, sourceAction, suggestions: [key] } }
function handleCreateVibRoute(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var me = who.me;
  var d = typeof params.route === 'string' ? JSON.parse(params.route) : (params.route || {});
  var type = VR_TYPES.indexOf(d.type) !== -1 ? d.type : 'Scheduled';
  var contractor = me.contractor || String(d.contractor || '');
  if (!who.engineer && !who.acc) return { status: 'error', error: 'Only a contractor engineer (or ACC for an emergency route) creates routes.' };
  if (!who.engineer && type !== 'Emergency') return { status: 'error', error: 'ACC raises Emergency routes only — the contractor plans the others.' };
  if (['RHI', 'ASEC'].indexOf(contractor) === -1) return { status: 'error', error: 'Pick the contractor.' };
  var date = vlDate_(d.plannedDate);
  if (!date) return { status: 'error', error: 'Pick the planned date.' };
  if (date < vlToday_() && type !== 'Emergency') return { status: 'error', error: 'The planned date is in the past.' };
  var machines = (d.machines || []).map(String).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (!machines.length) return { status: 'error', error: 'Pick at least one machine.' };
  if (type === 'Emergency' && !String(d.reason || '').trim()) return { status: 'error', error: 'Say why the emergency measurement is needed.' };
  var master = vlMasterData_(ss);
  var problems = [];
  var scopes = {};
  machines.forEach(function (id) {
    var eq = master.eq[id];
    if (!eq || !eq.vibIds) problems.push(id + ': unknown machine.');
    else if (eq.contractor !== contractor) problems.push(id + ': belongs to ' + eq.contractor + '.');
    else if (eq.inactive) problems.push(id + ': Inactive.');
    else scopes[eq.scope] = true;
  });
  var routes = {};
  vlRead_(ss, SHEET_VROUTES).rows.forEach(function (r) { routes[r['Route ID']] = r; });
  vlRead_(ss, SHEET_VRPOINTS).rows.forEach(function (p) {
    var r = routes[p['Route ID']];
    if (machines.indexOf(p['Equipment ID']) !== -1 && r && VR_ACTIVE.indexOf(String(r['Status'])) !== -1 && problems.indexOf(p['Equipment ID'] + ': already on ' + p['Route ID'] + '.') === -1) {
      problems.push(p['Equipment ID'] + ': already on ' + p['Route ID'] + '.');
    }
  });
  var tech = String(d.technician || '').trim();
  if (tech) {
    var techs = maTechnicians_(contractor).map(function (p) { return String(p.email).toLowerCase(); });
    if (techs.indexOf(tech.toLowerCase()) === -1) problems.push(tech + ' is not a ' + contractor + ' technician.');
  }
  if (problems.length) return { status: 'error', error: problems.join('\n'), problems: problems };

  var t = vlEnsure_(ss, SHEET_VROUTES, VROUTE_HEADERS);
  var max = 0;
  Object.keys(routes).forEach(function (k) { var m = k.match(/(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  var id = 'VR-' + ('0000' + (max + 1)).slice(-5);
  var pt = vlEnsure_(ss, SHEET_VRPOINTS, VRPOINT_HEADERS);
  var nPoints = 0;
  Object.keys(master.vib).sort().forEach(function (v) {
    var p = master.vib[v];
    if (machines.indexOf(p['Equipment ID']) === -1) return;
    nPoints++;
    pt.sheet.appendRow(vlRowFrom_(pt.headers, { 'Route ID': id, 'Equipment ID': p['Equipment ID'], 'VIB ID': v, 'Point': String(p['Point Description']).split(';')[0], 'Done': 'No' }));
  });
  var sc = Object.keys(scopes);
  t.sheet.appendRow(vlRowFrom_(t.headers, {
    'Route ID': id, 'Name': String(d.name || '').trim() || (type + ' · ' + contractor + ' ' + sc.join(', ') + ' · ' + date), 'Contractor': contractor,
    'Report scope': sc.join(', '), 'Type': type, 'Status': tech ? 'Assigned' : 'Unassigned', 'Planned date': date, 'Technician': tech,
    'Reason': String(d.reason || ''), 'Source action': String(d.sourceAction || ''), 'Source suggestions': (d.suggestions || []).join(' '),
    'Machines': machines.length, 'Points': nPoints, 'Points done': 0, 'Created by': me.email, 'Created at': vlNowIso_(), 'Updated at': vlNowIso_(),
  }));
  vlAudit_(ss, me.email, 'Route created', id, type + ' · ' + machines.join(', ') + (tech ? ' · ' + tech : ''));
  if (tech) vrNotify_([tech], 'Vibration route ' + id + ' assigned to you', machines.length + ' machine(s), planned ' + date + '.', me, { routeId: id, contractor: contractor, tech: true });
  else if (type === 'Emergency') vrNotify_(maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor), 'ACC emergency vibration route ' + id, (d.reason || '') + '\nMachines: ' + machines.join(', ') + '\nAssign a technician.', me, { routeId: id, contractor: contractor });
  return { status: 'ok', routeId: id };
}

function vrFind_(ss, id) {
  return vlRead_(ss, SHEET_VROUTES).rows.filter(function (r) { return r['Route ID'] === id; })[0] || null;
}
function vrWrite_(ss, row, changes) {
  var t = vlEnsure_(ss, SHEET_VROUTES, VROUTE_HEADERS);
  var merged = {};
  Object.keys(row).forEach(function (k) { merged[k] = row[k]; });
  Object.keys(changes).forEach(function (k) { merged[k] = changes[k]; });
  merged['Updated at'] = vlNowIso_();
  var vals = vlRowFrom_(t.headers, merged);
  t.sheet.getRange(row._row, 1, 1, vals.length).setValues([vals]);
  return merged;
}

// Technician (own route) or the contractor engineer: Done boxes, skip
// reasons, equipment and route comments.
// params: { routeId, points: [{vibId, done, skipReason}], equipmentComments: {eqId: text}, routeComment }
function handleSaveVibRouteProgress(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var me = who.me;
  var r = vrFind_(ss, String(params.routeId || ''));
  if (!r) return { status: 'error', error: 'Route not found.' };
  var isTech = String(r['Technician']).toLowerCase() === String(me.email).toLowerCase();
  if (!isTech && !(who.engineer && r['Contractor'] === me.contractor)) return { status: 'error', error: 'Only the assigned technician or the contractor engineer updates this route.' };
  var st = String(r['Status']);
  if (['Assigned', 'In Progress', 'Returned'].indexOf(st) === -1) return { status: 'error', error: 'This route is ' + st.toLowerCase() + ' — nothing to tick.' };
  var pts = typeof params.points === 'string' ? JSON.parse(params.points) : (params.points || []);
  var comments = typeof params.equipmentComments === 'string' ? JSON.parse(params.equipmentComments) : (params.equipmentComments || {});
  var pt = vlEnsure_(ss, SHEET_VRPOINTS, VRPOINT_HEADERS);
  var rows = vlRead_(ss, SHEET_VRPOINTS).rows.filter(function (p) { return p['Route ID'] === r['Route ID']; });
  var byVib = {};
  pts.forEach(function (x) { byVib[x.vibId] = x; });
  var now = vlNowIso_();
  var done = 0;
  rows.forEach(function (p) {
    var x = byVib[p['VIB ID']];
    var ch = {};
    if (x) {
      var isDone = x.done === true || x.done === 'Yes';
      var skip = String(x.skipReason || '').trim();
      if (isDone && skip) skip = '';
      if ((isDone ? 'Yes' : 'No') !== String(p['Done'] || 'No')) { ch['Done'] = isDone ? 'Yes' : 'No'; ch['Done by'] = isDone ? me.email : ''; ch['Done at'] = isDone ? now : ''; }
      if (skip !== String(p['Skip reason'] || '')) ch['Skip reason'] = skip;
    }
    if (comments[p['Equipment ID']] !== undefined && String(comments[p['Equipment ID']]) !== String(p['Equipment comment'] || '')) ch['Equipment comment'] = String(comments[p['Equipment ID']]);
    var after = {}; Object.keys(p).forEach(function (k) { after[k] = p[k]; }); Object.keys(ch).forEach(function (k) { after[k] = ch[k]; });
    if (after['Done'] === 'Yes' || String(after['Skip reason'] || '')) done++;
    if (Object.keys(ch).length) pt.sheet.getRange(p._row, 1, 1, pt.headers.length).setValues([vlRowFrom_(pt.headers, after)]);
  });
  var rc = {};
  rc['Points done'] = done;
  if (params.routeComment !== undefined) rc['Route comment'] = String(params.routeComment || '');
  if (st === 'Assigned' && done > 0) rc['Status'] = 'In Progress';
  vrWrite_(ss, r, rc);
  return { status: 'ok', routeId: r['Route ID'], pointsDone: done, points: rows.length };
}

// to: submit | confirm | return | assign | reschedule | cancel
function handleVibRouteTransition(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  var me = who.me;
  var r = vrFind_(ss, String(params.routeId || ''));
  if (!r) return { status: 'error', error: 'Route not found.' };
  var st = String(r['Status']);
  var to = String(params.to || '');
  var reason = String(params.reason || '').trim();
  var isTech = String(r['Technician']).toLowerCase() === String(me.email).toLowerCase();
  var eng = who.engineer && r['Contractor'] === me.contractor;
  var accEmergency = who.acc && r['Type'] === 'Emergency';
  var ch = {};
  var id = r['Route ID'];
  if (to === 'submit') {
    if (!isTech && !eng) return { status: 'error', error: 'Only the assigned technician submits the route.' };
    if (['Assigned', 'In Progress', 'Returned'].indexOf(st) === -1) return { status: 'error', error: 'This route can\'t be submitted now.' };
    var pts = vlRead_(ss, SHEET_VRPOINTS).rows.filter(function (p) { return p['Route ID'] === id; });
    var open = pts.filter(function (p) { return p['Done'] !== 'Yes' && !String(p['Skip reason'] || '').trim(); });
    if (open.length) return { status: 'error', error: open.length + ' point(s) are not done — tick them or give a skip reason. The route stays open until every point is resolved.' };
    ch['Status'] = 'Submitted'; ch['Submitted by'] = me.email; ch['Submitted at'] = vlNowIso_(); ch['Return reason'] = '';
    vrNotify_(maResponsibleEmails_(MA_RESP.CONTRACTOR, r['Contractor']), 'Vibration route ' + id + ' submitted', 'Submitted by ' + me.email + ' — review and confirm.', me, { routeId: id, contractor: r['Contractor'] });
  } else if (to === 'confirm') {
    if (!eng) return { status: 'error', error: 'Only the contractor engineer confirms the route.' };
    if (st !== 'Submitted') return { status: 'error', error: 'Only a submitted route can be confirmed.' };
    ch['Status'] = 'Closed'; ch['Confirmed by'] = me.email; ch['Confirmed at'] = vlNowIso_();
    vrNotify_(maResponsibleEmails_(MA_RESP.ACC, ''), 'Vibration route ' + id + ' completed', r['Name'] + ' — field work confirmed by ' + me.email + '. The readings follow in the contractor report (Vibration Log).', me, { routeId: id, contractor: r['Contractor'] });
  } else if (to === 'return') {
    if (!eng) return { status: 'error', error: 'Only the contractor engineer returns the route.' };
    if (st !== 'Submitted') return { status: 'error', error: 'Only a submitted route can be returned.' };
    if (!reason) return { status: 'error', error: 'Say what needs correcting.' };
    ch['Status'] = 'Returned'; ch['Return reason'] = reason;
    vrNotify_([r['Technician']], 'Vibration route ' + id + ' returned', reason, me, { routeId: id, contractor: r['Contractor'], tech: true });
  } else if (to === 'assign') {
    if (!eng && !accEmergency) return { status: 'error', error: 'Only the contractor engineer assigns the technician.' };
    if (['Closed', 'Cancelled', 'Submitted'].indexOf(st) !== -1) return { status: 'error', error: 'A ' + st.toLowerCase() + ' route can\'t be reassigned.' };
    var tech = String(params.technician || '').trim();
    var techs = maTechnicians_(r['Contractor']).map(function (p) { return String(p.email).toLowerCase(); });
    if (!tech || techs.indexOf(tech.toLowerCase()) === -1) return { status: 'error', error: 'Pick a ' + r['Contractor'] + ' technician.' };
    if (r['Technician'] && !reason) return { status: 'error', error: 'Give the reason for reassigning.' };
    ch['Technician'] = tech;
    if (st === 'Unassigned') ch['Status'] = 'Assigned';
    vrNotify_([tech], 'Vibration route ' + id + ' assigned to you', r['Name'] + ', planned ' + vlDate_(r['Planned date']) + '.', me, { routeId: id, contractor: r['Contractor'], tech: true });
  } else if (to === 'reschedule') {
    if (!eng && !accEmergency) return { status: 'error', error: 'Only the contractor engineer reschedules the route.' };
    if (['Closed', 'Cancelled'].indexOf(st) !== -1) return { status: 'error', error: 'A ' + st.toLowerCase() + ' route can\'t be rescheduled.' };
    var nd = vlDate_(params.plannedDate);
    if (!nd) return { status: 'error', error: 'Pick the new date.' };
    if (!reason) return { status: 'error', error: 'Give the reason for the new date.' };
    ch['Planned date'] = nd;
  } else if (to === 'cancel') {
    if (!eng && !accEmergency) return { status: 'error', error: 'Only the contractor engineer cancels the route.' };
    if (['Closed', 'Cancelled'].indexOf(st) !== -1) return { status: 'error', error: 'This route is already ' + st.toLowerCase() + '.' };
    if (!reason) return { status: 'error', error: 'Give the reason for cancelling.' };
    ch['Status'] = 'Cancelled'; ch['Cancel reason'] = reason;
    if (r['Technician']) vrNotify_([r['Technician']], 'Vibration route ' + id + ' cancelled', reason, me, { routeId: id, contractor: r['Contractor'], tech: true });
  } else {
    return { status: 'error', error: 'Unknown step: ' + to };
  }
  var saved = vrWrite_(ss, r, ch);
  vlAudit_(ss, me.email, { submit: 'Submitted', confirm: 'Confirmed and closed', 'return': 'Returned', assign: 'Technician assigned', reschedule: 'Rescheduled', cancel: 'Cancelled' }[to], id,
    [params.technician, params.plannedDate, reason].filter(function (x) { return x; }).join(' · '));
  return { status: 'ok', routeId: id, route: vrOut_(saved, vlToday_()) };
}

function handleDismissVibSuggestion(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var who = vrRoles_(session);
  if (!who.engineer && !who.acc) return { status: 'error', error: 'Only an engineer dismisses a suggestion.' };
  var key = String(params.key || ''), reason = String(params.reason || '').trim();
  if (!key) return { status: 'error', error: 'Missing suggestion.' };
  if (!reason) return { status: 'error', error: 'Give the reason.' };
  var t = vlEnsure_(ss, SHEET_VRSUGG, VRSUGG_HEADERS);
  t.sheet.appendRow(vlRowFrom_(t.headers, { 'Key': key, 'Equipment ID': String(params.equipmentId || key.split('|')[1]), 'Reason': String(params.suggestionReason || ''), 'Status': 'Dismissed', 'Note': reason, 'By': who.me.email, 'At': vlNowIso_() }));
  vlAudit_(ss, who.me.email, 'Suggestion dismissed', key, reason);
  return { status: 'ok' };
}

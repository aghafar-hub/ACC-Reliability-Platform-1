// ─── Vibration actions (workflow "Automatic Draft Action & Shared
// Recommendations" and "Agreed Action Execution & ACC Closure") ───────────
//
// One action per machine problem, holding four parts in the same record:
// the analysis (report) recommendation, the contractor recommended action,
// the ACC recommended action and the agreed action. Changing a
// recommendation never creates a new action.
//
// Automatic drafts: when ACC approves a report, every machine whose worst
// final status is Caution, Alert or Danger gets a finding. The finding is
// added to the machine's open action (any status but Closed / Cancelled);
// only when there is none is a new Draft action created.
//
// Statuses: Draft → Open → (Waiting Stoppage) → Closure Requested → Closed.
//   - Open needs the agreed action, an owner (contractor engineer) and a due
//     date, and is done by ACC (engineer, manager, App Owner).
//   - Waiting Stoppage is one way (back to Open is not offered).
//   - Closure is requested by the contractor with evidence / comment; ACC
//     closes it (closure date, verifier, evidence and comments are saved) or
//     returns it with a reason (→ Open).
//   - A Draft raised by mistake can be Cancelled by ACC with a reason.
//   - A new finding on an action waiting for closure moves it back to Open.
// Follow-up reading: Alert → 30 days, Danger → 7 days by default (editable;
// "No" when not needed). Routes are made from it (Routes step).

var SHEET_VACTIONS = 'Vibration Actions';
var SHEET_VFINDINGS = 'Vibration Action Findings';
var VACTION_HEADERS = [
  'Action ID', 'Equipment ID', 'Equipment name', 'Contractor', 'Report scope', 'Status', 'Severity', 'Findings',
  'Last finding date', 'Last report ID', 'Source', 'Analysis recommendation', 'Contractor recommendation',
  'ACC recommendation', 'Agreed action', 'Priority', 'Owner', 'Due date', 'Follow-up reading', 'Follow-up days',
  'Closure evidence', 'Closure comment', 'Closure requested by', 'Closure requested at', 'Closed by', 'Closed at',
  'Return reason', 'Created by', 'Created at', 'Updated at'
];
var VFINDING_HEADERS = ['Finding ID', 'Action ID', 'Report ID', 'Equipment ID', 'Month', 'Severity', 'Points', 'Created at', 'Recommendation'];
var VA_OPEN = ['Draft', 'Open', 'Waiting Stoppage', 'Closure Requested'];
var VA_FOLLOWUP_DAYS = { Alert: 30, Danger: 7 };
var VA_PRIORITIES = ['Immediate', 'Next stoppage', 'Planned', 'Monitor only'];

function vaOut_(r) {
  var o = {};
  VACTION_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; });
  o['Due date'] = vlDate_(r['Due date']);
  o['Last finding date'] = vlDate_(r['Last finding date']);
  return o;
}

function vaWrite_(ss, row, changes) {
  var t = vlEnsure_(ss, SHEET_VACTIONS, VACTION_HEADERS);
  var merged = {};
  Object.keys(row || {}).forEach(function (k) { merged[k] = row[k]; });
  Object.keys(changes).forEach(function (k) { merged[k] = changes[k]; });
  merged['Updated at'] = vlNowIso_();
  var vals = vlRowFrom_(t.headers, merged);
  if (row && row._row) t.sheet.getRange(row._row, 1, 1, vals.length).setValues([vals]);
  else t.sheet.appendRow(vals);
  return merged;
}

function vaNextId_(rows) {
  var max = 0;
  rows.forEach(function (r) { var m = String(r['Action ID'] || '').match(/(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  return 'VA-' + ('0000' + (max + 1)).slice(-5);
}

// Summary of the abnormal points of one machine in one report.
function vaPointsText_(entries) {
  return entries.filter(function (e) { return (VL_LEVEL_RANK[e['Final status']] || 0) >= 2 && e['Reading kind'] !== 'Earlier reading in month'; })
    .map(function (e) {
      var fam = e['Family'];
      var v = fam === 'RMS' ? e['Max velocity (mm/s)'] + ' mm/s' : fam === 'SPM' ? 'HDm ' + e['HDm (dBsv)'] : e["G's (g)"] + ' g';
      return String(e['Point description']).replace(/\s*\(.*\)$/, '') + ' ' + fam + ' ' + v + ' (' + e['Final status'] + (e['Report differs'] === 'Yes' ? ', report' : '') + ')';
    }).join('; ');
}

// Called when a report is approved (VibrationLog.js). Returns {created, added}.
function vaApplyFindings_(ss, rep, me) {
  var id = rep['Report ID'];
  var entries = vlRead_(ss, SHEET_VENTRIES).rows.filter(function (r) { return r['Report ID'] === id; });
  var byEq = {};
  entries.forEach(function (e) { (byEq[e['Equipment ID']] = byEq[e['Equipment ID']] || []).push(e); });
  var acts = vlRead_(ss, SHEET_VACTIONS);
  var finds = vlRead_(ss, SHEET_VFINDINGS);
  var ft = vlEnsure_(ss, SHEET_VFINDINGS, VFINDING_HEADERS);
  var res = { created: [], added: [] };
  var nextNo = finds.rows.length;
  // the contractor's recommendation from the report (import) goes on the
  // action as "YYYY-MM: text"; one typed by hand in the app is kept
  var recs = vlRecommendations_(ss, id);
  var month = vlMonth_(rep['Month']);
  var recOf = function (eqId) { var r = recs[eqId]; return r && r.recommendation ? month + ': ' + r.recommendation : ''; };
  Object.keys(byEq).sort().forEach(function (eqId) {
    var list = byEq[eqId];
    var worst = '';
    list.forEach(function (e) { if (e['Reading kind'] === 'Earlier reading in month') return; if ((VL_LEVEL_RANK[e['Final status']] || 0) > (VL_LEVEL_RANK[worst] || 0)) worst = e['Final status']; });
    if ((VL_LEVEL_RANK[worst] || 0) < 2) return; // Normal → keep monitoring
    var points = vaPointsText_(list);
    var date = list.map(function (e) { return vlDate_(e['Measurement date']); }).sort().pop();
    var open = acts.rows.filter(function (a) { return a['Equipment ID'] === eqId && VA_OPEN.indexOf(String(a['Status'])) !== -1; })[0];
    var actionId;
    if (open) {
      actionId = open['Action ID'];
      // same report approved again (after a reopen): replace its finding, don't double it
      var dup = finds.rows.filter(function (f) { return f['Action ID'] === actionId && f['Report ID'] === id; })[0];
      var sev = (VL_LEVEL_RANK[worst] || 0) > (VL_LEVEL_RANK[open['Severity']] || 0) ? worst : open['Severity'];
      var ch = { 'Severity': sev, 'Last finding date': date, 'Last report ID': id, 'Findings': (vlNum_(open['Findings']) || 0) + (dup ? 0 : 1) };
      var cur = String(open['Contractor recommendation'] || '');
      if (recOf(eqId) && (!cur.trim() || /^\d{4}-\d{2}:/.test(cur))) ch['Contractor recommendation'] = recOf(eqId);
      if (String(open['Status']) === 'Closure Requested') { ch['Status'] = 'Open'; ch['Return reason'] = 'New finding in ' + id + ' while waiting for closure'; }
      if (!open['Follow-up days'] && VA_FOLLOWUP_DAYS[sev]) { ch['Follow-up reading'] = 'Yes'; ch['Follow-up days'] = VA_FOLLOWUP_DAYS[sev]; }
      vaWrite_(ss, open, ch);
      if (dup) {
        ft.sheet.getRange(dup._row, 1, 1, ft.headers.length).setValues([vlRowFrom_(ft.headers, { 'Finding ID': dup['Finding ID'], 'Action ID': actionId, 'Report ID': id, 'Equipment ID': eqId, 'Month': vlMonth_(rep['Month']), 'Severity': worst, 'Points': points, 'Created at': vlNowIso_(), 'Recommendation': recs[eqId] ? recs[eqId].recommendation : '' })]);
        return;
      }
      res.added.push(actionId);
    } else {
      actionId = vaNextId_(acts.rows);
      var first = list[0];
      var saved = vaWrite_(ss, null, {
        'Action ID': actionId, 'Equipment ID': eqId, 'Equipment name': first['Equipment name'], 'Contractor': rep['Contractor'],
        'Report scope': rep['Report scope'], 'Status': 'Draft', 'Severity': worst, 'Findings': 1, 'Last finding date': date,
        'Last report ID': id, 'Source': 'Automatic', 'Follow-up reading': VA_FOLLOWUP_DAYS[worst] ? 'Yes' : 'No',
        'Follow-up days': VA_FOLLOWUP_DAYS[worst] || '', 'Priority': worst === 'Danger' ? 'Immediate' : '',
        'Contractor recommendation': recOf(eqId),
        'Created by': 'System (' + (me.email || 'ACC') + ' approved ' + id + ')', 'Created at': vlNowIso_(),
      });
      saved._row = null;
      acts.rows.push(saved);
      res.created.push(actionId);
    }
    nextNo++;
    ft.sheet.appendRow(vlRowFrom_(ft.headers, { 'Finding ID': 'VF-' + ('00000' + nextNo).slice(-6), 'Action ID': actionId, 'Report ID': id, 'Equipment ID': eqId,
      'Month': vlMonth_(rep['Month']), 'Severity': worst, 'Points': points, 'Created at': vlNowIso_(), 'Recommendation': recs[eqId] ? recs[eqId].recommendation : '' }));
  });
  if (res.created.length || res.added.length) {
    vlAudit_(ss, me.email, 'Findings from report', id, res.created.length + ' new draft action(s), ' + res.added.length + ' added to open action(s)');
    try {
      var who = maResponsibleEmails_(MA_RESP.CONTRACTOR, rep['Contractor']).concat(maResponsibleEmails_(MA_RESP.ACC, ''));
      who = who.filter(function (e, i) { return e && who.indexOf(e) === i; });
      vnAdd_(ss, who, 'vib-action-findings', res.created.length + ' new draft action(s), ' + res.added.length + ' finding(s) added to open actions from report ' + id,
        rep['Contractor'], 'actions', res.created.length === 1 ? res.created[0] : '', me);
      if (who.length) msSendMail_({ to: who.join(','), subject: 'Vibration findings from ' + id,
        body: res.created.length + ' new draft action(s) and ' + res.added.length + ' finding(s) added to open actions from report ' + id + '.\n\nOpen the ACC Reliability Platform → Vibration Analysis → Actions to enter the recommendations.' });
    } catch (e) {}
  }
  return res;
}

// ─── reads ────────────────────────────────────────────────────────────────

function handleGetVibActions(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var mine = function (r) { return !me.contractor || r['Contractor'] === me.contractor; };
  var actions = vlRead_(ss, SHEET_VACTIONS).rows.filter(mine).map(vaOut_);
  var findings = vlRead_(ss, SHEET_VFINDINGS).rows.filter(function (f) {
    return actions.some(function (a) { return a['Action ID'] === f['Action ID']; });
  }).map(function (f) { var o = {}; VFINDING_HEADERS.forEach(function (h) { o[h] = f[h] === undefined ? '' : f[h]; }); return o; });
  var owners = [];
  try {
    owners = maLoadConfig_().people.filter(function (p) { return p.responsibility === MA_RESP.CONTRACTOR && (!me.contractor || p.contractor === me.contractor); })
      .map(function (p) { return { email: p.email, name: p.displayName || p.email, contractor: p.contractor }; });
  } catch (e) {}
  return { status: 'ok', today: vlToday_(), actions: actions, findings: findings, owners: owners, priorities: VA_PRIORITIES,
           phrases: vsPhrases_(ss), // Settings → Vibration Analysis → Lists
           me: { email: me.email, contractor: me.contractor, acc: me.acc, canApprove: me.canApprove } };
}

function handleGetVibActionHistory(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = String(params.actionId || '');
  return { status: 'ok', history: vlRead_(ss, SHEET_VAUDIT).rows.filter(function (r) { return r['Record'] === id; }).map(function (r) {
    return { when: String(r['When']), who: r['Who'], action: r['Action'], details: r['Details'] };
  }) };
}

// ─── writes ───────────────────────────────────────────────────────────────

function vaFind_(ss, id) {
  return vlRead_(ss, SHEET_VACTIONS).rows.filter(function (r) { return r['Action ID'] === id; })[0] || null;
}

// Create a manual action or edit an action's text / plan (params.item). Who may edit what:
//   contractor (own actions, not Closed): analysis + contractor recommendation;
//     while Open: nothing else — the plan is ACC's.
//   ACC: every field; due date changes on an Open action need a reason.
function handleSaveVibAction(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var d = typeof params.item === 'string' ? JSON.parse(params.item) : (params.item || {});
  var master = vlMasterData_(ss);
  var row = d.actionId ? vaFind_(ss, d.actionId) : null;
  if (d.actionId && !row) return { status: 'error', error: 'Action not found: ' + d.actionId };
  if (!row) {
    var eq = master.eq[String(d.equipmentId || '')];
    if (!eq || !eq.vibIds) return { status: 'error', error: 'Pick the equipment.' };
    if (me.contractor && eq.contractor !== me.contractor) return { status: 'error', error: 'This equipment belongs to another contractor.' };
    var open = vlRead_(ss, SHEET_VACTIONS).rows.filter(function (a) { return a['Equipment ID'] === eq.id && VA_OPEN.indexOf(String(a['Status'])) !== -1; })[0];
    if (open) return { status: 'error', error: eq.id + ' already has an open action (' + open['Action ID'] + '). Add to that one.', actionId: open['Action ID'] };
    if (!String(d.contractorRecommendation || d.accRecommendation || d.analysisRecommendation || '').trim()) return { status: 'error', error: 'Write what the problem is or what should be done.' };
    var all = vlRead_(ss, SHEET_VACTIONS).rows;
    var id = vaNextId_(all);
    var sev = vlLevel_(d.severity) || 'Caution';
    var saved = vaWrite_(ss, null, {
      'Action ID': id, 'Equipment ID': eq.id, 'Equipment name': eq.name, 'Contractor': eq.contractor, 'Report scope': eq.scope,
      'Status': 'Draft', 'Severity': sev, 'Findings': 0, 'Source': 'Manual',
      'Analysis recommendation': String(d.analysisRecommendation || ''), 'Contractor recommendation': String(d.contractorRecommendation || ''),
      'ACC recommendation': me.acc ? String(d.accRecommendation || '') : '', 'Priority': VA_PRIORITIES.indexOf(d.priority) !== -1 ? d.priority : '',
      'Follow-up reading': VA_FOLLOWUP_DAYS[sev] ? 'Yes' : 'No', 'Follow-up days': VA_FOLLOWUP_DAYS[sev] || '',
      'Created by': me.email, 'Created at': vlNowIso_(),
    });
    vlAudit_(ss, me.email, 'Action created', id, eq.id + ' · ' + sev);
    return { status: 'ok', actionId: id, action: vaOut_(saved) };
  }
  if (me.contractor && row['Contractor'] !== me.contractor) return { status: 'error', error: 'This action belongs to another contractor.' };
  var st = String(row['Status']);
  if (st === 'Closed' || st === 'Cancelled') return { status: 'error', error: 'A ' + st.toLowerCase() + ' action can\'t be changed.' };
  var ch = {};
  var changed = [];
  function take(key, col, allowed) {
    if (d[key] === undefined || !allowed) return;
    var v = String(d[key] === null ? '' : d[key]);
    if (v !== String(row[col] || '')) { ch[col] = v; changed.push(col); }
  }
  var contractorTurn = st === 'Draft';
  take('analysisRecommendation', 'Analysis recommendation', me.acc || contractorTurn);
  take('contractorRecommendation', 'Contractor recommendation', me.acc || contractorTurn);
  take('accRecommendation', 'ACC recommendation', me.acc);
  take('agreedAction', 'Agreed action', me.acc);
  take('owner', 'Owner', me.acc);
  if (me.acc && d.priority !== undefined) {
    if (d.priority && VA_PRIORITIES.indexOf(d.priority) === -1) return { status: 'error', error: 'Unknown priority.' };
    take('priority', 'Priority', true);
  }
  if (me.acc && d.severity !== undefined && vlLevel_(d.severity) && vlLevel_(d.severity) !== row['Severity']) { ch['Severity'] = vlLevel_(d.severity); changed.push('Severity'); }
  if (me.acc && d.followUpReading !== undefined) {
    var fu = d.followUpReading === 'Yes' || d.followUpReading === true ? 'Yes' : 'No';
    if (fu !== row['Follow-up reading']) { ch['Follow-up reading'] = fu; changed.push('Follow-up reading'); }
    var days = fu === 'Yes' ? vlNum_(d.followUpDays) : '';
    if (fu === 'Yes' && !(days >= 1 && days <= 365)) return { status: 'error', error: 'Follow-up reading: days between 1 and 365.' };
    if (String(days) !== String(row['Follow-up days'])) { ch['Follow-up days'] = days; changed.push('Follow-up days'); }
  }
  if (me.acc && d.dueDate !== undefined) {
    var due = vlDate_(d.dueDate);
    if (due !== vlDate_(row['Due date'])) {
      if (st !== 'Draft' && !String(d.reason || '').trim()) return { status: 'error', error: 'Give the reason for changing the due date.' };
      ch['Due date'] = due; changed.push('Due date');
    }
  }
  if (!me.acc && Object.keys(d).some(function (k) { return ['accRecommendation', 'agreedAction', 'owner', 'dueDate', 'priority'].indexOf(k) !== -1 && String(d[k] || '') !== String(row[{ accRecommendation: 'ACC recommendation', agreedAction: 'Agreed action', owner: 'Owner', dueDate: 'Due date', priority: 'Priority' }[k]] || ''); })) {
    return { status: 'error', error: 'Only ACC changes the ACC recommendation, agreed action, owner, priority and due date.' };
  }
  if (!me.acc && !contractorTurn && ['analysisRecommendation', 'contractorRecommendation'].some(function (k) {
    return d[k] !== undefined && String(d[k] || '') !== String(row[k === 'analysisRecommendation' ? 'Analysis recommendation' : 'Contractor recommendation'] || '');
  })) return { status: 'error', error: 'The recommendations are fixed once the action is open.' };
  if (!changed.length) return { status: 'ok', actionId: row['Action ID'], action: vaOut_(row), unchanged: true };
  var saved2 = vaWrite_(ss, row, ch);
  vlAudit_(ss, me.email, 'Action edited', row['Action ID'], changed.join(', ') + (d.reason ? ' — ' + d.reason : ''));
  return { status: 'ok', actionId: row['Action ID'], action: vaOut_(saved2) };
}

// to: open | waiting | requestClosure | close | return | cancel
function handleVibActionTransition(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var row = vaFind_(ss, String(params.actionId || ''));
  if (!row) return { status: 'error', error: 'Action not found.' };
  if (me.contractor && row['Contractor'] !== me.contractor) return { status: 'error', error: 'This action belongs to another contractor.' };
  var st = String(row['Status']);
  var to = String(params.to || '');
  var reason = String(params.reason || '').trim();
  var ch = {};
  var notify = null;
  if (to === 'open') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer opens an action.' };
    if (st !== 'Draft') return { status: 'error', error: 'Only a Draft action can be opened.' };
    var miss = [];
    if (!String(row['Agreed action'] || '').trim()) miss.push('agreed action');
    if (!String(row['Owner'] || '').trim()) miss.push('owner');
    if (!vlDate_(row['Due date'])) miss.push('due date');
    if (miss.length) return { status: 'error', error: 'Before opening, fill in: ' + miss.join(', ') + '.' };
    ch['Status'] = 'Open';
    notify = { to: [row['Owner']], subject: 'Vibration action ' + row['Action ID'] + ' assigned to you', body: 'Agreed action for ' + row['Equipment ID'] + ': ' + row['Agreed action'] + '\nDue: ' + vlDate_(row['Due date']) };
  } else if (to === 'waiting') {
    if (st !== 'Open') return { status: 'error', error: 'Only an Open action can wait for a stoppage.' };
    ch['Status'] = 'Waiting Stoppage';
  } else if (to === 'requestClosure') {
    if (st !== 'Open' && st !== 'Waiting Stoppage') return { status: 'error', error: 'Closure can be requested on an Open or Waiting Stoppage action.' };
    var ev = String(params.evidence || '').trim();
    if (!ev && !reason) return { status: 'error', error: 'Add the evidence or a comment on what was done.' };
    ch['Status'] = 'Closure Requested'; ch['Closure evidence'] = ev; ch['Closure comment'] = reason;
    ch['Closure requested by'] = me.email; ch['Closure requested at'] = vlNowIso_(); ch['Return reason'] = '';
    notify = { to: maResponsibleEmails_(MA_RESP.ACC, ''), subject: 'Closure requested: vibration action ' + row['Action ID'], body: row['Equipment ID'] + ' — ' + (reason || '') + (ev ? '\nEvidence: ' + ev : '') };
  } else if (to === 'close') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer closes an action.' };
    if (st !== 'Closure Requested') return { status: 'error', error: 'Only an action waiting for closure can be closed.' };
    ch['Status'] = 'Closed'; ch['Closed by'] = me.email; ch['Closed at'] = vlNowIso_();
    if (reason) ch['Closure comment'] = String(row['Closure comment'] || '') + (row['Closure comment'] ? '\n' : '') + 'ACC: ' + reason;
    notify = { to: [row['Owner']].concat(maResponsibleEmails_(MA_RESP.CONTRACTOR, row['Contractor'])), subject: 'Vibration action ' + row['Action ID'] + ' closed', body: row['Equipment ID'] + ' — closed by ACC.' + (reason ? '\n' + reason : '') };
  } else if (to === 'return') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer returns an action.' };
    if (st !== 'Closure Requested') return { status: 'error', error: 'Only an action waiting for closure can be returned.' };
    if (!reason) return { status: 'error', error: 'Say what is still needed.' };
    ch['Status'] = 'Open'; ch['Return reason'] = reason;
    notify = { to: [row['Owner']].concat(maResponsibleEmails_(MA_RESP.CONTRACTOR, row['Contractor'])), subject: 'Vibration action ' + row['Action ID'] + ' returned', body: row['Equipment ID'] + ' — ' + reason };
  } else if (to === 'cancel') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer cancels an action.' };
    if (st !== 'Draft') return { status: 'error', error: 'Only a Draft action can be cancelled.' };
    if (!reason) return { status: 'error', error: 'Give the reason for cancelling.' };
    ch['Status'] = 'Cancelled'; ch['Return reason'] = reason;
  } else {
    return { status: 'error', error: 'Unknown step: ' + to };
  }
  var saved = vaWrite_(ss, row, ch);
  vlAudit_(ss, me.email, { open: 'Opened', waiting: 'Waiting stoppage', requestClosure: 'Closure requested', close: 'Closed', 'return': 'Returned', cancel: 'Cancelled' }[to], row['Action ID'], reason || params.evidence || '');
  if (notify) {
    try {
      var list = notify.to.filter(function (e, i) { return e && notify.to.indexOf(e) === i && e !== me.email; });
      vnAdd_(ss, list, 'vib-action-' + to, notify.subject + (reason ? ': ' + reason : ''), row['Contractor'], 'actions', row['Action ID'], me);
      if (list.length) msSendMail_({ to: list.join(','), subject: notify.subject, body: notify.body + '\n\nOpen the ACC Reliability Platform → Vibration Analysis → Actions.' });
    } catch (e) {}
  }
  return { status: 'ok', actionId: row['Action ID'], action: vaOut_(saved) };
}

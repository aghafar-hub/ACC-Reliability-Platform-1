// ─── Vibration Log ─────────────────────────────────────────────────────────
// The record of contractor vibration reports: one row per report (contractor
// + scope + month) in "Vibration Log", one row per VIB ID reading in
// "Vibration Log Entries", and one row per equipment covered in "Report
// Coverage". The history was merged into these tabs from RMS DATA / SPM DATA
// / Compliance Tracker (Workflow status "Historic").
//
// Workflow (docs/vibration-workflow.md):
//   Draft → ACC review → Approved, or ACC review → Returned → (fixed) → ACC review.
//   Report status: Not sent yet → Received (on submit). Reports are not
//   chased by date any more: whether each machine was measured on time is
//   the Measurement Tracker's job (MeasurementTracker.js). ACC can mark a
//   month Skipped with a reason.
//
// Every sheet here is read by header name (row 1), so extra columns can be
// added to the tabs without breaking anything; missing columns are added on
// the first write.

var SHEET_VLOG     = 'Vibration Log';
var SHEET_VENTRIES = 'Vibration Log Entries';
var SHEET_VCOVER   = 'Report Coverage';
var SHEET_VAUDIT   = 'Vibration Audit';

var VLOG_HEADERS = [
  'Report ID','Month','Contractor','Report scope','Report status','Workflow status','Source',
  'First reading','Last reading','Equipment in scope','Equipment with readings','VIB IDs read','Entries',
  'Equipment: received','Equipment: report not imported','Equipment: missing','Equipment: readings without mark',
  'Normal','Caution','Alert','Danger','Report vs limits differ','Report file','Notes',
  'Due date','Received date','Contractor report no','Analyst','Issue date',
  'Created by','Created at','Submitted by','Submitted at','Reviewed by','Reviewed at','Return reason','Updated at'
];
var VENTRY_HEADERS = [
  'Entry ID','Report ID','Month','Contractor','Report scope','Line','Equipment ID','Equipment name','VIB ID',
  'Family','Position','Point description','Measurement date','Reading kind','Horizontal (mm/s)','Vertical (mm/s)',
  'Axial (mm/s)','Max velocity (mm/s)','HDm (dBsv)','HDc (dBsv)',"G's (g)",'Limits used (N/C/A)','System status',
  'Report status','Final status','Report differs','Source row','Notes'
];
var VCOVER_HEADERS = [
  'Report ID','Month','Contractor','Report scope','Line','Equipment ID','Equipment name',
  'Compliance mark (old)','Report status','Readings in app','Outcome'
];
var VAUDIT_HEADERS = ['When','Who','Action','Record','Details'];

var VL_DUE_DAYS = 45;
var VL_LEVEL_RANK = { Normal: 1, Caution: 2, Alert: 3, Danger: 4 };
var VL_SCOPE_CODE = { 'Line 1': 'L1', 'Line 2': 'L2', 'Cement Mills': 'CM' };
var VL_RMS_DEFAULT = [2.8, 7.1, 18];
var VL_SPM_DEFAULT = [20, 35, 50];

// ─── small helpers ──────────────────────────────────────────────────────────

// Runs a write under the script lock so two saves can't interleave.
function vlLocked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { status: 'error', error: 'Server is busy — please try again.' };
  try { return fn(); } finally { lock.releaseLock(); }
}

function vlTz_() { return Session.getScriptTimeZone() || 'UTC'; }

// Any date-ish cell → 'yyyy-MM-dd' ('' when empty or not a date).
function vlDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, vlTz_(), 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, vlTz_(), 'yyyy-MM-dd');
}
function vlMonth_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, vlTz_(), 'yyyy-MM');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + '-' + m[2] : '';
}
function vlToday_() { return Utilities.formatDate(new Date(), vlTz_(), 'yyyy-MM-dd'); }
function vlNowIso_() { return new Date().toISOString(); }
function vlAddDays_(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.toISOString().slice(0, 10);
}
function vlMonthEnd_(month) {
  var p = month.split('-');
  return new Date(Date.UTC(+p[0], +p[1], 0)).toISOString().slice(0, 10);
}
function vlNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function vlBand_(value, limits) {
  if (value === null || !limits) return '';
  if (value < limits[0]) return 'Normal';
  if (value < limits[1]) return 'Caution';
  if (value < limits[2]) return 'Alert';
  return 'Danger';
}
function vlLevel_(word) {
  var w = String(word || '').trim().toLowerCase();
  var map = { normal: 'Normal', good: 'Normal', caution: 'Caution', acceptable: 'Caution', satisfactory: 'Caution',
    'under observation': 'Caution', alert: 'Alert', alarm: 'Alert', unsatisfactory: 'Alert', danger: 'Danger',
    unacceptable: 'Danger', unpermissible: 'Danger' };
  return map[w] || '';
}

// A sheet date as 'yyyy-MM-dd'. Sheet dates arrive in the script's time
// zone, so the local parts are the date shown in the sheet — the same as
// Utilities.formatDate(v, vlTz_(), 'yyyy-MM-dd'), many times faster.
function vlYmdFast_(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

// Reads a header-row-1 tab into objects keyed by header text. Inside a read
// request (Cache.js) each tab is read once and shared — callers don't change
// the rows they get.
function vlRead_(ss, name) {
  if (VL_READ_MEMO && VL_READ_MEMO[name]) return VL_READ_MEMO[name];
  var out = vlReadSheet_(ss, name);
  if (VL_READ_MEMO) VL_READ_MEMO[name] = out;
  return out;
}

function vlReadSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return { sheet: null, headers: [], rows: [] };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn ? sh.getLastColumn() : 0;
  if (lastRow < 1) return { sheet: sh, headers: [], rows: [] };
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i], any = false, o = {};
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      var v = r[j];
      if (v instanceof Date) v = vlYmdFast_(v);
      if (v !== '' && v !== null && v !== undefined) any = true;
      o[headers[j]] = v === undefined ? '' : v;
    }
    if (!any) continue;
    o._row = i + 1;
    rows.push(o);
  }
  return { sheet: sh, headers: headers, rows: rows, lastCol: lastCol };
}

// Makes sure the tab exists and has every header in `wanted` (appended at
// the end when missing). Returns the full header list.
function vlEnsure_(ss, name, wanted) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return { sheet: sh, headers: wanted.slice() };
  }
  var vals = sh.getLastRow() >= 1 ? sh.getDataRange().getValues() : [[]];
  var headers = (vals[0] || []).map(function (h) { return String(h || '').trim(); });
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  var missing = wanted.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  return { sheet: sh, headers: headers };
}

function vlRowFrom_(headers, obj, base) {
  return headers.map(function (h, j) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) return obj[h] === null || obj[h] === undefined ? '' : obj[h];
    return base ? (base[j] === undefined ? '' : base[j]) : '';
  });
}

function vlAudit_(ss, who, action, record, details) {
  try {
    var t = vlEnsure_(ss, SHEET_VAUDIT, VAUDIT_HEADERS);
    t.sheet.appendRow(vlRowFrom_(t.headers, { When: vlNowIso_(), Who: who || '', Action: action, Record: record, Details: details || '' }));
  } catch (e) {}
}

// ─── who is asking ─────────────────────────────────────────────────────────

// contractor: '' for ACC staff, 'RHI'/'ASEC' for contractor accounts.
// With no login check configured yet (no signing secret) everyone acts as ACC.
function vlActor_(session) {
  if (!session) return { email: '', contractor: '', acc: true, canApprove: true, roles: [] };
  // An organisation that maps to no contractor and isn't ACC sees nothing.
  var c = maContractorForOrg_(session.orgId) || '';
  var contractor = c === 'ACC' ? '' : (c || 'NONE');
  var roles = session.roles || [];
  // Managers view and get escalations only (agreed decision 7) — they don't approve.
  var accRoles = ['ROLE-ADMIN', 'ROLE-RENG'];
  var canApprove = !contractor && (maIsAdmin_(session) || roles.some(function (r) { return accRoles.indexOf(r) !== -1; }));
  // An ACC manager covering through a delegation (no engineer free) approves too.
  if (!contractor && !canApprove) canApprove = maResponsibility_(session).covering.length > 0;
  return { email: session.email || '', contractor: contractor, acc: !contractor, canApprove: canApprove, roles: roles };
}

// ─── equipment, scopes and limits ──────────────────────────────────────────

// Builds the lookups everything here needs: VIB ID → point, equipment →
// {name, line, contractor, scope, rms/spm limits}.
function vlMasterData_(ss, opts) {
  var points = readVibRegistry(ss);
  var rmsReg = readSheet(ss, SHEET_RMS_REG);
  var spmReg = readSheet(ss, SHEET_SPM_REG);
  var eq = {};
  function e(id) { id = String(id || '').trim(); if (!eq[id]) eq[id] = { id: id, name: '', line: '', contractor: '', rms: null, spm: null, vibIds: 0 }; return eq[id]; }
  rmsReg.forEach(function (r) {
    var x = e(r['Equipment ID']);
    x.name = x.name || String(r['Equipment Name'] || '');
    x.line = x.line || String(r['Line'] || '');
    var lim = [vlNum_(r['RMS Good']), vlNum_(r['RMS Acceptable']), vlNum_(r['RMS Alarm'])];
    if (lim.every(function (n) { return n !== null; })) x.rms = lim;
  });
  spmReg.forEach(function (r) {
    var x = e(r['Equipment ID']);
    x.name = x.name || String(r['Equipment Name'] || '');
    x.line = x.line || String(r['Line'] || '');
    var lim = [vlNum_(r['SPM Normal']), vlNum_(r['SPM Caution']), vlNum_(r['SPM Alarm'])];
    if (lim.every(function (n) { return n !== null; })) x.spm = lim;
  });
  var vib = {};
  points.forEach(function (p) {
    if (!p['VIB ID']) return;
    if (String(p['Status'] || 'Active').toLowerCase() === 'inactive') return;
    vib[p['VIB ID']] = p;
    var x = e(p['Equipment ID']);
    x.contractor = x.contractor || p['Contractor'];
    x.area = x.area || p['Area'] || '';
    x.vibIds++;
  });
  peApplyToMachines_(eq); // the platform's name, contractor and area (PlatformEquipment.js)
  Object.keys(eq).forEach(function (id) { eq[id].scope = vlScopeOf_(eq[id]); eq[id].area = eq[id].area || vlAreaOf_(eq[id].line); });
  var master = { vib: vib, eq: eq };
  lmApply_(ss, master); // Limits.js: custom limits, interval, Active / Inactive
  Object.keys(eq).forEach(function (id) { eq[id].inactive = eq[id].status === 'Inactive'; });
  return master;
}

// Area (VIB ID Registry column I, else the register's line): Line 1, Line 2, CM#1, CM#2.
function vlAreaOf_(line) {
  return { line1: 'Line 1', line2: 'Line 2', cm1: 'CM#1', cm2: 'CM#2' }[String(line || '').replace(/\s+/g, '').toLowerCase()] || '';
}

// RHI reports per line; ASEC sends one report for the cement mills.
function vlScopeOf_(x) {
  if (x.contractor === 'ASEC') return 'Cement Mills';
  var line = String(x.line || '').replace(/\s+/g, '').toLowerCase();
  if (line === 'line1') return 'Line 1';
  if (line === 'line2') return 'Line 2';
  if (line === 'cm1' || line === 'cm2') return 'Cement Mills';
  return '';
}

function vlScopes_(master) {
  var out = {};
  Object.keys(master.eq).forEach(function (id) {
    var x = master.eq[id];
    if (!x.contractor || !x.scope || !x.vibIds || x.inactive) return;
    var k = x.contractor + '|' + x.scope;
    if (!out[k]) out[k] = { contractor: x.contractor, scope: x.scope, equipment: 0, vibIds: 0 };
    out[k].equipment++;
    out[k].vibIds += x.vibIds;
  });
  return Object.keys(out).sort().map(function (k) { return out[k]; });
}

// ─── report status (45-day rule) ───────────────────────────────────────────

function vlDueDate_(r) {
  var first = vlDate_(r['First reading']);
  if (first) return vlAddDays_(first, VL_DUE_DAYS);
  var m = vlMonth_(r['Month']);
  return m ? vlAddDays_(vlMonthEnd_(m), VL_DUE_DAYS) : '';
}

// Historic rows keep the status the merge gave them. Others: Skipped stays;
// sent → Received; not yet → Not sent yet. Reports are approved, not
// chased: on-time tracking is per machine (MeasurementTracker.js).
function vlReportStatus_(r, today) {
  var wf = String(r['Workflow status'] || '');
  var st = String(r['Report status'] || '');
  if (wf === 'Historic' || st === 'Skipped') return st;
  return vlDate_(r['Received date']) ? 'Received' : 'Not sent yet';
}

function vlReportOut_(r, today) {
  var o = {};
  VLOG_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; });
  o['Due date'] = vlDate_(r['Due date']) || vlDueDate_(r);
  o['Report status'] = vlReportStatus_(r, today);
  o['Month'] = vlMonth_(r['Month']);
  o['First reading'] = vlDate_(r['First reading']);
  o['Last reading'] = vlDate_(r['Last reading']);
  o['Received date'] = vlDate_(r['Received date']);
  return o;
}

// ─── reads ─────────────────────────────────────────────────────────────────

function handleGetVibLog(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var today = vlToday_();
  var log = vlRead_(ss, SHEET_VLOG);
  var reports = log.rows
    .filter(function (r) { return r['Report ID'] && (!me.contractor || r['Contractor'] === me.contractor); })
    .map(function (r) { return vlReportOut_(r, today); });
  var master = vlMasterData_(ss);
  var scopes = vlScopes_(master).filter(function (s) { return !me.contractor || s.contractor === me.contractor; });
  return { status: 'ok', today: today, dueDays: VL_DUE_DAYS, reports: reports, scopes: scopes,
           me: { contractor: me.contractor, acc: me.acc, canApprove: me.canApprove } };
}

function vlEntryOut_(r) {
  var o = {};
  VENTRY_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; });
  o['Measurement date'] = vlDate_(r['Measurement date']);
  return o;
}

function handleGetVibReport(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var id = String(params.reportId || '');
  var log = vlRead_(ss, SHEET_VLOG);
  var rep = log.rows.filter(function (r) { return r['Report ID'] === id; })[0];
  if (!rep) return { status: 'error', error: 'Report not found: ' + id };
  if (me.contractor && rep['Contractor'] !== me.contractor) return { status: 'error', error: 'This report belongs to another contractor.' };
  var entries = vlRead_(ss, SHEET_VENTRIES).rows.filter(function (r) { return r['Report ID'] === id; }).map(vlEntryOut_);
  var coverage = vlRead_(ss, SHEET_VCOVER).rows.filter(function (r) { return r['Report ID'] === id; }).map(function (r) {
    var o = {}; VCOVER_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; }); return o;
  });
  // History months: the machines come from "Equipment Measurement History"
  // (MeasurementTracker.js), which carries the Report ID.
  if (!coverage.length) {
    coverage = vlRead_(ss, SHEET_VHIST).rows.filter(function (r) { return r['Report ID'] === id; }).map(function (r) {
      var n = vlNum_(r['Readings in app']) || 0;
      var measured = String(r['Result']) === 'Measured';
      return { 'Report ID': id, 'Month': vlMonth_(r['Month']), 'Contractor': r['Contractor'], 'Report scope': rep['Report scope'], 'Line': r['Area'],
        'Equipment ID': r['Equipment ID'], 'Equipment name': r['Equipment name'], 'Compliance mark (old)': r['Old tracker mark'], 'Report status': '',
        'Readings in app': n, 'Outcome': measured ? (n ? 'Received' : 'Report not imported') : 'Missing' };
    });
  }
  var audit = vlRead_(ss, SHEET_VAUDIT).rows.filter(function (r) { return r['Record'] === id; }).map(function (r) {
    return { when: String(r['When']), who: r['Who'], action: r['Action'], details: r['Details'] };
  });
  return { status: 'ok', report: vlReportOut_(rep, vlToday_()), entries: entries, coverage: coverage, history: audit,
           me: { contractor: me.contractor, acc: me.acc, canApprove: me.canApprove } };
}

// Readings of one equipment across every report (equipment page, trends).
function handleGetVibEquipmentHistory(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var eqId = String(params.equipmentId || '');
  var rows = vlRead_(ss, SHEET_VENTRIES).rows.filter(function (r) {
    return r['Equipment ID'] === eqId && (!me.contractor || r['Contractor'] === me.contractor);
  }).map(vlEntryOut_);
  return { status: 'ok', equipmentId: eqId, entries: rows };
}

// ─── writes ────────────────────────────────────────────────────────────────

function vlFindReport_(ss, id) {
  var log = vlRead_(ss, SHEET_VLOG);
  var rep = log.rows.filter(function (r) { return r['Report ID'] === id; })[0] || null;
  return { log: log, rep: rep };
}

function vlWriteReport_(ss, rep, changes) {
  var t = vlEnsure_(ss, SHEET_VLOG, VLOG_HEADERS);
  var merged = {};
  Object.keys(rep || {}).forEach(function (k) { merged[k] = rep[k]; });
  Object.keys(changes).forEach(function (k) { merged[k] = changes[k]; });
  merged['Updated at'] = vlNowIso_();
  var row = vlRowFrom_(t.headers, merged);
  if (rep && rep._row) t.sheet.getRange(rep._row, 1, 1, row.length).setValues([row]);
  else t.sheet.appendRow(row);
  return merged;
}

// Create a report (Draft) or edit its details. One report per contractor +
// scope + month: a second one for the same month is refused.
function handleSaveVibReport(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var d = typeof params.report === 'string' ? JSON.parse(params.report) : (params.report || {});
  var month = vlMonth_(d.month);
  var contractor = me.contractor || String(d.contractor || '');
  var scope = String(d.scope || '');
  if (!month) return { status: 'error', error: 'Pick the report month.' };
  if (['RHI', 'ASEC'].indexOf(contractor) === -1) return { status: 'error', error: 'Pick the contractor.' };
  if (!VL_SCOPE_CODE[scope]) return { status: 'error', error: 'Pick the report scope (Line 1, Line 2 or Cement Mills).' };
  if (month > vlToday_().slice(0, 7)) return { status: 'error', error: 'The report month is in the future.' };
  var id = 'VL-' + month + '-' + contractor + '-' + VL_SCOPE_CODE[scope];
  var found = vlFindReport_(ss, id);
  var rep = found.rep;
  if (d.reportId && d.reportId !== id) return { status: 'error', error: 'Contractor, scope and month can\'t be changed on a saved report.' };
  if (rep && !d.reportId) {
    var wf = String(rep['Workflow status'] || '');
    if (wf !== 'Historic' || String(rep['Report status']) !== 'Missing') {
      return { status: 'error', error: 'A report for ' + contractor + ' ' + scope + ' ' + month + ' already exists (' + id + ').', reportId: id };
    }
  }
  if (rep && d.reportId && ['Draft', 'Returned', ''].indexOf(String(rep['Workflow status'] || '')) === -1 && !me.acc) {
    return { status: 'error', error: 'This report is already with ACC and can\'t be edited.' };
  }
  var changes = {
    'Report ID': id, 'Month': month, 'Contractor': contractor, 'Report scope': scope,
    'Contractor report no': String(d.contractorReportNo || ''), 'Analyst': String(d.analyst || ''),
    'Issue date': vlDate_(d.issueDate), 'Report file': String(d.reportFile || ''), 'Notes': String(d.notes || ''),
  };
  if (!rep || String(rep['Workflow status']) === 'Historic') {
    changes['Workflow status'] = 'Draft';
    changes['Source'] = 'App';
    changes['Report status'] = '';
    changes['Created by'] = me.email;
    changes['Created at'] = vlNowIso_();
  }
  var saved = vlWriteReport_(ss, rep, changes);
  vlAudit_(ss, me.email, rep && d.reportId ? 'Report edited' : 'Report created', id, contractor + ' ' + scope + ' ' + month);
  return { status: 'ok', reportId: id, report: vlReportOut_(saved, vlToday_()) };
}

// Replaces every reading of a report with the list sent (Draft / Returned
// only, or ACC during review). Equipment, point, limits and the system
// status are worked out here from the VIB ID Registry and the Registers —
// never trusted from the client.
function handleSaveVibEntries(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var id = String(params.reportId || '');
  var list = typeof params.entries === 'string' ? JSON.parse(params.entries) : (params.entries || []);
  var found = vlFindReport_(ss, id);
  var rep = found.rep;
  if (!rep) return { status: 'error', error: 'Report not found: ' + id };
  if (me.contractor && rep['Contractor'] !== me.contractor) return { status: 'error', error: 'This report belongs to another contractor.' };
  var wf = String(rep['Workflow status'] || '');
  var editable = wf === 'Draft' || wf === 'Returned' || (wf === 'ACC review' && me.acc);
  if (!editable) return { status: 'error', error: 'Readings can only be changed while the report is a Draft or Returned.' };

  var master = vlMasterData_(ss);
  var month = vlMonth_(rep['Month']);
  var problems = [];
  var seen = {};
  var out = [];
  list.forEach(function (x, i) {
    var vibId = String(x.vibId || '').trim();
    var p = master.vib[vibId];
    var line = 'Row ' + (i + 1) + ' (' + (vibId || 'no VIB ID') + '): ';
    if (!p) { problems.push(line + 'unknown or inactive VIB ID.'); return; }
    var eq = master.eq[p['Equipment ID']] || {};
    if (eq.contractor !== rep['Contractor'] || eq.scope !== rep['Report scope']) { problems.push(line + 'not in ' + rep['Contractor'] + ' ' + rep['Report scope'] + '.'); return; }
    var date = vlDate_(x.date);
    if (!date) { problems.push(line + 'measurement date missing.'); return; }
    if (date > vlToday_()) { problems.push(line + 'measurement date is in the future.'); return; }
    var key = vibId + '|' + date;
    if (seen[key]) { problems.push(line + 'entered twice for ' + date + '.'); return; }
    seen[key] = true;
    var fam = p['Family'];
    var H = vlNum_(x.h), V = vlNum_(x.v), A = vlNum_(x.a), HDm = vlNum_(x.hdm), HDc = vlNum_(x.hdc), G = vlNum_(x.g);
    var maxV = null, sys = '', lim = null;
    if (fam === 'RMS') {
      [H, V, A].forEach(function (n) { if (n !== null && (maxV === null || n > maxV)) maxV = n; });
      if (maxV === null) { problems.push(line + 'no H / V / A value.'); return; }
      if ([H, V, A].some(function (n) { return n !== null && n < 0; })) { problems.push(line + 'velocity can\'t be negative.'); return; }
      lim = lmFor_(master, eq, vibId, 'RMS'); sys = vlBand_(maxV, lim);
    } else if (fam === 'SPM') {
      if (HDm === null && HDc === null) { problems.push(line + 'no HDm / HDc value.'); return; }
      lim = lmFor_(master, eq, vibId, 'SPM'); sys = vlBand_(HDm, lim);
    } else {
      if (G === null) { problems.push(line + 'no G\'s value.'); return; }
      lim = lmFor_(master, eq, vibId, 'Gs');
      sys = lim ? vlBand_(G, lim) : 'No limits';
    }
    var rs = vlLevel_(x.reportStatus);
    var fin = rs || (sys === 'No limits' ? '' : sys);
    out.push({
      'Report ID': id, 'Month': month, 'Contractor': rep['Contractor'], 'Report scope': rep['Report scope'],
      'Line': eq.line || '', 'Equipment ID': p['Equipment ID'], 'Equipment name': eq.name || '', 'VIB ID': vibId,
      'Family': fam, 'Position': p['Position Code'], 'Point description': String(p['Point Description']).split(';')[0],
      'Measurement date': date, 'Reading kind': 'Report reading',
      'Horizontal (mm/s)': H, 'Vertical (mm/s)': V, 'Axial (mm/s)': A, 'Max velocity (mm/s)': maxV,
      'HDm (dBsv)': HDm, 'HDc (dBsv)': HDc, "G's (g)": G,
      'Limits used (N/C/A)': lim ? lim.join('/') : '', 'System status': sys, 'Report status': rs,
      'Final status': fin, 'Report differs': rs && sys && sys !== 'No limits' && rs !== sys ? 'Yes' : '',
      'Source row': 'App', 'Notes': String(x.notes || ''),
    });
  });
  if (problems.length) return { status: 'error', error: problems.slice(0, 8).join('\n') + (problems.length > 8 ? '\n…and ' + (problems.length - 8) + ' more' : ''), problems: problems };

  // same VIB ID twice in the month: the latest is the report reading
  var byVib = {};
  out.forEach(function (o) { (byVib[o['VIB ID']] = byVib[o['VIB ID']] || []).push(o); });
  Object.keys(byVib).forEach(function (k) {
    var l = byVib[k].sort(function (a, b) { return a['Measurement date'] < b['Measurement date'] ? -1 : 1; });
    l.forEach(function (o, i) { if (i < l.length - 1) o['Reading kind'] = 'Earlier reading in month'; });
  });

  // replace this report's rows (bottom-up delete keeps row numbers valid)
  var t = vlEnsure_(ss, SHEET_VENTRIES, VENTRY_HEADERS);
  var existing = vlRead_(ss, SHEET_VENTRIES);
  existing.rows.filter(function (r) { return r['Report ID'] === id; }).map(function (r) { return r._row; })
    .sort(function (a, b) { return b - a; }).forEach(function (rn) { t.sheet.deleteRow(rn); });
  out.forEach(function (o, i) {
    o['Entry ID'] = id + '-' + ('000' + (i + 1)).slice(-4);
    t.sheet.appendRow(vlRowFrom_(t.headers, o));
  });

  vlWriteCoverage_(ss, rep, out, master);
  var counts = vlCounts_(out, master, rep);
  var dates = out.map(function (o) { return o['Measurement date']; }).sort();
  var changes = {
    'First reading': dates[0] || '', 'Last reading': dates[dates.length - 1] || '',
    'Equipment in scope': counts.inScope, 'Equipment with readings': counts.eqWith, 'VIB IDs read': counts.vibIds,
    'Entries': out.length, 'Equipment: received': counts.eqWith, 'Normal': counts.N, 'Caution': counts.C,
    'Alert': counts.A, 'Danger': counts.D, 'Report vs limits differ': counts.differs,
  };
  changes['Due date'] = dates[0] ? vlAddDays_(dates[0], VL_DUE_DAYS) : vlDueDate_(rep);
  vlWriteReport_(ss, rep, changes);
  vlAudit_(ss, me.email, 'Readings saved', id, out.length + ' readings');
  return { status: 'ok', reportId: id, saved: out.length };
}

// Equipment counts by worst final status of its report readings.
function vlCounts_(entries, master, rep) {
  var worst = {};
  var vibs = {};
  entries.forEach(function (o) {
    vibs[o['VIB ID']] = true;
    if (o['Reading kind'] !== 'Report reading') return;
    var e = o['Equipment ID'], f = o['Final status'];
    if (!(e in worst)) worst[e] = '';
    if ((VL_LEVEL_RANK[f] || 0) > (VL_LEVEL_RANK[worst[e]] || 0)) worst[e] = f;
  });
  var c = { N: 0, C: 0, A: 0, D: 0, differs: 0, eqWith: Object.keys(worst).length, vibIds: Object.keys(vibs).length, inScope: 0 };
  Object.keys(worst).forEach(function (e) { var k = { Normal: 'N', Caution: 'C', Alert: 'A', Danger: 'D' }[worst[e]]; if (k) c[k]++; });
  entries.forEach(function (o) { if (o['Report differs'] === 'Yes') c.differs++; });
  Object.keys(master.eq).forEach(function (id) {
    var x = master.eq[id];
    if (x.contractor === rep['Contractor'] && x.scope === rep['Report scope'] && x.vibIds && !x.inactive) c.inScope++;
  });
  return c;
}

// One coverage row per equipment in the report's scope: measured or not.
function vlWriteCoverage_(ss, rep, entries, master) {
  var id = rep['Report ID'];
  var t = vlEnsure_(ss, SHEET_VCOVER, VCOVER_HEADERS);
  var existing = vlRead_(ss, SHEET_VCOVER);
  existing.rows.filter(function (r) { return r['Report ID'] === id; }).map(function (r) { return r._row; })
    .sort(function (a, b) { return b - a; }).forEach(function (rn) { t.sheet.deleteRow(rn); });
  var per = {};
  entries.forEach(function (o) { per[o['Equipment ID']] = (per[o['Equipment ID']] || 0) + 1; });
  Object.keys(master.eq).sort().forEach(function (eqId) {
    var x = master.eq[eqId];
    if (x.contractor !== rep['Contractor'] || x.scope !== rep['Report scope'] || !x.vibIds) return;
    var n = per[eqId] || 0;
    if (x.inactive && !n) return;
    t.sheet.appendRow(vlRowFrom_(t.headers, {
      'Report ID': id, 'Month': vlMonth_(rep['Month']), 'Contractor': rep['Contractor'], 'Report scope': rep['Report scope'],
      'Line': x.line, 'Equipment ID': eqId, 'Equipment name': x.name, 'Compliance mark (old)': '',
      'Report status': '', 'Readings in app': n, 'Outcome': n ? 'Received' : 'Not measured',
    }));
  });
}

// Workflow moves. submit: contractor (or ACC) sends a Draft/Returned report
// to ACC review — sets Received date, which decides Received / Received
// late. approve / return: ACC engineer, manager or owner; return needs a
// reason. skip: ACC marks a month with no report as Skipped, with a reason.
// reopen: ACC moves an Approved report back to review.
function handleVibReportTransition(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var to = String(params.to || '');
  var reason = String(params.reason || '').trim();
  var id = String(params.reportId || '');
  var today = vlToday_();

  if (to === 'skip') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer can mark a report as skipped.' };
    if (!reason) return { status: 'error', error: 'Give the reason for skipping.' };
    var month = vlMonth_(params.month), contractor = String(params.contractor || ''), scope = String(params.scope || '');
    if (!month || !VL_SCOPE_CODE[scope] || ['RHI', 'ASEC'].indexOf(contractor) === -1) return { status: 'error', error: 'Month, contractor and scope are needed.' };
    id = 'VL-' + month + '-' + contractor + '-' + VL_SCOPE_CODE[scope];
    var f0 = vlFindReport_(ss, id);
    if (f0.rep && String(f0.rep['Report status']) !== 'Missing') return { status: 'error', error: 'This month already has a report.' };
    vlWriteReport_(ss, f0.rep, { 'Report ID': id, 'Month': month, 'Contractor': contractor, 'Report scope': scope,
      'Report status': 'Skipped', 'Workflow status': 'Closed', 'Source': 'App', 'Notes': reason,
      'Reviewed by': me.email, 'Reviewed at': vlNowIso_() });
    vlAudit_(ss, me.email, 'Report skipped', id, reason);
    return { status: 'ok', reportId: id };
  }

  var found = vlFindReport_(ss, id);
  var rep = found.rep;
  if (!rep) return { status: 'error', error: 'Report not found: ' + id };
  if (me.contractor && rep['Contractor'] !== me.contractor) return { status: 'error', error: 'This report belongs to another contractor.' };
  var wf = String(rep['Workflow status'] || '');
  var changes = {};

  if (to === 'submit') {
    if (wf !== 'Draft' && wf !== 'Returned') return { status: 'error', error: 'Only a Draft or Returned report can be sent to ACC.' };
    if (!(vlNum_(rep['Entries']) > 0)) return { status: 'error', error: 'Add the readings before sending the report.' };
    changes['Workflow status'] = 'ACC review';
    changes['Submitted by'] = me.email;
    changes['Submitted at'] = vlNowIso_();
    if (!vlDate_(rep['Received date'])) changes['Received date'] = today;
    changes['Return reason'] = '';
  } else if (to === 'approve') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer can approve a report.' };
    if (wf !== 'ACC review') return { status: 'error', error: 'Only a report in ACC review can be approved.' };
    changes['Workflow status'] = 'Approved';
    changes['Reviewed by'] = me.email;
    changes['Reviewed at'] = vlNowIso_();
  } else if (to === 'return') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer can return a report.' };
    if (wf !== 'ACC review') return { status: 'error', error: 'Only a report in ACC review can be returned.' };
    if (!reason) return { status: 'error', error: 'Say what needs fixing.' };
    changes['Workflow status'] = 'Returned';
    changes['Return reason'] = reason;
    changes['Reviewed by'] = me.email;
    changes['Reviewed at'] = vlNowIso_();
  } else if (to === 'reopen') {
    if (!me.canApprove) return { status: 'error', error: 'Only an ACC engineer can reopen a report.' };
    if (wf !== 'Approved') return { status: 'error', error: 'Only an approved report can be reopened.' };
    if (!reason) return { status: 'error', error: 'Give the reason for reopening.' };
    changes['Workflow status'] = 'ACC review';
  } else {
    return { status: 'error', error: 'Unknown step: ' + to };
  }
  var saved = vlWriteReport_(ss, rep, changes);
  vlAudit_(ss, me.email, { submit: 'Sent to ACC', approve: 'Approved', 'return': 'Returned', reopen: 'Reopened' }[to], id, reason);
  vlNotify_(ss, to, saved, me, reason);
  // Approved readings are checked against the limits: abnormal machines get
  // a finding on their open action, or a new draft action (VibActions.js).
  var findings = to === 'approve' ? vaApplyFindings_(ss, saved, me) : null;
  return { status: 'ok', reportId: id, report: vlReportOut_(saved, today), findings: findings };
}

// Report upload / decision notifications (workflow: "Report upload → both
// engineers", "Decision → contractor engineer"). Best effort: a mail
// failure never blocks the save.
function vlNotify_(ss, to, rep, me, reason) {
  try {
    var contractor = rep['Contractor'];
    var who = [];
    if (to === 'submit') who = maResponsibleEmails_(MA_RESP.ACC, '').concat(maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor));
    else who = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
    who = who.filter(function (e, i) { return e && who.indexOf(e) === i && e !== me.email; });
    if (!who.length) return;
    var title = rep['Contractor'] + ' ' + rep['Report scope'] + ' ' + vlMonth_(rep['Month']);
    var verb = { submit: 'was sent to ACC for review', approve: 'was approved by ACC', 'return': 'was returned by ACC', reopen: 'was reopened by ACC' }[to];
    vnAdd_(ss, who, 'vib-report-' + to, 'Vibration report ' + title + ' ' + verb + (reason ? ': ' + reason : ''), contractor, 'log', rep['Report ID'], me);
    MailApp.sendEmail({ to: who.join(','), subject: 'Vibration report ' + title + ' ' + verb,
      body: 'The vibration report ' + rep['Report ID'] + ' (' + title + ') ' + verb + (reason ? '.\n\nReason: ' + reason : '.') + '\n\nOpen the ACC Reliability Platform → Vibration Analysis → Vibration Log.' });
  } catch (e) {}
}

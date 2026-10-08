// ─── Limits & intervals (workflow "Equipment Limits") ─────────────────────
// Only the App Owner (admin) changes limits. Every change is a new row in
// "Vibration Limits" with its reason; the row it replaces is kept with
// Active = No, so the history is never lost. Readings already saved keep the
// limits they were judged with ("Limits used" on each entry) — a change
// applies to new readings only.
//
// What a reading is judged against, most specific first:
//   1. a limit for that VIB ID
//   2. a limit for the equipment + family (RMS / SPM / Gs)
//   3. the RMS Register / SPM Register limits
//   4. the defaults (RMS 2.8 / 7.1 / 18 mm/s, SPM 20 / 35 / 50 dBsv)
// G's has no limits unless 1 or 2 sets one.
//
// The same tab holds each machine's measurement interval (days between
// measurements, default 30) and whether it is Active or Inactive (an
// inactive machine is left out of reports, coverage and routes).

var SHEET_VLIMITS = 'Vibration Limits';
var VLIMIT_HEADERS = [
  'Change ID', 'Equipment ID', 'VIB ID', 'Family', 'Caution from', 'Alert from', 'Danger from', 'Unit', 'Basis',
  'Interval days', 'Equipment status', 'Reason', 'Changed by', 'Changed at', 'Active'
];
var VL_DEFAULT_INTERVAL = 30;
var VL_UNIT = { RMS: 'mm/s', SPM: 'dBsv', Gs: 'g' };
var VL_BASIS = { RMS: 'Velocity RMS (highest of H / V / A)', SPM: 'SPM HDm', Gs: "Acceleration G's (PeakVue)" };

// Active rows only → { family: {eqId: {RMS: [..]|null, ...}}, vib: {vibId: [..]|null}, settings: {eqId: {interval, status}} }
function lmActive_(ss) {
  var out = { family: {}, vib: {}, settings: {} };
  vlRead_(ss, SHEET_VLIMITS).rows.forEach(function (r) {
    if (String(r['Active'] || 'Yes') !== 'Yes') return;
    var eq = String(r['Equipment ID'] || '').trim();
    var fam = String(r['Family'] || '').trim();
    if (fam === 'Settings') {
      out.settings[eq] = { interval: vlNum_(r['Interval days']), status: String(r['Equipment status'] || 'Active') };
      return;
    }
    var lim = [vlNum_(r['Caution from']), vlNum_(r['Alert from']), vlNum_(r['Danger from'])];
    var val = lim.every(function (n) { return n !== null; }) ? lim : null;
    var vib = String(r['VIB ID'] || '').trim();
    if (vib) out.vib[vib] = val;
    else (out.family[eq] = out.family[eq] || {})[fam] = val;
  });
  return out;
}

// Called by vlMasterData_ (VibrationLog.js) after the Registers are read.
function lmApply_(ss, master) {
  var a = lmActive_(ss);
  Object.keys(master.eq).forEach(function (id) {
    var x = master.eq[id];
    x.registerRms = x.rms; x.registerSpm = x.spm;
    var f = a.family[id] || {};
    if (f.RMS) x.rms = f.RMS;
    if (f.SPM) x.spm = f.SPM;
    x.gs = f.Gs || null;
    x.custom = { RMS: !!f.RMS, SPM: !!f.SPM, Gs: !!f.Gs };
    var st = a.settings[id] || {};
    x.interval = st.interval || VL_DEFAULT_INTERVAL;
    x.status = st.status || 'Active';
  });
  master.vibLimits = {};
  Object.keys(a.vib).forEach(function (v) { if (a.vib[v]) master.vibLimits[v] = a.vib[v]; });
}

// Limits for one reading (see the order at the top of this file).
function lmFor_(master, eq, vibId, family) {
  if (master.vibLimits && master.vibLimits[vibId]) return master.vibLimits[vibId];
  if (family === 'RMS') return eq.rms || VL_RMS_DEFAULT;
  if (family === 'SPM') return eq.spm || VL_SPM_DEFAULT;
  return eq.gs || null;
}

function handleGetVibLimits(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var master = vlMasterData_(ss, { includeInactive: true });
  var history = vlRead_(ss, SHEET_VLIMITS).rows.map(function (r) {
    var o = {}; VLIMIT_HEADERS.forEach(function (h) { o[h] = r[h] === undefined ? '' : r[h]; }); return o;
  });
  var equipment = Object.keys(master.eq).sort().map(function (id) {
    var x = master.eq[id];
    return { equipmentId: id, name: x.name, line: x.line, contractor: x.contractor, scope: x.scope, vibIds: x.vibIds,
      rms: x.rms, spm: x.spm, gs: x.gs, registerRms: x.registerRms, registerSpm: x.registerSpm, custom: x.custom,
      interval: x.interval, status: x.status };
  }).filter(function (e) { return e.vibIds && (!me.contractor || e.contractor === me.contractor); });
  var vibLimits = {};
  Object.keys(master.vibLimits || {}).forEach(function (v) {
    var p = master.vib[v];
    if (p && (!me.contractor || p['Contractor'] === me.contractor)) vibLimits[v] = master.vibLimits[v];
  });
  return { status: 'ok', equipment: equipment, vibLimits: vibLimits, history: me.contractor ? [] : history,
           canEdit: !session || maIsAdmin_(session), units: VL_UNIT, basis: VL_BASIS, defaultInterval: VL_DEFAULT_INTERVAL };
}

// params: { equipmentId, families: {RMS: [a,b,c] | null, SPM: …, Gs: …} (null = back to the Register / none),
//           points: {vibId: [a,b,c] | null}, intervalDays, equipmentStatus, reason }
// Only keys that are sent are changed.
function handleSaveVibLimits(params, session) {
  if (session && !maIsAdmin_(session)) return { status: 'error', error: 'Only the App Owner can change limits and intervals.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var d = typeof params.change === 'string' ? JSON.parse(params.change) : (params.change || params);
  var eqId = String(d.equipmentId || '').trim();
  var reason = String(d.reason || '').trim();
  var master = vlMasterData_(ss, { includeInactive: true });
  var eq = master.eq[eqId];
  if (!eq || !eq.vibIds) return { status: 'error', error: 'Unknown equipment: ' + eqId };
  if (!reason) return { status: 'error', error: 'Give the reason for the change.' };

  var problems = [];
  function check(label, lim) {
    if (lim === null) return null;
    if (!lim || lim.length !== 3) { problems.push(label + ': three limits are needed.'); return null; }
    var n = lim.map(function (v) { return vlNum_(v); });
    if (n.some(function (v) { return v === null; })) { problems.push(label + ': numbers only.'); return null; }
    if (!(n[0] < n[1] && n[1] < n[2])) { problems.push(label + ': Caution < Alert < Danger.'); return null; }
    return n;
  }
  var changes = [];
  var fams = d.families || {};
  Object.keys(fams).forEach(function (f) {
    if (!VL_UNIT[f]) { problems.push('Unknown family ' + f); return; }
    changes.push({ vib: '', family: f, lim: check(f, fams[f]), clear: fams[f] === null });
  });
  var pts = d.points || {};
  Object.keys(pts).forEach(function (v) {
    var p = master.vib[v];
    if (!p || p['Equipment ID'] !== eqId) { problems.push(v + ' is not a VIB ID of ' + eqId + '.'); return; }
    changes.push({ vib: v, family: p['Family'], lim: check(v, pts[v]), clear: pts[v] === null });
  });
  var setInterval = d.intervalDays !== undefined && d.intervalDays !== '' && d.intervalDays !== null;
  var setStatus = d.equipmentStatus !== undefined && d.equipmentStatus !== '';
  var interval = setInterval ? vlNum_(d.intervalDays) : null;
  if (setInterval && (interval === null || interval < 1 || interval > 366 || Math.round(interval) !== interval)) problems.push('Interval: whole days between 1 and 366.');
  if (setStatus && ['Active', 'Inactive'].indexOf(d.equipmentStatus) === -1) problems.push('Status must be Active or Inactive.');
  if (problems.length) return { status: 'error', error: problems.join('\n'), problems: problems };
  if (!changes.length && !setInterval && !setStatus) return { status: 'error', error: 'Nothing to change.' };

  var t = vlEnsure_(ss, SHEET_VLIMITS, VLIMIT_HEADERS);
  var existing = vlRead_(ss, SHEET_VLIMITS).rows;
  var col = t.headers.indexOf('Active') + 1;
  function retire(match) {
    existing.forEach(function (r) {
      if (String(r['Active'] || 'Yes') === 'Yes' && match(r)) t.sheet.getRange(r._row, col).setValue('No');
    });
  }
  var now = vlNowIso_();
  var n = existing.length;
  function add(o) {
    n++;
    o['Change ID'] = 'LIM-' + ('0000' + n).slice(-5);
    o['Equipment ID'] = eqId; o['Reason'] = reason; o['Changed by'] = me.email; o['Changed at'] = now; o['Active'] = 'Yes';
    t.sheet.appendRow(vlRowFrom_(t.headers, o));
  }
  var summary = [];
  changes.forEach(function (c) {
    retire(function (r) { return r['Equipment ID'] === eqId && String(r['VIB ID'] || '') === c.vib && r['Family'] === c.family; });
    add({ 'VIB ID': c.vib, 'Family': c.family, 'Caution from': c.lim ? c.lim[0] : '', 'Alert from': c.lim ? c.lim[1] : '',
          'Danger from': c.lim ? c.lim[2] : '', 'Unit': VL_UNIT[c.family], 'Basis': VL_BASIS[c.family] });
    summary.push((c.vib || c.family) + ' ' + (c.lim ? c.lim.join('/') : 'back to default'));
  });
  if (setInterval || setStatus) {
    var cur = { interval: eq.interval, status: eq.status };
    retire(function (r) { return r['Equipment ID'] === eqId && r['Family'] === 'Settings'; });
    add({ 'Family': 'Settings', 'Interval days': setInterval ? interval : cur.interval, 'Equipment status': setStatus ? d.equipmentStatus : cur.status });
    if (setInterval) summary.push('interval ' + interval + ' days');
    if (setStatus) summary.push(d.equipmentStatus);
  }
  vlAudit_(ss, me.email, 'Limits changed', eqId, summary.join('; ') + ' — ' + reason);
  return { status: 'ok', equipmentId: eqId, changed: summary };
}

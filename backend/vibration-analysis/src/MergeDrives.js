// ─── One machine, two drives (one-time merge) ───────────────────────────────
// Four bucket elevators were kept as two machines each, one per drive. Each
// becomes the one platform Equipment ID, and its points say which drive:
// Vb-342.BE051-MDE-RMS → Vb-342.BE050-M2-MDE-RMS (position M2-MDE,
// "M2 Motor DE"). Readings, limits, findings, route points and history move
// with the IDs (the IdAdmin.js engine). Then:
//   - VIB ID Registry: new column Report_Equipment_ID = the ID the
//     contractor writes in its report (342.BE051), so imported readings land
//     on the right drive, also when that drive is in another line's report;
//   - RMS / SPM Register: one row per machine;
//   - Equipment Measurement History: one row per machine per month;
//   - Vibration Actions: one open action per machine (the others' findings
//     move to it; the others are Cancelled, saying where they went).
//
// Run from the Apps Script editor: mergeTwoDriveMachinesDryRun (writes
// nothing, logs what would change), then mergeTwoDriveMachines. Running it
// again changes nothing (a group already merged is skipped).

var MD_GROUPS = [
  { keep: '341.BE040', drives: [{ tag: 'M1', eq: '341.BE040' }, { tag: 'M2', eq: '342.BE041' }] },
  { keep: '342.BE050', drives: [{ tag: 'M1', eq: '342.BE050' }, { tag: 'M2', eq: '342.BE051' }] },
  // 351.BE341 was renamed 351.BE350 in the app; RHI's reports still say 351.BE341
  { keep: '351.BE350', drives: [{ tag: 'M1', eq: '351.BE340' }, { tag: 'M2', eq: '351.BE350', report: '351.BE341' }] },
  { keep: '352.BE340', drives: [{ tag: 'M1', eq: '352.BE340' }, { tag: 'M2', eq: '352.BE341' }] },
];
var MD_REPORT_COL = 'Report_Equipment_ID';

function mergeTwoDriveMachinesDryRun() {
  Logger.log(JSON.stringify(mdMerge_(true, ''), null, 1));
}

function mergeTwoDriveMachines() {
  Logger.log(JSON.stringify(mdMerge_(false, 'Apps Script editor'), null, 1));
}

function mdMerge_(dry, who, groups) {
  return vlLocked_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var out = { dryRun: !!dry, groups: [] };
    (groups || MD_GROUPS).forEach(function (g) { out.groups.push(mdMergeOne_(ss, g, dry, who)); });
    if (!dry) { idaDone_(); try { vcBump_(); } catch (e) {} }
    return out;
  });
}

function mdMergeOne_(ss, g, dry, who) {
  var first = dataStartRowFor(SHEET_VIB_REGISTRY);
  var vibs = idaRegisterIds_(ss, SHEET_VIB_REGISTRY, first, 1, 2);
  var keyOf = {};
  vibs.forEach(function (v) { keyOf[idaKey_(v.id)] = v; });
  var res = { keep: g.keep, vibIds: 0, problems: [] };
  if (vibs.some(function (v) { return idaKey_(v.eq) === idaKey_(g.keep) && /^Vb-[^-]+-M\d-/i.test(v.id); })) {
    res.skipped = 'already merged';
    return res;
  }

  // the plan: every point of each drive gets keep + tag; the drive IDs become keep
  var plan = { renames: { vib: {}, eq: {} }, deletes: {} };
  var points = {}; // new VIB ID key -> { tag, report }
  g.drives.forEach(function (d) {
    var mine = vibs.filter(function (v) { return idaKey_(v.eq) === idaKey_(d.eq); });
    if (!mine.length) res.problems.push(d.eq + ' has no VIB IDs');
    mine.forEach(function (v) {
      var m = v.id.match(new RegExp('^Vb-' + d.eq.replace(/\./g, '\\.') + '-(.+)$', 'i'));
      if (!m) { res.problems.push(v.id + ' does not start with Vb-' + d.eq + '-'); return; }
      var to = 'Vb-' + g.keep + '-' + d.tag + '-' + m[1];
      if (keyOf[idaKey_(to)]) { res.problems.push(to + ' already exists'); return; }
      plan.renames.vib[idaKey_(v.id)] = { from: v.id, to: to };
      points[idaKey_(to)] = { tag: d.tag, report: d.report || d.eq };
    });
    if (idaKey_(d.eq) !== idaKey_(g.keep)) plan.renames.eq[idaKey_(d.eq)] = { from: d.eq, to: g.keep };
  });
  res.vibIds = Object.keys(plan.renames.vib).length;
  if (res.problems.length) { res.skipped = 'not merged — fix the problems first'; return res; }
  if (dry) {
    res.wouldRename = Object.keys(plan.renames.vib).slice(0, 3).map(function (k) { return plan.renames.vib[k].from + ' → ' + plan.renames.vib[k].to; });
    res.machines = g.drives.map(function (d) { return d.tag + ' = ' + d.eq; }).join(', ') + ' → ' + g.keep;
    return res;
  }

  res.moved = idaSummary_(idaApply_(ss, plan));
  res.registry = mdRegistry_(ss, points);
  res.registers = [SHEET_RMS_REG, SHEET_SPM_REG].map(function (n) { return mdOneRegisterRow_(ss, n, g); }).join(', ');
  res.history = mdHistory_(ss, g.keep);
  res.actions = mdActions_(ss, g.keep);
  vlAudit_(ss, who, 'Machines merged', g.keep, g.drives.map(function (d) { return d.tag + ' = ' + d.eq; }).join(', ') + ' · ' + res.vibIds + ' VIB IDs · ' + res.moved);
  return res;
}

// Position "M2-MDE", description "M2 Motor DE", Report_Equipment_ID.
function mdRegistry_(ss, points) {
  var sh = ss.getSheetByName(SHEET_VIB_REGISTRY);
  var hr = headerRowFor(SHEET_VIB_REGISTRY), first = dataStartRowFor(SHEET_VIB_REGISTRY);
  var lastCol = Math.max(sh.getLastColumn(), 10);
  var head = sh.getRange(hr, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var col = head.indexOf(MD_REPORT_COL) + 1;
  if (!col) {
    var lastHead = 0;
    head.forEach(function (h, i) { if (h) lastHead = i + 1; });
    col = Math.max(11, lastHead + 1);
    sh.getRange(hr, col).setValue(MD_REPORT_COL);
  }
  var n = sh.getLastRow() - first + 1;
  if (n < 1) return 0;
  var vals = sh.getRange(first, 1, n, Math.max(col, 5)).getValues();
  var done = 0;
  vals.forEach(function (r) {
    var p = points[idaKey_(r[0])];
    if (!p) return;
    var pos = String(r[2] || '').trim(), desc = String(r[4] || '').trim();
    if (pos.indexOf(p.tag + '-') !== 0) r[2] = p.tag + '-' + pos;
    if (desc.indexOf(p.tag + ' ') !== 0) r[4] = p.tag + ' ' + desc;
    r[col - 1] = p.report;
    done++;
  });
  sh.getRange(first, 1, n, Math.max(col, 5)).setValues(vals);
  return done;
}

// Two register rows now carry the machine's ID: keep the first.
function mdOneRegisterRow_(ss, name, g) {
  var t = vlRead_(ss, name);
  if (!t.sheet) return name + ': no tab';
  var mine = t.rows.filter(function (r) { return idaKey_(r['Equipment ID']) === idaKey_(g.keep); });
  if (!mine.length) return name + ': none';
  var keep = mine[0];
  var nameCol = t.headers.indexOf('Equipment Name') + 1, ptsCol = t.headers.indexOf('Points') + 1;
  if (nameCol) keep._name = String(keep['Equipment Name'] || '').replace(/\s+m0?\d+\s*$/i, '');
  if (ptsCol) {
    var pts = [];
    g.drives.forEach(function (d, i) {
      var r = mine[i] || mine[0];
      String(r['Points'] || '').split(',').forEach(function (p) { p = p.trim(); if (p) pts.push(d.tag + ' ' + p); });
    });
    keep._points = pts.join(', ');
  }
  if (nameCol) t.sheet.getRange(keep._row, nameCol).setValue(keep._name);
  if (ptsCol) t.sheet.getRange(keep._row, ptsCol).setValue(keep._points);
  mine.slice(1).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (row) { t.sheet.deleteRow(row); });
  vlForget_(name);
  return name + ': ' + (mine.length - 1) + ' row(s) removed';
}

// One history row per month: measured if either drive was; first / last /
// readings / level over both.
function mdHistory_(ss, keep) {
  var t = vlRead_(ss, SHEET_VHIST);
  if (!t.sheet) return 'no history tab';
  var byMonth = {};
  t.rows.forEach(function (r) {
    if (idaKey_(r['Equipment ID']) !== idaKey_(keep)) return;
    var m = vlMonth_(r['Month']);
    (byMonth[m] = byMonth[m] || []).push(r);
  });
  var del = [], merged = 0;
  Object.keys(byMonth).forEach(function (m) {
    var rows = byMonth[m];
    if (rows.length < 2) return;
    var measured = rows.filter(function (r) { return String(r['Result']) === 'Measured'; });
    var base = rows[0], o = {};
    var withReadings = measured.filter(function (r) { return Number(r['Readings in app']) > 0; });
    var pick = withReadings[0] || measured[0] || base;
    o['Result'] = measured.length ? 'Measured' : String(base['Result'] || '');
    var firsts = rows.map(function (r) { return vlDate_(r['First measured']); }).filter(String).sort();
    var lasts = rows.map(function (r) { return vlDate_(r['Last measured']); }).filter(String).sort();
    o['First measured'] = firsts[0] || '';
    o['Last measured'] = lasts.length ? lasts[lasts.length - 1] : '';
    o['Level'] = rows.reduce(function (a, r) { return vtWorse_(a, String(r['Level'] || '')); }, '');
    o['Old tracker mark'] = rows.some(function (r) { return /^yes$/i.test(String(r['Old tracker mark'])); }) ? 'YES' : String(base['Old tracker mark'] || '');
    o['Readings in app'] = rows.reduce(function (a, r) { return a + (Number(r['Readings in app']) || 0); }, 0);
    o['Source'] = String(pick['Source'] || '');
    o['Report ID'] = String(pick['Report ID'] || '');
    var row = vlRowFrom_(t.headers, o, t.headers.map(function (h) { return base[h] === undefined ? '' : base[h]; }));
    t.sheet.getRange(base._row, 1, 1, t.headers.length).setValues([row]);
    rows.slice(1).forEach(function (r) { del.push(r._row); });
    merged++;
  });
  del.sort(function (a, b) { return b - a; }).forEach(function (row) { t.sheet.deleteRow(row); });
  vlForget_(SHEET_VHIST);
  return merged + ' month(s) merged';
}

// One open action per machine: the worst (then oldest) stays.
function mdActions_(ss, keep) {
  var t = vlRead_(ss, SHEET_VACTIONS);
  if (!t.sheet) return 'no actions tab';
  var open = t.rows.filter(function (r) {
    return idaKey_(r['Equipment ID']) === idaKey_(keep) && ['Closed', 'Cancelled'].indexOf(String(r['Status'])) === -1;
  });
  if (open.length < 2) return open.length + ' open action';
  open.sort(function (a, b) {
    return (VL_LEVEL_RANK[b['Severity']] || 0) - (VL_LEVEL_RANK[a['Severity']] || 0) || String(a['Action ID']).localeCompare(String(b['Action ID']));
  });
  var main = open[0], others = open.slice(1);
  var ids = others.map(function (r) { return String(r['Action ID']); });
  var f = vlRead_(ss, SHEET_VFINDINGS), moved = 0, all = 0;
  var aCol = f.headers.indexOf('Action ID') + 1;
  f.rows.forEach(function (r) {
    if (ids.indexOf(String(r['Action ID'])) !== -1 && aCol) { f.sheet.getRange(r._row, aCol).setValue(main['Action ID']); moved++; }
    if (String(r['Action ID']) === String(main['Action ID']) || ids.indexOf(String(r['Action ID'])) !== -1) all++;
  });
  var last = open.reduce(function (a, r) { return String(r['Last finding date'] || '') > String(a['Last finding date'] || '') ? r : a; }, main);
  var ch = { 'Findings': all, 'Last finding date': last['Last finding date'], 'Last report ID': last['Last report ID'], 'Updated at': vlNowIso_() };
  t.sheet.getRange(main._row, 1, 1, t.headers.length).setValues([vlRowFrom_(t.headers, ch, t.headers.map(function (h) { return main[h] === undefined ? '' : main[h]; }))]);
  others.forEach(function (r) {
    var c = { 'Status': 'Cancelled', 'Return reason': 'Merged into ' + main['Action ID'] + ' (one machine, two drives)', 'Updated at': vlNowIso_() };
    t.sheet.getRange(r._row, 1, 1, t.headers.length).setValues([vlRowFrom_(t.headers, c, t.headers.map(function (h) { return r[h] === undefined ? '' : r[h]; }))]);
  });
  vlForget_(SHEET_VACTIONS); vlForget_(SHEET_VFINDINGS);
  return ids.join(', ') + ' merged into ' + main['Action ID'] + ' (' + moved + ' finding(s) moved)';
}

function vlForget_(name) {
  if (VL_READ_MEMO) delete VL_READ_MEMO[name];
}

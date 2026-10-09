// ─── Readings outside a full report: New Reading + equipment summary ──────
// Workflow "New Reading & Reading History": pick the equipment, VIB IDs and
// measurement date, enter the numbers, checks run, the reading goes into the
// Vibration Log. A reading always lives in its month's report for the
// equipment's contractor scope; when that report doesn't exist yet it is
// created as a Draft (status "Not sent yet" until the contractor's
// report arrives — 45-day rule in VibrationLog.js).

// Existing entry row → the input shape handleSaveVibEntries takes.
function rdInput_(e) {
  return {
    vibId: e['VIB ID'], date: vlDate_(e['Measurement date']),
    h: e['Horizontal (mm/s)'], v: e['Vertical (mm/s)'], a: e['Axial (mm/s)'],
    hdm: e['HDm (dBsv)'], hdc: e['HDc (dBsv)'], g: e["G's (g)"],
    reportStatus: e['Report status'], notes: e['Notes'],
  };
}

// params: { equipmentId, date, readings: [{vibId, h, v, a, hdm, hdc, g, reportStatus, notes}], replace }
function handleSaveVibReadings(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var eqId = String(params.equipmentId || '').trim();
  var date = vlDate_(params.date);
  var list = typeof params.readings === 'string' ? JSON.parse(params.readings) : (params.readings || []);
  var master = vlMasterData_(ss);
  var eq = master.eq[eqId];
  if (!eq || !eq.vibIds) return { status: 'error', error: 'Unknown equipment, or it has no active VIB IDs: ' + eqId };
  if (me.contractor && eq.contractor !== me.contractor) return { status: 'error', error: 'This equipment belongs to another contractor.' };
  if (!eq.scope) return { status: 'error', error: 'This equipment has no line in the registers, so it has no report scope.' };
  if (eq.inactive) return { status: 'error', error: eqId + ' is Inactive. The App Owner can make it Active again under Limits & intervals.' };
  if (!date) return { status: 'error', error: 'Pick the measurement date.' };
  if (date > vlToday_()) return { status: 'error', error: 'The measurement date is in the future.' };
  var filled = list.filter(function (x) {
    return ['h', 'v', 'a', 'hdm', 'hdc', 'g'].some(function (k) { return x[k] !== '' && x[k] !== null && x[k] !== undefined; });
  });
  if (!filled.length) return { status: 'error', error: 'Enter at least one value.' };
  var bad = filled.filter(function (x) { var p = master.vib[x.vibId]; return !p || p['Equipment ID'] !== eqId; });
  if (bad.length) return { status: 'error', error: 'These VIB IDs are not on ' + eqId + ': ' + bad.map(function (x) { return x.vibId; }).join(', ') };

  var month = date.slice(0, 7);
  var id = 'VL-' + month + '-' + eq.contractor + '-' + VL_SCOPE_CODE[eq.scope];
  var found = vlFindReport_(ss, id);
  var rep = found.rep;
  var created = false;
  if (rep) {
    var wf = String(rep['Workflow status'] || '');
    if (wf === 'Historic' && String(rep['Report status']) === 'Missing') rep = null;
    else if (wf === 'Approved' || wf === 'Historic' || wf === 'Closed') {
      return { status: 'error', error: 'The ' + month + ' report for ' + eq.contractor + ' ' + eq.scope + ' is ' + (wf === 'Closed' ? 'skipped' : wf.toLowerCase()) + '. ' + (me.acc ? 'Reopen it on the Vibration Log to add readings.' : 'Ask ACC to reopen it.'), reportId: id };
    } else if (wf === 'ACC review' && !me.acc) {
      return { status: 'error', error: 'The ' + month + ' report is with ACC for review — readings can\'t be added now.', reportId: id };
    }
  }
  if (!rep) {
    var r0 = handleSaveVibReport({ report: { month: month, contractor: eq.contractor, scope: eq.scope, notes: 'Started from New Reading' } }, session);
    if (r0.status !== 'ok') return r0;
    rep = vlFindReport_(ss, id).rep;
    created = true;
  }

  var existing = vlRead_(ss, SHEET_VENTRIES).rows.filter(function (r) { return r['Report ID'] === id; }).map(rdInput_);
  var clash = existing.filter(function (e) { return e.date === date && filled.some(function (x) { return x.vibId === e.vibId; }); });
  if (clash.length && !(params.replace === true || params.replace === 'true')) {
    return { status: 'error', duplicate: true, error: clash.length + ' VIB ID(s) already have a reading on ' + date + ': ' + clash.map(function (e) { return e.vibId; }).join(', ') + '. Replace them?' };
  }
  var keep = existing.filter(function (e) { return !(e.date === date && filled.some(function (x) { return x.vibId === e.vibId; })); });
  var all = keep.concat(filled.map(function (x) {
    return { vibId: x.vibId, date: date, h: x.h, v: x.v, a: x.a, hdm: x.hdm, hdc: x.hdc, g: x.g, reportStatus: x.reportStatus, notes: x.notes };
  }));
  var res = handleSaveVibEntries({ reportId: id, entries: all }, session);
  if (res.status !== 'ok') return res;
  vlAudit_(ss, me.email, clash.length ? 'Readings replaced' : 'Readings added', id, eqId + ' · ' + date + ' · ' + filled.length + ' VIB IDs');
  return { status: 'ok', reportId: id, created: created, saved: filled.length, replaced: clash.length };
}

// Latest condition of every machine, for the Equipment list and Dashboard:
// the worst final status of its latest month with readings, the month
// before for comparison, and the latest reading of each VIB ID.
function handleGetVibEquipmentSummary(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var master = vlMasterData_(ss);
  var rows = vlRead_(ss, SHEET_VENTRIES).rows;
  var per = {};
  rows.forEach(function (r) {
    var eqId = String(r['Equipment ID'] || '');
    if (!eqId || (me.contractor && r['Contractor'] !== me.contractor)) return;
    var x = per[eqId] || (per[eqId] = { months: {}, points: {}, count: 0 });
    var m = vlMonth_(r['Month']) || vlDate_(r['Measurement date']).slice(0, 7);
    var d = vlDate_(r['Measurement date']);
    x.count++;
    if (r['Reading kind'] && r['Reading kind'] !== 'Report reading') return;
    var f = String(r['Final status'] || '');
    var mm = x.months[m] || (x.months[m] = { worst: '', date: '', reportId: r['Report ID'] });
    if ((VL_LEVEL_RANK[f] || 0) > (VL_LEVEL_RANK[mm.worst] || 0)) mm.worst = f;
    if (d > mm.date) mm.date = d;
    var vib = String(r['VIB ID'] || '');
    var p = x.points[vib];
    if (!p || d > p.date) {
      var fam = r['Family'];
      x.points[vib] = {
        vibId: vib, family: fam, position: r['Position'], point: r['Point description'], date: d,
        value: fam === 'RMS' ? vlNum_(r['Max velocity (mm/s)']) : fam === 'SPM' ? vlNum_(r['HDm (dBsv)']) : vlNum_(r["G's (g)"]),
        system: r['System status'], report: r['Report status'], final: f,
      };
    }
  });
  var out = [];
  Object.keys(master.eq).forEach(function (eqId) {
    var e = master.eq[eqId];
    if (!e.vibIds || (me.contractor && e.contractor !== me.contractor)) return;
    var x = per[eqId] || { months: {}, points: {}, count: 0 };
    var ms = Object.keys(x.months).sort();
    var last = ms[ms.length - 1], prev = ms[ms.length - 2];
    out.push({
      equipmentId: eqId, name: e.name, line: e.line, contractor: e.contractor, scope: e.scope, vibIds: e.vibIds,
      status: last ? x.months[last].worst : '', lastMonth: last || '', lastDate: last ? x.months[last].date : '',
      lastReportId: last ? x.months[last].reportId : '', prevStatus: prev ? x.months[prev].worst : '', prevMonth: prev || '',
      readings: x.count, rms: e.rms, spm: e.spm, gs: e.gs, interval: e.interval, inactive: e.inactive,
      nextDue: last && x.months[last].date ? vlAddDays_(x.months[last].date, e.interval || VL_DEFAULT_INTERVAL) : '',
      points: Object.keys(x.points).sort().map(function (k) { return x.points[k]; }),
    });
  });
  out.sort(function (a, b) { return a.equipmentId < b.equipmentId ? -1 : 1; });
  return { status: 'ok', today: vlToday_(), equipment: out, me: { contractor: me.contractor, acc: me.acc, canApprove: me.canApprove } };
}

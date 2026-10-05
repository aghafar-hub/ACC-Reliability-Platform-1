// Full recompute of both Last Reading sheets from scratch: scans every row
// in 📥 RMS DATA/📥 SPM DATA, keeps only the latest reading per
// equipment+point, re-derives each one's status against the Register's own
// limits, and rewrites 📋 Last RMS Reading/📋 Last SPM Reading wholesale —
// a repair tool for when those two "current status" sheets have drifted
// out of sync with the raw data (they're normally kept in sync
// incrementally by RmsData.js/SpmData.js's own upsert functions instead).
//
// No "gear" field — 📥 RMS DATA's own Gear (mm/s) column was removed (see
// Config.js's own note on RmsData.js), so a row's max velocity is always
// derived from Axial/Horizontal/Vertical alone here now; the Gear slot in
// the rewritten Last RMS Reading rows (position 7) is always left blank.
function handleBackfillLastReadings() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var tz  = Session.getScriptTimeZone() || 'UTC';
  var rmsSheet     = ss.getSheetByName(SHEET_RMS);
  var lastRmsSheet = ss.getSheetByName(SHEET_LAST_RMS);
  var lastSpmSheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (!rmsSheet || !lastRmsSheet || !lastSpmSheet) return {status:'error', error:'Required sheets missing'};

  var rmsRows  = readSheet(ss, SHEET_RMS);
  var latestRms = {};
  for (var i = 0; i < rmsRows.length; i++) {
    var r    = rmsRows[i];
    var eid  = String(r['Equipment ID']||'').trim();
    var pt   = String(r['Asset ID']||'').trim();
    var dv   = r['Date']||'';
    if (!eid||!pt||!dv) continue;
    var key  = eid+'||'+pt;
    var ex   = latestRms[key];
    if (!ex || String(dv) > String(ex['Date']||'')) latestRms[key] = r;
  }

  var spmRows  = readSheet(ss, SHEET_SPM);
  var latestSpm = {};
  for (var j = 0; j < spmRows.length; j++) {
    var s   = spmRows[j];
    var seid = String(s['Equipment ID']||'').trim();
    var spt  = String(s['Asset ID']||'').trim();
    var sdv  = s['Date']||'';
    if (!seid||!spt||!sdv) continue;
    var sk   = seid+'||'+spt;
    var sex  = latestSpm[sk];
    if (!sex || String(sdv) > String(sex['Date']||'')) latestSpm[sk] = s;
  }

  var rmsRegRows = readSheet(ss, SHEET_RMS_REG);
  var rmsLimits  = {};
  for (var ri = 0; ri < rmsRegRows.length; ri++) {
    var rr   = rmsRegRows[ri];
    var reid = String(rr['Equipment ID']||'').trim();
    rmsLimits[reid] = {good:parseFloat(rr['RMS Good'])||2.8, acceptable:parseFloat(rr['RMS Acceptable'])||7.1, alarm:parseFloat(rr['RMS Alarm'])||18};
  }
  var spmRegRows = readSheet(ss, SHEET_SPM_REG);
  var spmLimits  = {};
  for (var si = 0; si < spmRegRows.length; si++) {
    var sr   = spmRegRows[si];
    var srid = String(sr['Equipment ID']||'').trim();
    spmLimits[srid] = {normal:parseFloat(sr['SPM Normal'])||20, caution:parseFloat(sr['SPM Caution'])||35, alarm:parseFloat(sr['SPM Alarm'])||50, spmType:String(sr['SPM Type']||'')};
  }

  function calcRmsStatus(maxVel, lim) {
    var v = parseFloat(maxVel); if (isNaN(v)) return '';
    if (v < lim.good) return 'Good'; if (v < lim.acceptable) return 'Acceptable';
    if (v < lim.alarm) return 'Alarm'; return 'Danger';
  }
  function calcSpmStatus(hdm, lim) {
    var v = parseFloat(hdm); if (isNaN(v)) return '';
    if (v < lim.normal) return 'Normal'; if (v < lim.caution) return 'Caution'; return 'Danger';
  }

  var lrLastRow = lastRmsSheet.getLastRow();
  if (lrLastRow >= 2) lastRmsSheet.getRange(2, 1, lrLastRow - 1, lastRmsSheet.getLastColumn()).clearContent();
  var rmsOutRows = []; var equipRmsStatus = {};
  for (var rk in latestRms) {
    var rr2   = latestRms[rk];
    var reid2 = String(rr2['Equipment ID']||'').trim();
    var lim   = rmsLimits[reid2] || {good:2.8, acceptable:7.1, alarm:18};
    var maxVel = parseFloat(rr2['Max Velocity (mm/s)'])||0;
    var vals  = [parseFloat(rr2['AXial (mm/s)']||0),
                 parseFloat(rr2['Horizontal (mm/s)']||0), parseFloat(rr2['Vertical (mm/s)']||0)].filter(function(v){return !isNaN(v);});
    if (!maxVel && vals.length) maxVel = Math.max.apply(null, vals);
    var rs      = calcRmsStatus(maxVel, lim);
    var dateStr = rr2['Date']||'';
    if (dateStr instanceof Date) dateStr = Utilities.formatDate(dateStr, tz, 'yyyy-MM-dd');
    rmsOutRows.push([reid2, rr2['Equipment Name']||'', '', String(rr2['Asset ID']||''), dateStr,
      rr2['AXial (mm/s)']||'', '', rr2['Horizontal (mm/s)']||'', rr2['Vertical (mm/s)']||'', maxVel||'', rs, '']);
    equipRmsStatus[reid2] = equipRmsStatus[reid2] ? worstStatus(equipRmsStatus[reid2], rs) : rs;
  }
  if (rmsOutRows.length) lastRmsSheet.getRange(2, 1, rmsOutRows.length, 12).setValues(rmsOutRows);

  var lsLastRow = lastSpmSheet.getLastRow();
  if (lsLastRow >= 2) lastSpmSheet.getRange(2, 1, lsLastRow - 1, lastSpmSheet.getLastColumn()).clearContent();
  var spmOutRows = []; var equipSpmStatus = {};
  for (var sk2 in latestSpm) {
    var sr2   = latestSpm[sk2];
    var seid2 = String(sr2['Equipment ID']||'').trim();
    var slim  = spmLimits[seid2] || {normal:20, caution:35, alarm:50, spmType:''};
    var hdm   = parseFloat(sr2['HDm (dBsv)']||0);
    var ss2   = calcSpmStatus(hdm, slim);
    var sdateStr = sr2['Date']||'';
    if (sdateStr instanceof Date) sdateStr = Utilities.formatDate(sdateStr, tz, 'yyyy-MM-dd');
    spmOutRows.push([seid2, sr2['Equipment Name']||'', '', String(sr2['Asset ID']||''), slim.spmType||'',
      sdateStr, sr2['HDm (dBsv)']||'', sr2['HDc (dBsv)']||'', sr2['Gs']||'', ss2, '']);
    equipSpmStatus[seid2] = equipSpmStatus[seid2] ? worstStatus(equipSpmStatus[seid2], ss2) : ss2;
  }
  if (spmOutRows.length) lastSpmSheet.getRange(2, 1, spmOutRows.length, 11).setValues(spmOutRows);

  var allEids = {};
  for (var e1 in equipRmsStatus) allEids[e1] = 1;
  for (var e2 in equipSpmStatus) allEids[e2] = 1;
  for (var eid3 in allEids) {
    var rs2 = equipRmsStatus[eid3]||'';
    var ss3 = equipSpmStatus[eid3]||'';
    var ms  = rs2 && ss3 ? worstStatus(rs2, ss3) : (rs2||ss3);
    updateMachineStatusCol(lastRmsSheet, eid3, 0, 11, ms, dataStartRowFor(SHEET_LAST_RMS));
    updateMachineStatusCol(lastSpmSheet, eid3, 0, 10, ms, dataStartRowFor(SHEET_LAST_SPM));
  }
  return {status:'ok', action:'backfillLastReadings', rmsRows:rmsOutRows.length, spmRows:spmOutRows.length};
}

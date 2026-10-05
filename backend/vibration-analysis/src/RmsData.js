// Upserts one equipment+point's "current status" row in 📥 Last RMS
// Reading (one row per equipment+point, replaced wholesale on every new
// reading rather than appended to), then recomputes and pushes that
// equipment's overall Machine Status to BOTH Last Reading sheets (RMS and
// SPM readings are combined into one "how healthy is this equipment right
// now" status — see worstStatus() in Config.js).
//
// No "gear" field — 📥 RMS DATA's own Gear (mm/s) column was removed
// (no equipment needs a Gear reading anymore), but the 12-column layout
// of 📋 Last RMS Reading itself still has a Gear slot (position 7) for
// any pre-existing historical row; new upserts just leave it blank.
function handleUpsertLastRMS(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_LAST_RMS};
  var eid   = String(params.equipmentId||'').trim();
  var point = String(params.point||'').trim();
  var row = [eid, params.equipmentName||'', params.line||'', point, params.date||'',
    params.axial||'', '', params.horizontal||'', params.vertical||'',
    params.maxVelocity||'', params.readingStatus||'', ''];
  var dataStart = dataStartRowFor(SHEET_LAST_RMS);
  var idx = findRowIndex(sheet, [0,3], [eid, point], dataStart);
  if (idx !== -1) {
    sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    idx = sheet.getLastRow();
  }
  var machineStatus = recalcMachineStatus(ss, eid);
  updateMachineStatusCol(sheet, eid, 0, 11, machineStatus, dataStart);
  var spmSheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (spmSheet) updateMachineStatusCol(spmSheet, eid, 0, 10, machineStatus, dataStartRowFor(SHEET_LAST_SPM));
  return {status:'ok', action:'upsertLastRMS', equipmentId:eid, machineStatus:machineStatus};
}

function handleDeleteLastRMS(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eid   = String(params.equipmentId||'').trim();
  var point = String(params.point||'').trim();
  var sheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (!sheet) return {status:'error', error:'Sheet not found'};
  var idx = findRowIndex(sheet, [0,3], [eid, point], dataStartRowFor(SHEET_LAST_RMS));
  if (idx !== -1) sheet.deleteRow(idx);
  var machineStatus = recalcMachineStatus(ss, eid);
  var spmSheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (spmSheet) updateMachineStatusCol(spmSheet, eid, 0, 10, machineStatus, dataStartRowFor(SHEET_LAST_SPM));
  updateMachineStatusCol(sheet, eid, 0, 11, machineStatus, dataStartRowFor(SHEET_LAST_RMS));
  return {status:'ok', action:'deleteLastRMS', equipmentId:eid};
}

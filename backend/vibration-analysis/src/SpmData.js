// Same pattern as RmsData.js's handleUpsertLastRMS/handleDeleteLastRMS,
// for 📋 Last SPM Reading.
function handleUpsertLastSPM(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_LAST_SPM};
  var eid   = String(params.equipmentId||'').trim();
  var point = String(params.point||'').trim();
  var spmType = String(params.spmType||'');
  var row = [eid, params.equipmentName||'', params.line||'', point, spmType,
    params.date||'', params.hdm||'', params.hdc||'', params.gs||'',
    params.readingStatus||'', ''];
  var dataStart = dataStartRowFor(SHEET_LAST_SPM);
  var idx = findRowIndex(sheet, [0,3], [eid, point], dataStart);
  if (idx !== -1) {
    sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    idx = sheet.getLastRow();
  }
  var machineStatus = recalcMachineStatus(ss, eid);
  var rmsSheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (rmsSheet) updateMachineStatusCol(rmsSheet, eid, 0, 11, machineStatus, dataStartRowFor(SHEET_LAST_RMS));
  updateMachineStatusCol(sheet, eid, 0, 10, machineStatus, dataStart);
  return {status:'ok', action:'upsertLastSPM', equipmentId:eid, machineStatus:machineStatus};
}

function handleDeleteLastSPM(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eid   = String(params.equipmentId||'').trim();
  var point = String(params.point||'').trim();
  var sheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (!sheet) return {status:'error', error:'Sheet not found'};
  var idx = findRowIndex(sheet, [0,3], [eid, point], dataStartRowFor(SHEET_LAST_SPM));
  if (idx !== -1) sheet.deleteRow(idx);
  var machineStatus = recalcMachineStatus(ss, eid);
  var rmsSheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (rmsSheet) updateMachineStatusCol(rmsSheet, eid, 0, 11, machineStatus, dataStartRowFor(SHEET_LAST_RMS));
  updateMachineStatusCol(sheet, eid, 0, 10, machineStatus, dataStartRowFor(SHEET_LAST_SPM));
  return {status:'ok', action:'deleteLastSPM', equipmentId:eid};
}

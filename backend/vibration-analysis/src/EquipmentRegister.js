// Fires whenever a user saves changes from Equipment Register's edit modal
// or the Limits Settings page.
//
// FIX (see apps/vibration-analysis/apps-script/README.md for the original
// bug report this corrected): the original pasted source's column numbers
// assumed a layout that predates the sheets' real one — a "Points" column
// exists between Line and RMS Good on the RMS side (and the SPM side is
// shifted the same way starting at SPM Type) — which meant every save
// corrupted that equipment's measurement-point list and shifted its
// Good/Acceptable/Alarm limits by one slot, and on the SPM side the real
// SPM Alarm column (8) was never written at all. Column numbers below are
// corrected to match the sheets' real layout, confirmed directly against
// the live Sheet:
//   RMS Register: Equipment ID(1), Equipment Name(2), Name Plate(3),
//     Eq Type(4), Line(5), Points(6), RMS Good(7), RMS Acceptable(8),
//     RMS Alarm(9)
//   SPM Register: Equipment ID(1), Equipment Name(2), Line(3), Points(4),
//     SPM Type(5), SPM Normal(6), SPM Caution(7), SPM Alarm(8)
function handleUpdateRegisterLimits(params) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var eid  = String(params.equipmentId||'').trim();
  var type = String(params.type||'RMS');
  if (type === 'RMS') {
    var sheet = ss.getSheetByName(SHEET_RMS_REG);
    if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_RMS_REG};
    var idx = findRowIndex(sheet, [0], [eid], dataStartRowFor(SHEET_RMS_REG));
    if (idx===-1) return {status:'error', error:'Equipment not found in RMS Register: '+eid};
    if (params.rmsGood        !== undefined) sheet.getRange(idx, 7).setValue(parseFloat(params.rmsGood)||'');
    if (params.rmsAcceptable  !== undefined) sheet.getRange(idx, 8).setValue(parseFloat(params.rmsAcceptable)||'');
    if (params.rmsAlarm       !== undefined) sheet.getRange(idx, 9).setValue(parseFloat(params.rmsAlarm)||'');
    if (params.namePlate !== undefined) sheet.getRange(idx, 3).setValue(params.namePlate||'');
    if (params.eqType    !== undefined) sheet.getRange(idx, 4).setValue(params.eqType||'');
    if (params.line      !== undefined) sheet.getRange(idx, 5).setValue(params.line||'');
    if (params.points    !== undefined) sheet.getRange(idx, 6).setValue(params.points||'');
    return {status:'ok', action:'updateRegisterLimits', type:'RMS', equipmentId:eid};
  } else {
    var sheet2 = ss.getSheetByName(SHEET_SPM_REG);
    if (!sheet2) return {status:'error', error:'Sheet not found: '+SHEET_SPM_REG};
    var idx2 = findRowIndex(sheet2, [0], [eid], dataStartRowFor(SHEET_SPM_REG));
    if (idx2===-1) return {status:'error', error:'Equipment not found in SPM Register: '+eid};
    if (params.spmNormal  !== undefined) sheet2.getRange(idx2, 6).setValue(parseFloat(params.spmNormal)||'');
    if (params.spmCaution !== undefined) sheet2.getRange(idx2, 7).setValue(parseFloat(params.spmCaution)||'');
    if (params.spmAlarm   !== undefined) sheet2.getRange(idx2, 8).setValue(parseFloat(params.spmAlarm)||'');
    return {status:'ok', action:'updateRegisterLimits', type:'SPM', equipmentId:eid};
  }
}

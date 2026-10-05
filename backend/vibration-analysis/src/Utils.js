// ─── Generic sheet reader ───────────────────────────────────────────────
// Returns one plain object per non-blank row, keyed by that sheet's own
// header text (e.g. row["Asset ID"]) — every sheet-specific reader in this
// project except readCompliance()/readVibRegistry() (both irregularly
// shaped, read by fixed column position instead) builds on this.
function readSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var cfg = SHEET_CFG[sheetName];
  var headerRow = cfg.headerRow;
  var dataStart = cfg.dataStartRow;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 1) return [];

  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var numRows = lastRow - dataStart + 1;
  var data = sheet.getRange(dataStart, 1, numRows, lastCol).getValues();
  var tz = Session.getScriptTimeZone() || 'UTC';

  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var hasData = false;
    for (var c = 0; c < row.length; c++) { if (row[c]!==''&&row[c]!==null){ hasData=true; break; } }
    if (!hasData) continue;
    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      var key = headers[h]; if (!key) continue;
      var val = row[h];
      if (val instanceof Date) val = Utilities.formatDate(val, tz, "yyyy-MM-dd'T'HH:mm:ss");
      obj[key] = val;
    }
    obj._rowNum = dataStart + i;
    out.push(obj);
  }
  return out;
}

// ─── Generic row writers (used for raw sheets the client manages directly
// — RMS/SPM DATA's own append/update/delete) ──────────────────────────
function handleAppend(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = params.sheet;
  var row = JSON.parse(params.row);
  var headers = params.headers ? JSON.parse(params.headers) : null;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.appendRow(row);
  return {status:'ok', action:'append', sheet:sheetName, rowNum:sheet.getLastRow()};
}

function handleUpdateRow(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName   = params.sheet;
  var matchCols   = JSON.parse(params.matchCols);
  var matchValues = JSON.parse(params.matchValues);
  var row = JSON.parse(params.row);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return {status:'error', error:'Sheet not found: '+sheetName};
  var idx = findRowIndex(sheet, matchCols, matchValues, dataStartRowFor(sheetName));
  if (idx===-1) return {status:'error', error:'Row not found'};
  sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  return {status:'ok', action:'updateRow', sheet:sheetName, rowNum:idx};
}

function handleDeleteRow(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName   = params.sheet;
  var matchCols   = JSON.parse(params.matchCols);
  var matchValues = JSON.parse(params.matchValues);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return {status:'error', error:'Sheet not found: '+sheetName};
  var idx = findRowIndex(sheet, matchCols, matchValues, dataStartRowFor(sheetName));
  if (idx===-1) return {status:'error', error:'Row not found'};
  sheet.deleteRow(idx);
  return {status:'ok', action:'deleteRow', sheet:sheetName, rowNum:idx};
}

// ─── findRowIndex ───────────────────────────────────────────────────────
// Locates a row by matching several columns (0-based) against several
// values at once — e.g. RMS DATA's own [Equipment ID, Asset ID, Date]
// match key. Returns the 1-based sheet row, or -1.
function findRowIndex(sheet, matchCols, matchValues, dataStartRow) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStartRow || lastCol < 1) return -1;
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, lastCol).getValues();
  var tz   = Session.getScriptTimeZone() || 'UTC';
  for (var i = 0; i < data.length; i++) {
    var row   = data[i];
    var match = true;
    for (var c = 0; c < matchCols.length; c++) {
      var actual = row[matchCols[c]];
      if (actual instanceof Date) actual = Utilities.formatDate(actual, tz, "yyyy-MM-dd'T'HH:mm:ss");
      if (String(actual) !== String(matchValues[c])) { match = false; break; }
    }
    if (match) return dataStartRow + i;
  }
  return -1;
}

// ─── Machine-status helpers shared by RmsData.js/SpmData.js/
// BackfillLastReadings.js — both Last Reading sheets carry one "Machine
// Status" column that always reflects the WORST of that equipment's own
// RMS and SPM readings together, kept in sync on every upsert/delete. ──

function getAllRowsForEquip(sheet, eid, equipCol, dataStart) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 1) return [];
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  var out  = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][equipCol]||'').trim() === eid) out.push(data[i]);
  }
  return out;
}

function updateMachineStatusCol(sheet, eid, equipCol, statusColIdx, machineStatus, dataStart) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 1) return;
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][equipCol]||'').trim() === eid) {
      sheet.getRange(dataStart + i, statusColIdx + 1).setValue(machineStatus);
    }
  }
}

// Recomputes one equipment's overall Machine Status fresh from every row
// currently in both Last Reading sheets (not just the one just upserted).
function recalcMachineStatus(ss, eid) {
  var worst = '';
  var rmsSheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (rmsSheet) {
    var data = getAllRowsForEquip(rmsSheet, eid, 0, dataStartRowFor(SHEET_LAST_RMS));
    for (var i = 0; i < data.length; i++) { var s = String(data[i][10]||''); if(s) worst = worst ? worstStatus(worst,s) : s; }
  }
  var spmSheet = ss.getSheetByName(SHEET_LAST_SPM);
  if (spmSheet) {
    var data2 = getAllRowsForEquip(spmSheet, eid, 0, dataStartRowFor(SHEET_LAST_SPM));
    for (var j = 0; j < data2.length; j++) { var s2 = String(data2[j][9]||''); if(s2) worst = worst ? worstStatus(worst,s2) : s2; }
  }
  return worst;
}

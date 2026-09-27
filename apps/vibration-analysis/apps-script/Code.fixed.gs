/**
 * Arabian Cement — Vibration & Condition Monitoring  v3.1 (FIXED)
 *
 * This is Code.gs with two corrections applied — see apps-script/README.md
 * for the full explanation of what was wrong and how it was verified
 * against the live Sheet. Everything else is byte-for-byte identical to
 * Code.gs; only the lines marked "FIX:" below changed.
 *
 *   1. handleUpdateRegisterLimits() wrote every RMS/SPM limit field one
 *      column to the left of where that column actually lives in
 *      "⚙ RMS Register" / "⚙ SPM Register" — corrupting the Points/Type
 *      columns and shifting Good/Acceptable/Alarm (or Normal/Caution) by
 *      one slot on every save from Equipment Register's edit modal or
 *      Limits Settings. Column numbers corrected to match the sheets'
 *      real layout.
 *   2. onEdit()'s sheet-name guard checked for "🚨 Action Tracker", which
 *      does not exist (the real tab, per SHEET_ACTIONS above, is
 *      "📋 Action Tracker") — so the year/month row-hide filter silently
 *      never ran. Corrected to match SHEET_ACTIONS.
 *
 * Apps Script Web App
 *
 * Deploy: Extensions > Apps Script > paste this file (replace Code.gs) >
 *   Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone
 *   Copy the /exec URL into the app Settings > Webhook URL.
 *
 * After ANY change: Deploy > Manage deployments > edit > New version > Deploy.
 *
 * ── CONFIGURATION SHEET SETUP ──────────────────────────────────────────────
 * Create a sheet tab named exactly:  Configuration
 * Row 1: headers →  Key  |  Value
 * Row 2 onwards: key-value pairs (app will create/update these automatically)
 *
 * ── ACTION TRACKER SHEET SETUP ─────────────────────────────────────────────
 * Sheet tab name:  📋 Action Tracker
 * Row 5: column headers, Row 6+: data rows
 *
 * ── COMPLIANCE TRACKER SHEET ───────────────────────────────────────────────
 * Sheet:  📋 Compliance Tracker
 * Row 3: month headers (col E onwards), Row 4+: equipment data
 * App now writes machine status (not "YES") to cells.
 * Missing past months are auto-written as "Missing" on sync.
 */

// ─── Sheet names ─────────────────────────────────────────────────────────────
var SHEET_RMS        = '📥 RMS DATA';
var SHEET_SPM        = '📥 SPM DATA';
var SHEET_COMPLIANCE = '📋 Compliance Tracker';
var SHEET_RMS_REG    = '⚙ RMS Register';
var SHEET_SPM_REG    = '⚙ SPM Register';
var SHEET_LAST_RMS   = '📋 Last RMS Reading';
var SHEET_LAST_SPM   = '📋 Last SPM Reading';
var SHEET_ACTIONS    = '📋 Action Tracker';
var SHEET_CONFIG     = 'Configuration';

// ─── Header/data row config (1-based) ────────────────────────────────────────
var SHEET_CFG = {};
SHEET_CFG[SHEET_RMS]        = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_SPM]        = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_COMPLIANCE] = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_RMS_REG]    = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_SPM_REG]    = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_LAST_RMS]   = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_LAST_SPM]   = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_ACTIONS]    = { headerRow: 5, dataStartRow: 6 };
SHEET_CFG[SHEET_CONFIG]     = { headerRow: 1, dataStartRow: 2 };

function dataStartRowFor(sn) { var c=SHEET_CFG[sn]; return c?c.dataStartRow:2; }
function headerRowFor(sn)    { var c=SHEET_CFG[sn]; return c?c.headerRow:1; }

// ─── Action Tracker column headers (row 5) ────────────────────────────────────
var ACTION_HEADERS = [
  'Action No','Equipment ID','Equipment Name','Line','Reading Date',
  'Trigger Type','Trigger Point','Trigger Value','Machine Status',
  'Revision Date','Action Status','Completion Date','Contractor',
  'Contractor Action','ACC Action','Agreed Action'
];

// ─── Severity ordering ────────────────────────────────────────────────────────
var STATUS_ORDER = { 'Good':1,'Normal':1,'Acceptable':2,'Caution':2,'Alarm':3,'Danger':4 };
function worstStatus(a, b) {
  return (STATUS_ORDER[a]||0) >= (STATUS_ORDER[b]||0) ? a : b;
}

// ─── Entry points ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var action = e.parameter.action || 'readAll';
    var result = dispatch(action, e.parameter);
    return jsonOut(e, result);
  } catch(err) { return jsonOut(e, {error: String(err)}); }
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch(x) { body = e.parameter; }
    } else { body = e.parameter; }
    var action = body.action || 'readAll';
    var result = dispatch(action, body);
    return jsonOut(e, result);
  } catch(err) { return jsonOut(e, {error: String(err)}); }
}

function dispatch(action, params) {
  if (action==='readAll')               return readAll();
  if (action==='test')                  return {status:'ok', time: new Date().toISOString()};
  if (action==='append')                return handleAppend(params);
  if (action==='updateRow')             return handleUpdateRow(params);
  if (action==='deleteRow')             return handleDeleteRow(params);
  if (action==='upsertLastRMS')         return handleUpsertLastRMS(params);
  if (action==='upsertLastSPM')         return handleUpsertLastSPM(params);
  if (action==='deleteLastRMS')         return handleDeleteLastRMS(params);
  if (action==='deleteLastSPM')         return handleDeleteLastSPM(params);
  if (action==='updateRegisterLimits')  return handleUpdateRegisterLimits(params);
  if (action==='backfillLastReadings')  return handleBackfillLastReadings();
  if (action==='updateCompliance')      return handleUpdateCompliance(params);
  if (action==='markMissingCompliance') return handleMarkMissingCompliance();
  if (action==='readActions')           return handleReadActions();
  if (action==='appendAction')          return handleAppendAction(params);
  if (action==='updateAction')          return handleUpdateAction(params);
  if (action==='deleteAction')          return handleDeleteAction(params);
  if (action==='sendActionEmail')       return handleSendActionEmail(params);
  if (action==='readLastActionNo')      return handleReadLastActionNo();
  if (action==='readConfig')            return handleReadConfig();
  if (action==='saveConfig')            return handleSaveConfig(params);
  return {error: 'Unknown action: ' + action};
}

function jsonOut(e, obj) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb+'('+json+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ─── readAll ──────────────────────────────────────────────────────────────────
function readAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Auto-mark missing compliance on every readAll
  try { handleMarkMissingCompliance(); } catch(e) {}
  return {
    rms:         readSheet(ss, SHEET_RMS),
    spm:         readSheet(ss, SHEET_SPM),
    compliance:  readCompliance(ss),
    rmsRegister: readSheet(ss, SHEET_RMS_REG),
    spmRegister: readSheet(ss, SHEET_SPM_REG),
    lastRms:     readSheet(ss, SHEET_LAST_RMS),
    lastSpm:     readSheet(ss, SHEET_LAST_SPM),
    actions:     readActionsRaw(ss),
    config:      readConfigRaw(ss),
  };
}

// ─── Generic sheet reader ─────────────────────────────────────────────────────
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

// ─── Compliance reader (wide format) ─────────────────────────────────────────
// Returns each equipment row with all month columns
function readCompliance(ss) {
  var sheet = ss.getSheetByName(SHEET_COMPLIANCE);
  if (!sheet) return [];
  var cfg = SHEET_CFG[SHEET_COMPLIANCE];
  var headerRow  = cfg.headerRow;   // row 3
  var dataStart  = cfg.dataStartRow; // row 4
  var lastRow    = sheet.getLastRow();
  var lastCol    = sheet.getLastColumn();
  if (lastRow < dataStart) return [];

  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var data    = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  var tz = Session.getScriptTimeZone() || 'UTC';

  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[2]) continue; // skip rows without Asset ID (col C)
    var obj = {
      line:        row[0],
      equipment:   row[1],
      equipmentId: String(row[2]||'').trim(),
      last:        row[3],
      months:      [],
      _rowNum:     dataStart + i,
    };
    // Month columns start at col E (index 4)
    for (var h = 4; h < headers.length; h++) {
      var label = headers[h];
      if (!label) continue;
      var ms;
      if (label instanceof Date) {
        ms = Utilities.formatDate(label, tz, 'yyyy-MM');
      } else {
        // Handle text like "Jan-26", "Dec-25" etc.
        ms = parseLabelToYearMonth(String(label).trim());
      }
      if (!ms) continue;
      var cellVal = row[h];
      // Convert Date cells to string
      if (cellVal instanceof Date) cellVal = Utilities.formatDate(cellVal, tz, 'yyyy-MM-dd');
      obj.months.push({ month: ms, status: String(cellVal||'').trim(), colIndex: h });
    }
    out.push(obj);
  }
  return out;
}

// Helper: parse "Jan-26" or "Jan-2026" or "2026-01" to "2026-01"
function parseLabelToYearMonth(label) {
  if (!label) return '';
  // Already yyyy-MM
  if (/^\d{4}-\d{2}$/.test(label)) return label;
  // MMM-YY or MMM-YYYY
  var months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  var m = label.match(/^([A-Za-z]{3})[-\/\s](\d{2,4})$/);
  if (m) {
    var mo = months[m[1].toLowerCase()];
    if (!mo) return '';
    var yr = m[2].length === 2 ? '20' + m[2] : m[2];
    return yr + '-' + mo;
  }
  return '';
}

// ─── append ───────────────────────────────────────────────────────────────────
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

// ─── updateRow ────────────────────────────────────────────────────────────────
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

// ─── deleteRow ────────────────────────────────────────────────────────────────
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

// ─── upsertLastRMS ────────────────────────────────────────────────────────────
function handleUpsertLastRMS(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_LAST_RMS);
  if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_LAST_RMS};
  var eid   = String(params.equipmentId||'').trim();
  var point = String(params.point||'').trim();
  var row = [eid, params.equipmentName||'', params.line||'', point, params.date||'',
    params.axial||'', params.gear||'', params.horizontal||'', params.vertical||'',
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

// ─── upsertLastSPM ────────────────────────────────────────────────────────────
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

// ─── deleteLastRMS ────────────────────────────────────────────────────────────
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

// ─── deleteLastSPM ────────────────────────────────────────────────────────────
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

// ─── updateRegisterLimits ─────────────────────────────────────────────────────
function handleUpdateRegisterLimits(params) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var eid  = String(params.equipmentId||'').trim();
  var type = String(params.type||'RMS');
  if (type === 'RMS') {
    var sheet = ss.getSheetByName(SHEET_RMS_REG);
    if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_RMS_REG};
    var idx = findRowIndex(sheet, [0], [eid], dataStartRowFor(SHEET_RMS_REG));
    if (idx===-1) return {status:'error', error:'Equipment not found in RMS Register: '+eid};
    // FIX: RMS Register's real column order is Equipment ID(1), Equipment
    // Name(2), Name Plate(3), Eq Type(4), Line(5), Points(6), RMS Good(7),
    // RMS Acceptable(8), RMS Alarm(9) — the original code below wrote
    // rmsGood/rmsAcceptable/rmsAlarm/points one column to the left of each
    // one's real position (rmsGood into Points' column, points into RMS
    // Alarm's column, etc). Column numbers corrected to match.
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
    // FIX: SPM Register's real column order is Equipment ID(1), Equipment
    // Name(2), Line(3), Points(4), SPM Type(5), SPM Normal(6), SPM
    // Caution(7), SPM Alarm(8) — the original code below wrote spmNormal
    // into the SPM Type column, spmCaution into SPM Normal's column, and
    // spmAlarm into SPM Caution's column, leaving the real SPM Alarm
    // column (8) never written at all. Column numbers corrected, and the
    // missing SPM Alarm write added.
    if (params.spmNormal  !== undefined) sheet2.getRange(idx2, 6).setValue(parseFloat(params.spmNormal)||'');
    if (params.spmCaution !== undefined) sheet2.getRange(idx2, 7).setValue(parseFloat(params.spmCaution)||'');
    if (params.spmAlarm   !== undefined) sheet2.getRange(idx2, 8).setValue(parseFloat(params.spmAlarm)||'');
    return {status:'ok', action:'updateRegisterLimits', type:'SPM', equipmentId:eid};
  }
}

// ─── updateCompliance ─────────────────────────────────────────────────────────
// Writes machine status (e.g. "Alarm", "Normal") to compliance cell
// params: equipmentId, month (yyyy-MM), value (machine status string)
function handleUpdateCompliance(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_COMPLIANCE);
  if (!sheet) return {status:'error', error:'Sheet not found: '+SHEET_COMPLIANCE};

  var eid         = String(params.equipmentId||'').trim();
  var targetMonth = String(params.month||'').trim(); // e.g. "2026-04"
  var value       = String(params.value||'Normal');

  var cfg       = SHEET_CFG[SHEET_COMPLIANCE];
  var headerRow = cfg.headerRow;  // row 3
  var dataStart = cfg.dataStartRow; // row 4
  var lastRow   = sheet.getLastRow();
  var lastCol   = sheet.getLastColumn();
  if (lastCol < 5) return {status:'error', error:'Compliance sheet has no month columns'};

  var tz = Session.getScriptTimeZone() || 'UTC';

  // Find month column (starts at col E = index 4, 1-based col 5)
  var headers   = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var monthCol  = -1;
  for (var h = 4; h < headers.length; h++) {
    var label = headers[h];
    var ms;
    if (label instanceof Date) {
      ms = Utilities.formatDate(label, tz, 'yyyy-MM');
    } else {
      ms = parseLabelToYearMonth(String(label).trim());
    }
    if (ms === targetMonth) { monthCol = h + 1; break; }
  }
  if (monthCol === -1) return {status:'error', error:'Month column not found: '+targetMonth};

  // Find equipment row by Asset ID (col C = index 2)
  var data     = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 3).getValues();
  var equipRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][2]||'').trim() === eid) { equipRow = dataStart + i; break; }
  }
  if (equipRow === -1) return {status:'error', error:'Equipment not found in Compliance sheet: '+eid};

  sheet.getRange(equipRow, monthCol).setValue(value);

  // Also update "Last" column (col D = 4) with this status
  sheet.getRange(equipRow, 4).setValue(targetMonth);

  return {status:'ok', action:'updateCompliance', equipmentId:eid, month:targetMonth, value:value};
}

// ─── markMissingCompliance ────────────────────────────────────────────────────
// Scans all past month columns (before current month) for each equipment.
// If a cell is empty, writes "Missing". If it has a value already, leaves it.
// Called automatically on every readAll.
function handleMarkMissingCompliance() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_COMPLIANCE);
  if (!sheet) return {status:'ok', skipped:true};

  var cfg       = SHEET_CFG[SHEET_COMPLIANCE];
  var headerRow = cfg.headerRow;  // row 3
  var dataStart = cfg.dataStartRow; // row 4
  var lastRow   = sheet.getLastRow();
  var lastCol   = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 5) return {status:'ok', skipped:true};

  var tz = Session.getScriptTimeZone() || 'UTC';
  var now = new Date();
  // Current month key e.g. "2026-06"
  var currentMonth = Utilities.formatDate(now, tz, 'yyyy-MM');

  // Read all headers (row 3)
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];

  // Collect past month column indices (1-based) — only months strictly before current month
  var pastMonthCols = [];
  for (var h = 4; h < headers.length; h++) {
    var label = headers[h];
    var ms;
    if (label instanceof Date) {
      ms = Utilities.formatDate(label, tz, 'yyyy-MM');
    } else {
      ms = parseLabelToYearMonth(String(label||'').trim());
    }
    if (ms && ms < currentMonth) {
      pastMonthCols.push({ col: h + 1, month: ms }); // 1-based col
    }
  }
  if (pastMonthCols.length === 0) return {status:'ok', marked:0};

  // Read all data rows
  var numRows = lastRow - dataStart + 1;
  var data    = sheet.getRange(dataStart, 1, numRows, lastCol).getValues();

  var marked = 0;
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[2]) continue; // skip rows without Asset ID
    for (var j = 0; j < pastMonthCols.length; j++) {
      var colObj  = pastMonthCols[j];
      var colIdx  = colObj.col - 1; // 0-based for array
      var cellVal = String(row[colIdx]||'').trim();
      if (cellVal === '') {
        // Write "Missing" to empty past month cell
        sheet.getRange(dataStart + i, colObj.col).setValue('Missing');
        marked++;
      }
    }
  }

  return {status:'ok', action:'markMissingCompliance', marked:marked};
}

// ─── Action Tracker — READ ────────────────────────────────────────────────────
function handleReadActions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {status:'ok', actions: readActionsRaw(ss)};
}

function readActionsRaw(ss) {
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return [];
  var cfg       = SHEET_CFG[SHEET_ACTIONS];
  var dataStart = cfg.dataStartRow; // row 6
  var lastRow   = sheet.getLastRow();
  var lastCol   = Math.max(sheet.getLastColumn(), ACTION_HEADERS.length);
  if (lastRow < dataStart) return [];

  var tz   = Session.getScriptTimeZone() || 'UTC';
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  var out  = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    var obj = {};
    for (var h = 0; h < ACTION_HEADERS.length; h++) {
      var val = row[h];
      if (val instanceof Date) val = Utilities.formatDate(val, tz, "yyyy-MM-dd'T'HH:mm:ss");
      obj[ACTION_HEADERS[h]] = val;
    }
    obj._rowNum = dataStart + i;
    out.push(obj);
  }
  return out;
}

// ─── readLastActionNo ─────────────────────────────────────────────────────────
// Returns the highest action number currently in the sheet (e.g. "V-006")
// so the app can generate the next number fresh from the sheet.
function handleReadLastActionNo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'ok', lastNo:'V-000', nextNo:'V-001'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS); // row 6
  var lastRow   = sheet.getLastRow();
  var maxNum    = 0;

  if (lastRow >= dataStart) {
    var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var val = String(data[i][0]||'').trim();
      var m   = val.match(/^V-(\d+)$/i);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }

  var nextNum  = maxNum + 1;
  var lastNoStr = 'V-' + String(maxNum).padStart(3, '0');
  var nextNoStr = 'V-' + String(nextNum).padStart(3, '0');
  return {status:'ok', lastNo: lastNoStr, nextNo: nextNoStr, maxNum: maxNum};
}

// ─── Action Tracker — APPEND ──────────────────────────────────────────────────
// Always appends after the last occupied row (row 6+ data start)
function handleAppendAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);

  // Auto-create sheet with headers if missing
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACTIONS);
    // Rows 1-4 blank, row 5 = headers
    sheet.getRange(5, 1, 1, ACTION_HEADERS.length).setValues([ACTION_HEADERS]);
  }

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) actionNo = generateActionNo(sheet);

  var row = buildActionRow(params, actionNo);
  // appendRow always adds after last row — correct behaviour
  sheet.appendRow(row);
  return {status:'ok', action:'appendAction', actionNo:actionNo, rowNum:sheet.getLastRow()};
}

// ─── Action Tracker — UPDATE ──────────────────────────────────────────────────
function handleUpdateAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'error', error:'Action Tracker sheet not found'};

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) return {status:'error', error:'Action No required for update'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var idx = findRowIndex(sheet, [0], [actionNo], dataStart);
  if (idx===-1) return {status:'error', error:'Action not found: '+actionNo};

  var row = buildActionRow(params, actionNo);
  sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  return {status:'ok', action:'updateAction', actionNo:actionNo, rowNum:idx};
}

// ─── Action Tracker — DELETE ──────────────────────────────────────────────────
function handleDeleteAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'error', error:'Action Tracker sheet not found'};

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) return {status:'error', error:'Action No required for delete'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var idx = findRowIndex(sheet, [0], [actionNo], dataStart);
  if (idx===-1) return {status:'error', error:'Action not found: '+actionNo};

  sheet.deleteRow(idx);
  return {status:'ok', action:'deleteAction', actionNo:actionNo};
}

// ─── Action Tracker — SEND EMAIL ──────────────────────────────────────────────
// params: recipients (JSON array), plus all action fields
// Now supports sending multiple actions as a formatted list
function handleSendActionEmail(params) {
  try {
    var recipients = JSON.parse(params.recipients || '[]');
    if (!recipients || recipients.length === 0) return {status:'error', error:'No recipients'};

    // Support single action OR array of actions
    var actionsArr = [];
    if (params.actions) {
      actionsArr = JSON.parse(params.actions);
    } else {
      // Single action (legacy)
      actionsArr = [{
        actionNo:       params['Action No']      || params.actionNo      || '',
        equipmentId:    params['Equipment ID']   || params.equipmentId   || '',
        equipmentName:  params['Equipment Name'] || params.equipmentName || '',
        line:           params['Line']           || params.line          || '',
        readingDate:    params['Reading Date']   || params.readingDate   || '',
        triggerType:    params['Trigger Type']   || params.triggerType   || '',
        triggerPoint:   params['Trigger Point']  || params.triggerPoint  || '',
        triggerValue:   params['Trigger Value']  || params.triggerValue  || '',
        machineStatus:  params['Machine Status'] || params.machineStatus || '',
        revisionDate:   params['Revision Date']  || params.revisionDate  || '',
        actionStatus:   params['Action Status']  || params.actionStatus  || '',
        contractor:     params['Contractor']     || params.contractor    || '',
        agreedAction:   params['Agreed Action']  || params.agreedAction  || '',
        accAction:      params['ACC Action']     || params.accAction     || '',
      }];
    }

    var filterDesc = params.filterDesc || '';
    var subject = 'Vibration Action Tracker Report' + (filterDesc ? ' — ' + filterDesc : '') + ' | Arabian Cement';

    var body = 'Dear Team,\n\n';
    body += 'Please find below the vibration action items' + (filterDesc ? ' filtered by: ' + filterDesc : '') + ':\n\n';
    body += '══════════════════════════════════════════════\n';

    for (var i = 0; i < actionsArr.length; i++) {
      var a = actionsArr[i];
      body += 'ACTION ' + (i + 1) + ' of ' + actionsArr.length + '\n';
      body += '──────────────────────────────────────\n';
      body += 'Action No       : ' + (a.actionNo||'')       + '\n';
      body += 'Equipment ID    : ' + (a.equipmentId||'')    + '\n';
      body += 'Equipment Name  : ' + (a.equipmentName||'')  + '\n';
      body += 'Line            : ' + (a.line||'')           + '\n';
      body += 'Reading Date    : ' + (a.readingDate||'')    + '\n';
      body += 'Machine Status  : ' + (a.machineStatus||'')  + '\n';
      body += 'Trigger Type    : ' + (a.triggerType||'')    + '\n';
      body += 'Trigger Point   : ' + (a.triggerPoint||'')   + '\n';
      body += 'Trigger Value   : ' + (a.triggerValue||'')   + '\n';
      body += 'Agreed Action   : ' + (a.agreedAction||'')   + '\n';
      body += 'ACC Action      : ' + (a.accAction||'')      + '\n';
      body += 'Contractor      : ' + (a.contractor||'')     + '\n';
      body += 'Revision Date   : ' + (a.revisionDate||'')   + '\n';
      body += 'Action Status   : ' + (a.actionStatus||'')   + '\n';
      body += '\n';
    }

    body += '══════════════════════════════════════════════\n\n';
    body += 'Total Actions: ' + actionsArr.length + '\n\n';
    body += 'Authorized by: aghafar@arabiancementcompany.com\n';
    body += 'Arabian Cement Company — Condition Monitoring Department\n';
    body += 'Generated automatically by Vibration & Condition Monitoring System';

    for (var r = 0; r < recipients.length; r++) {
      var email = String(recipients[r]).trim();
      if (email) GmailApp.sendEmail(email, subject, body);
    }

    return {status:'ok', action:'sendActionEmail', sent:recipients.length, count:actionsArr.length};
  } catch(err) {
    return {status:'error', error:String(err)};
  }
}

// ─── Configuration — READ ─────────────────────────────────────────────────────
function handleReadConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {status:'ok', config: readConfigRaw(ss)};
}

function readConfigRaw(ss) {
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) return {};
  var lastRow   = sheet.getLastRow();
  var dataStart = dataStartRowFor(SHEET_CONFIG);
  if (lastRow < dataStart) return {};
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 2).getValues();
  var out  = {};
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]||'').trim();
    var val = data[i][1];
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

// ─── Configuration — SAVE ─────────────────────────────────────────────────────
function handleSaveConfig(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG);
    sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
  }
  var configObj = {};
  try { configObj = JSON.parse(params.config || '{}'); } catch(e) { configObj = {}; }
  var dataStart = dataStartRowFor(SHEET_CONFIG);
  for (var key in configObj) {
    if (!configObj.hasOwnProperty(key)) continue;
    var val     = configObj[key];
    var lastRow = sheet.getLastRow();
    var found   = false;
    if (lastRow >= dataStart) {
      var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]||'').trim() === key) {
          sheet.getRange(dataStart + i, 2).setValue(val);
          found = true; break;
        }
      }
    }
    if (!found) sheet.appendRow([key, val]);
  }
  return {status:'ok', action:'saveConfig', keys:Object.keys(configObj).length};
}

// ─── backfillLastReadings ─────────────────────────────────────────────────────
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
    var vals  = [parseFloat(rr2['AXial (mm/s)']||0), parseFloat(rr2['Gear\n(mm/s)']||0),
                 parseFloat(rr2['Horizontal (mm/s)']||0), parseFloat(rr2['Vertical (mm/s)']||0)].filter(function(v){return !isNaN(v);});
    if (!maxVel && vals.length) maxVel = Math.max.apply(null, vals);
    var rs      = calcRmsStatus(maxVel, lim);
    var dateStr = rr2['Date']||'';
    if (dateStr instanceof Date) dateStr = Utilities.formatDate(dateStr, tz, 'yyyy-MM-dd');
    rmsOutRows.push([reid2, rr2['Equipment Name']||'', '', String(rr2['Asset ID']||''), dateStr,
      rr2['AXial (mm/s)']||'', rr2['Gear\n(mm/s)']||'', rr2['Horizontal (mm/s)']||'', rr2['Vertical (mm/s)']||'', maxVel||'', rs, '']);
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

// ─── recalcMachineStatus ──────────────────────────────────────────────────────
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

// ─── getAllRowsForEquip ───────────────────────────────────────────────────────
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

// ─── updateMachineStatusCol ───────────────────────────────────────────────────
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

// ─── generateActionNo ─────────────────────────────────────────────────────────
function generateActionNo(sheet) {
  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var lastRow   = sheet.getLastRow();
  var maxNum    = 0;
  if (lastRow >= dataStart) {
    var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var val = String(data[i][0]||'').trim();
      var m   = val.match(/^V-(\d+)$/i);
      if (m) { var n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    }
  }
  return 'V-' + String(maxNum + 1).padStart(3, '0');
}

// ─── buildActionRow ───────────────────────────────────────────────────────────
function buildActionRow(params, actionNo) {
  return [
    actionNo,
    params['Equipment ID']     || params.equipmentId     || '',
    params['Equipment Name']   || params.equipmentName   || '',
    params['Line']             || params.line            || '',
    params['Reading Date']     || params.readingDate     || '',
    params['Trigger Type']     || params.triggerType     || '',
    params['Trigger Point']    || params.triggerPoint    || '',
    params['Trigger Value']    || params.triggerValue    || '',
    params['Machine Status']   || params.machineStatus   || '',
    params['Revision Date']    || params.revisionDate    || '',
    params['Action Status']    || params.actionStatus    || 'Open',
    params['Completion Date']  || params.completionDate  || '',
    params['Contractor']       || params.contractor      || '',
    params['Contractor Action']|| params.contractorAction|| '',
    params['ACC Action']       || params.accAction       || '',
    params['Agreed Action']    || params.agreedAction    || '',
  ];
}

// ─── findRowIndex ─────────────────────────────────────────────────────────────
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

function onEdit(e) {
  var sheet = e.source.getActiveSheet();

  // FIX: the real Action Tracker tab is "📋 Action Tracker" (SHEET_ACTIONS
  // above) — this used to check for "🚨 Action Tracker", which doesn't
  // exist, so this whole function was silently a no-op.
  if (sheet.getName() !== SHEET_ACTIONS) return;

  var range = e.range;

  // Define your new filter inputs
  var yearCell = "D3";
  var monthCell = "G3";
  var startRow = 6;
  var dateColumn = 4;     // Column D (Date)

  // Trigger if D3 or G3 changes, OR if any cell in the data rows is edited
  if (range.getA1Notation() === yearCell || range.getA1Notation() === monthCell || range.getRow() >= startRow) {

    // Fetch values from both filters
    var selectedYear = sheet.getRange(yearCell).getValue().toString().trim();
    var selectedMonth = sheet.getRange(monthCell).getValue().toString().trim();
    var lastRow = sheet.getLastRow();

    if (lastRow < startRow) return;

    // 1. Unhide everything first to start fresh
    sheet.unhideRow(sheet.getRange(startRow, 1, lastRow - (startRow - 1)));

    // Check if filters are cleared, set to "0", or set to "All"
    var allYears = (selectedYear === "" || selectedYear === "0" || selectedYear.toLowerCase() === "all years" || selectedYear.toLowerCase() === "all");
    var allMonths = (selectedMonth === "" || selectedMonth === "0" || selectedMonth.toLowerCase() === "all months" || selectedMonth.toLowerCase() === "all");

    // 2. If BOTH filters are set to show everything, stop here and leave table wide open
    if (allYears && allMonths) {
      return;
    }

    // 3. Grab all the actual dates from Column D
    var dateValues = sheet.getRange(startRow, dateColumn, lastRow - (startRow - 1), 1).getValues();

    var monthsArray = ["January", "February", "March", "April", "May", "June",
                       "July", "August", "September", "October", "November", "December"];

    // 4. Loop and evaluate every row
    for (var i = 0; i < dateValues.length; i++) {
      var cellValue = dateValues[i][0];

      if (cellValue instanceof Date) {
        var rowYear = cellValue.getFullYear().toString();

        // Extract both text and numerical representation of the row's month
        var rowMonthName = monthsArray[cellValue.getMonth()].toLowerCase();
        var rowMonthNum = (cellValue.getMonth() + 1).toString(); // 1-12

        // Conditions to see if a row SHOULD be hidden
        var yearMismatch = (!allYears && rowYear !== selectedYear);

        // Check mismatch against both text name ("January") and number ("1")
        var monthMismatch = false;
        if (!allMonths) {
          if (selectedMonth.toLowerCase() !== rowMonthName && selectedMonth !== rowMonthNum && parseInt(selectedMonth) !== parseInt(rowMonthNum)) {
            monthMismatch = true;
          }
        }

        // Hide the row if EITHER the year or the month doesn't match your selection
        if (yearMismatch || monthMismatch) {
          sheet.hideRows(startRow + i);
        }
      }
      // Blank rows are ignored, keeping them open at the bottom for new entries!
    }
  }
}

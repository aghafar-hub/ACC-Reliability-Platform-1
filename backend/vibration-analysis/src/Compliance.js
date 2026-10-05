// ─── Compliance Tracker (wide format: one row per equipment, one column
// per month) ─────────────────────────────────────────────────────────────

// Returns each equipment row with all of its month columns reshaped into
// a `months: [{ month: "2026-04", status, colIndex }]` array — the client
// never has to know which raw column a given month lives in.
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

// Parses "Jan-26" or "Jan-2026" or "2026-01" to "2026-01".
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

// Writes machine status (e.g. "Alarm", "Normal") to one equipment's one
// month cell. params: equipmentId, month (yyyy-MM), value.
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

// Scans all past month columns (strictly before the current month) for
// every equipment. An empty cell gets "Missing" written in; anything with
// a value already is left alone. Called automatically on every readAll().
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

// Generic sheet I/O, response formatting, and row-matching helpers shared across
// every feature file below. Split out of the old monolithic Code.js (see
// docs/oil-lubrication-migration-notes.md).


// Shared by doGet's normal and early-return (unauthorized) paths.
function outputResult_(result, callback) {
  var json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function logError(context, err, extra) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Debug Log");
    if (!sheet) {
      sheet = ss.insertSheet("Debug Log");
      sheet.appendRow(["Timestamp", "Context", "Message", "Stack", "Extra"]);
    }
    sheet.appendRow([
      new Date().toISOString(),
      context,
      err && err.message ? err.message : String(err),
      err && err.stack ? err.stack : "",
      extra ? JSON.stringify(extra) : ""
    ]);
  } catch (e2) { /* never let logging itself break the request */ }
}



// ─── Row-skip configuration (unchanged from v3) ─────────────────────────────

// Returns the 1-based row number where data starts for a given sheet.
function dataStartRowFor(sheetName) {
  if (sheetName === "Data_Entry") return 6;     // rows 1-5 are title/instructions/header
  if (sheetName === "Action Tracker") return 6; // rows 1-4 blank/title, row 5 = header
  return 2; // standard: row 1 = header — covers "Oil Change LOG" too (just a header row, no title row)
}


function readSheet(ss, name, skipHeader) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var vals = sheet.getDataRange().getValues();
  if (vals.length === 0) return [];

  // ── CUSTOM FIX FOR ARABIAN CEMENT DATA_ENTRY ──
  if (name === "Data_Entry") {
    if (vals.length <= 5) return [];
    return skipHeader ? vals.slice(5) : vals.slice(4);
  }

  // ── CUSTOM FIX FOR ARABIAN CEMENT ACTION TRACKER ──
  if (name === "Action Tracker") {
    if (vals.length <= 5) return [];
    return skipHeader ? vals.slice(5) : vals.slice(4);
  }

  // Standard behavior for all other tabs
  if (vals.length === 1 && skipHeader) return [];
  return skipHeader ? vals.slice(1) : vals;
}


function invalidateDashboardCache() {
  CacheService.getScriptCache().remove(DASHBOARD_CACHE_KEY);
}


// Compares two date-like cell values (Date objects, serial numbers, or strings).
// Returns >0 if a is later than b, 0 if equal/unknown, <0 if earlier.
function compareDates(a, b) {
  var da = toComparableDate(a);
  var db = toComparableDate(b);
  if (da === null || db === null) return 0;
  return da - db;
}

function toComparableDate(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v; // serial number — comparable directly
  if (typeof v === "string" && v) {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}



// ─── PHASE 4: Paginated reads for Actions / Oil Changes / Samples ───────────
//
// Returns: { rows:[...], page, limit, total, totalPages }
// newestFirst=true reverses the row order (used for getRecentSamples).

function getPaginated(sheetName, pageParam, limitParam, newestFirst) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, sheetName, true);

  if (newestFirst) rows = rows.slice().reverse();

  var page  = Math.max(1, parseInt(pageParam, 10) || 1);
  var limit = Math.max(1, Math.min(500, parseInt(limitParam, 10) || 50));
  var total = rows.length;
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var start = (page - 1) * limit;
  var pageRows = rows.slice(start, start + limit);

  return { rows: pageRows, page: page, limit: limit, total: total, totalPages: totalPages };
}



// ─── Row matching / update / delete (unchanged from v3) ─────────────────────

function findRowIndex(sheet, matchCols, matchValues, dataStartRow) {
  // OPTION A HARDENING: with an empty matchCols, the inner loop below never
  // runs, so `allMatch` stays true and this returns the very first data
  // row — meaning a malformed or empty matchCols/matchValues silently
  // "matches" and updateRow/deleteRow would act on the wrong row. Refuse
  // instead of guessing.
  if (!matchCols || matchCols.length === 0) return -1;
  var startRow = dataStartRow || 2;
  var vals = sheet.getDataRange().getValues();
  for (var i = startRow - 1; i < vals.length; i++) {
    var allMatch = true;
    for (var c = 0; c < matchCols.length; c++) {
      var cellVal = String(vals[i][matchCols[c]] || "").trim();
      var target  = String(matchValues[c] || "").trim();
      if (cellVal !== target) { allMatch = false; break; }
    }
    if (allMatch) return i + 1; // 1-based row number
  }
  return -1;
}


function updateRow(ss, sheetName, matchCols, matchValues, newRow) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var rowIdx = findRowIndex(sheet, matchCols, matchValues, dataStartRowFor(sheetName));
  if (rowIdx === -1) return false;

  // "Oil Change LOG" is append-only now (see logOilChangeEvent) — this app
  // never calls updateRow against it, so no special-case is needed here.

  sheet.getRange(rowIdx, 1, 1, newRow.length).setValues([newRow]);
  stampLastModified(sheet, sheetName, rowIdx);
  return true;
}


function deleteRow(ss, sheetName, matchCols, matchValues) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var rowIdx = findRowIndex(sheet, matchCols, matchValues, dataStartRowFor(sheetName));
  if (rowIdx === -1) return false;
  sheet.deleteRow(rowIdx);
  return true;
}


function appendRow(ss, sheetName, row, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length) sheet.appendRow(headers);
    sheet.appendRow(row);
    stampLastModified(sheet, sheetName, sheet.getLastRow());
    return;
  }

  // Find the first truly empty row after the data-start row.
  // This avoids writing after blank gap rows in sheets like Action Tracker
  // where rows 1-5 are title/header and data starts at row 6.
  var dataStart = dataStartRowFor(sheetName);
  var lastRow = sheet.getLastRow();
  var allVals = sheet.getRange(dataStart, 1, Math.max(lastRow - dataStart + 1, 1), 1).getValues();
  var firstEmpty = dataStart;
  for (var i = 0; i < allVals.length; i++) {
    if (allVals[i][0] !== "" && allVals[i][0] !== null) {
      firstEmpty = dataStart + i + 1;
    }
  }
  // firstEmpty is now the row number directly after the last non-empty row in col A
  sheet.getRange(firstEmpty, 1, 1, row.length).setValues([row]);
  stampLastModified(sheet, sheetName, firstEmpty);
}


// Writes the current ISO timestamp into the "Last Modified" column for a row.
// Safe no-op if the sheet doesn't have a configured Last Modified column.
function stampLastModified(sheet, sheetName, rowIdx) {
  var col = LAST_MODIFIED_COL[sheetName];
  if (!col) return;
  sheet.getRange(rowIdx, col).setValue(new Date().toISOString());
}


function normalizeMonthHeader(h) {
  var d = null;
  if (h instanceof Date) {
    d = h;
  } else {
    var s = String(h || "").trim();
    var m = s.match(/^([A-Za-z]+)[-\s](\d{2,4})$/);
    if (m) {
      var year = parseInt(m[2], 10);
      if (year < 100) year += (year >= 50 ? 1900 : 2000);
      d = new Date(m[1] + " 15, " + year);
    } else {
      var parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return MONTH_ABBR[d.getMonth()] + "-" + String(d.getFullYear()).slice(-2);
}

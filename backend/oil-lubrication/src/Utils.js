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


// getDashboard() now caches one entry per contractor scope plus one for
// the unscoped/ACC view (see its own comment) — a single remove() would
// only ever clear the unscoped key, leaving stale scoped numbers to serve
// for up to DASHBOARD_CACHE_SECONDS after a real write. KNOWN_CONTRACTORS
// mirrors Rbac.js's ORG_TO_CONTRACTOR values; extend both together if a
// new contractor is ever added.
var KNOWN_CONTRACTORS = ["RHI", "ASEC"];

// Bug-hunt: EquipmentRegistry.js's own `contractor` field only ever
// trimmed the raw sheet cell, never normalized its case — a cell that's
// really RHI/ASEC but typed as "Rhi"/"asec " passed through unnoticed.
// That value then feeds every contractor-scoped read's exact-string
// filter (Rbac.js's getContractorScope_ always returns a clean "RHI"/
// "ASEC") AND gets written straight into a new routine/template's own
// Contractor column by an ACC/unscoped creator's equipment-first pick
// (NewRoutine.jsx) — so a routine built from one of those equipment rows
// would carry the dirty value forever, invisible to the exact contractor
// it actually belongs to (their own scoped getRoutines call never
// matches it again), with no error anywhere. Case-insensitive match
// against the one known list; anything that isn't actually RHI/ASEC at
// all just comes back trimmed, not invented.
function canonicalContractor_(value) {
  var v = String(value || "").trim();
  for (var i = 0; i < KNOWN_CONTRACTORS.length; i++) {
    if (v.toUpperCase() === KNOWN_CONTRACTORS[i].toUpperCase()) return KNOWN_CONTRACTORS[i];
  }
  return v;
}

function invalidateDashboardCache() {
  var keys = [DASHBOARD_CACHE_KEY];
  KNOWN_CONTRACTORS.forEach(function (c) { keys.push(DASHBOARD_CACHE_KEY + ":" + c); });
  CacheService.getScriptCache().removeAll(keys);
}

// Same clear-all-scopes shape as invalidateDashboardCache above, for
// getRoutinesOverview's own cache (RouteTemplates.js). Called by every
// write that can change what that endpoint returns: a new routine or
// route template, a routine's status/area/name/due-date changing
// (approve, pause/resume/cancel, edit), or a template being paused/
// resumed/deleted — NOT every write (e.g. assigning a technician or
// submitting a single checklist item doesn't change anything
// getRoutinesOverview actually surfaces, so those skip this on purpose).
function invalidateRoutinesOverviewCache() {
  var keys = [ROUTINES_OVERVIEW_CACHE_KEY];
  KNOWN_CONTRACTORS.forEach(function (c) { keys.push(ROUTINES_OVERVIEW_CACHE_KEY + ":" + c); });
  CacheService.getScriptCache().removeAll(keys);
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

function getPaginated(sheetName, pageParam, limitParam, newestFirst, scope, lpIndex) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, sheetName, true);
  if (scope && lpIndex != null) rows = filterRowsByLpContractor_(rows, lpIndex, scope);

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
  if (sheetName === "Equipment Registry") invalidateLpContractorMap_();
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
  if (sheetName === "Equipment Registry") invalidateLpContractorMap_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var rowIdx = findRowIndex(sheet, matchCols, matchValues, dataStartRowFor(sheetName));
  if (rowIdx === -1) return false;
  sheet.deleteRow(rowIdx);
  return true;
}


function appendRow(ss, sheetName, row, headers) {
  if (sheetName === "Equipment Registry") invalidateLpContractorMap_();
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


// Patch 10 (plant-readiness pass): with no server-side locking on WHICH
// row a write targets beyond the per-request script lock (Code.js's own
// LockService.getScriptLock — that only serializes writes against each
// other, it says nothing about whether the row changed since whoever is
// writing NOW last read it), two people editing the same sample/action/
// product at the same time got silent last-write-wins — the generic
// update path replaces the whole row from whatever the client last
// loaded, so the second save silently erases the first with no warning
// to either person. This is the check that catches that: if the caller
// tells us the Last Modified value they loaded (expectedLastModified),
// and the row's LIVE value is strictly newer than that, someone else's
// write landed in between — the caller (Code.js) skips the overwrite
// instead of applying it.
//
// Comparison uses compareDates(), not string equality — Google Sheets can
// silently coerce the ISO string stampLastModified writes into a real
// Date-typed cell, and that doesn't always round-trip back to
// byte-identical text (same issue SAMPLE_DATE_COL's own comment
// describes for sampled dates). An exact string check would false-
// positive on an unrelated formatting round-trip, not just a real
// conflict — a pure chronological "is the live value later than what I
// loaded" comparison is robust to that, and is all a conflict check
// actually needs.
//
// No expectedLastModified at all (an older cached client build, or a
// sheet with no configured Last Modified column) means nothing to
// compare against — never blocks the write, same as before this existed.
function hasConflict_(sheet, sheetName, rowIdx, expectedLastModified) {
  if (!expectedLastModified) return false;
  var col = LAST_MODIFIED_COL[sheetName];
  if (!col) return false;
  var current = sheet.getRange(rowIdx, col).getValue();
  if (!current) return false;
  return compareDates(current, expectedLastModified) > 0;
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

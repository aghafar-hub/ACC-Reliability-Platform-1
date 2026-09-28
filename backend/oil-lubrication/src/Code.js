// ════════════════════════════════════════════════════════════════════════════
// Arabian Cement Oil LUB — Apps Script v4.0 (Performance Redesign)
// ════════════════════════════════════════════════════════════════════════════
// Deploy as Web App: Execute as Me · Who has access: Anyone
//
// This is the real, already-deployed backend behind apps/oil-analysis (the
// embedded legacy Oil app) — not backend/oil-analysis (a separate,
// Routine/LP_ID-based backend built earlier for a module that was never
// linked into the sidebar; parked for possible later use, see docs/).
//
// BACKWARD COMPATIBLE: readAll / append / updateRow / deleteRow all still work
// exactly as before — existing app continues to function during migration.
//
// NEW ENDPOINTS (all via doGet, JSONP-capable with &callback=fnName):
//   ?action=getDashboard                    → aggregated counts, cached 5 min
//   ?action=getEquipment&id=XXXX            → samples+actions+oilChanges for one equipment
//   ?action=searchEquipment&q=text          → top 20 matching Data_Entry rows
//   ?action=getActions&page=1&limit=50      → paginated Action Tracker rows
//   ?action=getOilChanges&page=1&limit=50   → paginated Oil Change LOG rows
//   ?action=getOilChangesForLp&lpId=XXXX    → all Oil Change LOG events for one LP_ID
//   ?action=getRecentSamples&page=1&limit=50→ paginated Data_Entry rows (newest first)
//
// STEP 2 (see docs/oil-lubrication-migration-notes.md): "Oil Change Log" was
// the sheet's OLD tab name for a "current state per equipment/point/oilType"
// row — that tab is gone. The real tab today is "Oil Change LOG" (note the
// case — SpreadsheetApp.getSheetByName is case-sensitive, so the original
// v4.0 script silently got back an empty sheet here) and it's an
// append-only EVENT log: one row per real oil-change event, never edited in
// place. doPost action "logOilChangeEvent" is the only way this app writes
// to it now — updateRow's old special-case for this sheet is gone.
// "Oil Last Change" (a separate tab) is a formula-only derived view this
// backend never reads or writes — its own MAXIFS/IF formulas keep it in
// sync with Oil Change LOG on their own.
//
// LAST MODIFIED TRACKING:
//   Each sheet gets a new trailing column "Last Modified" (ISO timestamp).
//   Stamped automatically on append/updateRow. Used for future incremental sync.
//   Column positions (1-based): Data_Entry=38, Action Tracker=17, Oil Change LOG=13
//   (Oil Change LOG's column 13 is "Created_Date" — since rows are never
//   edited after being appended, "last modified" and "created" are the same
//   moment for this sheet.)
// ════════════════════════════════════════════════════════════════════════════

var LAST_MODIFIED_COL = {
  "Data_Entry": 38,
  "Action Tracker": 17,
  "Oil Change LOG": 13
};

var DASHBOARD_CACHE_KEY = "dashboard_v4";
var DASHBOARD_CACHE_SECONDS = 300; // 5 minutes


// ─── Entry points ──────────────────────────────────────────────────────────

function doGet(e) {
  var callback = e.parameter.callback || "";
  var action   = e.parameter.action   || "readAll";
  var result;

  try {
    switch (action) {
      case "readAll":
        result = readAll();
        break;
      case "getDashboard":
        result = getDashboard();
        break;
      case "getEquipment":
        result = getEquipmentData(e.parameter.id || "");
        break;
      case "searchEquipment":
        result = searchEquipment(e.parameter.q || "");
        break;
      case "getActions":
        result = getPaginated("Action Tracker", e.parameter.page, e.parameter.limit);
        break;
      case "getOilChanges":
        result = getPaginated("Oil Change LOG", e.parameter.page, e.parameter.limit);
        break;
      case "getOilChangesForLp":
        result = getOilChangesForLp(e.parameter.lpId || "");
        break;
      case "getRecentSamples":
        result = getPaginated("Data_Entry", e.parameter.page, e.parameter.limit, true); // newest first
        break;
      case "getChanges":
        result = getChanges(e.parameter.since || "");
        break;
      case "readEquipmentRegistry":
        result = readEquipmentRegistry();
        break;
      case "test":
        result = { status:"ok", time: new Date().toISOString(), version:"4.0" };
        break;
      default:
        result = { status:"ok", time: new Date().toISOString() };
    }
  } catch (err) {
    result = { error: err.message };
  }

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

function doPost(e) {
  var raw = "";
  try {
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else {
      logError("doPost:no-data", "No post data received", null);
      return jsonOut({status: "error", message: "No post data received"});
    }

    var data = JSON.parse(raw);
    var ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === "append") {
      appendRow(ss, data.sheet, data.row, data.headers);
      invalidateDashboardCache();
      logError("doPost:append:ok", "success", {sheet: data.sheet, row: data.row});
      return jsonOut({status:"ok"});
    }

    if (data.action === "updateSampleTracker") {
      var updateStatus = updateSampleTrackerMonthly(ss, data);
      logError("doPost:updateSampleTracker", updateStatus ? "ok" : "equipment_not_found", data);
      return jsonOut({status: updateStatus ? "ok" : "equipment_not_found"});
    }

    if (data.action === "logOilChangeEvent") {
      var logResult = logOilChangeEvent(ss, data);
      invalidateDashboardCache();
      logError("doPost:logOilChangeEvent", logResult.error || "ok", {lpId: data.lpId});
      return jsonOut(logResult.error ? {status: "error", message: logResult.error} : {status: "ok", eventId: logResult.eventId, nextDueDate: logResult.nextDueDate});
    }

    if (data.action === "updateRow") {
      var ok1 = updateRow(ss, data.sheet, data.matchCols, data.matchValues, data.row);
      invalidateDashboardCache();
      logError("doPost:updateRow", ok1 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues});
      return jsonOut({status: ok1 ? "ok" : "row_not_found"});
    }

    if (data.action === "deleteRow") {
      var ok2 = deleteRow(ss, data.sheet, data.matchCols, data.matchValues);
      invalidateDashboardCache();
      logError("doPost:deleteRow", ok2 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues});
      return jsonOut({status: ok2 ? "ok" : "row_not_found"});
    }

    logError("doPost:unknown-action", "no valid action", data);
    return jsonOut({status:"ok", message: "No valid action specified"});
  } catch(err) {
    logError("doPost:exception", err, {raw: raw});
    return jsonOut({status: "error", message: err.message});
  }
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


// ─── readAll (legacy, full sync — unchanged behaviour) ──────────────────────

function readAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    samples:    readSheet(ss, "Data_Entry",         true),
    actions:    readSheet(ss, "Action Tracker",     true),
    oilChanges: readSheet(ss, "Oil Change LOG",     true), // raw events — client derives current-state-per-LP itself
    tracker:    readSheet(ss, "Oil Sample Tracker", false),
  };
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


// ─── PHASE 7: Dashboard — aggregated counts only, cached 5 minutes ──────────
//
// Returns: { criticalCount, warningCount, normalCount, overdueOilChanges,
//            pendingActions, totalSamples, totalEquipment, lastUpdated, fromCache }
//
// "criticalCount/warningCount/normalCount" reflect the MOST RECENT sample per
// equipment (matches the 3-tier status model used by the Dashboard UI:
// Alert=critical, Caution=warning, Normal=normal).

function getDashboard() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(DASHBOARD_CACHE_KEY);
  if (cached) {
    var parsed = JSON.parse(cached);
    parsed.fromCache = true;
    return parsed;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Samples — col A = equipment code, col D = sample date, col E = report status
  var sampleRows = readSheet(ss, "Data_Entry", true);
  var latestByEquip = {}; // code -> { date, status }
  for (var i = 0; i < sampleRows.length; i++) {
    var r = sampleRows[i];
    var code = r[0];
    if (!code) continue;
    var dateVal = r[3];
    var status = r[4];
    var existing = latestByEquip[code];
    if (!existing || compareDates(dateVal, existing.date) > 0) {
      latestByEquip[code] = { date: dateVal, status: status };
    }
  }
  var criticalCount = 0, warningCount = 0, normalCount = 0;
  Object.keys(latestByEquip).forEach(function(code) {
    var st = (latestByEquip[code].status || "").toString().trim();
    if (st === "Alert") criticalCount++;
    else if (st === "Caution" || st === "Warning") warningCount++;
    else normalCount++;
  });

  // Oil Change LOG is an event log, not a per-point status row — "overdue"
  // has to be derived: take each LP_ID's most recent event and check its
  // own NextDueDate (col L / index 11), computed at log time from that
  // point's Oil_Change_Interval. Points with no logged event yet have no
  // baseline to call overdue against, so they're not counted either way.
  var ocRows = readSheet(ss, "Oil Change LOG", true);
  var latestDueByLp = {};
  for (var j = 0; j < ocRows.length; j++) {
    var evLpId = String(ocRows[j][1] || "").trim();
    if (!evLpId) continue;
    var evDate = ocRows[j][4];
    var existingEv = latestDueByLp[evLpId];
    if (!existingEv || compareDates(evDate, existingEv.date) > 0) {
      latestDueByLp[evLpId] = { date: evDate, due: ocRows[j][11] };
    }
  }
  var overdueOilChanges = 0;
  var nowMs = Date.now();
  Object.keys(latestDueByLp).forEach(function(lp) {
    var due = latestDueByLp[lp].due;
    if (!due) return;
    var d = (due instanceof Date) ? due : new Date(due);
    if (!isNaN(d.getTime()) && d.getTime() < nowMs) overdueOilChanges++;
  });

  // Action Tracker — col J (index 9) = Status, count Open/In Progress/Waiting Stoppage
  var actRows = readSheet(ss, "Action Tracker", true);
  var pendingActions = 0;
  for (var k = 0; k < actRows.length; k++) {
    var astatus = (actRows[k][9] || "").toString().trim();
    if (astatus === "Open" || astatus === "In Progress" || astatus === "Waiting Stoppage") pendingActions++;
  }

  var result = {
    criticalCount: criticalCount,
    warningCount: warningCount,
    normalCount: normalCount,
    overdueOilChanges: overdueOilChanges,
    pendingActions: pendingActions,
    totalSamples: sampleRows.length,
    totalEquipment: Object.keys(latestByEquip).length,
    lastUpdated: new Date().toISOString(),
    fromCache: false
  };

  cache.put(DASHBOARD_CACHE_KEY, JSON.stringify(result), DASHBOARD_CACHE_SECONDS);
  return result;
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


// ─── PHASE 4: getEquipment — single-equipment data only ─────────────────────
//
// Returns: { samples:[...], actions:[...], oilChanges:[...] } filtered to the
// given equipment code (column A match on each sheet).

function getEquipmentData(equipmentId) {
  if (!equipmentId) return { samples: [], actions: [], oilChanges: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = String(equipmentId).trim();

  var samples = readSheet(ss, "Data_Entry", true).filter(function(r) {
    return String(r[0]).trim() === id;
  });
  var actions = readSheet(ss, "Action Tracker", true).filter(function(r) {
    return String(r[1]).trim() === id;
  });
  var oilChanges = readSheet(ss, "Oil Change LOG", true).filter(function(r) {
    return String(r[1]).trim() === id; // col B = LP_ID (col A is EventId now)
  });

  return { samples: samples, actions: actions, oilChanges: oilChanges };
}


// ─── PHASE 6: searchEquipment — top 20 matches from Data_Entry ──────────────
//
// Matches against Equipment Code (col A) or Description (col B), case-insensitive.
// Returns deduplicated equipment codes with their latest sample row.

function searchEquipment(q) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Data_Entry", true);
  var query = String(q || "").trim().toLowerCase();

  var seen = {};
  var results = [];

  for (var i = rows.length - 1; i >= 0 && results.length < 20; i--) {
    var r = rows[i];
    var code = String(r[0] || "");
    var desc = String(r[1] || "");
    if (!code) continue;
    if (query && code.toLowerCase().indexOf(query) === -1 && desc.toLowerCase().indexOf(query) === -1) continue;
    if (seen[code]) continue; // one (most recent) row per equipment
    seen[code] = true;
    results.push(r);
  }

  return { results: results, count: results.length };
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


// ─── PHASE 8: getChanges — incremental sync ─────────────────────────────────
//
// Returns only rows whose "Last Modified" column is newer than `since`
// (an ISO timestamp from the client's last successful sync).
//
// { samples:[...], actions:[...], oilChanges:[...], serverTime, since, fullSyncRequired }
//
// CAVEATS (documented for the client):
//  - Only ADDITIONS and EDITS are detected this way — row DELETIONS are not,
//    since a deleted row has no "Last Modified" value to compare. The client
//    should still run a Full Sync periodically to catch deletions.
//  - Rows created/edited BEFORE the "Last Modified" column was added have no
//    timestamp and are therefore never returned by getChanges — they were
//    already covered by the initial Full Sync.
//  - If `since` is missing/invalid, fullSyncRequired:true is returned and the
//    client should fall back to readAll().

function getChanges(since) {
  var serverTime = new Date().toISOString();
  var sinceDate = since ? new Date(since) : null;

  if (!sinceDate || isNaN(sinceDate.getTime())) {
    return { samples: [], actions: [], oilChanges: [], serverTime: serverTime, since: since || null, fullSyncRequired: true };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    samples:    filterChangedSince(ss, "Data_Entry",     sinceDate),
    actions:    filterChangedSince(ss, "Action Tracker", sinceDate),
    oilChanges: filterChangedSince(ss, "Oil Change LOG", sinceDate),
    serverTime: serverTime,
    since: since,
    fullSyncRequired: false
  };
}

function filterChangedSince(ss, sheetName, sinceDate) {
  var col = LAST_MODIFIED_COL[sheetName];
  if (!col) return []; // sheet not configured for tracking — nothing to report
  var rows = readSheet(ss, sheetName, true);
  var idx = col - 1; // 0-based index within the row array
  return rows.filter(function(r) {
    var v = r[idx];
    if (!v) return false;
    var d = (v instanceof Date) ? v : new Date(v);
    return !isNaN(d.getTime()) && d.getTime() > sinceDate.getTime();
  });
}


// ─── Row matching / update / delete (unchanged from v3) ─────────────────────

function findRowIndex(sheet, matchCols, matchValues, dataStartRow) {
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


// ─── Oil Sample Tracker update (monthly format) ──────────────────────────
// Updates "Oil Sample Tracker" sheet. Layout: col A = Equipment, col B =
// Last sample, col C = interval Days, col D = INTERVAL, col E+ = one column
// per month. Month headers can be plain text ("Sep-26") or real Date cells
// (both exist in this sheet's history) — normalizeMonthHeader() handles
// either so every sample for the same month lands in the SAME column,
// never a new per-day column.
// Cell value: "Normal|26 Sep 2026" (status|date) or just "Normal" (old format)

var MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

function updateSampleTrackerMonthly(ss, data) {
  var sheet = ss.getSheetByName("Oil Sample Tracker");
  if (!sheet) return false;

  var equipCode  = String(data.equipmentCode || "").trim();
  var sampleDate = data.sampleDate || "";
  var status     = data.status || "";
  if (!equipCode) return false;

  var d = new Date(sampleDate);
  if (isNaN(d.getTime())) d = new Date();
  var monthHeader = MONTH_ABBR[d.getMonth()] + "-" + String(d.getFullYear()).slice(-2);

  // Display date e.g. "26 Sep 2026"
  var displayDate = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  var cellValue   = status + "|" + displayDate;

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;

  // Find or create month column (scanning from col B onward — this
  // naturally skips "Last sample" / "interval Days" / "INTERVAL" since
  // none of those normalize to a month).
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var monthCol = -1;
  for (var c = 1; c < headers.length; c++) {
    if (normalizeMonthHeader(headers[c]) === monthHeader) { monthCol = c + 1; break; }
  }
  if (monthCol === -1) {
    monthCol = lastCol + 1;
    sheet.getRange(1, monthCol).setValue(monthHeader);
  }

  // Find equipment row
  var colAVals = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 1).getValues() : [];
  for (var r = 0; r < colAVals.length; r++) {
    if (String(colAVals[r][0]).trim() === equipCode) {
      sheet.getRange(r + 1, 2).setValue(sampleDate);       // Last sample
      sheet.getRange(r + 1, monthCol).setValue(cellValue); // month bucket
      return true;
    }
  }
  // Equipment not found — add new row
  var newRow = lastRow + 1;
  sheet.getRange(newRow, 1).setValue(equipCode);
  sheet.getRange(newRow, 2).setValue(sampleDate);
  sheet.getRange(newRow, monthCol).setValue(cellValue);
  return true;
}

function updateSampleTracker(ss, data) {
  var sheet = ss.getSheetByName("Oil Sample Tracker");
  if (!sheet) return false;

  var vals = sheet.getDataRange().getValues();
  if (vals.length < 1) return false;

  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] && String(vals[i][0]).trim() === String(data.equipmentCode).trim()) {
      sheet.getRange(i + 1, 2).setValue(data.sampleDate);

      var nextCol = 5;
      var lastCol = sheet.getLastColumn();
      while (nextCol <= lastCol && sheet.getRange(1, nextCol).getValue() !== "") {
        nextCol++;
      }

      sheet.getRange(1, nextCol).setValue(data.sampleDate);
      sheet.getRange(i + 1, nextCol).setValue(data.status);
      return true;
    }
  }
  return false;
}

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // Define filter inputs
  var yearCell = "C2";
  var monthCell = "E2";
  var startRow = 6;
  var dateColumn = 5;     // Column E (Sample Date)

  // Trigger if C2 or D2 changes, OR if any cell in the data rows is edited
  if (range.getA1Notation() === yearCell || range.getA1Notation() === monthCell || range.getRow() >= startRow) {

    // Fetch values from both filters
    var selectedYear = sheet.getRange(yearCell).getValue().toString().trim();
    var selectedMonth = sheet.getRange(monthCell).getValue().toString().trim();
    var lastRow = sheet.getLastRow();

    if (lastRow < startRow) return;

    // 1. Unhide everything first to start fresh
    sheet.unhideRow(sheet.getRange(startRow, 1, lastRow - (startRow - 1)));

    // Check if filters are cleared/set to "All"
    var allYears = (selectedYear === "" || selectedYear.toLowerCase() === "all years" || selectedYear.toLowerCase() === "all");
    var allMonths = (selectedMonth === "" || selectedMonth.toLowerCase() === "all months" || selectedMonth.toLowerCase() === "all");

    // 2. If BOTH filters are set to show everything, stop here and leave table wide open
    if (allYears && allMonths) {
      return;
    }

    // 3. Grab all the actual dates from Column E
    var dateValues = sheet.getRange(startRow, dateColumn, lastRow - (startRow - 1), 1).getValues();

    var months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];

    // 4. Loop and evaluate every row
    for (var i = 0; i < dateValues.length; i++) {
      var cellValue = dateValues[i][0];

      if (cellValue instanceof Date) {
        var rowYear = cellValue.getFullYear().toString();
        var rowMonthName = months[cellValue.getMonth()];

        // Conditions to see if a row SHOULD be hidden
        var yearMismatch = (!allYears && rowYear !== selectedYear);
        var monthMismatch = (!allMonths && rowMonthName.toLowerCase() !== selectedMonth.toLowerCase());

        // Hide the row if EITHER the year or the month doesn't match your selection
        if (yearMismatch || monthMismatch) {
          sheet.hideRows(startRow + i);
        }
      }
      // Blank data rows are ignored here, keeping them visible at the bottom!
    }
  }
}


// ─── Equipment Registry read ─────────────────────────────────────────────
//
// STEP 1 REWRITE (see docs/oil-lubrication-migration-notes.md): the
// "Equipment Registry" tab was rebuilt around lubrication points, not
// equipment — one row per LP_ID, and one Equipment_ID can now have several
// LP_ID rows (e.g. a gearbox's left/right sides are two separate points,
// each with its own interval/lubricant). This function returns one object
// PER LP_ID — deliberately not collapsed to one-per-equipment — per the
// confirmed direction: "one row per Lub ID, grouped by equipment" is a
// presentation choice for the consuming pages to make, not something to
// bake into the data layer.
//
// `code` is set to LP_ID, not Equipment_ID: LP_ID is the column every other
// sheet (Data_Entry, Action Tracker, Oil Sample Tracker, Oil Change Log)
// actually joins on — confirmed directly against the live sheet: Data_Entry
// row "LP-111.AF040-GB-R" | "111.AF040 (R)" | ... matches Equipment
// Registry's own "LP-111.AF040-GB-R" | "111.AF040" | "111.AF040 (R)" | ...
// on column A, not column B. The 19 frontend files matching samples/actions
// to a registry entry via `.code` need this to line up, or every lookup
// silently fails.
//
// Row 1 = title (skip), Row 2 = headers (skip), Row 3+ = data.
// Columns: A=LP_ID, B=Equipment_ID, C=Report Equipment ID,
// D=Lubrication_Location, E=Point_Code, F=Lubrication_Point, G=Position,
// H=Area, I=Manufacturer, J=Model, K=Operating_Temperature_C,
// L=Lubricant_Type, M=Lubricant_Brand, N=Lubricant_Quantity_L,
// O=Oil_Analysis_Required, P=Oil_Analysis_Interval, Q=Oil_Change_Interval,
// R=Contractor, S=LP_Status, T=Created_Date, U=Modified_Date
function readEquipmentRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Equipment Registry");
  if (!sheet) return { error: "Sheet 'Equipment Registry' not found", equipment: [] };

  var vals = sheet.getDataRange().getValues();
  if (vals.length <= 2) return { equipment: [] };

  var equipment = [];
  for (var i = 2; i < vals.length; i++) {
    var row = vals[i];
    var lpId = String(row[0] || "").trim();
    if (!lpId) continue;
    var lubricationLocation = String(row[3] || "").trim();
    var lubricationPoint = String(row[5] || "").trim();
    // The new sheet has no "Description" column (the old one did) — synthesized
    // from Lubrication_Location + Lubrication_Point so search/display don't
    // just go blank. Not real replacement data, just the closest available.
    var description = lubricationLocation && lubricationPoint
      ? (lubricationLocation + " — " + lubricationPoint)
      : (lubricationLocation || lubricationPoint);
    equipment.push({
      code:                lpId,
      equipmentId:         String(row[1] || "").trim(),
      reportEquipmentId:   String(row[2] || "").trim(),
      description:         description,
      lubricationLocation: lubricationLocation,
      pointCode:           String(row[4] || "").trim(),
      lubricationPoint:    lubricationPoint,
      position:            String(row[6] || "").trim(),
      area:                String(row[7] || "").trim(),
      manufacturer:        String(row[8] || "").trim(),
      model:               String(row[9] || "").trim(),
      operatingTempC:      String(row[10] || "").trim(),
      lubricant:           String(row[11] || "").trim(),
      lubricantBrand:      String(row[12] || "").trim(),
      lubricantQuantityL:  String(row[13] || "").trim(),
      oilAnalysisRequired: String(row[14] || "").trim(),
      interval:            String(row[15] || "").trim(),
      oilChangeInterval:   String(row[16] || "").trim(),
      contractor:          String(row[17] || "").trim(),
      status:              String(row[18] || "").trim(),
      createdDate:         row[19] || "",
      modifiedDate:        row[20] || "",
    });
  }
  return { equipment: equipment, count: equipment.length };
}


// ─── Oil Change LOG — append-only event write (Step 2) ──────────────────
//
// The sole read/write path for oil-change history. Every save is a NEW
// row — nothing here is ever edited in place, since a change event is a
// historical fact, not mutable "current state" (that's what the old
// "Oil Change Log" sheet used to be; it no longer exists — see the header
// comment). "Oil Last Change" is a separate, formula-only viewer sheet this
// backend deliberately never reads or writes.
//
// NextDueDate is computed HERE, server-side, from the lubrication point's
// own Oil_Change_Interval (Equipment Registry column Q) — never trusted
// from the client — so it can't drift from what the registry says the
// real interval is.
function logOilChangeEvent(ss, data) {
  var lpId = String(data.lpId || "").trim();
  if (!lpId) return { error: "lpId is required" };

  var eventDate = data.eventDate ? new Date(data.eventDate) : new Date();
  if (isNaN(eventDate.getTime())) return { error: "eventDate is invalid" };

  var reg = findRegistryEntryForOilChange_(ss, lpId);
  var months = intervalMonthsForOilChange_(reg ? reg.oilChangeInterval : "");
  var nextDueDate = months ? addMonths_(eventDate, months) : "";

  var eventId = "EVT-" + Utilities.getUuid();
  var row = [
    eventId,
    lpId,
    data.routineItemId || "",
    data.eventType || "Change",
    eventDate,
    data.quantityUsed || (reg ? reg.lubricantQuantityL : "") || "",
    data.oilBrandType || (reg ? oilBrandTypeFor_(reg) : "") || "",
    data.doneBy || "",
    data.contractor || (reg ? reg.contractor : "") || "",
    data.conditionNotes || "",
    data.photoUrl || "",
    nextDueDate,
    "", // Created_Date — filled by appendRow's own stampLastModified, same as every other tracked sheet
  ];
  appendRow(ss, "Oil Change LOG", row);
  return { status: "ok", eventId: eventId, nextDueDate: nextDueDate instanceof Date ? nextDueDate.toISOString() : nextDueDate };
}

function oilBrandTypeFor_(reg) {
  return reg.lubricantBrand ? (reg.lubricant + " / " + reg.lubricantBrand) : reg.lubricant;
}

// Minimal Equipment Registry lookup by LP_ID — scoped to just the fields
// logOilChangeEvent needs, not the full readEquipmentRegistry() shape.
function findRegistryEntryForOilChange_(ss, lpId) {
  var sheet = ss.getSheetByName("Equipment Registry");
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  for (var i = 2; i < vals.length; i++) {
    if (String(vals[i][0] || "").trim() === lpId) {
      return {
        lubricant:          String(vals[i][11] || "").trim(),
        lubricantBrand:     String(vals[i][12] || "").trim(),
        lubricantQuantityL: String(vals[i][13] || "").trim(),
        oilChangeInterval:  String(vals[i][16] || "").trim(),
        contractor:         String(vals[i][17] || "").trim(),
      };
    }
  }
  return null;
}

// Mirrors the frontend's own intervalMonths() in parsers.js — keep both in
// sync if Oil_Change_Interval's text format ever changes. Handles "2 Y" /
// "0.5 Y" (the real format) and blank/"As needed" (no fixed interval, so no
// NextDueDate is set).
function intervalMonthsForOilChange_(freqText) {
  var t = String(freqText || "").trim().toLowerCase();
  if (!t || t === "as needed" || t === "if needed") return null;
  var m = t.match(/^([\d.]+)\s*y$/);
  if (m) return Math.round(parseFloat(m[1]) * 12);
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function addMonths_(date, months) {
  var d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// All Oil Change LOG events for one LP_ID, newest first — backs both the
// write-verification read in api.js and an eventual per-point history view.
function getOilChangesForLp(lpId) {
  var id = String(lpId || "").trim();
  if (!id) return { events: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Change LOG", true).filter(function(r) {
    return String(r[1] || "").trim() === id;
  });
  return { events: rows.slice().reverse(), count: rows.length };
}

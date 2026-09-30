// Aggregated reads: the dashboard summary, equipment lookup/search, the legacy
// readAll() full sync, and incremental getChanges(). Split out of the old
// monolithic Code.js (see docs/oil-lubrication-migration-notes.md).



// ─── readAll (legacy, full sync — unchanged behaviour) ──────────────────────

function readAll(scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    samples:    filterRowsByLpContractor_(readSheet(ss, "Data_Entry", true), 0, scope),
    actions:    filterRowsByLpContractor_(readSheet(ss, "Action Tracker", true), 1, scope),
    oilChanges: filterRowsByLpContractor_(readSheet(ss, "Oil Change LOG", true), 1, scope), // raw events — client derives current-state-per-LP itself
    tracker:    filterTrackerRowsByLpContractor_(readSheet(ss, "Oil Sample Tracker", false), scope),
  };
}



// ─── PHASE 7: Dashboard — aggregated counts only, cached 5 minutes ──────────
//
// Returns: { criticalCount, warningCount, normalCount, overdueOilChanges,
//            pendingActions, totalSamples, totalEquipment, lastUpdated, fromCache }
//
// "criticalCount/warningCount/normalCount" reflect the MOST RECENT sample per
// equipment (matches the 3-tier status model used by the Dashboard UI:
// Alert=critical, Caution=warning, Normal=normal).

// scope (nullable — see Rbac.js#getContractorScope_) confines every count
// below to that contractor's own equipment. Cache key includes it: the
// unscoped/ACC view and each contractor's own view are genuinely different
// numbers, so they can't share one cache entry — see
// invalidateDashboardCache's own comment for the matching clear-all logic.
function getDashboard(scope) {
  var cacheKey = DASHBOARD_CACHE_KEY + (scope ? (":" + scope) : "");
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    var parsed = JSON.parse(cached);
    parsed.fromCache = true;
    return parsed;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lpMap = scope ? getLpContractorMap_() : null;
  function inScope(lpId) {
    return !scope || lpMap[String(lpId || "").trim()] === scope;
  }

  // Samples — col A = LP_ID (equipment code — unaffected by the Report
  // Equipment ID column inserted at B), col E = sample date, col F = report
  // status (both shifted +1 by that insertion — see docs/oil-lubrication-
  // migration-notes.md Step 3).
  var sampleRows = readSheet(ss, "Data_Entry", true);
  var latestByEquip = {}; // code -> { date, status }
  for (var i = 0; i < sampleRows.length; i++) {
    var r = sampleRows[i];
    var code = r[0];
    if (!code || !inScope(code)) continue;
    var dateVal = r[4];
    var status = r[5];
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
    if (!evLpId || !inScope(evLpId)) continue;
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

  // Action Tracker — col K (index 10) = Status, count Open/In Progress/Waiting Stoppage
  // (shifted from index 9 — see docs/oil-lubrication-migration-notes.md Step 3)
  var actRows = readSheet(ss, "Action Tracker", true);
  var pendingActions = 0;
  for (var k = 0; k < actRows.length; k++) {
    if (!inScope(actRows[k][1])) continue;
    var astatus = (actRows[k][10] || "").toString().trim();
    if (astatus === "Open" || astatus === "In Progress" || astatus === "Waiting Stoppage") pendingActions++;
  }

  var scopedSampleCount = scope ? sampleRows.filter(function (r) { return inScope(r[0]); }).length : sampleRows.length;

  var result = {
    criticalCount: criticalCount,
    warningCount: warningCount,
    normalCount: normalCount,
    overdueOilChanges: overdueOilChanges,
    pendingActions: pendingActions,
    totalSamples: scopedSampleCount,
    totalEquipment: Object.keys(latestByEquip).length,
    lastUpdated: new Date().toISOString(),
    fromCache: false
  };

  cache.put(cacheKey, JSON.stringify(result), DASHBOARD_CACHE_SECONDS);
  return result;
}



// ─── PHASE 4: getEquipment — single-equipment data only ─────────────────────
//
// Returns: { samples:[...], actions:[...], oilChanges:[...] } filtered to the
// given equipment code (column A match on each sheet).

function getEquipmentData(equipmentId, scope) {
  if (!equipmentId) return { samples: [], actions: [], oilChanges: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var id = String(equipmentId).trim();

  // equipmentId here IS the LP_ID (see EquipmentRegistry.js's file
  // comment) — a scoped caller asking for one outside their own
  // contractor gets treated as not found, same as a bad id would.
  if (scope && getLpContractorMap_()[id] !== scope) {
    return { samples: [], actions: [], oilChanges: [] };
  }

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
// Matches against Equipment Code (col A) or Description (col C), case-insensitive.
// Returns deduplicated equipment codes with their latest sample row.

function searchEquipment(q, scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Data_Entry", true);
  var query = String(q || "").trim().toLowerCase();
  var lpMap = scope ? getLpContractorMap_() : null;

  var seen = {};
  var results = [];

  for (var i = rows.length - 1; i >= 0 && results.length < 20; i--) {
    var r = rows[i];
    var code = String(r[0] || "");
    var desc = String(r[2] || ""); // col C — col B is now Report Equipment ID
    if (!code) continue;
    if (scope && lpMap[code] !== scope) continue;
    if (query && code.toLowerCase().indexOf(query) === -1 && desc.toLowerCase().indexOf(query) === -1) continue;
    if (seen[code]) continue; // one (most recent) row per equipment
    seen[code] = true;
    results.push(r);
  }

  return { results: results, count: results.length };
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

function getChanges(since, scope) {
  var serverTime = new Date().toISOString();
  var sinceDate = since ? new Date(since) : null;

  if (!sinceDate || isNaN(sinceDate.getTime())) {
    return { samples: [], actions: [], oilChanges: [], serverTime: serverTime, since: since || null, fullSyncRequired: true };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    samples:    filterRowsByLpContractor_(filterChangedSince(ss, "Data_Entry", sinceDate), 0, scope),
    actions:    filterRowsByLpContractor_(filterChangedSince(ss, "Action Tracker", sinceDate), 1, scope),
    oilChanges: filterRowsByLpContractor_(filterChangedSince(ss, "Oil Change LOG", sinceDate), 1, scope),
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

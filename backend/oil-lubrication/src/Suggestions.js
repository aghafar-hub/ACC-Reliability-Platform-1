// Phase 3 — saved Suggestions.
//
// A submitted action (Open / Waiting Stoppage) whose Agreed Action contains
// Change Oil, Top Up the Oil, Sample or Resample gets a saved Suggestion per
// work type, holding the reason, lubrication point, source action and
// required date (the action's Due Date). It replaces the old automatic route
// creation: an engineer picks the Suggestion while creating a route, and it
// is marked "Converted" with the route's id, so action, suggestion and route
// stay linked.
//
//  - One active (Open) suggestion per lubrication point + work type: a
//    second action asking for the same thing on the same point doesn't add
//    a duplicate.
//  - Editing the agreed action updates or removes a suggestion that hasn't
//    become a route yet. If the route already exists it's left as it is and
//    the contractor's engineers are told.
//  - A Draft or Closed action has no open suggestions (a Closed action's
//    unconverted ones are removed). Cancelling or deleting the route puts
//    its suggestion back to Open.
//
// OL_SUGGESTIONS columns: 0 SuggestionId, 1 LP_ID, 2 WorkType, 3 RouteType,
// 4 Reason, 5 SourceAcNo, 6 Contractor, 7 RequiredDate, 8 Status
// (Open/Converted/Removed), 9 RoutineId, 10 AgreedAction (snapshot, to spot
// later edits), 11 CreatedDate, 12 CreatedBy, 13 ModifiedDate.

var SUGGESTION_SHEET = "OL_SUGGESTIONS";
var SUGGESTION_HEADERS = ["SuggestionId", "LP_ID", "WorkType", "RouteType", "Reason", "SourceAcNo", "Contractor",
  "RequiredDate", "Status", "RoutineId", "AgreedAction", "CreatedDate", "CreatedBy", "ModifiedDate"];
var SUGGESTION_STATUS = { OPEN: "Open", CONVERTED: "Converted", REMOVED: "Removed" };
var SUGGESTION_WORK = [
  { workType: "Oil Change", routeType: "Oil Change", test: /change\s*(the\s*)?oil|oil\s*change/i },
  { workType: "Top Up", routeType: "Emergency Top Up", test: /top\s*-?\s*up/i },
  { workType: "Sampling", routeType: "Sampling", test: /re-?sampl|\bsampl/i }
];

function suggestionSheet_(ss) {
  var sheet = ss.getSheetByName(SUGGESTION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUGGESTION_SHEET);
    sheet.appendRow(SUGGESTION_HEADERS);
  }
  return sheet;
}

function suggestionWorkTypes_(agreed) {
  var text = String(agreed || "");
  return SUGGESTION_WORK.filter(function (w) { return w.test.test(text); });
}

function readSuggestionRows_(ss) {
  var sheet = ss.getSheetByName(SUGGESTION_SHEET);
  if (!sheet) return [];
  var vals = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0] || "").trim()) continue;
    out.push({ rowIdx: i + 1, row: vals[i] });
  }
  return out;
}

function suggestionToObject_(row) {
  var due = row[7] instanceof Date ? row[7] : (row[7] ? new Date(row[7]) : null);
  return {
    suggestionId: String(row[0] || ""),
    lpId: String(row[1] || ""),
    workType: String(row[2] || ""),
    routeType: String(row[3] || ""),
    reason: String(row[4] || ""),
    sourceAcNo: String(row[5] || ""),
    contractor: String(row[6] || ""),
    requiredDate: due && !isNaN(due.getTime()) ? due.toISOString() : "",
    status: String(row[8] || ""),
    routineId: String(row[9] || ""),
    createdDate: row[11] instanceof Date ? row[11].toISOString() : String(row[11] || "")
  };
}

// GET getSuggestions — Open ones (and, with all=1, the rest too), scoped to
// the caller's contractor.
function getSuggestions(scope, all) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = readSuggestionRows_(ss)
    .map(function (x) { return suggestionToObject_(x.row); })
    .filter(function (s) {
      if (scope && s.contractor !== scope) return false;
      return all ? true : s.status === SUGGESTION_STATUS.OPEN;
    });
  return { suggestions: list, count: list.length };
}

function setSuggestionCells_(sheet, rowIdx, values) {
  Object.keys(values).forEach(function (col) {
    sheet.getRange(rowIdx, Number(col) + 1).setValue(values[col]);
  });
  sheet.getRange(rowIdx, 14).setValue(new Date());
}

// Keeps an action's suggestions in step with its status and Agreed Action.
// Call after any write to the action.
function syncSuggestionsForAction_(ss, acNo, lpId, actingUser) {
  acNo = String(acNo || "").trim();
  lpId = String(lpId || "").trim();
  if (!acNo || !lpId) return;
  var found = findActionRow_(ss, acNo, lpId);
  if (found.error) return;
  var row = found.row;
  var status = normActionStatus_(row[ACTION_COL.STATUS]);
  var agreed = String(row[ACTION_COL.AGREED] || "").trim();
  var active = status === ACTION_STATUS.OPEN || status === ACTION_STATUS.WAITING || status === ACTION_STATUS.CLOSURE_REQUESTED;
  var keepAsIs = status === ACTION_STATUS.CLOSURE_REQUESTED;
  var wanted = active ? suggestionWorkTypes_(agreed) : [];
  var contractor = actionContractor_(row);
  var due = asDate_(row[ACTION_COL.DUE_DATE]) || new Date();
  var reason = "Action " + acNo + ": " + agreed;

  var all = readSuggestionRows_(ss);
  var mine = all.filter(function (x) {
    return String(x.row[5] || "").trim() === acNo && String(x.row[1] || "").trim() === lpId &&
      String(x.row[8] || "") !== SUGGESTION_STATUS.REMOVED;
  });
  if (!mine.length && !wanted.length) return;
  var sheet = suggestionSheet_(ss);
  var changedRoutes = [];

  mine.forEach(function (x) {
    var stillWanted = wanted.some(function (w) { return w.workType === x.row[2]; });
    var st = String(x.row[8] || "");
    if (st === SUGGESTION_STATUS.OPEN) {
      if (keepAsIs) return;
      if (!stillWanted) {
        setSuggestionCells_(sheet, x.rowIdx, { 8: SUGGESTION_STATUS.REMOVED });
      } else if (String(x.row[10] || "") !== agreed || !sameDay_(x.row[7], due)) {
        var upd = {}; upd[4] = reason; upd[7] = due; upd[10] = agreed;
        setSuggestionCells_(sheet, x.rowIdx, upd);
      }
    } else if (st === SUGGESTION_STATUS.CONVERTED && String(x.row[10] || "") !== agreed) {
      // Route already made: leave it, tell the contractor's engineers once
      // per edit, and remember the new text.
      changedRoutes.push(String(x.row[9] || ""));
      var snap = {}; snap[10] = agreed;
      setSuggestionCells_(sheet, x.rowIdx, snap);
    }
  });

  if (!keepAsIs) {
    wanted.forEach(function (w) {
      var have = mine.some(function (x) { return x.row[2] === w.workType && String(x.row[8]) !== SUGGESTION_STATUS.REMOVED; });
      if (have) return;
      // one active suggestion per point + work type
      var duplicate = all.some(function (x) {
        return String(x.row[1] || "").trim() === lpId && x.row[2] === w.workType && String(x.row[8]) === SUGGESTION_STATUS.OPEN;
      });
      if (duplicate) return;
      sheet.appendRow(["SG-" + Utilities.getUuid(), lpId, w.workType, w.routeType, reason, acNo, contractor, due,
        SUGGESTION_STATUS.OPEN, "", agreed, new Date(), actingUser || "", new Date()]);
    });
  }

  if (changedRoutes.length) {
    try {
      var engineers = contractor ? maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor) : [];
      var msg = "The agreed action of " + acNo + " (" + lpId + ") changed to \"" + (agreed || "nothing") +
        "\" after route " + changedRoutes.join(", ") + " was made. The route was left unchanged — please check it.";
      recordInAppNotificationForEach_(ss, engineers, "agreed-action-changed", msg, contractor, "routines", changedRoutes[0]);
      if (engineers.length) sendNotificationEmail_({ to: engineers.join(","), subject: "Oil Lubrication: agreed action changed after route — " + acNo, body: msg });
    } catch (e) {
      logError("syncSuggestionsForAction_:notify", e, { acNo: acNo });
    }
  }
}

// Route created from suggestions: mark them Converted, linked to the route.
// Returns the ids actually converted (Open ones on the route's points).
function convertSuggestions_(ss, suggestionIds, routineId, lpIds) {
  var ids = (suggestionIds || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
  if (!ids.length) return [];
  var sheet = ss.getSheetByName(SUGGESTION_SHEET);
  if (!sheet) return [];
  var done = [];
  readSuggestionRows_(ss).forEach(function (x) {
    var id = String(x.row[0] || "").trim();
    if (ids.indexOf(id) === -1) return;
    if (String(x.row[8]) !== SUGGESTION_STATUS.OPEN) return;
    if (lpIds && lpIds.indexOf(String(x.row[1] || "").trim()) === -1) return;
    var cells = {}; cells[8] = SUGGESTION_STATUS.CONVERTED; cells[9] = routineId;
    setSuggestionCells_(sheet, x.rowIdx, cells);
    done.push(id);
  });
  return done;
}

// Route cancelled or deleted: its suggestions become Open again.
function reopenSuggestionsForRoutine_(ss, routineId) {
  var sheet = ss.getSheetByName(SUGGESTION_SHEET);
  if (!sheet || !routineId) return;
  readSuggestionRows_(ss).forEach(function (x) {
    if (String(x.row[9] || "") !== routineId || String(x.row[8]) !== SUGGESTION_STATUS.CONVERTED) return;
    var cells = {}; cells[8] = SUGGESTION_STATUS.OPEN; cells[9] = "";
    setSuggestionCells_(sheet, x.rowIdx, cells);
  });
}

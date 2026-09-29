// Routine workflow: create / submit item / submit / approve / comment, and
// reading ROUTINES + OA_ROUTINE_ITEMS. Split out of the old monolithic
// Code.js (see docs/oil-lubrication-migration-notes.md).



// ─── Routines (Step 4) ────────────────────────────────────────────────────
//
// ROUTINES columns: 0 RoutineId, 1 CreatedBy, 2 AssignedTo, 3 Contractor,
// 4 CreatedDate, 5 Status, 6 SubmittedDate, 7 ApprovedBy, 8 ApprovedDate,
// 9 ACC_Comment, 10 ACC_CommentBy, 11 ACC_CommentDate.
// OA_ROUTINE_ITEMS columns: 0 RoutineItemId, 1 RoutineId, 2 LP_ID,
// 3 ItemType, 4 RequiredOilType, 5 Implemented, 6 NotImplementedReason,
// 7 ActualDate, 8 ActualQuantity, 9 SampleTaken, 10 CreatedDate,
// 11 ModifiedDate. Both sheets have a plain header at row 1, data at row
// 2+ (dataStartRowFor's standard default already covers them).
//
// The client generates RoutineId/RoutineItemId itself (not this backend) —
// unlike logOilChangeEvent's server-generated EventId, createRoutine needs
// to write BOTH the routine row and its item rows as one logical unit, and
// a client-supplied id makes write-verification exact (find by id) instead
// of guessing "the newest matching routine", which isn't safe if two get
// created around the same time.

// Progress (items done / total) per routine, so the list can show it
// without an N+1 fetch (one getRoutineItems call per routine) — reads
// OA_ROUTINE_ITEMS once here and appends two columns (ItemsTotal,
// ItemsDone) to each ROUTINES row instead.
function getRoutines() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "ROUTINES", true);
  var itemRows = readSheet(ss, "OA_ROUTINE_ITEMS", true);
  var counts = {}; // routineId -> { total, done }
  for (var i = 0; i < itemRows.length; i++) {
    var routineId = String(itemRows[i][1] || "").trim();
    if (!routineId) continue;
    if (!counts[routineId]) counts[routineId] = { total: 0, done: 0 };
    counts[routineId].total++;
    if (String(itemRows[i][5] || "").trim() === "Yes") counts[routineId].done++;
  }
  var enriched = rows.map(function(r) {
    var c = counts[String(r[0] || "").trim()] || { total: 0, done: 0 };
    return r.concat([c.total, c.done]);
  });
  return { routines: enriched, count: enriched.length };
}


function getRoutineItems(routineId) {
  var id = String(routineId || "").trim();
  if (!id) return { items: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "OA_ROUTINE_ITEMS", true).filter(function(r) {
    return String(r[1] || "").trim() === id;
  });
  return { items: rows, count: rows.length };
}


function createRoutine(ss, data) {
  var routineId = String(data.routineId || "").trim();
  if (!routineId) return { error: "routineId is required" };
  var assignedTo = String(data.assignedTo || "").trim();
  if (!assignedTo) return { error: "assignedTo is required" };
  var items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return { error: "At least one lubrication point is required" };

  var now = new Date();
  var routineRow = [
    routineId,
    data.createdBy || "",
    assignedTo,
    data.contractor || "",
    now,
    "Assigned",
    "", // SubmittedDate
    "", // ApprovedBy
    "", // ApprovedDate
    "", // ACC_Comment
    "", // ACC_CommentBy
    "", // ACC_CommentDate
  ];
  appendRow(ss, "ROUTINES", routineRow);

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var itemRow = [
      item.routineItemId || ("RI-" + Utilities.getUuid()),
      routineId,
      item.lpId || "",
      item.itemType || "Change",
      item.requiredOilType || "",
      "", // Implemented
      "", // NotImplementedReason
      "", // ActualDate
      "", // ActualQuantity
      "", // SampleTaken
      now,
      "", // ModifiedDate — filled by appendRow's stampLastModified
    ];
    appendRow(ss, "OA_ROUTINE_ITEMS", itemRow);
  }

  return { status: "ok", routineId: routineId };
}


function submitRoutineItem(ss, data) {
  var routineItemId = String(data.routineItemId || "").trim();
  if (!routineItemId) return { error: "routineItemId is required" };
  var sheet = ss.getSheetByName("OA_ROUTINE_ITEMS");
  if (!sheet) return { error: "OA_ROUTINE_ITEMS sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [routineItemId], dataStartRowFor("OA_ROUTINE_ITEMS"));
  if (rowIdx === -1) return { error: "Routine item not found" };

  sheet.getRange(rowIdx, 6).setValue(data.implemented ? "Yes" : "No");
  sheet.getRange(rowIdx, 7).setValue(data.notImplementedReason || "");
  sheet.getRange(rowIdx, 8).setValue(data.actualDate || new Date());
  sheet.getRange(rowIdx, 9).setValue(data.actualQuantity || "");
  sheet.getRange(rowIdx, 10).setValue(data.sampleTaken ? "Yes" : "No");
  stampLastModified(sheet, "OA_ROUTINE_ITEMS", rowIdx);

  // The frontend's Routines list already has an "InProgress" status/badge,
  // but nothing ever set it — a routine sat as "Assigned" no matter how much
  // of its checklist was done, until the whole thing was Submitted. Flip it
  // the first time any item on it is saved, so the list reflects reality.
  var routineId = String(sheet.getRange(rowIdx, 2).getValue() || "").trim();
  if (routineId) {
    var routinesSheet = ss.getSheetByName("ROUTINES");
    if (routinesSheet) {
      var rIdx = findRowIndex(routinesSheet, [0], [routineId], dataStartRowFor("ROUTINES"));
      if (rIdx !== -1) {
        var currentStatus = String(routinesSheet.getRange(rIdx, 6).getValue() || "").trim();
        if (currentStatus === "Assigned") {
          routinesSheet.getRange(rIdx, 6).setValue("InProgress");
        }
      }
    }
  }
  return { status: "ok" };
}


function submitRoutine(ss, data) {
  var routineId = String(data.routineId || "").trim();
  if (!routineId) return { error: "routineId is required" };
  var sheet = ss.getSheetByName("ROUTINES");
  if (!sheet) return { error: "ROUTINES sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [routineId], dataStartRowFor("ROUTINES"));
  if (rowIdx === -1) return { error: "Routine not found" };
  sheet.getRange(rowIdx, 6).setValue("Submitted");
  sheet.getRange(rowIdx, 7).setValue(new Date());
  return { status: "ok" };
}


function approveRoutine(ss, data) {
  var routineId = String(data.routineId || "").trim();
  if (!routineId) return { error: "routineId is required" };
  var sheet = ss.getSheetByName("ROUTINES");
  if (!sheet) return { error: "ROUTINES sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [routineId], dataStartRowFor("ROUTINES"));
  if (rowIdx === -1) return { error: "Routine not found" };
  sheet.getRange(rowIdx, 6).setValue("Approved");
  sheet.getRange(rowIdx, 8).setValue(data.approvedBy || "");
  sheet.getRange(rowIdx, 9).setValue(new Date());
  return { status: "ok" };
}


function addRoutineComment(ss, data) {
  var routineId = String(data.routineId || "").trim();
  if (!routineId) return { error: "routineId is required" };
  var sheet = ss.getSheetByName("ROUTINES");
  if (!sheet) return { error: "ROUTINES sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [routineId], dataStartRowFor("ROUTINES"));
  if (rowIdx === -1) return { error: "Routine not found" };
  sheet.getRange(rowIdx, 10).setValue(data.commentText || "");
  sheet.getRange(rowIdx, 11).setValue(data.commentBy || "");
  sheet.getRange(rowIdx, 12).setValue(new Date());
  return { status: "ok" };
}

// Oil Inventory product registry + movement log (Step 5). Split out of the
// old monolithic Code.js (see docs/oil-lubrication-migration-notes.md).



// ─── Oil Inventory (Step 5) ────────────────────────────────────────────────
//
// "Oil Inventory" columns: 0 Product_ID, 1 Lubricant_Type, 2 Lubricant_Brand,
// 3 Container_Type, 4 Container_Size_L, 5 Unit, 6 Current_Stock (SHEET
// FORMULA — never written here), 7 Recorder_Level, 8 Storage_Location,
// 9 Supplier, 10 Unit_Cost, 11 Status, 12 Last_Movement_Date (SHEET FORMULA
// — never written here), 13 Notes, 14 Created_Date, 15 Modified_Date,
// 16 Contractor (RBAC Increment 5c — appended as a NEW LAST column rather
// than inserted earlier, so the two sheet formulas above and every
// existing 0-based index in this file keep working unchanged; add a
// "Contractor" header in the live sheet's column Q). Stock is owned by
// the contractor, not shared ACC-wide (confirmed directly by the user) —
// set once at creation (addOilProduct, forced to the creator's own scope)
// and not editable afterward via updateOilProduct, same as equipment
// reassignment being a separate, deliberate action rather than a normal
// edit.
// "Oil Inventory LOG" columns: 0 MovementId, 1 Product_ID, 2 MovementType
// ("Receipt"|"Issue"|"Adjustment"), 3 Quantity (always positive for
// Receipt/Issue; signed +/- for Adjustment — see the Current_Stock formula
// on the Oil Inventory tab), 4 MovementDate, 5 LinkedLP_ID, 6 LinkedEventId,
// 7 Contractor, 8 DoneBy, 9 Reference, 10 Notes, 11 Created_Date. Both
// sheets: header row 1, data row 2+ (dataStartRowFor's standard default).

function getOilInventory(scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Inventory", true);
  if (scope) rows = rows.filter(function (r) { return String(r[16] || "").trim() === scope; });
  return { products: rows, count: rows.length };
}


// For contractor-scope checks on an action targeting an existing product
// (edit, log a movement, read its movement history).
function getProductContractor_(productId) {
  var id = String(productId || "").trim();
  if (!id) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Inventory", true);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === id) return String(rows[i][16] || "").trim();
  }
  return null;
}


function getOilInventoryMovements(productId, scope) {
  var id = String(productId || "").trim();
  if (!id) return { movements: [] };
  if (scope && getProductContractor_(id) !== scope) return { movements: [], count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Inventory LOG", true).filter(function(r) {
    return String(r[1] || "").trim() === id;
  });
  return { movements: rows.slice().reverse(), count: rows.length };
}


function addOilProduct(ss, data) {
  var productId = String(data.productId || "").trim();
  if (!productId) return { error: "productId is required" };
  var row = [
    productId,
    data.lubricantType || "",
    data.lubricantBrand || "",
    data.containerType || "",
    data.containerSizeL || "",
    data.unit || "L",
    "", // Current_Stock — sheet formula; copy it down from the row above after this appends
    data.recorderLevel || "",
    data.storageLocation || "",
    data.supplier || "",
    data.unitCost || "",
    data.status || "Active",
    "", // Last_Movement_Date — sheet formula, same as above
    data.notes || "",
    new Date(),
    "", // Modified_Date — filled by appendRow's stampLastModified
    data.contractor || "", // Contractor — see the column-16 comment above; Code.js forces this to the caller's own scope
  ];
  appendRow(ss, "Oil Inventory", row);
  return { status: "ok", productId: productId };
}


function updateOilProduct(ss, data) {
  var productId = String(data.productId || "").trim();
  if (!productId) return { error: "productId is required" };
  var sheet = ss.getSheetByName("Oil Inventory");
  if (!sheet) return { error: "Oil Inventory sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [productId], dataStartRowFor("Oil Inventory"));
  if (rowIdx === -1) return { error: "Product not found" };

  // Every editable column EXCEPT Current_Stock (col 7) and Last_Movement_Date
  // (col 13) — those are sheet formulas; writing to them here would replace
  // the formula with a static value and break it.
  sheet.getRange(rowIdx, 2).setValue(data.lubricantType || "");
  sheet.getRange(rowIdx, 3).setValue(data.lubricantBrand || "");
  sheet.getRange(rowIdx, 4).setValue(data.containerType || "");
  sheet.getRange(rowIdx, 5).setValue(data.containerSizeL || "");
  sheet.getRange(rowIdx, 6).setValue(data.unit || "");
  sheet.getRange(rowIdx, 8).setValue(data.recorderLevel || "");
  sheet.getRange(rowIdx, 9).setValue(data.storageLocation || "");
  sheet.getRange(rowIdx, 10).setValue(data.supplier || "");
  sheet.getRange(rowIdx, 11).setValue(data.unitCost || "");
  sheet.getRange(rowIdx, 12).setValue(data.status || "");
  sheet.getRange(rowIdx, 14).setValue(data.notes || "");
  stampLastModified(sheet, "Oil Inventory", rowIdx);
  return { status: "ok" };
}


function logOilMovement(ss, data) {
  var productId = String(data.productId || "").trim();
  if (!productId) return { error: "productId is required" };
  var movementType = data.movementType || "";
  if (["Receipt", "Issue", "Adjustment"].indexOf(movementType) === -1) {
    return { error: "movementType must be Receipt, Issue, or Adjustment" };
  }
  var quantity = parseFloat(data.quantity);
  if (isNaN(quantity)) return { error: "quantity is required" };

  var movementId = "MV-" + Utilities.getUuid();
  var row = [
    movementId,
    productId,
    movementType,
    quantity,
    data.movementDate ? new Date(data.movementDate) : new Date(),
    data.linkedLpId || "",
    data.linkedEventId || "",
    data.contractor || "",
    data.doneBy || "",
    data.reference || "",
    data.notes || "",
    "", // Created_Date — filled by appendRow's stampLastModified
  ];
  appendRow(ss, "Oil Inventory LOG", row);
  return { status: "ok", movementId: movementId };
}

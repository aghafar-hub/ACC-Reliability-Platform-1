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
// 17 EquivalentToType, 18 EquivalentToBrand (Patch 8, plant-readiness
// pass — add "EquivalentToType"/"EquivalentToBrand" headers to the live
// sheet's columns R/S). Blank for a product that exactly matches its
// equipment's own registered spec. Set when the market no longer carries
// the original brand and a Contractor Engineer has declared THIS product
// as what they're actually using instead — e.g. EquivalentToType="Shell
// Gadus S2 V220", EquivalentToBrand="Shell" on a Mobilgrease product,
// meaning "treat me as filling that role." Unlike Contractor, these ARE
// editable after creation via updateOilProduct — correcting a declared
// equivalence (or the market situation changing again) is an ordinary
// edit, not the once-only deliberate action Contractor reassignment is.
// See findInventoryProductRow_ for how this is actually used: a simple
// pairing (this product replaces ONE original spec, not a group of
// several interchangeable brands), declarable by any Contractor Engineer
// for their own contractor's stock, no ACC approval needed — confirmed
// directly by the user.
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


// ─── Consumption forecast ───────────────────────────────────────────────
//
// Projects how much of each oil (Lubricant_Type + Brand, per contractor)
// will be needed over the next `months`, so it can be compared against
// current stock before it runs out. Every LP with a registered interval
// contributes something — "registry intervals x quantity," the baseline
// the user asked for — refined with real history where it exists:
//  1. Has a logged Oil Change LOG event: precise — walk forward from its
//     own last change by its own interval, counting every occurrence
//     that falls within the window (so a short-interval LP can
//     contribute more than once).
//  2. No logged event yet (the normal case for most real equipment today
//     — this log only fills in as changes get logged going forward): a
//     steady-state rate estimate, months / intervalMonths — fractional
//     on purpose (a 6-month interval over a 3-month window is 0.5 of a
//     change), since there's no history to say exactly when in its cycle
//     the LP currently is.
//  3. No usable interval at all, but an open ("Assigned"/"InProgress")
//     Oil Change routine item already targets it: counts once — known,
//     scheduled demand neither of the above would otherwise see.
// An LP with none of the three contributes nothing.
function getOilInventoryForecast(monthsParam, scope) {
  var months = Math.max(1, parseInt(monthsParam, 10) || 3);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + months);

  var registryRows = readEquipmentRegistry().equipment;

  var ocRows = readSheet(ss, "Oil Change LOG", true);
  var lastEventByLp = {};
  ocRows.forEach(function (r) {
    var lpId = String(r[1] || "").trim();
    if (!lpId) return;
    var d = r[4] instanceof Date ? r[4] : new Date(r[4]);
    if (isNaN(d.getTime())) return;
    var prev = lastEventByLp[lpId];
    if (!prev || d.getTime() > prev.getTime()) lastEventByLp[lpId] = d;
  });

  var routineRows = readSheet(ss, "ROUTINES", true);
  var openOilChangeRoutineIds = {};
  routineRows.forEach(function (r) {
    var status = String(r[5] || "").trim();
    var routeType = String(r[13] || "").trim();
    if ((status === "Assigned" || status === "InProgress") && routeType === "Oil Change") {
      openOilChangeRoutineIds[String(r[0] || "").trim()] = true;
    }
  });
  var itemRows = readSheet(ss, "OA_ROUTINE_ITEMS", true);
  var lpsOnOpenRoutine = {};
  itemRows.forEach(function (r) {
    var routineId = String(r[1] || "").trim();
    if (openOilChangeRoutineIds[routineId]) lpsOnOpenRoutine[String(r[2] || "").trim()] = true;
  });

  var needed = {}; // "contractor|type|brand" -> { contractor, lubricant, lubricantBrand, quantityNeeded, lpCount }
  registryRows.forEach(function (reg) {
    if (scope && reg.contractor !== scope) return;
    if (!reg.lubricant || !reg.contractor) return;
    var qtyPerChange = parseFloat(reg.lubricantQuantityL) || 0;
    if (qtyPerChange <= 0) return;

    var occurrences = 0;
    var intervalMonths = intervalMonthsForOilChange_(reg.oilChangeInterval);
    var lastChange = lastEventByLp[reg.code];
    if (lastChange && intervalMonths) {
      // Precise: walk forward from the LP's own last logged change, by its
      // own interval, counting every occurrence that falls within the
      // window — a short-interval LP can contribute more than once.
      var d = new Date(lastChange.getTime());
      d.setMonth(d.getMonth() + intervalMonths);
      var iterations = 0;
      while (d.getTime() <= windowEnd.getTime() && iterations < 36) {
        occurrences++;
        d.setMonth(d.getMonth() + intervalMonths);
        iterations++;
      }
    } else if (intervalMonths) {
      // No logged change history for this LP (expected for most real
      // equipment today — Oil Change LOG only starts filling in as events
      // get logged through this app going forward) — fall back to a
      // steady-state consumption-rate estimate instead of contributing
      // nothing: "registry intervals x quantity," the baseline the user
      // asked for. Fractional on purpose (e.g. a 6-month interval over a
      // 3-month window is 0.5 of a change) — this is a demand-rate
      // estimate, not a claim about exactly which month it happens.
      occurrences = months / intervalMonths;
    } else if (lpsOnOpenRoutine[reg.code]) {
      // No usable interval at all, but a routine is already scheduled —
      // known, real demand the rate estimate above has no way to see.
      occurrences = 1;
    }
    if (occurrences === 0) return;

    var key = reg.contractor + "|" + reg.lubricant.trim().toLowerCase() + "|" + (reg.lubricantBrand || "").trim().toLowerCase();
    if (!needed[key]) {
      needed[key] = { contractor: reg.contractor, lubricant: reg.lubricant, lubricantBrand: reg.lubricantBrand || "", quantityNeeded: 0, lpCount: 0 };
    }
    needed[key].quantityNeeded += qtyPerChange * occurrences;
    needed[key].lpCount++;
  });

  var productRows = readSheet(ss, "Oil Inventory", true);
  var forecast = Object.keys(needed).map(function (key) {
    var n = needed[key];
    // Patch 8: falls back to a declared equivalent product when the exact
    // originally-spec'd brand isn't in this contractor's inventory — see
    // findInventoryProductRow_'s own comment.
    var product = findInventoryProductRow_(productRows, n.lubricant, n.lubricantBrand, n.contractor);
    var currentStock = product ? (parseFloat(product[6]) || 0) : null;
    var quantityNeeded = Math.round(n.quantityNeeded * 100) / 100;
    return {
      contractor: n.contractor,
      lubricant: n.lubricant,
      lubricantBrand: n.lubricantBrand,
      quantityNeeded: quantityNeeded,
      lpCount: n.lpCount,
      productId: product ? String(product[0] || "").trim() : "",
      currentStock: currentStock,
      shortfall: currentStock === null ? null : Math.max(0, Math.round((quantityNeeded - currentStock) * 100) / 100),
    };
  });

  return { forecast: forecast, months: months, windowEnd: windowEnd.toISOString().slice(0, 10) };
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
    data.equivalentToType || "",
    data.equivalentToBrand || "",
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
  // Equivalence IS editable after creation — see the column-17/18 comment
  // above for why this is treated differently from Contractor (locked).
  sheet.getRange(rowIdx, 18).setValue(data.equivalentToType || "");
  sheet.getRange(rowIdx, 19).setValue(data.equivalentToBrand || "");
  stampLastModified(sheet, "Oil Inventory", rowIdx);
  return { status: "ok" };
}


// Two-tier match against a lubricant type/brand/contractor identity — the
// shared logic tryAutoDeductInventory_ and getOilInventoryForecast both
// need to go from "what the equipment's own registry entry specifies" to
// "which real Oil Inventory product covers that." Tier 1: an EXACT match
// on the product's own Lubricant_Type/Brand (unchanged behavior from
// before Patch 8). Tier 2 (Patch 8): falls back to a product whose
// EquivalentToType/Brand names this spec — a Contractor Engineer's
// declared substitute for a brand the market no longer carries. Both
// tiers require the SAME contractor; equivalence never crosses contractor
// lines, same as stock itself never does. Ambiguous by design if a
// contractor somehow has two rows matching the same tier (not expected,
// not prevented elsewhere either) — returns the first match, exact tier
// always preferred over an equivalence tier.
function findInventoryProductRow_(productRows, lubricant, lubricantBrand, contractor) {
  var type = String(lubricant || "").trim().toLowerCase();
  var brand = String(lubricantBrand || "").trim().toLowerCase();
  if (!type || !contractor) return null;

  for (var i = 0; i < productRows.length; i++) {
    var r = productRows[i];
    if (String(r[16] || "").trim() !== contractor) continue;
    if (String(r[1] || "").trim().toLowerCase() !== type) continue;
    if (brand && String(r[2] || "").trim().toLowerCase() !== brand) continue;
    return r;
  }
  for (var j = 0; j < productRows.length; j++) {
    var r2 = productRows[j];
    if (String(r2[16] || "").trim() !== contractor) continue;
    if (String(r2[17] || "").trim().toLowerCase() !== type) continue;
    if (brand && String(r2[18] || "").trim().toLowerCase() !== brand) continue;
    return r2;
  }
  return null;
}

// Finds the one Oil Inventory product matching a given lubricant type +
// brand + contractor — the identity tryAutoDeductInventory_ below uses to
// know which contractor's stock an oil-change event should draw down. See
// findInventoryProductRow_ for the two-tier (exact, then equivalent) match.
function findMatchingProduct_(ss, lubricant, lubricantBrand, contractor) {
  var rows = readSheet(ss, "Oil Inventory", true);
  var r = findInventoryProductRow_(rows, lubricant, lubricantBrand, contractor);
  if (!r) return null;
  return { productId: String(r[0] || "").trim(), unit: String(r[5] || "").trim() };
}


// Best-effort auto-deduction of Oil Inventory stock when an oil-change
// event is logged (see OilChanges.js#logOilChangeEvent) — never blocks or
// fails the oil-change itself, since that's the primary action here and
// this is a secondary side-effect (same "best-effort, never block the
// primary write" convention the routine-approval side-effects in
// apps/oil-analysis/src/pages/RoutineDetail.jsx already use). Only
// deducts when it can find one unambiguous matching product AND that
// product is tracked in Liters — a "Drum"-unit product has no safe
// conversion from a liters-used quantity, so it's left for a manual Issue
// instead of guessed at.
function tryAutoDeductInventory_(ss, info) {
  var qty = parseFloat(info.quantityUsed);
  if (isNaN(qty) || qty <= 0) return { deducted: false, reason: "no usable quantity to deduct" };
  if (!info.lubricant || !info.contractor) {
    return { deducted: false, reason: "equipment has no registered lubricant type/contractor to match against" };
  }
  var product = findMatchingProduct_(ss, info.lubricant, info.lubricantBrand, info.contractor);
  if (!product) return { deducted: false, reason: "no matching Oil Inventory product found for this lubricant and contractor" };
  if (product.unit !== "L") {
    return { deducted: false, reason: "matched product is tracked in " + (product.unit || "an unknown unit") + ", not Liters — log this Issue manually" };
  }

  var movResult = logOilMovement(ss, {
    productId: product.productId,
    movementType: "Issue",
    quantity: qty,
    movementDate: info.eventDate,
    linkedLpId: info.lpId,
    linkedEventId: info.eventId,
    contractor: info.contractor,
    doneBy: info.doneBy,
    reference: "Auto-deducted from oil change event " + info.eventId,
  });
  if (movResult.error) return { deducted: false, reason: movResult.error };
  return { deducted: true, productId: product.productId, movementId: movResult.movementId };
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

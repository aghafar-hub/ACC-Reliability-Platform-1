// Oil Top Up LOG (Patch 17, plant-readiness pass): emergency/ad-hoc oil
// top-ups, tracked separately from Oil Change LOG — a top-up is a smaller,
// reactive event (leakage, low level, seal issue) triggered by the
// "Emergency Top Up" route type (Patch 18), not a scheduled change. Mirrors
// logOilChangeEvent's own shape and conventions (OilChanges.js) deliberately,
// but as its own sheet/history rather than folded into Oil Change LOG, so the
// two can be reported on, filtered, and displayed separately (confirmed
// directly by the user) while still sharing the exact same inventory
// auto-deduction path.
//
// "Oil Top Up LOG" columns: 0 TopUpId, 1 LP_ID, 2 RoutineId (which Emergency
// Top Up routine generated this entry — blank for a standalone log, same as
// RoutineItemId is optional on Oil Change LOG), 3 EventDate, 4 Quantity,
// 5 OilBrandType, 6 Reason, 7 RequestedBy, 8 DoneBy, 9 Contractor,
// 10 Remarks, 11 Created_Date. Header row 1, data row 2+ (dataStartRowFor's
// standard default) — same as every other tracked sheet in this backend.
//
// Unlike Oil Change LOG, quantity is NOT defaulted from the registry's
// Lubricant_Quantity_L: a top-up is normally a partial amount, and silently
// assuming a full change's worth would overstate the inventory deduction.
// The caller (the Emergency Top Up routine's approval side effect) must
// supply a real quantity.

var TOP_UP_LOG_HEADERS = [
  "TopUpId", "LP_ID", "RoutineId", "EventDate", "Quantity", "OilBrandType",
  "Reason", "RequestedBy", "DoneBy", "Contractor", "Remarks", "Created_Date",
  "Product_ID",
];

function logOilTopUp_(ss, data) {
  var lpId = String(data.lpId || "").trim();
  if (!lpId) return { error: "lpId is required" };

  var reason = String(data.reason || "").trim();
  if (!reason) return { error: "reason is required" };

  var quantityUsed = parseFloat(data.quantityUsed);
  if (isNaN(quantityUsed) || quantityUsed <= 0) return { error: "quantityUsed is required and must be a positive number" };

  var eventDate = data.eventDate ? new Date(data.eventDate) : new Date();
  if (isNaN(eventDate.getTime())) return { error: "eventDate is invalid" };

  // Phase 5: once per confirmed job — the same route's top-up for the same
  // point isn't logged (or deducted) twice.
  var routineIdForTopUp = String(data.routineId || "").trim();
  if (routineIdForTopUp) {
    var dup = readSheet(ss, "Oil Top Up LOG", true).filter(function (r) {
      return String(r[2] || "").trim() === routineIdForTopUp && String(r[1] || "").trim() === lpId;
    })[0];
    if (dup) return { status: "ok", topUpId: String(dup[0] || ""), duplicate: true, inventoryDeducted: false, inventoryNote: "already logged for this route" };
  }

  var reg = findRegistryEntryForOilChange_(ss, lpId); // OilChanges.js — same minimal lookup, same fields a top-up needs
  var contractor = data.contractor || (reg ? reg.contractor : "") || "";

  // Phase 8: the oil used — the one saved on the route item, or the product
  // picked — and never a different oil from what's already in the point.
  var usedOil = routineIdForTopUp ? routineItemOil_(ss, "", routineIdForTopUp, lpId) : null;
  var usedProductId = (usedOil && usedOil.productId) || String(data.productId || "").trim();
  if (usedProductId) {
    var mixCheck = checkOilUsed_(ss, lpId, "TopUp", usedProductId);
    if (mixCheck.error) return { error: mixCheck.error };
  }
  var usedProduct = productById_(ss, usedProductId);

  var topUpId = "TU-" + Utilities.getUuid();
  var row = [
    topUpId,
    lpId,
    data.routineId || "",
    eventDate,
    quantityUsed,
    (usedProduct ? usedProduct.type + (usedProduct.brand ? " / " + usedProduct.brand : "") : "") || data.oilBrandType || (reg ? oilBrandTypeFor_(reg) : "") || "",
    reason,
    data.requestedBy || "",
    data.doneBy || "",
    contractor,
    data.remarks || "",
    "", // Created_Date — filled by appendRow's own stampLastModified
    usedProduct ? usedProduct.productId : "", // Phase 8: Product_ID
  ];
  var tuSheet = ss.getSheetByName("Oil Top Up LOG");
  if (tuSheet && usedProduct) ensureServerHeaders_(tuSheet, 1, TU_PRODUCT_COL, ["Product_ID"]);
  // Unlike Oil Change LOG (a tab that already existed in the original
  // workbook), "Oil Top Up LOG" is brand new — passing the header row here
  // lets Utils.js's appendRow self-create the sheet correctly on first
  // write (same reasoning AuditLog.js/InAppNotifications.js's own
  // self-creating sheets use), instead of requiring it to be pre-created
  // by hand with exact header spelling.
  appendRow(ss, "Oil Top Up LOG", row, TOP_UP_LOG_HEADERS);

  // Same auto-deduction path a regular oil change uses (OilInventory.js) —
  // confirmed directly by the user: a top-up draws down stock exactly like
  // a change does, just a smaller quantity.
  var inventory = tryAutoDeductInventory_(ss, {
    productId: usedProduct ? usedProduct.productId : "",
    lpId: lpId,
    lubricant: reg ? reg.lubricant : "",
    lubricantBrand: reg ? reg.lubricantBrand : "",
    contractor: contractor,
    quantityUsed: quantityUsed,
    eventId: topUpId,
    eventDate: eventDate,
    doneBy: data.doneBy || "",
  });

  return {
    status: "ok",
    topUpId: topUpId,
    inventoryDeducted: inventory.deducted,
    inventoryNote: inventory.deducted ? "" : inventory.reason,
  };
}

// All Oil Top Up LOG events for one LP_ID, newest first — same shape/role
// as OilChanges.js's getOilChangesForLp, used by Equipment Viewer's
// "Top Ups" tab and "Recent Top Ups" card.
function getTopUpsForLp(lpId, scope) {
  var id = String(lpId || "").trim();
  if (!id) return { events: [] };
  if (scope && getLpContractorMap_()[id] !== scope) return { events: [], count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Top Up LOG", true).filter(function (r) {
    return String(r[1] || "").trim() === id;
  });
  rows.sort(function (a, b) { return new Date(b[3]) - new Date(a[3]); });
  return { events: rows, count: rows.length };
}

// Every top-up across every LP (Patch 26) — the Dashboard's own
// dashboard-wide count/trend source, as opposed to getTopUpsForLp above
// (one LP's own history). Scoped directly off the LOG row's own
// Contractor column (9), same pattern as getAllOilInventoryMovements.
function getAllTopUps(scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Top Up LOG", true);
  if (scope) rows = rows.filter(function (r) { return String(r[9] || "").trim() === scope; });
  return { events: rows, count: rows.length };
}

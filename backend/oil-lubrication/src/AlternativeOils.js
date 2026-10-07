// Phase 8 — alternative oils.
//
//  - Approved equivalents: the contractor's engineer approves "this product
//    is an equivalent for oil X" (Oil Inventory columns R/S, with who and
//    when in T/U). The ACC engineers, that contractor's managers and the
//    ACC managers are told. Only that contractor's engineer can set or
//    remove it.
//  - Oil to use: for each point on a route, the oil to use is worked out
//    from the point's registered (main) oil, its approved equivalents and
//    the stock. An oil change uses the main oil when there's enough of it,
//    otherwise an approved equivalent. A top-up must use the oil already in
//    the point — no mixing, ever.
//  - Oil used: the technician picks the oil used from the allowed list
//    only (saved on the route item); the oil change / top-up log records
//    that product and stock is taken from it, so consumption is by the real
//    brand and each point has a "current oil".
//
// New server-owned columns (headers added automatically, refused if the
// column is already used for something else):
//   Oil Inventory      T EquivalentApprovedBy, U EquivalentApprovedDate
//   Oil Change LOG     N Product_ID
//   Oil Top Up LOG     M Product_ID
//   OA_ROUTINE_ITEMS   M OilUsedProductId, N OilUsed

var EQUIV_COL = { TYPE: 17, BRAND: 18, APPROVED_BY: 19, APPROVED_DATE: 20 };
var OC_PRODUCT_COL = 13;
var TU_PRODUCT_COL = 12;
var RI_OIL_COL = { PRODUCT: 12, LABEL: 13 };

// Writes `headers` into `headerRow` from 0-based column `startCol` when the
// cells are blank; stops if a cell already holds a different header.
function ensureServerHeaders_(sheet, headerRow, startCol, headers) {
  var range = sheet.getRange(headerRow, startCol + 1, 1, headers.length);
  var current = range.getValues()[0];
  var needs = false;
  for (var i = 0; i < headers.length; i++) {
    var v = String(current[i] || "").trim();
    if (!v) { needs = true; continue; }
    if (v !== headers[i]) {
      throw new Error(sheet.getName() + " column " + columnLetter_(startCol + 1 + i) + " already holds \"" + v + "\". Move it before using alternative oils.");
    }
  }
  if (needs) range.setValues([headers]);
}

function normOil_(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Same oil: same type, and the same brand when both name one.
function sameOil_(type1, brand1, type2, brand2) {
  if (!normOil_(type1) || normOil_(type1) !== normOil_(type2)) return false;
  var b1 = normOil_(brand1), b2 = normOil_(brand2);
  return !b1 || !b2 || b1 === b2;
}

function oilLabel_(type, brand) {
  type = String(type || "").trim();
  brand = String(brand || "").trim();
  return brand && normOil_(type).indexOf(normOil_(brand)) === -1 ? type + " — " + brand : type;
}

// The main oil and its approved equivalents in this contractor's stock,
// main first. Discontinued products are left out.
function approvedOilsFor_(products, stocks, lubricant, brand, contractor) {
  var main = [], equiv = [];
  products.forEach(function (p) {
    var id = String(p[0] || "").trim();
    if (!id || String(p[16] || "").trim() !== contractor) return;
    if (String(p[11] || "").trim() === "Discontinued") return;
    var o = {
      productId: id,
      type: String(p[1] || "").trim(),
      brand: String(p[2] || "").trim(),
      unit: String(p[5] || "").trim(),
      stock: stocks[id] || 0,
      isEquivalent: false,
    };
    o.label = oilLabel_(o.type, o.brand);
    if (sameOil_(p[1], p[2], lubricant, brand)) main.push(o);
    else if (String(p[EQUIV_COL.TYPE] || "").trim() && sameOil_(p[EQUIV_COL.TYPE], p[EQUIV_COL.BRAND], lubricant, brand)) {
      o.isEquivalent = true;
      o.approvedBy = String(p[EQUIV_COL.APPROVED_BY] || "").trim();
      equiv.push(o);
    }
  });
  return main.concat(equiv);
}

// LP -> the oil now in it, from its latest oil change: { productId, label }.
function currentOilByLp_(ss) {
  var out = {};
  readSheet(ss, "Oil Change LOG", true).forEach(function (r) {
    var lp = String(r[1] || "").trim();
    var d = asDate_(r[4]);
    if (!lp || !d) return;
    if (out[lp] && out[lp].date.getTime() > d.getTime()) return;
    out[lp] = { date: d, productId: String(r[OC_PRODUCT_COL] || "").trim(), label: String(r[6] || "").trim() };
  });
  return out;
}

// Does a logged OilBrandType ("Type / Brand", older rows) name this option?
function labelMatchesOption_(label, o) {
  var l = normOil_(label);
  if (!l) return false;
  return l === normOil_(o.type) || l === normOil_(o.type + " / " + o.brand) || l === normOil_(o.label);
}

// The plan for one point: which oils are allowed and which one to use.
// itemType: "Change" | "TopUp" | "Sample".
function oilPlanFor_(reg, itemType, products, stocks, current) {
  var plan = {
    lpId: reg.code,
    mainOil: oilLabel_(reg.lubricant, reg.lubricantBrand),
    current: current ? { productId: current.productId, label: current.label } : null,
    options: [],
    allowed: [],
    use: null,
    note: "",
  };
  if (itemType === "Sample" || !reg.lubricant || !reg.contractor) return plan;
  var options = approvedOilsFor_(products, stocks, reg.lubricant, reg.lubricantBrand, reg.contractor);
  plan.options = options;
  if (itemType === "TopUp") {
    var allowed;
    if (current && current.productId) {
      allowed = options.filter(function (o) { return o.productId === current.productId; });
      if (!allowed.length) {
        // the point's oil is no longer approved/active here — still the
        // only oil it can be topped up with
        var p = products.filter(function (x) { return String(x[0] || "").trim() === current.productId; })[0];
        if (p) allowed = [{ productId: current.productId, type: String(p[1] || "").trim(), brand: String(p[2] || "").trim(), unit: String(p[5] || "").trim(), stock: stocks[current.productId] || 0, isEquivalent: false, label: oilLabel_(p[1], p[2]) }];
      }
    } else if (current && current.label) {
      allowed = options.filter(function (o) { return labelMatchesOption_(current.label, o); });
    } else {
      allowed = options.filter(function (o) { return !o.isEquivalent; });
    }
    plan.allowed = allowed;
    plan.use = allowed[0] || null;
    plan.note = "Top up only with the oil already in this point — no mixing.";
    return plan;
  }
  plan.allowed = options;
  var need = parseFloat(reg.lubricantQuantityL) || 0;
  plan.use = options.filter(function (o) { return o.stock >= need; })[0] || options[0] || null;
  if (plan.use && plan.use.isEquivalent) {
    plan.note = plan.mainOil + " is short — use the approved equivalent " + plan.use.label + ".";
  } else if (plan.use && need && plan.use.stock < need) {
    plan.note = "Not enough stock of any approved oil (" + need + " L needed).";
  }
  return plan;
}

function oilPlanContext_(ss) {
  var registry = {};
  (readEquipmentRegistry().equipment || []).forEach(function (r) { registry[r.code] = r; });
  return {
    registry: registry,
    products: readSheet(ss, "Oil Inventory", true),
    stocks: productStocksFromLog_(ss),
    current: currentOilByLp_(ss),
  };
}

function oilPlanForLp_(ss, lpId, itemType, ctx) {
  ctx = ctx || oilPlanContext_(ss);
  var reg = ctx.registry[String(lpId || "").trim()];
  if (!reg) return null;
  return oilPlanFor_(reg, itemType, ctx.products, ctx.stocks, ctx.current[reg.code]);
}

// GET getOilPlan&lpIds=A,B&itemType=Change
function getOilPlan(lpIdsParam, itemType, scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ctx = oilPlanContext_(ss);
  var plans = {};
  String(lpIdsParam || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (lp) {
    var reg = ctx.registry[lp];
    if (!reg || (scope && reg.contractor !== scope)) return;
    plans[lp] = oilPlanFor_(reg, itemType || "Change", ctx.products, ctx.stocks, ctx.current[lp]);
  });
  return { plans: plans };
}

// Checks the oil a technician says was used on a route item. Returns
// { error } or { productId, label } ("" when the point has no stocked oil
// to choose from).
function checkOilUsed_(ss, lpId, itemType, productId) {
  if (itemType !== "Change" && itemType !== "TopUp") return { productId: "", label: "" };
  var plan = oilPlanForLp_(ss, lpId, itemType);
  if (!plan || !plan.allowed.length) return { productId: "", label: "" };
  productId = String(productId || "").trim();
  if (!productId) return { error: "Choose the oil used on " + lpId + " (" + plan.allowed.map(function (o) { return o.label; }).join(" or ") + ")." };
  var o = plan.allowed.filter(function (x) { return x.productId === productId; })[0];
  if (o) return { productId: o.productId, label: o.label };
  if (itemType === "TopUp") {
    return { error: "No mixing: " + lpId + " has " + (plan.allowed[0] ? plan.allowed[0].label : plan.mainOil) + " — top it up only with that oil." };
  }
  return { error: "That oil isn't the main oil or an approved equivalent for " + lpId + "." };
}

// The oil saved on a route item (by routineItemId, or routineId + LP).
function routineItemOil_(ss, routineItemId, routineId, lpId) {
  var rows = readSheet(ss, "OA_ROUTINE_ITEMS", true);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var hit = routineItemId ? String(r[0] || "").trim() === routineItemId
      : String(r[1] || "").trim() === routineId && String(r[2] || "").trim() === lpId;
    if (hit) return { productId: String(r[RI_OIL_COL.PRODUCT] || "").trim(), label: String(r[RI_OIL_COL.LABEL] || "").trim() };
  }
  return null;
}

function productById_(ss, productId) {
  if (!productId) return null;
  var p = findProductRow_(ss, productId);
  if (!p) return null;
  return { productId: productId, type: String(p[1] || "").trim(), brand: String(p[2] || "").trim(), unit: String(p[5] || "").trim(), contractor: String(p[16] || "").trim() };
}

// ── Approving an equivalent ───────────────────────────────────────────────
// data: { productId, mainType, mainBrand } — a blank mainType removes it.
function setOilEquivalent(ss, data, actingUser) {
  var productId = String(data.productId || "").trim();
  if (!productId) return { error: "productId is required" };
  var sheet = ss.getSheetByName("Oil Inventory");
  if (!sheet) return { error: "Oil Inventory sheet not found" };
  var rowIdx = findRowIndex(sheet, [0], [productId], dataStartRowFor("Oil Inventory"));
  if (rowIdx === -1) return { error: "Product not found" };
  var row = sheet.getRange(rowIdx, 1, 1, 21).getValues()[0];
  var mainType = String(data.mainType || "").trim();
  var mainBrand = String(data.mainBrand || "").trim();
  if (mainType && sameOil_(row[1], row[2], mainType, mainBrand)) return { error: "A product can't be an equivalent for itself." };
  ensureServerHeaders_(sheet, 1, EQUIV_COL.APPROVED_BY, ["EquivalentApprovedBy", "EquivalentApprovedDate"]);
  var before = String(row[EQUIV_COL.TYPE] || "").trim() ? oilLabel_(row[EQUIV_COL.TYPE], row[EQUIV_COL.BRAND]) : "";
  sheet.getRange(rowIdx, EQUIV_COL.TYPE + 1, 1, 4).setValues([[mainType, mainType ? mainBrand : "", mainType ? actingUser || "" : "", mainType ? new Date() : ""]]);
  stampLastModified(sheet, "Oil Inventory", rowIdx);

  var contractor = String(row[16] || "").trim();
  var product = oilLabel_(row[1], row[2]);
  var msg = mainType
    ? product + " (" + contractor + ") was approved by " + (actingUser || "the contractor engineer") + " as an equivalent for " + oilLabel_(mainType, mainBrand) + ". Routes will use it when " + oilLabel_(mainType, mainBrand) + " is short."
    : product + " (" + contractor + ") is no longer an approved equivalent" + (before ? " for " + before : "") + " (removed by " + (actingUser || "the contractor engineer") + ").";
  try {
    var people = [];
    function addAll(list) { list.forEach(function (e) { if (people.indexOf(e) === -1) people.push(e); }); }
    addAll(maResponsibleEmails_(MA_RESP.ACC, ""));
    addAll(maResponsibleEmails_(MA_RESP.CONTRACTOR_MANAGER, contractor));
    addAll(maResponsibleEmails_(MA_RESP.ACC_MANAGER, ""));
    recordInAppNotificationForEach_(ss, people, "oil-equivalent", msg, contractor, "inventory", productId);
    if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: equivalent oil " + (mainType ? "approved" : "removed") + " — " + product, body: msg });
  } catch (e) {
    logError("setOilEquivalent:notify", e, { productId: productId });
  }
  return { status: "ok", message: msg, before: before };
}

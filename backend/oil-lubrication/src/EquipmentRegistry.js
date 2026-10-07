// "Equipment Registry" sheet reads. Split out of the old monolithic Code.js
// (see docs/oil-lubrication-migration-notes.md).



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
// LP_ID -> Contractor (column R, same column readEquipmentRegistry() below
// exposes as `contractor`) — the join key that makes contractor scoping
// possible for every OTHER sheet too (Data_Entry, Action Tracker, Oil
// Change LOG, Oil Sample Tracker all key their rows by LP_ID, none of them
// carry their own Contractor column), see Rbac.js's filterRowsByLpContractor_.
// Kept for the rest of this request: callers like resolveLpContractor_
// run once per row (Team Workload, escalation, digests), and re-reading the
// whole registry each time made those take minutes. Cleared by every write
// to the registry (Utils.js's appendRow/updateRow/deleteRow).
var LP_CONTRACTOR_MAP_MEMO_ = null;
function invalidateLpContractorMap_() {
  LP_CONTRACTOR_MAP_MEMO_ = null;
}

function getLpContractorMap_() {
  if (LP_CONTRACTOR_MAP_MEMO_) return LP_CONTRACTOR_MAP_MEMO_;
  LP_CONTRACTOR_MAP_MEMO_ = readLpContractorMap_();
  return LP_CONTRACTOR_MAP_MEMO_;
}

function readLpContractorMap_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Equipment Registry");
  if (!sheet) return {};
  var vals = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 2; i < vals.length; i++) {
    var lpId = String(vals[i][0] || "").trim();
    if (!lpId) continue;
    map[lpId] = canonicalContractor_(vals[i][17]);
  }
  return map;
}


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
      contractor:          canonicalContractor_(row[17]),
      status:              String(row[18] || "").trim(),
      createdDate:         row[19] || "",
      modifiedDate:        row[20] || "",
    });
  }
  return { equipment: equipment, count: equipment.length };
}

// ─── Learning a lab report's Unit ID ─────────────────────────────────────
// A lab report names its point by "Unit ID", which the import looks up in
// column C (Report Equipment ID), ignoring spaces and case. When no point
// has it, the user picks the point by hand; after the samples are saved the
// app sends that pick here so the next report from the point matches by
// itself. Only an EMPTY Report Equipment ID is filled — an existing one is
// never replaced from an import (change it in the registry) — and one Unit
// ID never goes to two points.
function squashReportId_(v) {
  return String(v == null ? "" : v).replace(/\s+/g, "").toUpperCase();
}

function learnReportEquipmentId_(ss, lpId, unitId) {
  var id = String(lpId || "").trim();
  var text = labInfoText_(unitId);
  var key = squashReportId_(text);
  if (!id || !key) return { error: "LP_ID and Report Equipment ID are required" };
  var sheet = ss.getSheetByName("Equipment Registry");
  if (!sheet) return { error: "Sheet 'Equipment Registry' not found" };
  var vals = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 2; i < vals.length; i++) {
    var code = String(vals[i][0] || "").trim();
    if (!code) continue;
    if (code === id) { rowIdx = i; continue; }
    if (squashReportId_(vals[i][2]) === key) {
      return { error: "Report Equipment ID " + text + " already belongs to " + code };
    }
  }
  if (rowIdx === -1) return { error: "Lubrication point " + id + " not found in the Equipment Registry" };
  var current = String(vals[rowIdx][2] || "").trim();
  if (current) return { learned: false, current: current };
  sheet.getRange(rowIdx + 1, 3).setValue(text);
  sheet.getRange(rowIdx + 1, 21).setValue(new Date());
  return { learned: true, current: text };
}

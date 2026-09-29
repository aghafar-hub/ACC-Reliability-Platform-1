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

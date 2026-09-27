/**
 * One-time equipment ID migration — SANDBOX ONLY.
 *
 * Renames every Equipment ID cell from the old dotted format
 * ("111.CP.400") to the ACC Platform master DB's format ("111.CP400"),
 * for the 158 equipment that exist in both. Paste this as an ADDITIONAL
 * file in the same Apps Script project as Code.v2.gs (Apps Script projects
 * support multiple .gs files — use the "+" next to Files in the editor).
 *
 * RUN ONE SHEET AT A TIME, not migrateEquipmentIds() — the RMS DATA sheet
 * alone (6,586 rows) took nearly all of one execution's time budget, and
 * every large sheet after it in the same run was killed with "Service
 * timed out: Spreadsheets" before it could even start. Apps Script gives
 * each *execution* its own fresh time budget, so running these as 5
 * separate executions (5 separate Run clicks, picking a different function
 * from the dropdown each time) gets each sheet its own full budget:
 *
 *   1. migrateRmsData()            — already done if you saw "6156 of
 *                                     6586 rows renamed" in your log; safe
 *                                     to re-run anyway, it'll just report 0
 *   2. migrateSpmData()
 *   3. migrateLastRmsReading()
 *   4. migrateLastSpmReading()
 *   5. migrateComplianceTracker()
 *
 * migrateEquipmentIds() (runs all 5 in one execution) is kept for
 * convenience on a small sandbox, but expect it to hit the same timeout on
 * a sheet this size — prefer the per-sheet functions above.
 *
 * Check the execution log (View > Logs, or View > Executions) after each
 * run for that sheet's change count.
 *
 * This does NOT touch "⚙ RMS Register" or "⚙ SPM Register" — those get
 * REPLACED wholesale by rms-register-rebuild.csv / spm-register-rebuild.csv
 * (paste over the existing tab contents), not migrated in place, since the
 * rebuilt register also changes Points/thresholds/adds the 7 new
 * equipment. Run this migration first (so history follows the rename),
 * then paste in the rebuilt registers.
 *
 * Safe to re-run: any row already using a new-format ID (not a key in the
 * map) is simply left alone.
 */

var EQUIPMENT_ID_MAP = {
  "111.CP.400": "111.CP400",
  "111.HC.100": "111.HC100",
  "321.FN.125": "321.FN125",
  "321.FN.400": "321.FN400",
  "321.MD.140": "321.MD140",
  "321.MD.152": "321.MD152",
  "322.FN.125": "322.FN125",
  "322.FN.400": "322.FN400",
  "322.MD.140": "322.MD140",
  "331.CP.280": "331.CP280",
  "331.CP.281": "331.CP281",
  "331.CP.282": "331.CP282",
  "331.FN.110": "331.FN110",
  "331.FN.400": "331.FN400",
  "331.WI.210": "331.WI210",
  "331.WI.211": "331.WI211",
  "332.CP.281": "332.CP281",
  "332.CP.282": "332.CP282",
  "332.FN.110": "332.FN110",
  "332.FN.400": "332.FN400",
  "332.WI.210": "332.WI210",
  "332.WI.211": "332.WI211",
  "341.BE.040": "341.BE040",
  "341.BL.300": "341.BL300",
  "341.BL.305": "341.BL305",
  "341.BL.310": "341.BL310",
  "341.FN.315": "341.FN315",
  "341.FN.316": "341.FN316",
  "342.BE.041": "342.BE041",
  "342.BE.050": "342.BE050",
  "342.BE.051": "342.BE051",
  "342.BL.300": "342.BL300",
  "342.BL.305": "342.BL305",
  "342.BL.310": "342.BL310",
  "342.FN.315": "342.FN315",
  "351.BE.340": "351.BE340",
  "351.BE.341": "351.BE341",
  "351.BL.110": "351.BL110",
  "352.BE.340": "352.BE340",
  "352.BE.341": "352.BE341",
  "352.BL.110": "352.BL110",
  "431.FN.171": "431.FN171",
  "431.FN.176": "431.FN176",
  "431.FN.560": "431.FN560",
  "431.MD.140": "431.MD140",
  "431.MD.160": "431.MD160",
  "432.FN.171": "432.FN171",
  "432.FN.176": "432.FN176",
  "432.FN.560": "432.FN560",
  "432.MD.140": "432.MD140",
  "432.MD.160": "432.MD160",
  "441.CR.400": "441.CR400",
  "441.FN.300": "441.FN300",
  "441.FN.305": "441.FN305",
  "441.FN.310": "441.FN310",
  "441.FN.315": "441.FN315",
  "441.FN.325": "441.FN325",
  "441.FN.335": "441.FN335",
  "441.FN.340": "441.FN340",
  "441.FN.345": "441.FN345",
  "441.FN.350": "441.FN350",
  "441.FN.590": "441.FN590",
  "442.CR.400": "442.CR400",
  "442.FN.300": "442.FN300",
  "442.FN.305": "442.FN305",
  "442.FN.310": "442.FN310",
  "442.FN.315": "442.FN315",
  "442.FN.325": "442.FN325",
  "442.FN.335": "442.FN335",
  "442.FN.340": "442.FN340",
  "442.FN.345": "442.FN345",
  "442.FN.350": "442.FN350",
  "442.FN.590": "442.FN590",
  "451.FN.010": "451.FN010",
  "451.FN.240": "451.FN240",
  "451.WI.111": "451.WI111",
  "451.WI.210": "451.WI210",
  "452.FN.010": "452.FN010",
  "452.FN.240": "452.FN240",
  "452.WI.111": "452.WI111",
  "452.WI.112": "452.WI112",
  "461.CP.524": "461.CP524",
  "461.CP.526": "461.CP526",
  "461.FN.125": "461.FN125",
  "461.FN.400": "461.FN400",
  "461.FN.450": "461.FN450",
  "461.MD.140": "461.MD140",
  "461.MD.152": "461.MD152",
  "461.PP.513": "461.PP513",
  "461.PP.515": "461.PP515",
  "462.CP.525": "462.CP525",
  "462.CP.530": "462.CP530",
  "462.FN.125": "462.FN125",
  "462.FN.400": "462.FN400",
  "462.FN.450": "462.FN450",
  "462.MD.140": "462.MD140",
  "462.PP.515": "462.PP515",
  "462.PP.545": "462.PP545",
  "466.BL.580": "466.BL580",
  "466.BL.585": "466.BL585",
  "466.BL.630": "466.BL630",
  "466.BL.635": "466.BL635",
  "531.BE.220": "531.BE220",
  "531.FN.242": "531.FN242",
  "531.FN.380": "531.FN380",
  "531.FN.530": "531.FN530",
  "531.MD.140": "531.MD140",
  "531.MD.302": "531.MD302",
  "532.BE.220": "532.BE220",
  "532.FN.242": "532.FN242",
  "532.FN.380": "532.FN380",
  "532.FN.530": "532.FN530",
  "532.MD.140": "532.MD140",
  "532.MD.302": "532.MD302",
  "533.BE.220": "533.BE220",
  "533.FN.350": "533.FN350",
  "533.FN.364": "533.FN364",
  "533.FN.530": "533.FN530",
  "533.MD.140": "533.MD140",
  "533.MD.302": "533.MD302",
  "534.BE.220": "534.BE220",
  "534.FN.350": "534.FN350",
  "534.FN.364": "534.FN364",
  "534.FN.530": "534.FN530",
  "534.MD.140": "534.MD140",
  "534.MD.302": "534.MD302",
  "611.BL.300": "611.BL300",
  "612.BL.300": "612.BL300",
  "613.BL.300": "613.BL300",
  "614.BL.300": "614.BL300",
  "641.BE.050": "641.BE050",
  "641.FN.952": "641.FN952",
  "642.BE.050": "642.BE050",
  "642.FN.952": "642.FN952",
  "643.BE.050": "643.BE050",
  "643.FN.952": "643.FN952",
  "644.BE.050": "644.BE050",
  "644.FN.952": "644.FN952",
  "645.BE.050": "645.BE050",
  "645.FN.952": "645.FN952",
  "646.BE.050": "646.BE050",
  "646.FN.952": "646.FN952",
  "741.CP.110": "741.CP110",
  "741.CP.111": "741.CP111",
  "741.CP.112": "741.CP112",
  "741.CP.113": "741.CP113",
  "742.CP.110": "742.CP110",
  "742.CP.111": "742.CP111",
  "742.CP.112": "742.CP112",
  "742.CP.113": "742.CP113",
  "743.CP.110": "743.CP110",
  "743.CP.111": "743.CP111",
  "743.CP.112": "743.CP112",
  "743.CP.113": "743.CP113",
  "744.CP.110": "744.CP110",
  "744.CP.111": "744.CP111",
  "744.CP.112": "744.CP112",
  "744.CP.113": "744.CP113",
};

// Sheets to migrate, and which column holds the Equipment ID.
// "byHeader" sheets: find the column by matching this exact header text in
// that sheet's own header row (per SHEET_CFG in Code.v2.gs).
// "byIndex" sheets: Compliance Tracker's reader (readCompliance in
// Code.v2.gs) reads column C positionally regardless of its header text,
// so this migration matches that same convention rather than guessing a
// header name.
var MIGRATION_TARGETS = [
  { sheet: SHEET_RMS,        mode: 'byHeader', header: 'Equipment ID' },
  { sheet: SHEET_SPM,        mode: 'byHeader', header: 'Equipment ID' },
  { sheet: SHEET_LAST_RMS,   mode: 'byHeader', header: 'Equipment ID' },
  { sheet: SHEET_LAST_SPM,   mode: 'byHeader', header: 'Equipment ID' },
  { sheet: SHEET_COMPLIANCE, mode: 'byIndex',  col: 3 }, // column C
];

// Batch size for each read/write pair, so even one sheet's migration makes
// steady, visible progress via the log instead of one giant call that
// either fully succeeds or times out with nothing to show for it.
var MIGRATE_BATCH_SIZE = 1000;

function migrateOneSheet(target) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(target.sheet);
  if (!sheet) {
    var msg = target.sheet + ': sheet not found, skipped';
    Logger.log(msg);
    return msg;
  }
  var cfg = SHEET_CFG[target.sheet];
  var dataStart = cfg ? cfg.dataStartRow : 2;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 1) {
    var msg2 = target.sheet + ': no data rows, skipped';
    Logger.log(msg2);
    return msg2;
  }

  var col;
  if (target.mode === 'byHeader') {
    var headerRow = cfg ? cfg.headerRow : 1;
    var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
    col = headers.indexOf(target.header) + 1; // 1-based; 0 if not found
    if (!col) {
      var msg3 = target.sheet + ': header "' + target.header + '" not found, skipped';
      Logger.log(msg3);
      return msg3;
    }
  } else {
    col = target.col;
  }

  var totalRows = lastRow - dataStart + 1;
  var changed = 0;
  for (var offset = 0; offset < totalRows; offset += MIGRATE_BATCH_SIZE) {
    var batchRows = Math.min(MIGRATE_BATCH_SIZE, totalRows - offset);
    var range = sheet.getRange(dataStart + offset, col, batchRows, 1);
    var values = range.getValues();
    var batchChanged = 0;
    for (var i = 0; i < values.length; i++) {
      var current = String(values[i][0] || '').trim();
      if (EQUIPMENT_ID_MAP.hasOwnProperty(current)) {
        values[i][0] = EQUIPMENT_ID_MAP[current];
        batchChanged++;
      }
    }
    if (batchChanged > 0) {
      // This column may have "reject invalid input" data validation (a
      // dropdown sourced from the OLD Register's Equipment ID list) —
      // writing a new-format ID would be rejected by that rule until the
      // Register is replaced with new-format IDs too. Clearing validation
      // on just this range before writing sidesteps the ordering
      // dependency entirely; re-apply a dropdown against the new Register
      // afterward if you want it back.
      range.clearDataValidations();
      range.setValues(values);
      changed += batchChanged;
    }
    Logger.log(target.sheet + ': batch ' + (offset + 1) + '-' + (offset + batchRows) + ' of ' + totalRows + ' done, ' + batchChanged + ' renamed');
  }

  var summary = target.sheet + ': ' + changed + ' of ' + totalRows + ' rows renamed (column ' + col + ')';
  Logger.log(summary);
  return summary;
}

function migrateRmsData() {
  return migrateOneSheet(MIGRATION_TARGETS[0]);
}
function migrateSpmData() {
  return migrateOneSheet(MIGRATION_TARGETS[1]);
}
function migrateLastRmsReading() {
  return migrateOneSheet(MIGRATION_TARGETS[2]);
}
function migrateLastSpmReading() {
  return migrateOneSheet(MIGRATION_TARGETS[3]);
}
function migrateComplianceTracker() {
  return migrateOneSheet(MIGRATION_TARGETS[4]);
}

// Convenience: runs all 5 in one execution. Fine for a small sandbox; on a
// sheet this size, prefer running the 5 functions above individually
// instead — each gets its own fresh execution time budget.
function migrateEquipmentIds() {
  var summary = MIGRATION_TARGETS.map(function (target) {
    try {
      return migrateOneSheet(target);
    } catch (err) {
      var msg = target.sheet + ': FAILED — ' + err;
      Logger.log(msg);
      return msg;
    }
  });
  Logger.log(summary.join('\n'));
  return summary;
}

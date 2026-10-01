// Installed Google Sheets trigger(s) — spreadsheet-UI conveniences for whoever
// is browsing the raw Sheet directly, NOT part of the Web App API surface
// (doGet/doPost never call these). Split out of the old monolithic Code.js
// (see docs/oil-lubrication-migration-notes.md).


function onEdit(e) {
  // Patch 12 (plant-readiness pass): runs on EVERY edit this trigger sees,
  // not just the filter-cell logic below — see logDirectEditIfTracked_'s
  // own comment for why this one function is the only reliable way to
  // catch someone editing the raw sheet directly. Wrapped so a bug here
  // can never break the pre-existing filter behavior everyone already
  // depends on.
  logDirectEditIfTracked_(e);

  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // Define filter inputs
  var yearCell = "C2";
  var monthCell = "E2";
  var startRow = 6;
  var dateColumn = 5;     // Column E (Sample Date)

  // Trigger if C2 or D2 changes, OR if any cell in the data rows is edited
  if (range.getA1Notation() === yearCell || range.getA1Notation() === monthCell || range.getRow() >= startRow) {

    // Fetch values from both filters
    var selectedYear = sheet.getRange(yearCell).getValue().toString().trim();
    var selectedMonth = sheet.getRange(monthCell).getValue().toString().trim();
    var lastRow = sheet.getLastRow();

    if (lastRow < startRow) return;

    // 1. Unhide everything first to start fresh
    sheet.unhideRow(sheet.getRange(startRow, 1, lastRow - (startRow - 1)));

    // Check if filters are cleared/set to "All"
    var allYears = (selectedYear === "" || selectedYear.toLowerCase() === "all years" || selectedYear.toLowerCase() === "all");
    var allMonths = (selectedMonth === "" || selectedMonth.toLowerCase() === "all months" || selectedMonth.toLowerCase() === "all");

    // 2. If BOTH filters are set to show everything, stop here and leave table wide open
    if (allYears && allMonths) {
      return;
    }

    // 3. Grab all the actual dates from Column E
    var dateValues = sheet.getRange(startRow, dateColumn, lastRow - (startRow - 1), 1).getValues();

    var months = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"];

    // 4. Loop and evaluate every row
    for (var i = 0; i < dateValues.length; i++) {
      var cellValue = dateValues[i][0];

      if (cellValue instanceof Date) {
        var rowYear = cellValue.getFullYear().toString();
        var rowMonthName = months[cellValue.getMonth()];

        // Conditions to see if a row SHOULD be hidden
        var yearMismatch = (!allYears && rowYear !== selectedYear);
        var monthMismatch = (!allMonths && rowMonthName.toLowerCase() !== selectedMonth.toLowerCase());

        // Hide the row if EITHER the year or the month doesn't match your selection
        if (yearMismatch || monthMismatch) {
          sheet.hideRows(startRow + i);
        }
      }
      // Blank data rows are ignored here, keeping them visible at the bottom!
    }
  }
}


// Patch 12 (plant-readiness pass): every write this backend makes goes
// through doPost — RBAC-checked, contractor-scoped, conflict-checked,
// audit-logged. None of that applies to someone with Editor access to
// the actual Google Sheet just typing into a cell directly; nothing in
// the app layer can see or stop that. This can't prevent a direct edit
// (see protectDataSheetsFromDirectEdits below for the stronger, opt-in
// mitigation that actually can), but it CAN reliably detect one: Apps
// Script's onEdit simple trigger fires for a real edit made in the
// Sheets UI, but never for a change this backend's own doPost makes via
// the SpreadsheetApp service — so if this fires at all for a watched
// sheet, it's a human editing the raw sheet directly, not the app.
//
// Logged to the same Audit Log Patch 9 built (action type "direct-edit"),
// so it shows up in the Activity page like any other change — with the
// one difference that tells the story: no ActingUser the app recognizes,
// because the app was never involved.
//
// Known simplification: a multi-cell paste fires onEdit ONCE for the
// whole pasted range, and this only inspects e.range's own top-left
// row/column — good enough to flag that bypass activity happened on this
// sheet, not a row-by-row accounting of everything that changed in a
// large paste.
function logDirectEditIfTracked_(e) {
  try {
    if (!e || !e.range) return;
    var sheetName = e.range.getSheet().getName();
    if (DIRECT_EDIT_WATCH_SHEETS.indexOf(sheetName) === -1) return;
    var row = e.range.getRow();
    if (row < dataStartRowFor(sheetName)) return; // header/title/filter cells — not real data

    var editor = "";
    try {
      // e.user.getEmail() can come back blank depending on this file's
      // sharing settings (Apps Script hides it unless the editor is
      // visible to the script's effective user) — never the detection's
      // fault, just logged as unknown when that happens.
      editor = (e.user && e.user.getEmail()) || "";
    } catch (e2) { /* ignore — see comment above */ }

    var sheet = e.range.getSheet();
    var lpCol = DIRECT_EDIT_LP_COL[sheetName];
    var contractorCol = DIRECT_EDIT_CONTRACTOR_COL[sheetName];
    var recordId = lpCol !== undefined
      ? String(sheet.getRange(row, lpCol + 1).getValue() || "")
      : String(sheet.getRange(row, 1).getValue() || "");
    var contractor = lpCol !== undefined
      ? resolveLpContractor_(recordId)
      : contractorCol !== undefined
      ? String(sheet.getRange(row, contractorCol + 1).getValue() || "")
      : "";

    recordAudit_(
      e.source, sheetName, recordId, "direct-edit",
      editor || "unknown (edited directly in the sheet)", contractor,
      "Row " + row + ", column " + e.range.getColumn() + " edited directly in the sheet, bypassing the app"
    );
  } catch (err) {
    logError("onEdit:direct-edit-detect", err, null);
  }
}


// OPT-IN, MANUAL ADMIN TOOL — not wired to onEdit, doPost, or any
// scheduled trigger; nothing calls this automatically. Restricts direct
// editing of every sheet in DIRECT_EDIT_WATCH_SHEETS (Config.js) to this
// spreadsheet's own owner — everyone else gets view-only on these sheets
// in the Sheets UI itself, on top of (not instead of) the detection
// above. This is the stronger of the two mitigations in this patch:
// logDirectEditIfTracked_ tells you AFTER someone bypassed the app; this
// stops most people from being able to at all.
//
// Deliberately never runs on its own — this changes real edit permissions
// on a spreadsheet people may be actively using, and the right call
// depends on exactly who currently has a legitimate reason to edit the
// raw sheet directly (if anyone — for most teams the answer is "no one,
// everything goes through the app"). Run it yourself, once, from the
// Apps Script editor's Run menu, only after trying it on a COPY of the
// spreadsheet first to confirm it behaves the way you expect — see
// docs/deployment-guide.md section 4p for the full walkthrough. Safe to
// run more than once: a sheet that's already protected is left alone
// rather than getting a second, redundant protection layered on top.
function protectDataSheetsFromDirectEdits() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var owner = ss.getOwner();
  DIRECT_EDIT_WATCH_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var already = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (already && already.length) return;

    var protection = sheet.protect().setDescription("Governed by the Oil Lubrication app — edit through the app, not here.");
    if (owner) {
      protection.addEditor(owner);
      var othersToRemove = protection.getEditors().filter(function (ed) { return ed.getEmail() !== owner.getEmail(); });
      if (othersToRemove.length) protection.removeEditors(othersToRemove);
    }
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  });
}

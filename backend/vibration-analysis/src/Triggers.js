// Sheet-bound onEdit trigger: hides Action Tracker rows that don't match
// the Year/Month filter cells (D3/G3) whenever either filter or any data
// row changes.
//
// FIX (see apps/vibration-analysis/apps-script/README.md for the original
// bug report this corrected): the original pasted source's guard checked
// for a sheet named "🚨 Action Tracker", which does not exist — the real
// tab (SHEET_ACTIONS, in Config.js) is "📋 Action Tracker" — so this whole
// function returned immediately on every edit and the filter never ran.
// Corrected to check against SHEET_ACTIONS directly instead of a second
// hardcoded string, so it can't drift out of sync with the real tab name
// again.
function onEdit(e) {
  var sheet = e.source.getActiveSheet();

  if (sheet.getName() !== SHEET_ACTIONS) return;

  var range = e.range;

  // Define your new filter inputs
  var yearCell = "D3";
  var monthCell = "G3";
  var startRow = 6;
  var dateColumn = 4;     // Column D (Date)

  // Trigger if D3 or G3 changes, OR if any cell in the data rows is edited
  if (range.getA1Notation() === yearCell || range.getA1Notation() === monthCell || range.getRow() >= startRow) {

    // Fetch values from both filters
    var selectedYear = sheet.getRange(yearCell).getValue().toString().trim();
    var selectedMonth = sheet.getRange(monthCell).getValue().toString().trim();
    var lastRow = sheet.getLastRow();

    if (lastRow < startRow) return;

    // 1. Unhide everything first to start fresh
    sheet.unhideRow(sheet.getRange(startRow, 1, lastRow - (startRow - 1)));

    // Check if filters are cleared, set to "0", or set to "All"
    var allYears = (selectedYear === "" || selectedYear === "0" || selectedYear.toLowerCase() === "all years" || selectedYear.toLowerCase() === "all");
    var allMonths = (selectedMonth === "" || selectedMonth === "0" || selectedMonth.toLowerCase() === "all months" || selectedMonth.toLowerCase() === "all");

    // 2. If BOTH filters are set to show everything, stop here and leave table wide open
    if (allYears && allMonths) {
      return;
    }

    // 3. Grab all the actual dates from Column D
    var dateValues = sheet.getRange(startRow, dateColumn, lastRow - (startRow - 1), 1).getValues();

    var monthsArray = ["January", "February", "March", "April", "May", "June",
                       "July", "August", "September", "October", "November", "December"];

    // 4. Loop and evaluate every row
    for (var i = 0; i < dateValues.length; i++) {
      var cellValue = dateValues[i][0];

      if (cellValue instanceof Date) {
        var rowYear = cellValue.getFullYear().toString();

        // Extract both text and numerical representation of the row's month
        var rowMonthName = monthsArray[cellValue.getMonth()].toLowerCase();
        var rowMonthNum = (cellValue.getMonth() + 1).toString(); // 1-12

        // Conditions to see if a row SHOULD be hidden
        var yearMismatch = (!allYears && rowYear !== selectedYear);

        // Check mismatch against both text name ("January") and number ("1")
        var monthMismatch = false;
        if (!allMonths) {
          if (selectedMonth.toLowerCase() !== rowMonthName && selectedMonth !== rowMonthNum && parseInt(selectedMonth) !== parseInt(rowMonthNum)) {
            monthMismatch = true;
          }
        }

        // Hide the row if EITHER the year or the month doesn't match your selection
        if (yearMismatch || monthMismatch) {
          sheet.hideRows(startRow + i);
        }
      }
      // Blank rows are ignored, keeping them open at the bottom for new entries!
    }
  }
}

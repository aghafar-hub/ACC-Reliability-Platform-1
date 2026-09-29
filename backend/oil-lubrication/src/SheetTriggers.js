// Installed Google Sheets trigger(s) — spreadsheet-UI conveniences for whoever
// is browsing the raw Sheet directly, NOT part of the Web App API surface
// (doGet/doPost never call these). Split out of the old monolithic Code.js
// (see docs/oil-lubrication-migration-notes.md).


function onEdit(e) {
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

// "Oil Sample Tracker" monthly-column updates. Split out of the old monolithic
// Code.js (see docs/oil-lubrication-migration-notes.md).


// Finds the column for `monthHeader` ("Jun-26"), scanning from col B
// onward (col A is the equipment code, and this naturally skips "Last
// sample"/"interval Days"/"INTERVAL" since none of those normalize to a
// month) — or creates a new column at the end if none exists yet. Shared
// by updateSampleTrackerMonthly below and checkSampleOverdueAndNotify
// (SampleOverdue.js) so both ever write to exactly the same column for a
// given month, never two different ones.
function findOrCreateMonthColumn_(sheet, monthHeader) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  for (var c = 1; c < headers.length; c++) {
    if (normalizeMonthHeader(headers[c]) === monthHeader) return c + 1;
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(monthHeader);
  return newCol;
}


function updateSampleTrackerMonthly(ss, data) {
  var sheet = ss.getSheetByName("Oil Sample Tracker");
  if (!sheet) return false;

  var equipCode  = String(data.equipmentCode || "").trim();
  var sampleDate = data.sampleDate || "";
  var status     = data.status || "";
  if (!equipCode) return false;

  var d = new Date(sampleDate);
  if (isNaN(d.getTime())) d = new Date();
  var monthHeader = MONTH_ABBR[d.getMonth()] + "-" + String(d.getFullYear()).slice(-2);

  // Display date e.g. "26 Sep 2026"
  var displayDate = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
  var cellValue   = status + "|" + displayDate;

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;

  var monthCol = findOrCreateMonthColumn_(sheet, monthHeader);

  // Find equipment row
  var colAVals = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 1).getValues() : [];
  for (var r = 0; r < colAVals.length; r++) {
    if (String(colAVals[r][0]).trim() === equipCode) {
      sheet.getRange(r + 1, 2).setValue(sampleDate);       // Last sample
      sheet.getRange(r + 1, monthCol).setValue(cellValue); // month bucket
      return true;
    }
  }
  // Equipment not found — add new row
  var newRow = lastRow + 1;
  sheet.getRange(newRow, 1).setValue(equipCode);
  sheet.getRange(newRow, 2).setValue(sampleDate);
  sheet.getRange(newRow, monthCol).setValue(cellValue);
  return true;
}

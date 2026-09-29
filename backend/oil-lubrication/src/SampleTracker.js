// "Oil Sample Tracker" monthly-column updates. Split out of the old monolithic
// Code.js (see docs/oil-lubrication-migration-notes.md).


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

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;

  // Find or create month column (scanning from col B onward — this
  // naturally skips "Last sample" / "interval Days" / "INTERVAL" since
  // none of those normalize to a month).
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var monthCol = -1;
  for (var c = 1; c < headers.length; c++) {
    if (normalizeMonthHeader(headers[c]) === monthHeader) { monthCol = c + 1; break; }
  }
  if (monthCol === -1) {
    monthCol = lastCol + 1;
    sheet.getRange(1, monthCol).setValue(monthHeader);
  }

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


function updateSampleTracker(ss, data) {
  var sheet = ss.getSheetByName("Oil Sample Tracker");
  if (!sheet) return false;

  var vals = sheet.getDataRange().getValues();
  if (vals.length < 1) return false;

  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] && String(vals[i][0]).trim() === String(data.equipmentCode).trim()) {
      sheet.getRange(i + 1, 2).setValue(data.sampleDate);

      var nextCol = 5;
      var lastCol = sheet.getLastColumn();
      while (nextCol <= lastCol && sheet.getRange(1, nextCol).getValue() !== "") {
        nextCol++;
      }

      sheet.getRange(1, nextCol).setValue(data.sampleDate);
      sheet.getRange(i + 1, nextCol).setValue(data.status);
      return true;
    }
  }
  return false;
}

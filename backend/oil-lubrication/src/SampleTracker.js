// "Oil Sample Tracker" monthly-column updates. Split out of the old monolithic
// Code.js (see docs/oil-lubrication-migration-notes.md).


// Finds the column for `monthHeader` ("Jun-26"), scanning from col B
// onward (col A is the equipment code, and this naturally skips "Last
// sample"/"interval Days"/"INTERVAL" since none of those normalize to a
// month) — or creates a new column at the end if none exists yet. Shared
// by updateSampleTrackerMonthly below and checkSampleOverdueAndNotify
// (SampleOverdue.js) so both ever write to exactly the same column for a
// given month, never two different ones.
// The "Last sample" column, found by its header (the live sheet is
// Lub ID | Report Equip ID | Last sample | interval Days | INTERVAL | months…);
// 0 when the sheet has none. Never assume column B.
function trackerLastSampleCol_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  for (var c = 1; c < headers.length; c++) {
    if (/^last\s*sample/i.test(String(headers[c] || "").trim())) return c + 1;
  }
  return 0;
}

// The value to put in a month cell. The live sheet's month cells have a
// dropdown (CAUTION, NORMAL, ALERT, MISSING, Insufficient Sample, Oil
// changed): there the bare word the dropdown allows is written (any case of
// `status`), or nothing when it allows none (e.g. "Awaiting Lab Report").
// A cell without a dropdown keeps the old "Status|date" form.
function trackerCellValue_(range, status, displayDate) {
  var rule = null;
  try { rule = range.getDataValidation ? range.getDataValidation() : null; } catch (e) { rule = null; }
  if (rule && typeof rule.getCriteriaType === "function") {
    var type = rule.getCriteriaType();
    var allowed = null;
    var vals = rule.getCriteriaValues() || [];
    if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) allowed = vals[0] || [];
    else if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && vals[0] && vals[0].getValues) {
      allowed = [].concat.apply([], vals[0].getValues());
    }
    if (allowed) {
      var want = String(status || "").trim().toLowerCase();
      for (var i = 0; i < allowed.length; i++) {
        if (String(allowed[i]).trim().toLowerCase() === want) return String(allowed[i]);
      }
      return null;
    }
  }
  return status + "|" + displayDate;
}

// Writes one month cell; never throws (one refused cell must not stop the
// nightly run). Returns true when written.
function writeTrackerCell_(range, status, displayDate) {
  var value = trackerCellValue_(range, status, displayDate);
  if (value === null) return false;
  try {
    range.setValue(value);
    return true;
  } catch (e) {
    logError("writeTrackerCell_", e, { status: status });
    return false;
  }
}

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

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;

  var monthCol = findOrCreateMonthColumn_(sheet, monthHeader);
  var lastSampleCol = trackerLastSampleCol_(sheet);

  // Find equipment row (or add one)
  var colAVals = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 1).getValues() : [];
  var rowIdx = 0;
  for (var r = 0; r < colAVals.length; r++) {
    if (String(colAVals[r][0]).trim() === equipCode) { rowIdx = r + 1; break; }
  }
  if (!rowIdx) {
    rowIdx = lastRow + 1;
    sheet.getRange(rowIdx, 1).setValue(equipCode);
  }
  if (lastSampleCol) {
    try { sheet.getRange(rowIdx, lastSampleCol).setValue(sampleDate); } catch (e) { logError("updateSampleTrackerMonthly:lastSample", e, { equipCode: equipCode }); }
  }
  writeTrackerCell_(sheet.getRange(rowIdx, monthCol), status, displayDate);
  return true;
}

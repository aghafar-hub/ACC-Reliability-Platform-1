// Phase 4 — lab report flow.
//
//  1. Either engineer (ACC or the contractor's) uploads the lab report
//     (a Data_Entry row, through Add Report). It starts as "Pending
//     Validation"; the contractor's engineers are asked to validate it and
//     the ACC engineers are informed.
//  2. The contractor's Contractor Engineer validates it — also when ACC
//     uploaded it. Only then does a Caution/Alert result create the Draft
//     action (ActionWorkflow.js's applyLabResultRule_).
//  3. An ACC Engineer can return a missing or incorrect report with a
//     reason; the uploader and the contractor's engineers are told. Saving
//     the corrected report puts it back to Pending Validation.
//
// Rows from before Phase 4 have no status and count as validated.
//
// Server-owned Data_Entry columns after Sample_UID (0-based 39):
//   40 Validation Status   41 Uploaded By   42 Uploaded Date
//   43 Validated By   44 Validated Date
//   45 Return Reason   46 Returned By   47 Returned Date

var LAB_STATUS = { PENDING: "Pending Validation", VALIDATED: "Validated", RETURNED: "Returned" };
var LAB_COL = { UID: 39, STATUS: 40, UPLOADED_BY: 41, UPLOADED_DATE: 42, VALIDATED_BY: 43, VALIDATED_DATE: 44, RETURN_REASON: 45, RETURNED_BY: 46, RETURNED_DATE: 47 };
var LAB_APP_COLS = 40;
var LAB_HEADERS = ["Validation Status", "Uploaded By", "Uploaded Date", "Validated By", "Validated Date", "Return Reason", "Returned By", "Returned Date"];
var LAB_HEADER_ROW = 5; // Data_Entry: rows 1-4 title, 5 header, data from 6

function ensureLabHeaders_(sheet) {
  var range = sheet.getRange(LAB_HEADER_ROW, LAB_APP_COLS + 1, 1, LAB_HEADERS.length);
  var current = range.getValues()[0];
  var needs = false;
  for (var i = 0; i < LAB_HEADERS.length; i++) {
    var v = String(current[i] || "").trim();
    if (!v) { needs = true; continue; }
    if (v !== LAB_HEADERS[i]) {
      throw new Error("Data_Entry column " + columnLetter_(LAB_APP_COLS + 1 + i) + " already holds \"" + v + "\". Move it before using lab report validation.");
    }
  }
  if (needs) range.setValues([LAB_HEADERS]);
}

function findSampleRow_(ss, data) {
  var sheet = ss.getSheetByName("Data_Entry");
  if (!sheet) return { error: "Data_Entry sheet not found" };
  var uid = String(data.sampleUid || "").trim();
  var start = dataStartRowFor("Data_Entry");
  var rowIdx = uid
    ? findRowIndex(sheet, [LAB_COL.UID], [uid], start)
    : findRowIndex(sheet, [0, 3], [String(data.equipmentCode || "").trim(), String(data.sampleId || "").trim()], start);
  if (rowIdx === -1) return { error: "Lab report not found" };
  var row = sheet.getRange(rowIdx, 1, 1, LAB_APP_COLS + LAB_HEADERS.length).getValues()[0];
  return { sheet: sheet, rowIdx: rowIdx, row: row };
}

function labStatusOf_(row) {
  return String(row[LAB_COL.STATUS] || "").trim();
}

function sampleLabel_(row) {
  var d = asDate_(row[4]);
  return String(row[0] || "") + (d ? " (" + formatDateForEmail_(d) + ")" : "");
}

// Contractor a lab-report step belongs to (the point's own contractor).
function getSampleContractor_(ss, data) {
  var found = findSampleRow_(ss, data);
  return found.error ? null : resolveLpContractor_(found.row[0]);
}

// After the app saves a Data_Entry row (append or edit).
function onLabReportSaved_(ss, row, actingUser, isNew) {
  if (!row) return;
  var found = findSampleRow_(ss, { sampleUid: row[LAB_COL.UID], equipmentCode: row[0], sampleId: row[3] });
  if (found.error) return;
  ensureLabHeaders_(found.sheet);
  var status = labStatusOf_(found.row);
  var contractor = resolveLpContractor_(found.row[0]);
  if (isNew) {
    found.sheet.getRange(found.rowIdx, LAB_COL.STATUS + 1, 1, 3).setValues([[LAB_STATUS.PENDING, actingUser || "", new Date()]]);
  } else if (status === LAB_STATUS.RETURNED) {
    found.sheet.getRange(found.rowIdx, LAB_COL.STATUS + 1).setValue(LAB_STATUS.PENDING);
  } else {
    return;
  }
  try {
    var msg = (isNew ? "Lab report uploaded for " : "Corrected lab report for ") + sampleLabel_(found.row) +
      (found.row[5] ? " — " + found.row[5] : "") + (actingUser ? " by " + actingUser : "") + ". Waiting for the contractor engineer to validate.";
    recordInAppNotificationForEach_(ss, getNotifyReviewers_(contractor), "lab-report-uploaded", msg, contractor, "oilreport", String(found.row[0] || ""));
  } catch (e) {
    logError("onLabReportSaved_:notify", e, {});
  }
}

function validateLabReport(ss, data) {
  var found = findSampleRow_(ss, data);
  if (found.error) return found;
  var status = labStatusOf_(found.row);
  if (status === LAB_STATUS.VALIDATED || status === "") return { status: "ok", unchanged: true };
  if (status !== LAB_STATUS.PENDING) return { error: "This report was returned for correction — it has to be corrected first" };
  ensureLabHeaders_(found.sheet);
  found.sheet.getRange(found.rowIdx, LAB_COL.STATUS + 1, 1, 1).setValue(LAB_STATUS.VALIDATED);
  found.sheet.getRange(found.rowIdx, LAB_COL.VALIDATED_BY + 1, 1, 2).setValues([[data.actingUser || "", new Date()]]);
  stampLastModified(found.sheet, "Data_Entry", found.rowIdx);
  // Caution / Alert → Draft action, now that the result is validated.
  var fresh = found.sheet.getRange(found.rowIdx, 1, 1, LAB_APP_COLS).getValues()[0];
  try { applyLabResultRule_(ss, fresh); } catch (e) { logError("validateLabReport:applyLabResultRule_", e, {}); }
  return { status: "ok" };
}

function returnLabReport(ss, data) {
  var reason = String(data.reason || "").trim();
  if (!reason) return { error: "A reason is required to return a report" };
  var found = findSampleRow_(ss, data);
  if (found.error) return found;
  ensureLabHeaders_(found.sheet);
  found.sheet.getRange(found.rowIdx, LAB_COL.STATUS + 1).setValue(LAB_STATUS.RETURNED);
  found.sheet.getRange(found.rowIdx, LAB_COL.RETURN_REASON + 1, 1, 3).setValues([[reason, data.actingUser || "", new Date()]]);
  stampLastModified(found.sheet, "Data_Entry", found.rowIdx);
  try {
    var contractor = resolveLpContractor_(found.row[0]);
    var people = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
    var uploader = String(found.row[LAB_COL.UPLOADED_BY] || "").trim();
    if (uploader && people.indexOf(uploader) === -1) people.push(uploader);
    var msg = "Lab report " + sampleLabel_(found.row) + " was returned for correction by " + (data.actingUser || "ACC") + ": " + reason;
    recordInAppNotificationForEach_(ss, people, "lab-report-returned", msg, contractor, "oilreport", String(found.row[0] || ""));
    if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: lab report returned — " + sampleLabel_(found.row), body: msg });
  } catch (e) {
    logError("returnLabReport:notify", e, {});
  }
  return { status: "ok" };
}

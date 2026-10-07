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
//  4. A validated report can only be changed by an ACC Engineer, and any
//     real change sends it back to Pending Validation: the contractor's
//     engineers validate it again (and a Caution/Alert then makes its
//     Draft action). Reports from before Phase 4 follow the same rule but
//     never make a Draft — old results already have their actions.
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

// The lab report's own header (account, sample and equipment panels), read
// by the PDF import and saved with each new sample — so the Oil Analysis
// Report shows them from the report, not typed into the app. Data_Entry
// columns after Returned Date (0-based 48–57).
var LAB_INFO_COL = 48;
var LAB_INFO_FIELDS = [
  ["accountId", "Account ID"],
  ["accountName", "Account Name"],
  ["accountAddress", "Account Address"],
  ["assetId", "Asset ID"],
  ["serviceLevel", "Service Level"],
  ["bottleId", "Bottle ID"],
  ["testedLubricant", "Tested Lubricant"],
  ["assetClass", "Asset Class"],
  ["manufacturer", "Manufacturer"],
  ["model", "Model"]
];

function ensureLabInfoHeaders_(sheet) {
  var headers = LAB_INFO_FIELDS.map(function (f) { return f[1]; });
  var range = sheet.getRange(LAB_HEADER_ROW, LAB_INFO_COL + 1, 1, headers.length);
  var current = range.getValues()[0];
  var needs = false;
  for (var i = 0; i < headers.length; i++) {
    var v = String(current[i] || "").trim();
    if (!v) { needs = true; continue; }
    if (v !== headers[i]) {
      throw new Error("Data_Entry column " + columnLetter_(LAB_INFO_COL + 1 + i) + " already holds \"" + v + "\". Move it before importing report details.");
    }
  }
  if (needs) range.setValues([headers]);
}

// Plain text only — a value starting with = + - @ would otherwise be taken
// by Sheets as a formula.
function labInfoText_(v) {
  var s = String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function writeLabReportInfo_(ss, row, info) {
  if (!row || !info) return;
  var values = LAB_INFO_FIELDS.map(function (f) { return labInfoText_(info[f[0]]); });
  if (!values.some(function (v) { return v; })) return;
  var found = findSampleRow_(ss, { sampleUid: row[LAB_COL.UID], equipmentCode: row[0], sampleId: row[3] });
  if (found.error) return;
  ensureLabInfoHeaders_(found.sheet);
  found.sheet.getRange(found.rowIdx, LAB_INFO_COL + 1, 1, values.length).setValues([values]);
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

function normLabCell_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd").slice(0, 10);
  var s = String(v == null ? "" : v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2} [A-Za-z]{3,9},? \d{4}$/.test(s)) { // "01 Oct 2026" (the app's display form)
    var d = new Date(s.replace(/\bSept\b/i, "Sep").replace(",", ""));
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd").slice(0, 10);
  }
  if (s !== "" && !isNaN(Number(s))) return String(Number(s));
  return s;
}

// Before an edit of a Data_Entry row is written. Returns { error } or
// { reopen: true } when a validated report is really being changed.
function guardLabReportEdit_(session, sheet, rowIdx, newRow) {
  if (!newRow) return {};
  var current = sheet.getRange(rowIdx, 1, 1, LAB_APP_COLS + 1).getValues()[0];
  var status = String(current[LAB_COL.STATUS] || "").trim();
  if (status !== LAB_STATUS.VALIDATED && status !== "") return {};
  var changed = false;
  var stampIdx = (LAST_MODIFIED_COL["Data_Entry"] || 0) - 1; // server-owned, never a "change"
  for (var i = 0; i < Math.min(newRow.length, LAB_APP_COLS); i++) {
    if (i === stampIdx) continue;
    if (normLabCell_(current[i]) !== normLabCell_(newRow[i])) { changed = true; break; }
  }
  if (!changed) return {};
  if (!isAccEngineer_(session)) return { error: "This lab report is validated — only an ACC Engineer can change it." };
  return { reopen: true };
}

// After the app saves a Data_Entry row (append or edit).
function onLabReportSaved_(ss, row, actingUser, isNew, reopen) {
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
  } else if (reopen) {
    // changed by an ACC Engineer after validation: validate again
    found.sheet.getRange(found.rowIdx, LAB_COL.STATUS + 1).setValue(LAB_STATUS.PENDING);
    found.sheet.getRange(found.rowIdx, LAB_COL.VALIDATED_BY + 1, 1, 2).setValues([["", ""]]);
    try {
      var reMsg = "Lab report " + sampleLabel_(found.row) + " was changed by " + (actingUser || "an ACC Engineer") + " after validation" +
        (found.row[5] ? " (result now " + found.row[5] + ")" : "") + ". Please validate it again.";
      recordInAppNotificationForEach_(ss, getNotifyReviewers_(contractor), "lab-report-reopened", reMsg, contractor, "oilreport", String(found.row[0] || ""));
      var ceList = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
      if (ceList.length) sendNotificationEmail_({ to: ceList.join(","), subject: "Oil Lubrication: lab report changed — validate again — " + sampleLabel_(found.row), body: reMsg });
    } catch (e) {
      logError("onLabReportSaved_:reopen", e, {});
    }
    return;
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
  // Caution / Alert → Draft action, now that the result is validated —
  // only for reports added through the app (they have an Uploaded Date);
  // reports from before Phase 4 already have their actions.
  var fresh = found.sheet.getRange(found.rowIdx, 1, 1, LAB_APP_COLS).getValues()[0];
  if (found.row[LAB_COL.UPLOADED_DATE]) {
    try { applyLabResultRule_(ss, fresh); } catch (e) { logError("validateLabReport:applyLabResultRule_", e, {}); }
  }
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

// Sample IDs compare trimmed and case-insensitive ("s-001 " = "S-001").
function normSampleId_(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}

function sampleIdExists_(ss, sampleId) {
  var id = normSampleId_(sampleId);
  if (!id) return false;
  return readSheet(ss, "Data_Entry", true).some(function (r) { return normSampleId_(r[3]) === id; });
}

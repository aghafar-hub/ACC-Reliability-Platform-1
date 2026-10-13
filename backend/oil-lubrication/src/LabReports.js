// Phase 4 — lab report flow.
//
//  1. Either engineer (ACC or the contractor's) uploads the lab report
//     (a Data_Entry row, through Add Report). It starts as "Pending
//     Validation"; the ACC Engineers are asked to validate it and the
//     contractor's engineers are informed.
//  2. An ACC Engineer validates it (after opening the lab's PDF, when one
//     is kept) — also when ACC uploaded it. Only then does a Caution/Alert
//     result create the Draft action (ActionWorkflow.js's
//     applyLabResultRule_).
//  3. An ACC Engineer can return a missing or incorrect report with a
//     reason; the uploader and the contractor's engineers are told. Saving
//     the corrected report puts it back to Pending Validation.
//
// Rows from before Phase 4 have no status and count as validated.
//
//  4. A validated report can only be changed by an ACC Engineer, and any
//     real change sends it back to Pending Validation: an ACC Engineer
//     validates it again (and a Caution/Alert then makes its
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
// columns after Returned Date (0-based 48–60; 58 = the viscosity test
// temperature, 40 or 100 °C; 59 = the ISO 4406 code, e.g. "22/21/19";
// 60 = the key of the lab's own PDF, see saveLabReportPdf_).
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
  ["model", "Model"],
  ["viscTemp", "Visc Temp (°C)"],
  ["isoCode", "ISO Code (4/6/14)"],
  ["reportFile", "Report PDF"]
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
  // also "20/18/17": Sheets would read a code like that as a date
  return /^[=+\-@]/.test(s) || /^\d+\/\d+/.test(s) ? "'" + s : s;
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

// Re-importing a report that's already saved: fill in its report details
// and results where they're still empty (reports saved before the import
// kept them). Never overwrites a value, so the report isn't sent back for
// validation — a value that differs is corrected with correctLabReport.
// Found by Sample ID and, when given, the point (lpId): a Sample ID can be
// saved more than once (a copy typed into the sheet); every copy of it on
// that point is returned, never a sample of another point.
function findSampleRowsById_(ss, sampleId, lpId) {
  var sheet = ss.getSheetByName("Data_Entry");
  if (!sheet) return { error: "Data_Entry sheet not found" };
  var id = normSampleId_(sampleId);
  if (!id) return { error: "Sample ID is required" };
  var lp = String(lpId || "").trim();
  var start = dataStartRowFor("Data_Entry");
  var last = sheet.getLastRow();
  if (last < start) return { error: "Lab report not found" };
  var keys = sheet.getRange(start, 1, last - start + 1, 4).getValues();
  var rows = [];
  for (var i = 0; i < keys.length; i++) {
    if (normSampleId_(keys[i][3]) !== id) continue;
    var rowLp = String(keys[i][0] || "").trim();
    if (lp && rowLp !== lp) continue;
    rows.push({ sheet: sheet, rowIdx: start + i, lpId: rowLp });
  }
  if (!rows.length) return { error: "Lab report not found" };
  return { sheet: sheet, rows: rows, lpId: rows[0].lpId, rowIdx: rows[0].rowIdx };
}

// Data_Entry columns (0-based) a re-import may fill when empty, or correct:
// Report Status and the three ratings (5–8), particle counts … Zn (9–34).
// The import used to miss Mg and save a 0 reading as an empty cell; the
// client sends { "<column>": value }.
var LAB_FILL_RESULT_FIRST = 5;
var LAB_FILL_RESULT_LAST = 34;
var LAB_TEXT_RESULT_LAST = 8; // 5–8 are words (Normal / Caution / Alert)

function labResultValue_(col, v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  if (col <= LAB_TEXT_RESULT_LAST) {
    var w = String(v).trim().toLowerCase();
    return w === "normal" ? "Normal" : w === "caution" ? "Caution" : w === "alert" ? "Alert" : null;
  }
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function fillLabReportInfo_(found, info) {
  ensureLabInfoHeaders_(found.sheet);
  var range = found.sheet.getRange(found.rowIdx, LAB_INFO_COL + 1, 1, LAB_INFO_FIELDS.length);
  var current = range.getValues()[0];
  var filled = 0;
  var next = LAB_INFO_FIELDS.map(function (f, i) {
    var have = String(current[i] == null ? "" : current[i]).trim();
    var incoming = labInfoText_(info[f[0]]);
    if (!have && incoming) { filled++; return incoming; }
    return current[i];
  });
  if (filled) range.setValues([next]);
  // Results the PDF import used to miss (Mg was never read before the
  // fix): an empty cell is filled from the re-imported report; a value
  // already there is never changed.
  Object.keys(info.results || {}).forEach(function (k) {
    var col = Number(k);
    if (!(col >= LAB_FILL_RESULT_FIRST && col <= LAB_FILL_RESULT_LAST) || Math.floor(col) !== col) return;
    var v = labResultValue_(col, info.results[k]);
    if (v === null) return;
    var cell = found.sheet.getRange(found.rowIdx, col + 1);
    if (String(cell.getValue()).trim() !== "") return;
    cell.setValue(v);
    filled++;
  });
  return filled;
}

// POST correctLabReport: a saved sample whose values differ from the lab's
// report (a typing mistake, a copy typed into the sheet, a lab re-issue) is
// corrected from the re-imported PDF — every copy of it on that point. The
// report then waits for an ACC Engineer to validate it again: a Returned
// one counts as corrected, a Validated one is re-opened (only an ACC
// Engineer may change that one). data: { sampleId, lpId, values:
// { "<column>": value } (columns 5–34), labInfo: { isoCode, reportFile } }.
function correctLabReport_(ss, data, session, actingUser) {
  var found = findSampleRowsById_(ss, data.sampleId, data.lpId);
  if (found.error) return found;
  var values = {};
  Object.keys(data.values || {}).forEach(function (k) {
    var col = Number(k);
    if (!(col >= LAB_FILL_RESULT_FIRST && col <= LAB_FILL_RESULT_LAST) || Math.floor(col) !== col) return;
    var v = labResultValue_(col, data.values[k]);
    if (v !== null) values[col] = v;
  });
  var info = data.labInfo || {};
  var iso = labInfoText_(info.isoCode);
  var pdfKey = LAB_PDF_KEY_RE.test(String(info.reportFile || "")) ? String(info.reportFile) : "";
  if (!Object.keys(values).length && !iso) return { error: "Nothing to correct" };
  ensureLabHeaders_(found.sheet);
  var accEng = isAccEngineer_(session);
  var changedRows = 0, reopened = false;
  for (var r = 0; r < found.rows.length; r++) {
    var row = found.sheet.getRange(found.rows[r].rowIdx, 1, 1, LAB_APP_COLS + LAB_HEADERS.length).getValues()[0];
    var status = labStatusOf_(row);
    var diff = Object.keys(values).filter(function (c) { return normLabCell_(row[c]) !== normLabCell_(values[c]); });
    if (!diff.length && !iso) continue;
    if ((status === LAB_STATUS.VALIDATED || status === "") && !accEng) {
      return { error: "Sample " + data.sampleId + " is validated — only an ACC Engineer can correct it." };
    }
  }
  found.rows.forEach(function (f) {
    var rowIdx = f.rowIdx;
    var row = found.sheet.getRange(rowIdx, 1, 1, LAB_APP_COLS + LAB_HEADERS.length).getValues()[0];
    var status = labStatusOf_(row);
    var diff = Object.keys(values).filter(function (c) { return normLabCell_(row[c]) !== normLabCell_(values[c]); });
    var isoCell = found.sheet.getRange(rowIdx, LAB_INFO_COL + 12);
    var isoChanged = iso && String(isoCell.getValue()).replace(/^'/, "") !== iso.replace(/^'/, "");
    if (!diff.length && !isoChanged) return;
    diff.forEach(function (c) { found.sheet.getRange(rowIdx, Number(c) + 1).setValue(values[c]); });
    if (diff.length || isoChanged) {
      ensureLabInfoHeaders_(found.sheet);
      if (isoChanged) isoCell.setValue(iso);
      if (pdfKey) found.sheet.getRange(rowIdx, LAB_PDF_COL + 1).setValue(pdfKey); // the PDF these values come from
    }
    if (status !== LAB_STATUS.PENDING) {
      found.sheet.getRange(rowIdx, LAB_COL.STATUS + 1).setValue(LAB_STATUS.PENDING);
      if (status !== LAB_STATUS.RETURNED) {
        found.sheet.getRange(rowIdx, LAB_COL.VALIDATED_BY + 1, 1, 2).setValues([["", ""]]);
        reopened = true;
      }
    }
    stampLastModified(found.sheet, "Data_Entry", rowIdx);
    changedRows++;
  });
  if (!changedRows) return { status: "ok", unchanged: true, lpId: found.lpId };
  try {
    var label = sampleLabel_(found.sheet.getRange(found.rowIdx, 1, 1, LAB_APP_COLS).getValues()[0]);
    var contractor = resolveLpContractor_(found.lpId);
    var msg = "Lab report " + label + " was corrected from the lab's PDF by " + (actingUser || "an engineer") +
      (reopened ? " after validation" : "") + ". Please validate it again.";
    recordInAppNotificationForEach_(ss, getNotifyReviewers_(contractor), "lab-report-uploaded", msg, contractor, "oilreport", found.lpId);
  } catch (e) {
    logError("correctLabReport_:notify", e, {});
  }
  return { status: "ok", corrected: changedRows, lpId: found.lpId };
}

// ── Rejected and returned reports ─────────────────────────────────────────
// A report that should not be in the system (wrong point, not our sample,
// a duplicate) is rejected: its row moves to "Lab Reports Removed" (all its
// values, with who, when and why — nothing is lost) and leaves Data_Entry.
// A returned report is corrected (re-import its PDF, or edit it) or removed
// by the contractor; one still returned after LAB_RETURNED_KEEP_DAYS days is
// removed by the daily run, so returned reports don't pile up.
var LAB_REMOVED_SHEET = "Lab Reports Removed";
var LAB_RETURNED_KEEP_DAYS = 30;

function archiveLabReportRow_(ss, sheet, rowIdx, by, why) {
  var width = LAB_INFO_COL + LAB_INFO_FIELDS.length;
  var row = sheet.getRange(rowIdx, 1, 1, width).getValues()[0];
  var arch = ss.getSheetByName(LAB_REMOVED_SHEET);
  if (!arch) {
    arch = ss.insertSheet(LAB_REMOVED_SHEET);
    var head = sheet.getRange(LAB_HEADER_ROW, 1, 1, width).getValues()[0];
    arch.appendRow(["Removed Date", "Removed By", "Why"].concat(head));
    arch.setFrozenRows(1);
  }
  arch.appendRow([new Date(), by || "", why || ""].concat(row));
  sheet.deleteRow(rowIdx);
  return row;
}

function notifyLabRemoved_(ss, row, msg) {
  try {
    var contractor = resolveLpContractor_(row[0]);
    var people = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
    var uploader = String(row[LAB_COL.UPLOADED_BY] || "").trim();
    if (uploader && people.indexOf(uploader) === -1) people.push(uploader);
    recordInAppNotificationForEach_(ss, people, "lab-report-returned", msg, contractor, "oilreport", String(row[0] || ""));
    if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: lab report removed — " + sampleLabel_(row), body: msg }, 'labReport');
  } catch (e) {
    logError("notifyLabRemoved_", e, {});
  }
}

// POST rejectLabReport (ACC Engineer): a Pending or Returned report.
function rejectLabReport(ss, data) {
  var reason = String(data.reason || "").trim();
  if (!reason) return { error: "A reason is required to reject a report" };
  var found = findSampleRow_(ss, data);
  if (found.error) return found;
  var status = labStatusOf_(found.row);
  if (status !== LAB_STATUS.PENDING && status !== LAB_STATUS.RETURNED) return { error: "Only a report waiting for validation or returned can be rejected" };
  var row = archiveLabReportRow_(ss, found.sheet, found.rowIdx, data.actingUser, "Rejected: " + reason);
  notifyLabRemoved_(ss, row, "Lab report " + sampleLabel_(row) + " was rejected by " + (data.actingUser || "ACC") + " and removed: " + reason);
  return { status: "ok", lpId: String(row[0] || "") };
}

// POST removeLabReport: the uploader's side gives up a Returned report.
function removeReturnedLabReport(ss, data) {
  var found = findSampleRow_(ss, data);
  if (found.error) return found;
  if (labStatusOf_(found.row) !== LAB_STATUS.RETURNED) return { error: "Only a returned report can be removed here" };
  var note = String(data.reason || "").trim();
  var row = archiveLabReportRow_(ss, found.sheet, found.rowIdx, data.actingUser, "Removed after return" + (note ? ": " + note : ""));
  return { status: "ok", lpId: String(row[0] || "") };
}

// Daily: returned reports nobody corrected within LAB_RETURNED_KEEP_DAYS.
function cleanupReturnedLabReports_(ss) {
  var sheet = ss.getSheetByName("Data_Entry");
  if (!sheet) return 0;
  var start = dataStartRowFor("Data_Entry");
  var last = sheet.getLastRow();
  if (last < start) return 0;
  var vals = sheet.getRange(start, 1, last - start + 1, LAB_APP_COLS + LAB_HEADERS.length).getValues();
  var limit = Date.now() - LAB_RETURNED_KEEP_DAYS * 86400000;
  var removed = 0;
  for (var i = vals.length - 1; i >= 0; i--) { // bottom up: deleting keeps the rows above in place
    if (labStatusOf_(vals[i]) !== LAB_STATUS.RETURNED) continue;
    var when = asDate_(vals[i][LAB_COL.RETURNED_DATE]);
    if (!when || when.getTime() > limit) continue;
    var row = archiveLabReportRow_(ss, sheet, start + i, "Daily clean-up", "Returned " + LAB_RETURNED_KEEP_DAYS + "+ days ago and not corrected: " + String(vals[i][LAB_COL.RETURN_REASON] || ""));
    notifyLabRemoved_(ss, row, "Lab report " + sampleLabel_(row) + " was returned " + LAB_RETURNED_KEEP_DAYS + "+ days ago and never corrected, so it was removed. Import it again if the sample is still needed.");
    removed++;
  }
  return removed;
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
  var changes = labChangedColumns_(current, newRow);
  // the Admin fixes data: the report stays validated (the audit keeps
  // every change); an ACC Engineer's change is validated again
  if ((session.roles || []).indexOf("ROLE-ADMIN") !== -1) return { admin: true, changes: changes };
  return { reopen: true, changes: changes };
}

var LAB_COL_NAMES = ["LP", "Report ID", "Description", "Sample ID", "Sample date", "Report status", "Contamination", "Equipment", "Lubricant",
  "PC>4", "PC>6", "PC>14", "PQ", "Visc", "TAN", "Oxidation", "Water", "Ag", "Al", "Cr", "Cu", "Fe", "Mo", "Ni", "Pb", "Sn", "K", "Na", "Si",
  "B", "Ba", "Ca", "Mg", "P", "Zn", "Alert type", "Recommendations", "Lab marks"];

// "Al 5→59, Si 1046→106" — for the audit log.
function labChangedColumns_(current, newRow) {
  var out = [];
  for (var i = 4; i < Math.min(newRow.length, LAB_COL_NAMES.length); i++) {
    var a = normLabCell_(current[i]), b = normLabCell_(newRow[i]);
    if (a === b) continue;
    out.push(LAB_COL_NAMES[i] + (i >= 35 ? " changed" : " " + (a || "—") + "→" + (b || "—")));
  }
  return out.join(", ").slice(0, 400);
}

function setLabIsoCode_(sheet, rowIdx, iso) {
  ensureLabInfoHeaders_(sheet);
  sheet.getRange(rowIdx, LAB_INFO_COL + 12).setValue(labInfoText_(iso));
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
      var accList = maResponsibleEmails_(MA_RESP.ACC, "");
      if (accList.length) sendNotificationEmail_({ to: accList.join(","), subject: "Oil Lubrication: lab report changed — validate again — " + sampleLabel_(found.row), body: reMsg }, 'labReport');
    } catch (e) {
      logError("onLabReportSaved_:reopen", e, {});
    }
    return;
  } else {
    return;
  }
  try {
    var msg = (isNew ? "Lab report uploaded for " : "Corrected lab report for ") + sampleLabel_(found.row) +
      (found.row[5] ? " — " + found.row[5] : "") + (actingUser ? " by " + actingUser : "") + ". Waiting for an ACC Engineer to validate.";
    recordInAppNotificationForEach_(ss, getNotifyReviewers_(contractor), "lab-report-uploaded", msg, contractor, "oilreport", String(found.row[0] || ""));
  } catch (e) {
    logError("onLabReportSaved_:notify", e, {});
  }
}

// ── The lab's own PDF ─────────────────────────────────────────────────────
// Kept at import (one file per imported PDF, in this script's Drive folder,
// never shared) so whoever validates checks every value against the lab's
// report: Validate is refused until that person has opened it.
var LAB_PDF_COL = LAB_INFO_COL + 12; // 0-based 60, "Report PDF"
var LAB_PDF_FOLDER_PROP = "LAB_PDF_FOLDER_ID";
var LAB_PDF_KEY_RE = /^LRP-[A-Za-z0-9-]{8,60}$/;
var LAB_PDF_MAX_BYTES = 15 * 1024 * 1024;
var LAB_PDF_VIEW_SECONDS = 6 * 60 * 60;

function labPdfFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(LAB_PDF_FOLDER_PROP);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder("Oil Lubrication - lab report PDFs (app)");
  props.setProperty(LAB_PDF_FOLDER_PROP, folder.getId());
  return folder;
}

function labPdfFile_(key) {
  var it = labPdfFolder_().getFilesByName(key + ".pdf");
  return it.hasNext() ? it.next() : null;
}

function saveLabReportPdf_(data) {
  var key = String(data.fileKey || "").trim();
  if (!LAB_PDF_KEY_RE.test(key)) return { error: "Invalid report file key" };
  var b64 = String(data.pdfBase64 || "");
  if (!b64) return { error: "No PDF received" };
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > LAB_PDF_MAX_BYTES) return { error: "The PDF is too large (over 15 MB)" };
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "%PDF") return { error: "This file is not a PDF" };
  if (labPdfFile_(key)) return { status: "ok", unchanged: true };
  var file = labPdfFolder_().createFile(Utilities.newBlob(bytes, "application/pdf", key + ".pdf"));
  file.setDescription(String(data.fileName || "").slice(0, 200));
  return { status: "ok" };
}

function labPdfViewKey_(email, row) {
  return "labpdf|" + String(email || "").toLowerCase() + "|" + normSampleId_(row[3]) + "|" + String(row[LAB_COL.UID] || "");
}

function labPdfKeyOf_(found) {
  return String(found.sheet.getRange(found.rowIdx, LAB_PDF_COL + 1).getValue() || "").trim();
}

// GET getLabReportPdf: the PDF of one saved sample (base64). Opening it is
// what allows this person to validate the report.
function getLabReportPdf_(ss, params, session, scope) {
  var found = findSampleRow_(ss, { sampleUid: params.sampleUid, equipmentCode: params.equipmentCode, sampleId: params.sampleId });
  if (found.error) return { status: "error", error: found.error };
  if (scope && resolveLpContractor_(found.row[0]) !== scope) return { status: "error", error: "This lab report belongs to another contractor." };
  var key = labPdfKeyOf_(found);
  if (!key) return { status: "ok", none: true };
  var file = labPdfFile_(key);
  if (!file) return { status: "ok", none: true, missing: true };
  try { CacheService.getScriptCache().put(labPdfViewKey_(session && session.email, found.row), "1", LAB_PDF_VIEW_SECONDS); } catch (e) { logError("getLabReportPdf_:cache", e, {}); }
  return { status: "ok", fileName: file.getDescription() || file.getName(), pdfBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

function validateLabReport(ss, data) {
  var found = findSampleRow_(ss, data);
  if (found.error) return found;
  var status = labStatusOf_(found.row);
  if (status === LAB_STATUS.VALIDATED || status === "") return { status: "ok", unchanged: true };
  if (status !== LAB_STATUS.PENDING) return { error: "This report was returned for correction — it has to be corrected first" };
  // the lab's PDF is kept with this report: it must have been opened first.
  // If its file can't be found (the upload failed), the ACC Engineer
  // validates against the values with a written reason (audit F-09).
  var pdfMissing = false;
  var pdfKey = labPdfKeyOf_(found);
  if (pdfKey && !CacheService.getScriptCache().get(labPdfViewKey_(data.actingUser, found.row))) {
    if (labPdfFile_(pdfKey)) return { error: "Open the lab report (PDF) and check its values before validating." };
    if (!String(data.pdfMissingReason || "").trim()) return { error: "The lab's PDF of this report is missing — write why you validate without it, or return the report so it is imported again." };
    pdfMissing = true;
  }
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
  return { status: "ok", pdfMissing: pdfMissing };
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
    var msg = "Lab report " + sampleLabel_(found.row) + " was returned for correction by " + (data.actingUser || "ACC") + ": " + reason +
      ". Correct it (import the lab's PDF again, or edit it) or remove it within " + LAB_RETURNED_KEEP_DAYS + " days — after that it is removed automatically.";
    recordInAppNotificationForEach_(ss, people, "lab-report-returned", msg, contractor, "oilreport", String(found.row[0] || ""));
    if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: lab report returned — " + sampleLabel_(found.row), body: msg }, 'labReport');
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

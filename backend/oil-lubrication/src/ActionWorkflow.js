// Phase 2 — action workflow.
//
// Statuses: Draft → Open → Waiting Stoppage → Closure Requested → Closed
// (Overdue is computed: an Open action not closed 14 days after its
// Revision Date). Old "In Progress" rows read as Open everywhere until
// migrateActionStatusesPhase2 rewrites the column.
//
//  - Draft: created automatically by a lab Caution/Alert result or by the
//    leakage rule (3 top-ups on one point within 30 days). Both engineers
//    are notified to edit it. It becomes Open when its Agreed Action is
//    saved.
//  - Closure: the Contractor Engineer requests closure with a comment, an
//    ACC Engineer approves (or rejects back to Open with a reason), then
//    the Contractor Engineer closes it. These steps only happen through the
//    actions below — the generic row save can't jump to them.
//
// Server-owned columns after "Assigned To" (T), 0-based:
//   20 Closure Request (comment)   21 Closure Requested By   22 Closure Requested Date
//   23 Closure Decision (Approved/Rejected)   24 Closure Decision By
//   25 Closure Decision Date   26 Closure Decision Note
//   27 Created By Rule ("Lab Caution", "Lab Alert", "Leakage")   28 Rule Reference
// The app's own row save only ever writes columns A–T, so these are never
// overwritten by an edit.

var ACTION_STATUS = {
  DRAFT: "Draft",
  OPEN: "Open",
  WAITING: "Waiting Stoppage",
  CLOSURE_REQUESTED: "Closure Requested",
  CLOSED: "Closed"
};
var LEGACY_ACTION_STATUS = { "In Progress": "Open" };
var ACTION_COL = {
  AC_NO: 0, LP: 1, REPORT_EQ: 2, DESCRIPTION: 3, OIL: 4, REVISION: 5, SAMPLE_DATE: 6,
  SAMPLE_RESULT: 7, SAMPLE_ANALYSIS: 8, LAST_CHANGE: 9, STATUS: 10, CONTRACTOR_ACTION: 11,
  CONTRACTOR: 12, COMPLETED: 13, PREV_AGREED: 14, ACC_ACTION: 15, AGREED: 16, CLOSING: 17,
  LAST_MODIFIED: 18, ASSIGNED: 19,
  CLOSURE_COMMENT: 20, CLOSURE_BY: 21, CLOSURE_DATE: 22,
  DECISION: 23, DECISION_BY: 24, DECISION_DATE: 25, DECISION_NOTE: 26,
  RULE: 27, RULE_REF: 28
};
var ACTION_APP_COLS = 20; // A–T: what the app's own row save writes
var ACTION_WORKFLOW_HEADERS = [
  "Closure Request", "Closure Requested By", "Closure Requested Date",
  "Closure Decision", "Closure Decision By", "Closure Decision Date", "Closure Decision Note",
  "Created By Rule", "Rule Reference"
];
var ACTION_HEADER_ROW = 5; // Action Tracker: rows 1-4 title, row 5 header, data from 6
var LAB_DRAFT_STATUSES = { "Caution": "Lab Caution", "Warning": "Lab Caution", "Alert": "Lab Alert" };
// Only recent lab results make a Draft — importing old reports in bulk
// must not flood the tracker with drafts for long-past samples.
var LAB_DRAFT_MAX_AGE_DAYS = 45;
var LEAKAGE_TOP_UPS = 3;
var LEAKAGE_WINDOW_DAYS = 30;

function normActionStatus_(status) {
  var s = String(status || "").trim();
  return LEGACY_ACTION_STATUS[s] || s;
}

// Writes the workflow headers (U–AC) the first time they're needed. Refuses
// if those cells already hold something else, rather than overwrite it.
function ensureActionWorkflowHeaders_(sheet) {
  var range = sheet.getRange(ACTION_HEADER_ROW, ACTION_APP_COLS + 1, 1, ACTION_WORKFLOW_HEADERS.length);
  var current = range.getValues()[0];
  var needsWrite = false;
  for (var i = 0; i < ACTION_WORKFLOW_HEADERS.length; i++) {
    var v = String(current[i] || "").trim();
    if (!v) { needsWrite = true; continue; }
    if (v !== ACTION_WORKFLOW_HEADERS[i]) {
      throw new Error("Action Tracker column " + columnLetter_(ACTION_APP_COLS + 1 + i) + " already holds \"" + v +
        "\". Move it before using the action workflow.");
    }
  }
  if (needsWrite) range.setValues([ACTION_WORKFLOW_HEADERS]);
}

function columnLetter_(n) {
  var s = "";
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function actionKeyLabel_(row) {
  return String(row[ACTION_COL.AC_NO] || "").trim() + " (" + String(row[ACTION_COL.LP] || "").trim() + ")";
}

function actionContractor_(row) {
  return String(row[ACTION_COL.CONTRACTOR] || "").trim() || resolveLpContractor_(row[ACTION_COL.LP]);
}

// ── Guard for the app's own row save (generic append/updateRow) ─────────
//
// Returns an error message, or null when the save may go ahead. May adjust
// `row` in place: a Draft with an Agreed Action saved becomes Open, and
// anything past column T is dropped (server-owned).
function guardActionTrackerSave_(session, sheet, rowIdx, row) {
  if (!row) return null;
  if (row.length > ACTION_APP_COLS) row.length = ACTION_APP_COLS;
  var agreed = String(row[ACTION_COL.AGREED] || "").trim();
  var next = normActionStatus_(row[ACTION_COL.STATUS]) || ACTION_STATUS.OPEN;
  if (next === ACTION_STATUS.DRAFT && agreed) {
    next = ACTION_STATUS.OPEN;
    row[ACTION_COL.STATUS] = ACTION_STATUS.OPEN;
  }
  var isAdmin = ((session && session.roles) || []).indexOf("ROLE-ADMIN") !== -1;
  if (isAdmin) return null;

  var editable = [ACTION_STATUS.DRAFT, ACTION_STATUS.OPEN, ACTION_STATUS.WAITING];
  if (rowIdx === -1) {
    // New action
    if (editable.indexOf(next) === -1) return "A new action can only be Draft, Open or Waiting Stoppage.";
    return null;
  }
  var current = normActionStatus_(sheet.getRange(rowIdx, ACTION_COL.STATUS + 1).getValue()) || ACTION_STATUS.OPEN;
  if (next === current) return null;
  if (editable.indexOf(current) !== -1 && editable.indexOf(next) !== -1) {
    if (current === ACTION_STATUS.DRAFT && !agreed) return "Save the Agreed Action first — a Draft becomes Open once it has one.";
    return null;
  }
  if (next === ACTION_STATUS.CLOSURE_REQUESTED || next === ACTION_STATUS.CLOSED) {
    return "Use Request closure — an ACC Engineer approves it, then the Contractor Engineer closes it.";
  }
  return "This action is " + current + "; its status can't be changed here.";
}

// ── Closure: request → ACC decision → close ──────────────────────────────

function findActionRow_(ss, acNo, lpId) {
  var sheet = ss.getSheetByName("Action Tracker");
  if (!sheet) return { error: "Action Tracker sheet not found" };
  var key = String(acNo || "").trim();
  var lp = String(lpId || "").trim();
  if (!key || !lp) return { error: "acNo and equipmentCode are required" };
  var rowIdx = findRowIndex(sheet, [ACTION_COL.AC_NO, ACTION_COL.LP], [key, lp], dataStartRowFor("Action Tracker"));
  if (rowIdx === -1) return { error: "Action not found" };
  var width = Math.max(sheet.getLastColumn ? sheet.getLastColumn() : 0, ACTION_APP_COLS + ACTION_WORKFLOW_HEADERS.length);
  var row = sheet.getRange(rowIdx, 1, 1, width).getValues()[0];
  return { sheet: sheet, rowIdx: rowIdx, row: row };
}

// Contractor that a closure step on this action belongs to — Code.js uses
// it for the permission check before any write.
function getActionContractor_(ss, acNo, lpId) {
  var found = findActionRow_(ss, acNo, lpId);
  return found.error ? null : actionContractor_(found.row);
}

function setActionCells_(sheet, rowIdx, values) {
  Object.keys(values).forEach(function (col) {
    sheet.getRange(rowIdx, Number(col) + 1).setValue(values[col]);
  });
  stampLastModified(sheet, "Action Tracker", rowIdx);
}

function requestActionClosure(ss, data) {
  var comment = String(data.comment || "").trim();
  if (!comment) return { error: "A comment is required to request closure" };
  var found = findActionRow_(ss, data.acNo, data.equipmentCode);
  if (found.error) return found;
  var status = normActionStatus_(found.row[ACTION_COL.STATUS]);
  if (status !== ACTION_STATUS.OPEN && status !== ACTION_STATUS.WAITING) {
    return { error: "Only an Open or Waiting Stoppage action can be put forward for closure" };
  }
  ensureActionWorkflowHeaders_(found.sheet);
  var cells = {};
  cells[ACTION_COL.STATUS] = ACTION_STATUS.CLOSURE_REQUESTED;
  cells[ACTION_COL.CLOSURE_COMMENT] = comment;
  cells[ACTION_COL.CLOSURE_BY] = data.actingUser || "";
  cells[ACTION_COL.CLOSURE_DATE] = new Date();
  cells[ACTION_COL.DECISION] = "";
  cells[ACTION_COL.DECISION_BY] = "";
  cells[ACTION_COL.DECISION_DATE] = "";
  cells[ACTION_COL.DECISION_NOTE] = "";
  setActionCells_(found.sheet, found.rowIdx, cells);

  try {
    var contractor = actionContractor_(found.row);
    var accEngineers = maResponsibleEmails_(MA_RESP.ACC, "");
    var msg = (data.actingUser || "The contractor") + " asked to close action " + actionKeyLabel_(found.row) + ": " + comment;
    recordInAppNotificationForEach_(ss, accEngineers, "action-closure-requested", msg, contractor, "actions", found.row[ACTION_COL.AC_NO]);
    if (accEngineers.length) {
      sendNotificationEmail_({ to: accEngineers.join(","), subject: "Oil Lubrication: closure requested — " + actionKeyLabel_(found.row), body: msg + "\n\nOpen Oil Actions in the ACC Reliability Platform to approve or reject it." });
    }
  } catch (e) {
    logError("requestActionClosure:notify", e, { acNo: data.acNo });
  }
  return { status: "ok" };
}

function decideActionClosure(ss, data) {
  var decision = String(data.decision || "").trim();
  if (decision !== "Approve" && decision !== "Reject") return { error: "decision must be Approve or Reject" };
  var note = String(data.note || "").trim();
  if (decision === "Reject" && !note) return { error: "A reason is required to reject a closure" };
  var found = findActionRow_(ss, data.acNo, data.equipmentCode);
  if (found.error) return found;
  var status = normActionStatus_(found.row[ACTION_COL.STATUS]);
  if (status !== ACTION_STATUS.CLOSURE_REQUESTED) return { error: "This action has no closure request waiting" };
  if (String(found.row[ACTION_COL.DECISION] || "").trim() === "Approved") return { status: "ok", unchanged: true };

  ensureActionWorkflowHeaders_(found.sheet);
  var cells = {};
  cells[ACTION_COL.DECISION] = decision === "Approve" ? "Approved" : "Rejected";
  cells[ACTION_COL.DECISION_BY] = data.actingUser || "";
  cells[ACTION_COL.DECISION_DATE] = new Date();
  cells[ACTION_COL.DECISION_NOTE] = note;
  if (decision === "Reject") cells[ACTION_COL.STATUS] = ACTION_STATUS.OPEN;
  setActionCells_(found.sheet, found.rowIdx, cells);

  try {
    var contractor = actionContractor_(found.row);
    var engineers = contractor ? maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor) : [];
    var msg = decision === "Approve"
      ? "Closure of action " + actionKeyLabel_(found.row) + " was approved by " + (data.actingUser || "ACC") + " — you can close it now." + (note ? " Note: " + note : "")
      : "Closure of action " + actionKeyLabel_(found.row) + " was rejected by " + (data.actingUser || "ACC") + ": " + note + ". It's Open again.";
    recordInAppNotificationForEach_(ss, engineers, decision === "Approve" ? "action-closure-approved" : "action-closure-rejected", msg, contractor, "actions", found.row[ACTION_COL.AC_NO]);
    if (engineers.length) {
      sendNotificationEmail_({ to: engineers.join(","), subject: "Oil Lubrication: closure " + (decision === "Approve" ? "approved" : "rejected") + " — " + actionKeyLabel_(found.row), body: msg });
    }
  } catch (e) {
    logError("decideActionClosure:notify", e, { acNo: data.acNo });
  }
  return { status: "ok" };
}

function closeAction(ss, data) {
  var found = findActionRow_(ss, data.acNo, data.equipmentCode);
  if (found.error) return found;
  var status = normActionStatus_(found.row[ACTION_COL.STATUS]);
  if (status === ACTION_STATUS.CLOSED) return { status: "ok", unchanged: true };
  if (status !== ACTION_STATUS.CLOSURE_REQUESTED || String(found.row[ACTION_COL.DECISION] || "").trim() !== "Approved") {
    return { error: "An ACC Engineer must approve the closure first" };
  }
  var closing = String(data.closingComment || "").trim() || String(found.row[ACTION_COL.CLOSURE_COMMENT] || "").trim();
  var cells = {};
  cells[ACTION_COL.STATUS] = ACTION_STATUS.CLOSED;
  cells[ACTION_COL.COMPLETED] = new Date();
  cells[ACTION_COL.CLOSING] = closing;
  setActionCells_(found.sheet, found.rowIdx, cells);

  try {
    var contractor = actionContractor_(found.row);
    var people = getNotifyReviewers_(contractor);
    var msg = "Action " + actionKeyLabel_(found.row) + " was closed by " + (data.actingUser || "the contractor") + (closing ? ": " + closing : ".");
    recordInAppNotificationForEach_(ss, people, "action-closed", msg, contractor, "actions", found.row[ACTION_COL.AC_NO]);
  } catch (e) {
    logError("closeAction:notify", e, { acNo: data.acNo });
  }
  return { status: "ok" };
}

// ── Draft actions created by rules ───────────────────────────────────────

function nextActionAcNo_(ss) {
  var max = 0;
  readSheet(ss, "Action Tracker", true).forEach(function (r) {
    var groups = String(r[ACTION_COL.AC_NO] || "").match(/\d+/g);
    if (groups) max = Math.max(max, parseInt(groups[groups.length - 1], 10));
  });
  return "0-" + (max + 1);
}

function latestOilChangeDate_(ss, lpId) {
  var latest = null;
  readSheet(ss, "Oil Change LOG", true).forEach(function (r) {
    if (String(r[1] || "").trim() !== lpId) return;
    var d = r[4] instanceof Date ? r[4] : new Date(r[4]);
    if (!isNaN(d.getTime()) && (!latest || d.getTime() > latest.getTime())) latest = d;
  });
  return latest;
}

// Creates a Draft action and tells both engineers to edit it. opts:
// { lpId, sampleDate, sampleResult, analysis, rule, ruleRef, reportEquipmentId }
function createDraftAction_(ss, opts) {
  var sheet = ss.getSheetByName("Action Tracker");
  if (!sheet) return null;
  ensureActionWorkflowHeaders_(sheet);
  var lpId = String(opts.lpId || "").trim();
  var reg = null;
  var equipment = readEquipmentRegistry().equipment || [];
  for (var i = 0; i < equipment.length; i++) {
    if (equipment[i].code === lpId) { reg = equipment[i]; break; }
  }
  var contractor = reg ? reg.contractor || "" : resolveLpContractor_(lpId);
  var acNo = nextActionAcNo_(ss);
  var row = [];
  for (var c = 0; c <= ACTION_COL.RULE_REF; c++) row.push("");
  row[ACTION_COL.AC_NO] = acNo;
  row[ACTION_COL.LP] = lpId;
  row[ACTION_COL.REPORT_EQ] = opts.reportEquipmentId || "";
  row[ACTION_COL.DESCRIPTION] = reg ? (reg.description || reg.lubricationPoint || "") : "";
  row[ACTION_COL.OIL] = reg ? (reg.lubricant || "") : "";
  row[ACTION_COL.REVISION] = new Date();
  row[ACTION_COL.SAMPLE_DATE] = opts.sampleDate || "";
  row[ACTION_COL.SAMPLE_RESULT] = opts.sampleResult || "";
  row[ACTION_COL.SAMPLE_ANALYSIS] = opts.analysis || "";
  row[ACTION_COL.LAST_CHANGE] = latestOilChangeDate_(ss, lpId) || "";
  row[ACTION_COL.STATUS] = ACTION_STATUS.DRAFT;
  row[ACTION_COL.CONTRACTOR] = contractor;
  row[ACTION_COL.RULE] = opts.rule || "";
  row[ACTION_COL.RULE_REF] = opts.ruleRef || "";
  appendRow(ss, "Action Tracker", row);
  invalidateDashboardCache();
  recordAudit_(ss, "Action Tracker", lpId, "create", "System (" + (opts.rule || "rule") + ")", contractor, "Draft action " + acNo + " created: " + (opts.analysis || ""));

  try {
    var people = getNotifyReviewers_(contractor);
    var msg = "Draft action " + acNo + " on " + lpId + " (" + (opts.rule || "rule") + "): " + (opts.analysis || "") + " — please add your recommendation and the agreed action.";
    recordInAppNotificationForEach_(ss, people, "action-draft", msg, contractor, "actions", acNo);
    if (people.length) {
      sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: new Draft action " + acNo + " — " + lpId, body: msg + "\n\nOpen Oil Actions in the ACC Reliability Platform to edit it." });
    }
  } catch (e) {
    logError("createDraftAction_:notify", e, { acNo: acNo });
  }
  return acNo;
}

function openActionsForLp_(ss, lpId) {
  return readSheet(ss, "Action Tracker", true).filter(function (r) {
    return String(r[ACTION_COL.LP] || "").trim() === lpId && normActionStatus_(r[ACTION_COL.STATUS]) !== ACTION_STATUS.CLOSED;
  });
}

// After a sample (Data_Entry row) is saved: a Caution/Alert result makes a
// Draft action — unless that point already has an action that isn't
// Closed, in which case both engineers are told about the new result.
function applyLabResultRule_(ss, sampleRow) {
  if (!sampleRow) return null;
  var result = String(sampleRow[5] || "").trim();
  var rule = LAB_DRAFT_STATUSES[result];
  if (!rule) return null;
  var lpId = String(sampleRow[0] || "").trim();
  if (!lpId) return null;
  var sampled = sampleRow[4] instanceof Date ? sampleRow[4] : new Date(sampleRow[4]);
  if (!isNaN(sampled.getTime()) && Date.now() - sampled.getTime() > LAB_DRAFT_MAX_AGE_DAYS * 86400000) return null;
  var ref = String(sampleRow[39] || "").trim() || (lpId + "|" + String(sampleRow[3] || "").trim());
  var existing = openActionsForLp_(ss, lpId);
  var already = readSheet(ss, "Action Tracker", true).some(function (r) { return String(r[ACTION_COL.RULE_REF] || "").trim() === ref; });
  if (already) return null;
  if (existing.length) {
    try {
      var contractor = resolveLpContractor_(lpId);
      var msg = "New " + result + " result on " + lpId + ". Action " + String(existing[0][ACTION_COL.AC_NO] || "") + " is still " +
        normActionStatus_(existing[0][ACTION_COL.STATUS]) + " — review it against the new report.";
      recordInAppNotificationForEach_(ss, getNotifyReviewers_(contractor), "action-new-result", msg, contractor, "actions", String(existing[0][ACTION_COL.AC_NO] || ""));
    } catch (e) {
      logError("applyLabResultRule_:notify", e, { lpId: lpId });
    }
    return null;
  }
  return createDraftAction_(ss, {
    lpId: lpId,
    reportEquipmentId: sampleRow[1] || "",
    sampleDate: sampleRow[4] || "",
    sampleResult: result.toUpperCase(),
    analysis: String(sampleRow[36] || "").trim() || (result + " result from the lab report"),
    rule: rule,
    ruleRef: ref
  });
}

// After a top-up is logged: 3 top-ups on the same point within 30 days
// make a Draft "Check oil leakage" action, once per open leakage action.
function applyLeakageRule_(ss, lpId, eventDate) {
  lpId = String(lpId || "").trim();
  var end = eventDate instanceof Date ? eventDate : new Date(eventDate || new Date());
  if (!lpId || isNaN(end.getTime())) return null;
  var start = end.getTime() - LEAKAGE_WINDOW_DAYS * 86400000;
  var dates = [];
  readSheet(ss, "Oil Top Up LOG", true).forEach(function (r) {
    if (String(r[1] || "").trim() !== lpId) return;
    var d = r[3] instanceof Date ? r[3] : new Date(r[3]);
    if (!isNaN(d.getTime()) && d.getTime() >= start && d.getTime() <= end.getTime() + 86400000) dates.push(d);
  });
  if (dates.length < LEAKAGE_TOP_UPS) return null;
  var openLeak = openActionsForLp_(ss, lpId).some(function (r) { return String(r[ACTION_COL.RULE] || "").trim() === "Leakage"; });
  if (openLeak) return null;
  dates.sort(function (a, b) { return a.getTime() - b.getTime(); });
  var list = dates.map(function (d) { return formatDateForEmail_(d); }).join(", ");
  return createDraftAction_(ss, {
    lpId: lpId,
    sampleResult: "LEAKAGE",
    analysis: "Check oil leakage — " + dates.length + " top-ups in " + LEAKAGE_WINDOW_DAYS + " days (" + list + ")",
    rule: "Leakage",
    ruleRef: lpId + "|" + formatDateForEmail_(end)
  });
}

// Run once from the Apps Script editor when Phase 2 is released (after the
// sheet backup): "In Progress" → "Open", and the new column headers.
// Safe to run again. Pass true (or run the DryRun one) to only count.
function migrateActionStatusesPhase2(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Action Tracker");
  if (!sheet) return { status: "error", message: "Action Tracker sheet not found" };
  var start = dataStartRowFor("Action Tracker");
  var last = sheet.getLastRow();
  var changed = 0;
  if (last >= start) {
    var range = sheet.getRange(start, ACTION_COL.STATUS + 1, last - start + 1, 1);
    var vals = range.getValues();
    for (var i = 0; i < vals.length; i++) {
      var from = String(vals[i][0] || "").trim();
      var to = normActionStatus_(from);
      if (to !== from) { vals[i][0] = to; changed++; }
    }
    if (!dryRun && changed) range.setValues(vals);
  }
  if (!dryRun) {
    ensureActionWorkflowHeaders_(sheet);
    invalidateDashboardCache();
  }
  var result = { status: "ok", dryRun: !!dryRun, changed: changed };
  Logger.log(JSON.stringify(result));
  return result;
}

function migrateActionStatusesPhase2DryRun() {
  return migrateActionStatusesPhase2(true);
}

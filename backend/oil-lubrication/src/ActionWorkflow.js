// Phase 2 — action workflow.
//
// Statuses: Draft → Open → Waiting Stoppage → Closure Requested → Closed.
// Old "In Progress" rows read as Open everywhere until
// migrateActionStatusesPhase2 rewrites the column.
//
//  - Save as Draft / Submit: an action stays Draft until someone presses
//    Submit, which needs the Agreed Action, Assigned To, Due Date and
//    Duration and is allowed for ACC Engineers, the contractor's engineer
//    and the App Owner. Submit makes it Open.
//  - Overdue: an Open action past Due Date + Duration + 5 days. Waiting
//    Stoppage is never overdue and never goes back to Open (it goes on to
//    closure). Rows without a Due Date use Revision Date + 14 days.
//  - After Submit the Due Date only changes through Reschedule (either
//    engineer, with a reason); the first due date is kept.
//
//  - Draft: created automatically by a lab Caution/Alert result or by the
//    leakage rule (3 top-ups on one point within 30 days), due in 7 days.
//    Both engineers are notified to complete and submit it.
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
//   29 Due Date   30 Duration (days)   31 Closure Requested From (status
//   before the request — a rejection returns there)   32 Original Due Date
//   33 Reschedule Reason   34 Rescheduled By   35 Rescheduled Date
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
  RULE: 27, RULE_REF: 28,
  DUE_DATE: 29, DURATION: 30, CLOSURE_FROM: 31,
  ORIGINAL_DUE: 32, RESCHEDULE_REASON: 33, RESCHEDULED_BY: 34, RESCHEDULED_DATE: 35
};
var ACTION_APP_COLS = 20; // A–T: what the app's own row save writes
var ACTION_WORKFLOW_HEADERS = [
  "Closure Request", "Closure Requested By", "Closure Requested Date",
  "Closure Decision", "Closure Decision By", "Closure Decision Date", "Closure Decision Note",
  "Created By Rule", "Rule Reference",
  "Due Date", "Duration (days)", "Closure Requested From",
  "Original Due Date", "Reschedule Reason", "Rescheduled By", "Rescheduled Date"
];
var ACTION_OVERDUE_GRACE_DAYS = 5;
var ACTION_DRAFT_DUE_DAYS = 7;
var ACTION_LEGACY_DUE_DAYS = 14; // rows from before due dates existed
var ACTION_HEADER_ROW = 5; // Action Tracker: rows 1-4 title, row 5 header, data from 6
var LAB_DRAFT_STATUSES = { "Caution": "Lab Caution", "Warning": "Lab Caution", "Alert": "Lab Alert" };
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

var ACTION_CLOSED_MSG = "This action is closed — it can't be changed.";

// One action per lab sample: the same point and the same sample date. More
// work for that sample goes into the same action (its Agreed Action jobs).
// Returns the other action's row, or null. `exceptAcNo` skips the action
// being edited.
function actionForSample_(ss, lpId, sampleDate, exceptAcNo) {
  var lp = String(lpId || "").trim();
  if (!lp || !asDate_(sampleDate)) return null;
  var skip = String(exceptAcNo || "").trim();
  var found = null;
  readSheet(ss, "Action Tracker", true).some(function (r) {
    if (String(r[ACTION_COL.LP] || "").trim() !== lp) return false;
    if (skip && String(r[ACTION_COL.AC_NO] || "").trim() === skip) return false;
    if (!sameDay_(r[ACTION_COL.SAMPLE_DATE], sampleDate)) return false;
    found = r;
    return true;
  });
  return found;
}

function sampleActionTakenMsg_(r) {
  return "This sample already has action " + String(r[ACTION_COL.AC_NO] || "") + " (" + (normActionStatus_(r[ACTION_COL.STATUS]) || "Open") +
    "). One action per sample — add the extra job (filtering, resample, …) to that action instead.";
}

function asDate_(v) {
  if (!v) return null;
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Last day before an Open action counts as overdue.
function actionDueEnd_(row) {
  var due = asDate_(row[ACTION_COL.DUE_DATE]);
  if (!due) {
    var rev = asDate_(row[ACTION_COL.REVISION]);
    if (!rev) return null;
    due = new Date(rev.getTime() + ACTION_LEGACY_DUE_DAYS * 86400000);
  }
  var days = (parseInt(row[ACTION_COL.DURATION], 10) || 0) + ACTION_OVERDUE_GRACE_DAYS;
  return new Date(due.getTime() + days * 86400000);
}

function isActionRowOverdue_(row, now) {
  if (normActionStatus_(row[ACTION_COL.STATUS]) !== ACTION_STATUS.OPEN) return false;
  var end = actionDueEnd_(row);
  return !!end && (now || new Date()).getTime() > end.getTime() + 86400000 - 1;
}

// Submit and Reschedule: ACC Engineers, the action's own contractor's
// engineer, and the App Owner.
function isActionEngineer_(session, contractor) {
  return isAccEngineer_(session) || isRouteEngineerFor_(session, contractor);
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
// wf = the request's workflow fields: { submit, dueDate, duration }.
// Returns { error, dueEditable }. May adjust `row` in place: Submit sets it
// Open, and anything past column T is dropped (server-owned).
function guardActionTrackerSave_(session, sheet, rowIdx, row, wf) {
  wf = wf || {};
  if (!row) return { error: null, dueEditable: false };
  if (row.length > ACTION_APP_COLS) row.length = ACTION_APP_COLS;
  var isAdmin = ((session && session.roles) || []).indexOf("ROLE-ADMIN") !== -1;
  var current = rowIdx === -1 ? null : (normActionStatus_(sheet.getRange(rowIdx, ACTION_COL.STATUS + 1).getValue()) || ACTION_STATUS.OPEN);
  var next = normActionStatus_(row[ACTION_COL.STATUS]) || ACTION_STATUS.DRAFT;
  var dueEditable = current === null || current === ACTION_STATUS.DRAFT;
  var fail = function (msg) { return { error: msg, dueEditable: false }; };

  // A closed action is final — nobody changes it, admin included.
  if (current === ACTION_STATUS.CLOSED) return fail(ACTION_CLOSED_MSG);

  if (wf.submit) {
    if (current !== null && current !== ACTION_STATUS.DRAFT) return fail("Only a Draft can be submitted.");
    var missing = [];
    if (!String(row[ACTION_COL.AGREED] || "").trim()) missing.push("Agreed Action");
    if (!String(row[ACTION_COL.ASSIGNED] || "").trim()) missing.push("Assigned To");
    if (!asDate_(wf.dueDate)) missing.push("Due Date");
    if (wf.duration === undefined || wf.duration === null || String(wf.duration).trim() === "" || isNaN(Number(wf.duration)) || Number(wf.duration) < 0) missing.push("Duration");
    if (missing.length) return fail("To submit, fill in: " + missing.join(", ") + ".");
    var contractor = String(row[ACTION_COL.CONTRACTOR] || "").trim() || resolveLpContractor_(row[ACTION_COL.LP]);
    if (!isAdmin && !isActionEngineer_(session, contractor)) return fail("Only an ACC Engineer or this contractor's engineer can submit an action.");
    row[ACTION_COL.STATUS] = ACTION_STATUS.OPEN;
    return { error: null, dueEditable: true };
  }
  if (isAdmin) return { error: null, dueEditable: dueEditable };

  if (current === null) {
    if (next !== ACTION_STATUS.DRAFT) return fail("Save a new action as Draft, or Submit it.");
    return { error: null, dueEditable: true };
  }
  if (next === current) return { error: null, dueEditable: dueEditable };
  if (current === ACTION_STATUS.OPEN && next === ACTION_STATUS.WAITING) return { error: null, dueEditable: false };
  if (current === ACTION_STATUS.DRAFT && next === ACTION_STATUS.OPEN) {
    return fail("Use Submit — it needs the Agreed Action, Assigned To, Due Date and Duration.");
  }
  if (current === ACTION_STATUS.WAITING && next === ACTION_STATUS.OPEN) {
    return fail("Waiting Stoppage doesn't go back to Open — request closure when the work is done.");
  }
  if (next === ACTION_STATUS.CLOSURE_REQUESTED || next === ACTION_STATUS.CLOSED) {
    return fail("Use Request closure — an ACC Engineer approves it, then the Contractor Engineer closes it.");
  }
  return fail("This action is " + current + "; its status can't be changed here.");
}

// After the row save: Due Date / Duration, only while it's Draft (or being
// submitted). Later changes go through rescheduleAction.
function writeActionDueFields_(ss, row, wf) {
  wf = wf || {};
  if (wf.dueDate === undefined && wf.duration === undefined) return;
  var sheet = ss.getSheetByName("Action Tracker");
  if (!sheet) return;
  var rowIdx = findRowIndex(sheet, [ACTION_COL.AC_NO, ACTION_COL.LP], [row[ACTION_COL.AC_NO], row[ACTION_COL.LP]], dataStartRowFor("Action Tracker"));
  if (rowIdx === -1) return;
  ensureActionWorkflowHeaders_(sheet);
  var due = asDate_(wf.dueDate);
  var duration = String(wf.duration === undefined || wf.duration === null ? "" : wf.duration).trim();
  sheet.getRange(rowIdx, ACTION_COL.DUE_DATE + 1, 1, 2).setValues([[due || "", duration === "" || isNaN(Number(duration)) ? "" : Math.max(0, parseInt(duration, 10) || 0)]]);
}

// Reschedule an Open / Waiting Stoppage action: either engineer, with a
// reason. The very first due date is kept in Original Due Date.
function rescheduleAction(ss, data) {
  var reason = String(data.reason || "").trim();
  if (!reason) return { error: "A reason is required to reschedule" };
  var newDue = asDate_(data.newDueDate);
  if (!newDue) return { error: "A valid new due date is required" };
  var found = findActionRow_(ss, data.acNo, data.equipmentCode);
  if (found.error) return found;
  var status = normActionStatus_(found.row[ACTION_COL.STATUS]);
  if (status !== ACTION_STATUS.OPEN && status !== ACTION_STATUS.WAITING) {
    return { error: "Only an Open or Waiting Stoppage action can be rescheduled (edit a Draft's due date directly)." };
  }
  ensureActionWorkflowHeaders_(found.sheet);
  var oldDue = asDate_(found.row[ACTION_COL.DUE_DATE]);
  if (!oldDue) {
    var rev = asDate_(found.row[ACTION_COL.REVISION]);
    oldDue = rev ? new Date(rev.getTime() + ACTION_LEGACY_DUE_DAYS * 86400000) : null;
  }
  var cells = {};
  if (!asDate_(found.row[ACTION_COL.ORIGINAL_DUE]) && oldDue) cells[ACTION_COL.ORIGINAL_DUE] = oldDue;
  cells[ACTION_COL.DUE_DATE] = newDue;
  if (data.duration !== undefined && String(data.duration).trim() !== "" && !isNaN(Number(data.duration))) {
    cells[ACTION_COL.DURATION] = Math.max(0, parseInt(data.duration, 10) || 0);
  }
  cells[ACTION_COL.RESCHEDULE_REASON] = reason;
  cells[ACTION_COL.RESCHEDULED_BY] = data.actingUser || "";
  cells[ACTION_COL.RESCHEDULED_DATE] = new Date();
  setActionCells_(found.sheet, found.rowIdx, cells);
  return { status: "ok", oldDueDate: oldDue ? formatDateForEmail_(oldDue) : "(none)", newDueDate: formatDateForEmail_(newDue), reason: reason };
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
  cells[ACTION_COL.CLOSURE_FROM] = status;
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
  // A rejection goes back to where the request came from (Open or Waiting Stoppage).
  var backTo = normActionStatus_(found.row[ACTION_COL.CLOSURE_FROM]) === ACTION_STATUS.WAITING ? ACTION_STATUS.WAITING : ACTION_STATUS.OPEN;
  if (decision === "Reject") cells[ACTION_COL.STATUS] = backTo;
  setActionCells_(found.sheet, found.rowIdx, cells);

  try {
    var contractor = actionContractor_(found.row);
    var engineers = contractor ? maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor) : [];
    var msg = decision === "Approve"
      ? "Closure of action " + actionKeyLabel_(found.row) + " was approved by " + (data.actingUser || "ACC") + " — you can close it now." + (note ? " Note: " + note : "")
      : "Closure of action " + actionKeyLabel_(found.row) + " was rejected by " + (data.actingUser || "ACC") + ": " + note + ". It's " + backTo + " again.";
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
  for (var c = 0; c <= ACTION_COL.RESCHEDULED_DATE; c++) row.push("");
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
  row[ACTION_COL.PREV_AGREED] = lastAgreedActionForLp_(ss, lpId);
  row[ACTION_COL.STATUS] = ACTION_STATUS.DRAFT;
  row[ACTION_COL.CONTRACTOR] = contractor;
  row[ACTION_COL.RULE] = opts.rule || "";
  row[ACTION_COL.RULE_REF] = opts.ruleRef || "";
  row[ACTION_COL.DUE_DATE] = new Date(Date.now() + ACTION_DRAFT_DUE_DAYS * 86400000);
  row[ACTION_COL.DURATION] = 0;
  appendRow(ss, "Action Tracker", row);
  invalidateDashboardCache();
  recordAudit_(ss, "Action Tracker", lpId, "create", "System (" + (opts.rule || "rule") + ")", contractor, "Draft action " + acNo + " created: " + (opts.analysis || ""));

  try {
    var people = getNotifyReviewers_(contractor);
    var msg = "Draft action " + acNo + " on " + lpId + " (" + (opts.rule || "rule") + "): " + (opts.analysis || "") + " — please complete it and Submit.";
    recordInAppNotificationForEach_(ss, people, "action-draft", msg, contractor, "actions", acNo);
    if (people.length) {
      sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: new Draft action " + acNo + " — " + lpId, body: msg + "\n\nOpen Oil Actions in the ACC Reliability Platform to edit it." });
    }
  } catch (e) {
    logError("createDraftAction_:notify", e, { acNo: acNo });
  }
  return acNo;
}

// "Last Previous Action": the Agreed Action of the point's most recent
// earlier action.
function lastAgreedActionForLp_(ss, lpId) {
  var best = null;
  readSheet(ss, "Action Tracker", true).forEach(function (r) {
    if (String(r[ACTION_COL.LP] || "").trim() !== lpId) return;
    var agreed = String(r[ACTION_COL.AGREED] || "").trim();
    if (!agreed) return;
    var d = asDate_(r[ACTION_COL.REVISION]) || new Date(0);
    if (!best || d.getTime() >= best.d.getTime()) best = { d: d, agreed: agreed };
  });
  return best ? best.agreed : "";
}

function openActionsForLp_(ss, lpId) {
  return readSheet(ss, "Action Tracker", true).filter(function (r) {
    return String(r[ACTION_COL.LP] || "").trim() === lpId && normActionStatus_(r[ACTION_COL.STATUS]) !== ACTION_STATUS.CLOSED;
  });
}

// After a newly added lab report is validated (LabReports.js — reports from
// before Phase 4 have no status and never reach here, so existing results
// don't create drafts): a Caution/Alert result makes a Draft action — unless that point already has an action that isn't
// Closed, in which case both engineers are told about the new result.
function applyLabResultRule_(ss, sampleRow) {
  if (!sampleRow) return null;
  var result = String(sampleRow[5] || "").trim();
  var rule = LAB_DRAFT_STATUSES[result];
  if (!rule) return null;
  var lpId = String(sampleRow[0] || "").trim();
  if (!lpId) return null;
  var ref = String(sampleRow[39] || "").trim() || (lpId + "|" + String(sampleRow[3] || "").trim());
  // this sample already has an action (made by hand, say): never a second one
  if (actionForSample_(ss, lpId, sampleRow[4])) return null;
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
  // Open actions get a Due Date (Revision Date + 14 days, Duration 0) so
  // what's overdue today stays overdue.
  var dueSet = 0;
  if (!dryRun) ensureActionWorkflowHeaders_(sheet);
  if (last >= start) {
    var rows = sheet.getRange(start, 1, last - start + 1, ACTION_COL.DURATION + 1).getValues();
    var dueRange = sheet.getRange(start, ACTION_COL.DUE_DATE + 1, last - start + 1, 2);
    var dueVals = dueRange.getValues();
    for (var j = 0; j < rows.length; j++) {
      if (!String(rows[j][ACTION_COL.AC_NO] || "").trim()) continue;
      if (normActionStatus_(rows[j][ACTION_COL.STATUS]) === ACTION_STATUS.CLOSED) continue;
      if (asDate_(dueVals[j][0])) continue;
      var rev = asDate_(rows[j][ACTION_COL.REVISION]);
      if (!rev) continue;
      dueVals[j] = [new Date(rev.getTime() + ACTION_LEGACY_DUE_DAYS * 86400000), dueVals[j][1] === "" ? 0 : dueVals[j][1]];
      dueSet++;
    }
    if (!dryRun && dueSet) dueRange.setValues(dueVals);
  }
  if (!dryRun) invalidateDashboardCache();
  var result = { status: "ok", dryRun: !!dryRun, changed: changed, dueDatesSet: dueSet };
  Logger.log(JSON.stringify(result));
  return result;
}

function migrateActionStatusesPhase2DryRun() {
  return migrateActionStatusesPhase2(true);
}

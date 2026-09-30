// Best-effort email notifications for the Routine lifecycle — assigned,
// submitted for review, approved. "Patch 2" of the plant-readiness punch
// list: until this file, nothing in Oil Lubrication ever told anyone
// anything — every handoff (assign -> do -> submit -> approve) depended
// entirely on someone manually opening the app and noticing.
//
// EVERY function here is called from Routines.js wrapped in its own
// try/catch, same "best-effort side effect, never blocks the real write"
// convention already used by tryAutoDeductInventory_ (OilInventory.js) and
// applyOilChangeSideEffect (App.jsx) — a failed email is a missed courtesy,
// not a reason to fail or roll back the routine action that triggered it.

// Reviewer distribution list lives in its own sheet
// ("OL_NOTIFY_REVIEWERS", columns: Contractor, Email) rather than calling
// Platform Core's account directory live — same reasoning Rbac.js's
// ROLE_GRANTS duplication already gives: this backend has no session or
// credential of its own to call Platform Core with, and a live
// cross-project fetch on every submit would add a new network call and
// failure mode to a write path for every single submission. A row with
// Contractor="ACC" gets every routine's "submitted for review" email
// regardless of which contractor it belongs to (ACC oversees both); a row
// with Contractor="RHI"/"ASEC" only gets that contractor's routines.
// Maintained by hand by whoever administers each contractor's accounts —
// same maintenance pattern OL_ACTION_PHRASES already uses. Missing sheet
// or no matching rows just means no email, not an error.
function getNotifyReviewers_(contractor) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "OL_NOTIFY_REVIEWERS", true);
  var emails = [];
  for (var i = 0; i < rows.length; i++) {
    var rowContractor = String(rows[i][0] || "").trim();
    var email = String(rows[i][1] || "").trim();
    if (!email) continue;
    if (rowContractor === "ACC" || rowContractor === contractor) emails.push(email);
  }
  return emails;
}

// Deliberately loose — just enough to skip MailApp throwing on a free-text
// "Technician or team name" value (the TechnicianPicker.jsx fallback for a
// contractor with no real accounts set up yet), not a strict validator.
function looksLikeEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function formatDateForEmail_(value) {
  if (!value) return "";
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "UTC", "dd MMM yyyy");
}

function notifyRoutineAssigned_(routineId, routeName, assignedTo, dueDate) {
  if (!looksLikeEmail_(assignedTo)) return; // free-text fallback value — nowhere real to send this
  var label = routeName || routineId;
  var subject = "Oil Lubrication: routine assigned to you — " + label;
  var body =
    "You've been assigned a new lubrication routine.\n\n" +
    "Route: " + label + "\n" +
    (dueDate ? "Due: " + formatDateForEmail_(dueDate) + "\n" : "") +
    "\nOpen My Work in the ACC Reliability Platform to see the checklist.";
  MailApp.sendEmail(assignedTo, subject, body);
}

function notifyRoutineSubmitted_(routineId, routeName, contractor, submittedBy) {
  var reviewers = getNotifyReviewers_(contractor);
  if (reviewers.length === 0) return;
  var label = routeName || routineId;
  var subject = "Oil Lubrication: routine submitted for review — " + label;
  var body =
    "A routine has been submitted and is waiting for approval.\n\n" +
    "Route: " + label + "\n" +
    "Contractor: " + (contractor || "") + "\n" +
    (submittedBy ? "Submitted by: " + submittedBy + "\n" : "") +
    "\nOpen Routines in the ACC Reliability Platform to review and approve it.";
  MailApp.sendEmail({ to: reviewers.join(","), subject: subject, body: body });
}

function notifyRoutineApproved_(routineId, routeName, assignedTo, approvedBy) {
  if (!looksLikeEmail_(assignedTo)) return;
  var label = routeName || routineId;
  var subject = "Oil Lubrication: routine approved — " + label;
  var body =
    "Your routine has been approved.\n\n" +
    "Route: " + label + "\n" +
    (approvedBy ? "Approved by: " + approvedBy + "\n" : "") +
    "\nNo action needed.";
  MailApp.sendEmail(assignedTo, subject, body);
}

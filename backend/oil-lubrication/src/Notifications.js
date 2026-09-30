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

// ─── Aging Actions digest (Patch 3 — owner field + aging escalation) ────
//
// Run on its own time-driven trigger, same as RouteTemplates.js's
// generateDueRouteInstances (see that function's own comment for why:
// kept off the Web App request path entirely, so it never has to contend
// with doPost's script lock, and a digest firing once a day has no caller
// waiting on a response). Read-only — no lock needed, unlike
// generateDueRouteInstances.
//
// "Escalation" here is deliberately a once-a-day roundup, not a
// per-action reminder to whoever's specifically responsible — there's no
// concept yet of "seen it, snoozing", so nagging on every single aging
// action would just get tuned out. One list a reviewer can act on is more
// realistic. Reuses the same OL_NOTIFY_REVIEWERS list submitRoutine's
// notification already reads (see that comment for why it's a sheet, not
// a live Platform Core call).
var AGING_ACTION_DAYS = 14; // matches ActionTracker.jsx's own ageColor threshold

function sendAgingActionsDigest_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Action Tracker", true);
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AGING_ACTION_DAYS);

  var byContractor = {}; // contractor -> { noOwner: [...], aging: [...] }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var status = String(r[10] || "").trim();
    if (status !== "Open" && status !== "In Progress" && status !== "Waiting Stoppage") continue;
    var d = r[5] instanceof Date ? r[5] : new Date(r[5]);
    if (isNaN(d.getTime()) || d > cutoff) continue; // not old enough yet
    var contractor = String(r[12] || "").trim();
    if (!contractor) continue;
    var assignedTo = String(r[19] || "").trim();
    var entry = { acNo: String(r[0] || "").trim(), equipmentCode: String(r[1] || "").trim(), status: status, revisionDate: d, assignedTo: assignedTo };
    if (!byContractor[contractor]) byContractor[contractor] = { noOwner: [], aging: [] };
    if (assignedTo) byContractor[contractor].aging.push(entry);
    else byContractor[contractor].noOwner.push(entry);
  }

  KNOWN_CONTRACTORS.forEach(function (contractor) {
    var bucket = byContractor[contractor];
    if (!bucket || (bucket.noOwner.length === 0 && bucket.aging.length === 0)) return;
    var reviewers = getNotifyReviewers_(contractor);
    if (reviewers.length === 0) return;

    var lines = ["Actions open " + AGING_ACTION_DAYS + "+ days for " + contractor + ":", ""];
    if (bucket.noOwner.length) {
      lines.push(bucket.noOwner.length + " with NO OWNER assigned:");
      bucket.noOwner.forEach(function (e) {
        lines.push("  - " + e.acNo + " / " + e.equipmentCode + " (" + e.status + ", opened " + formatDateForEmail_(e.revisionDate) + ")");
      });
      lines.push("");
    }
    if (bucket.aging.length) {
      lines.push(bucket.aging.length + " assigned but still aging:");
      bucket.aging.forEach(function (e) {
        lines.push("  - " + e.acNo + " / " + e.equipmentCode + " (" + e.status + ", assigned to " + e.assignedTo + ", opened " + formatDateForEmail_(e.revisionDate) + ")");
      });
    }
    MailApp.sendEmail({
      to: reviewers.join(","),
      subject: "Oil Lubrication: " + (bucket.noOwner.length + bucket.aging.length) + " aging action(s) — " + contractor,
      body: lines.join("\n"),
    });
  });
}

// ─── Low Stock digest (Patch 4) ──────────────────────────────────────────
// Same "own trigger, not the request path" pattern as
// sendAgingActionsDigest_ above — read-only, no lock needed. Reuses the
// same OL_NOTIFY_REVIEWERS list.
//
// Oil Inventory's "Recorder Level" field has always been there, but
// nothing ever acted on it — it was purely a number sitting on the page.
// This makes it actually do something: once a day, any Active product
// whose Current_Stock (the sheet's own formula column, read as-is — this
// never recomputes it) has dropped to or below its Recorder Level gets
// flagged to that contractor's reviewers.
function sendLowStockDigest_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Inventory", true);

  var byContractor = {}; // contractor -> [{ productId, lubricantType, lubricantBrand, currentStock, recorderLevel, unit }]
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var status = String(r[11] || "").trim();
    if (status && status !== "Active") continue; // skip discontinued/inactive; blank status treated as active, same default the app itself uses
    var recorderLevel = parseFloat(r[7]);
    if (isNaN(recorderLevel) || recorderLevel <= 0) continue; // not configured for this product — nothing to compare against
    var currentStock = parseFloat(r[6]);
    if (isNaN(currentStock)) continue; // formula hasn't produced a number yet (e.g. a brand new product with no movements)
    if (currentStock > recorderLevel) continue; // plenty of stock

    var contractor = String(r[16] || "").trim();
    if (!contractor) continue;
    if (!byContractor[contractor]) byContractor[contractor] = [];
    byContractor[contractor].push({
      productId: String(r[0] || "").trim(),
      lubricantType: String(r[1] || "").trim(),
      lubricantBrand: String(r[2] || "").trim(),
      currentStock: currentStock,
      recorderLevel: recorderLevel,
      unit: String(r[5] || "").trim(),
    });
  }

  KNOWN_CONTRACTORS.forEach(function (contractor) {
    var items = byContractor[contractor];
    if (!items || items.length === 0) return;
    var reviewers = getNotifyReviewers_(contractor);
    if (reviewers.length === 0) return;

    var lines = [items.length + " product(s) at or below their recorder level for " + contractor + ":", ""];
    items.forEach(function (it) {
      lines.push(
        "  - " + it.lubricantType + (it.lubricantBrand ? " (" + it.lubricantBrand + ")" : "") +
        ": " + it.currentStock + " " + it.unit + " left, recorder level " + it.recorderLevel + " " + it.unit
      );
    });
    MailApp.sendEmail({
      to: reviewers.join(","),
      subject: "Oil Lubrication: " + items.length + " product(s) low on stock — " + contractor,
      body: lines.join("\n"),
    });
  });
}

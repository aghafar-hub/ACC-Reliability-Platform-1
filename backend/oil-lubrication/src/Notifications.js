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

// Patch 14 (plant-readiness pass) — an admin-controlled on/off switch for
// every email this file sends, plus which address they appear to come
// FROM, instead of silently going out under whoever's personal Google
// account owns this Apps Script deployment. Stored in Script Properties
// (PropertiesService), not a sheet: this is small, global, rarely-changed
// config, not operational data anyone needs to browse or filter in the
// spreadsheet the way OL_NOTIFY_REVIEWERS' actual distribution list is —
// same reasoning DASHBOARD_CACHE_KEY-style settings already live in code/
// properties rather than a row somewhere.
var NOTIFY_ENABLED_PROP = "notify_email_enabled";
var NOTIFY_FROM_EMAIL_PROP = "notify_from_email";
var NOTIFY_FROM_NAME_PROP = "notify_from_name";

function getNotificationSettings_() {
  var props = PropertiesService.getScriptProperties();
  var enabledRaw = props.getProperty(NOTIFY_ENABLED_PROP);
  return {
    // Patch 15: no stored value yet now defaults to OFF — the in-app bell
    // (InAppNotifications.js) is the primary, always-on channel; email is
    // an explicit opt-in an admin turns on from Settings, not a surprise
    // default landing in someone's personal inbox.
    enabled: enabledRaw === null ? false : enabledRaw === "true",
    fromEmail: props.getProperty(NOTIFY_FROM_EMAIL_PROP) || "",
    fromName: props.getProperty(NOTIFY_FROM_NAME_PROP) || "",
  };
}

// IMPORTANT — a Google constraint, not a bug in this code: setting
// fromEmail here only changes the actual FROM address on outgoing mail if
// that address is already added and verified as a "Send As" alias on the
// Gmail/Workspace account that owns this Apps Script deployment (Gmail →
// Settings → Accounts and Import → "Send mail as" → Add another email
// address → verify it). Without that, MailApp.sendEmail silently falls
// back to sending as the deploying account's own address even though the
// DISPLAY NAME (fromName) still changes correctly either way. Documented
// prominently in the Settings UI and docs/deployment-guide.md section 4r
// — this isn't something a screen alone can make work.
function updateNotificationSettings_(data) {
  var props = PropertiesService.getScriptProperties();
  if (data.enabled !== undefined) props.setProperty(NOTIFY_ENABLED_PROP, data.enabled ? "true" : "false");
  if (data.fromEmail !== undefined) {
    var email = String(data.fromEmail || "").trim();
    if (email && !looksLikeEmail_(email)) return { error: "That doesn't look like a valid email address." };
    props.setProperty(NOTIFY_FROM_EMAIL_PROP, email);
  }
  if (data.fromName !== undefined) props.setProperty(NOTIFY_FROM_NAME_PROP, String(data.fromName || "").trim());
  return { status: "ok" };
}

// Every MailApp.sendEmail call in this file goes through here instead of
// calling it directly — one place to honor the enabled/disabled switch and
// apply the configured from/name, rather than repeating that check at each
// of the five send sites below.
function sendNotificationEmail_(options) {
  var settings = getNotificationSettings_();
  if (!settings.enabled) return;
  var payload = { to: options.to, subject: options.subject, body: options.body };
  if (settings.fromEmail) payload.from = settings.fromEmail;
  if (settings.fromName) payload.name = settings.fromName;
  MailApp.sendEmail(payload);
}

// Who gets "submitted for review" alerts and the two digests: every ACC
// responsible engineer, plus the routine's own contractor's responsible
// engineers — both lists kept in Settings > Module Access (ModuleAccess.js).
// The old OL_NOTIFY_REVIEWERS sheet was imported into those lists the first
// time they were read, and is no longer used. Nobody listed = no alert.
function getNotifyReviewers_(contractor) {
  var emails = maResponsibleEmails_(MA_RESP.ACC, "");
  if (contractor && contractor !== "ACC") {
    maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor).forEach(function (e) {
      if (emails.indexOf(e) === -1) emails.push(e);
    });
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
  var label = routeName || routineId;
  // Patch 15: the in-app bell fires even when assignedTo is a free-text
  // fallback name (no real login to deliver an email to) — recordInAppNotification_
  // itself is a no-op for anything that isn't a real address, same guard,
  // just centralized there instead of repeated at every call site.
  recordInAppNotification_(
    SpreadsheetApp.getActiveSpreadsheet(), assignedTo, "routine-assigned",
    "You've been assigned routine " + label + (dueDate ? " (due " + formatDateForEmail_(dueDate) + ")" : ""),
    "", "routines", routineId
  );
  if (!looksLikeEmail_(assignedTo)) return; // free-text fallback value — nowhere real to send this
  var subject = "Oil Lubrication: routine assigned to you — " + label;
  var body =
    "You've been assigned a new lubrication routine.\n\n" +
    "Route: " + label + "\n" +
    (dueDate ? "Due: " + formatDateForEmail_(dueDate) + "\n" : "") +
    "\nOpen My Work in the ACC Reliability Platform to see the checklist.";
  sendNotificationEmail_({ to: assignedTo, subject: subject, body: body });
}

function notifyRoutineSubmitted_(routineId, routeName, contractor, submittedBy) {
  var reviewers = getNotifyReviewers_(contractor);
  if (reviewers.length === 0) return;
  var label = routeName || routineId;
  recordInAppNotificationForEach_(
    SpreadsheetApp.getActiveSpreadsheet(), reviewers, "routine-submitted",
    "Routine " + label + " was submitted for review" + (submittedBy ? " by " + submittedBy : ""),
    contractor, "routines", routineId
  );
  var subject = "Oil Lubrication: routine submitted for review — " + label;
  var body =
    "A routine has been submitted and is waiting for approval.\n\n" +
    "Route: " + label + "\n" +
    "Contractor: " + (contractor || "") + "\n" +
    (submittedBy ? "Submitted by: " + submittedBy + "\n" : "") +
    "\nOpen Routines in the ACC Reliability Platform to review and approve it.";
  sendNotificationEmail_({ to: reviewers.join(","), subject: subject, body: body });
}

// Phase 1: the engineer returned submitted work for correction — the
// technician is told why, corrects it and resubmits.
function notifyRoutineReturned_(routineId, routeName, assignedTo, returnedBy, reason) {
  var label = routeName || routineId;
  recordInAppNotification_(
    SpreadsheetApp.getActiveSpreadsheet(), assignedTo, "routine-returned",
    "Route " + label + " was returned for correction" + (returnedBy ? " by " + returnedBy : "") + ": " + reason,
    "", "routines", routineId
  );
  if (!looksLikeEmail_(assignedTo)) return;
  sendNotificationEmail_({
    to: assignedTo,
    subject: "Oil Lubrication: route returned for correction — " + label,
    body:
      "Your submitted route needs a correction.\n\n" +
      "Route: " + label + "\n" +
      "Reason: " + reason + "\n" +
      (returnedBy ? "Returned by: " + returnedBy + "\n" : "") +
      "\nOpen My Work in the ACC Reliability Platform, correct it and submit again."
  });
}

// Phase 1: an ACC Engineer created and assigned a route — it goes straight
// to the technician, and the contractor's responsible engineers are told.
function notifyRoutineCreatedByAcc_(routineId, routeName, contractor, assignedTo, createdBy, dueDate) {
  if (!contractor || contractor === "ACC") return;
  var engineers = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
  if (engineers.length === 0) return;
  var label = routeName || routineId;
  var msg = (createdBy || "An ACC Engineer") + " created route " + label + " and assigned it to " + assignedTo +
    (dueDate ? " (due " + formatDateForEmail_(dueDate) + ")" : "");
  recordInAppNotificationForEach_(SpreadsheetApp.getActiveSpreadsheet(), engineers, "routine-created-by-acc", msg, contractor, "routines", routineId);
  sendNotificationEmail_({
    to: engineers.join(","),
    subject: "Oil Lubrication: ACC created a route for " + contractor + " — " + label,
    body: msg + ".\n\nYou'll approve it once the technician submits it. Open Routines in the ACC Reliability Platform to see it."
  });
}

function notifyRoutineApproved_(routineId, routeName, assignedTo, approvedBy) {
  var label = routeName || routineId;
  recordInAppNotification_(
    SpreadsheetApp.getActiveSpreadsheet(), assignedTo, "routine-approved",
    "Routine " + label + " was approved" + (approvedBy ? " by " + approvedBy : ""),
    "", "routines", routineId
  );
  if (!looksLikeEmail_(assignedTo)) return;
  var subject = "Oil Lubrication: routine approved — " + label;
  var body =
    "Your routine has been approved.\n\n" +
    "Route: " + label + "\n" +
    (approvedBy ? "Approved by: " + approvedBy + "\n" : "") +
    "\nNo action needed.";
  sendNotificationEmail_({ to: assignedTo, subject: subject, body: body });
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

// Bug report, 10/2026: the live time-based trigger for this has been
// failing every day with "Script function not found: sendAgingActionsDigest"
// — this function was named with a trailing underscore, which Apps Script
// treats as "private" and hides from the Triggers UI's function picker, so
// whoever set the trigger up couldn't select it and it ended up pointing at
// the name without the underscore instead, which never existed. Renamed to
// match what the trigger is already configured to call — no Apps Script UI
// change needed, just redeploy this file. generateDueRouteInstances
// (RouteTemplates.js), the sibling pattern this function's own header
// comment points to, was already correctly named without one.
function sendAgingActionsDigest() {
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
    var agingCount = bucket.noOwner.length + bucket.aging.length;
    recordInAppNotificationForEach_(
      ss, reviewers, "aging-actions",
      agingCount + " action(s) open " + AGING_ACTION_DAYS + "+ days for " + contractor,
      contractor, "actions", ""
    );
    sendNotificationEmail_({
      to: reviewers.join(","),
      subject: "Oil Lubrication: " + agingCount + " aging action(s) — " + contractor,
      body: lines.join("\n"),
    });
  });
}

// ─── Low Stock digest (Patch 4) ──────────────────────────────────────────
// Same "own trigger, not the request path" pattern as
// sendAgingActionsDigest above — read-only, no lock needed. Reuses the
// same OL_NOTIFY_REVIEWERS list.
//
// Oil Inventory's "Recorder Level" field has always been there, but
// nothing ever acted on it — it was purely a number sitting on the page.
// This makes it actually do something: once a day, any Active product
// whose Current_Stock (the sheet's own formula column, read as-is — this
// never recomputes it) has dropped to or below its Recorder Level gets
// flagged to that contractor's reviewers.
//
// Renamed from sendLowStockDigest_ (dropped the trailing underscore) —
// same fix and same reason as sendAgingActionsDigest above: a trailing
// underscore hides a function from the Triggers UI's picker, which made
// this impossible to wire up correctly as documented.
function sendLowStockDigest() {
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
    recordInAppNotificationForEach_(
      ss, reviewers, "low-stock",
      items.length + " product(s) at or below their recorder level for " + contractor,
      contractor, "inventory", ""
    );
    sendNotificationEmail_({
      to: reviewers.join(","),
      subject: "Oil Lubrication: " + items.length + " product(s) low on stock — " + contractor,
      body: lines.join("\n"),
    });
  });
}

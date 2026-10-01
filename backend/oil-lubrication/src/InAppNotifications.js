// Patch 15 (plant-readiness pass): in-app notifications — a bell shown in
// the PLATFORM SHELL's top-right corner (frontend/src, not just this app),
// visible on every screen since it's fed by a direct Oil Lubrication API
// call rather than anything Oil-Lubrication-page-specific. Fires on the
// SAME five events Notifications.js's emails already cover (routine
// assigned/submitted/approved, aging-actions digest, low-stock digest) —
// no new trigger types — but is NEVER gated by notify_email_enabled: the
// user explicitly wants email OFF by default while this stays the primary,
// always-on channel (see Notifications.js's getNotificationSettings_ default
// flip in the same patch).
//
// One row per (event, recipient) rather than one row per event: a
// submitted-routine notice reaching 3 reviewers becomes 3 independent rows,
// each with its own read/unread state, so one reviewer opening it doesn't
// mark it read for the others — mirrors how each of them gets their own
// copy of the email today in spirit, even though the email itself is one
// message with a comma-joined "to" list.
//
// Deliberately scoped to the caller's OWN email, never contractor-wide:
// unlike most reads in this backend (which scope by contractor/plant data),
// a notification is personal, same as the email it parallels.

function recordInAppNotification_(ss, recipientEmail, type, message, contractor, linkPage, linkRecordId) {
  var email = String(recipientEmail || "").trim().toLowerCase();
  if (!email) return; // nowhere to attribute this to — e.g. a free-text "Technician name" with no real platform login
  try {
    var sheet = ss.getSheetByName("OL_IN_APP_NOTIFICATIONS");
    if (!sheet) {
      sheet = ss.insertSheet("OL_IN_APP_NOTIFICATIONS");
      sheet.appendRow(["NotificationId", "RecipientEmail", "Type", "Message", "Contractor", "LinkPage", "LinkRecordId", "CreatedDate", "Read", "ReadDate"]);
    }
    sheet.appendRow([
      "NOTIF-" + Utilities.getUuid(),
      email,
      type || "",
      message || "",
      contractor || "",
      linkPage || "",
      linkRecordId || "",
      new Date().toISOString(),
      "false",
      "",
    ]);
  } catch (e2) { /* never let in-app notification logging break the triggering action — same convention as recordAudit_ */ }
}

// Fan-out helper for the two digests + "submitted" notice, which all
// address a LIST of reviewer emails on the email side — each gets their
// own independent in-app row here.
function recordInAppNotificationForEach_(ss, recipientEmails, type, message, contractor, linkPage, linkRecordId) {
  (recipientEmails || []).forEach(function (email) {
    recordInAppNotification_(ss, email, type, message, contractor, linkPage, linkRecordId);
  });
}

// GET endpoint: the bell's own feed — newest first, capped, scoped strictly
// to the caller's own email from their session (never client-supplied —
// see Code.js's getInAppNotifications case). No session (anonymous/legacy
// request) just means no notifications, same fail-soft pattern
// getNotifyReviewers_ and friends already use for "nothing to show".
function getInAppNotifications_(userEmail, limitParam) {
  var email = String(userEmail || "").trim().toLowerCase();
  if (!email) return { notifications: [], unreadCount: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "OL_IN_APP_NOTIFICATIONS", true); // [] if the sheet doesn't exist yet
  var limit = Math.max(1, Math.min(100, parseInt(limitParam, 10) || 30));

  var mine = [];
  var unreadCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[1] || "").trim().toLowerCase() !== email) continue;
    var isRead = String(r[8] || "").trim() === "true";
    if (!isRead) unreadCount++;
    mine.push({
      notificationId: r[0],
      type: r[2],
      message: r[3],
      contractor: r[4],
      linkPage: r[5],
      linkRecordId: r[6],
      createdDate: r[7],
      read: isRead,
    });
  }
  mine.reverse(); // appended chronologically — newest first for the bell
  return { notifications: mine.slice(0, limit), unreadCount: unreadCount };
}

// Ownership-checked: a notificationId belongs to exactly one recipient, and
// only that logged-in user may mark it read — same reasoning as every other
// contractor-ownership check in this backend (Rbac.js's
// requireLpContractorMatch_ etc.), just scoped to a single row instead of a
// contractor.
function markInAppNotificationRead_(notificationId, userEmail) {
  var id = String(notificationId || "").trim();
  var email = String(userEmail || "").trim().toLowerCase();
  if (!id || !email) return { error: "notificationId and a logged-in session are both required" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("OL_IN_APP_NOTIFICATIONS");
  if (!sheet) return { error: "Not found" };
  var rowIdx = findRowIndex(sheet, [0], [id], dataStartRowFor("OL_IN_APP_NOTIFICATIONS"));
  if (rowIdx === -1) return { error: "Not found" };
  var rowOwner = String(sheet.getRange(rowIdx, 2).getValue() || "").trim().toLowerCase();
  if (rowOwner !== email) return { error: "Not found" }; // never let one user mark another's notification read by guessing an id
  sheet.getRange(rowIdx, 9).setValue("true");
  sheet.getRange(rowIdx, 10).setValue(new Date().toISOString());
  return { status: "ok" };
}

function markAllInAppNotificationsRead_(userEmail) {
  var email = String(userEmail || "").trim().toLowerCase();
  if (!email) return { error: "A logged-in session is required" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("OL_IN_APP_NOTIFICATIONS");
  if (!sheet) return { status: "ok" };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { // row 0 is the header
    if (String(data[i][1] || "").trim().toLowerCase() !== email) continue;
    if (String(data[i][8] || "").trim() === "true") continue;
    sheet.getRange(i + 1, 9).setValue("true");
    sheet.getRange(i + 1, 10).setValue(new Date().toISOString());
  }
  return { status: "ok" };
}

// Email per event — Settings → Email & notifications (Platform Core
// EMAIL_SETTINGS). Every email this module sends goes through msSendMail_
// with an event key; the App Owner chooses per event: email now, the daily
// digest, both, or nothing. Nothing at all is sent until the platform sender
// is set and "Send emails" is on. The bell in the app is not affected.
//
//   msSendMail_(payload, "routeAssigned")       → this module's event
//   msSendMail_(payload, "platform:delegation") → a platform event
//
// An event never saved in Settings counts as "email" (as before this
// switch existed). Read through the 10-minute platform cache (msEmail_).
//
// Digest: the email is kept in the "Email Digest Queue" tab. sendEmailDigest
// runs every hour (run installEmailDigest once); at the digest time set in
// Settings it sends each person one email with everything queued for them,
// then empties the queue — once a day.
// The same file is in both modules (Oil: EmailEvents.js).

var MS_DIGEST_SHEET = "Email Digest Queue";
// The events each module sends (Platform Core EmailSettings.js EM_MODULES).
var MS_EMAIL_EVENTS = {
  "oil-analysis": ["routeAssigned", "routeApproval", "routeApproved", "routeOverdue", "dueSoon", "sampleOverdue", "labReport", "newAction",
    "actionChanged", "closureRequested", "closureDecision", "actionOverdue", "escalation", "lowStock", "stockShortage", "equivalentOil"],
  "vibration-analysis": ["routeAssigned", "routeApproval", "routeCompleted", "reportSent", "reportDecision", "newAction", "actionAssigned",
    "closureRequested", "closureDecision", "actionList"],
};
var MS_DIGEST_HEADERS = ["Queued at", "To", "Event", "Subject", "Body"];

// The platform switch: a sender address and "Send emails" on.
function msMailAllowed_() {
  var e = msEmail_();
  return !!(e.enabled && e.sender);
}

function msEventMode_(event) {
  var key = String(event || "").indexOf(":") > 0 ? String(event) : MS_PAGE + ":" + event;
  var e = msEmail_();
  var v = e.events && Object.prototype.hasOwnProperty.call(e.events, key) ? String(e.events[key]) : "email";
  return { key: key, email: /email/.test(v), digest: /digest/.test(v), allowed: msMailAllowed_() };
}

function msSendMail_(payload, event) {
  if (!event) throw new Error("msSendMail_: event key missing");
  var m = msEventMode_(event);
  if (!m.allowed) return false;
  if (m.digest) {
    try { msQueueDigest_(payload, m.key); } catch (e) {}
  }
  if (!m.email) return false;
  MailApp.sendEmail(payload);
  return true;
}

function msQueueDigest_(payload, key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MS_DIGEST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MS_DIGEST_SHEET);
    sh.getRange(1, 1, 1, MS_DIGEST_HEADERS.length).setValues([MS_DIGEST_HEADERS]);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date().toISOString(), String(payload.to || ""), key, String(payload.subject || ""), String(payload.body || "").slice(0, 2000)]);
}

// Hourly trigger: at the digest hour (once a day) one email per person with
// everything queued since the last digest. force: send now (tests / by hand).
function sendEmailDigest(force) {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "yyyy-MM-dd");
  if (force !== true) {
    var hour = parseInt(String(msEmail_().digestTime || "07:00").split(":")[0], 10);
    var now = parseInt(Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "UTC", "H"), 10);
    if (now < hour || props.getProperty("MS_DIGEST_SENT") === today) return { status: "ok", sent: 0, note: "not the digest time" };
  }
  props.setProperty("MS_DIGEST_SENT", today);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MS_DIGEST_SHEET);
  if (!sh || sh.getLastRow() < 2) return { status: "ok", sent: 0 };
  if (!msMailAllowed_()) return { status: "ok", sent: 0, note: "Send emails is off" };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, MS_DIGEST_HEADERS.length).getValues();
  var byPerson = {};
  rows.forEach(function (r) {
    String(r[1] || "").split(",").forEach(function (to) {
      to = to.trim().toLowerCase();
      if (!to) return;
      (byPerson[to] = byPerson[to] || []).push({ when: String(r[0]).slice(0, 16).replace("T", " "), subject: String(r[3]), body: String(r[4]) });
    });
  });
  var name = MS_PAGE === "oil-analysis" ? "Oil Lubrication" : "Vibration Analysis";
  var sent = 0;
  Object.keys(byPerson).forEach(function (to) {
    var list = byPerson[to];
    var body = list.map(function (x) {
      var text = x.body.split("\n\nOpen the ACC Reliability Platform")[0];
      return "• " + x.subject + "  (" + x.when + ")\n  " + text.replace(/\n/g, "\n  ");
    }).join("\n\n");
    try {
      MailApp.sendEmail({ to: to, subject: "[ACC Reliability] " + name + " — daily digest (" + list.length + ")",
        body: body + "\n\nOpen the ACC Reliability Platform for the details." });
      sent++;
    } catch (err) {}
  });
  sh.deleteRows(2, rows.length);
  return { status: "ok", sent: sent };
}

// Run once from the Apps Script editor: the hourly digest trigger (the
// digest time itself is set in Settings → Email & notifications).
function installEmailDigest() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendEmailDigest") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendEmailDigest").timeBased().everyHours(1).create();
  return "Digest trigger installed (hourly check; sends at the digest time)";
}

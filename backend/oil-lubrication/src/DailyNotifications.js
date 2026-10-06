// Phase 6 — daily notifications (bell, plus email when the App Owner has
// email turned on). One run a day; every item is announced once — what was
// already sent is kept in OL_NOTIFY_SENT, so running it again the same day
// (or the next day) doesn't repeat it.
//
//  - Lubrication point due soon (oil change or sample due within 7 days,
//    not already on an open route of that type) → that contractor's
//    engineers, one combined message per contractor.
//  - Route overdue (not submitted by due date + duration + 7 days) → the
//    contractor's engineers and the assigned technician, once per route.
//  - Stock shortage (scheduled work in the next 30 days needs more than is
//    in stock) → the contractor's and ACC engineers, at most once a week
//    per oil.
//  - Phase 7: route or action still overdue 10 days later → the
//    contractor's manager(s) and the ACC manager(s) — see Managers.js.
//
// Set up once: run installDailyOilNotificationsTrigger from the Apps Script
// editor (it replaces any earlier trigger for this job).

var NOTIFY_SENT_SHEET = "OL_NOTIFY_SENT";
var DUE_SOON_NOTIFY_DAYS = 7;
var SHORTAGE_NOTIFY_DAYS = 30;

function notifySentKeys_(ss) {
  var sheet = ss.getSheetByName(NOTIFY_SENT_SHEET);
  var map = {};
  if (!sheet) return map;
  var vals = sheet.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var k = String(vals[i][0] || "").trim();
    if (k) map[k] = vals[i][1];
  }
  return map;
}

function markNotified_(ss, keys) {
  if (!keys.length) return;
  var sheet = ss.getSheetByName(NOTIFY_SENT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTIFY_SENT_SHEET);
    sheet.appendRow(["Key", "SentAt"]);
  }
  var now = new Date();
  keys.forEach(function (k) { sheet.appendRow([k, now]); });
}

function isoDay_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd");
}

function weekKey_(d) {
  var start = new Date(d.getFullYear(), 0, 1);
  return d.getFullYear() + "-W" + Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

// LP_ID -> { "Oil Change": true, "Sampling": true } for routes still open.
function lpsOnOpenRoutes_(ss) {
  var open = {};
  var openIds = {};
  readSheet(ss, "ROUTINES", true).forEach(function (r) {
    var st = normRouteStatus_(r[5]);
    if (st === ROUTE_STATUS.DRAFT || st === ROUTE_STATUS.ASSIGNED || st === ROUTE_STATUS.IN_PROGRESS || st === ROUTE_STATUS.WAITING) {
      openIds[String(r[0] || "").trim()] = String(r[13] || "").trim();
    }
  });
  readSheet(ss, "OA_ROUTINE_ITEMS", true).forEach(function (it) {
    var type = openIds[String(it[1] || "").trim()];
    if (!type) return;
    var lp = String(it[2] || "").trim();
    if (!open[lp]) open[lp] = {};
    open[lp][type] = true;
  });
  return open;
}

function runDailyOilNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { status: "error", message: "busy" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sent = notifySentKeys_(ss);
    var newKeys = [];
    var summary = { dueSoon: 0, routesOverdue: 0, shortages: 0, escalations: 0 };
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var soonEnd = new Date(today.getTime() + DUE_SOON_NOTIFY_DAYS * 86400000);

    // ── Lubrication points due soon ──────────────────────────────────
    var equipment = readEquipmentRegistry().equipment || [];
    var onRoute = lpsOnOpenRoutes_(ss);
    var nextChange = {};
    readSheet(ss, "Oil Change LOG", true).forEach(function (r) {
      var lp = String(r[1] || "").trim();
      var ev = asDate_(r[4]);
      if (!lp || !ev) return;
      if (!nextChange[lp] || ev.getTime() > nextChange[lp].ev.getTime()) nextChange[lp] = { ev: ev, next: asDate_(r[11]) };
    });
    var lastSample = {};
    readSheet(ss, "Data_Entry", true).forEach(function (r) {
      var lp = String(r[0] || "").trim();
      var d = asDate_(r[4]);
      if (lp && d && (!lastSample[lp] || d.getTime() > lastSample[lp].getTime())) lastSample[lp] = d;
    });
    var dueByContractor = {};
    equipment.forEach(function (eq) {
      if (!eq.code || !eq.contractor) return;
      var items = [];
      var nc = nextChange[eq.code];
      if (nc && nc.next && nc.next.getTime() >= today.getTime() && nc.next.getTime() <= soonEnd.getTime() && !(onRoute[eq.code] || {})["Oil Change"]) {
        items.push({ type: "Oil change", due: nc.next });
      }
      if (eq.oilAnalysisRequired === "Yes" && lastSample[eq.code]) {
        var months = intervalMonthsForSampling_(eq.interval);
        var sDue = months ? sampleDueDate_(lastSample[eq.code], months) : null;
        if (sDue && sDue.getTime() >= today.getTime() && sDue.getTime() <= soonEnd.getTime() && !(onRoute[eq.code] || {})["Sampling"]) {
          items.push({ type: "Sample", due: sDue });
        }
      }
      items.forEach(function (it) {
        var key = "due|" + eq.code + "|" + it.type + "|" + isoDay_(it.due);
        if (sent[key]) return;
        newKeys.push(key);
        if (!dueByContractor[eq.contractor]) dueByContractor[eq.contractor] = [];
        dueByContractor[eq.contractor].push(eq.code + " — " + it.type + " due " + formatDateForEmail_(it.due));
      });
    });
    Object.keys(dueByContractor).forEach(function (contractor) {
      var lines = dueByContractor[contractor];
      var people = maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor);
      var msg = lines.length + " lubrication point(s) due within " + DUE_SOON_NOTIFY_DAYS + " days: " + lines.join("; ");
      recordInAppNotificationForEach_(ss, people, "lp-due-soon", msg, contractor, "routines", "");
      if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: " + lines.length + " point(s) due soon — " + contractor, body: lines.join("\n") + "\n\nCreate the routes in Routines (the suggestions list shows them)." });
      summary.dueSoon += lines.length;
    });

    // ── Routes overdue ───────────────────────────────────────────────
    readSheet(ss, "ROUTINES", true).forEach(function (r) {
      var st = normRouteStatus_(r[5]);
      if (st !== ROUTE_STATUS.DRAFT && st !== ROUTE_STATUS.ASSIGNED && st !== ROUTE_STATUS.IN_PROGRESS) return;
      var due = asDate_(r[14]);
      if (!due) return;
      var overdueFrom = new Date(due.getTime() + ((parseInt(r[18], 10) || 0) + ROUTE_OVERDUE_GRACE_DAYS + 1) * 86400000);
      if (today.getTime() < overdueFrom.getTime()) return;
      var id = String(r[0] || "").trim();
      var key = "route-overdue|" + id;
      if (sent[key]) return;
      newKeys.push(key);
      var contractor = String(r[3] || "").trim();
      var people = contractor ? maResponsibleEmails_(MA_RESP.CONTRACTOR, contractor) : [];
      var tech = String(r[2] || "").trim();
      if (tech && people.indexOf(tech) === -1) people.push(tech);
      var msg = "Route " + (r[12] || id) + " is overdue (due " + formatDateForEmail_(due) + ", status " + st + ").";
      recordInAppNotificationForEach_(ss, people, "route-overdue", msg, contractor, "routines", id);
      if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: route overdue — " + (r[12] || id), body: msg });
      summary.routesOverdue++;
    });

    // ── Stock shortage over the next 30 days ─────────────────────────
    var fc = getOilInventoryForecast(null, null, SHORTAGE_NOTIFY_DAYS);
    var shortByContractor = {};
    (fc.shortages || []).forEach(function (f) {
      var key = "shortage|" + f.contractor + "|" + f.lubricant + "|" + f.lubricantBrand + "|" + weekKey_(today);
      if (sent[key]) return;
      newKeys.push(key);
      if (!shortByContractor[f.contractor]) shortByContractor[f.contractor] = [];
      shortByContractor[f.contractor].push(f.lubricant + (f.lubricantBrand ? " / " + f.lubricantBrand : "") + ": need " + f.quantityNeeded + " L, " +
        (f.currentStock === null ? "no matching product in stock" : "have " + f.currentStock + " L (short " + f.shortfall + " L)"));
    });
    Object.keys(shortByContractor).forEach(function (contractor) {
      var lines = shortByContractor[contractor];
      var people = getNotifyReviewers_(contractor);
      var msg = "Stock shortage for the next " + SHORTAGE_NOTIFY_DAYS + " days (" + contractor + "): " + lines.join("; ") + ". Obtain stock, reschedule, or use an approved equivalent oil.";
      recordInAppNotificationForEach_(ss, people, "stock-shortage", msg, contractor, "inventory", "");
      if (people.length) sendNotificationEmail_({ to: people.join(","), subject: "Oil Lubrication: stock shortage — " + contractor, body: lines.join("\n") + "\n\nObtain stock, reschedule the work, or use an approved equivalent oil." });
      summary.shortages += lines.length;
    });

    // ── Phase 7: escalate what's still overdue 10 days later ─────────
    if (typeof escalateLongOverdue_ === "function") {
      summary.escalations = escalateLongOverdue_(ss, today, sent, newKeys);
    }

    markNotified_(ss, newKeys);
    Logger.log(JSON.stringify(summary));
    return { status: "ok", summary: summary };
  } finally {
    lock.releaseLock();
  }
}

function installDailyOilNotificationsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runDailyOilNotifications") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runDailyOilNotifications").timeBased().everyDays(1).atHour(6).create();
  return "Daily notifications will run every morning around 6:00.";
}

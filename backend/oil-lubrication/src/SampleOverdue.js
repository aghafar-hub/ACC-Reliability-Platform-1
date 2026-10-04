// Monthly (checked daily) sample-overdue detection and notification.
//
// Two things happen on each run:
//  1. For any LP whose sampling interval has lapsed (same OK/OVERDUE/
//     MISSING grace windows the frontend's Sample Tracker page already
//     uses — see sampleStatusLabel_'s own comment), write "Missing" into
//     the CURRENT month's Oil Sample Tracker cell — but ONLY the current
//     month, and ONLY if that cell is still blank. Confirmed directly
//     with the user: no retroactive backfill of past months the first
//     time this runs, however long an LP has already been overdue —
//     every run only ever touches "now", so the "Missing" trail builds up
//     one real month at a time going forward, never reconstructs history.
//  2. Once per contractor per calendar month (tracked in
//     OL_SAMPLE_DIGEST_LOG, so this is safe to run daily without
//     re-notifying every day), sends an in-app notification + email to
//     that contractor's assigned Contractor Engineer
//     (ModuleResponsibilities.js) listing what's currently missing/
//     overdue and what's coming due in the next 30 days.
//
// Deliberately named with NO trailing underscore — same bug-hunt fix as
// sendAgingActionsDigest/sendLowStockDigest (Notifications.js): Apps
// Script's Triggers UI hides underscore-suffixed functions from its
// function picker, so a time-based trigger for this needs the plain name
// to be selectable there at all.

// Same grace windows as apps/oil-analysis/src/parsers.js's
// sampleTrackerStatus — MUST stay in sync with that file by hand, since
// there's no shared module between this Apps Script project and the
// frontend bundle. An LP is OK until interval+OK_GRACE months old, then
// OVERDUE until interval+OK_GRACE+OVERDUE_GRACE months old, then MISSING.
var SAMPLE_OK_GRACE_MONTHS = 0.5;
var SAMPLE_OVERDUE_GRACE_MONTHS = 1.5;

// Mirrors apps/oil-analysis/src/parsers.js's intervalMonths() exactly,
// including the Monthly/Weekly/Daily word forms — a real, confirmed bug
// in that file's own history (see its own comment) came from exactly this
// kind of parser silently not handling those words. Not reused from
// OilChanges.js's intervalMonthsForOilChange_, which is narrower (no
// word-form handling at all) and parses a DIFFERENT interval field
// (Oil_Change_Interval, not Oil_Analysis_Interval).
function intervalMonthsForSampling_(freqText) {
  if (!freqText) return null;
  var t = String(freqText).trim().toLowerCase();
  if (t === "oil analysis") return 36;
  if (t === "if needed") return null;
  if (t === "monthly") return 1;
  if (t === "weekly") return 0.25;
  if (t === "daily") return 1 / 30;
  var yearMatch = t.match(/^([\d.]+)\s*y$/);
  if (yearMatch) return Math.round(parseFloat(yearMatch[1]) * 12);
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function sampleAgeMonths_(lastDateStr) {
  var last = new Date(lastDateStr);
  if (isNaN(last.getTime())) return null;
  return (Date.now() - last.getTime()) / 86400000 / 30.44;
}

// "OK" | "OVERDUE" | "MISSING" — mirrors parsers.js's sampleTrackerStatus
// (label only; this doesn't need the daysInfo display string).
function sampleStatusLabel_(lastDateStr, months) {
  if (!months) return "OK"; // "If needed"/unparseable — never overdue, matches the frontend
  if (!lastDateStr) return "MISSING";
  var age = sampleAgeMonths_(lastDateStr);
  if (age === null) return "MISSING";
  if (age <= months + SAMPLE_OK_GRACE_MONTHS) return "OK";
  if (age <= months + SAMPLE_OK_GRACE_MONTHS + SAMPLE_OVERDUE_GRACE_MONTHS) return "OVERDUE";
  return "MISSING";
}

// Next due date from a last-sample date + its interval — same day-of-
// month overflow clamp as the backend's own addMonths_ (OilChanges.js):
// a last sample on the 31st with a 1-month interval must land on Feb 28,
// not roll into March.
function sampleDueDate_(lastDateStr, months) {
  var last = new Date(lastDateStr);
  if (isNaN(last.getTime()) || !months) return null;
  var origDay = last.getDate();
  var due = new Date(last.getTime());
  due.setMonth(due.getMonth() + months);
  if (due.getDate() !== origDay) due.setDate(0);
  return due;
}

function sampleDigestAlreadySentThisMonth_(ss, contractor, monthKey) {
  var rows = readSheet(ss, "OL_SAMPLE_DIGEST_LOG", true);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === contractor && String(rows[i][1] || "").trim() === monthKey) return true;
  }
  return false;
}

function markSampleDigestSent_(ss, contractor, monthKey) {
  var sheet = ss.getSheetByName("OL_SAMPLE_DIGEST_LOG");
  if (!sheet) {
    sheet = ss.insertSheet("OL_SAMPLE_DIGEST_LOG");
    sheet.getRange(1, 1, 1, 3).setValues([["Contractor", "Month", "SentAt"]]);
  }
  sheet.appendRow([contractor, monthKey, new Date().toISOString()]);
}

function checkSampleOverdueAndNotify() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registryResult = readEquipmentRegistry();
  var equipment = (registryResult.equipment || []).filter(function (eq) {
    return eq.oilAnalysisRequired === "Yes";
  });
  if (equipment.length === 0) return { status: "ok", skipped: true };

  var trackerSheet = ss.getSheetByName("Oil Sample Tracker");
  if (!trackerSheet) return { status: "error", error: "Oil Sample Tracker sheet not found" };

  var lastRow = trackerSheet.getLastRow();
  var lastCol = trackerSheet.getLastColumn();
  var trackerByCode = {}; // code -> { rowIdx (1-based), lastSample }
  if (lastRow >= 2) {
    var trackerVals = trackerSheet.getRange(1, 1, lastRow, Math.max(lastCol, 2)).getValues();
    for (var r = 1; r < trackerVals.length; r++) {
      var code = String(trackerVals[r][0] || "").trim();
      if (!code) continue;
      trackerByCode[code] = { rowIdx: r + 1, lastSample: trackerVals[r][1] || "" };
    }
  }

  var now = new Date();
  var tz = Session.getScriptTimeZone() || "UTC";
  var monthHeader = MONTH_ABBR[now.getMonth()] + "-" + String(now.getFullYear()).slice(-2);
  var monthCol = findOrCreateMonthColumn_(trackerSheet, monthHeader);
  var displayDate = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  var overdueByContractor = {};
  var upcomingByContractor = {};

  equipment.forEach(function (eq) {
    var months = intervalMonthsForSampling_(eq.interval);
    if (!months) return;
    var tr = trackerByCode[eq.code];
    var lastSample = tr ? tr.lastSample : "";
    var status = sampleStatusLabel_(lastSample, months);
    var contractor = eq.contractor || "";
    if (!contractor) return;

    if (status === "MISSING") {
      (overdueByContractor[contractor] = overdueByContractor[contractor] || []).push({ code: eq.code, description: eq.description });

      var rowIdx;
      if (tr) {
        rowIdx = tr.rowIdx;
      } else {
        rowIdx = trackerSheet.getLastRow() + 1;
        trackerSheet.getRange(rowIdx, 1).setValue(eq.code);
        trackerByCode[eq.code] = { rowIdx: rowIdx, lastSample: "" };
      }
      // Never overwrites a cell that already has something in it — a real
      // sample entered earlier today, or an earlier run's own "Missing"
      // stamp already there.
      var existingCell = trackerSheet.getRange(rowIdx, monthCol).getValue();
      if (!existingCell) {
        trackerSheet.getRange(rowIdx, monthCol).setValue("Missing|" + displayDate);
      }
    } else if (status === "OK") {
      var due = sampleDueDate_(lastSample, months);
      if (due) {
        var daysUntilDue = (due.getTime() - now.getTime()) / 86400000;
        if (daysUntilDue > 0 && daysUntilDue <= 30) {
          (upcomingByContractor[contractor] = upcomingByContractor[contractor] || []).push({
            code: eq.code,
            description: eq.description,
            dueDate: due,
          });
        }
      }
    }
  });

  var monthKey = Utilities.formatDate(now, tz, "yyyy-MM");
  KNOWN_CONTRACTORS.forEach(function (contractor) {
    var overdue = overdueByContractor[contractor] || [];
    var upcoming = upcomingByContractor[contractor] || [];
    if (overdue.length === 0 && upcoming.length === 0) return;
    if (sampleDigestAlreadySentThisMonth_(ss, contractor, monthKey)) return;

    var recipientEmail = getModuleResponsibleEmail_("Oil Lubrication", contractor, "Contractor Engineer");
    if (!recipientEmail) return; // nobody assigned yet — nothing to notify, not an error

    var lines = [];
    if (overdue.length) {
      lines.push(overdue.length + " LP(s) overdue for sampling:");
      overdue.forEach(function (e) {
        lines.push("  - " + e.code + (e.description ? " (" + e.description + ")" : ""));
      });
      lines.push("");
    }
    if (upcoming.length) {
      lines.push(upcoming.length + " LP(s) due for sampling in the next 30 days:");
      upcoming.forEach(function (e) {
        lines.push("  - " + e.code + (e.description ? " (" + e.description + ")" : "") + " — due " + formatDateForEmail_(e.dueDate));
      });
    }

    recordInAppNotificationForEach_(
      ss,
      [recipientEmail],
      "sample-overdue",
      overdue.length + " overdue / " + upcoming.length + " upcoming sample(s) — " + contractor,
      contractor,
      "tracker",
      ""
    );
    sendNotificationEmail_({
      to: recipientEmail,
      subject: "Oil Lubrication: Sample Tracker — " + contractor + " (" + monthKey + ")",
      body: lines.join("\n"),
    });

    markSampleDigestSent_(ss, contractor, monthKey);
  });

  return { status: "ok", action: "checkSampleOverdueAndNotify", checked: equipment.length };
}

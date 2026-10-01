// Recurring Route templates: create/list/pause/resume/delete, and the
// scheduled job that turns a due template into a real, assignable Routine.
// "Solid app round" addition (see docs/oil-lubrication-migration-notes.md)
// — not part of the original Routine workflow in Routines.js.



// ─── ROUTINE_TEMPLATES sheet ──────────────────────────────────────────────
// Columns: 0 TemplateId, 1 RouteName, 2 RouteType ("Oil Change"|"Sampling"),
// 3 Contractor, 4 Area (blank = all areas), 5 OilType (registry Lubricant
// filter, blank = all), 6 Frequency ("Weekly"|"Monthly"|"Quarterly"),
// 7 NextGenerateDate, 8 Status ("Active"|"Paused"), 9 CreatedBy,
// 10 CreatedDate, 11 LastGeneratedRoutineId, 12 ModifiedDate. Row 1 =
// header, row 2+ = data (standard dataStartRowFor default). appendRow
// auto-creates this sheet (with headers) the first time a template is
// saved — no manual sheet setup needed, unlike the trigger below.
var ROUTE_TEMPLATE_HEADERS = [
  "TemplateId", "RouteName", "RouteType", "Contractor", "Area", "OilType",
  "Frequency", "NextGenerateDate", "Status", "CreatedBy", "CreatedDate",
  "LastGeneratedRoutineId", "ModifiedDate"
];

function readRouteTemplates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "ROUTINE_TEMPLATES", true);
  return { templates: rows, count: rows.length };
}


function createRouteTemplate(ss, data) {
  var routeName = String(data.routeName || "").trim();
  if (!routeName) return { error: "routeName is required" };
  var routeType = String(data.routeType || "").trim();
  if (routeType !== "Oil Change" && routeType !== "Sampling") return { error: "routeType must be 'Oil Change' or 'Sampling'" };
  var frequency = String(data.frequency || "").trim();
  if (["Weekly", "Monthly", "Quarterly"].indexOf(frequency) === -1) return { error: "frequency must be Weekly, Monthly, or Quarterly" };
  var contractor = String(data.contractor || "").trim();
  if (!contractor) return { error: "contractor is required" };

  var startDate = data.startDate ? new Date(data.startDate) : new Date();
  if (isNaN(startDate.getTime())) return { error: "startDate is invalid" };

  var templateId = String(data.templateId || ("RTP-" + Utilities.getUuid()));
  var row = [
    templateId,
    routeName,
    routeType,
    contractor,
    String(data.area || "").trim(),
    String(data.oilType || "").trim(),
    frequency,
    startDate,
    "Active",
    data.createdBy || "",
    new Date(),
    "", // LastGeneratedRoutineId
    "", // ModifiedDate — filled by appendRow's stampLastModified
  ];
  appendRow(ss, "ROUTINE_TEMPLATES", row, ROUTE_TEMPLATE_HEADERS);
  return { status: "ok", templateId: templateId };
}


// Same purpose as Routines.js#getRoutineContractor_, for an existing
// template (assign/status/delete actions run their own scope check before
// touching the sheet).
function getTemplateContractor_(templateId) {
  var id = String(templateId || "").trim();
  if (!id) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "ROUTINE_TEMPLATES", true);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === id) return String(rows[i][3] || "").trim();
  }
  return null;
}


function setRouteTemplateStatus(ss, data) {
  var templateId = String(data.templateId || "").trim();
  if (!templateId) return { error: "templateId is required" };
  var status = String(data.status || "").trim();
  if (status !== "Active" && status !== "Paused") return { error: "status must be Active or Paused" };
  var sheet = ss.getSheetByName("ROUTINE_TEMPLATES");
  if (!sheet) return { error: "No route templates exist yet" };
  var rowIdx = findRowIndex(sheet, [0], [templateId], dataStartRowFor("ROUTINE_TEMPLATES"));
  if (rowIdx === -1) return { error: "Template not found" };
  sheet.getRange(rowIdx, 9).setValue(status);
  stampLastModified(sheet, "ROUTINE_TEMPLATES", rowIdx);
  return { status: "ok" };
}


function deleteRouteTemplate(ss, data) {
  var templateId = String(data.templateId || "").trim();
  if (!templateId) return { error: "templateId is required" };
  var ok = deleteRow(ss, "ROUTINE_TEMPLATES", [0], [templateId]);
  return ok ? { status: "ok" } : { error: "Template not found" };
}



// ─── Recurring generation (scheduled job) ─────────────────────────────────
//
// Deliberately NOT wired into doGet/doPost — this runs only two ways:
//  (1) the installable daily time trigger the deployment guide has you set
//      up once, by hand, in the Apps Script editor's Triggers panel
//      (clock icon → Add Trigger → this function → Time-driven → Day
//      timer). Apps Script has no auto-recurring "simple trigger" for
//      this the way onEdit/onOpen are automatic — someone has to wire it.
//  (2) manually: open the script editor, pick generateDueRouteInstances
//      from the Run dropdown, click Run. Useful to verify it works right
//      after deploying, without waiting a day for the trigger.
// Kept off the Web App request path on purpose, so it never has to
// contend with doPost's own script lock (see Code.js) — it takes its own
// below instead.
var ROUTE_GENERATION_LEAD_DAYS = 3;

function generateDueRouteInstances() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(30000);
  if (!gotLock) {
    logError("generateDueRouteInstances:lock-timeout", "Could not acquire lock within 30s", {});
    return { status: "error", message: "busy" };
  }
  try {
    var templatesSheet = ss.getSheetByName("ROUTINE_TEMPLATES");
    if (!templatesSheet) return { status: "ok", generated: [] };
    var templateRows = readSheet(ss, "ROUTINE_TEMPLATES", true);
    if (templateRows.length === 0) return { status: "ok", generated: [] };

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var leadCutoff = new Date(today.getTime() + ROUTE_GENERATION_LEAD_DAYS * 86400000);

    var registry = readEquipmentRegistry().equipment;
    var samples = readSheet(ss, "Data_Entry", true);
    var oilChangeLog = readSheet(ss, "Oil Change LOG", true);
    var actionRows = readSheet(ss, "Action Tracker", true);

    var dataStart = dataStartRowFor("ROUTINE_TEMPLATES");
    var generated = [];

    for (var i = 0; i < templateRows.length; i++) {
      var t = templateRows[i];
      var templateId = String(t[0] || "").trim();
      if (!templateId) continue;
      var status = String(t[8] || "").trim();
      if (status !== "Active") continue;
      var nextGenDate = t[7] ? new Date(t[7]) : null;
      if (!nextGenDate || isNaN(nextGenDate.getTime())) continue;
      if (nextGenDate.getTime() > leadCutoff.getTime()) continue; // not due within the lead window yet

      var routeName = String(t[1] || "").trim();
      var routeType = String(t[2] || "").trim();
      var contractor = String(t[3] || "").trim();
      var area = String(t[4] || "").trim();
      var oilType = String(t[5] || "").trim();
      var frequency = String(t[6] || "").trim();

      var lpIds = computeDueLpIds_(routeType, area, oilType, contractor, registry, samples, oilChangeLog, actionRows, leadCutoff);
      var routineId = null;
      if (lpIds.length > 0) {
        routineId = "RT-" + Utilities.getUuid();
        var dueLabel = Utilities.formatDate(nextGenDate, Session.getScriptTimeZone() || "Etc/UTC", "d MMM yyyy");
        var routineRow = [
          routineId, "System (recurring)", "", contractor, new Date(), "Unassigned",
          "", "", "", "", "", "",
          routeName + " — " + dueLabel, routeType, nextGenDate, templateId,
        ];
        appendRow(ss, "ROUTINES", routineRow);
        var itemType = routeType === "Sampling" ? "Sample" : "Change";
        for (var j = 0; j < lpIds.length; j++) {
          appendRow(ss, "OA_ROUTINE_ITEMS", [
            "RI-" + Utilities.getUuid(), routineId, lpIds[j], itemType, "", "", "", "", "", "", new Date(), "",
          ]);
        }
        generated.push(routineId);
      }

      // Advance the schedule regardless of whether anything was actually
      // due this cycle — a clean area/contractor for one cycle isn't a
      // reason to re-check (and re-skip) it again every single day.
      var nextNext = advanceByFrequency_(nextGenDate, frequency);
      templatesSheet.getRange(dataStart + i, 8).setValue(nextNext);
      if (routineId) templatesSheet.getRange(dataStart + i, 12).setValue(routineId);
      stampLastModified(templatesSheet, "ROUTINE_TEMPLATES", dataStart + i);
    }

    invalidateDashboardCache();
    logError("generateDueRouteInstances:ok", "generated " + generated.length, { generated: generated });
    return { status: "ok", generated: generated };
  } finally {
    lock.releaseLock();
  }
}


// Which LP_IDs are due (or already flagged for resample) for a given
// route's filters, as of leadCutoff. Mirrors the frontend's own
// suggestion logic (parsers.js's suggestedRoutinePoints /
// routineSuggestionReason, used by the manual New Routine picker) closely
// enough that a recurring template and a manually-built route pick up the
// same points for the same criteria — but operates on raw sheet rows
// since this runs with no frontend involved.
function computeDueLpIds_(routeType, area, oilType, contractor, registry, samples, oilChangeLog, actionRows, leadCutoff) {
  // Open "Resample Oil" actions, by LP_ID — Action Tracker columns per
  // parsers.js's own header comment: 1 Equipment Code, 10 Status,
  // 11 Contractor Action, 16 Agreed Action.
  var openResampleLp = {};
  for (var a = 0; a < actionRows.length; a++) {
    if (String(actionRows[a][10] || "").trim() === "Closed") continue;
    var agreedAction = String(actionRows[a][16] || "").trim();
    var contractorAction = String(actionRows[a][11] || "").trim();
    if (agreedAction === "Resample Oil" || contractorAction === "Resample Oil") {
      openResampleLp[String(actionRows[a][1] || "").trim()] = true;
    }
  }

  // Most recent sample date per LP_ID (Data_Entry col 0 = Lub ID, col 4 = Sample Date).
  var lastSampleByLp = {};
  for (var s = 0; s < samples.length; s++) {
    var lpId = String(samples[s][0] || "").trim();
    if (!lpId) continue;
    var d = samples[s][4] ? new Date(samples[s][4]) : null;
    if (!d || isNaN(d.getTime())) continue;
    if (!lastSampleByLp[lpId] || d.getTime() > lastSampleByLp[lpId].getTime()) lastSampleByLp[lpId] = d;
  }

  // Most recent oil-change date per LP_ID (Oil Change LOG col 1 = LP_ID, col 4 = EventDate).
  var lastChangeByLp = {};
  for (var o = 0; o < oilChangeLog.length; o++) {
    var ocLp = String(oilChangeLog[o][1] || "").trim();
    if (!ocLp) continue;
    var od = oilChangeLog[o][4] ? new Date(oilChangeLog[o][4]) : null;
    if (!od || isNaN(od.getTime())) continue;
    if (!lastChangeByLp[ocLp] || od.getTime() > lastChangeByLp[ocLp].getTime()) lastChangeByLp[ocLp] = od;
  }

  var result = [];
  for (var r = 0; r < registry.length; r++) {
    var reg = registry[r];
    if (!reg.code) continue;
    if (contractor && reg.contractor !== contractor) continue;
    if (area && reg.area !== area) continue;
    if (oilType && reg.lubricant !== oilType) continue;

    if (openResampleLp[reg.code]) {
      result.push(reg.code);
      continue;
    }

    if (routeType === "Sampling") {
      if (reg.oilAnalysisRequired !== "Yes") continue;
      var months = intervalMonthsForRoute_(reg.interval);
      if (!months) continue;
      var last = lastSampleByLp[reg.code];
      if (!last) { result.push(reg.code); continue; }
      var due = addMonths_(last, months);
      if (due.getTime() <= leadCutoff.getTime()) result.push(reg.code);
    } else {
      var ocMonths = intervalMonthsForOilChange_(reg.oilChangeInterval);
      if (!ocMonths) continue;
      var lastChange = lastChangeByLp[reg.code];
      if (!lastChange) { result.push(reg.code); continue; }
      var ocDue = addMonths_(lastChange, ocMonths);
      if (ocDue.getTime() <= leadCutoff.getTime()) result.push(reg.code);
    }
  }
  return result;
}


// Mirrors the frontend's intervalMonths() in parsers.js (oil ANALYSIS
// interval text — "6 Months", "Monthly", "If needed" — distinct from
// intervalMonthsForOilChange_'s "2 Y"/"0.5 Y" format in OilChanges.js).
// Keep both in sync if the sheet's interval text ever changes shape. Also
// fixes the same bug the frontend had: a bare "Monthly"/"Weekly"/"Daily"
// (27 real registry rows use "Monthly") has no leading number, so a plain
// parseFloat() can't read it and falls through to "no fixed interval" —
// confirmed against the live Equipment Registry sheet.
function intervalMonthsForRoute_(freqText) {
  var t = String(freqText || "").trim().toLowerCase();
  if (!t || t === "if needed") return null;
  if (t === "oil analysis") return 36;
  if (t === "monthly") return 1;
  if (t === "weekly") return 0.25;
  if (t === "daily") return 1 / 30;
  var y = t.match(/^([\d.]+)\s*y$/);
  if (y) return Math.round(parseFloat(y[1]) * 12);
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}


// ─── Unified Routines overview (Patch 20) ─────────────────────────────────
//
// The new main Routines view promotes recurring templates to be the
// primary list (confirmed directly by the user during design review),
// with a standalone one-time routine (SourceTemplateId blank — the only
// other way a ROUTINES row is ever created, see createRoutine) appearing
// as its own row in the exact same list rather than a separate concept —
// "each line on the table view is for a routine," the user's own words.
// A template-GENERATED routine instance (SourceTemplateId set) does NOT
// get its own top-level row here — it's reached by drilling into its
// parent template instead (frontend concern, not this endpoint's).
//
// dueStatus values: "Paused" (template only — never auto-generates until
// resumed, so a due-date comparison would be misleading), "Completed"
// (standalone routine only — already Approved, nothing left to do),
// "Overdue" / "Due Soon" / "On Schedule" (everything else, from comparing
// the item's own due date against today).
var ROUTINE_DUE_SOON_DAYS = 7;

function countMatchingEquipment_(registry, routeType, area, oilType, contractor) {
  var count = 0;
  for (var i = 0; i < registry.length; i++) {
    var reg = registry[i];
    if (!reg.code) continue;
    if (contractor && reg.contractor !== contractor) continue;
    if (area && reg.area !== area) continue;
    if (oilType && reg.lubricant !== oilType) continue;
    if (routeType === "Sampling" && reg.oilAnalysisRequired !== "Yes") continue;
    count++;
  }
  return count;
}

function classifyDueStatus_(dueDate, today) {
  if (!dueDate || isNaN(dueDate.getTime())) return "Unknown";
  var diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "Overdue";
  if (diffDays <= ROUTINE_DUE_SOON_DAYS) return "Due Soon";
  return "On Schedule";
}

function getRoutinesOverview(scope) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registry = readEquipmentRegistry().equipment;
  var templateRows = readSheet(ss, "ROUTINE_TEMPLATES", true);
  var routineRows = readSheet(ss, "ROUTINES", true);
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Latest Approved routine's ApprovedDate per SourceTemplateId — "Last
  // Completed" for a template is the most recent instance it generated
  // that actually got signed off, not the template's own ModifiedDate.
  var lastCompletedByTemplate = {};
  routineRows.forEach(function (r) {
    var sourceTemplateId = String(r[15] || "").trim();
    if (!sourceTemplateId) return;
    if (String(r[5] || "").trim() !== "Approved") return;
    var approvedDate = r[8] ? new Date(r[8]) : null;
    if (!approvedDate || isNaN(approvedDate.getTime())) return;
    var prev = lastCompletedByTemplate[sourceTemplateId];
    if (!prev || approvedDate.getTime() > prev.getTime()) lastCompletedByTemplate[sourceTemplateId] = approvedDate;
  });

  var items = [];

  templateRows.forEach(function (t) {
    var templateId = String(t[0] || "").trim();
    if (!templateId) return;
    var contractor = String(t[3] || "").trim();
    if (scope && contractor !== scope) return;
    var routeType = String(t[2] || "").trim();
    var area = String(t[4] || "").trim();
    var oilType = String(t[5] || "").trim();
    var templateStatus = String(t[8] || "").trim();
    var nextGenDate = t[7] ? new Date(t[7]) : null;
    var lastCompleted = lastCompletedByTemplate[templateId];

    items.push({
      kind: "template",
      id: templateId,
      routeName: String(t[1] || "").trim(),
      routeType: routeType,
      contractor: contractor,
      area: area,
      frequency: String(t[6] || "").trim(),
      equipmentCount: countMatchingEquipment_(registry, routeType, area, oilType, contractor),
      nextDueDate: nextGenDate && !isNaN(nextGenDate.getTime()) ? nextGenDate.toISOString() : "",
      dueStatus: templateStatus === "Paused" ? "Paused" : classifyDueStatus_(nextGenDate, today),
      lastCompleted: lastCompleted ? lastCompleted.toISOString() : "",
      templateStatus: templateStatus,
    });
  });

  var itemCounts = {}; // routineId -> OA_ROUTINE_ITEMS row count
  readSheet(ss, "OA_ROUTINE_ITEMS", true).forEach(function (r) {
    var rid = String(r[1] || "").trim();
    if (rid) itemCounts[rid] = (itemCounts[rid] || 0) + 1;
  });

  routineRows.forEach(function (r) {
    if (String(r[15] || "").trim()) return; // belongs to a template — not a standalone top-level row
    var routineId = String(r[0] || "").trim();
    if (!routineId) return;
    var contractor = String(r[3] || "").trim();
    if (scope && contractor !== scope) return;
    var workflowStatus = String(r[5] || "").trim();
    var dueDate = r[14] ? new Date(r[14]) : null;
    var approvedDate = r[8] ? new Date(r[8]) : null;
    var isApproved = workflowStatus === "Approved";

    items.push({
      kind: "routine",
      id: routineId,
      routeName: String(r[12] || "").trim(),
      routeType: String(r[13] || "").trim(),
      contractor: contractor,
      area: "",
      frequency: "One-time",
      equipmentCount: itemCounts[routineId] || 0,
      nextDueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate.toISOString() : "",
      dueStatus: isApproved ? "Completed" : classifyDueStatus_(dueDate, today),
      lastCompleted: isApproved && approvedDate && !isNaN(approvedDate.getTime()) ? approvedDate.toISOString() : "",
      workflowStatus: workflowStatus,
    });
  });

  return { items: items, count: items.length };
}


// ─── Completion Rate Trend (Patch 20d) ──────────────────────────────────
//
// Item-weighted completion rate per month, confirmed directly by the user
// during design review: for routines due in a given month, rate = (LP
// items completed ON TIME, summed across those routines) / (total LP
// items, summed across those routines) — not a binary per-routine
// approved/not-approved count, so a 5-item routine with 4 done on time
// contributes 4/5 to its month, not 0 or 1. "On time" means the item's own
// ActualDate (date-only, ignoring time-of-day) is on or before the
// routine's own DueDate — an item completed after its routine's due date
// still counts toward the total but not toward on-time.
// A month with no routines due at all returns null (not 0%) in
// rateByMonth, so the frontend can render "no data" instead of a
// misleading 0% bar.
function getRoutineCompletionTrend(monthsParam, scope) {
  var months = Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6));
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();

  var monthKeys = [];
  for (var i = months - 1; i >= 0; i--) {
    monthKeys.push(monthKey_(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  var monthIndex = {};
  monthKeys.forEach(function (k, idx) { monthIndex[k] = idx; });
  var windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  function dateOnly_(d) {
    var r = new Date(d.getTime());
    r.setHours(0, 0, 0, 0);
    return r;
  }

  // Which month-bucket each routine's DueDate falls into — only routines
  // with a usable due date inside the window count toward the trend.
  var monthIdxByRoutine = {};
  var dueDateByRoutine = {};
  readSheet(ss, "ROUTINES", true).forEach(function (r) {
    var contractor = String(r[3] || "").trim();
    if (scope && contractor !== scope) return;
    var dueDate = r[14] ? new Date(r[14]) : null;
    if (!dueDate || isNaN(dueDate.getTime())) return;
    if (dueDate.getTime() < windowStart.getTime()) return;
    var idx = monthIndex[monthKey_(dueDate)];
    if (idx === undefined) return;
    var routineId = String(r[0] || "").trim();
    monthIdxByRoutine[routineId] = idx;
    dueDateByRoutine[routineId] = dateOnly_(dueDate);
  });

  var totalByMonth = monthKeys.map(function () { return 0; });
  var onTimeByMonth = monthKeys.map(function () { return 0; });

  readSheet(ss, "OA_ROUTINE_ITEMS", true).forEach(function (r) {
    var routineId = String(r[1] || "").trim();
    var idx = monthIdxByRoutine[routineId];
    if (idx === undefined) return;
    totalByMonth[idx]++;
    if (String(r[5] || "").trim() !== "Yes") return; // not Implemented
    var actualDate = r[7] ? new Date(r[7]) : null;
    if (!actualDate || isNaN(actualDate.getTime())) return;
    if (dateOnly_(actualDate).getTime() <= dueDateByRoutine[routineId].getTime()) onTimeByMonth[idx]++;
  });

  var rateByMonth = monthKeys.map(function (_, idx) {
    return totalByMonth[idx] > 0 ? Math.round((onTimeByMonth[idx] / totalByMonth[idx]) * 1000) / 10 : null;
  });

  return { months: monthKeys, rateByMonth: rateByMonth, totalByMonth: totalByMonth, onTimeByMonth: onTimeByMonth };
}


function advanceByFrequency_(date, frequency) {
  var origDay = date.getDate();
  var d = new Date(date.getTime());
  if (frequency === "Weekly") { d.setDate(d.getDate() + 7); return d; }
  // "Monthly", "Quarterly", or an unrecognized value (monthly is the safer
  // fallback over looping forever).
  var monthsToAdd = frequency === "Quarterly" ? 3 : 1;
  d.setMonth(d.getMonth() + monthsToAdd);
  // A due date on the 29th-31st has no equivalent in every target month
  // (e.g. no Feb 31) — JS's Date rolls that over into the next month
  // instead (Jan 31 + 1mo -> Mar 3), which would silently drift the
  // schedule forward one time. Clamp back to the target month's real last
  // day instead.
  if (d.getDate() !== origDay) d.setDate(0);
  return d;
}

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
  try {
    return generateDueRouteInstancesInner_();
  } finally {
    rcBump_(); // new routes: the cached reads are out of date (ReadCache.js)
  }
}

function generateDueRouteInstancesInner_() {
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
          routineId, "System (recurring)", "", contractor, new Date(), ROUTE_STATUS.DRAFT,
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
    invalidateRoutinesOverviewCache();
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
    if (normActionStatus_(actionRows[a][10]) === ACTION_STATUS.CLOSED) continue;
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
// dueStatus values: "Paused" (a template never auto-generates until
// resumed, or a standalone routine someone paused — either way a due-date
// comparison would be misleading), "Cancelled" (standalone routine only,
// via setRoutineStatus), "Completed" (standalone routine only — already
// Approved, nothing left to do), "Waiting Approval" (Phase 1: submitted,
// so no longer overdue), "Overdue" / "Due Soon" / "On Schedule"
// (everything else, from comparing the item's own due date against
// today).
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

// durationDays (optional, defaults to 0 — a template's own NextGenerateDate
// call site never passes one, preserving its exact old behavior) is a
// grace period after dueDate before a routine counts as Overdue —
// confirmed directly by the user: "Due date and Duration on days, if its
// started during this duration so will be on schedule." No "work actually
// started" timestamp exists anywhere in this schema, so this is a window
// on the same today-vs-date comparison this function already did, not
// literal start-time tracking — see Routines.js's own Duration column
// comment.
// graceDays (Phase 1, routes only): Overdue starts after DueDate +
// Duration + graceDays; inside that last week the route shows Due Soon.
function classifyDueStatus_(dueDate, today, durationDays, graceDays) {
  if (!dueDate || isNaN(dueDate.getTime())) return "Unknown";
  var windowEnd = dueDate.getTime() + (durationDays || 0) * 86400000;
  var overdueAfter = windowEnd + (graceDays || 0) * 86400000;
  if (Math.floor((overdueAfter - today.getTime()) / 86400000) < 0) return "Overdue";
  var diffDays = Math.floor((windowEnd - today.getTime()) / 86400000);
  if (diffDays <= ROUTINE_DUE_SOON_DAYS) return "Due Soon";
  return "On Schedule";
}

function getRoutinesOverview(scope) {
  var cacheKey = ROUTINES_OVERVIEW_CACHE_KEY + (scope ? (":" + scope) : "");
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    var parsed = JSON.parse(cached);
    parsed.fromCache = true;
    return parsed;
  }

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
    if (normRouteStatus_(r[5]) !== ROUTE_STATUS.CONFIRMED) return;
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

  // routineId -> { total, done } — now tracks completion too (Routines
  // tab improvement pass), not just the count, so the overview table can
  // show a completion percentage per routine without a separate fetch.
  var itemCounts = {};
  readSheet(ss, "OA_ROUTINE_ITEMS", true).forEach(function (r) {
    var rid = String(r[1] || "").trim();
    if (!rid) return;
    if (!itemCounts[rid]) itemCounts[rid] = { total: 0, done: 0 };
    itemCounts[rid].total++;
    if (String(r[5] || "").trim() === "Yes") itemCounts[rid].done++;
  });

  routineRows.forEach(function (r) {
    if (String(r[15] || "").trim()) return; // belongs to a template — not a standalone top-level row
    var routineId = String(r[0] || "").trim();
    if (!routineId) return;
    var contractor = String(r[3] || "").trim();
    if (scope && contractor !== scope) return;
    var workflowStatus = normRouteStatus_(r[5]);
    var dueDate = r[14] ? new Date(r[14]) : null;
    var approvedDate = r[8] ? new Date(r[8]) : null;
    var isApproved = workflowStatus === ROUTE_STATUS.CONFIRMED;
    var duration = parseInt(r[18], 10) || 0; // Duration (days) — see Routines.js's own column comment
    // dueStatus mirrors a template's own "Paused" handling above — a
    // paused or cancelled routine's due date comparison would be
    // misleading (it isn't going anywhere until resumed, or ever, if
    // cancelled), same reasoning as classifyDueStatus_'s own header
    // comment on why "Paused" skips the date math entirely.
    var oneTimeDueStatus = isApproved ? "Completed"
      : workflowStatus === "Paused" ? "Paused"
      : workflowStatus === "Cancelled" ? "Cancelled"
      : workflowStatus === ROUTE_STATUS.WAITING ? "Waiting Approval"
      : classifyDueStatus_(dueDate, today, duration, ROUTE_OVERDUE_GRACE_DAYS);

    var counts = itemCounts[routineId] || { total: 0, done: 0 };

    items.push({
      kind: "routine",
      id: routineId,
      routeName: String(r[12] || "").trim(),
      routeType: String(r[13] || "").trim(),
      contractor: contractor,
      // Area (col 17) — added alongside updateRoutine/setRoutineStatus; a
      // routine created before this column existed just reads back blank
      // here, same as it always has.
      area: String(r[17] || "").trim(),
      frequency: "One-time",
      equipmentCount: counts.total,
      itemsDone: counts.done,
      completionPct: counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : null,
      nextDueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate.toISOString() : "",
      duration: duration,
      dueStatus: oneTimeDueStatus,
      lastCompleted: isApproved && approvedDate && !isNaN(approvedDate.getTime()) ? approvedDate.toISOString() : "",
      workflowStatus: workflowStatus,
      // Phase 1: back with the technician after "Return for correction".
      returned: isRouteReturnedRow_(r, workflowStatus),
    });
  });

  var result = { items: items, count: items.length };
  cache.put(cacheKey, JSON.stringify(result), ROUTINES_OVERVIEW_CACHE_SECONDS);
  return result;
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

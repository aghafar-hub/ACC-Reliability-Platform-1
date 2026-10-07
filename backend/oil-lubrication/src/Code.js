// ════════════════════════════════════════════════════════════════════════════
// Arabian Cement Oil LUB — Apps Script v4.0 (Performance Redesign)
// ════════════════════════════════════════════════════════════════════════════
// Deploy as Web App: Execute as Me · Who has access: Anyone
//
// This is the real, already-deployed backend behind apps/oil-analysis (the
// embedded legacy Oil app) — not backend/oil-analysis (a separate,
// Routine/LP_ID-based backend built earlier for a module that was never
// linked into the sidebar; deleted once this backend was confirmed as the
// real one — see docs/).
//
// BACKWARD COMPATIBLE: readAll / append / updateRow / deleteRow all still work
// exactly as before — existing app continues to function during migration.
//
// NEW ENDPOINTS (all via doGet, JSONP-capable with &callback=fnName):
//   ?action=getDashboard                    → aggregated counts, cached 5 min
//   ?action=getEquipment&id=XXXX            → samples+actions+oilChanges for one equipment
//   ?action=searchEquipment&q=text          → top 20 matching Data_Entry rows
//   ?action=getActions&page=1&limit=50      → paginated Action Tracker rows
//   ?action=getOilChanges&page=1&limit=50   → paginated Oil Change LOG rows
//   ?action=getOilChangesForLp&lpId=XXXX    → all Oil Change LOG events for one LP_ID
//   ?action=getTopUpsForLp&lpId=XXXX        → all Oil Top Up LOG events for one LP_ID
//                                              (see TopUps.js) — doPost logOilTopUp is
//                                              the only way this app writes to it
//   ?action=getRecentSamples&page=1&limit=50→ paginated Data_Entry rows (newest first)
//   ?action=getRoutines                     → all ROUTINES rows
//   ?action=getRoutine&routineId=XXXX       → single ROUTINES row by id, no
//                                              OA_ROUTINE_ITEMS join — much
//                                              lighter than getRoutines for
//                                              the one-routine case (the
//                                              Routines tab's own detail
//                                              view). See Routines.js's
//                                              getRoutine.
//   ?action=getRoutineItems&routineId=XXXX  → all OA_ROUTINE_ITEMS rows for one routine
//   ?action=getRouteTemplates               → all ROUTINE_TEMPLATES rows (recurring routes)
//   ?action=getRoutinesOverview              → unified list (Patch 20, see RouteTemplates.js):
//                                              every recurring template + every standalone
//                                              one-time routine, each with a computed
//                                              Equipment Count/Next Due Date/dueStatus
//                                              (Overdue/Due Soon/On Schedule/Paused/
//                                              Cancelled/Completed)/Last Completed — the
//                                              main Routines list's data source. Cached
//                                              per contractor scope (Routines tab load-
//                                              time pass) — see ROUTINES_OVERVIEW_CACHE_*
//                                              in Config.js and invalidateRoutinesOverview
//                                              Cache in Utils.js.
//   doPost updateRoutine                    → edit a routine's own RouteName/AssignedTo/
//                                              DueDate/Area/Reason (not RouteType or its
//                                              items) — locked once Approved. See
//                                              Routines.js's updateRoutine.
//   doPost setRoutineStatus                 → pause/resume/cancel a standalone routine
//                                              (Status: Paused/Cancelled, or back to
//                                              Assigned to resume). See Routines.js's
//                                              setRoutineStatus.
//   doPost returnRoutine                    → Phase 1: Waiting Approval → In Progress with
//                                              a reason (contractor's engineer only).
//   doPost rescheduleRoutine                → Phase 1: new due date + reason, recorded
//                                              (contractor's engineer only).
//   doPost deleteRoutine                    → Admin-only hard delete of a routine AND
//                                              every OA_ROUTINE_ITEMS row it owns —
//                                              distinct from setRoutineStatus's
//                                              "Cancelled" (which keeps the record).
//                                              See Routines.js's deleteRoutine.
//   ?action=getOilInventory                 → all "Oil Inventory" product rows
//   ?action=getOilInventoryForecast&months=3 → projected consumption vs. current stock
//   ?action=getOilInventoryConsumption&months=6 → actual historical monthly usage (Patch 21)
//   ?action=getAllOilInventoryMovements         → unified ledger across every product (Patch 23)
//   ?action=getRoutineCompletionTrend&months=6  → item-weighted on-time completion rate per month (Patch 20d)
//   ?action=getOilInventoryMovements&productId=XXXX → all LOG rows for one product
//   ?action=getStartupBundle                → readAll + Equipment Registry + Action
//                                              Registry in one response — used only for
//                                              the app's first-load fetch (see Dashboard.js's
//                                              getStartupBundle), not periodic re-sync
//   ?action=getAuditTrail&recordId=&page=&limit= → paginated "who changed what, when"
//                                              feed (see AuditLog.js), optionally
//                                              narrowed to one equipment/routine/
//                                              template/product id
//   ?action=getNotificationSettings          → email on/off + from address/name
//                                              (see Notifications.js) — admin-only to
//                                              change (doPost updateNotificationSettings),
//                                              open to read like every other GET
//   ?action=getInAppNotifications&limit=     → the caller's own in-app notification feed
//                                              (see InAppNotifications.js) — scoped to the
//                                              session's email, empty for an anonymous
//                                              request. doPost markNotificationRead /
//                                              markAllNotificationsRead mark them read.
//
// STEP 5 (see docs/oil-lubrication-migration-notes.md): Oil Inventory —
// same split as Step 2's Oil Change LOG. "Oil Inventory LOG" is the
// append-only source of truth for stock movements (doPost action
// logOilMovement is the only way this app writes to it); "Oil Inventory"
// is the product registry (Product_ID, type/brand, container, reorder
// level, storage, supplier, cost, status) PLUS two sheet-formula columns
// (Current_Stock, Last_Movement_Date) that self-update from the LOG the
// same way Oil Last Change's own formulas do — this backend reads that
// sheet fully but writes only the non-formula columns (addOilProduct /
// updateOilProduct), never G or M, or it would overwrite the formula with
// a static value.
//
// STEP 4 (see docs/oil-lubrication-migration-notes.md): Routines built
// fresh here — not by fixing/reusing the separate, parked backend/oil-
// analysis module (that one models routines around real user logins, which
// this app doesn't have). doPost actions createRoutine / submitRoutineItem
// / submitRoutine / approveRoutine / addRoutineComment write to ROUTINES
// and OA_ROUTINE_ITEMS, both already present (empty) in the live sheet
// with a schema that already matches this design.
//
// STEP 2 (see docs/oil-lubrication-migration-notes.md): "Oil Change Log" was
// the sheet's OLD tab name for a "current state per equipment/point/oilType"
// row — that tab is gone. The real tab today is "Oil Change LOG" (note the
// case — SpreadsheetApp.getSheetByName is case-sensitive, so the original
// v4.0 script silently got back an empty sheet here) and it's an
// append-only EVENT log: one row per real oil-change event, never edited in
// place. doPost action "logOilChangeEvent" is the only way this app writes
// to it now — updateRow's old special-case for this sheet is gone.
// "Oil Last Change" (a separate tab) is a formula-only derived view this
// backend never reads or writes — its own MAXIFS/IF formulas keep it in
// sync with Oil Change LOG on their own.
//
// LAST MODIFIED TRACKING:
//   Each sheet gets a new trailing column "Last Modified" (ISO timestamp).
//   Stamped automatically on append/updateRow. Used for future incremental sync.
//   Column positions (1-based): Data_Entry=39, Action Tracker=19, Oil Change LOG=13
//   (Oil Change LOG's column 13 is "Created_Date" — since rows are never
//   edited after being appended, "last modified" and "created" are the same
//   moment for this sheet.)
//
// STEP 3 (see docs/oil-lubrication-migration-notes.md): both Data_Entry and
// Action Tracker gained a "Report Equipment ID" column, shifting Last
// Modified from 38→39 and 17→19 respectively. The Action Tracker value was
// ALREADY off by one even before that shift (17 pointed at "Closing
// Comment", one column short of the real "Last Modified" header) — fixed
// here as part of the same correction, confirmed against the live sheet's
// own header row.
// ════════════════════════════════════════════════════════════════════════════

// This file is now just the two Web App entry points (doGet/doPost) — every
// actual feature implementation lives in the sibling files below, split out
// for maintainability (see docs/oil-lubrication-migration-notes.md):
//   Config.js             — shared constants (schema columns, caching, allowlist)
//   Auth.js               — shared secret + session-token verification
//   Utils.js              — generic sheet I/O, response formatting, row matching
//   Dashboard.js          — dashboard summary, equipment lookup/search, full/incremental sync
//   EquipmentRegistry.js  — "Equipment Registry" reads
//   SampleTracker.js      — "Oil Sample Tracker" monthly-column updates
//   SheetTriggers.js      — installed Sheets trigger(s) (not part of the Web App API)
//   OilChanges.js         — Oil Change LOG logging + history
//   TopUps.js             — Oil Top Up LOG logging + history (Patch 17 — emergency/
//                            ad-hoc top-ups, tracked separately from Oil Change LOG)
//   Routines.js           — Routine workflow (create/submit/approve/comment)
//   RouteTemplates.js     — recurring Route templates + due-instance generation
//   OilInventory.js       — Oil Inventory product registry + movement log
//   ActionRegistry.js     — OL_ACTION_PHRASES reads
//   Notifications.js      — best-effort email on Routine assigned/submitted/approved
//   InAppNotifications.js — in-app notification bell feed (same 5 events as Notifications.js)
//   AuditLog.js           — "who changed what, when" feed (recordAudit_/getAuditTrail)
//   ModuleAccess.js       — Phase 0: who may open this module, tab levels, status
//                            (identical copy in every module backend)
//   ModuleAccessConfig.js — Oil Lubrication's tabs + which tabs each request needs
// Apps Script shares one global scope across every file in a project, so this
// split changes nothing about how the code runs — same deployment, same URL,
// same single global scope every function in every file already shared.



// ─── Entry points ──────────────────────────────────────────────────────────

function doGet(e) {
  var callback = e.parameter.callback || "";
  var action   = e.parameter.action   || "readAll";
  var result;

  var auth = checkAuth_(e.parameter.secret, e.parameter.sessionToken);
  if (!auth.ok) {
    result = { error: "Unauthorized" };
    return outputResult_(result, callback);
  }

  try {
    // Computed once, reused by every case below — see Rbac.js's
    // getContractorScope_ for what null vs. a contractor label means.
    var scope = getContractorScope_(auth.session);

    var accessDenial = maCheckRead_(auth.session, action);
    if (accessDenial) {
      return outputResult_({ error: accessDenial, accessDenied: true }, callback);
    }

    switch (action) {
      case "getMyAccess":
        result = getMyAccess_(auth.session);
        break;
      case "getModuleAccessConfig":
        result = getModuleAccessConfig_();
        break;
      case "getModuleTechnicians":
        result = { technicians: maTechnicians_(scope || e.parameter.contractor || "") };
        break;
      case "readAll":
        result = maFilterSections_(auth.session, readAll(scope));
        break;
      case "getStartupBundle":
        result = maFilterSections_(auth.session, getStartupBundle(scope));
        break;
      case "getDashboard":
        result = getDashboard(scope);
        break;
      case "getEquipment":
        result = getEquipmentData(e.parameter.id || "", scope);
        break;
      case "searchEquipment":
        result = searchEquipment(e.parameter.q || "", scope);
        break;
      case "getActions":
        result = getPaginated("Action Tracker", e.parameter.page, e.parameter.limit, false, scope, 1);
        break;
      case "getOilChanges":
        result = getPaginated("Oil Change LOG", e.parameter.page, e.parameter.limit, false, scope, 1);
        break;
      case "getOilChangesForLp":
        result = getOilChangesForLp(e.parameter.lpId || "", scope);
        break;
      case "getTopUpsForLp":
        result = getTopUpsForLp(e.parameter.lpId || "", scope);
        break;
      case "getAllTopUps":
        result = getAllTopUps(scope);
        break;
      case "getRecentSamples":
        result = getPaginated("Data_Entry", e.parameter.page, e.parameter.limit, true, scope, 0); // newest first
        break;
      case "getChanges":
        result = maFilterSections_(auth.session, getChanges(e.parameter.since || "", scope));
        break;
      case "readEquipmentRegistry":
        result = readEquipmentRegistry();
        if (scope) {
          result.equipment = result.equipment.filter(function (eq) { return eq.contractor === scope; });
          result.count = result.equipment.length;
        }
        break;
      case "getRoutines":
        result = getRoutines();
        if (scope) {
          result.routines = result.routines.filter(function (r) { return String(r[3] || "").trim() === scope; });
          result.count = result.routines.length;
        }
        break;
      case "getRoutine":
        result = getRoutine(e.parameter.routineId || "", scope);
        break;
      case "getRoutineItems":
        var itemsRoutineId = e.parameter.routineId || "";
        if (scope && getRoutineContractor_(itemsRoutineId) !== scope) {
          result = { items: [], count: 0 };
        } else {
          result = getRoutineItems(itemsRoutineId);
        }
        break;
      case "getRouteTemplates":
        result = readRouteTemplates();
        if (scope) {
          result.templates = result.templates.filter(function (r) { return String(r[3] || "").trim() === scope; });
          result.count = result.templates.length;
        }
        break;
      case "getRoutesForLp":
        result = getRoutesForLp(e.parameter.lpId, scope);
        break;
      case "getMyWork":
        result = getMyWork(auth.session);
        break;
      case "getOilPlan":
        result = getOilPlan(e.parameter.lpIds, e.parameter.itemType, scope);
        break;
      case "getTeamWorkload":
        result = getTeamWorkload(scope);
        break;
      case "getSuggestions":
        result = getSuggestions(scope, e.parameter.all === "1");
        break;
      case "getRoutinesOverview":
        result = getRoutinesOverview(scope);
        break;
      case "getRoutineCompletionTrend":
        result = getRoutineCompletionTrend(e.parameter.months, scope);
        break;
      case "getOilInventory":
        result = getOilInventory(scope);
        break;
      case "getOilInventoryMovements":
        result = getOilInventoryMovements(e.parameter.productId || "", scope);
        break;
      case "getAllOilInventoryMovements":
        result = getAllOilInventoryMovements(scope);
        break;
      case "getOilInventoryForecast":
        result = getOilInventoryForecast(e.parameter.months, scope, e.parameter.days);
        break;
      case "getOilInventoryConsumption":
        result = getOilInventoryConsumption(e.parameter.months, scope);
        break;
      case "readActionRegistry":
        result = readActionRegistry();
        break;
      case "getAuditTrail":
        result = getAuditTrail(e.parameter.recordId || "", scope, e.parameter.page, e.parameter.limit);
        break;
      case "getNotificationSettings":
        result = getNotificationSettings_();
        break;
      case "getModuleResponsibilities":
        result = { responsibilities: getModuleResponsibilities_() };
        break;
      case "getInAppNotifications":
        result = getInAppNotifications_(auth.session ? auth.session.email : "", e.parameter.limit);
        break;
      case "test":
        result = { status:"ok", time: new Date().toISOString(), version:"4.0" };
        break;
      default:
        result = { status:"ok", time: new Date().toISOString() };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return outputResult_(result, callback);
}


function doPost(e) {
  var raw = "";
  try {
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else {
      logError("doPost:no-data", "No post data received", null);
      return jsonOut({status: "error", message: "No post data received"});
    }

    var data = JSON.parse(raw);
    var ss   = SpreadsheetApp.getActiveSpreadsheet();

    var auth = checkAuth_(data.secret, data.sessionToken);
    if (!auth.ok) {
      logError("doPost:unauthorized", "Invalid or missing secret/session", {action: data.action});
      return jsonOut({status: "error", message: "Unauthorized"});
    }
    // Whoever is logged in via Platform Core, if anyone — "" for a request
    // with no session token (see checkAuth_'s fail-soft rollout comment
    // above). Folded into every write's own Debug Log entry below so writes
    // are attributable to a real identity, not just a timestamp.
    var actingUser = auth.session ? auth.session.email : "";
    // Bug-hunt pass: this was missing entirely — every recordAudit_ call
    // below reads bare `scope`, but it was only ever declared inside
    // doGet, never here. Referencing an undeclared identifier throws
    // ReferenceError, which happened right before every recordAudit_ call
    // in append/updateSampleTracker/logOilChangeEvent/logOilTopUp/
    // updateRow/deleteRow — caught by the outer catch below, so the sheet
    // write itself (already done by that point) still succeeded and the
    // client never saw it (these are blind no-cors POSTs), but the Audit
    // Log entry for nearly every write in this app was silently never
    // recorded. Same helper doGet already uses for the same purpose.
    var scope = getContractorScope_(auth.session);

    // OPTION A HARDENING (see docs/oil-lubrication-migration-notes.md):
    // every write below reads a sheet snapshot, computes a row to touch,
    // then writes to it in a separate call — with no lock, two requests
    // running at the same moment can compute the SAME target row. That's a
    // real, confirmed bug, not a theoretical one: appendRow's "find the
    // first empty row" step and findRowIndex's "find the row to update/
    // delete" step both have this gap, and it gets more likely as more
    // people use the app at once. A single script-wide lock around the
    // whole write serializes every doPost, so only one write is ever in
    // flight against the sheet at a time — this closes the gap without
    // changing any of the write logic itself.
    var lock = LockService.getScriptLock();
    var gotLock = lock.tryLock(30000);
    if (!gotLock) {
      logError("doPost:lock-timeout", "Could not acquire lock within 30s", {action: data.action});
      return jsonOut({status: "error", message: "Server is busy — please try again."});
    }

    try {
      var writeDenial = maCheckWrite_(auth.session, data);
      if (writeDenial) {
        logError("doPost:access-denied", writeDenial, {action: data.action, actingUser: actingUser});
        return jsonOut({status: "error", message: writeDenial, accessDenied: true});
      }

      if (MA_ADMIN_ACTIONS.indexOf(data.action) !== -1) {
        requireAdmin_(auth.session);
        var maResult = maHandleAdminPost_(data, actingUser);
        logError("doPost:" + data.action, maResult.error || "ok", {actingUser: actingUser});
        if (!maResult.error) recordAudit_(ss, MA_CONFIG.peopleSheet, MA_CONFIG.moduleId, "update", actingUser, "", "Module access: " + data.action);
        return jsonOut(maResult.error ? {status: "error", message: maResult.error} : maResult);
      }

      if (data.action === "append") {
        requirePermission_(auth.session, "Create");
        if (GENERIC_WRITE_ALLOWLIST.append.indexOf(data.sheet) === -1) {
          logError("doPost:append:blocked", "Sheet not allowed via generic append", {sheet: data.sheet});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        var appendLpCol = GENERIC_WRITE_LP_COL[data.sheet];
        var appendLpId = (appendLpCol !== undefined && data.row) ? data.row[appendLpCol] : "";
        if (appendLpCol !== undefined && data.row) {
          requireLpContractorMatch_(auth.session, appendLpId);
        }
        // Every lab report has a Sample ID, and one Sample ID is saved once:
        // re-importing the same report must not add its result twice.
        if (data.sheet === "Data_Entry" && data.row) {
          var newSampleId = normSampleId_(data.row[3]);
          if (!newSampleId) return jsonOut({status: "error", message: "Sample ID is required."});
          if (sampleIdExists_(ss, newSampleId)) {
            return jsonOut({status: "error", message: "Sample ID " + data.row[3] + " is already saved — not added again."});
          }
        }
        // Phase 2: a new action is saved as Draft or Submitted (→ Open).
        var appendGuard = null;
        if (data.sheet === "Action Tracker") {
          appendGuard = guardActionTrackerSave_(auth.session, null, -1, data.row, data.workflow);
          if (appendGuard.error) return jsonOut({status: "error", message: appendGuard.error});
        }
        appendRow(ss, data.sheet, data.row, data.headers);
        if (appendGuard && appendGuard.dueEditable) writeActionDueFields_(ss, data.row, data.workflow);
        if (data.sheet === "Action Tracker") {
          try { syncSuggestionsForAction_(ss, data.row[0], data.row[1], actingUser); } catch (sgErr) { logError("syncSuggestionsForAction_", sgErr, {}); }
        }
        invalidateDashboardCache();
        logError("doPost:append:ok", "success", {sheet: data.sheet, row: data.row, actingUser: actingUser});
        // Phase 4: a new lab report waits for the contractor engineer's
        // validation (the Caution/Alert Draft action comes at validation).
        if (data.sheet === "Data_Entry") {
          try { onLabReportSaved_(ss, data.row, actingUser, true); } catch (labErr) { logError("onLabReportSaved_", labErr, {sheet: data.sheet}); }
          // The report's own header details (account, asset, bottle…).
          if (data.labInfo) {
            try { writeLabReportInfo_(ss, data.row, data.labInfo); } catch (infoErr) { logError("writeLabReportInfo_", infoErr, {sheet: data.sheet}); }
          }
        }
        recordAudit_(ss, data.sheet, appendLpId, "create", actingUser, scope || resolveLpContractor_(appendLpId), "New " + data.sheet + " entry added");
        return jsonOut({status:"ok"});
      }

      if (data.action === "updateSampleTracker") {
        requirePermission_(auth.session, "Edit");
        requireLpContractorMatch_(auth.session, data.equipmentCode);
        var updateStatus = updateSampleTrackerMonthly(ss, data);
        logError("doPost:updateSampleTracker", updateStatus ? "ok" : "equipment_not_found", {data: data, actingUser: actingUser});
        if (updateStatus) recordAudit_(ss, "Oil Sample Tracker", data.equipmentCode, "update", actingUser, scope || resolveLpContractor_(data.equipmentCode), "Updated monthly sample status");
        return jsonOut({status: updateStatus ? "ok" : "equipment_not_found"});
      }

      if (data.action === "createRoutine") {
        requirePermission_(auth.session, "Create");
        var createRoutineScope = getContractorScope_(auth.session);
        if (createRoutineScope) data.contractor = createRoutineScope;
        data.createdByAcc = !createRoutineScope;
        data.actingUser = actingUser;
        var createResult = createRoutine(ss, data);
        invalidateRoutinesOverviewCache();
        logError("doPost:createRoutine", createResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!createResult.error) recordAudit_(ss, "ROUTINES", createResult.routineId, "create", actingUser, data.contractor, createResult.routineStatus === "Draft" ? "Created route as Draft (no technician yet)" : "Created route and assigned it to " + (data.assignedTo || ""));
        return jsonOut(createResult.error ? {status: "error", message: createResult.error} : {status: "ok", routineId: createResult.routineId});
      }

      if (data.action === "updateRoutine") {
        requirePermission_(auth.session, "Edit");
        var updRoutineContractor = getRoutineContractor_(data.routineId);
        requireContractorMatch_(auth.session, updRoutineContractor);
        var updRoutineResult = updateRoutine(ss, data);
        if (!updRoutineResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:updateRoutine", updRoutineResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!updRoutineResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, updRoutineContractor, "Edited routine");
        return jsonOut(updRoutineResult.error ? {status: "error", message: updRoutineResult.error} : {status: "ok"});
      }

      if (data.action === "setRoutineStatus") {
        requirePermission_(auth.session, "Edit");
        var statusRoutineContractor = getRoutineContractor_(data.routineId);
        requireContractorMatch_(auth.session, statusRoutineContractor);
        var statusResult = setRoutineStatus(ss, data);
        if (!statusResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:setRoutineStatus", statusResult.error || "ok", {routineId: data.routineId, status: data.status, actingUser: actingUser});
        if (!statusResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, statusRoutineContractor, "Changed routine status to " + (data.status || ""));
        return jsonOut(statusResult.error ? {status: "error", message: statusResult.error} : {status: "ok"});
      }

      if (data.action === "deleteRoutine") {
        requireAdmin_(auth.session);
        var deleteRoutineContractor = getRoutineContractor_(data.routineId);
        var deleteRoutineResult = deleteRoutine(ss, data);
        if (!deleteRoutineResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:deleteRoutine", deleteRoutineResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!deleteRoutineResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "delete", actingUser, deleteRoutineContractor, "Deleted routine and its checklist items");
        return jsonOut(deleteRoutineResult.error ? {status: "error", message: deleteRoutineResult.error} : {status: "ok"});
      }

      if (data.action === "submitRoutineItem") {
        requirePermission_(auth.session, "Edit");
        var itemRoutineId = getRoutineIdForItem_(data.routineItemId);
        var itemContractor = getRoutineContractor_(itemRoutineId);
        requireContractorMatch_(auth.session, itemContractor);
        var itemResult = submitRoutineItem(ss, data);
        logError("doPost:submitRoutineItem", itemResult.error || "ok", {routineItemId: data.routineItemId, actingUser: actingUser});
        if (!itemResult.error) recordAudit_(ss, "OA_ROUTINE_ITEMS", itemRoutineId, "update", actingUser, itemContractor, "Submitted routine item " + data.routineItemId);
        return jsonOut(itemResult.error ? {status: "error", message: itemResult.error} : {status: "ok"});
      }

      if (data.action === "submitRoutine") {
        requirePermission_(auth.session, "Edit");
        var submitContractor = getRoutineContractor_(data.routineId);
        requireContractorMatch_(auth.session, submitContractor);
        data.actingUser = actingUser;
        var subResult = submitRoutine(ss, data);
        logError("doPost:submitRoutine", subResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!subResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, submitContractor, "Submitted routine for review");
        return jsonOut(subResult.error ? {status: "error", message: subResult.error} : {status: "ok"});
      }

      if (data.action === "approveRoutine") {
        var approveContractor = getRoutineContractor_(data.routineId);
        requireRouteEngineer_(auth.session, approveContractor, "confirm this route");
        data.actingUser = actingUser;
        var appResult = approveRoutine(ss, data);
        if (!appResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:approveRoutine", appResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!appResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, approveContractor, "Confirmed route");
        return jsonOut(appResult.error ? {status: "error", message: appResult.error} : {status: "ok"});
      }

      // Phase 1 — return submitted work for correction (with a reason).
      if (data.action === "returnRoutine") {
        var returnContractor = getRoutineContractor_(data.routineId);
        requireRouteEngineer_(auth.session, returnContractor, "return this route");
        data.actingUser = actingUser;
        var returnResult = returnRoutine(ss, data);
        if (!returnResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:returnRoutine", returnResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!returnResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, returnContractor, "Returned route for correction: " + String(data.reason || "").trim());
        return jsonOut(returnResult.error ? {status: "error", message: returnResult.error} : {status: "ok"});
      }

      // Phase 1 — reschedule (no approval needed); both dates go to the log.
      if (data.action === "rescheduleRoutine") {
        var rescheduleContractor = getRoutineContractor_(data.routineId);
        requireRouteEngineer_(auth.session, rescheduleContractor, "reschedule this route");
        data.actingUser = actingUser;
        var rescheduleResult = rescheduleRoutine(ss, data);
        if (!rescheduleResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:rescheduleRoutine", rescheduleResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!rescheduleResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, rescheduleContractor, "Rescheduled route from " + rescheduleResult.oldDueDate + " to " + rescheduleResult.newDueDate + ": " + rescheduleResult.reason);
        return jsonOut(rescheduleResult.error ? {status: "error", message: rescheduleResult.error} : {status: "ok"});
      }

      if (data.action === "addRoutineComment") {
        requirePermission_(auth.session, "Edit");
        var commentContractor = getRoutineContractor_(data.routineId);
        requireContractorMatch_(auth.session, commentContractor);
        var commentResult = addRoutineComment(ss, data);
        logError("doPost:addRoutineComment", commentResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!commentResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, commentContractor, "Commented on routine");
        return jsonOut(commentResult.error ? {status: "error", message: commentResult.error} : {status: "ok"});
      }

      if (data.action === "assignRoutineTechnician") {
        requirePermission_(auth.session, "Create");
        var assignContractor = getRoutineContractor_(data.routineId);
        requireContractorMatch_(auth.session, assignContractor);
        var assignResult = assignRoutineTechnician(ss, data);
        logError("doPost:assignRoutineTechnician", assignResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        if (!assignResult.error) recordAudit_(ss, "ROUTINES", data.routineId, "update", actingUser, assignContractor, "Assigned technician to routine");
        return jsonOut(assignResult.error ? {status: "error", message: assignResult.error} : {status: "ok"});
      }

      if (data.action === "createRouteTemplate") {
        requirePermission_(auth.session, "Create");
        var createTplScope = getContractorScope_(auth.session);
        if (createTplScope) data.contractor = createTplScope;
        var createTplResult = createRouteTemplate(ss, data);
        if (!createTplResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:createRouteTemplate", createTplResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        if (!createTplResult.error) recordAudit_(ss, "ROUTINE_TEMPLATES", createTplResult.templateId, "create", actingUser, data.contractor, "Created route template");
        return jsonOut(createTplResult.error ? {status: "error", message: createTplResult.error} : {status: "ok", templateId: createTplResult.templateId});
      }

      if (data.action === "setRouteTemplateStatus") {
        requirePermission_(auth.session, "Edit");
        var tplStatusContractor = getTemplateContractor_(data.templateId);
        requireContractorMatch_(auth.session, tplStatusContractor);
        var tplStatusResult = setRouteTemplateStatus(ss, data);
        if (!tplStatusResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:setRouteTemplateStatus", tplStatusResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        if (!tplStatusResult.error) recordAudit_(ss, "ROUTINE_TEMPLATES", data.templateId, "update", actingUser, tplStatusContractor, "Changed route template status to " + (data.status || ""));
        return jsonOut(tplStatusResult.error ? {status: "error", message: tplStatusResult.error} : {status: "ok"});
      }

      if (data.action === "deleteRouteTemplate") {
        requirePermission_(auth.session, "Delete");
        // Patch 9: this branch had no contractor-ownership check at all (the
        // one gap Patch 5's own pass missed — every other mutating action
        // on a route template/routine/product already has one). Added here
        // as part of resolving the record's contractor for the audit entry
        // below, since both need the same lookup done before the row is gone.
        var deleteTplContractor = getTemplateContractor_(data.templateId);
        requireContractorMatch_(auth.session, deleteTplContractor);
        var deleteTplResult = deleteRouteTemplate(ss, data);
        if (!deleteTplResult.error) invalidateRoutinesOverviewCache();
        logError("doPost:deleteRouteTemplate", deleteTplResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        if (!deleteTplResult.error) recordAudit_(ss, "ROUTINE_TEMPLATES", data.templateId, "delete", actingUser, deleteTplContractor, "Deleted route template");
        return jsonOut(deleteTplResult.error ? {status: "error", message: deleteTplResult.error} : {status: "ok"});
      }

      if (data.action === "addOilProduct") {
        requirePermission_(auth.session, "Create");
        var addProdScope = getContractorScope_(auth.session);
        if (addProdScope) data.contractor = addProdScope;
        // Phase 8: only the contractor's engineer approves an equivalent.
        var addEquivType = String(data.equivalentToType || "").trim();
        if (addEquivType) requireRouteEngineer_(auth.session, data.contractor, "approve an equivalent oil");
        var addProdResult = addOilProduct(ss, data);
        if (!addProdResult.error && addEquivType) {
          var addEquivResult = setOilEquivalent(ss, { productId: addProdResult.productId, mainType: addEquivType, mainBrand: data.equivalentToBrand }, actingUser);
          if (!addEquivResult.error) recordAudit_(ss, "Oil Inventory", addProdResult.productId, "update", actingUser, data.contractor, addEquivResult.message);
        }
        logError("doPost:addOilProduct", addProdResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        if (!addProdResult.error) recordAudit_(ss, "Oil Inventory", addProdResult.productId, "create", actingUser, data.contractor, "Added oil product");
        return jsonOut(addProdResult.error ? {status: "error", message: addProdResult.error} : {status: "ok", productId: addProdResult.productId});
      }

      if (data.action === "updateOilProduct") {
        requirePermission_(auth.session, "Edit");
        var updProdContractor = getProductContractor_(data.productId);
        requireContractorMatch_(auth.session, updProdContractor);
        var updProdResult = updateOilProduct(ss, data);
        logError("doPost:updateOilProduct", updProdResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        if (!updProdResult.error) recordAudit_(ss, "Oil Inventory", data.productId, "update", actingUser, updProdContractor, "Updated oil product");
        return jsonOut(updProdResult.error ? {status: "error", message: updProdResult.error} : {status: "ok"});
      }

      // Phase 8: approve (or remove) an equivalent oil — the product's own
      // contractor's engineer only; ACC engineers and managers are told.
      if (data.action === "setOilEquivalent") {
        var equivContractor = getProductContractor_(data.productId);
        requireRouteEngineer_(auth.session, equivContractor, "approve an equivalent oil");
        var equivResult = setOilEquivalent(ss, data, actingUser);
        invalidateDashboardCache();
        logError("doPost:setOilEquivalent", equivResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        if (!equivResult.error) recordAudit_(ss, "Oil Inventory", data.productId, "update", actingUser, equivContractor, equivResult.message);
        return jsonOut(equivResult.error ? {status: "error", message: equivResult.error} : {status: "ok"});
      }

      // Phase 5: low-stock level — the contractor's engineer or an ACC Engineer.
      if (data.action === "setProductLowStockLevel") {
        var levelContractor = getProductContractor_(data.productId);
        if (!isActionEngineer_(auth.session, levelContractor)) {
          throw new Error("Only an ACC Engineer or this contractor's engineer can change the low-stock level.");
        }
        var levelResult = setProductLowStockLevel(ss, data);
        if (!levelResult.error) invalidateDashboardCache();
        logError("doPost:setProductLowStockLevel", levelResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        if (!levelResult.error) recordAudit_(ss, "Oil Inventory", data.productId, "update", actingUser, levelContractor, "Changed low-stock level from " + (levelResult.oldLevel === "" ? "(none)" : levelResult.oldLevel) + " to " + levelResult.level);
        return jsonOut(levelResult.error ? {status: "error", message: levelResult.error} : {status: "ok"});
      }

      if (data.action === "logOilMovement") {
        requirePermission_(auth.session, "Edit");
        var movProdContractor = getProductContractor_(data.productId);
        requireContractorMatch_(auth.session, movProdContractor);
        // Receipts, adjustments and the opening balance: the contractor's
        // engineer or an ACC engineer (no approval step); every one is audited.
        if (["Receipt", "Adjustment", "Opening Balance"].indexOf(data.movementType) !== -1 && !isActionEngineer_(auth.session, movProdContractor)) {
          throw new Error("Only " + (movProdContractor ? movProdContractor + "'s" : "the contractor's") + " engineer or an ACC engineer can record receipts or adjustments for this stock.");
        }
        // Oil changes and top-ups deduct stock automatically, so an Issue
        // logged by hand needs a reason (kept in Notes).
        if (data.movementType === "Issue") {
          var issueReason = String(data.reason || "").trim();
          if (!issueReason) throw new Error("A manual issue needs a reason — oil changes and top-ups are already deducted automatically.");
          data.notes = "Reason: " + issueReason + (data.notes ? " — " + data.notes : "");
        }
        var movScope = getContractorScope_(auth.session);
        if (movScope) data.contractor = movScope;
        var movResult = logOilMovement(ss, data);
        invalidateDashboardCache();
        logError("doPost:logOilMovement", movResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        if (!movResult.error) recordAudit_(ss, "Oil Inventory LOG", data.productId, "create", actingUser, movScope || movProdContractor, "Logged " + (data.movementType || "movement") + " of " + (data.quantity || "") + " for product " + data.productId + (data.movementType === "Issue" ? " (" + String(data.reason || "").trim() + ")" : ""));
        return jsonOut(movResult.error ? {status: "error", message: movResult.error} : {status: "ok", movementId: movResult.movementId});
      }

      if (data.action === "logOilChangeEvent") {
        requirePermission_(auth.session, "Edit");
        requireLpContractorMatch_(auth.session, data.lpId);
        // An oil change logged by hand (not from a confirmed route item):
        // engineers only, with a reason and the oil actually used.
        if (!String(data.routineItemId || "").trim()) {
          var manualContractor = resolveLpContractor_(data.lpId);
          if (!isActionEngineer_(auth.session, manualContractor)) {
            throw new Error("Only an engineer can log an oil change by hand — use a route so the technician's work is confirmed.");
          }
          var manualReason = String(data.reason || "").trim();
          if (!manualReason) throw new Error("A hand-logged oil change needs a reason.");
          var manualOil = checkOilUsed_(ss, data.lpId, "Change", data.productId);
          if (manualOil.error) throw new Error(manualOil.error);
          data.conditionNotes = "Logged by hand — " + manualReason + (data.conditionNotes ? " — " + data.conditionNotes : "");
        }
        var logResult = logOilChangeEvent(ss, data);
        invalidateDashboardCache();
        logError("doPost:logOilChangeEvent", logResult.error || "ok", {lpId: data.lpId, actingUser: actingUser});
        if (!logResult.error) recordAudit_(ss, "Oil Change LOG", data.lpId, "create", actingUser, scope || resolveLpContractor_(data.lpId), "Logged oil change");
        return jsonOut(logResult.error ? {status: "error", message: logResult.error} : {
          status: "ok",
          eventId: logResult.eventId,
          nextDueDate: logResult.nextDueDate,
          inventoryDeducted: logResult.inventoryDeducted,
          inventoryNote: logResult.inventoryNote,
        });
      }

      // ── Phase 2: action closure — request → ACC decision → close ─────
      if (data.action === "requestActionClosure" || data.action === "closeAction") {
        var closureContractor = getActionContractor_(ss, data.acNo, data.equipmentCode);
        requireRouteEngineer_(auth.session, closureContractor, data.action === "closeAction" ? "close this action" : "request closure");
        data.actingUser = actingUser;
        var closureResult = data.action === "closeAction" ? closeAction(ss, data) : requestActionClosure(ss, data);
        if (!closureResult.error) invalidateDashboardCache();
        if (!closureResult.error) {
          try { syncSuggestionsForAction_(ss, data.acNo, data.equipmentCode, actingUser); } catch (sgErr3) { logError("syncSuggestionsForAction_", sgErr3, {}); }
        }
        logError("doPost:" + data.action, closureResult.error || "ok", {acNo: data.acNo, actingUser: actingUser});
        if (!closureResult.error && !closureResult.unchanged) {
          recordAudit_(ss, "Action Tracker", data.equipmentCode, "update", actingUser, closureContractor,
            data.action === "closeAction" ? "Closed action " + data.acNo : "Requested closure of action " + data.acNo + ": " + String(data.comment || "").trim());
        }
        return jsonOut(closureResult.error ? {status: "error", message: closureResult.error} : {status: "ok"});
      }

      // Phase 2: move an Open / Waiting Stoppage action's due date, with a reason.
      if (data.action === "rescheduleAction") {
        var rescheduleActionContractor = getActionContractor_(ss, data.acNo, data.equipmentCode);
        if (!isActionEngineer_(auth.session, rescheduleActionContractor)) {
          throw new Error("Only an ACC Engineer or this contractor's engineer can reschedule an action.");
        }
        data.actingUser = actingUser;
        var rescheduleActionResult = rescheduleAction(ss, data);
        if (!rescheduleActionResult.error) invalidateDashboardCache();
        logError("doPost:rescheduleAction", rescheduleActionResult.error || "ok", {acNo: data.acNo, actingUser: actingUser});
        if (!rescheduleActionResult.error) {
          recordAudit_(ss, "Action Tracker", data.equipmentCode, "update", actingUser, rescheduleActionContractor,
            "Rescheduled action " + data.acNo + " from " + rescheduleActionResult.oldDueDate + " to " + rescheduleActionResult.newDueDate + ": " + rescheduleActionResult.reason);
        }
        return jsonOut(rescheduleActionResult.error ? {status: "error", message: rescheduleActionResult.error} : {status: "ok"});
      }

      // ── Phase 4: lab report — contractor engineer validates, ACC returns ─
      if (data.action === "validateLabReport" || data.action === "returnLabReport") {
        var labContractor = getSampleContractor_(ss, data);
        if (data.action === "validateLabReport") requireRouteEngineer_(auth.session, labContractor, "validate this lab report");
        else requireAccEngineer_(auth.session);
        data.actingUser = actingUser;
        var labResult = data.action === "validateLabReport" ? validateLabReport(ss, data) : returnLabReport(ss, data);
        if (!labResult.error) invalidateDashboardCache();
        logError("doPost:" + data.action, labResult.error || "ok", {sampleUid: data.sampleUid, actingUser: actingUser});
        if (!labResult.error && !labResult.unchanged) {
          recordAudit_(ss, "Data_Entry", data.equipmentCode || "", "update", actingUser, labContractor,
            data.action === "validateLabReport" ? "Validated lab report" : "Returned lab report for correction: " + String(data.reason || "").trim());
        }
        return jsonOut(labResult.error ? {status: "error", message: labResult.error} : {status: "ok"});
      }

      if (data.action === "decideActionClosure") {
        requireAccEngineer_(auth.session);
        var decideContractor = getActionContractor_(ss, data.acNo, data.equipmentCode);
        data.actingUser = actingUser;
        var decideResult = decideActionClosure(ss, data);
        if (!decideResult.error) invalidateDashboardCache();
        if (!decideResult.error) {
          try { syncSuggestionsForAction_(ss, data.acNo, data.equipmentCode, actingUser); } catch (sgErr4) { logError("syncSuggestionsForAction_", sgErr4, {}); }
        }
        logError("doPost:decideActionClosure", decideResult.error || "ok", {acNo: data.acNo, decision: data.decision, actingUser: actingUser});
        if (!decideResult.error && !decideResult.unchanged) {
          recordAudit_(ss, "Action Tracker", data.equipmentCode, "update", actingUser, decideContractor,
            (data.decision === "Approve" ? "Approved closure of action " : "Rejected closure of action ") + data.acNo + (data.note ? ": " + String(data.note).trim() : ""));
        }
        return jsonOut(decideResult.error ? {status: "error", message: decideResult.error} : {status: "ok"});
      }

      if (data.action === "logOilTopUp") {
        requirePermission_(auth.session, "Edit");
        requireLpContractorMatch_(auth.session, data.lpId);
        var topUpResult = logOilTopUp_(ss, data);
        invalidateDashboardCache();
        logError("doPost:logOilTopUp", topUpResult.error || "ok", {lpId: data.lpId, actingUser: actingUser});
        if (!topUpResult.error) recordAudit_(ss, "Oil Top Up LOG", data.lpId, "create", actingUser, scope || resolveLpContractor_(data.lpId), "Logged oil top-up: " + (data.reason || ""));
        // Phase 2: 3 top-ups on one point within 30 days → Draft "Check oil leakage".
        if (!topUpResult.error) {
          try { applyLeakageRule_(ss, data.lpId, data.eventDate ? new Date(data.eventDate) : new Date()); } catch (leakErr) { logError("applyLeakageRule_", leakErr, {lpId: data.lpId}); }
        }
        return jsonOut(topUpResult.error ? {status: "error", message: topUpResult.error} : {
          status: "ok",
          topUpId: topUpResult.topUpId,
          inventoryDeducted: topUpResult.inventoryDeducted,
          inventoryNote: topUpResult.inventoryNote,
        });
      }

      if (data.action === "updateRow") {
        requirePermission_(auth.session, "Edit");
        if (GENERIC_WRITE_ALLOWLIST.updateRow.indexOf(data.sheet) === -1) {
          logError("doPost:updateRow:blocked", "Sheet not allowed via generic updateRow", {sheet: data.sheet, actingUser: actingUser});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        // Bug-hunt pass: resolve the real row FIRST, then derive the LP_ID
        // straight off that sheet row (resolveRowLpId_) rather than from
        // client-supplied matchCols/matchValues (genericWriteLpId_) — the
        // latter returns null, skipping the contractor check entirely,
        // whenever the caller matches on something other than the LP_ID
        // column itself (e.g. every sample since Patch 6, matched by its
        // own unique id — see Rbac.js's resolveRowLpId_ comment). Falls
        // back to genericWriteLpId_ only when no row was found at all, so
        // a bad/missing id still gets updateRow's own "not found" result
        // instead of a misleading permission error.
        var updateSheetObj = ss.getSheetByName(data.sheet);
        var updateRowIdx = updateSheetObj ? findRowIndex(updateSheetObj, data.matchCols, data.matchValues, dataStartRowFor(data.sheet)) : -1;
        var updateLpId = updateRowIdx !== -1
          ? resolveRowLpId_(updateSheetObj, data.sheet, updateRowIdx)
          : genericWriteLpId_(data.sheet, data.matchCols, data.matchValues);
        if (updateLpId !== null) requireLpContractorMatch_(auth.session, updateLpId);
        if (data.sheet === "Equipment Registry" && updateRowIdx !== -1) {
          data.row = lockEquipmentRegistryContractor_(auth.session, updateSheetObj, updateRowIdx, data.row);
        }
        // Patch 10: refuse the overwrite if someone else's write landed on
        // this exact row since the caller last loaded it (data.
        // expectedLastModified, sent by the client's own last read) — see
        // hasConflict_'s own comment in Utils.js. Deliberately a silent
        // skip, not a distinct error response: this app's writes are blind
        // POSTs (mode: "no-cors", see api.js's own header comment) that
        // can't read a response body at all, so the signal that actually
        // reaches the client is the SAME verify-read-after-write check
        // every other write failure already surfaces through — skipping
        // the write here means that verify read comes back unchanged,
        // which api.js's updated mismatch handling now recognizes as a
        // conflict specifically (not just "didn't save") and reports
        // accordingly.
        if (updateRowIdx !== -1 && hasConflict_(updateSheetObj, data.sheet, updateRowIdx, data.expectedLastModified)) {
          logError("doPost:updateRow:conflict", "Row changed since client loaded it — write skipped", {sheet: data.sheet, matchValues: data.matchValues, actingUser: actingUser});
          return jsonOut({status: "conflict"});
        }
        // Phase 2: status changes on an action follow the workflow rules.
        var updateGuard = null;
        if (data.sheet === "Action Tracker" && updateRowIdx !== -1) {
          updateGuard = guardActionTrackerSave_(auth.session, updateSheetObj, updateRowIdx, data.row, data.workflow);
          if (updateGuard.error) {
            logError("doPost:updateRow:actionGuard", updateGuard.error, {matchValues: data.matchValues, actingUser: actingUser});
            return jsonOut({status: "error", message: updateGuard.error});
          }
        }
        // A validated lab report: ACC Engineer only, and it goes back to
        // Pending Validation (LabReports.js).
        var labGuard = {};
        if (data.sheet === "Data_Entry" && updateRowIdx !== -1) {
          labGuard = guardLabReportEdit_(auth.session, updateSheetObj, updateRowIdx, data.row);
          if (labGuard.error) {
            logError("doPost:updateRow:labGuard", labGuard.error, {matchValues: data.matchValues, actingUser: actingUser});
            return jsonOut({status: "error", message: labGuard.error});
          }
        }
        var ok1 = updateRow(ss, data.sheet, data.matchCols, data.matchValues, data.row);
        if (ok1 && updateGuard && updateGuard.dueEditable) writeActionDueFields_(ss, data.row, data.workflow);
        if (ok1 && data.sheet === "Action Tracker") {
          try { syncSuggestionsForAction_(ss, data.row[0], data.row[1], actingUser); } catch (sgErr2) { logError("syncSuggestionsForAction_", sgErr2, {}); }
        }
        invalidateDashboardCache();
        if (ok1 && data.sheet === "Data_Entry") {
          try { onLabReportSaved_(ss, data.row, actingUser, false, !!labGuard.reopen); } catch (labErr2) { logError("onLabReportSaved_", labErr2, {sheet: data.sheet}); }
        }
        logError("doPost:updateRow", ok1 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues, actingUser: actingUser});
        if (ok1) recordAudit_(ss, data.sheet, updateLpId || data.matchValues.join(","), "update", actingUser, scope || resolveLpContractor_(updateLpId), "Updated " + data.sheet + " entry");
        return jsonOut({status: ok1 ? "ok" : "row_not_found"});
      }

      if (data.action === "deleteRow") {
        requirePermission_(auth.session, "Delete");
        if (GENERIC_WRITE_ALLOWLIST.deleteRow.indexOf(data.sheet) === -1) {
          logError("doPost:deleteRow:blocked", "Sheet not allowed via generic deleteRow", {sheet: data.sheet, actingUser: actingUser});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        // Same fix as updateRow above: resolve the real row first so the
        // LP_ID check works even when the caller matches by a unique id
        // column (e.g. sampleUid) rather than the LP_ID column itself.
        var deleteSheetObj = ss.getSheetByName(data.sheet);
        var deleteRowIdx = deleteSheetObj ? findRowIndex(deleteSheetObj, data.matchCols, data.matchValues, dataStartRowFor(data.sheet)) : -1;
        var deleteLpId = deleteRowIdx !== -1
          ? resolveRowLpId_(deleteSheetObj, data.sheet, deleteRowIdx)
          : genericWriteLpId_(data.sheet, data.matchCols, data.matchValues);
        if (deleteLpId !== null) requireLpContractorMatch_(auth.session, deleteLpId);
        var ok2 = deleteRow(ss, data.sheet, data.matchCols, data.matchValues);
        invalidateDashboardCache();
        logError("doPost:deleteRow", ok2 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues, actingUser: actingUser});
        if (ok2) recordAudit_(ss, data.sheet, deleteLpId || data.matchValues.join(","), "delete", actingUser, scope || resolveLpContractor_(deleteLpId), "Deleted " + data.sheet + " entry");
        return jsonOut({status: ok2 ? "ok" : "row_not_found"});
      }

      if (data.action === "updateNotificationSettings") {
        // Patch 14: platform-wide (not contractor-scoped), so this is
        // gated to ROLE-ADMIN specifically — see requireAdmin_'s own
        // comment in Rbac.js for why the generic hasPermission_('Edit')
        // every Contractor Engineer already has isn't the right bar here.
        requireAdmin_(auth.session);
        var notifyResult = updateNotificationSettings_(data);
        logError("doPost:updateNotificationSettings", notifyResult.error || "ok", {actingUser: actingUser});
        return jsonOut(notifyResult.error ? {status: "error", message: notifyResult.error} : {status: "ok"});
      }

      if (data.action === "setModuleResponsibility") {
        // Same reasoning as updateNotificationSettings above — this is
        // platform-wide admin config (who's assigned per contractor, not
        // any one contractor's own data), so ROLE-ADMIN only.
        requireAdmin_(auth.session);
        var respResult = setModuleResponsibility_(data);
        logError("doPost:setModuleResponsibility", respResult.error || "ok", {module: data.module, contractor: data.contractor, role: data.role, actingUser: actingUser});
        if (!respResult.error) recordAudit_(ss, MODULE_RESP_SHEET, data.module + "/" + data.contractor + "/" + data.role, "update", actingUser, data.contractor, "Assigned " + data.role + " for " + data.contractor);
        return jsonOut(respResult.error ? {status: "error", message: respResult.error} : {status: "ok"});
      }

      if (data.action === "markNotificationRead") {
        // No requirePermission_/contractor check — markInAppNotificationRead_
        // itself is the gate: it only ever touches a row whose RecipientEmail
        // matches the caller's own session email (see InAppNotifications.js),
        // so any logged-in user may call this for their own notifications.
        var markResult = markInAppNotificationRead_(data.notificationId, actingUser);
        logError("doPost:markNotificationRead", markResult.error || "ok", {notificationId: data.notificationId, actingUser: actingUser});
        return jsonOut(markResult.error ? {status: "error", message: markResult.error} : {status: "ok"});
      }

      if (data.action === "markAllNotificationsRead") {
        var markAllResult = markAllInAppNotificationsRead_(actingUser);
        logError("doPost:markAllNotificationsRead", markAllResult.error || "ok", {actingUser: actingUser});
        return jsonOut(markAllResult.error ? {status: "error", message: markAllResult.error} : {status: "ok"});
      }

      logError("doPost:unknown-action", "no valid action", data);
      return jsonOut({status:"ok", message: "No valid action specified"});
    } finally {
      lock.releaseLock();
    }
  } catch(err) {
    logError("doPost:exception", err, {raw: raw});
    return jsonOut({status: "error", message: err.message});
  }
}

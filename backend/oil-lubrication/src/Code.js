// ════════════════════════════════════════════════════════════════════════════
// Arabian Cement Oil LUB — Apps Script v4.0 (Performance Redesign)
// ════════════════════════════════════════════════════════════════════════════
// Deploy as Web App: Execute as Me · Who has access: Anyone
//
// This is the real, already-deployed backend behind apps/oil-analysis (the
// embedded legacy Oil app) — not backend/oil-analysis (a separate,
// Routine/LP_ID-based backend built earlier for a module that was never
// linked into the sidebar; parked for possible later use, see docs/).
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
//   ?action=getRecentSamples&page=1&limit=50→ paginated Data_Entry rows (newest first)
//   ?action=getRoutines                     → all ROUTINES rows
//   ?action=getRoutineItems&routineId=XXXX  → all OA_ROUTINE_ITEMS rows for one routine
//   ?action=getRouteTemplates               → all ROUTINE_TEMPLATES rows (recurring routes)
//   ?action=getOilInventory                 → all "Oil Inventory" product rows
//   ?action=getOilInventoryForecast&months=3 → projected consumption vs. current stock
//   ?action=getOilInventoryMovements&productId=XXXX → all LOG rows for one product
//   ?action=getStartupBundle                → readAll + Equipment Registry + Action
//                                              Registry in one response — used only for
//                                              the app's first-load fetch (see Dashboard.js's
//                                              getStartupBundle), not periodic re-sync
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
//   Routines.js           — Routine workflow (create/submit/approve/comment)
//   RouteTemplates.js     — recurring Route templates + due-instance generation
//   OilInventory.js       — Oil Inventory product registry + movement log
//   ActionRegistry.js     — OL_ACTION_PHRASES reads
//   Notifications.js      — best-effort email on Routine assigned/submitted/approved
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

    switch (action) {
      case "readAll":
        result = readAll(scope);
        break;
      case "getStartupBundle":
        result = getStartupBundle(scope);
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
      case "getRecentSamples":
        result = getPaginated("Data_Entry", e.parameter.page, e.parameter.limit, true, scope, 0); // newest first
        break;
      case "getChanges":
        result = getChanges(e.parameter.since || "", scope);
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
      case "getOilInventory":
        result = getOilInventory(scope);
        break;
      case "getOilInventoryMovements":
        result = getOilInventoryMovements(e.parameter.productId || "", scope);
        break;
      case "getOilInventoryForecast":
        result = getOilInventoryForecast(e.parameter.months, scope);
        break;
      case "readActionRegistry":
        result = readActionRegistry();
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
      if (data.action === "append") {
        requirePermission_(auth.session, "Create");
        if (GENERIC_WRITE_ALLOWLIST.append.indexOf(data.sheet) === -1) {
          logError("doPost:append:blocked", "Sheet not allowed via generic append", {sheet: data.sheet});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        var appendLpCol = GENERIC_WRITE_LP_COL[data.sheet];
        if (appendLpCol !== undefined && data.row) {
          requireLpContractorMatch_(auth.session, data.row[appendLpCol]);
        }
        appendRow(ss, data.sheet, data.row, data.headers);
        invalidateDashboardCache();
        logError("doPost:append:ok", "success", {sheet: data.sheet, row: data.row, actingUser: actingUser});
        return jsonOut({status:"ok"});
      }

      if (data.action === "updateSampleTracker") {
        requirePermission_(auth.session, "Edit");
        requireLpContractorMatch_(auth.session, data.equipmentCode);
        var updateStatus = updateSampleTrackerMonthly(ss, data);
        logError("doPost:updateSampleTracker", updateStatus ? "ok" : "equipment_not_found", {data: data, actingUser: actingUser});
        return jsonOut({status: updateStatus ? "ok" : "equipment_not_found"});
      }

      if (data.action === "createRoutine") {
        requirePermission_(auth.session, "Create");
        var createRoutineScope = getContractorScope_(auth.session);
        if (createRoutineScope) data.contractor = createRoutineScope;
        var createResult = createRoutine(ss, data);
        logError("doPost:createRoutine", createResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        return jsonOut(createResult.error ? {status: "error", message: createResult.error} : {status: "ok", routineId: createResult.routineId});
      }

      if (data.action === "submitRoutineItem") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getRoutineContractor_(getRoutineIdForItem_(data.routineItemId)));
        var itemResult = submitRoutineItem(ss, data);
        logError("doPost:submitRoutineItem", itemResult.error || "ok", {routineItemId: data.routineItemId, actingUser: actingUser});
        return jsonOut(itemResult.error ? {status: "error", message: itemResult.error} : {status: "ok"});
      }

      if (data.action === "submitRoutine") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getRoutineContractor_(data.routineId));
        data.actingUser = actingUser;
        var subResult = submitRoutine(ss, data);
        logError("doPost:submitRoutine", subResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        return jsonOut(subResult.error ? {status: "error", message: subResult.error} : {status: "ok"});
      }

      if (data.action === "approveRoutine") {
        requirePermission_(auth.session, "Approve");
        requireContractorMatch_(auth.session, getRoutineContractor_(data.routineId));
        data.actingUser = actingUser;
        var appResult = approveRoutine(ss, data);
        logError("doPost:approveRoutine", appResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        return jsonOut(appResult.error ? {status: "error", message: appResult.error} : {status: "ok"});
      }

      if (data.action === "addRoutineComment") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getRoutineContractor_(data.routineId));
        var commentResult = addRoutineComment(ss, data);
        logError("doPost:addRoutineComment", commentResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        return jsonOut(commentResult.error ? {status: "error", message: commentResult.error} : {status: "ok"});
      }

      if (data.action === "assignRoutineTechnician") {
        requirePermission_(auth.session, "Create");
        requireContractorMatch_(auth.session, getRoutineContractor_(data.routineId));
        var assignResult = assignRoutineTechnician(ss, data);
        logError("doPost:assignRoutineTechnician", assignResult.error || "ok", {routineId: data.routineId, actingUser: actingUser});
        return jsonOut(assignResult.error ? {status: "error", message: assignResult.error} : {status: "ok"});
      }

      if (data.action === "createRouteTemplate") {
        requirePermission_(auth.session, "Create");
        var createTplScope = getContractorScope_(auth.session);
        if (createTplScope) data.contractor = createTplScope;
        var createTplResult = createRouteTemplate(ss, data);
        logError("doPost:createRouteTemplate", createTplResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        return jsonOut(createTplResult.error ? {status: "error", message: createTplResult.error} : {status: "ok", templateId: createTplResult.templateId});
      }

      if (data.action === "setRouteTemplateStatus") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getTemplateContractor_(data.templateId));
        var tplStatusResult = setRouteTemplateStatus(ss, data);
        logError("doPost:setRouteTemplateStatus", tplStatusResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        return jsonOut(tplStatusResult.error ? {status: "error", message: tplStatusResult.error} : {status: "ok"});
      }

      if (data.action === "deleteRouteTemplate") {
        requirePermission_(auth.session, "Delete");
        var deleteTplResult = deleteRouteTemplate(ss, data);
        logError("doPost:deleteRouteTemplate", deleteTplResult.error || "ok", {templateId: data.templateId, actingUser: actingUser});
        return jsonOut(deleteTplResult.error ? {status: "error", message: deleteTplResult.error} : {status: "ok"});
      }

      if (data.action === "addOilProduct") {
        requirePermission_(auth.session, "Create");
        var addProdScope = getContractorScope_(auth.session);
        if (addProdScope) data.contractor = addProdScope;
        var addProdResult = addOilProduct(ss, data);
        logError("doPost:addOilProduct", addProdResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        return jsonOut(addProdResult.error ? {status: "error", message: addProdResult.error} : {status: "ok", productId: addProdResult.productId});
      }

      if (data.action === "updateOilProduct") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getProductContractor_(data.productId));
        var updProdResult = updateOilProduct(ss, data);
        logError("doPost:updateOilProduct", updProdResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        return jsonOut(updProdResult.error ? {status: "error", message: updProdResult.error} : {status: "ok"});
      }

      if (data.action === "logOilMovement") {
        requirePermission_(auth.session, "Edit");
        requireContractorMatch_(auth.session, getProductContractor_(data.productId));
        var movScope = getContractorScope_(auth.session);
        if (movScope) data.contractor = movScope;
        var movResult = logOilMovement(ss, data);
        invalidateDashboardCache();
        logError("doPost:logOilMovement", movResult.error || "ok", {productId: data.productId, actingUser: actingUser});
        return jsonOut(movResult.error ? {status: "error", message: movResult.error} : {status: "ok", movementId: movResult.movementId});
      }

      if (data.action === "logOilChangeEvent") {
        requirePermission_(auth.session, "Edit");
        requireLpContractorMatch_(auth.session, data.lpId);
        var logResult = logOilChangeEvent(ss, data);
        invalidateDashboardCache();
        logError("doPost:logOilChangeEvent", logResult.error || "ok", {lpId: data.lpId, actingUser: actingUser});
        return jsonOut(logResult.error ? {status: "error", message: logResult.error} : {
          status: "ok",
          eventId: logResult.eventId,
          nextDueDate: logResult.nextDueDate,
          inventoryDeducted: logResult.inventoryDeducted,
          inventoryNote: logResult.inventoryNote,
        });
      }

      if (data.action === "updateRow") {
        requirePermission_(auth.session, "Edit");
        if (GENERIC_WRITE_ALLOWLIST.updateRow.indexOf(data.sheet) === -1) {
          logError("doPost:updateRow:blocked", "Sheet not allowed via generic updateRow", {sheet: data.sheet, actingUser: actingUser});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        var updateLpId = genericWriteLpId_(data.sheet, data.matchCols, data.matchValues);
        if (updateLpId !== null) requireLpContractorMatch_(auth.session, updateLpId);
        if (data.sheet === "Equipment Registry") {
          var eqSheet = ss.getSheetByName("Equipment Registry");
          if (eqSheet) {
            var eqRowIdx = findRowIndex(eqSheet, data.matchCols, data.matchValues, dataStartRowFor("Equipment Registry"));
            if (eqRowIdx !== -1) data.row = lockEquipmentRegistryContractor_(auth.session, eqSheet, eqRowIdx, data.row);
          }
        }
        var ok1 = updateRow(ss, data.sheet, data.matchCols, data.matchValues, data.row);
        invalidateDashboardCache();
        logError("doPost:updateRow", ok1 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues, actingUser: actingUser});
        return jsonOut({status: ok1 ? "ok" : "row_not_found"});
      }

      if (data.action === "deleteRow") {
        requirePermission_(auth.session, "Delete");
        if (GENERIC_WRITE_ALLOWLIST.deleteRow.indexOf(data.sheet) === -1) {
          logError("doPost:deleteRow:blocked", "Sheet not allowed via generic deleteRow", {sheet: data.sheet, actingUser: actingUser});
          return jsonOut({status: "error", message: "Not allowed to write to this sheet."});
        }
        var deleteLpId = genericWriteLpId_(data.sheet, data.matchCols, data.matchValues);
        if (deleteLpId !== null) requireLpContractorMatch_(auth.session, deleteLpId);
        var ok2 = deleteRow(ss, data.sheet, data.matchCols, data.matchValues);
        invalidateDashboardCache();
        logError("doPost:deleteRow", ok2 ? "ok" : "row_not_found", {sheet: data.sheet, matchCols: data.matchCols, matchValues: data.matchValues, actingUser: actingUser});
        return jsonOut({status: ok2 ? "ok" : "row_not_found"});
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

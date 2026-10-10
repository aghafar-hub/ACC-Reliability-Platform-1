/**
 * Arabian Cement — Vibration & Condition Monitoring — Apps Script backend
 *
 * This is the real, already-deployed backend behind apps/vibration-analysis
 * — the single source of truth, replacing the earlier Code.gs/Code.fixed.gs/
 * Code.v2.gs trio that used to live side by side in
 * apps/vibration-analysis/apps-script/ (confusing to tell apart; that
 * folder now only holds the one-time vib-id-merge/ migration kit, not a
 * live backend). Split into topic files the same way backend/oil-lubrication
 * is, one Apps Script project holding every file below — paste each as its
 * own file (Extensions > Apps Script > the "+" next to Files), not
 * concatenated into one.
 *
 * Deploy as Web App: Execute as Me · Who has access: Anyone. Copy the /exec
 * URL into the app's Settings > Webhook URL (src/config.js's
 * DEFAULT_WEBHOOK_URL). After ANY change to any file here: Deploy > Manage
 * deployments > edit the existing deployment > New version > Deploy —
 * editing the files alone does nothing live until redeployed.
 *
 * Bakes in two corrections against the original pasted source (see
 * EquipmentRegister.js and Triggers.js for exactly what and why) plus the
 * VIB ID Registry read (VibRegistry.js) — all three already confirmed
 * against the real, live Sheet, not just inferred from the client.
 *
 * PERFORMANCE: readAll() stays as the full, do-everything sync (used by the
 * app's "Sync" button). For the app's own first-load fetch, getStartupBundle
 * returns everything EXCEPT 📥 RMS DATA/📥 SPM DATA (the two heaviest sheets,
 * ~12,000 rows combined) — see that function's own comment in this file.
 * getRmsSpmHistory returns just those two, fetched lazily only when a page
 * that actually needs reading history is opened.
 *
 * ── CONFIGURATION SHEET SETUP ──────────────────────────────────────────
 * Create a sheet tab named exactly:  Configuration
 * Row 1: headers → Key | Value
 * Row 2 onwards: key-value pairs (app will create/update these automatically)
 *
 * ── ACTION TRACKER SHEET SETUP ─────────────────────────────────────────
 * Sheet tab name:  📋 Action Tracker
 * Row 5: column headers, Row 6+: data rows
 *
 * ── COMPLIANCE TRACKER SHEET ────────────────────────────────────────────
 * Sheet:  📋 Compliance Tracker
 * Row 3: month headers (col E onwards), Row 4+: equipment data
 * App writes machine status (not "YES") to cells.
 * Missing past months are auto-written as "Missing" on sync.
 *
 * ── Files in this project ───────────────────────────────────────────────
 *   Code.js               doGet/doPost/dispatch/readAll — this file
 *   Config.js             sheet name constants, SHEET_CFG, ACTION_HEADERS,
 *                         severity ordering (worstStatus)
 *   Utils.js              generic sheet reader/writer, row matching,
 *                         machine-status helpers shared across sheets
 *   VibRegistry.js        readVibRegistry() — VIB ID Registry tab
 *   Compliance.js         Compliance Tracker read/write
 *   RmsData.js            Last RMS Reading upsert/delete
 *   SpmData.js            Last SPM Reading upsert/delete
 *   EquipmentRegister.js  RMS/SPM Register limit updates
 *   ActionTracker.js      Action Tracker CRUD + email
 *   Settings.js           Configuration sheet read/write
 *   BackfillLastReadings.js  recomputes both Last Reading sheets from
 *                         scratch off RMS/SPM DATA + the Registers
 *   Triggers.js           onEdit (Action Tracker year/month row filter)
 *   Auth.js               Phase 0: verifies the login token from Platform Core
 *   ModuleAccess.js       Phase 0: who may open this module, tab levels, status
 *                         (identical copy in every module backend)
 *   ModuleAccessConfig.js Phase 0: this module's tabs + which tabs each request needs
 *   VibrationLog.js       Vibration Log: reports, readings per VIB ID, coverage, 45-day rule
 *   Readings.js           New Reading (one machine, one date) + equipment summary
 *   Limits.js             limits per equipment / VIB ID, interval, Active / Inactive (App Owner only, history kept)
 *   VibActions.js         actions: 4-part record, automatic drafts from approved reports, open / closure flow
 *   Routes.js             suggestions, routes, technician checklist, confirm / return, emergency routes
 *   MyWork.js             getMyWork for the platform My Work page, by role
 *   Dashboard.js          getVibDashboard: condition, reports received, worst machines, actions
 *   VibNotifications.js   the platform bell: each person's own vibration notices
 */

function doGet(e) {
  try {
    var action = e.parameter.action || 'readAll';
    var result = dispatchWithAccess_(action, e.parameter);
    return jsonOut(e, result);
  } catch(err) { return jsonOut(e, {error: String(err)}); }
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch(x) { body = e.parameter; }
    } else { body = e.parameter; }
    var action = body.action || 'readAll';
    var result = dispatchWithAccess_(action, body);
    return jsonOut(e, result);
  } catch(err) { return jsonOut(e, {error: String(err)}); }
}

// Phase 0: every request passes the Module Access check (ModuleAccess.js)
// before it reaches dispatch(). This backend takes writes through doGet as
// well as doPost, so reads and writes are told apart by action name
// (VIB_WRITE_ACTIONS in ModuleAccessConfig.js), not by HTTP method.
function dispatchWithAccess_(action, params) {
  vsApplySettings_(); // ModuleSettings.js: interval / grace / report-due defaults
  var session = getSessionOrNull_(params.sessionToken);
  var request = { action: action };
  for (var k in params) { if (k !== 'action') request[k] = params[k]; }
  // Delegation (ModuleAccess.js): any signed-in person; the rules are inside.
  if (MA_SELF_ACTIONS.indexOf(action) !== -1) {
    var self = maHandleSelfAction_(action, params, session);
    if (action === 'maCreateDelegation' || action === 'maEndDelegation') {
      vcBump_(); // who approves may change
      if (self && !self.error) vlAudit_(SpreadsheetApp.getActiveSpreadsheet(), session ? session.email : '', 'Delegation', params.delegationId || params.to || '', maDescribeChange_(params));
    }
    return self;
  }
  var isAdminAction = MA_ADMIN_ACTIONS.indexOf(action) !== -1;
  var denial = (isAdminAction || VIB_WRITE_ACTIONS.indexOf(action) !== -1)
    ? maCheckWrite_(session, request)
    : maCheckRead_(session, action);
  if (denial) return { status: 'error', error: denial, accessDenied: true };

  if (action === 'getMyAccess') return getMyAccess_(session);
  if (action === 'getModuleAccessConfig') return getModuleAccessConfig_();
  if (isAdminAction) {
    if (!maIsAdmin_(session)) return { status: 'error', error: 'Only the App Owner can change this.', accessDenied: true };
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return { status: 'error', error: 'Server is busy — please try again.' };
    try {
      var maResult = maHandleAdminPost_(request, session ? session.email : '');
      if (maResult && !maResult.error) vlAudit_(SpreadsheetApp.getActiveSpreadsheet(), session ? session.email : '', 'Module Access', MA_CONFIG.moduleName, maDescribeChange_(request));
      return maResult;
    } finally {
      vcBump_();
      lock.releaseLock();
    }
  }

  if (VIB_WRITE_ACTIONS.indexOf(action) !== -1) {
    var written = dispatch(action, params, session);
    vcBump_(); // Cache.js: every cached read is now out of date
    return written;
  }
  // per person (canEdit) and small: never from the cache
  if (action === 'getModuleSettings') return handleGetModuleSettings(session);
  if (action === 'getActivityFeed') return handleGetActivityFeed(session, params);
  // reads: from the cache when nothing changed since (Cache.js)
  return vcRead_(action, params, session, function () {
    var result = dispatch(action, params, session);
    if (action === 'readAll' || action === 'getStartupBundle' || action === 'getRmsSpmHistory') {
      result = maFilterSections_(session, result);
    }
    return result;
  });
}

function dispatch(action, params, session) {
  if (action==='readAll')               return readAll();
  if (action==='test')                  return {status:'ok', time: new Date().toISOString()};
  if (action==='append')                return handleAppend(params);
  if (action==='updateRow')             return handleUpdateRow(params);
  if (action==='deleteRow')             return handleDeleteRow(params);
  if (action==='upsertLastRMS')         return handleUpsertLastRMS(params);
  if (action==='upsertLastSPM')         return handleUpsertLastSPM(params);
  if (action==='deleteLastRMS')         return handleDeleteLastRMS(params);
  if (action==='deleteLastSPM')         return handleDeleteLastSPM(params);
  if (action==='updateRegisterLimits')  return handleUpdateRegisterLimits(params);
  if (action==='backfillLastReadings')  return handleBackfillLastReadings();
  if (action==='updateCompliance')      return handleUpdateCompliance(params);
  if (action==='markMissingCompliance') return handleMarkMissingCompliance();
  if (action==='readActions')           return handleReadActions();
  if (action==='appendAction')          return handleAppendAction(params);
  if (action==='updateAction')          return handleUpdateAction(params);
  if (action==='deleteAction')          return handleDeleteAction(params);
  if (action==='sendActionEmail')       return handleSendActionEmail(params);
  if (action==='readLastActionNo')      return handleReadLastActionNo();
  if (action==='readConfig')            return handleReadConfig();
  if (action==='saveConfig')            return handleSaveConfig(params);
  if (action==='getStartupBundle')      return getStartupBundle();
  if (action==='getRmsSpmHistory')      return getRmsSpmHistory();
  // Vibration Log (VibrationLog.js)
  if (action==='getVibLog')             return handleGetVibLog(params, session);
  if (action==='getVibReport')          return handleGetVibReport(params, session);
  if (action==='getVibEntriesFor')      return handleGetVibEntriesFor(params, session);
  if (action==='getVibEquipmentHistory') return handleGetVibEquipmentHistory(params, session);
  if (action==='saveVibReport')         return vlLocked_(function () { return handleSaveVibReport(params, session); });
  if (action==='saveVibEntries')        return vlLocked_(function () { return handleSaveVibEntries(params, session); });
  if (action==='vibReportTransition')   return vlLocked_(function () { return handleVibReportTransition(params, session); });
  // Readings.js
  if (action==='getVibEquipmentSummary') return handleGetVibEquipmentSummary(params, session);
  if (action==='saveVibReadings')       return vlLocked_(function () { return handleSaveVibReadings(params, session); });
  // Limits.js
  if (action==='getVibLimits')          return handleGetVibLimits(params, session);
  // Settings → Equipment & IDs (PlatformEquipment.js), App Owner only
  if (action==='getIdCheck')            return handleGetIdCheck(params);
  if (action==='saveModuleSettings')    return vlLocked_(function () { return handleSaveModuleSettings(params, session); });
  if (action==='markIdCheck')           return handleMarkIdCheck(params, session && session.email);
  if (action==='saveVibLimits')         return vlLocked_(function () { return handleSaveVibLimits(params, session); });
  if (action==='setVibPointStatus')     return vlLocked_(function () { return handleSetVibPointStatus(params, session); });
  // VibActions.js
  if (action==='getVibActions')         return handleGetVibActions(params, session);
  if (action==='getVibActionHistory')   return handleGetVibActionHistory(params, session);
  if (action==='saveVibAction')         return vlLocked_(function () { return handleSaveVibAction(params, session); });
  if (action==='vibActionTransition')   return vlLocked_(function () { return handleVibActionTransition(params, session); });
  // Routes.js + MyWork.js
  if (action==='getVibRoutes')          return handleGetVibRoutes(params, session);
  if (action==='getVibRoute')           return handleGetVibRoute(params, session);
  if (action==='createVibRoute')        return vlLocked_(function () { return handleCreateVibRoute(params, session); });
  if (action==='saveVibRouteProgress')  return vlLocked_(function () { return handleSaveVibRouteProgress(params, session); });
  if (action==='vibRouteTransition')    return vlLocked_(function () { return handleVibRouteTransition(params, session); });
  if (action==='dismissVibSuggestion')  return vlLocked_(function () { return handleDismissVibSuggestion(params, session); });
  if (action==='getMyWork')             return handleGetMyWork(params, session);
  // Dashboard.js
  if (action==='getVibDashboard')       return handleGetVibDashboard(params, session);
  if (action==='getVibTracker')         return handleGetVibTracker(params, session);
  // VibNotifications.js
  if (action==='getVibNotifications')   return handleGetVibNotifications(params, session);
  if (action==='markVibNotificationsRead') return vlLocked_(function () { return handleMarkVibNotificationsRead(params, session); });
  return {error: 'Unknown action: ' + action};
}

function jsonOut(e, obj) {
  var json = JSON.stringify(obj);
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb+'('+json+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ─── readAll ────────────────────────────────────────────────────────────
function readAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Auto-mark missing compliance on every readAll
  try { handleMarkMissingCompliance(); } catch(e) {}
  return {
    rms:         readSheet(ss, SHEET_RMS),
    spm:         readSheet(ss, SHEET_SPM),
    compliance:  readCompliance(ss),
    rmsRegister: readSheet(ss, SHEET_RMS_REG),
    spmRegister: readSheet(ss, SHEET_SPM_REG),
    lastRms:     readSheet(ss, SHEET_LAST_RMS),
    lastSpm:     readSheet(ss, SHEET_LAST_SPM),
    actions:     readActionsRaw(ss),
    config:      readConfigRaw(ss),
    vibPoints:   readVibRegistry(ss),
  };
}

// PERFORMANCE: the first-load bundle (src/App.jsx). Kept small, answered
// from the read cache (Cache.js) and kept on the device (dataCache.js), so
// the app opens with it at once.
function getStartupBundle() {
  // What the app needs to start: machines, points and limits. (The old
  // Compliance Tracker, Last RMS / SPM Reading and Action Tracker lists are
  // no longer used by any page — the Measurement Tracker, Vibration Log
  // Entries and Vibration Actions replaced them.)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    rmsRegister: readSheet(ss, SHEET_RMS_REG),
    spmRegister: readSheet(ss, SHEET_SPM_REG),
    config:      readConfigRaw(ss),
    vibPoints:   readVibRegistry(ss),
  };
}

// The RMS/SPM DATA history getStartupBundle() leaves out — see that
// function's own comment for why.
function getRmsSpmHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    rms: readSheet(ss, SHEET_RMS),
    spm: readSheet(ss, SHEET_SPM),
  };
}

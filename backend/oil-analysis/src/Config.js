/**
 * Oil Analysis module configuration.
 *
 * This is a fully independent Apps Script Web App/project, bound to its
 * own Google Sheet (the "Oil Lubrication Data Base") — never Platform
 * Core's spreadsheet. The spreadsheet ID is read from Script Properties,
 * never hardcoded, so it never ends up committed to the repo.
 *
 * This project also needs its own SESSION_SIGNING_SECRET script property
 * (see src/Session.js), set to the exact same value as Platform Core's,
 * so tokens Platform Core issues verify here without any callback.
 */

function getSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('OIL_ANALYSIS_SPREADSHEET_ID');
  if (!id) {
    throw new Error('OIL_ANALYSIS_SPREADSHEET_ID script property is not set.');
  }
  return id;
}

var SHEET_NAMES = {
  OA_SETTINGS: 'OA_SETTINGS',
  OA_ACTION_PHRASES: 'OA_ACTION_PHRASES',
  OA_LP_REGISTER: 'OA_LP_REGISTER',
  OA_ROUTINES: 'OA_ROUTINES',
  OA_ROUTINE_ITEMS: 'OA_ROUTINE_ITEMS',
  OA_CHANGE_LOG: 'OA_CHANGE_LOG',
  OA_SAMPLES: 'OA_SAMPLES',
  OA_ACTIONS: 'OA_ACTIONS',
  IDEMPOTENCY_LOG: 'IDEMPOTENCY_LOG'
};

// Role IDs match Platform Core's ROLES sheet exactly — this module never
// writes to USERS/ROLES/USER_ROLES, it only reads role claims out of the
// session token Platform Core issued.
var ROLE = {
  ADMIN: 'ROLE-ADMIN',
  TECHNICIAN: 'ROLE-TECH',
  CONTRACTOR_ENGINEER: 'ROLE-CENG',
  RELIABILITY_ENGINEER: 'ROLE-RENG',
  MANAGER: 'ROLE-MGR'
};

var ORG_ACC = 'ORG-ACC';

/**
 * OA_LP_REGISTER and the migrated historical sheets (OA_CHANGE_LOG,
 * OA_SAMPLES, OA_ACTIONS) carry Contractor as the bare code used by the
 * old standalone app ("RHI"/"ASEC"), not Platform Core's OrgId
 * ("ORG-RHI"/"ORG-ASEC") that session tokens carry. New sheets this
 * module owns outright (OA_ROUTINES, OA_ROUTINE_ITEMS) use the OrgId form
 * directly. This is the one conversion point between the two.
 */
var CONTRACTOR_CODE_TO_ORG_ID = { RHI: 'ORG-RHI', ASEC: 'ORG-ASEC' };

function orgIdForContractorCode_(code) {
  return CONTRACTOR_CODE_TO_ORG_ID[code] || code;
}

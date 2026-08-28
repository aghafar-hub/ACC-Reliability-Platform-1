/**
 * Platform Core configuration.
 *
 * The spreadsheet ID is never hardcoded in source — it's read from Script
 * Properties (Project Settings > Script Properties in the Apps Script
 * editor) so the same code can point at different spreadsheets without
 * being edited, and so the ID never ends up committed to the repo.
 */

function getSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLATFORM_CORE_SPREADSHEET_ID');
  if (!id) {
    throw new Error('PLATFORM_CORE_SPREADSHEET_ID script property is not set.');
  }
  return id;
}

var SHEET_NAMES = {
  USERS: 'USERS',
  ROLES: 'ROLES',
  USER_ROLES: 'USER_ROLES',
  ORG_MASTER: 'ORG_MASTER',
  CONTRACTOR_MASTER: 'CONTRACTOR_MASTER',
  EQUIPMENT_MASTER: 'EQUIPMENT_MASTER',
  LP_POINT_MASTER: 'LP_POINT_MASTER',
  VIB_POINT_MASTER: 'VIB_POINT_MASTER',
  AREA_MASTER: 'AREA_MASTER',
  MODULE_REGISTRY: 'MODULE_REGISTRY',
  ROLE_MASTER: 'ROLE_MASTER',
  MODULE_MASTER: 'MODULE_MASTER',
  MODULE_TAB_MASTER: 'MODULE_TAB_MASTER',
  FEATURE_MASTER: 'FEATURE_MASTER',
  ACTION_MASTER: 'ACTION_MASTER',
  SCOPE_MASTER: 'SCOPE_MASTER',
  ROLE_PERMISSION: 'ROLE_PERMISSION',
  ADMIN_SETTINGS: 'ADMIN_SETTINGS',
  IDEMPOTENCY_LOG: 'IDEMPOTENCY_LOG',
  AUDIT_LOG: 'AUDIT_LOG'
};

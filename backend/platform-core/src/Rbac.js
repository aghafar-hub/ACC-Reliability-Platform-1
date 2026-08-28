/**
 * RBAC engine — Foundation spec §6.3.
 *
 * Permission chain: Org -> Role -> Module -> Tab -> Feature -> Action
 * -> Data Scope -> Field Permission. A denial at any layer blocks
 * access; nothing is accessible without an explicit grant.
 *
 * The Data Scope layer is where contractor isolation (spec §6.2) is
 * enforced: a non-ACC user's queries are filtered to
 * Contractor = <user's org>; ACC users get no contractor filter.
 * This must run server-side on every protected request — never trust a
 * hidden/disabled UI control as the security boundary.
 *
 * STATUS: skeleton — full implementation is a dedicated task
 * ("Build Apps Script backend: RBAC engine"). Function signatures below
 * define the contract the rest of the backend will call.
 */

/**
 * Returns true/false (or throws with a reason) for whether userId may
 * perform actionCode on featureCode within moduleCode/tabCode.
 * TODO: implement against ROLE_PERMISSION + USER_ROLES.
 */
function hasPermission_(userId, moduleCode, tabCode, featureCode, actionCode) {
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: RBAC engine');
}

/**
 * Returns the contractor filter to apply to a data query for userId:
 * null for ACC users (no filter — see all), or the user's OrgId for
 * RHI/ASEC users (hard boundary, per spec §6.2).
 * TODO: implement against USERS + ORG_MASTER.
 */
function getContractorScope_(userId) {
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: RBAC engine');
}

/**
 * Asset Master write authority is App Admin only (spec §7) — a stricter
 * check than the general permission chain above, called directly by
 * AssetMaster.js write functions.
 * TODO: implement.
 */
function requireAppAdmin_(userId) {
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: RBAC engine');
}

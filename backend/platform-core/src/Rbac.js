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
 * AssetMaster.js write functions and by Code.js for admin-only actions
 * (createUser, adminResetPassword).
 */
function requireAppAdmin_(userId) {
  var rows = readSheetAsObjects_(getSheet_(SHEET_NAMES.USER_ROLES))
    .filter(function (r) { return r.UserId === userId; });
  var isAdmin = rows.some(function (r) { return r.RoleId === 'ROLE-ADMIN'; });
  if (!isAdmin) {
    throw new Error('App Admin permission required.');
  }
}


/**
 * ONE-TIME SEED — run manually from the Apps Script editor's Run dropdown
 * (pick seedRolePermissions_ from the function list, click Run), not part
 * of the Web App request path. Grants baseline permissions to the 4
 * non-admin roles already seeded in ROLES (ROLE-TECH, ROLE-CENG,
 * ROLE-RENG, ROLE-MGR) — ROLE-ADMIN already has a full "*" wildcard grant
 * from the original seed, untouched here.
 *
 * ModuleId "oil-analysis" is the real module id (see MODULE_REGISTRY) —
 * what the rest of this project calls "Oil Lubrication". ModuleId
 * "platform-core" is a pseudo-module (not in MODULE_REGISTRY, which only
 * lists embedded-app modules) covering Platform Core's own screens
 * (Accounts, My Work, Dashboard) — ROLE_PERMISSION's ModuleId column is a
 * free-form key already, so this is consistent with how it's used
 * elsewhere, not a schema change.
 *
 * Safe to re-run: clears any existing non-admin grants first, so running
 * it twice doesn't duplicate rows.
 */
function seedRolePermissions_() {
  var GRANTS = [
    // Oil Lubrication: technicians only see + mark their own assigned
    // work done — no create/approve/delete.
    ['ROLE-TECH', 'oil-analysis', 'View'],
    ['ROLE-TECH', 'oil-analysis', 'Edit'],
    // Contractor Engineer / Reliability (ACC) Engineer / Manager: full
    // day-to-day authority (create routines/top-ups/actions, edit, approve)
    // but not Delete — deletion stays Admin-only for now. Manager gets the
    // identical grant set to its Engineer counterpart per design (same
    // permissions, contractor scope comes from the user's own OrgId, not
    // from a separate role) — see the "solid app" RBAC planning notes.
    ['ROLE-CENG', 'oil-analysis', 'View'],
    ['ROLE-CENG', 'oil-analysis', 'Create'],
    ['ROLE-CENG', 'oil-analysis', 'Edit'],
    ['ROLE-CENG', 'oil-analysis', 'Approve'],
    ['ROLE-RENG', 'oil-analysis', 'View'],
    ['ROLE-RENG', 'oil-analysis', 'Create'],
    ['ROLE-RENG', 'oil-analysis', 'Edit'],
    ['ROLE-RENG', 'oil-analysis', 'Approve'],
    ['ROLE-MGR', 'oil-analysis', 'View'],
    ['ROLE-MGR', 'oil-analysis', 'Create'],
    ['ROLE-MGR', 'oil-analysis', 'Edit'],
    ['ROLE-MGR', 'oil-analysis', 'Approve'],
    // Platform Core's own screens: every non-admin role just needs to be
    // able to open the shell at all (which specific screen they land on —
    // My Work vs the normal Sidebar — is a frontend routing decision, not
    // a permission one).
    ['ROLE-TECH', 'platform-core', 'View'],
    ['ROLE-CENG', 'platform-core', 'View'],
    ['ROLE-RENG', 'platform-core', 'View'],
    ['ROLE-MGR', 'platform-core', 'View'],
  ];

  var sheet = getSheet_(SHEET_NAMES.ROLE_PERMISSION);
  var nonAdminRoles = ['ROLE-TECH', 'ROLE-CENG', 'ROLE-RENG', 'ROLE-MGR'];
  nonAdminRoles.forEach(function (roleId) {
    deleteRowsByColumn_(sheet, 'RoleId', roleId);
  });
  GRANTS.forEach(function (g) {
    appendRow_(sheet, { RoleId: g[0], ModuleId: g[1], ActionCode: g[2], Allowed: true });
  });
  return { status: 'ok', grantsWritten: GRANTS.length };
}

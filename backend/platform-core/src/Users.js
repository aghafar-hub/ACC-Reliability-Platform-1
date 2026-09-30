/**
 * User directory lookups beyond Auth.js's own create/reset (spec §6).
 *
 * listOrgUsers_ exists mainly for other modules' UIs — e.g. Oil Analysis's
 * "assign technician" picker when a Contractor Engineer creates a Routine.
 * A non-admin only sees their own org's active users (contractor isolation
 * applies to the user directory too, not just equipment/data); App Admin
 * sees everyone.
 */
function listOrgUsers_(session) {
  var users = readSheetAsObjects_(getSheet_(SHEET_NAMES.USERS))
    .filter(function (u) { return u.Status === 'Active'; });
  var isAdmin = session.roles.indexOf('ROLE-ADMIN') !== -1;
  var scoped = isAdmin ? users : users.filter(function (u) { return u.OrgId === session.orgId; });

  var userRoles = readSheetAsObjects_(getSheet_(SHEET_NAMES.USER_ROLES));
  return scoped.map(function (u) {
    var roles = userRoles
      .filter(function (r) { return r.UserId === u.UserId; })
      .map(function (r) { return r.RoleId; });
    return { userId: u.UserId, email: u.Email, orgId: u.OrgId, roles: roles };
  });
}

/**
 * Every real RoleId (ROLES sheet), for populating a role picker — the
 * frontend has its own hardcoded copy (frontend/src/auth/session.ts'
 * ROLE constant) for permission-check convenience, but the *picker* reads
 * this so a new role added to the sheet shows up without a redeploy.
 */
function listRoles_() {
  return readSheetAsObjects_(getSheet_(SHEET_NAMES.ROLES)).map(function (r) {
    return { roleId: r.RoleId, roleName: r.RoleName };
  });
}

/**
 * App Admin only — enforced by the RBAC check in Code.js before this is
 * called, not just by convention here. Replaces a user's entire role set
 * (not additive) — clearing USER_ROLES then re-adding, same pattern
 * changePassword_ uses for a single-field replace, just row-level instead
 * of cell-level since a user can hold more than one role.
 */
function setUserRoles_(userId, roleIds) {
  return withLock_(function () {
    var usersSheet = getSheet_(SHEET_NAMES.USERS);
    if (!findRowByColumn_(usersSheet, 'UserId', userId)) {
      throw new Error('User not found.');
    }
    var validRoleIds = readSheetAsObjects_(getSheet_(SHEET_NAMES.ROLES)).map(function (r) { return r.RoleId; });
    var roles = (roleIds || []).filter(function (r) { return r; });
    roles.forEach(function (r) {
      if (validRoleIds.indexOf(r) === -1) throw new Error('Unknown role: ' + r);
    });

    var userRolesSheet = getSheet_(SHEET_NAMES.USER_ROLES);
    deleteRowsByColumn_(userRolesSheet, 'UserId', userId);
    roles.forEach(function (roleId) {
      appendRow_(userRolesSheet, { UserId: userId, RoleId: roleId });
    });
    return { userId: userId, roles: roles };
  });
}

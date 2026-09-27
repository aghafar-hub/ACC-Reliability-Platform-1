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

/**
 * Oil Analysis authorization helpers.
 *
 * Contractor isolation (spec §6.2) is enforced here, server-side, on every
 * protected request: a non-ACC user's data is filtered to their own
 * Contractor; ACC users (org ORG-ACC) see everything. Role checks use the
 * roles embedded in the session token at login time (see Session.js).
 */

function requireRole_(session, allowedRoleIds) {
  var allowed = session.roles.some(function (r) { return allowedRoleIds.indexOf(r) !== -1; });
  if (!allowed) {
    throw new Error('You do not have permission to perform this action.');
  }
}

function isAppAdmin_(session) {
  return session.roles.indexOf(ROLE.ADMIN) !== -1;
}

function isAcc_(session) {
  return session.orgId === ORG_ACC;
}

/**
 * Routines are contractor operational work: the creator (Contractor
 * Engineer or Manager) must belong to the same contractor org as the
 * technician being assigned, unless they're an App Admin. This keeps the
 * hard contractor-isolation rule intact even though ACC also has a
 * Manager role — an ACC Manager cannot create or approve a contractor's
 * routine, only comment on it (see requireRole_ call sites in Routines.js).
 */
function requireContractorMatch_(session, contractorOrgId) {
  if (isAppAdmin_(session)) return;
  if (session.orgId !== contractorOrgId) {
    throw new Error('You can only act within your own contractor organization.');
  }
}

/**
 * Filters rows with a Contractor column to the caller's own org, unless
 * they're ACC or App Admin. Set legacyCodeColumn=true for sheets that
 * still carry the old bare contractor code (OA_LP_REGISTER, OA_CHANGE_LOG,
 * OA_SAMPLES, OA_ACTIONS) rather than Platform Core's OrgId form.
 */
function filterByContractor_(session, rows, contractorColumn, legacyCodeColumn) {
  if (isAcc_(session) || isAppAdmin_(session)) return rows;
  return rows.filter(function (r) {
    var value = legacyCodeColumn ? orgIdForContractorCode_(r[contractorColumn]) : r[contractorColumn];
    return value === session.orgId;
  });
}

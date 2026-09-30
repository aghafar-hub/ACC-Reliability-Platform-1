// RBAC enforcement for this backend (RBAC Increment 5 — see the platform-
// wide plan in docs/). Two independent checks, both server-side:
//
//  1. hasPermission_/requirePermission_ — can this role do this kind of
//     thing at all (View/Create/Edit/Approve/Delete)?
//  2. getContractorScope_ — for a non-ACC user, which Contractor's data
//     may they touch at all?
//
// This project has no ROLE_PERMISSION sheet of its own (that lives only in
// Platform Core's spreadsheet, a completely separate file this backend has
// no live access to — by design, same as every session-token check here
// being self-contained with no callback to Platform Core). ROLE_GRANTS
// below is a small, deliberately duplicated copy of exactly the
// "oil-analysis" module rows Platform Core's Rbac.js#seedRolePermissions_
// seeds — if that grant set ever changes, update both places. A live
// cross-project fetch was considered and rejected: it would add a network
// call and a new failure mode to every single write, for a table that
// changes rarely.
var ROLE_GRANTS = {
  'ROLE-TECH': ['View', 'Edit'],
  'ROLE-CENG': ['View', 'Create', 'Edit', 'Approve'],
  'ROLE-RENG': ['View', 'Create', 'Edit', 'Approve'],
  'ROLE-MGR': ['View', 'Create', 'Edit', 'Approve'],
  // ROLE-ADMIN isn't listed — handled as a wildcard below, matching
  // Platform Core's own ROLE-ADMIN "*" grant row.
};

// True when `session` (from checkAuth_, may be null) may perform
// actionCode ('View'|'Create'|'Edit'|'Approve'|'Delete').
//
// Fails OPEN (returns true) in two transitional cases, both deliberate —
// this mirrors checkSecret_'s own "fails open until configured" stance
// just above it in Auth.js, for the same reason: this backend has been
// live for ~20 real people for a long time, and flipping straight to
// fail-closed the instant this code ships would lock out anyone whose
// Platform Core account doesn't have a role assigned yet — a regression,
// not a security fix. Both holes close naturally, with no code change,
// once the App Admin has gone through Platform Core's Accounts panel and
// given every real account a role:
//   - no session at all (a request with no sessionToken — an old/
//     not-yet-updated client, or a device with no Platform Core account)
//   - a session with an empty roles array (a real, logged-in account that
//     just hasn't been assigned a role yet)
// A session that DOES carry roles is checked for real: an unrecognized
// role or a role without the needed grant is rejected outright.
function hasPermission_(session, actionCode) {
  if (!session) return true;
  var roles = session.roles || [];
  if (roles.length === 0) return true;
  return roles.some(function (roleId) {
    if (roleId === 'ROLE-ADMIN') return true;
    var grants = ROLE_GRANTS[roleId];
    return !!grants && grants.indexOf(actionCode) !== -1;
  });
}

function requirePermission_(session, actionCode) {
  if (!hasPermission_(session, actionCode)) {
    throw new Error('You do not have permission to do that.');
  }
}

// Same ORG-ACC id Platform Core's own Config.js uses.
var ORG_ACC = 'ORG-ACC';

// This sheet's Contractor column (ROUTINES/ROUTINE_TEMPLATES) uses short
// labels ("RHI"/"ASEC" — see apps/oil-analysis/src/pages/NewRoutine.jsx's
// CONTRACTOR_OPTIONS) that were never unified with Platform Core's OrgId
// scheme ("ORG-RHI"/"ORG-ASEC" — see frontend/src/components/
// AccountsPanel.tsx's ORGS). Small manual map instead of a computed
// transform; extend both this and the two lists above together if a new
// contractor is ever added.
var ORG_TO_CONTRACTOR = {
  'ORG-RHI': 'RHI',
  'ORG-ASEC': 'ASEC',
};

// Returns the Contractor label a non-ACC session is confined to, or null
// for an ACC user (or no session at all) — null means "no filter, see
// everything," matching Platform Core's own getContractorScope_ exactly.
//
// KNOWN LIMITATION: ROUTINES and ROUTINE_TEMPLATES are the only sheets in
// this app that carry a Contractor column at all — Equipment Registry,
// Data_Entry (samples), Action Tracker, Oil Change LOG and Oil Inventory
// have no per-row contractor tag today, so this scope can only be applied
// to Routines/Route Templates until one is added to those sheets too (a
// schema change, not something this function can paper over).
function getContractorScope_(session) {
  if (!session || !session.orgId || session.orgId === ORG_ACC) return null;
  return ORG_TO_CONTRACTOR[session.orgId] || null;
}

// Throws unless the session's contractor scope allows touching a
// routine/template whose own Contractor is `contractor`. A null contractor
// (the target wasn't found) passes through — the calling action's own
// findRowIndex/lookup reports "not found" right after, which is the more
// useful error for a bad id; this only rejects an id that DOES exist but
// belongs to a contractor outside the caller's scope.
function requireContractorMatch_(session, contractor) {
  var scope = getContractorScope_(session);
  if (!scope || !contractor) return;
  if (contractor !== scope) {
    throw new Error('That routine belongs to a different contractor.');
  }
}

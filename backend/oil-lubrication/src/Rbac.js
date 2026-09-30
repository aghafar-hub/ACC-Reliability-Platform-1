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
// ROUTINES/ROUTINE_TEMPLATES carry their own Contractor column and use
// this directly. Every other sheet (Equipment Registry, Data_Entry,
// Action Tracker, Oil Change LOG, Oil Sample Tracker) has no Contractor
// column of its own, but all of them key their rows by LP_ID — this scope
// still applies to them via a join through Equipment Registry's own
// Contractor column, see filterRowsByLpContractor_/
// filterTrackerRowsByLpContractor_/requireLpContractorMatch_ below.
//
// STILL NOT COVERED: Oil Inventory (products/movements) has no LP_ID or
// Contractor concept at all in this schema — it's a shared warehouse, not
// per-contractor stock, so there's genuinely nothing to scope there. The
// generic append/updateRow/deleteRow actions (Code.js's
// GENERIC_WRITE_ALLOWLIST) are permission-gated but not contractor-
// ownership-verified per row — they take arbitrary matchCols/matchValues,
// not always an LP_ID at a known column, so a per-call scope check isn't
// generic; a real fix there is a dedicated follow-up, not a one-line add.
function getContractorScope_(session) {
  if (!session || !session.orgId || session.orgId === ORG_ACC) return null;
  return ORG_TO_CONTRACTOR[session.orgId] || null;
}

// Filters `rows` (raw sheet rows, LP_ID at `lpIndex`) down to the ones
// whose Equipment Registry contractor matches `scope` — a no-op (rows
// unchanged) when scope is null (ACC user, or no session). A row whose
// LP_ID isn't in the registry at all (a data inconsistency, or a row keyed
// some other way) is dropped once scoped, rather than guessed into either
// side. Used for every sheet that has NO Contractor column of its own but
// keys its rows by LP_ID — Data_Entry, Action Tracker, Oil Change LOG —
// see EquipmentRegistry.js's getLpContractorMap_ for the join itself.
function filterRowsByLpContractor_(rows, lpIndex, scope) {
  if (!scope) return rows;
  var map = getLpContractorMap_();
  return rows.filter(function (r) {
    return map[String(r[lpIndex] || '').trim()] === scope;
  });
}

// Same idea, for Oil Sample Tracker specifically: that sheet is read WITH
// its header row included (readAll() passes skipHeader=false, since the
// header carries the month column names the client's own parser needs) —
// a plain filterRowsByLpContractor_ call would drop row 0 too, since no
// real LP_ID equals a header cell. This keeps row 0 unconditionally.
function filterTrackerRowsByLpContractor_(rows, scope) {
  if (!scope) return rows;
  var map = getLpContractorMap_();
  return rows.filter(function (r, i) {
    if (i === 0) return true;
    return map[String(r[0] || '').trim()] === scope;
  });
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

// Same idea as requireContractorMatch_, for an action identified by LP_ID
// rather than an existing routine/template — logOilChangeEvent,
// updateSampleTracker. An LP_ID with no registry entry (or none at all)
// passes through — the action's own validation gives the more useful
// error for a bad/missing id.
function requireLpContractorMatch_(session, lpId) {
  var scope = getContractorScope_(session);
  if (!scope) return;
  var contractor = getLpContractorMap_()[String(lpId || '').trim()];
  if (!contractor) return;
  if (contractor !== scope) {
    throw new Error('That equipment belongs to a different contractor.');
  }
}

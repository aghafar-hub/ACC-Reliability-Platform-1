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
// ROUTINES/ROUTINE_TEMPLATES and Oil Inventory each carry their own
// Contractor column and use this directly (Oil Inventory's stock is
// contractor-owned, not a shared ACC warehouse — confirmed by the user).
// Every other sheet (Equipment Registry, Data_Entry, Action Tracker, Oil
// Change LOG, Oil Sample Tracker) has no Contractor column of its own, but
// all of them key their rows by LP_ID — this scope still applies to them
// via a join through Equipment Registry's own Contractor column, see
// filterRowsByLpContractor_/filterTrackerRowsByLpContractor_/
// requireLpContractorMatch_ below.
//
// STILL NOT COVERED: the generic append/updateRow/deleteRow actions
// (Code.js's GENERIC_WRITE_ALLOWLIST) are permission-gated but not
// contractor-ownership-verified per row — they take arbitrary
// matchCols/matchValues, not always an LP_ID at a known column, so a
// per-call scope check isn't generic; a real fix there is a dedicated
// follow-up, not a one-line add.
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
// routine/template/product whose own Contractor is `contractor`. A null
// contractor (the target wasn't found) passes through — the calling
// action's own findRowIndex/lookup reports "not found" right after, which
// is the more useful error for a bad id; this only rejects an id that DOES
// exist but belongs to a contractor outside the caller's scope.
function requireContractorMatch_(session, contractor) {
  var scope = getContractorScope_(session);
  if (!scope || !contractor) return;
  if (contractor !== scope) {
    throw new Error('That belongs to a different contractor.');
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

// Patch 5 (plant-readiness pass) — closes the one contractor-ownership gap
// left after Increment 5b: the GENERIC append/updateRow/deleteRow actions
// (Code.js) were permission-gated (requirePermission_) and sheet-gated
// (GENERIC_WRITE_ALLOWLIST) but never row-gated — nothing stopped a scoped
// caller from touching another contractor's Data_Entry/Action Tracker row,
// or another contractor's Equipment Registry entry, through these generic,
// client-driven paths. Every OTHER write in this codebase (logOilChangeEvent,
// createRoutine, addOilProduct, …) already checks this; these three were
// the gap.
//
// Finds which value in `matchValues` identifies the row's own LP_ID/
// equipment code, using GENERIC_WRITE_LP_COL (Config.js) to know which
// SHEET COLUMN that is, then GENERIC_WRITE_LP_COL's position within the
// caller-supplied matchCols to know where that lands in matchValues —
// deliberately not a fixed matchValues index, since different call sites
// order these differently (Action Tracker's own convention matches Ac. No.
// first, Equipment Code second; Data_Entry matches equipment code first).
// Returns null when the sheet has no LP_ID concept (OL_ACTION_PHRASES) or
// the caller didn't match on that column at all — either way there's
// nothing here to check, and the write's own row-lookup logic gives the
// right error for a genuinely malformed request.
function genericWriteLpId_(sheetName, matchCols, matchValues) {
  var col = GENERIC_WRITE_LP_COL[sheetName];
  if (col === undefined) return null;
  var idx = (matchCols || []).indexOf(col);
  if (idx === -1) return null;
  return (matchValues || [])[idx];
}

// Equipment Registry's Contractor column (index 17) is meant to change
// hands only as its own deliberate action (see OilInventory.js's own
// comment on this) — nothing in this app exposes an in-UI "reassign
// contractor" flow today, so the only way it could change via the generic
// updateRow path is a client sending a different value than what's
// already there, by bug or by intent. For a scoped caller (never for
// ACC/Admin, who have no scope to enforce), this overwrites whatever
// Contractor the client sent in `row` with the row's EXISTING value read
// fresh from the sheet, the same "force the server-trusted value, ignore
// the client's" pattern createRoutine/addOilProduct already use for their
// own contractor field — silent, not a thrown error, since an unscoped
// field the caller didn't mean to touch (this form only ever edits the
// sampling interval) shouldn't block their actual edit.
function lockEquipmentRegistryContractor_(session, sheet, rowIdx, row) {
  var scope = getContractorScope_(session);
  if (!scope || !row || row.length <= 17) return row;
  var existing = sheet.getRange(rowIdx, 18).getValue(); // column 18 = 1-indexed Contractor
  row[17] = existing;
  return row;
}

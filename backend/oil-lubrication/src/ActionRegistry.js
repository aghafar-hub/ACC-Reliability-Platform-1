// OL_ACTION_PHRASES reads (the Contractor/ACC Action pick-list source).
// Split out of the old monolithic Code.js (see docs/oil-lubrication-migration-notes.md).



// ─── Action Registry (Option A hardening) ─────────────────────────────────
//
// OPTION A HARDENING (see docs/oil-lubrication-migration-notes.md): the
// frontend has always called this action, but the backend had no matching
// case — every request silently fell through to the unknown-action default
// and returned an empty result, so the Action Registry picker in the app
// has never actually worked. The real sheet tab is "OL_ACTION_PHRASES"
// (not "Action Registry", which the frontend's write path also used to
// target and doesn't exist) — columns: A=No, B=Actions Phrase, header row
// 1, data row 2+.
function readActionRegistry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "OL_ACTION_PHRASES", true);
  var actions = rows.map(function(r) { return String(r[1] || "").trim(); }).filter(Boolean);
  return { actions: actions, count: actions.length };
}

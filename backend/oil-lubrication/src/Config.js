// Shared constants — schema positions, caching, and the generic-write allowlist.
// Split out of the old monolithic Code.js (see docs/oil-lubrication-migration-notes.md).

var LAST_MODIFIED_COL = {
  "Data_Entry": 39,
  "Action Tracker": 19,
  "Oil Change LOG": 13,
  "OA_ROUTINE_ITEMS": 12,
  "Oil Inventory LOG": 12,
  "Oil Inventory": 16,
  "ROUTINE_TEMPLATES": 13
};


var DASHBOARD_CACHE_KEY = "dashboard_v4";

var DASHBOARD_CACHE_SECONDS = 300; // 5 minutes


// OPTION A HARDENING (see docs/oil-lubrication-migration-notes.md): which
// sheets the GENERIC append/updateRow/deleteRow path — driven directly by
// a client-supplied data.sheet, with no validation before this — is
// allowed to touch. Without this, a client (or a bug) could create new
// sheets, or write to ones meant to be read-only or backend-only:
// Equipment Registry's formula-adjacent columns, ROUTINES, Oil Last
// Change, Oil Inventory, the Debug Log. Everything else that needs to
// write goes through its own dedicated, validated function instead
// (logOilChangeEvent, createRoutine, addOilProduct, …).
var GENERIC_WRITE_ALLOWLIST = {
  append:    ["Data_Entry", "Action Tracker", "OL_ACTION_PHRASES"],
  updateRow: ["Data_Entry", "Action Tracker", "Equipment Registry"],
  deleteRow: ["Data_Entry", "Action Tracker"]
};

// RBAC hardening (Patch 5 of the plant-readiness pass, see
// docs/oil-lubrication-migration-notes.md): the allowlist above stops a
// scoped caller from writing to the WRONG SHEET, but said nothing about
// the wrong ROW within an allowed sheet — a Contractor Engineer could
// still, in principle, edit or delete another contractor's Data_Entry/
// Action Tracker row, or another contractor's Equipment Registry entry,
// through these generic actions (every OTHER write path in this codebase
// — logOilChangeEvent, createRoutine, addOilProduct, … — already checks
// this; these three generic ones were the one gap). This is which array
// index in that sheet's own row layout holds the LP_ID/equipment code a
// row belongs to — used by Code.js to look up that row's real contractor
// and compare it against the caller's scope before the write goes
// through. A sheet with no entry here (OL_ACTION_PHRASES) has no LP_ID
// concept at all — nothing to check.
var GENERIC_WRITE_LP_COL = {
  "Data_Entry": 0,
  "Action Tracker": 1,
  "Equipment Registry": 0
};


// Patch 12 (plant-readiness pass): every real, governed data sheet this
// app's doPost writes to — used by SheetTriggers.js's onEdit to detect
// and log a DIRECT edit made in the Sheets UI itself, bypassing every
// app-side rule (RBAC, contractor scoping, conflict detection, Sample_UID
// assignment, audit trail attribution — none of it applies to someone
// just typing into a cell). Deliberately excludes OL_ACTION_PHRASES (a
// low-stakes reference list, not operational data) and the Debug Log/
// Audit Log sheets themselves (watching those would make every logged
// event about to be written also trigger onEdit, including THIS app
// writing to Audit Log on a real detected direct edit — appendRow via
// the Apps Script API does NOT fire onEdit, only real Sheets-UI edits do,
// so this isn't actually a risk, but excluding them keeps the intent
// unambiguous: this list is "sheets a human should never be editing by
// hand").
var DIRECT_EDIT_WATCH_SHEETS = [
  "Data_Entry", "Action Tracker", "Equipment Registry", "Oil Change LOG",
  "ROUTINES", "OA_ROUTINE_ITEMS", "ROUTINE_TEMPLATES", "Oil Inventory", "Oil Inventory LOG"
];

// Every watched sheet that keys its rows by an LP_ID — resolved via
// resolveLpContractor_ (Rbac.js), same join through Equipment Registry
// every other LP_ID-keyed contractor lookup in this codebase already
// uses. Deliberately a separate map from GENERIC_WRITE_LP_COL above:
// that one only covers the three sheets the GENERIC updateRow/deleteRow
// actions touch, not every sheet a direct edit might land on (Oil Change
// LOG, OA_ROUTINE_ITEMS).
var DIRECT_EDIT_LP_COL = {
  "Data_Entry": 0,
  "Action Tracker": 1,
  "Equipment Registry": 0,
  "Oil Change LOG": 1,
  "OA_ROUTINE_ITEMS": 2
};

// The remaining watched sheets carry their OWN Contractor column
// directly (not joined through an LP_ID) — same columns their own
// read/write functions already use (see ROUTINES/ROUTINE_TEMPLATES'
// own column-layout comments in Routines.js/RouteTemplates.js, and
// rowToOilMovement's in parsers.js for Oil Inventory LOG).
var DIRECT_EDIT_CONTRACTOR_COL = {
  "ROUTINES": 3,
  "ROUTINE_TEMPLATES": 3,
  "Oil Inventory": 16,
  "Oil Inventory LOG": 7
};



// ─── Oil Sample Tracker update (monthly format) ──────────────────────────
// Updates "Oil Sample Tracker" sheet. Layout: col A = Equipment, col B =
// Last sample, col C = interval Days, col D = INTERVAL, col E+ = one column
// per month. Month headers can be plain text ("Sep-26") or real Date cells
// (both exist in this sheet's history) — normalizeMonthHeader() handles
// either so every sample for the same month lands in the SAME column,
// never a new per-day column.
// Cell value: "Normal|26 Sep 2026" (status|date) or just "Normal" (old format)

var MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

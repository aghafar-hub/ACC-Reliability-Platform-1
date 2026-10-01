// Patch 9 (plant-readiness pass, see docs/oil-lubrication-migration-notes.md):
// a structured, per-record "who changed what, when" feed — distinct from
// the Debug Log (Utils.js's logError), which exists for developer
// troubleshooting and mixes real errors, blocked/unauthorized attempts, and
// successful writes together under inconsistent per-action "extra" shapes.
// This sheet records ONLY successful writes, one row per write, with a
// consistent schema a UI can actually query and render: Timestamp, Sheet,
// RecordId, Action, ActingUser, Contractor, Summary. RecordId is always the
// natural id a plant user would recognize — the equipment/LP_ID for
// anything keyed by one, or the routine/template/product's own id
// otherwise — so "show me everything that happened to LP-101" or "show me
// this routine's history" is a single filter, not a join.
//
// Deliberately no before/after field-level diffing: this codebase has no
// uniform column→header mapping across sheets that would make a generic
// diff readable, and a confusing diff is worse than a clear one-line
// description of what kind of change happened. Every doPost branch already
// knows what it just did well enough to describe it in plain language —
// see Code.js's recordAudit_ calls.

function recordAudit_(ss, sheetName, recordId, actionType, actingUser, contractor, summary) {
  try {
    var sheet = ss.getSheetByName("Audit Log");
    if (!sheet) {
      sheet = ss.insertSheet("Audit Log");
      sheet.appendRow(["Timestamp", "Sheet", "RecordId", "Action", "ActingUser", "Contractor", "Summary"]);
    }
    sheet.appendRow([
      new Date().toISOString(),
      sheetName || "",
      recordId || "",
      actionType || "",
      actingUser || "",
      contractor || "",
      summary || ""
    ]);
  } catch (e2) { /* never let audit logging itself break the request — same convention as logError */ }
}

// GET endpoint: a paginated, newest-first feed of audit entries, scoped to
// the caller's contractor exactly like every other read in this backend,
// optionally narrowed to one record (equipment/routine/template/product id)
// for a per-record "history" view. A blank/unscoped RecordId or Contractor
// is dropped by the scope filter the same way an unknown LP_ID would be
// elsewhere — the row exists but can't be attributed into this caller's view.
function getAuditTrail(recordId, scope, pageParam, limitParam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Audit Log", true); // [] if the sheet doesn't exist yet

  var id = String(recordId || "").trim();
  if (id) {
    rows = rows.filter(function (r) { return String(r[2] || "").trim().toLowerCase() === id.toLowerCase(); });
  }
  if (scope) {
    rows = rows.filter(function (r) { return String(r[5] || "").trim() === scope; });
  }
  rows = rows.slice().reverse(); // appended chronologically — newest first for display

  var page  = Math.max(1, parseInt(pageParam, 10) || 1);
  var limit = Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50));
  var total = rows.length;
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var start = (page - 1) * limit;
  var pageRows = rows.slice(start, start + limit);

  return { rows: pageRows, page: page, limit: limit, total: total, totalPages: totalPages };
}

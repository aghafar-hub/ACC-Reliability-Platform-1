// "Module Responsibilities" — which real account is assigned as the
// Contractor Engineer (and, as this grows, other roles) for each
// contractor, per module. Backs the monthly sample-overdue digest
// (SampleOverdue.js): instead of a bare, unverified email on a flat list,
// an admin assigns a real registered account from Platform Core's own
// directory (see frontend's TechnicianPicker reuse in Settings.jsx).
//
// Lives in its OWN sheet here, not Platform Core's — same reasoning
// Notifications.js's getNotifyReviewers_ already gives for
// OL_NOTIFY_REVIEWERS: this backend has no session or credential of its
// own to call Platform Core with, and a live cross-project fetch on every
// digest run would add a new network call and failure mode. The admin UI
// that manages this sheet still picks from Platform Core's real account
// list (via listOrgUsers) — only the assignment record itself is stored
// here, exactly like OL_NOTIFY_REVIEWERS already does for plain emails.
//
// Scoped by a Module column (currently only "Oil Lubrication" is written)
// so this sheet can grow to cover other modules later without a schema
// change — not a guess at what a future module will need, just leaving
// the door open the same way OL_ACTION_PHRASES's sheet-name doesn't bake
// in "oil" anywhere either.
//
// Self-creating sheet, same pattern as OL_ACTION_PHRASES/
// OL_IN_APP_NOTIFICATIONS. Columns: Module, Contractor, Role, Email,
// DisplayName, Modified_Date.
var MODULE_RESP_SHEET = "OL_MODULE_RESPONSIBILITIES";
var MODULE_RESP_HEADERS = ["Module", "Contractor", "Role", "Email", "DisplayName", "Modified_Date"];

function getModuleResponsibilities_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, MODULE_RESP_SHEET, true);
  return rows
    .map(function (r) {
      return {
        module: String(r[0] || "").trim(),
        contractor: String(r[1] || "").trim(),
        role: String(r[2] || "").trim(),
        email: String(r[3] || "").trim(),
        displayName: String(r[4] || "").trim(),
      };
    })
    .filter(function (r) { return r.module && r.contractor && r.role; });
}

// Looks up the single email assigned to (module, contractor, role) — ""
// if nobody's been assigned yet. Used by digest functions that need to
// know WHO to notify, not the full list the admin UI reads.
function getModuleResponsibleEmail_(module, contractor, role) {
  var rows = getModuleResponsibilities_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].module === module && rows[i].contractor === contractor && rows[i].role === role) {
      return rows[i].email;
    }
  }
  return "";
}

// Upsert by (Module, Contractor, Role) — same find-or-append convention
// updateSampleTrackerMonthly uses for its own rows. Platform-wide admin
// config (not any one contractor's own data), so this is gated to
// ROLE-ADMIN by Code.js's dispatch, same as updateNotificationSettings —
// no contractor-scope check needed here for that reason.
function setModuleResponsibility_(data) {
  var module = String(data.module || "").trim();
  var contractor = String(data.contractor || "").trim();
  var role = String(data.role || "").trim();
  var email = String(data.email || "").trim();
  var displayName = String(data.displayName || "").trim();
  if (!module || !contractor || !role) return { error: "module, contractor, and role are required" };
  if (email && !looksLikeEmail_(email)) return { error: "That doesn't look like a valid email address." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MODULE_RESP_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MODULE_RESP_SHEET);
    sheet.getRange(1, 1, 1, MODULE_RESP_HEADERS.length).setValues([MODULE_RESP_HEADERS]);
  }
  var now = new Date().toISOString();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var vals = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (
        String(vals[i][0]).trim() === module &&
        String(vals[i][1]).trim() === contractor &&
        String(vals[i][2]).trim() === role
      ) {
        sheet.getRange(i + 2, 4, 1, 3).setValues([[email, displayName, now]]);
        return { status: "ok" };
      }
    }
  }
  sheet.appendRow([module, contractor, role, email, displayName, now]);
  return { status: "ok" };
}

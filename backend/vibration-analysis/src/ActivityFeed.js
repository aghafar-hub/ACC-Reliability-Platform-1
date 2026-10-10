// Platform Activity page (step 4): this module's Vibration Audit tab for the
// shell, which merges it with Oil's and the platform's own logs.
// App Owner and ACC managers only. ?from=<ISO date> (default 31 days back,
// at most a year), newest first, at most AF_MAX entries.

var AF_MAX = 3000;
var AF_EQ_RE = /\b\d{2,3}\.[A-Z]{1,4}\d{2,4}[A-Z0-9]*\b/i;

function afAllowed_(session) {
  return !!session && (maIsAdmin_(session) || (session.roles || []).indexOf("ROLE-MGR") !== -1);
}

function afFrom_(params) {
  var d = new Date(String((params && params.from) || ""));
  if (isNaN(d.getTime())) d = new Date(Date.now() - 31 * 86400000);
  var min = new Date(Date.now() - 366 * 86400000);
  return d < min ? min : d;
}

function afIso_(v) {
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? String(v || "") : d.toISOString();
}

function afEquipment_(text) {
  var m = String(text || "").match(AF_EQ_RE);
  if (!m) return { id: "", contractor: "" };
  var id = m[0].toUpperCase();
  var p = pePlatform_(id);
  return { id: id, contractor: p ? String(p.contractor || "") : "" };
}

function handleGetActivityFeed(session, params) {
  if (!afAllowed_(session)) return { status: "error", error: "Activity is for the App Owner and ACC managers.", accessDenied: true };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var from = afFrom_(params).toISOString();
  // contractor of an action / route by its ID
  var owner = {};
  [SHEET_VACTIONS, SHEET_VROUTES].forEach(function (name) {
    try {
      vlRead_(ss, name).rows.forEach(function (r) {
        var id = r["Action ID"] || r["Route ID"];
        if (id) owner[id] = { contractor: String(r["Contractor"] || ""), equipment: String(r["Equipment ID"] || "") };
      });
    } catch (e) {}
  });
  var rows = vlRead_(ss, SHEET_VAUDIT).rows;
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < AF_MAX; i--) {
    var r = rows[i];
    var at = afIso_(r["When"]);
    if (at < from) break;
    var record = String(r["Record"] || "");
    var details = String(r["Details"] || "");
    var known = owner[record] || {};
    var eq = afEquipment_(record + " " + (known.equipment || "") + " " + details);
    var vl = record.match(/^VL-\d{4}-\d{2}-([A-Z]+)-/);
    out.push({
      at: at, by: String(r["Who"] || ""), area: "", record: record, change: String(r["Action"] || ""), details: details,
      contractor: known.contractor || (vl ? vl[1] : "") || eq.contractor, equipment: known.equipment || eq.id,
    });
  }
  return { status: "ok", module: "vib", from: from, entries: out, truncated: out.length >= AF_MAX };
}

// Platform Activity page (step 4): this module's Audit Log for the shell,
// which merges it with Vibration's and the platform's own logs.
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

// The Equipment ID named in a record or text, and its contractor on the platform.
function afEquipment_(text) {
  var m = String(text || "").match(AF_EQ_RE);
  if (!m) return { id: "", contractor: "" };
  var id = m[0].toUpperCase();
  var p = pePlatform_(id);
  return { id: id, contractor: p ? String(p.contractor || "") : "" };
}

function handleGetActivityFeed(session, params) {
  if (!afAllowed_(session)) return { error: "Activity is for the App Owner and ACC managers.", accessDenied: true };
  var from = afFrom_(params).toISOString();
  var rows = readSheet(SpreadsheetApp.getActiveSpreadsheet(), "Audit Log", true);
  var lpMap = {};
  try { lpMap = getLpContractorMap_(); } catch (e) {}
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < AF_MAX; i--) {
    var r = rows[i];
    var at = afIso_(r[0]);
    if (at < from) break; // appended in time order
    var record = String(r[2] || "");
    var eq = afEquipment_(record + " " + String(r[6] || ""));
    out.push({
      at: at, by: String(r[4] || ""), area: String(r[1] || ""), record: record, change: String(r[3] || ""),
      details: String(r[6] || ""), contractor: String(r[5] || "") || lpMap[record] || eq.contractor, equipment: eq.id,
    });
  }
  return { status: "ok", module: "oil", from: from, entries: out, truncated: out.length >= AF_MAX };
}

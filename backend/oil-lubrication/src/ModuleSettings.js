// Settings → Oil Lubrication (module settings, redesigned): one call that
// fills the page, and one save per card. Who may open / change it comes from
// Settings → Settings access ("oil-analysis": View, or Edit — "Edit ·
// responsible" = Edit for this module's ACC responsible engineer).
//
//   getModuleSettings                → status, email summary, phrases, targets,
//                                      last change per card, canEdit
//   saveModuleSettings card=intervals changes: [{ lpId, interval, oilChangeInterval }]
//                      card=lists     phrases: [..]   (replaces OL_ACTION_PHRASES)
//                      card=targets   routes, samples, actions (%)
// Every save goes to the Audit Log (→ Activity) and stamps "last changed by".

var MS_PAGE = "oil-analysis";
var MS_STAMP_PROP = "MS_CHANGED_";
var DASH_SAMPLES_TARGET_PROP = "DASH_SAMPLES_TARGET";
var DASH_ACTIONS_TARGET_PROP = "DASH_ACTIONS_TARGET";
var DASH_ACTIONS_TARGET_DEFAULT = 80;

function msCanEdit_(session) {
  return !!session && (maIsAdmin_(session) || psaLevel_(session, MS_PAGE) === "Edit");
}

function msStamp_(card, by) {
  try { PropertiesService.getScriptProperties().setProperty(MS_STAMP_PROP + card, JSON.stringify({ by: by || "", at: new Date().toISOString() })); } catch (e) {}
}

function msStamps_(cards) {
  var out = {};
  var props = PropertiesService.getScriptProperties();
  cards.forEach(function (c) {
    try { var v = props.getProperty(MS_STAMP_PROP + c); if (v) out[c] = JSON.parse(v); } catch (e) {}
  });
  return out;
}

// The platform's email switch for this module (Platform Core EMAIL_SETTINGS).
function msEmail_() {
  var out = { connected: false, enabled: false, sender: false, on: 0 };
  var id = "";
  try { id = PropertiesService.getScriptProperties().getProperty("PLATFORM_CORE_SPREADSHEET_ID") || ""; } catch (e) {}
  if (!id) return out;
  var cached = peCacheGet_("pe|email|" + id);
  if (cached) return cached;
  try {
    var sh = SpreadsheetApp.openById(id).getSheetByName("EMAIL_SETTINGS");
    out.connected = true;
    if (sh) sh.getDataRange().getValues().slice(1).forEach(function (r) {
      var k = String(r[0] || "").trim(), v = String(r[1] === undefined ? "" : r[1]).trim();
      if (k === "enabled") out.enabled = v.toUpperCase() === "TRUE";
      else if (k === "senderEmail") out.sender = !!v;
      else if (k.indexOf("event:" + MS_PAGE + ":") === 0 && v) out.on++;
    });
    peCachePut_("pe|email|" + id, out, PE_TTL);
  } catch (e) {}
  return out;
}

// The platform list and the last ID check (ID Check tab), without running it.
function msStatus_() {
  var m = peMaster_();
  var out = { connected: !!m.connected, platformCount: m.count || 0, error: m.error || "", checkedAt: "", open: 0 };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ID Check");
    if (sheet) sheet.getDataRange().getValues().slice(1).forEach(function (r) {
      var last = r[6] instanceof Date ? r[6].toISOString() : String(r[6] || "");
      if (last > out.checkedAt) out.checkedAt = last;
      if (String(r[7]) === "Open") out.open++;
    });
  } catch (e) {}
  return out;
}

function msTargets_() {
  var props = PropertiesService.getScriptProperties();
  var n = function (prop, d) { var raw = props.getProperty(prop); var v = Number(raw); return raw !== null && v >= 50 && v <= 100 ? v : d; };
  return {
    routes: getDashboardSettings_().onTimeTarget,
    samples: n(DASH_SAMPLES_TARGET_PROP, getDashboardSettings_().onTimeTarget),
    actions: n(DASH_ACTIONS_TARGET_PROP, DASH_ACTIONS_TARGET_DEFAULT),
  };
}

function handleGetModuleSettings(session) {
  return {
    status: "ok",
    canEdit: msCanEdit_(session),
    module: msStatus_(),
    email: msEmail_(),
    phrases: readActionRegistry().actions,
    targets: msTargets_(),
    changed: msStamps_(["intervals", "lists", "targets"]),
  };
}

// Sampling interval: months ("6", "0.5"), "2 Y", Monthly / Weekly / Daily,
// "Oil analysis", "If needed" or blank. Oil change: "2 Y", months, "As needed" or blank.
function msIntervalProblem_(kind, v) {
  var t = String(v || "").trim();
  if (!t) return "";
  var low = t.toLowerCase();
  if (kind === "interval") {
    if (low === "if needed" || intervalMonthsForSampling_(t) !== null) return "";
    return '"' + t + '" is not a sampling interval (months, e.g. 6 or 2 Y, Monthly, If needed).';
  }
  if (low === "as needed" || low === "if needed" || intervalMonthsForOilChange_(t) !== null) return "";
  return '"' + t + '" is not an oil change interval (e.g. 2 Y, 6 months as 6, As needed).';
}

function handleSaveModuleSettings(data, session) {
  if (!msCanEdit_(session)) return { status: "error", error: "You can view these settings but not change them.", accessDenied: true };
  var by = (session && session.email) || "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var card = String(data.card || "");

  if (card === "intervals") {
    var changes = data.changes || [];
    if (typeof changes === "string") changes = JSON.parse(changes);
    var bad = [];
    changes.forEach(function (c) {
      ["interval", "oilChangeInterval"].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(c, k)) { var p = msIntervalProblem_(k, c[k]); if (p) bad.push(c.lpId + ": " + p); }
      });
    });
    if (bad.length) return { status: "error", error: bad.join(" ") };
    var sheet = ss.getSheetByName("Equipment Registry");
    var values = sheet.getDataRange().getValues();
    var rowOf = {};
    for (var i = 2; i < values.length; i++) rowOf[String(values[i][0]).trim().toUpperCase()] = i;
    var now = new Date();
    var saved = 0, missing = [];
    changes.forEach(function (c) {
      var i2 = rowOf[String(c.lpId || "").trim().toUpperCase()];
      if (i2 === undefined) { missing.push(c.lpId); return; }
      var r = values[i2];
      var before = [String(r[15] || ""), String(r[16] || "")];
      var after = [
        Object.prototype.hasOwnProperty.call(c, "interval") ? String(c.interval || "").trim() : before[0],
        Object.prototype.hasOwnProperty.call(c, "oilChangeInterval") ? String(c.oilChangeInterval || "").trim() : before[1],
      ];
      if (after[0] === before[0] && after[1] === before[1]) return;
      sheet.getRange(i2 + 1, 16, 1, 2).setValues([after]);
      sheet.getRange(i2 + 1, 21).setValue(now);
      saved++;
      recordAudit_(ss, "Equipment Registry", c.lpId, "update", by, String(r[17] || ""),
        "Intervals: sampling " + (before[0] || "—") + " → " + (after[0] || "—") + ", oil change " + (before[1] || "—") + " → " + (after[1] || "—"));
    });
    if (missing.length) return { status: "error", error: "Not in the Equipment Registry: " + missing.join(", ") };
    if (saved) {
      msStamp_("intervals", by);
      try { invalidateLpContractorMap_(); } catch (e) {}
      try { invalidateDashboardCache(); } catch (e) {}
      try { rcBump_(); } catch (e) {}
    }
    return { status: "ok", saved: saved, settings: handleGetModuleSettings(session) };
  }

  if (card === "lists") {
    var phrases = data.phrases || [];
    if (typeof phrases === "string") phrases = JSON.parse(phrases);
    var seen = {};
    phrases = phrases.map(function (p) { return String(p || "").trim(); }).filter(function (p) {
      var k = p.toLowerCase();
      if (!p || seen[k]) return false;
      seen[k] = true;
      return true;
    });
    var before2 = readActionRegistry().actions;
    var sh = ss.getSheetByName("OL_ACTION_PHRASES") || ss.insertSheet("OL_ACTION_PHRASES");
    var last = sh.getLastRow();
    if (last < 1) sh.getRange(1, 1, 1, 2).setValues([["No", "Actions Phrase"]]);
    if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
    if (phrases.length) sh.getRange(2, 1, phrases.length, 2).setValues(phrases.map(function (p, j) { return [j + 1, p]; }));
    var added = phrases.filter(function (p) { return before2.indexOf(p) === -1; });
    var removed = before2.filter(function (p) { return phrases.indexOf(p) === -1; });
    if (added.length || removed.length) {
      recordAudit_(ss, "OL_ACTION_PHRASES", "Action phrases", "update", by, "",
        (added.length ? "Added: " + added.join(", ") : "") + (added.length && removed.length ? "; " : "") + (removed.length ? "Removed: " + removed.join(", ") : ""));
      msStamp_("lists", by);
      try { rcBump_(); } catch (e) {}
    }
    return { status: "ok", settings: handleGetModuleSettings(session) };
  }

  if (card === "targets") {
    var t = { routes: Number(data.routes), samples: Number(data.samples), actions: Number(data.actions) };
    var badT = Object.keys(t).filter(function (k) { return !(t[k] >= 50 && t[k] <= 100); });
    if (badT.length) return { status: "error", error: "Targets must be numbers from 50 to 100." };
    var b = msTargets_();
    var props = PropertiesService.getScriptProperties();
    props.setProperty(DASH_ON_TIME_TARGET_PROP, String(Math.round(t.routes)));
    props.setProperty(DASH_SAMPLES_TARGET_PROP, String(Math.round(t.samples)));
    props.setProperty(DASH_ACTIONS_TARGET_PROP, String(Math.round(t.actions)));
    var diff = Object.keys(t).filter(function (k) { return Math.round(t[k]) !== b[k]; })
      .map(function (k) { return k + " " + b[k] + " → " + Math.round(t[k]) + " %"; });
    if (diff.length) {
      recordAudit_(ss, "Dashboard Settings", "Targets", "update", by, "", "Targets: " + diff.join(", "));
      msStamp_("targets", by);
      try { invalidateDashboardCache(); } catch (e) {}
      try { rcBump_(); } catch (e) {}
    }
    return { status: "ok", settings: handleGetModuleSettings(session) };
  }

  return { status: "error", error: "Unknown settings card: " + card };
}

// ─── Email gate ──────────────────────────────────────────────────────────────
// Every email this module sends goes through msSendMail_: nothing is sent
// unless Settings → Email & notifications (Platform Core EMAIL_SETTINGS) has a
// platform sender and "Send emails" switched on. Not connected = nothing sent.
// (Read through the 10-minute platform cache, so switching on/off takes up to
// 10 minutes to reach this module.)
function msMailAllowed_() {
  var e = msEmail_();
  return !!(e.enabled && e.sender);
}

function msSendMail_(payload) {
  if (!msMailAllowed_()) return false;
  MailApp.sendEmail(payload);
  return true;
}

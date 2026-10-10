// Settings → Vibration Analysis (module settings, redesigned): one call that
// fills the page, one save per card. Who may open / change it comes from
// Settings → Settings access ("vibration-analysis": View, or Edit — "Edit ·
// responsible" = Edit for this module's ACC responsible engineer).
//
//   getModuleSettings                → status, email summary, defaults + limits
//                                      summary, phrases, targets, last change, canEdit
//   saveModuleSettings card=intervals interval, grace, reportDue (days), notRead (months)
//                      card=lists     phrases: [..]   (VA_ACTION_PHRASES tab)
//                      card=targets   measured, reports, actions (%)
// Every save goes to the Vibration Audit tab (→ Activity) and stamps
// "last changed by". Per-machine limits and intervals stay on Limits & intervals.

var MS_PAGE = "vibration-analysis";
var MS_STAMP_PROP = "MS_CHANGED_";
var VS_PHRASES_SHEET = "VA_ACTION_PHRASES";
var VS_DEFAULTS = { VS_DEFAULT_INTERVAL: 30, VS_GRACE_DAYS: 7, VS_REPORT_DUE_DAYS: 45, VS_NOT_READ_MONTHS: 6 };
// Dashboard / Reports: a machine with no report in this many months counts as "Not read"
var VL_NOT_READ_MONTHS = 6;
var VS_TARGET_DEFAULTS = { VS_TARGET_MEASURED: 95, VS_TARGET_REPORTS: 100, VS_TARGET_ACTIONS: 80 };

// Run at the start of every request (Code.js): the defaults the rest of the
// backend reads as VL_DEFAULT_INTERVAL / VL_GRACE_DAYS / VL_DUE_DAYS.
function vsApplySettings_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var n = function (k) { var v = Number(props.getProperty(k)); return v > 0 ? Math.round(v) : VS_DEFAULTS[k]; };
    VL_DEFAULT_INTERVAL = n("VS_DEFAULT_INTERVAL");
    VL_GRACE_DAYS = n("VS_GRACE_DAYS");
    VL_DUE_DAYS = n("VS_REPORT_DUE_DAYS");
    VL_NOT_READ_MONTHS = Math.min(12, n("VS_NOT_READ_MONTHS"));
  } catch (e) {}
}

function vsTargets_() {
  var props = PropertiesService.getScriptProperties();
  var n = function (k) { var raw = props.getProperty(k); var v = Number(raw); return raw !== null && v >= 50 && v <= 100 ? v : VS_TARGET_DEFAULTS[k]; };
  return { measured: n("VS_TARGET_MEASURED"), reports: n("VS_TARGET_REPORTS"), actions: n("VS_TARGET_ACTIONS") };
}

function vsPhrases_(ss) {
  var sh = ss.getSheetByName(VS_PHRASES_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0] || "").trim(); }).filter(String);
}

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

// The register limits most machines use, and how many machines differ.
function vsLimitsSummary_(ss) {
  var mode = function (rows, keys) {
    var count = {}, best = "", bestN = 0;
    rows.forEach(function (r) {
      var v = keys.map(function (k) { return r[k]; });
      if (v.some(function (x) { return x === "" || x === null || x === undefined; })) return;
      var key = v.join(" / ");
      count[key] = (count[key] || 0) + 1;
      if (count[key] > bestN) { best = key; bestN = count[key]; }
    });
    return best;
  };
  var out = { rms: "", spm: "", ownLimits: 0, ownInterval: 0, notRunning: 0 };
  try { out.rms = mode(vlRead_(ss, SHEET_RMS_REG).rows, ["RMS Good", "RMS Acceptable", "RMS Alarm"]); } catch (e) {}
  try { out.spm = mode(vlRead_(ss, SHEET_SPM_REG).rows, ["SPM Normal", "SPM Caution", "SPM Alarm"]); } catch (e) {}
  try {
    var a = lmActive_(ss);
    var own = {};
    Object.keys(a.family).forEach(function (eq) { own[eq] = true; });
    Object.keys(a.vib).forEach(function (v) { var m = String(v).match(/^Vb-(.+?)-/i); own[m ? m[1] : v] = true; });
    out.ownLimits = Object.keys(own).length;
    Object.keys(a.settings).forEach(function (eq) {
      var st = a.settings[eq];
      if (st.interval) out.ownInterval++;
      if (String(st.status) === "Inactive") out.notRunning++;
    });
  } catch (e) {}
  return out;
}

function handleGetModuleSettings(session) {
  vsApplySettings_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    status: "ok",
    canEdit: msCanEdit_(session),
    module: msStatus_(),
    email: msEmail_(),
    intervals: { interval: VL_DEFAULT_INTERVAL, grace: VL_GRACE_DAYS, reportDue: VL_DUE_DAYS, notRead: VL_NOT_READ_MONTHS },
    limits: vsLimitsSummary_(ss),
    phrases: vsPhrases_(ss),
    targets: vsTargets_(),
    changed: msStamps_(["intervals", "lists", "targets"]),
  };
}

function handleSaveModuleSettings(params, session) {
  if (!msCanEdit_(session)) return { status: "error", error: "You can view these settings but not change them.", accessDenied: true };
  vsApplySettings_();
  var by = (session && session.email) || "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var card = String(params.card || "");

  if (card === "intervals") {
    var v = { interval: Number(params.interval), grace: Number(params.grace), reportDue: Number(params.reportDue),
      notRead: params.notRead === undefined || params.notRead === "" ? VL_NOT_READ_MONTHS : Number(params.notRead) };
    if (!(v.interval >= 1 && v.interval <= 366) || !(v.grace >= 0 && v.grace <= 60) || !(v.reportDue >= 1 && v.reportDue <= 366) || !(v.notRead >= 1 && v.notRead <= 12)) {
      return { status: "error", error: "Measure every 1–366 days, grace 0–60 days, report due 1–366 days, \"Not read\" after 1–12 months." };
    }
    var before = { interval: VL_DEFAULT_INTERVAL, grace: VL_GRACE_DAYS, reportDue: VL_DUE_DAYS, notRead: VL_NOT_READ_MONTHS };
    props.setProperty("VS_DEFAULT_INTERVAL", String(Math.round(v.interval)));
    props.setProperty("VS_GRACE_DAYS", String(Math.round(v.grace)));
    props.setProperty("VS_REPORT_DUE_DAYS", String(Math.round(v.reportDue)));
    props.setProperty("VS_NOT_READ_MONTHS", String(Math.round(v.notRead)));
    var names = { interval: "measure every", grace: "grace", reportDue: "report due", notRead: "\"Not read\" after" };
    var diff = Object.keys(v).filter(function (k) { return Math.round(v[k]) !== before[k]; })
      .map(function (k) { return names[k] + " " + before[k] + " → " + Math.round(v[k]) + (k === "notRead" ? " months" : " days"); });
    if (diff.length) { vlAudit_(ss, by, "Settings", "Intervals", diff.join(", ")); msStamp_("intervals", by); }
    return { status: "ok", settings: handleGetModuleSettings(session) };
  }

  if (card === "lists") {
    var phrases = params.phrases || [];
    if (typeof phrases === "string") phrases = JSON.parse(phrases);
    var seen = {};
    phrases = phrases.map(function (p) { return String(p || "").trim(); }).filter(function (p) {
      var k = p.toLowerCase();
      if (!p || seen[k]) return false;
      seen[k] = true;
      return true;
    });
    var before2 = vsPhrases_(ss);
    var sh = ss.getSheetByName(VS_PHRASES_SHEET);
    if (!sh) { sh = ss.insertSheet(VS_PHRASES_SHEET); sh.getRange(1, 1, 1, 2).setValues([["No", "Action phrase"]]); }
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
    if (phrases.length) sh.getRange(2, 1, phrases.length, 2).setValues(phrases.map(function (p, j) { return [j + 1, p]; }));
    var added = phrases.filter(function (p) { return before2.indexOf(p) === -1; });
    var removed = before2.filter(function (p) { return phrases.indexOf(p) === -1; });
    if (added.length || removed.length) {
      vlAudit_(ss, by, "Settings", "Action phrases",
        (added.length ? "Added: " + added.join(", ") : "") + (added.length && removed.length ? "; " : "") + (removed.length ? "Removed: " + removed.join(", ") : ""));
      msStamp_("lists", by);
    }
    return { status: "ok", settings: handleGetModuleSettings(session) };
  }

  if (card === "targets") {
    var t = { measured: Number(params.measured), reports: Number(params.reports), actions: Number(params.actions) };
    if (Object.keys(t).some(function (k) { return !(t[k] >= 50 && t[k] <= 100); })) return { status: "error", error: "Targets must be numbers from 50 to 100." };
    var b = vsTargets_();
    props.setProperty("VS_TARGET_MEASURED", String(Math.round(t.measured)));
    props.setProperty("VS_TARGET_REPORTS", String(Math.round(t.reports)));
    props.setProperty("VS_TARGET_ACTIONS", String(Math.round(t.actions)));
    var d2 = Object.keys(t).filter(function (k) { return Math.round(t[k]) !== b[k]; })
      .map(function (k) { return k + " " + b[k] + " → " + Math.round(t[k]) + " %"; });
    if (d2.length) { vlAudit_(ss, by, "Settings", "Targets", d2.join(", ")); msStamp_("targets", by); }
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

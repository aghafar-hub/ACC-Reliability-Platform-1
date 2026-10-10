// ─── Platform equipment list + ID check ─────────────────────────────────────
// Equipment IDs are owned by the platform (Platform Core's EQUIPMENT_MASTER);
// this module owns its Vib IDs. Every Equipment ID here must be a copy of one
// in the platform list, and the platform's name, area (Main_Area → Line 1,
// Line 2, CM#1, CM#2) and contractor are the ones used (readVibRegistry and
// vlMasterData_ apply them).
//
// The platform sheet is read directly (same Google account): set the script
// property PLATFORM_CORE_SPREADSHEET_ID to the Platform Core sheet's ID. With
// no property the module works as before and the check says "not connected".
//
// ID check (Settings → Equipment & IDs, App Owner only): what doesn't match —
// Equipment IDs (registers, VIB ID Registry, readings, actions, history)
// missing from the platform list, retired machines still in use, Vib IDs with
// no / wrong Equipment ID, duplicates, register machines with no Vib ID and
// the reverse, report entries whose Vib ID isn't in the registry, a
// contractor column that differs from the platform.
// Results are kept in the "ID Check" tab; "Mark OK" there silences one.
// A daily run (installIdCheck → idCheckDaily) tells the App Owner about new
// problems: bell + email.

var PE_TTL = 600;
var PE_CHUNK = 90000;
var PE_MEMO = null;
var PE_CHECK_SHEET = "ID Check";
var PE_CHECK_HEADERS = ["Key", "Kind", "ID", "Problem", "Detail", "First seen", "Last seen", "Status", "Marked by", "Marked at"];
var PE_MODULE = "Vibration Analysis";

function peKey_(id) {
  return String(id || "").replace(/\s+/g, "").toUpperCase();
}

function peCacheGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var n = parseInt(cache.get(key) || "", 10);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + "#" + i);
    var parts = cache.getAll(keys);
    var b64 = "";
    for (var j = 0; j < n; j++) {
      if (parts[keys[j]] == null) return null;
      b64 += parts[keys[j]];
    }
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), "application/x-gzip")).getDataAsString());
  } catch (e) {
    return null;
  }
}

function peCachePut_(key, value, ttl) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(value), "application/json")).getBytes());
    var n = Math.ceil(b64.length / PE_CHUNK);
    if (n > 40) return;
    var parts = {};
    for (var i = 0; i < n; i++) parts[key + "#" + i] = b64.slice(i * PE_CHUNK, (i + 1) * PE_CHUNK);
    var cache = CacheService.getScriptCache();
    cache.putAll(parts, ttl);
    cache.put(key, String(n), ttl);
  } catch (e) {}
}

// { connected, error, byKey: { KEY: { id, name, mainArea, plantArea, subArea, contractor, status } }, count }
function peMaster_() {
  if (PE_MEMO) return PE_MEMO;
  var id = "";
  try { id = PropertiesService.getScriptProperties().getProperty("PLATFORM_CORE_SPREADSHEET_ID") || ""; } catch (e) {}
  if (!id) return (PE_MEMO = { connected: false, error: "PLATFORM_CORE_SPREADSHEET_ID is not set", byKey: {}, count: 0 });
  var cached = peCacheGet_("pe|master|" + id);
  if (cached) return (PE_MEMO = cached);
  try {
    var ss = SpreadsheetApp.openById(id);
    var orgs = {};
    var orgSheet = ss.getSheetByName("ORG_MASTER");
    if (orgSheet) orgSheet.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) orgs[String(r[0]).trim()] = String(r[1] || r[0]).trim(); });
    var sheet = ss.getSheetByName("EQUIPMENT_MASTER");
    if (!sheet) throw new Error("EQUIPMENT_MASTER tab not found in the Platform Core sheet");
    var values = sheet.getDataRange().getValues();
    var h = -1;
    for (var i = 0; i < Math.min(values.length, 5); i++) if (String(values[i][0]).trim() === "Equipment_ID") { h = i; break; }
    if (h === -1) throw new Error("EQUIPMENT_MASTER has no Equipment_ID header row");
    var col = {};
    values[h].forEach(function (k, c) { col[String(k).trim()] = c; });
    var get = function (r, k) { return col[k] === undefined ? "" : String(r[col[k]] || "").trim(); };
    var byKey = {};
    var n = 0;
    var latest = "";
    for (var r = h + 1; r < values.length; r++) {
      var eid = get(values[r], "Equipment_ID");
      if (!eid) continue;
      var org = get(values[r], "Contractor");
      byKey[peKey_(eid)] = {
        id: eid, name: get(values[r], "Equipment_Description"), mainArea: get(values[r], "Main_Area"), plantArea: get(values[r], "Plant_Area"),
        subArea: get(values[r], "Sub_Area"), contractor: orgs[org] || org.replace(/^ORG-/, ""), status: get(values[r], "Equipment_Status") || "Active",
      };
      n++;
      var mod = col.Modified_Date === undefined ? "" : values[r][col.Modified_Date];
      mod = mod instanceof Date ? mod.toISOString() : String(mod || "");
      if (mod > latest) latest = mod;
    }
    // sig: changes whenever the list does — part of the read-cache keys
    PE_MEMO = { connected: true, error: "", byKey: byKey, count: n, sig: n + "@" + latest };
    peCachePut_("pe|master|" + id, PE_MEMO, PE_TTL);
    return PE_MEMO;
  } catch (e) {
    return (PE_MEMO = { connected: false, error: String(e.message || e), byKey: {}, count: 0 });
  }
}

// A short stamp of the platform list for cache keys ("" when not connected).
function peSig_() {
  var m = peMaster_();
  return m.connected ? m.sig || String(m.count) : "";
}

// The platform's record for one Equipment ID (null when not listed / not connected).
function pePlatform_(equipmentId) {
  var m = peMaster_();
  return (m.connected && m.byKey[peKey_(equipmentId)]) || null;
}

// "" when a Vib ID / register row may use this Equipment ID, else why not.
function peEquipmentIdProblem_(equipmentId) {
  var m = peMaster_();
  if (!m.connected) return "";
  var id = String(equipmentId || "").trim();
  if (!id) return "Pick an Equipment ID from the platform list.";
  var p = m.byKey[peKey_(id)];
  if (!p) return id + " is not in the platform equipment list. Ask the App Owner to add it first.";
  if (/retired/i.test(p.status)) return id + " is retired on the platform.";
  return "";
}

// ─── Vibration: the platform's contractor and area on every Vib ID ──────────
function peApplyToPoints_(points) {
  var m = peMaster_();
  if (!m.connected) return points;
  points.forEach(function (p) {
    var x = m.byKey[peKey_(p["Equipment ID"])];
    if (!x) return;
    if (x.contractor) p["Contractor"] = x.contractor;
    p["Area"] = vlAreaOf_(x.mainArea) || p["Area"];
  });
  return points;
}

// …and the name, contractor and area on every machine (vlMasterData_).
function peApplyToMachines_(eq) {
  var m = peMaster_();
  if (!m.connected) return;
  Object.keys(eq).forEach(function (id) {
    var x = m.byKey[peKey_(id)];
    if (!x) return;
    eq[id].name = x.name || eq[id].name;
    if (x.contractor) eq[id].contractor = x.contractor;
    eq[id].area = vlAreaOf_(x.mainArea) || eq[id].area;
    eq[id].platformStatus = x.status;
  });
}

// ─── the check ───────────────────────────────────────────────────────────────
function peCollect_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = peMaster_();
  var problems = [];
  var add = function (kind, id, title, detail, severity) {
    problems.push({ key: kind + "|" + peKey_(id), kind: kind, id: id, title: title, detail: detail || "", severity: severity || "high", module: PE_MODULE });
  };
  // where each Equipment ID is used: { KEY: { id, where: { label: n } } }
  var used = {};
  var use = function (id, label) {
    id = String(id || "").trim();
    if (!id) return;
    var k = peKey_(id);
    if (!used[k]) used[k] = { id: id, where: {} };
    used[k].where[label] = (used[k].where[label] || 0) + 1;
  };
  var inReg = {};
  readSheet(ss, SHEET_RMS_REG).forEach(function (r) { use(r["Equipment ID"], "RMS Register"); inReg[peKey_(r["Equipment ID"])] = true; });
  readSheet(ss, SHEET_SPM_REG).forEach(function (r) { use(r["Equipment ID"], "SPM Register"); inReg[peKey_(r["Equipment ID"])] = true; });
  // VIB ID Registry, as typed in the sheet (not with the platform's values)
  var vsh = ss.getSheetByName(SHEET_VIB_REGISTRY);
  var vrows = [];
  if (vsh && vsh.getLastRow() >= dataStartRowFor(SHEET_VIB_REGISTRY)) {
    vrows = vsh.getRange(dataStartRowFor(SHEET_VIB_REGISTRY), 1, vsh.getLastRow() - dataStartRowFor(SHEET_VIB_REGISTRY) + 1, Math.max(vsh.getLastColumn(), 9)).getValues();
  }
  var vibCount = {};
  var withVib = {};
  var ids = [];
  vrows.forEach(function (r) {
    var vib = String(r[0] || "").trim();
    var eq = String(r[1] || "").trim();
    if (!vib && !eq) return;
    if (!vib) return;
    var k = peKey_(vib);
    vibCount[k] = (vibCount[k] || 0) + 1;
    var p = eq ? m.byKey[peKey_(eq)] : null;
    ids.push({ vibId: vib, equipmentId: eq, point: String(r[4] || r[2] || "").trim(), family: String(r[3] || "").trim(), contractor: (p && p.contractor) || String(r[6] || "").trim(), status: String(r[7] || "").trim() || "Active", inPlatform: !!p });
    if (!eq) { add("noEquipmentId", vib, "Vib ID has no Equipment ID", "VIB ID Registry row for " + vib, "high"); return; }
    use(eq, "VIB ID Registry");
    withVib[peKey_(eq)] = true;
    if (k.indexOf(peKey_(eq)) === -1) add("idMismatch", vib, "Vib ID does not match its Equipment ID", vib + " is listed under " + eq, "medium");
    var raw = String(r[6] || "").trim();
    if (p && p.contractor && raw && raw.toUpperCase() !== String(p.contractor).toUpperCase()) {
      add("contractorDiffers", vib, "Contractor differs from the platform", "VIB ID Registry says " + raw + ", platform says " + p.contractor + " (the platform's is used)", "low");
    }
  });
  Object.keys(vibCount).forEach(function (k) { if (vibCount[k] > 1) add("duplicate", k, "Vib ID listed more than once", vibCount[k] + " rows in the VIB ID Registry", "high"); });
  Object.keys(inReg).forEach(function (k) { if (k && !withVib[k]) add("registerNoVibId", used[k] ? used[k].id : k, "Machine in the RMS / SPM register has no Vib ID", "Add its points to the VIB ID Registry", "medium"); });
  Object.keys(withVib).forEach(function (k) { if (!inReg[k]) add("vibIdNoRegister", used[k] ? used[k].id : k, "Vib IDs for a machine missing from the RMS / SPM register", "Add the machine to the register (limits)", "medium"); });
  // readings, actions and history by Equipment ID
  readSheet(ss, SHEET_RMS).forEach(function (r) { use(r["Equipment ID"], "RMS readings"); });
  readSheet(ss, SHEET_SPM).forEach(function (r) { use(r["Equipment ID"], "SPM readings"); });
  vlReadSheet_(ss, SHEET_VACTIONS).rows.forEach(function (r) { use(r["Equipment ID"], "actions"); });
  vlReadSheet_(ss, SHEET_VHIST).rows.forEach(function (r) { use(r["Equipment ID"], "measurement history"); });
  if (m.connected) {
    Object.keys(used).forEach(function (k) {
      var u = used[k];
      var p = m.byKey[k];
      var where = Object.keys(u.where).map(function (x) { return x + (u.where[x] > 1 ? " (" + u.where[x] + ")" : ""); }).join(", ");
      if (!p) add("notInPlatform", u.id, "Equipment ID not in the platform list", "Used in " + where, "high");
      else if (/retired/i.test(p.status) && withVib[k]) add("retired", u.id, "Machine retired on the platform but still has Vib IDs", "Used in " + where, "medium");
    });
  }
  // report entries whose Vib ID isn't in the registry
  var orphan = {};
  vlReadSheet_(ss, SHEET_VENTRIES).rows.forEach(function (r) {
    var v = String(r["VIB ID"] || "").trim();
    if (!v || vibCount[peKey_(v)]) return;
    if (!orphan[peKey_(v)]) orphan[peKey_(v)] = { id: v, n: 0 };
    orphan[peKey_(v)].n++;
  });
  Object.keys(orphan).forEach(function (k) { add("orphanRecords", orphan[k].id, "Report entries use a Vib ID that is not in the registry", orphan[k].n + " entries in the Vibration Log", "high"); });
  return { ids: ids, problems: problems };
}

function peBell_(ss, email, message) {
  vnAdd_(ss, [email], "idcheck", message, "", "idcheck", "", null);
}

// ─── shared: run, remember, notify ───────────────────────────────────────────
function peOwnerEmail_() {
  var p = "";
  try { p = PropertiesService.getScriptProperties().getProperty("ID_CHECK_EMAIL") || ""; } catch (e) {}
  if (p) return p;
  try { return Session.getEffectiveUser().getEmail() || ""; } catch (e) { return ""; }
}

function peCheckSheet_(ss) {
  var sheet = ss.getSheetByName(PE_CHECK_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PE_CHECK_SHEET);
    sheet.getRange(1, 1, 1, PE_CHECK_HEADERS.length).setValues([PE_CHECK_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Runs the check, keeps the "ID Check" tab up to date and returns
// { result, fresh: [problems seen for the first time] }.
function peRun_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = peMaster_();
  var c = peCollect_();
  var now = new Date();
  var sheet = peCheckSheet_(ss);
  var values = sheet.getDataRange().getValues();
  var known = {};
  for (var i = 1; i < values.length; i++) if (values[i][0]) known[String(values[i][0])] = { row: i + 1, status: String(values[i][7] || "Open"), first: values[i][5] };
  var fresh = [];
  var current = {};
  c.problems.forEach(function (p) {
    current[p.key] = true;
    var k = known[p.key];
    p.status = k ? (k.status === "Fixed" ? "Open" : k.status) : "Open";
    p.firstSeen = k && k.first ? (k.first instanceof Date ? k.first.toISOString() : String(k.first)) : now.toISOString();
    if (!k || k.status === "Fixed") fresh.push(p);
  });
  // rewrite the tab: current problems (keep OK marks) + those now fixed
  var out = c.problems.map(function (p) {
    var k = known[p.key];
    var old = k ? values[k.row - 1] : null;
    return [p.key, p.kind, p.id, p.title, p.detail, k && k.first ? k.first : now, now, p.status, old ? old[8] : "", old ? old[9] : ""];
  });
  Object.keys(known).forEach(function (key) {
    if (current[key]) return;
    var old = values[known[key].row - 1];
    if (String(old[7]) !== "Fixed") { old[7] = "Fixed"; old[6] = now; }
    out.push(old);
  });
  if (values.length > 1) sheet.getRange(2, 1, values.length - 1, PE_CHECK_HEADERS.length).clearContent();
  if (out.length) sheet.getRange(2, 1, out.length, PE_CHECK_HEADERS.length).setValues(out);
  var result = {
    module: PE_MODULE, connected: m.connected, error: m.error, platformCount: m.count, checkedAt: now.toISOString(),
    ids: c.ids, problems: c.problems,
  };
  peCachePut_("pe|check", result, 6 * 3600);
  return { result: result, fresh: fresh.filter(function (p) { return p.status !== "OK"; }) };
}

/** App Owner: the last check (or a new one with fresh=1). */
function handleGetIdCheck(params) {
  if (String((params && params.fresh) || "") !== "1") {
    var cached = peCacheGet_("pe|check");
    if (cached) return cached;
  } else {
    peForget_(); // "Check now": read the platform list again too
  }
  return peRun_().result;
}

// Drop the kept copy of the platform list (it is read again next time).
function peForget_() {
  PE_MEMO = null;
  try {
    var id = PropertiesService.getScriptProperties().getProperty("PLATFORM_CORE_SPREADSHEET_ID") || "";
    var cache = CacheService.getScriptCache();
    var n = parseInt(cache.get("pe|master|" + id) || "0", 10);
    var keys = ["pe|master|" + id];
    for (var i = 0; i < n; i++) keys.push("pe|master|" + id + "#" + i);
    cache.removeAll(keys);
  } catch (e) {}
}

/** App Owner: mark one problem OK (stops notifications) or open it again. */
function handleMarkIdCheck(params, email) {
  var key = String(params.key || "");
  var status = params.status === "Open" ? "Open" : "OK";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = peCheckSheet_(ss);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) !== key) continue;
    sheet.getRange(i + 1, 8, 1, 3).setValues([[status, email || "", new Date()]]);
    try { CacheService.getScriptCache().remove("pe|check"); } catch (e) {}
    return { status: "ok", key: key, marked: status };
  }
  return { status: "error", error: "Not found: " + key };
}

/** Daily (installIdCheck): tell the App Owner about new problems — bell + email. */
function idCheckDaily() {
  peForget_();
  var run = peRun_();
  var email = peOwnerEmail_();
  if (!run.fresh.length || !email) return { status: "ok", fresh: run.fresh.length };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var n = run.fresh.length;
  var msg = PE_MODULE + ": " + n + " new ID problem" + (n > 1 ? "s" : "") + " — " + run.fresh.slice(0, 3).map(function (p) { return p.id; }).join(", ") + (n > 3 ? "…" : "");
  try { peBell_(ss, email, msg); } catch (e) {}
  try {
    msSendMail_({
      to: email,
      subject: "[ACC Reliability] " + PE_MODULE + ": " + n + " new ID problem" + (n > 1 ? "s" : ""),
      body: run.fresh.map(function (p) { return "• " + p.id + " — " + p.title + (p.detail ? " (" + p.detail + ")" : ""); }).join("\n") +
        "\n\nOpen the ACC Reliability Platform → Settings → Equipment & IDs.",
    }, 'platform:idCheck');
  } catch (e) {}
  return { status: "ok", fresh: n };
}

/** Run once from the Apps Script editor: asks for the new permission and adds the daily check (07:00). */
function installIdCheck() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "idCheckDaily") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("idCheckDaily").timeBased().everyDays(1).atHour(7).create();
  var r = peRun_();
  Logger.log("Platform list: " + (r.result.connected ? r.result.platformCount + " machines" : "NOT connected — " + r.result.error) + " · problems: " + r.result.problems.length);
}


// ─── Settings access (Platform Core's SETTINGS_ACCESS, read here too) ────────
// Same rules as Platform Core SettingsAccess.js (keep both in step): who may
// view / change which Settings page. Used by the "settings:<page>" rules in
// ModuleAccessConfig.js.
var PSA_PAGES = ["appearance", "language", "delegations", "users", "module-access", "settings-access", "equipment-ids", "email", "oil-analysis", "vibration-analysis"];
var PSA_OWNER_ONLY = ["users", "settings-access", "email"];
var PSA_VIEW_MAX = ["equipment-ids"];
var PSA_MODULE_PAGES = ["oil-analysis", "vibration-analysis"];
var PSA_DEFAULTS = {
  "language": { "ROLE-MGR": "View", "ROLE-RENG": "View", "ROLE-CMGR": "View", "ROLE-CENG": "View", "ROLE-TECH": "View", "ROLE-VIEW": "View" },
  "delegations": { "ROLE-MGR": "Edit", "ROLE-RENG": "Edit", "ROLE-CMGR": "Edit", "ROLE-CENG": "Edit" },
  "module-access": { "ROLE-MGR": "View" },
  "equipment-ids": { "ROLE-MGR": "View", "ROLE-RENG": "View" },
  "oil-analysis": { "ROLE-MGR": "View", "ROLE-RENG": "Responsible" },
  "vibration-analysis": { "ROLE-MGR": "View", "ROLE-RENG": "Responsible" },
};
var PSA_MEMO = null;

function psaRank_(l) {
  return { Hidden: 0, View: 1, Responsible: 2, Edit: 3 }[l] || 0;
}
function psaClamp_(page, l) {
  if (PSA_OWNER_ONLY.indexOf(page) !== -1) return "Hidden";
  if (page === "appearance") return "Edit";
  if (PSA_VIEW_MAX.indexOf(page) !== -1 && psaRank_(l) > 1) return "View";
  if (l === "Responsible" && PSA_MODULE_PAGES.indexOf(page) === -1) return "Edit";
  return ["Hidden", "View", "Responsible", "Edit"].indexOf(l) === -1 ? "Hidden" : l;
}

// { matrix: { page: { role: level } }, people: [{ email, page, level }] }
function psaRead_() {
  if (PSA_MEMO) return PSA_MEMO;
  var matrix = {};
  PSA_PAGES.forEach(function (p) { matrix[p] = {}; Object.keys(PSA_DEFAULTS[p] || {}).forEach(function (r) { matrix[p][r] = psaClamp_(p, PSA_DEFAULTS[p][r]); }); });
  var read = { matrix: matrix, people: [] };
  var id = "";
  try { id = PropertiesService.getScriptProperties().getProperty("PLATFORM_CORE_SPREADSHEET_ID") || ""; } catch (e) {}
  if (!id) return (PSA_MEMO = read);
  var cached = peCacheGet_("pe|sa|" + id);
  if (cached) return (PSA_MEMO = cached);
  try {
    var ss = SpreadsheetApp.openById(id);
    var sh = ss.getSheetByName("SETTINGS_ACCESS");
    if (sh) sh.getDataRange().getValues().slice(1).forEach(function (r) {
      var p = String(r[0] || "").trim(), role = String(r[1] || "").trim();
      if (matrix[p] && role) matrix[p][role] = psaClamp_(p, String(r[2] || "").trim());
    });
    var ph = ss.getSheetByName("SETTINGS_ACCESS_PEOPLE");
    if (ph) ph.getDataRange().getValues().slice(1).forEach(function (r) {
      var email = String(r[0] || "").trim().toLowerCase(), p = String(r[1] || "").trim();
      if (email && matrix[p]) read.people.push({ email: email, page: p, level: psaClamp_(p, String(r[2] || "").trim()) });
    });
    peCachePut_("pe|sa|" + id, read, PE_TTL);
  } catch (e) {}
  return (PSA_MEMO = read);
}

// This person's level on a settings page: Hidden · View · Edit ("Responsible"
// resolves to Edit for this module's ACC responsible engineer, else View).
function psaLevel_(session, page) {
  if (!session) return "Hidden";
  var roles = session.roles || [];
  if (roles.indexOf("ROLE-ADMIN") !== -1 || page === "appearance") return "Edit";
  var read = psaRead_();
  var email = String(session.email || "").toLowerCase();
  var best = "Hidden";
  roles.forEach(function (r) { var l = (read.matrix[page] || {})[r]; if (l && psaRank_(l) > psaRank_(best)) best = l; });
  read.people.forEach(function (x) { if (x.email === email && x.page === page) best = x.level; });
  best = psaClamp_(page, best);
  if (best === "Responsible") {
    var mine = page === MA_CONFIG.moduleId ? (maResolve_(session).responsibilities || []) : [];
    best = mine.indexOf(MA_RESP.ACC) !== -1 ? "Edit" : "View";
  }
  return best;
}

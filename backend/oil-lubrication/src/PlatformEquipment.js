// ─── Platform equipment list + ID check ─────────────────────────────────────
// Equipment IDs are owned by the platform (Platform Core's EQUIPMENT_MASTER);
// this module owns its Lub IDs. Every Equipment ID here must be a copy of one
// in the platform list, and the platform's name, area and contractor are the
// ones shown (readEquipmentRegistry / readLpContractorMap_ apply them).
//
// The platform sheet is read directly (same Google account): set the script
// property PLATFORM_CORE_SPREADSHEET_ID to the Platform Core sheet's ID. With
// no property the module works as before and the check says "not connected".
//
// ID check (Settings → Equipment & IDs, App Owner only): what doesn't match —
// Equipment IDs missing from the platform list, retired machines still in
// use, Lub IDs with no / wrong Equipment ID, duplicates, records whose Lub ID
// isn't in the registry, a contractor column that differs from the platform.
// Results are kept in the "ID Check" tab; "Mark OK" there silences one.
// A daily run (installIdCheck → idCheckDaily) tells the App Owner about new
// problems: bell + email.

var PE_TTL = 600;
var PE_CHUNK = 90000;
var PE_MEMO = null;
var PE_CHECK_SHEET = "ID Check";
var PE_CHECK_HEADERS = ["Key", "Kind", "ID", "Problem", "Detail", "First seen", "Last seen", "Status", "Marked by", "Marked at"];
var PE_MODULE = "Oil Lubrication";

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

// "" when a Lub ID may use this Equipment ID, else why not. Not connected → allowed.
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

// ─── Oil: the platform's name, area and contractor on every Lub ID ──────────
function peApplyToRegistry_(equipment) {
  var m = peMaster_();
  if (!m.connected) return equipment;
  equipment.forEach(function (row) {
    var p = m.byKey[peKey_(row.equipmentId)];
    if (!p) return;
    row.equipmentName = p.name;
    row.area = p.plantArea || p.mainArea || row.area;
    row.mainArea = p.mainArea;
    if (p.contractor) row.contractor = canonicalContractor_(p.contractor);
    row.platformStatus = p.status;
  });
  return equipment;
}

// ─── the check ───────────────────────────────────────────────────────────────
function peLpIds_(sheet, col, out, label) {
  if (!sheet) return;
  sheet.getDataRange().getValues().forEach(function (r) {
    var v = String(r[col] || "").trim();
    if (!/^LP-/i.test(v)) return;
    var k = peKey_(v);
    if (!out[k]) out[k] = { id: v, where: {} };
    out[k].where[label] = (out[k].where[label] || 0) + 1;
  });
}

function peCollect_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = peMaster_();
  var problems = [];
  var add = function (kind, id, title, detail, severity) {
    problems.push({ key: kind + "|" + peKey_(id), kind: kind, id: id, title: title, detail: detail || "", severity: severity || "high", module: PE_MODULE });
  };
  var reg = ss.getSheetByName("Equipment Registry");
  var rows = reg ? reg.getDataRange().getValues().slice(2) : [];
  var lub = {};
  var byEq = {};
  var ids = [];
  rows.forEach(function (r) {
    var lp = String(r[0] || "").trim();
    if (!lp) return;
    var eq = String(r[1] || "").trim();
    var k = peKey_(lp);
    lub[k] = (lub[k] || 0) + 1;
    var p = eq ? m.byKey[peKey_(eq)] : null;
    ids.push({ lubId: lp, equipmentId: eq, point: String(r[5] || r[3] || "").trim(), contractor: (p && p.contractor) || canonicalContractor_(r[17]), status: String(r[18] || "").trim() || "Active", inPlatform: !!p });
    if (!eq) {
      add("noEquipmentId", lp, "Lub ID has no Equipment ID", "Equipment Registry row for " + lp, "high");
      return;
    }
    if (!byEq[peKey_(eq)]) byEq[peKey_(eq)] = { id: eq, lub: [] };
    byEq[peKey_(eq)].lub.push(lp);
    if (k.indexOf(peKey_(eq)) === -1) add("idMismatch", lp, "Lub ID does not match its Equipment ID", lp + " is listed under " + eq, "medium");
    if (m.connected && p && p.contractor && canonicalContractor_(r[17]) && canonicalContractor_(r[17]) !== canonicalContractor_(p.contractor)) {
      add("contractorDiffers", lp, "Contractor differs from the platform", "Registry says " + canonicalContractor_(r[17]) + ", platform says " + p.contractor + " (the platform's is used)", "low");
    }
  });
  Object.keys(lub).forEach(function (k) { if (lub[k] > 1) add("duplicate", k, "Lub ID listed more than once", lub[k] + " rows in the Equipment Registry", "high"); });
  if (m.connected) {
    Object.keys(byEq).forEach(function (k) {
      var e = byEq[k];
      var p = m.byKey[k];
      if (!p) add("notInPlatform", e.id, "Equipment ID not in the platform list", e.lub.length + " Lub ID" + (e.lub.length > 1 ? "s" : "") + ": " + e.lub.slice(0, 6).join(", ") + (e.lub.length > 6 ? "…" : ""), "high");
      else if (/retired/i.test(p.status)) add("retired", e.id, "Machine retired on the platform but still has Lub IDs", e.lub.join(", "), "medium");
    });
  }
  // records whose Lub ID isn't in the registry
  var used = {};
  peLpIds_(ss.getSheetByName("Data_Entry"), 0, used, "samples");
  peLpIds_(ss.getSheetByName("Action Tracker"), 1, used, "actions");
  peLpIds_(ss.getSheetByName("Oil Change LOG"), 1, used, "oil changes");
  peLpIds_(ss.getSheetByName("Oil Top Up LOG"), 1, used, "top-ups");
  peLpIds_(ss.getSheetByName("OA_ROUTINE_ITEMS"), 2, used, "route items");
  Object.keys(used).forEach(function (k) {
    if (lub[k]) return;
    var w = used[k].where;
    add("orphanRecords", used[k].id, "Records use a Lub ID that is not in the registry", Object.keys(w).map(function (x) { return w[x] + " " + x; }).join(", "), "high");
  });
  return { ids: ids, problems: problems };
}

function peBell_(ss, email, message) {
  recordInAppNotification_(ss, email, "idcheck", message, "", "idcheck", "");
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
    MailApp.sendEmail({
      to: email,
      subject: "[ACC Reliability] " + PE_MODULE + ": " + n + " new ID problem" + (n > 1 ? "s" : ""),
      body: run.fresh.map(function (p) { return "• " + p.id + " — " + p.title + (p.detail ? " (" + p.detail + ")" : ""); }).join("\n") +
        "\n\nOpen the ACC Reliability Platform → Settings → Equipment & IDs.",
    });
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

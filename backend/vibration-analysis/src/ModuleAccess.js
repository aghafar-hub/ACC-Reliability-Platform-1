// Module Access (Phase 0) — who may open this module, which of its tabs they
// see (Hidden / View / Edit), who is responsible for it, and whether the
// module is Active, in Maintenance or Off.
//
// This file is IDENTICAL in every module backend (oil-lubrication,
// vibration-analysis, future modules). Everything module-specific lives in
// that backend's own ModuleAccessConfig.js (MA_CONFIG). Keep the copies in
// sync: change one, copy it to the others.
//
// Storage, all inside this module's own spreadsheet / script project so
// enforcement never needs a call to another project:
//   MA_CONFIG.peopleSheet    Email | DisplayName | Contractor | Responsibility | Modified_Date
//   MA_CONFIG.tabAccessSheet Kind (Role|User) | Key (role id | email) | TabId | Level | Modified_Date
//   Script Properties        MA_STATUS, MA_VERSION, MA_RELEASED_DATE, MA_STATUS_CHANGED_BY, MA_STATUS_CHANGED_AT
//
// Enforcement only applies once SESSION_SIGNING_SECRET is set on this
// project — without it no request can be tied to a person, so the module
// keeps its old open behaviour (getMyAccess reports enforced:false).

var MA_LEVELS = { Hidden: 0, View: 1, Edit: 2 };
var MA_RESP = {
  ACC: "ACC Responsible Engineer",
  CONTRACTOR: "Contractor Responsible Engineer",
  TECH: "Technician",
  MEMBER: "Member",
  // Phase 7 — who gets the "still overdue 10 days later" escalation.
  ACC_MANAGER: "ACC Manager",
  CONTRACTOR_MANAGER: "Contractor Manager",
};
var MA_RESPONSIBILITIES = [MA_RESP.ACC, MA_RESP.CONTRACTOR, MA_RESP.TECH, MA_RESP.MEMBER, MA_RESP.ACC_MANAGER, MA_RESP.CONTRACTOR_MANAGER];
var MA_STATUSES = ["Active", "Maintenance", "Off"];
var MA_PEOPLE_HEADERS = ["Email", "DisplayName", "Contractor", "Responsibility", "Modified_Date"];
var MA_TAB_HEADERS = ["Kind", "Key", "TabId", "Level", "Modified_Date"];
var MA_CACHE_SECONDS = 120;

function maCacheKey_() {
  return "ma_cfg_v1_" + MA_CONFIG.moduleId;
}

function maNormEmail_(v) {
  return String(v || "").trim().toLowerCase();
}

function maIsEnforced_() {
  return !!PropertiesService.getScriptProperties().getProperty("SESSION_SIGNING_SECRET");
}

// Visitor: can be shown tabs, never edits — Edit is read as View for anyone
// whose only role is Visitor, whatever the role or exception rows say.
var MA_VISITOR_ROLE = "ROLE-VIEW";
function maIsVisitorOnly_(session) {
  var roles = (session && session.roles) || [];
  return roles.length > 0 && roles.every(function (r) { return r === MA_VISITOR_ROLE; });
}

function maIsAdmin_(session) {
  return !!session && (session.roles || []).indexOf("ROLE-ADMIN") !== -1;
}

function maContractorForOrg_(orgId) {
  if (!orgId || orgId === "ORG-ACC") return "ACC";
  return MA_CONFIG.orgToContractor[orgId] || "";
}

// ─── Status (script properties) ──────────────────────────────────────────────

function maGetStatus_() {
  var p = PropertiesService.getScriptProperties();
  var status = p.getProperty("MA_STATUS");
  return {
    status: MA_STATUSES.indexOf(status) !== -1 ? status : "Active",
    version: p.getProperty("MA_VERSION") || "",
    releasedDate: p.getProperty("MA_RELEASED_DATE") || "",
    changedBy: p.getProperty("MA_STATUS_CHANGED_BY") || "",
    changedAt: p.getProperty("MA_STATUS_CHANGED_AT") || "",
  };
}

function maSetStatus_(data, actingUser) {
  var status = String(data.status || "").trim();
  if (MA_STATUSES.indexOf(status) === -1) return { error: "Status must be Active, Maintenance or Off." };
  var p = PropertiesService.getScriptProperties();
  p.setProperties({
    MA_STATUS: status,
    MA_VERSION: String(data.version == null ? (p.getProperty("MA_VERSION") || "") : data.version).trim(),
    MA_RELEASED_DATE: String(data.releasedDate == null ? (p.getProperty("MA_RELEASED_DATE") || "") : data.releasedDate).trim(),
    MA_STATUS_CHANGED_BY: actingUser || "",
    MA_STATUS_CHANGED_AT: new Date().toISOString(),
  });
  return { status: "ok" };
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

function maReadRows_(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  return vals.length <= 1 ? [] : vals.slice(1);
}

function maEnsureSheet_(sheetName, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return { sheet: sheet, created: false };
  sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return { sheet: sheet, created: true };
}

// First use only: creates both sheets, seeds the role defaults (chosen per
// module to match what each role could see before Phase 0) and imports the
// people this module already notified, so nobody who was getting alerts
// stops getting them.
function maEnsureSetup_() {
  var now = new Date().toISOString();
  var tab = maEnsureSheet_(MA_CONFIG.tabAccessSheet, MA_TAB_HEADERS);
  if (tab.created) {
    var rows = [];
    Object.keys(MA_CONFIG.defaultRoleLevels).forEach(function (roleId) {
      var levels = MA_CONFIG.defaultRoleLevels[roleId];
      MA_CONFIG.tabs.forEach(function (tabId) {
        rows.push(["Role", roleId, tabId, levels[tabId] || levels["*"] || "Hidden", now]);
      });
    });
    if (rows.length) tab.sheet.getRange(2, 1, rows.length, MA_TAB_HEADERS.length).setValues(rows);
  }
  var people = maEnsureSheet_(MA_CONFIG.peopleSheet, MA_PEOPLE_HEADERS);
  if (people.created && typeof maImportLegacyPeople_ === "function") {
    var seen = {};
    var imported = [];
    (maImportLegacyPeople_() || []).forEach(function (p) {
      var email = maNormEmail_(p.email);
      if (!email || MA_RESPONSIBILITIES.indexOf(p.responsibility) === -1) return;
      var k = email + "|" + p.responsibility + "|" + p.contractor;
      if (seen[k]) return;
      seen[k] = true;
      imported.push([email, p.displayName || "", p.contractor || "", p.responsibility, now]);
    });
    if (imported.length) people.sheet.getRange(2, 1, imported.length, MA_PEOPLE_HEADERS.length).setValues(imported);
  }
}

function maLoadConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(maCacheKey_());
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* rebuild below */ }
  }
  maEnsureSetup_();
  var people = (maReadRows_(MA_CONFIG.peopleSheet) || [])
    .map(function (r) {
      return {
        email: maNormEmail_(r[0]),
        displayName: String(r[1] || "").trim(),
        contractor: String(r[2] || "").trim(),
        responsibility: String(r[3] || "").trim(),
      };
    })
    .filter(function (p) { return p.email && p.responsibility; });
  var roleDefaults = {};
  var userOverrides = {};
  (maReadRows_(MA_CONFIG.tabAccessSheet) || []).forEach(function (r) {
    var kind = String(r[0] || "").trim();
    var key = String(r[1] || "").trim();
    var tabId = String(r[2] || "").trim();
    var level = String(r[3] || "").trim();
    if (!key || !tabId || MA_LEVELS[level] === undefined) return;
    if (kind === "Role") {
      (roleDefaults[key] = roleDefaults[key] || {})[tabId] = level;
    } else if (kind === "User") {
      var email = maNormEmail_(key);
      (userOverrides[email] = userOverrides[email] || {})[tabId] = level;
    }
  });
  // A role or tab added after the first setup (e.g. the Contractor Manager
  // role, or a new tab) has no saved row yet — it starts at the module's
  // default until the App Owner changes it.
  (MA_CONFIG.roles || []).forEach(function (role) {
    var defs = (MA_CONFIG.defaultRoleLevels || {})[role.id] || {};
    MA_CONFIG.tabs.forEach(function (tabId) {
      var row = (roleDefaults[role.id] = roleDefaults[role.id] || {});
      if (!row[tabId]) row[tabId] = defs[tabId] || defs["*"] || "Hidden";
    });
  });
  var cfg = { people: people, roleDefaults: roleDefaults, userOverrides: userOverrides };
  try { cache.put(maCacheKey_(), JSON.stringify(cfg), MA_CACHE_SECONDS); } catch (e) { /* too large to cache — fine */ }
  return cfg;
}

function maInvalidate_() {
  CacheService.getScriptCache().remove(maCacheKey_());
}

// ─── Resolving one person's access ──────────────────────────────────────────

function maResolve_(session) {
  var st = maGetStatus_();
  var base = {
    moduleId: MA_CONFIG.moduleId,
    moduleName: MA_CONFIG.moduleName,
    enforced: maIsEnforced_(),
    status: st.status,
    version: st.version,
    releasedDate: st.releasedDate,
    admin: maIsAdmin_(session),
    member: false,
    responsibilities: [],
    contractor: session ? maContractorForOrg_(session.orgId) : "",
    tabs: {},
  };
  var allEdit = {};
  MA_CONFIG.tabs.forEach(function (t) { allEdit[t] = "Edit"; });

  if (!base.enforced || base.admin) {
    base.member = true;
    base.tabs = allEdit;
    if (session && base.enforced) {
      var cfgA = maLoadConfig_();
      var emailA = maNormEmail_(session.email);
      base.responsibilities = cfgA.people.filter(function (p) { return p.email === emailA; }).map(function (p) { return p.responsibility; });
    }
    return base;
  }
  if (!session) return base;

  var cfg = maLoadConfig_();
  var email = maNormEmail_(session.email);
  var mine = cfg.people.filter(function (p) { return p.email === email; });
  base.member = mine.length > 0;
  base.responsibilities = mine.map(function (p) { return p.responsibility; });
  if (!base.member) return base;

  var overrides = cfg.userOverrides[email] || {};
  MA_CONFIG.tabs.forEach(function (tabId) {
    var best = "Hidden";
    (session.roles || []).forEach(function (roleId) {
      var lvl = (cfg.roleDefaults[roleId] || {})[tabId];
      if (lvl && MA_LEVELS[lvl] > MA_LEVELS[best]) best = lvl;
    });
    if (overrides[tabId]) best = overrides[tabId];
    if (best === "Edit" && maIsVisitorOnly_(session)) best = "View";
    base.tabs[tabId] = best;
  });
  return base;
}

function maAnyTabAtLeast_(access, tabIds, level) {
  for (var i = 0; i < tabIds.length; i++) {
    if (MA_LEVELS[access.tabs[tabIds[i]] || "Hidden"] >= MA_LEVELS[level]) return true;
  }
  return false;
}

// Shared gate for both reads and writes: logged in, module not Off, member.
function maBaseDenial_(access, session) {
  if (!session) return "Please log in again.";
  if (access.status === "Off") return MA_CONFIG.moduleName + " is switched off.";
  if (!access.member) return "You don't have access to " + MA_CONFIG.moduleName + ". Ask the App Owner to add you.";
  return "";
}

// Returns "" when the GET may run, otherwise the message to send back.
function maCheckRead_(session, action) {
  var rule = MA_CONFIG.readRules[action];
  if (rule === "admin") return maIsAdmin_(session) ? "" : "Only the App Owner can see this.";
  if (rule === "open" || !maIsEnforced_() || maIsAdmin_(session)) return "";
  var access = maResolve_(session);
  var base = maBaseDenial_(access, session);
  if (base) return base;
  if (Object.prototype.toString.call(rule) === "[object Array]" && !maAnyTabAtLeast_(access, rule, "View")) {
    return "You don't have access to this part of " + MA_CONFIG.moduleName + ".";
  }
  return "";
}

// Returns "" when the POST may run, otherwise the message to send back.
function maCheckWrite_(session, data) {
  var action = data.action;
  var rule = MA_ADMIN_ACTIONS.indexOf(action) !== -1 ? "admin" : MA_CONFIG.writeRules[action];
  if (typeof rule === "function") rule = rule(data);
  if (rule === "admin") return maIsAdmin_(session) ? "" : "Only the App Owner can change this.";
  if (rule === "open" || !maIsEnforced_() || maIsAdmin_(session)) return "";
  var access = maResolve_(session);
  var base = maBaseDenial_(access, session);
  if (base) return base;
  if (access.status === "Maintenance") return MA_CONFIG.moduleName + " is under maintenance. Changes can't be saved right now.";
  if (Object.prototype.toString.call(rule) === "[object Array]" && !maAnyTabAtLeast_(access, rule, "Edit")) {
    return "You don't have permission to change this part of " + MA_CONFIG.moduleName + ".";
  }
  return "";
}

// Bundle reads (everything the app needs at start-up in one response): drop
// each section only when every tab that shows it is Hidden for this person.
function maFilterSections_(session, result) {
  if (!result || typeof result !== "object" || !maIsEnforced_() || maIsAdmin_(session)) return result;
  var access = maResolve_(session);
  Object.keys(MA_CONFIG.sectionTabs).forEach(function (key) {
    if (result[key] === undefined) return;
    if (!maAnyTabAtLeast_(access, MA_CONFIG.sectionTabs[key], "View")) {
      result[key] = Object.prototype.toString.call(result[key]) === "[object Array]" ? [] : null;
    }
  });
  return result;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

function getMyAccess_(session) {
  var a = maResolve_(session);
  if (!a.member) a.tabs = {};
  return a;
}

function getModuleAccessConfig_() {
  var cfg = maLoadConfig_();
  var st = maGetStatus_();
  return {
    moduleId: MA_CONFIG.moduleId,
    moduleName: MA_CONFIG.moduleName,
    enforced: maIsEnforced_(),
    statusInfo: st,
    tabs: MA_CONFIG.tabs,
    roles: MA_CONFIG.roles,
    responsibilities: MA_RESPONSIBILITIES,
    people: cfg.people,
    roleDefaults: cfg.roleDefaults,
    userOverrides: cfg.userOverrides,
  };
}

function maValidPerson_(p) {
  var email = maNormEmail_(p.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That doesn't look like a valid email address." };
  var responsibility = String(p.responsibility || "").trim();
  if (MA_RESPONSIBILITIES.indexOf(responsibility) === -1) return { error: "Unknown responsibility: " + responsibility };
  var contractor = String(p.contractor || "").trim();
  if (responsibility === MA_RESP.ACC) contractor = "ACC";
  if ((responsibility === MA_RESP.CONTRACTOR || responsibility === MA_RESP.TECH) && (!contractor || contractor === "ACC")) {
    return { error: responsibility + " must belong to a contractor." };
  }
  return { email: email, displayName: String(p.displayName || "").trim(), contractor: contractor, responsibility: responsibility };
}

// Adds each person unless the same (email, responsibility) row already
// exists. Returns how many were added.
function maAddPeople_(list) {
  maEnsureSetup_();
  var setup = maEnsureSheet_(MA_CONFIG.peopleSheet, MA_PEOPLE_HEADERS);
  var existing = {};
  (maReadRows_(MA_CONFIG.peopleSheet) || []).forEach(function (r) {
    existing[maNormEmail_(r[0]) + "|" + String(r[3] || "").trim()] = true;
  });
  var now = new Date().toISOString();
  var rows = [];
  var errors = [];
  (list || []).forEach(function (raw) {
    var p = maValidPerson_(raw);
    if (p.error) { errors.push(p.error); return; }
    var k = p.email + "|" + p.responsibility;
    if (existing[k]) return;
    existing[k] = true;
    rows.push([p.email, p.displayName, p.contractor, p.responsibility, now]);
  });
  if (rows.length) {
    setup.sheet.getRange(setup.sheet.getLastRow() + 1, 1, rows.length, MA_PEOPLE_HEADERS.length).setValues(rows);
  }
  maInvalidate_();
  if (!rows.length && errors.length) return { error: errors[0] };
  return { status: "ok", added: rows.length };
}

function maRemovePerson_(data) {
  var email = maNormEmail_(data.email);
  var responsibility = String(data.responsibility || "").trim();
  maEnsureSetup_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MA_CONFIG.peopleSheet);
  var vals = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = vals.length - 1; i >= 1; i--) {
    if (maNormEmail_(vals[i][0]) === email && (!responsibility || String(vals[i][3] || "").trim() === responsibility)) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  maInvalidate_();
  return removed ? { status: "ok" } : { error: "Not found" };
}

// Admin-only POST actions, handled by maHandleAdminPost_. Listed once here
// so each backend's router and access rules pick up new ones automatically.
var MA_ADMIN_ACTIONS = ["maSetStatus", "maAddPeople", "maRemovePerson", "maSetTabLevel", "maSetTabLevels"];

function maNormTabChange_(c) {
  var kind = c.kind === "User" ? "User" : c.kind === "Role" ? "Role" : "";
  var key = kind === "User" ? maNormEmail_(c.key) : String(c.key || "").trim();
  var tabId = String(c.tabId || "").trim();
  var level = String(c.level || "").trim();
  if (!kind || !key) return { error: "kind and key are required" };
  if (MA_CONFIG.tabs.indexOf(tabId) === -1) return { error: "Unknown tab: " + tabId };
  if (level && MA_LEVELS[level] === undefined) return { error: "Level must be Hidden, View or Edit." };
  if (!level && kind === "Role") return { error: "A role always needs a level." };
  return { kind: kind, key: key, tabId: tabId, level: level };
}

// Applies many tab-level changes in one go (the Settings screen's "Save
// changes"): one read and one write of the sheet, whatever the count. All
// changes are checked first; if any is invalid, nothing is saved. A User
// change with level "" removes that person's exception (role defaults can
// only be changed, never removed).
function maSetTabLevels_(changes) {
  var list = [];
  for (var c = 0; c < (changes || []).length; c++) {
    var n = maNormTabChange_(changes[c]);
    if (n.error) return n;
    list.push(n);
  }
  if (!list.length) return { status: "ok", changed: 0 };

  maEnsureSetup_();
  var sheet = maEnsureSheet_(MA_CONFIG.tabAccessSheet, MA_TAB_HEADERS).sheet;
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, MA_TAB_HEADERS.length).getValues() : [];
  var rowKey = function (kind, key, tabId) { return kind + "|" + key + "|" + tabId; };
  var index = {};
  rows.forEach(function (r, i) {
    var kind = String(r[0] || "").trim();
    var key = kind === "User" ? maNormEmail_(r[1]) : String(r[1] || "").trim();
    index[rowKey(kind, key, String(r[2] || "").trim())] = i;
  });
  var now = new Date().toISOString();
  list.forEach(function (ch) {
    var k = rowKey(ch.kind, ch.key, ch.tabId);
    var i = index[k];
    if (ch.level) {
      if (i !== undefined && rows[i]) {
        rows[i][3] = ch.level;
        rows[i][4] = now;
      } else {
        index[k] = rows.length;
        rows.push([ch.kind, ch.key, ch.tabId, ch.level, now]);
      }
    } else if (i !== undefined) {
      rows[i] = null;
      delete index[k];
    }
  });
  var kept = rows.filter(function (r) { return r; });
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, MA_TAB_HEADERS.length).clearContent();
  if (kept.length) sheet.getRange(2, 1, kept.length, MA_TAB_HEADERS.length).setValues(kept);
  maInvalidate_();
  return { status: "ok", changed: list.length };
}

function maSetTabLevel_(data) {
  return maSetTabLevels_([data]);
}

// Email lists for notifications. contractor "" with MA_RESP.ACC returns
// every ACC responsible engineer.
function maResponsibleEmails_(responsibility, contractor) {
  var cfg = maLoadConfig_();
  var out = [];
  cfg.people.forEach(function (p) {
    if (p.responsibility !== responsibility) return;
    if (responsibility !== MA_RESP.ACC && contractor && p.contractor !== contractor) return;
    if (out.indexOf(p.email) === -1) out.push(p.email);
  });
  return out;
}

// Technicians listed for a contractor — the assign-technician picker.
function maTechnicians_(contractor) {
  return maLoadConfig_().people.filter(function (p) {
    return p.responsibility === MA_RESP.TECH && (!contractor || p.contractor === contractor);
  });
}

// Dispatch for the admin-only POST actions, so each backend's doPost needs a
// single call. Returns null for an action that isn't a module-access one.
function maHandleAdminPost_(data, actingUser) {
  switch (data.action) {
    case "maSetStatus": return maSetStatus_(data, actingUser);
    case "maAddPeople": return maAddPeople_(data.people || []);
    case "maRemovePerson": return maRemovePerson_(data);
    case "maSetTabLevel": return maSetTabLevel_(data);
    case "maSetTabLevels": return maSetTabLevels_(data.changes || []);
    default: return null;
  }
}

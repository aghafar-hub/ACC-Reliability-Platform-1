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
  base.responsibilities = mine.map(function (p) { return p.responsibility; });
  // A colleague covering through an active delegation is a member for the
  // time of the cover, as the responsible engineer of that side.
  var cover = maResponsibility_(session).covering;
  if (cover.length) {
    var resp = maSideFor_(base.contractor) === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
    if (base.responsibilities.indexOf(resp) === -1) base.responsibilities.push(resp);
    base.covering = cover;
  }
  base.member = mine.length > 0 || cover.length > 0;
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
  // "settings:<page>" — Settings → Settings access decides (PlatformEquipment.js)
  if (typeof rule === "string" && rule.indexOf("settings:") === 0) return maIsAdmin_(session) || psaRank_(psaLevel_(session, rule.slice(9))) >= 1 ? "" : "You do not have permission for this settings page.";
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
  // whoever is covering through an active delegation gets the notices too
  if (responsibility === MA_RESP.ACC || (responsibility === MA_RESP.CONTRACTOR && contractor)) {
    var side = responsibility === MA_RESP.ACC ? "ACC" : "Contractor";
    var today = maToday_();
    maDelegations_().forEach(function (d) {
      if (d.side !== side || (side === "Contractor" && d.contractor !== contractor)) return;
      if (maDelegationState_(d, today) === "Active" && out.indexOf(d.to) === -1) out.push(d.to);
    });
  }
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

// ─── Responsible engineers and delegation ───────────────────────────────────
// My Work for a module goes only to its responsible engineers: the people
// listed here as "Contractor Responsible Engineer" (for their own contractor)
// or "ACC Responsible Engineer". More than one per contractor is fine.
//
// When one is away they delegate — themselves, or their manager for them
// (same contractor / ACC) — to a colleague of the same contractor for a set
// of dates. A manager can also take the work themselves. While a delegation
// is active the colleague is responsible too ("covering for …").
// Same-contractor is checked when the delegation is USED: it only counts for
// a signed-in person whose own organisation matches, whatever was typed.
//
// Sheet MA_DELEGATIONS (created on first use), one row per delegation.
// Starting or ending one notifies (bell + email, via the module's maNotify_):
// the contractor's managers, ACC managers, the module's ACC engineers, the
// colleague, and the engineer when someone else set it up.

var MA_DELEGATION_SHEET = "MA_DELEGATIONS";
var MA_DELEGATION_HEADERS = ["DelegationId", "FromEmail", "ToEmail", "Side", "Contractor", "StartDate", "EndDate", "Reason", "CreatedBy", "CreatedAt", "Status", "EndedBy", "EndedAt"];
var MA_DELEGATION_MAX_DAYS = 120;
// these three run for any signed-in person; the rules are inside
var MA_SELF_ACTIONS = ["getMyDelegations", "maCreateDelegation", "maEndDelegation", "getTeamHistory"];

function maToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd");
}

function maYmd_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v.getTime()) ? "" : String(Utilities.formatDate(v, Session.getScriptTimeZone() || "Etc/UTC", "yyyy-MM-dd")).slice(0, 10);
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}

function maDelegations_() {
  return (maReadRows_(MA_DELEGATION_SHEET) || []).map(function (r, i) {
    return {
      row: i + 2, id: String(r[0] || ""), from: maNormEmail_(r[1]), to: maNormEmail_(r[2]), side: String(r[3] || ""),
      contractor: String(r[4] || ""), start: maYmd_(r[5]), end: maYmd_(r[6]), reason: String(r[7] || ""),
      createdBy: maNormEmail_(r[8]), createdAt: String(r[9] || ""), status: String(r[10] || ""), endedBy: maNormEmail_(r[11]), endedAt: String(r[12] || ""),
    };
  }).filter(function (d) { return d.id; });
}

// Upcoming / Active / Ended (by hand) / Expired (end date passed)
function maDelegationState_(d, today) {
  if (d.status === "Ended") return "Ended";
  if (d.end < today) return "Expired";
  if (d.start > today) return "Upcoming";
  return "Active";
}

function maSideFor_(contractor) {
  return contractor === "ACC" ? "ACC" : "Contractor";
}

// Is this person a responsible engineer for this module (listed, or covering
// through an active delegation)? side: "ACC" | "Contractor".
function maResponsibility_(session) {
  var out = { side: "", contractor: "", listed: false, covering: [], responsible: false, manager: false };
  if (!session) return out;
  var email = maNormEmail_(session.email);
  var contractor = maContractorForOrg_(session.orgId);
  var roles = session.roles || [];
  out.contractor = contractor;
  out.side = maSideFor_(contractor);
  if (!contractor) return out;
  var cfg = maLoadConfig_();
  var want = out.side === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
  out.listed = cfg.people.some(function (p) {
    return p.email === email && p.responsibility === want && (out.side === "ACC" || p.contractor === contractor);
  });
  out.manager = out.side === "ACC" ? roles.indexOf("ROLE-MGR") !== -1 : roles.indexOf("ROLE-CMGR") !== -1;
  var today = maToday_();
  maDelegations_().forEach(function (d) {
    if (d.to !== email || d.contractor !== contractor || d.side !== out.side) return;
    if (maDelegationState_(d, today) !== "Active") return;
    out.covering.push({ from: d.from, until: d.end, id: d.id });
  });
  out.responsible = out.listed || out.covering.length > 0;
  return out;
}

// Everyone responsible right now for a contractor (or ACC): listed people
// plus colleagues covering through an active delegation.
function maResponsibleNow_(contractor) {
  var side = maSideFor_(contractor);
  var want = side === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
  var out = maLoadConfig_().people.filter(function (p) {
    return p.responsibility === want && (side === "ACC" || p.contractor === contractor);
  }).map(function (p) { return p.email; });
  var today = maToday_();
  maDelegations_().forEach(function (d) {
    if (d.side === side && d.contractor === contractor && maDelegationState_(d, today) === "Active" && out.indexOf(d.to) === -1) out.push(d.to);
  });
  return out;
}

// Who can actually do the work for a contractor (or ACC) today: listed
// engineers who are not away, plus colleagues covering through an active
// delegation. Empty = nobody responsible.
function maCoveredNow_(contractor) {
  var side = maSideFor_(contractor);
  var want = side === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
  var today = maToday_();
  var active = maDelegations_().filter(function (d) { return maDelegationState_(d, today) === "Active"; });
  var away = {};
  active.forEach(function (d) { if (d.from) away[d.from] = true; });
  var out = maLoadConfig_().people.filter(function (p) {
    return p.responsibility === want && (side === "ACC" || p.contractor === contractor) && !away[p.email];
  }).map(function (p) { return p.email; });
  active.forEach(function (d) {
    if (d.side === side && d.contractor === contractor && out.indexOf(d.to) === -1) out.push(d.to);
  });
  return out;
}

// Contractors (and ACC) with nobody responsible, as seen by this person:
// a manager sees their own side, the App Owner ACC plus every contractor
// in MA_CONFIG.orgToContractor. Everyone else: [].
function maNobodyResponsibleFor_(session) {
  if (!session) return [];
  var me = maResponsibility_(session);
  var list = [];
  if (maIsAdmin_(session)) {
    list.push("ACC");
    Object.keys(MA_CONFIG.orgToContractor || {}).forEach(function (o) { var c = MA_CONFIG.orgToContractor[o]; if (c && list.indexOf(c) === -1) list.push(c); });
  } else if (me.manager && me.contractor) {
    list.push(me.contractor);
  }
  return list.filter(function (c) { return maCoveredNow_(c).length === 0; });
}

function maPeopleWith_(responsibility, contractor) {
  return maLoadConfig_().people.filter(function (p) {
    return p.responsibility === responsibility && (!contractor || p.contractor === contractor);
  }).map(function (p) { return p.email; });
}

function maDelegationNotify_(d, verb, actor) {
  var who = [d.to, d.from]
    .concat(d.side === "Contractor" ? maPeopleWith_(MA_RESP.CONTRACTOR_MANAGER, d.contractor) : [])
    .concat(maPeopleWith_(MA_RESP.ACC_MANAGER, ""))
    .concat(maPeopleWith_(MA_RESP.ACC, ""));
  var list = [];
  who.forEach(function (e) { e = maNormEmail_(e); if (e && e !== maNormEmail_(actor) && list.indexOf(e) === -1) list.push(e); });
  if (!list.length || typeof maNotify_ !== "function") return;
  var whom = d.from ? d.from : "the " + d.contractor + " engineers";
  var subject = MA_CONFIG.moduleName + ": " + d.to + (verb === "ended" ? " no longer covers " : " covers ") + whom + (verb === "ended" ? "" : " from " + d.start + " to " + d.end);
  var body = subject + "." + (d.reason ? "\nReason: " + d.reason : "") + "\nSet by " + actor + ".";
  try { maNotify_(list, subject, body, d.contractor); } catch (e) { /* never block the delegation */ }
}

// The delegations this person may see / manage, and who they could pick.
function maGetMyDelegations_(session) {
  if (!session) return { error: "Please log in again." };
  var me = maResponsibility_(session);
  var email = maNormEmail_(session.email);
  var admin = maIsAdmin_(session);
  var today = maToday_();
  var want = me.side === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
  var engineers = maLoadConfig_().people.filter(function (p) {
    return p.responsibility === want && (me.side === "ACC" || p.contractor === me.contractor);
  }).map(function (p) { return { email: p.email, displayName: p.displayName }; });
  var list = maDelegations_().filter(function (d) {
    if (admin) return true;
    if (d.from === email || d.to === email || d.createdBy === email) return true;
    return me.manager && d.contractor === me.contractor;
  }).map(function (d) {
    var o = {}; Object.keys(d).forEach(function (k) { if (k !== "row") o[k] = d[k]; });
    o.state = maDelegationState_(d, today);
    return o;
  }).reverse();
  return {
    status: "ok", moduleId: MA_CONFIG.moduleId, moduleName: MA_CONFIG.moduleName, today: today,
    side: me.side, contractor: me.contractor, listed: me.listed, manager: me.manager, admin: admin, covering: me.covering,
    engineers: engineers, delegations: list,
    nobodyResponsible: maNobodyResponsibleFor_(session),
  };
}

function maCreateDelegation_(data, session) {
  if (!session) return { error: "Please log in again." };
  var actor = maNormEmail_(session.email);
  var me = maResponsibility_(session);
  if (!me.contractor) return { error: "Your account has no contractor." };
  var from = maNormEmail_(data.from == null ? actor : data.from);
  var to = maNormEmail_(data.to);
  var start = maYmd_(data.startDate);
  var end = maYmd_(data.endDate);
  var reason = String(data.reason || "").trim();
  var want = me.side === "ACC" ? MA_RESP.ACC : MA_RESP.CONTRACTOR;
  var listed = function (e) {
    return maLoadConfig_().people.some(function (p) { return p.email === e && p.responsibility === want && (me.side === "ACC" || p.contractor === me.contractor); });
  };
  // who may set it up: the engineer, or a manager of the same contractor (or ACC)
  if (from === actor) {
    if (!listed(from)) return { error: "You are not a responsible engineer for " + MA_CONFIG.moduleName + "." };
  } else if (!(me.manager || maIsAdmin_(session))) {
    return { error: "Only the engineer or their manager can delegate this." };
  } else if (from && !listed(from)) {
    return { error: from + " is not a " + me.contractor + " responsible engineer for " + MA_CONFIG.moduleName + "." };
  }
  // from "" = no engineer free; only a manager covering it themselves
  if (!from && !(to === actor && me.manager)) return { error: "Pick the engineer who is away." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "Pick the colleague who will cover." };
  if (to === from) return { error: "Pick a different colleague." };
  // same contractor (ACC delegates to ACC); the use-time check in
  // maResponsibility_ covers colleagues not in the people list
  var other = maLoadConfig_().people.filter(function (p) { return p.email === to && p.contractor && p.contractor !== me.contractor; })[0];
  if (other) return { error: to + " is with " + other.contractor + " — pick a colleague from " + me.contractor + "." };
  if (!start || !end) return { error: "Give the start and end dates." };
  if (end < start) return { error: "The end date is before the start date." };
  var today = maToday_();
  if (end < today) return { error: "The end date is in the past." };
  var days = (new Date(end + "T00:00:00Z") - new Date(start + "T00:00:00Z")) / 864e5;
  if (days > MA_DELEGATION_MAX_DAYS) return { error: "A delegation can last up to " + MA_DELEGATION_MAX_DAYS + " days." };
  var overlaps = function (d) { return d.start <= end && d.end >= start && ["Upcoming", "Active"].indexOf(maDelegationState_(d, today)) !== -1; };
  var all = maDelegations_();
  if (from && all.some(function (d) { return d.from === from && d.contractor === me.contractor && overlaps(d); })) return { error: from + " already has a delegation on these dates." };
  if (all.some(function (d) { return d.from === to && d.contractor === me.contractor && overlaps(d); })) return { error: to + " is away on these dates (delegated their own work)." };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { error: "Server is busy — please try again." };
  try {
    var sheet = maEnsureSheet_(MA_DELEGATION_SHEET, MA_DELEGATION_HEADERS).sheet;
    var d = { id: "DLG-" + Utilities.getUuid().slice(0, 8), from: from, to: to, side: me.side, contractor: me.contractor, start: start, end: end, reason: reason, createdBy: actor, createdAt: new Date().toISOString(), status: "Active" };
    sheet.appendRow([d.id, d.from, d.to, d.side, d.contractor, d.start, d.end, d.reason, d.createdBy, d.createdAt, d.status, "", ""]);
    maDelegationNotify_(d, "started", actor);
    return { status: "ok", delegationId: d.id };
  } finally {
    lock.releaseLock();
  }
}

function maEndDelegation_(data, session) {
  if (!session) return { error: "Please log in again." };
  var actor = maNormEmail_(session.email);
  var me = maResponsibility_(session);
  var d = maDelegations_().filter(function (x) { return x.id === String(data.delegationId || ""); })[0];
  if (!d) return { error: "Not found" };
  var may = maIsAdmin_(session) || [d.from, d.to, d.createdBy].indexOf(actor) !== -1 || (me.manager && me.contractor === d.contractor);
  if (!may) return { error: "Not found" };
  if (["Ended", "Expired"].indexOf(maDelegationState_(d, maToday_())) !== -1) return { error: "This delegation has already ended." };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { error: "Server is busy — please try again." };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MA_DELEGATION_SHEET);
    sheet.getRange(d.row, 11, 1, 3).setValues([["Ended", actor, new Date().toISOString()]]);
    maDelegationNotify_(d, "ended", actor);
    return { status: "ok" };
  } finally {
    lock.releaseLock();
  }
}

function maHandleSelfAction_(action, data, session) {
  if (action === "getMyDelegations") return maGetMyDelegations_(session);
  if (action === "maCreateDelegation") return maCreateDelegation_(data, session);
  if (action === "maEndDelegation") return maEndDelegation_(data, session);
  if (action === "getTeamHistory") return maTeamHistory_(data, session);
  return null;
}

// ─── My team: work history for managers ──────────────────────────────────────
// A contractor manager sees their own contractor's engineers and
// technicians; an ACC manager and the App Owner see ACC and every
// contractor; a contractor's responsible engineer sees their own
// technicians only; this module's ACC responsible engineer sees every
// contractor's technicians in it. Each module supplies its events through
// teamCollect_(from, to) → { events: [...], open: { email: {open, overdue} },
// teams: [{ contractor, waiting, overdue }] }, where an event is
// { who, date: "yyyy-MM-dd", kind, label, title, contractor, side: "ACC" |
// "Contractor" | "Technician", link: { page, recordId }, onTime, days }.
// This wrapper scopes it, marks work done while covering for someone and
// lists the people.

var MA_TEAM_MAX_DAYS = 400;

function maTeamScope_(session) {
  if (!session) return null;
  var roles = session.roles || [];
  if (maIsAdmin_(session) || roles.indexOf("ROLE-MGR") !== -1) return { all: true, contractor: "" };
  if (roles.indexOf("ROLE-CMGR") !== -1) {
    var c = maContractorForOrg_(session.orgId);
    return c && c !== "ACC" ? { all: false, contractor: c } : null;
  }
  // A contractor's responsible engineer (listed, or covering) sees their
  // own technicians only.
  var resp = maResponsibility_(session);
  if (resp.responsible && resp.side !== "ACC" && resp.contractor) return { all: false, contractor: resp.contractor, techOnly: true };
  // ACC's responsible engineer for this module (listed, or covering) sees
  // every contractor's technicians in it.
  if (resp.responsible && resp.side === "ACC") return { all: true, contractor: "", techOnly: true };
  return null;
}

// Who was this person covering for on that day ("" if nobody). A cover
// ended early stops counting from the day it was ended.
function maCoveringOn_(delegations, email, ymd) {
  for (var i = 0; i < delegations.length; i++) {
    var d = delegations[i];
    if (d.to !== email || d.start > ymd) continue;
    var end = d.end;
    if (d.status === "Ended" && d.endedAt) { var e = maYmd_(d.endedAt); if (e && e < end) end = e; }
    if (ymd <= end) return d.from || "the team";
  }
  return "";
}

function maTeamHistory_(data, session) {
  var scope = maTeamScope_(session);
  if (!scope) return { error: "Only managers, the App Owner and responsible engineers can see team history." };
  if (typeof teamCollect_ !== "function") return { error: MA_CONFIG.moduleName + " doesn't provide team history yet." };
  var today = maToday_();
  var to = maYmd_(data.to) || today;
  var from = maYmd_(data.from) || (to.slice(0, 8) + "01");
  if (from > to) return { error: "The start date is after the end date." };
  if ((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 864e5 > MA_TEAM_MAX_DAYS) return { error: "Pick a period of up to " + MA_TEAM_MAX_DAYS + " days." };

  var cfg = maLoadConfig_();
  var delegations = maDelegations_();
  // the company each person belongs to, as far as this module knows
  var homeOf = {};
  var kindOf = {};
  cfg.people.forEach(function (p) {
    if (!homeOf[p.email]) homeOf[p.email] = p.contractor;
    if (p.responsibility === MA_RESP.TECH) kindOf[p.email] = kindOf[p.email] || "technician";
    if (p.responsibility === MA_RESP.ACC || p.responsibility === MA_RESP.CONTRACTOR) kindOf[p.email] = "engineer";
  });
  delegations.forEach(function (d) { if (!homeOf[d.to]) homeOf[d.to] = d.contractor; });
  var inScope = function (c) { return scope.all || c === scope.contractor; };

  var got = teamCollect_(from, to) || {};
  var events = [];
  (got.events || []).forEach(function (e) {
    e.who = maNormEmail_(e.who);
    if (!e.who || !e.date || e.date < from || e.date > to) return;
    var home = homeOf[e.who] || (e.side === "ACC" ? "ACC" : e.contractor || "");
    if (!inScope(home)) return;
    e.home = home;
    e.covering = maCoveringOn_(delegations, e.who, e.date);
    events.push(e);
  });
  if (scope.techOnly) events = events.filter(function (e) { return (kindOf[e.who] || (e.side === "Technician" ? "technician" : "engineer")) === "technician"; });
  events.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  var people = {};
  var add = function (email, contractor, kind) {
    if (!email || !inScope(contractor)) return;
    if (!people[email]) people[email] = { email: email, name: "", contractor: contractor, kind: kind, listed: false, open: 0, overdue: 0 };
  };
  cfg.people.forEach(function (p) {
    var k = p.responsibility === MA_RESP.TECH ? "technician" : (p.responsibility === MA_RESP.ACC || p.responsibility === MA_RESP.CONTRACTOR) ? "engineer" : "";
    if (!k || kindOf[p.email] !== k) return;
    add(p.email, p.contractor, k);
    if (people[p.email]) { people[p.email].listed = true; if (p.displayName) people[p.email].name = p.displayName; }
  });
  events.forEach(function (e) { add(e.who, e.home, kindOf[e.who] || (e.side === "Technician" ? "technician" : "engineer")); });
  var open = got.open || {};
  Object.keys(open).forEach(function (email) {
    var em = maNormEmail_(email);
    add(em, homeOf[em] || open[email].contractor || "", kindOf[em] || "technician");
    if (people[em]) { people[em].open += open[email].open || 0; people[em].overdue += open[email].overdue || 0; }
  });
  return {
    status: "ok", moduleId: MA_CONFIG.moduleId, moduleName: MA_CONFIG.moduleName, from: from, to: to, today: today,
    scope: scope.all ? "all" : scope.contractor,
    techOnly: !!scope.techOnly,
    people: Object.keys(people).map(function (k) { return people[k]; }).filter(function (p) { return !scope.techOnly || p.kind === "technician"; }),
    events: events,
    teams: scope.techOnly ? [] : (got.teams || []).filter(function (t) { return inScope(t.contractor); }),
  };
}

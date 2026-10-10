/**
 * Settings access — who sees which Settings page (Settings → Settings access,
 * App Owner). Levels per page and role: Hidden · View · Edit, and for a
 * module's settings also "Responsible" (Edit for that module's responsible
 * engineer, View for everyone else with the role). One person can get an
 * exception for one page.
 *
 * Fixed rules (not editable):
 *   Appearance                       everyone, always
 *   Users · Settings access · Email  App Owner only
 *   Equipment & IDs                  others View at most (Equipment IDs are owned by the platform)
 *   App Owner                        Edit everywhere
 *
 * SETTINGS_ACCESS        Page | Role | Level | Updated_By | Updated_At
 * SETTINGS_ACCESS_PEOPLE Email | Page | Level | Updated_By | Updated_At
 * Both are made on the first save; until then the defaults below apply.
 * Module backends read the same tabs (their PlatformEquipment.js, psaLevel_).
 */

var SA_PAGES = ['appearance', 'language', 'delegations', 'users', 'module-access', 'settings-access', 'equipment-ids', 'email', 'oil-analysis', 'vibration-analysis'];
var SA_OWNER_ONLY = ['users', 'settings-access', 'email'];
var SA_VIEW_MAX = ['equipment-ids'];
var SA_MODULE_PAGES = ['oil-analysis', 'vibration-analysis'];
var SA_ROLES = ['ROLE-MGR', 'ROLE-RENG', 'ROLE-CMGR', 'ROLE-CENG', 'ROLE-TECH', 'ROLE-VIEW'];
var SA_LEVELS = ['Hidden', 'View', 'Responsible', 'Edit'];
var SA_DEFAULTS = {
  'language': { 'ROLE-MGR': 'View', 'ROLE-RENG': 'View', 'ROLE-CMGR': 'View', 'ROLE-CENG': 'View', 'ROLE-TECH': 'View', 'ROLE-VIEW': 'View' },
  'delegations': { 'ROLE-MGR': 'Edit', 'ROLE-RENG': 'Edit', 'ROLE-CMGR': 'Edit', 'ROLE-CENG': 'Edit' },
  'module-access': { 'ROLE-MGR': 'View' },
  'equipment-ids': { 'ROLE-MGR': 'View', 'ROLE-RENG': 'View' },
  'oil-analysis': { 'ROLE-MGR': 'View', 'ROLE-RENG': 'Responsible' },
  'vibration-analysis': { 'ROLE-MGR': 'View', 'ROLE-RENG': 'Responsible' },
};
var SA_SHEET = 'SETTINGS_ACCESS';
var SA_PEOPLE_SHEET = 'SETTINGS_ACCESS_PEOPLE';

function saRank_(level) {
  return { Hidden: 0, View: 1, Responsible: 2, Edit: 3 }[level] || 0;
}

// The level a role may hold on a page (fixed rules applied).
function saClamp_(page, level) {
  if (SA_OWNER_ONLY.indexOf(page) !== -1) return 'Hidden';
  if (page === 'appearance') return 'Edit';
  if (SA_VIEW_MAX.indexOf(page) !== -1 && saRank_(level) > 1) return 'View';
  if (level === 'Responsible' && SA_MODULE_PAGES.indexOf(page) === -1) return 'Edit';
  return SA_LEVELS.indexOf(level) === -1 ? 'Hidden' : level;
}

function saSheet_(name) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  return ss.getSheetByName(name);
}

/** { matrix: { page: { role: level } }, people: [{ email, page, level }] } — defaults + the sheet. */
function saRead_() {
  var matrix = {};
  SA_PAGES.forEach(function (p) {
    matrix[p] = {};
    SA_ROLES.forEach(function (r) { matrix[p][r] = saClamp_(p, (SA_DEFAULTS[p] || {})[r] || 'Hidden'); });
  });
  var people = [];
  try {
    var sh = saSheet_(SA_SHEET);
    if (sh) readSheetAsObjects_(sh).forEach(function (r) {
      var p = String(r.Page || '').trim(), role = String(r.Role || '').trim();
      if (matrix[p] && SA_ROLES.indexOf(role) !== -1) matrix[p][role] = saClamp_(p, String(r.Level || '').trim());
    });
    var ph = saSheet_(SA_PEOPLE_SHEET);
    if (ph) readSheetAsObjects_(ph).forEach(function (r) {
      var email = String(r.Email || '').trim().toLowerCase(), p = String(r.Page || '').trim();
      if (email && matrix[p]) people.push({ email: email, page: p, level: saClamp_(p, String(r.Level || '').trim()) });
    });
  } catch (e) { /* defaults */ }
  return { matrix: matrix, people: people };
}

/** One person's level on every page. */
function saLevels_(session, read) {
  read = read || saRead_();
  var roles = session.roles || [];
  var email = String(session.email || '').toLowerCase();
  var out = {};
  var owner = roles.indexOf('ROLE-ADMIN') !== -1;
  SA_PAGES.forEach(function (p) {
    if (owner || p === 'appearance') { out[p] = 'Edit'; return; }
    var best = 'Hidden';
    roles.forEach(function (r) { var l = (read.matrix[p] || {})[r]; if (l && saRank_(l) > saRank_(best)) best = l; });
    read.people.forEach(function (x) { if (x.email === email && x.page === p) best = x.level; });
    out[p] = saClamp_(p, best);
  });
  return out;
}

/** Throws unless this person may change this settings page. */
function requireSettingsEdit_(session, page) {
  if ((session.roles || []).indexOf('ROLE-ADMIN') !== -1) return;
  var msg = saCheck_(session, page, 'Edit');
  if (msg) throw new Error(msg);
}

/** "" when this person may do it, else why not. need: 'View' | 'Edit'. */
function saCheck_(session, page, need) {
  var lvl = saLevels_(session)[page] || 'Hidden';
  var ok = need === 'View' ? saRank_(lvl) >= 1 : lvl === 'Edit';
  return ok ? '' : 'You do not have permission for this settings page.';
}

/** Everyone: my levels. App Owner also gets the whole table to edit. */
function getSettingsAccess_(session) {
  var read = saRead_();
  var out = { pages: SA_PAGES, roles: SA_ROLES, ownerOnly: SA_OWNER_ONLY, viewMax: SA_VIEW_MAX, modulePages: SA_MODULE_PAGES, mine: saLevels_(session, read) };
  if ((session.roles || []).indexOf('ROLE-ADMIN') !== -1) {
    out.matrix = read.matrix;
    out.people = read.people;
  }
  return out;
}

/** App Owner: replace the table and the exceptions. body: { matrix, people } */
function saveSettingsAccess_(session, body) {
  requireAppAdmin_(session.userId);
  var by = session.email || session.userId;
  return withLock_(function () {
    var before = saRead_();
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    var now = new Date();
    var rows = [];
    SA_PAGES.forEach(function (p) {
      if (p === 'appearance' || SA_OWNER_ONLY.indexOf(p) !== -1) return;
      SA_ROLES.forEach(function (r) {
        var l = saClamp_(p, String(((body.matrix || {})[p] || {})[r] || 'Hidden'));
        rows.push([p, r, l, by, now]);
      });
    });
    var people = [];
    (body.people || []).forEach(function (x) {
      var email = String(x.email || '').trim().toLowerCase(), p = String(x.page || '');
      if (!email || SA_PAGES.indexOf(p) === -1 || p === 'appearance' || SA_OWNER_ONLY.indexOf(p) !== -1) return;
      people.push([email, p, saClamp_(p, String(x.level || 'Hidden')), by, now]);
    });
    saWrite_(ss, SA_SHEET, ['Page', 'Role', 'Level', 'Updated_By', 'Updated_At'], rows);
    saWrite_(ss, SA_PEOPLE_SHEET, ['Email', 'Page', 'Level', 'Updated_By', 'Updated_At'], people);
    // what changed, for Activity
    var changes = [];
    SA_PAGES.forEach(function (p) {
      SA_ROLES.forEach(function (r) {
        var a = before.matrix[p][r], b = saClamp_(p, String(((body.matrix || {})[p] || {})[r] || 'Hidden'));
        if (p !== 'appearance' && SA_OWNER_ONLY.indexOf(p) === -1 && a !== b) changes.push(p + ' · ' + r + ': ' + a + ' → ' + b);
      });
    });
    if (before.people.length !== people.length) changes.push('Exceptions: ' + before.people.length + ' → ' + people.length);
    if (changes.length) platformLog_(by, 'Settings access', 'Settings access', 'Changed', changes.join('; '));
    return { saved: true, access: getSettingsAccess_(session) };
  });
}

function saWrite_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  if (last > 0) sh.getRange(1, 1, last, Math.max(headers.length, sh.getLastColumn() || headers.length)).clearContent();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

// ─── Platform activity log (Activity page) ──────────────────────────────────
// PLATFORM_LOG: At | By | Area | Record | Change | Details
var PLATFORM_LOG = 'PLATFORM_LOG';
function platformLog_(by, area, record, change, details) {
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    var sh = ss.getSheetByName(PLATFORM_LOG);
    if (!sh) {
      sh = ss.insertSheet(PLATFORM_LOG);
      sh.getRange(1, 1, 1, 6).setValues([['At', 'By', 'Area', 'Record', 'Change', 'Details']]);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), by, area, record, change, details || '']);
  } catch (e) { /* the log never blocks a change */ }
}

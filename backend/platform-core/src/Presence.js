/**
 * Who's online + login history (Admin and ACC managers).
 *
 * heartbeat: while the app is in view, the shell checks in every 2 minutes
 * with the page it shows, the device kind and how long since the person
 * last touched it. The latest check-in per person is kept in the script
 * cache (no sheet write); at most every PRES_SAVE_MIN minutes it is also
 * saved to USER_PRESENCE (one row per person: last seen, for "last seen 3
 * days ago" after the cache is gone).
 *
 * LOGIN_HISTORY: one row per sign-in, failed sign-in, and the first time
 * each person opens the app on a day (people who stay signed in don't log
 * in again, so their days of use still show). Passwords are never kept.
 */
var PRES_ONLINE_SEC = 180;      // checked in within 3 min …
var PRES_IDLE_INPUT_SEC = 180;  // … and touched the app within 3 min = online
var PRES_AWAY_SEC = 900;        // checked in within 15 min = idle
var PRES_CACHE_SEC = 21600;     // the script cache keeps 6 h at most
var PRES_SAVE_MIN = 10;
var PRES_SHEET = 'USER_PRESENCE';
var PRES_HEADERS = ['UserId', 'Email', 'OrgId', 'LastSeen', 'Page', 'Module', 'Device'];
var LOGIN_SHEET = 'LOGIN_HISTORY';
var LOGIN_HEADERS = ['At', 'Email', 'UserId', 'OrgId', 'Event', 'Device', 'Details'];
var LOGIN_MAX_ROWS = 3000;

function presenceAllowed_(session) {
  var roles = session.roles || [];
  return roles.indexOf('ROLE-ADMIN') !== -1 || roles.indexOf('ROLE-MGR') !== -1;
}

function presText_(v, max) {
  var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function presDevice_(v) {
  var d = String(v || '').toLowerCase();
  var kind = d.indexOf('phone') !== -1 ? 'phone' : d.indexOf('tablet') !== -1 ? 'tablet' : 'desktop';
  return kind + (d.indexOf('app') !== -1 ? ' · app' : '');
}

function presToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
}

function presSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// One login-history row. Never blocks what it records.
function loginLog_(email, userId, orgId, event, device, details) {
  try {
    var sh = presSheet_(LOGIN_SHEET, LOGIN_HEADERS);
    sh.appendRow([new Date(), presText_(email, 120), presText_(userId, 40), presText_(orgId, 40), event, presDevice_(device), presText_(details, 120)]);
    // keep the newest LOGIN_MAX_ROWS rows
    var extra = sh.getLastRow() - 1 - LOGIN_MAX_ROWS;
    if (extra > 200) sh.deleteRows(2, extra);
  } catch (e) { /* history never blocks a sign-in */ }
}

function heartbeat_(session, body) {
  var cache = CacheService.getScriptCache();
  var now = new Date();
  var key = 'pres|' + session.userId;
  var prev = null;
  try { prev = JSON.parse(cache.get(key) || 'null'); } catch (e) { prev = null; }
  var today = presToday_();
  var idleSec = Math.max(0, Math.min(86400, Number(body.idleSec) || 0));
  var entry = {
    userId: session.userId,
    email: session.email || '',
    orgId: session.orgId || '',
    roles: session.roles || [],
    at: now.toISOString(),
    lastInput: new Date(now.getTime() - idleSec * 1000).toISOString(),
    page: presText_(body.page, 80),
    module: presText_(body.module, 40),
    device: presDevice_(body.device),
    day: today,
    firstToday: prev && prev.day === today && prev.firstToday ? prev.firstToday : now.toISOString()
  };
  cache.put(key, JSON.stringify(entry), PRES_CACHE_SEC);
  // first check-in of the day → login history
  var dayKey = 'presday|' + session.userId + '|' + today;
  if (!cache.get(dayKey)) {
    cache.put(dayKey, '1', PRES_CACHE_SEC);
    if (!prev || prev.day !== today) loginLog_(entry.email, session.userId, entry.orgId, 'Opened the app', body.device, entry.module ? entry.module + ' · ' + entry.page : entry.page);
  }
  // last seen, saved now and then
  var saveKey = 'pressave|' + session.userId;
  if (!cache.get(saveKey)) {
    cache.put(saveKey, '1', PRES_SAVE_MIN * 60);
    try { presSave_(entry); } catch (e) { /* never blocks */ }
  }
  return { at: entry.at };
}

function presSave_(entry) {
  withLock_(function () {
    var sh = presSheet_(PRES_SHEET, PRES_HEADERS);
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    var row = [entry.userId, entry.email, entry.orgId, new Date(entry.at), entry.page, entry.module, entry.device];
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(entry.userId)) {
        sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return;
      }
    }
    sh.appendRow(row);
  });
}

function presIso_(v) {
  if (!v) return '';
  var d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// Everyone with an account: online / idle / earlier today / last seen.
function listPresence_(session) {
  if (!presenceAllowed_(session)) throw new Error("Who's online is for the Admin and ACC managers.");
  var users = readSheetAsObjects_(getSheet_(SHEET_NAMES.USERS)).filter(function (u) { return u.Status === 'Active'; });
  var userRoles = readSheetAsObjects_(getSheet_(SHEET_NAMES.USER_ROLES));
  var cache = CacheService.getScriptCache();
  var live = cache.getAll(users.map(function (u) { return 'pres|' + u.UserId; }));
  var saved = {};
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var psh = ss.getSheetByName(PRES_SHEET);
  if (psh) readSheetAsObjects_(psh).forEach(function (r) { saved[String(r.UserId)] = r; });
  var today = presToday_();
  var now = Date.now();
  var out = users.map(function (u) {
    var e = null;
    try { e = JSON.parse(live['pres|' + u.UserId] || 'null'); } catch (x) { e = null; }
    var s = saved[String(u.UserId)];
    var lastSeen = e ? e.at : s ? presIso_(s.LastSeen) : '';
    var since = lastSeen ? (now - new Date(lastSeen).getTime()) / 1000 : Infinity;
    var inputSince = e && e.lastInput ? (now - new Date(e.lastInput).getTime()) / 1000 : Infinity;
    var status = 'offline';
    if (e && since <= PRES_ONLINE_SEC && inputSince <= PRES_IDLE_INPUT_SEC) status = 'online';
    else if (e && since <= PRES_AWAY_SEC) status = 'idle';
    else if (lastSeen && Utilities.formatDate(new Date(lastSeen), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd') === today) status = 'today';
    return {
      userId: u.UserId,
      email: u.Email,
      orgId: u.OrgId,
      roles: userRoles.filter(function (r) { return r.UserId === u.UserId; }).map(function (r) { return r.RoleId; }),
      status: status,
      lastSeen: lastSeen,
      lastInput: e ? e.lastInput : '',
      firstToday: e && e.day === today ? e.firstToday : '',
      page: e ? e.page : s ? String(s.Page || '') : '',
      module: e ? e.module : s ? String(s.Module || '') : '',
      device: e ? e.device : s ? String(s.Device || '') : ''
    };
  });
  return { now: new Date(now).toISOString(), onlineSec: PRES_ONLINE_SEC, idleSec: PRES_AWAY_SEC, users: out };
}

// body.from = ISO date (default 30 days back, at most a year); body.email filters.
function listLoginHistory_(session, body) {
  if (!presenceAllowed_(session)) throw new Error('Login history is for the Admin and ACC managers.');
  var from = new Date(String((body && body.from) || ''));
  if (isNaN(from.getTime())) from = new Date(Date.now() - 30 * 86400000);
  var min = new Date(Date.now() - 366 * 86400000);
  if (from < min) from = min;
  var who = String((body && body.email) || '').trim().toLowerCase();
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(LOGIN_SHEET);
  var out = [];
  if (sh) readSheetAsObjects_(sh).forEach(function (r) {
    var at = presIso_(r.At);
    if (!at || at < from.toISOString()) return;
    if (who && String(r.Email || '').toLowerCase() !== who) return;
    out.push({ at: at, email: String(r.Email || ''), userId: String(r.UserId || ''), orgId: String(r.OrgId || ''), event: String(r.Event || ''), device: String(r.Device || ''), details: String(r.Details || '') });
  });
  out.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  return { from: from.toISOString(), entries: out.slice(0, 2000), truncated: out.length > 2000 };
}

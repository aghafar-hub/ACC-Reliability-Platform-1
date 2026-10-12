/**
 * Session tokens — Foundation spec §5 (cross-module session verification).
 *
 * A session token is a compact signed payload that every module's Apps
 * Script backend can verify on its own, with no callback to Platform Core
 * per request. The signing secret lives only in each project's Script
 * Properties (SESSION_SIGNING_SECRET) — set to the identical value in
 * Platform Core's project and every module's project — and is never stored
 * in a Sheet or committed to the repo.
 *
 * Token shape: base64url(JSON payload) + '.' + hex HMAC-SHA256 signature.
 * Payload: { uid, email, org, roles, iat, exp, sid }. Roles are captured at
 * login; a role change cancels that person's sign-ins (revokeUserSessions_),
 * so the next sign-in carries the new roles. exp: SESSION_SHORT_HOURS after
 * sign-in, or SESSION_REMEMBER_DAYS with "keep me signed in". sid: this
 * sign-in's own id, so signing out ends just this device.
 *
 * Only Platform Core issues tokens (issueSessionToken_). Every module,
 * including this one, verifies them the same way: copy requireSession_,
 * getSessionSecret_, base64UrlDecode_ and signPayload_ verbatim into that
 * module's own Apps Script project (see docs/deployment-guide.md).
 */

function getSessionSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('SESSION_SIGNING_SECRET');
  if (!secret) {
    throw new Error('SESSION_SIGNING_SECRET script property is not set.');
  }
  return secret;
}

function base64UrlEncode_(str) {
  return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
}

function base64UrlDecode_(str) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(str)).getDataAsString();
}

function signPayload_(payloadB64) {
  var digest = Utilities.computeHmacSha256Signature(payloadB64, getSessionSecret_());
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/**
 * Platform-Core-only: builds a fresh token for userId, embedding the
 * user's current org and roles so modules never need to look them up.
 */
var SESSION_SHORT_HOURS = 12;
var SESSION_REMEMBER_DAYS = 30;

function issueSessionToken_(userId, remember) {
  var user = findRowByColumn_(getSheet_(SHEET_NAMES.USERS), 'UserId', userId);
  if (!user) {
    throw new Error('User not found.');
  }
  var roleRows = readSheetAsObjects_(getSheet_(SHEET_NAMES.USER_ROLES))
    .filter(function (r) { return r.UserId === userId; });
  var roles = roleRows.map(function (r) { return r.RoleId; });

  var now = Date.now();
  var life = remember === false ? SESSION_SHORT_HOURS * 3600000 : SESSION_REMEMBER_DAYS * 86400000;
  var payload = { uid: userId, email: user.Email, org: user.OrgId, roles: roles, iat: now, exp: now + life, sid: Utilities.getUuid() };
  var payloadB64 = base64UrlEncode_(JSON.stringify(payload));
  return payloadB64 + '.' + signPayload_(payloadB64);
}

/**
 * Verifies a session token and returns its claims as
 * { userId, email, orgId, roles, issuedAt }. Throws on a missing,
 * malformed or tampered token.
 */
function requireSession_(sessionToken) {
  if (!sessionToken || sessionToken.indexOf('.') === -1) {
    throw new Error('Missing or malformed session token.');
  }
  var dot = sessionToken.indexOf('.');
  var payloadB64 = sessionToken.substring(0, dot);
  var signature = sessionToken.substring(dot + 1);
  if (!sameText_(signPayload_(payloadB64), signature)) { // constant time (Auth.js)
    throw new Error('Invalid session token.');
  }
  var payload = JSON.parse(base64UrlDecode_(payloadB64));
  checkSessionAlive_(payload);
  return {
    userId: payload.uid,
    email: payload.email,
    orgId: payload.org,
    roles: payload.roles || [],
    issuedAt: payload.iat,
    expiresAt: Number(payload.exp) || 0,
    sessionId: payload.sid || ''
  };
}

// Cancels every sign-in of userId made before now (Platform Core only).
// Called inside the caller's own lock; a single appendRow needs none.
function revokeUserSessions_(userId, why) {
  sessionRevokeRow_([String(userId), '', new Date(), String(why || '').slice(0, 80)]);
}

// Ends one sign-in (signing out on one device).
function revokeOneSession_(userId, sessionId) {
  if (!sessionId) return;
  sessionRevokeRow_([String(userId), String(sessionId), new Date(), 'Signed out']);
}

function sessionRevokeRow_(row) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(SESSION_REVOKE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SESSION_REVOKE_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['UserId', 'SessionId', 'RevokedAt', 'Why']]);
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
  // rows older than the longest sign-in can't matter any more
  var keep = Date.now() - (SESSION_REMEMBER_DAYS + 1) * 86400000;
  var last = sh.getLastRow();
  if (last > 400) {
    var at = sh.getRange(2, 3, last - 1, 1).getValues();
    var old = 0;
    while (old < at.length && new Date(at[old][0]).getTime() < keep) old++;
    if (old > 0) sh.deleteRows(2, old);
  }
  try { CacheService.getScriptCache().remove('sess|lists'); } catch (e) { /* the cache ends by itself */ }
}

// ── When a sign-in ends (audit F-02) ───────────────────────────────────────
// Identical in Platform Core (Session.js), Oil and Vibration (Auth.js).
// A token is refused when it is past its end time ("exp"; a token from
// before end times existed lasts SESSION_DEFAULT_DAYS from its "iat"), when
// the person is no longer an Active user, when all their sign-ins were
// cancelled after it was issued (deleted, deactivated, roles changed,
// password changed or reset), or when that one sign-in was signed out.
// Both lists live in the Platform Core sheet (USERS, SESSION_REVOKED) and
// are re-read at most every SESSION_LIST_CACHE_SEC seconds.
var SESSION_ENDED_MSG = 'Your sign-in has ended — please sign in again.';
var SESSION_DEFAULT_DAYS = 30;
var SESSION_REVOKE_SHEET = 'SESSION_REVOKED';
var SESSION_LIST_CACHE_SEC = 120;

function sessionLists_() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  var hit = cache ? cache.get('sess|lists') : null;
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* rebuild */ } }
  var id = '';
  try { id = PropertiesService.getScriptProperties().getProperty('PLATFORM_CORE_SPREADSHEET_ID') || ''; } catch (e) { id = ''; }
  if (!id) return null;
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return null; }
  var lists = { users: {}, sids: {} };
  var us = ss.getSheetByName('USERS');
  if (!us) return null;
  var uv = us.getDataRange().getValues();
  var uh = (uv[0] || []).map(function (h) { return String(h).trim(); });
  var ui = uh.indexOf('UserId'), si = uh.indexOf('Status');
  if (ui === -1) return null;
  for (var r = 1; r < uv.length; r++) {
    var uid = String(uv[r][ui] || '').trim();
    if (uid) lists.users[uid] = { active: si === -1 || String(uv[r][si] || '').trim() === 'Active', revokedAt: 0 };
  }
  var rs = ss.getSheetByName(SESSION_REVOKE_SHEET);
  if (rs) {
    var rv = rs.getDataRange().getValues();
    for (var j = 1; j < rv.length; j++) {
      var ru = String(rv[j][0] || '').trim(), sid = String(rv[j][1] || '').trim();
      var at = rv[j][2] instanceof Date ? rv[j][2].getTime() : Number(new Date(rv[j][2]).getTime()) || 0;
      if (sid) lists.sids[sid] = 1;
      else if (ru && lists.users[ru] && at > lists.users[ru].revokedAt) lists.users[ru].revokedAt = at;
    }
  }
  if (cache) { try { cache.put('sess|lists', JSON.stringify(lists), SESSION_LIST_CACHE_SEC); } catch (e) { /* too big: read each time */ } }
  return lists;
}

// Throws SESSION_ENDED_MSG unless the signed token payload is still alive.
function checkSessionAlive_(payload) {
  var iat = Number(payload && payload.iat) || 0;
  var exp = Number(payload && payload.exp) || (iat + SESSION_DEFAULT_DAYS * 86400000);
  if (!iat || Date.now() > exp) throw new Error(SESSION_ENDED_MSG);
  var lists = sessionLists_();
  if (!lists || !Object.keys(lists.users).length) return; // Platform Core sheet not reachable: the end time still applies
  var u = lists.users[String(payload.uid || '')];
  if (!u || !u.active) throw new Error(SESSION_ENDED_MSG);
  if (u.revokedAt && iat < u.revokedAt) throw new Error(SESSION_ENDED_MSG);
  if (payload.sid && lists.sids[String(payload.sid)]) throw new Error(SESSION_ENDED_MSG);
}

function isSessionEndedError_(err) {
  return !!err && String(err.message || err).indexOf(SESSION_ENDED_MSG) !== -1;
}


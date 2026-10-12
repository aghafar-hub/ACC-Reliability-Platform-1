// Session-token verification (Phase 0) — the same token every module gets
// from Platform Core at login, verified here with no call back to Platform
// Core. Copied verbatim from backend/platform-core/src/Session.js (see that
// file for the token format).
//
// Needs Script Property SESSION_SIGNING_SECRET set to the same value as
// Platform Core's. Until it is set, getSessionOrNull_ returns null and
// ModuleAccess.js leaves the module open, exactly as before Phase 0 —
// deploy the frontend that sends tokens FIRST, then set the secret.

function getSessionSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('SESSION_SIGNING_SECRET');
  if (!secret) {
    throw new Error('SESSION_SIGNING_SECRET script property is not set.');
  }
  return secret;
}

function base64UrlDecode_(str) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(str)).getDataAsString();
}

function signPayload_(payloadB64) {
  var digest = Utilities.computeHmacSha256Signature(payloadB64, getSessionSecret_());
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function requireSession_(sessionToken) {
  if (!sessionToken || sessionToken.indexOf('.') === -1) {
    throw new Error('Missing or malformed session token.');
  }
  var dot = sessionToken.indexOf('.');
  var payloadB64 = sessionToken.substring(0, dot);
  var signature = sessionToken.substring(dot + 1);
  if (!timingSafeEqual_(signPayload_(payloadB64), signature)) {
    throw new Error('Invalid session token.');
  }
  var payload = JSON.parse(base64UrlDecode_(payloadB64));
  checkSessionAlive_(payload);
  return {
    userId: payload.uid,
    email: payload.email,
    orgId: payload.org,
    roles: payload.roles || [],
    issuedAt: payload.iat
  };
}

// null for no token, a bad token, or no secret configured yet.
function getSessionOrNull_(sessionToken) {
  if (!sessionToken || !PropertiesService.getScriptProperties().getProperty('SESSION_SIGNING_SECRET')) return null;
  try {
    return requireSession_(sessionToken);
  } catch (err) {
    return null;
  }
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

// Same time whatever position the first difference is at (audit I-01).
function timingSafeEqual_(a, b) {
  a = String(a == null ? "" : a); b = String(b == null ? "" : b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

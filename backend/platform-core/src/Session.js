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
 * Payload: { uid, email, org, roles, iat }. Roles are captured at login
 * time, so a role change takes effect on the user's next login — there is
 * no shorter-lived refresh, per the v1 decision to skip idle timeout/re-auth.
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
function issueSessionToken_(userId) {
  var user = findRowByColumn_(getSheet_(SHEET_NAMES.USERS), 'UserId', userId);
  if (!user) {
    throw new Error('User not found.');
  }
  var roleRows = readSheetAsObjects_(getSheet_(SHEET_NAMES.USER_ROLES))
    .filter(function (r) { return r.UserId === userId; });
  var roles = roleRows.map(function (r) { return r.RoleId; });

  var payload = { uid: userId, email: user.Email, org: user.OrgId, roles: roles, iat: Date.now() };
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
  if (signPayload_(payloadB64) !== signature) {
    throw new Error('Invalid session token.');
  }
  var payload = JSON.parse(base64UrlDecode_(payloadB64));
  return {
    userId: payload.uid,
    email: payload.email,
    orgId: payload.org,
    roles: payload.roles || [],
    issuedAt: payload.iat
  };
}

/**
 * Session token verification — verify-only copy of Platform Core's
 * src/Session.js (see that file for the full design rationale). Only
 * Platform Core issues tokens; every module, including this one, verifies
 * them locally against a shared secret, with no callback to Platform Core
 * per request.
 *
 * SESSION_SIGNING_SECRET must be set in this project's Script Properties
 * to the exact same value as Platform Core's — see docs/deployment-guide.md.
 */

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

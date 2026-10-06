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

// null for no token, a bad token, or no secret configured yet.
function getSessionOrNull_(sessionToken) {
  if (!sessionToken || !PropertiesService.getScriptProperties().getProperty('SESSION_SIGNING_SECRET')) return null;
  try {
    return requireSession_(sessionToken);
  } catch (err) {
    return null;
  }
}

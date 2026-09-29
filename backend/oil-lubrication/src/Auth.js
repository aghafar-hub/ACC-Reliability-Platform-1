// Shared secret + session-token verification (Option A / Option B Phase 1 hardening).
// Split out of the old monolithic Code.js (see docs/oil-lubrication-migration-notes.md).


// OPTION A HARDENING (see docs/oil-lubrication-migration-notes.md): a
// shared secret checked on every request, read from this project's own
// Script Properties (Project Settings → Script Properties → API_SECRET) —
// never hardcoded here. This is NOT real per-user authentication: there's
// no login system in this app, and the secret is baked into the public
// frontend bundle just like the webhook URL already is, so anyone who
// downloads the JS can read it. What it does do is raise the bar from
// "anyone who has ever seen this URL, forever" to "anyone with both the
// URL and this value" — and lets the value be rotated (a new Script
// Property + a frontend redeploy) if it ever leaks, without needing a
// whole new Apps Script deployment.
//
// FAILS OPEN if API_SECRET isn't set yet: this backend is already live for
// ~20 people, so rolling this code out must not lock everyone out the
// instant it deploys, before the Script Property has been added. Once
// API_SECRET is set, enforcement begins immediately on the next request.
function checkSecret_(providedSecret) {
  var expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected) return true;
  return providedSecret === expected;
}



// OPTION B PHASE 1 (see docs/oil-lubrication-migration-notes.md): verifies
// the signed session token issued by Platform Core when a request carries
// one, so this app knows WHO is acting — not just that they had the shared
// secret. Copied verbatim from backend/platform-core/src/Session.js, per
// that file's own instruction ("every module... copy requireSession_,
// getSessionSecret_, base64UrlDecode_ and signPayload_ verbatim into that
// module's own Apps Script project") — SESSION_SIGNING_SECRET must be set
// to the IDENTICAL value in this project's Script Properties as in
// Platform Core's, or every token fails signature verification.
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


// Combines the two Phase-1 checks: the shared secret still gates every
// request exactly as before (checkSecret_), and a session token — when the
// caller sends one — is additionally required to actually be valid. A
// request with NO session token still gets through on the shared secret
// alone (a not-yet-redeployed frontend, or a device whose user has no
// Platform Core account yet), so this can ship without an instant cutover;
// a request that DOES send a token but it's malformed or tampered with is
// rejected outright, since a broken token is worse than no token. Returns
// the verified session (or null) so callers can log/attribute the request
// — this does not yet restrict WHAT a verified user may do (that's RBAC,
// a later phase), only who they're known to be.
function checkAuth_(providedSecret, sessionToken) {
  if (!checkSecret_(providedSecret)) {
    return { ok: false, session: null };
  }
  if (!sessionToken) {
    return { ok: true, session: null };
  }
  // BUGFIX: once the frontend redeploy lands, EVERY logged-in request sends
  // a sessionToken — including in the window between that redeploy and
  // someone actually setting SESSION_SIGNING_SECRET on THIS project (they're
  // two separate manual steps). Before this check, requireSession_ would
  // throw "SESSION_SIGNING_SECRET script property is not set" for every one
  // of those requests, which the catch below turned into a flat rejection —
  // failing CLOSED the moment the frontend shipped, exactly the instant
  // lockout checkAuth_ was designed to avoid. Treat "not configured yet" as
  // identical to "no token sent" (fall back to the shared secret alone),
  // and reserve the reject-outright path for a token that's actually
  // malformed or tampered once the secret is really set.
  var secretConfigured = !!PropertiesService.getScriptProperties().getProperty("SESSION_SIGNING_SECRET");
  if (!secretConfigured) {
    return { ok: true, session: null };
  }
  try {
    return { ok: true, session: requireSession_(sessionToken) };
  } catch (err) {
    return { ok: false, session: null };
  }
}

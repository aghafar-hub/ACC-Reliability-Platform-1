/**
 * Client-side decode of a session token's payload, for UI purposes only
 * (e.g. deciding which nav items or actions to show). This never verifies
 * the signature — that's meaningless without the server's secret, and
 * irrelevant anyway: every real permission check happens server-side on
 * each request (see each backend's src/Session.js, requireSession_). Treat
 * anything decoded here as a hint, never a security boundary.
 */

export type SessionClaims = {
  userId: string;
  email: string;
  orgId: string;
  roles: string[];
  issuedAt: number;
};

export function decodeSessionClaims(sessionToken: string): SessionClaims | null {
  try {
    const dot = sessionToken.indexOf('.');
    if (dot === -1) return null;
    const payloadB64 = sessionToken.substring(0, dot);
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return {
      userId: payload.uid,
      email: payload.email,
      orgId: payload.org,
      roles: payload.roles || [],
      issuedAt: payload.iat,
    };
  } catch {
    return null;
  }
}

export const ORG_ACC = 'ORG-ACC';
export const ROLE = {
  ADMIN: 'ROLE-ADMIN',
  TECHNICIAN: 'ROLE-TECH',
  CONTRACTOR_ENGINEER: 'ROLE-CENG',
  RELIABILITY_ENGINEER: 'ROLE-RENG',
  MANAGER: 'ROLE-MGR',
} as const;

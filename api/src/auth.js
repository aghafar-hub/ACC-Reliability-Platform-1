// Password hashing + session tokens. Replaces Platform Core's Auth.js/
// Session.js — same shape of session payload the survey found
// ({uid, email, org, roles, iat}), just issued/verified with the
// well-tested `jsonwebtoken` library instead of hand-rolled HMAC signing.
//
// Passwords use bcrypt (via bcryptjs, pure-JS so it needs no native build
// step on Cloud Run) rather than the existing SHA-256 + per-user salt —
// bcrypt is purpose-built for passwords (deliberately slow, built-in salt)
// where a general-purpose hash function isn't. Real user records don't
// exist in this database yet (see database/README.md), so there's no
// migration-compatibility reason to match the old scheme; by the time real
// accounts move over, the plan is a forced password reset on first login
// rather than trying to carry old hashes forward.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set — copy .env.example to .env for local dev");

const TOKEN_TTL = "12h"; // a work shift, roughly matching how long a plant-floor session realistically needs

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}

export async function verifyPassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

// `roles` is an array of role_name strings (e.g. ["Technician"]) — kept in
// the token so every request doesn't need a join back to user_roles, same
// tradeoff the original session token already makes (a role change needs a
// fresh login to take effect, not a live re-check).
export function issueToken({ userId, email, orgId, roles }) {
  return jwt.sign({ uid: userId, email, org: orgId, roles }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws if invalid/expired — callers should catch
}

// Express middleware: requires a valid `Authorization: Bearer <token>`
// header, attaches the decoded payload as req.user, or responds 401.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Express middleware factory: requires the caller to hold at least one of
// the given roles (or the '*' wildcard, matching ROLE-ADMIN's existing
// meaning). Must run after requireAuth.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (roles.includes("*") || roles.some((r) => allowedRoles.includes(r))) return next();
    res.status(403).json({ error: "Forbidden — insufficient role" });
  };
}

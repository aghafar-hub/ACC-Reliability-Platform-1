import { Router } from "express";
import { pool } from "../db.js";
import { verifyPassword, issueToken, requireAuth } from "../auth.js";

export const authRouter = Router();

// POST /auth/login { email, password } -> { token, user }
// Replaces Platform Core's Auth.js login action.
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const [rows] = await pool.query(
    `SELECT u.user_id, u.email, u.password_hash, u.org_id, u.status, u.must_change_password,
            GROUP_CONCAT(r.role_name) AS role_names
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r ON r.role_id = ur.role_id
      WHERE u.email = ?
      GROUP BY u.user_id`,
    [email],
  );
  const user = rows[0];
  // Same error for "no such user" and "wrong password" — don't leak which one.
  if (!user || user.status !== "Active") return res.status(401).json({ error: "Invalid email or password" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const roles = user.role_names ? user.role_names.split(",") : [];
  const token = issueToken({ userId: user.user_id, email: user.email, orgId: user.org_id, roles });

  res.json({
    token,
    user: {
      userId: user.user_id,
      email: user.email,
      orgId: user.org_id,
      roles,
      mustChangePassword: !!user.must_change_password,
    },
  });
});

// GET /auth/me -> the decoded session, for the frontend to confirm a stored
// token is still valid on app load (replaces a live session-verify call).
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Users — replaces Platform Core's Users.js (the admin-facing "Manage
// Users" screen's backend). Role assignment uses PUT /users/:id/roles with
// a full replacement array rather than individual add/remove endpoints —
// simpler for an admin UI that shows a multi-select and saves the whole
// set at once, and avoids any ambiguity about ordering of partial changes.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// GET /users?orgId=&status= — App Admin only; this is account
// administration, not something every logged-in user should be able to
// browse.
usersRouter.get("/", requireRole("App Admin"), async (req, res) => {
  const { orgId, status } = req.query;
  const where = [];
  const params = [];
  if (orgId) {
    where.push("u.org_id = ?");
    params.push(orgId);
  }
  if (status) {
    where.push("u.status = ?");
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT u.user_id, u.email, u.org_id, u.status, u.must_change_password, u.theme_palette,
            u.created_at, u.updated_at, o.org_code, GROUP_CONCAT(r.role_name) AS role_names
       FROM users u
       LEFT JOIN organizations o ON o.org_id = u.org_id
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r ON r.role_id = ur.role_id
       ${whereSql}
      GROUP BY u.user_id
      ORDER BY u.email`,
    params,
  );
  res.json({ users: rows.map((r) => ({ ...r, roles: r.role_names ? r.role_names.split(",") : [] })) });
});

// POST /users — App Admin creates an account with a temporary password;
// must_change_password defaults true so the new user is forced to set
// their own on first login.
usersRouter.post("/", requireRole("App Admin"), async (req, res) => {
  const { email, temporaryPassword, orgId, roleIds } = req.body || {};
  if (!email || !temporaryPassword || !orgId) return res.status(400).json({ error: "email, temporaryPassword, and orgId are required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const passwordHash = await hashPassword(temporaryPassword);
    const [result] = await conn.query(
      "INSERT INTO users (email, password_hash, password_salt, org_id, must_change_password) VALUES (?, ?, 'bcrypt-self-salted', ?, TRUE)",
      [email, passwordHash, orgId],
    );
    const userId = result.insertId;
    for (const roleId of roleIds || []) {
      await conn.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
    }
    await conn.commit();
    res.status(201).json({ userId });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `A user with email ${email} already exists` });
    const fkError = friendlyForeignKeyError(err, {
      fk_users_org: `Organization ${orgId} does not exist`,
      fk_user_roles_role: "One of the given roleIds does not exist",
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  } finally {
    conn.release();
  }
});

// PUT /users/:userId — App Admin edits status/org/theme. Email and
// password changes go through their own endpoints below, not this
// generic one, since they need different validation (password hashing,
// email uniqueness messaging).
usersRouter.put("/:userId", requireRole("App Admin"), async (req, res) => {
  const allowedFields = { status: "status", orgId: "org_id", themePalette: "theme_palette" };
  const sets = [];
  const params = [];
  for (const [bodyKey, column] of Object.entries(allowedFields)) {
    if (req.body?.[bodyKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(req.body[bodyKey]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "No updatable fields in request body" });

  try {
    const [result] = await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE user_id = ?`, [
      ...params,
      req.params.userId,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });
    res.json({ status: "ok" });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_users_org: `Organization ${req.body.orgId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// PUT /users/:userId/roles { roleIds: [...] } — full replacement of the
// user's role set, in one transaction.
usersRouter.put("/:userId/roles", requireRole("App Admin"), async (req, res) => {
  const { roleIds } = req.body || {};
  if (!Array.isArray(roleIds)) return res.status(400).json({ error: "roleIds must be an array" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM user_roles WHERE user_id = ?", [req.params.userId]);
    for (const roleId of roleIds) {
      await conn.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [req.params.userId, roleId]);
    }
    await conn.commit();
    res.json({ status: "ok" });
  } catch (err) {
    await conn.rollback();
    const fkError = friendlyForeignKeyError(err, {
      fk_user_roles_user: `User ${req.params.userId} does not exist`,
      fk_user_roles_role: "One of the given roleIds does not exist",
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  } finally {
    conn.release();
  }
});

// POST /users/me/change-password { currentPassword, newPassword } — the
// caller changes their OWN password. Deliberately scoped to the caller's
// own session (req.user.uid), not an arbitrary :userId, so this endpoint
// can never be used to change someone else's password.
usersRouter.post("/me/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword and newPassword are required" });

  const [rows] = await pool.query("SELECT password_hash FROM users WHERE user_id = ?", [req.user.uid]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });

  const ok = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const newHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE user_id = ?", [
    newHash,
    req.user.uid,
  ]);
  res.json({ status: "ok" });
});

// ── Roles (reference list — a fixed set per the platform spec: App Admin,
//    Technician, Contractor Engineer, Reliability Engineer, Manager; no
//    POST here, roles aren't user-creatable) ─────────────────────────────
export const rolesRouter = Router();
rolesRouter.use(requireAuth);
rolesRouter.get("/", async (_req, res) => {
  const [rows] = await pool.query("SELECT * FROM roles ORDER BY role_name");
  res.json({ roles: rows });
});

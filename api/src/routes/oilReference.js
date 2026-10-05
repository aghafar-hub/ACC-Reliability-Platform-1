// Smaller Oil Lubrication reference/admin tables that don't need a full
// CRUD surface of their own: action_phrases (OL_ACTION_PHRASES),
// module_responsibilities (OL_MODULE_RESPONSIBILITIES), notify_reviewers
// (OL_NOTIFY_REVIEWERS), in_app_notifications (OL_IN_APP_NOTIFICATIONS).
//
// sample_digest_log (OL_SAMPLE_DIGEST_LOG) is deliberately NOT exposed
// here — it's a pure internal dedup tracker for the monthly sample-overdue
// digest job, which isn't built yet (see database/README.md's roadmap);
// nothing outside that job itself has a reason to read or write it.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const oilReferenceRouter = Router();
oilReferenceRouter.use(requireAuth);

// ── Action phrases (pick-list backing the Contractor/ACC Action multi-select) ──
oilReferenceRouter.get("/action-phrases", async (_req, res) => {
  const [rows] = await pool.query("SELECT * FROM action_phrases ORDER BY phrase");
  res.json({ actionPhrases: rows });
});

oilReferenceRouter.post("/action-phrases", requireRole("App Admin"), async (req, res) => {
  const { phrase } = req.body || {};
  if (!phrase) return res.status(400).json({ error: "phrase is required" });
  const [result] = await pool.query("INSERT INTO action_phrases (phrase) VALUES (?)", [phrase]);
  res.status(201).json({ phraseId: result.insertId });
});

// ── Module responsibilities (module x org x role -> a real person, for
//    notification routing) ─────────────────────────────────────────────
oilReferenceRouter.get("/module-responsibilities", async (req, res) => {
  const { orgId } = req.query;
  const where = orgId ? "WHERE mr.org_id = ?" : "";
  const params = orgId ? [orgId] : [];
  const [rows] = await pool.query(
    `SELECT mr.*, o.org_code, r.role_name, u.email
       FROM module_responsibilities mr
       JOIN organizations o ON o.org_id = mr.org_id
       LEFT JOIN roles r ON r.role_id = mr.role_id
       JOIN users u ON u.user_id = mr.user_id
       ${where}`,
    params,
  );
  res.json({ responsibilities: rows });
});

oilReferenceRouter.post("/module-responsibilities", requireRole("App Admin"), async (req, res) => {
  const { moduleId, orgId, roleId, userId } = req.body || {};
  if (!moduleId || !orgId || !userId) return res.status(400).json({ error: "moduleId, orgId, and userId are required" });

  try {
    const [result] = await pool.query(
      "INSERT INTO module_responsibilities (module_id, org_id, role_id, user_id) VALUES (?, ?, ?, ?)",
      [moduleId, orgId, roleId || null, userId],
    );
    res.status(201).json({ responsibilityId: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A responsibility for this module/org/role already exists" });
    const fkError = friendlyForeignKeyError(err, {
      fk_resp_org: `Organization ${orgId} does not exist`,
      fk_resp_role: `Role ${roleId} does not exist`,
      fk_resp_user: `User ${userId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// ── Notify reviewers (plain org -> reviewer distribution list) ──────────
oilReferenceRouter.get("/notify-reviewers", async (req, res) => {
  const { orgId } = req.query;
  const where = orgId ? "WHERE nr.org_id = ?" : "";
  const params = orgId ? [orgId] : [];
  const [rows] = await pool.query(
    `SELECT nr.org_id, o.org_code, nr.user_id, u.email
       FROM notify_reviewers nr JOIN organizations o ON o.org_id = nr.org_id JOIN users u ON u.user_id = nr.user_id ${where}`,
    params,
  );
  res.json({ reviewers: rows });
});

oilReferenceRouter.post("/notify-reviewers", requireRole("App Admin"), async (req, res) => {
  const { orgId, userId } = req.body || {};
  if (!orgId || !userId) return res.status(400).json({ error: "orgId and userId are required" });
  try {
    await pool.query("INSERT INTO notify_reviewers (org_id, user_id) VALUES (?, ?)", [orgId, userId]);
    res.status(201).json({ status: "ok" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This user is already a reviewer for this organization" });
    const fkError = friendlyForeignKeyError(err, {
      fk_notify_org: `Organization ${orgId} does not exist`,
      fk_notify_user: `User ${userId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// ── In-app notifications ─────────────────────────────────────────────────
// GET /in-app-notifications — always scoped to the CALLER, never another
// user's inbox by id, matching how a notification bell works in practice.
oilReferenceRouter.get("/in-app-notifications", async (req, res) => {
  const unreadOnly = req.query.unreadOnly === "true";
  const where = unreadOnly ? "AND is_read = FALSE" : "";
  const [rows] = await pool.query(
    `SELECT * FROM in_app_notifications WHERE recipient_user_id = ? ${where} ORDER BY created_at DESC LIMIT 100`,
    [req.user.uid],
  );
  res.json({ notifications: rows });
});

oilReferenceRouter.put("/in-app-notifications/:notificationId/read", async (req, res) => {
  const [result] = await pool.query(
    "UPDATE in_app_notifications SET is_read = TRUE, read_at = NOW() WHERE notification_id = ? AND recipient_user_id = ?",
    [req.params.notificationId, req.user.uid],
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "Notification not found" });
  res.json({ status: "ok" });
});

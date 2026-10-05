// Vib Actions — replaces "📋 Action Tracker" (Vibration Analysis's own,
// separate from Oil Lubrication's oil_actions table).
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const vibActionsRouter = Router();
vibActionsRouter.use(requireAuth);

// GET /vib-actions?equipmentId=&status=&orgId=&page=&limit=
vibActionsRouter.get("/", async (req, res) => {
  const { equipmentId, status, orgId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("a.equipment_id = ?");
    params.push(equipmentId);
  }
  if (status) {
    where.push("a.action_status = ?");
    params.push(status);
  }
  if (orgId) {
    where.push("a.org_id = ?");
    params.push(orgId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT a.*, o.org_code FROM vib_actions a LEFT JOIN organizations o ON o.org_id = a.org_id ${whereSql} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM vib_actions a ${whereSql}`, params);
  res.json({ actions: rows, page, limit, total });
});

// POST /vib-actions
vibActionsRouter.post("/", async (req, res) => {
  const { actionNo, equipmentId, readingDate, triggerType, triggerPoint, triggerValue, machineStatus, orgId } = req.body || {};
  if (!equipmentId) return res.status(400).json({ error: "equipmentId is required" });

  try {
    const [result] = await pool.query(
      `INSERT INTO vib_actions (action_no, equipment_id, reading_date, trigger_type, trigger_point, trigger_value, machine_status, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [actionNo, equipmentId, readingDate || null, triggerType, triggerPoint, triggerValue ?? null, machineStatus, orgId || null],
    );
    res.status(201).json({ actionUid: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, {
      fk_vibactions_equipment: `Equipment ${equipmentId} does not exist`,
      fk_vibactions_org: `Organization ${orgId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// PUT /vib-actions/:actionUid — the contractor/ACC back-and-forth.
vibActionsRouter.put("/:actionUid", async (req, res) => {
  const allowedFields = {
    actionStatus: "action_status",
    completionDate: "completion_date",
    contractorAction: "contractor_action",
    accAction: "acc_action",
    agreedAction: "agreed_action",
  };
  const sets = [];
  const params = [];
  for (const [bodyKey, column] of Object.entries(allowedFields)) {
    if (req.body?.[bodyKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(req.body[bodyKey]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "No updatable fields in request body" });

  const [result] = await pool.query(`UPDATE vib_actions SET ${sets.join(", ")} WHERE action_uid = ?`, [
    ...params,
    req.params.actionUid,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Action not found" });
  res.json({ status: "ok" });
});

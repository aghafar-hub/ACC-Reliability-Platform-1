// Oil Actions — replaces "Action Tracker". action_no is kept as a display
// label only (schema survey: not globally unique — repeats across
// different lp_id), the real identity is the surrogate action_uid.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const oilActionsRouter = Router();
oilActionsRouter.use(requireAuth);

// GET /oil-actions?lpId=&status=&orgId=&page=&limit=
oilActionsRouter.get("/", async (req, res) => {
  const { lpId, status, orgId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (lpId) {
    where.push("a.lp_id = ?");
    params.push(lpId);
  }
  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }
  if (orgId) {
    where.push("a.org_id = ?");
    params.push(orgId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT a.*, o.org_code
       FROM oil_actions a
       LEFT JOIN organizations o ON o.org_id = a.org_id
       ${whereSql}
      ORDER BY a.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM oil_actions a ${whereSql}`, params);
  res.json({ actions: rows, page, limit, total });
});

// GET /oil-actions/:actionUid
oilActionsRouter.get("/:actionUid", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, o.org_code FROM oil_actions a LEFT JOIN organizations o ON o.org_id = a.org_id WHERE a.action_uid = ?`,
    [req.params.actionUid],
  );
  if (!rows[0]) return res.status(404).json({ error: "Action not found" });
  res.json({ action: rows[0] });
});

// POST /oil_actions — any authenticated user (actions get raised by
// whoever reviews a sample result, not just admins).
oilActionsRouter.post("/", async (req, res) => {
  const { actionNo, lpId, oilType, revisionDate, sampleDate, sampleResult, sampleAnalysis, status, orgId } = req.body || {};
  if (!lpId) return res.status(400).json({ error: "lpId is required" });

  try {
    const [result] = await pool.query(
      `INSERT INTO oil_actions (action_no, lp_id, oil_type, revision_date, sample_date, sample_result, sample_analysis, status, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [actionNo, lpId, oilType, revisionDate, sampleDate, sampleResult, sampleAnalysis, status || "Open", orgId || null],
    );
    res.status(201).json({ actionUid: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, {
      fk_actions_lp: `Lubrication point ${lpId} does not exist`,
      fk_actions_org: `Organization ${orgId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// PUT /oil-actions/:actionUid — the normal path for the contractor/ACC
// back-and-forth (status changes, agreed action, closing comment).
oilActionsRouter.put("/:actionUid", async (req, res) => {
  const allowedFields = {
    status: "status",
    contractorAction: "contractor_action",
    completedDate: "completed_date",
    prevMonthAgreedAction: "prev_month_agreed_action",
    accAction: "acc_action",
    agreedAction: "agreed_action",
    closingComment: "closing_comment",
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

  const [result] = await pool.query(`UPDATE oil_actions SET ${sets.join(", ")} WHERE action_uid = ?`, [
    ...params,
    req.params.actionUid,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Action not found" });
  res.json({ status: "ok" });
});

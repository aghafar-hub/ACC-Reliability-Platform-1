// Routines — replaces "ROUTINES" + "OA_ROUTINE_ITEMS" (the work-order/
// approval workflow: Contractor Engineer/Manager creates -> Technician
// executes -> Contractor Engineer approves). created_by/assigned_to/
// approved_by are real FKs to users now (schema survey finding #4: these
// were free-text strings before) — the caller's own user_id (from their
// session token) is used for created_by, never trusted from the request
// body, same principle as the original app deriving identity from the
// logged-in session rather than a free-text field.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";
import { writeAuditLog } from "../auditLog.js";

export const routinesRouter = Router();
routinesRouter.use(requireAuth);

// GET /routines?status=&orgId=&assignedTo=&page=&limit=
routinesRouter.get("/", async (req, res) => {
  const { status, orgId, assignedTo } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (status) {
    where.push("r.status = ?");
    params.push(status);
  }
  if (orgId) {
    where.push("r.org_id = ?");
    params.push(orgId);
  }
  if (assignedTo) {
    where.push("r.assigned_to = ?");
    params.push(assignedTo);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT r.*, creator.email AS created_by_email, assignee.email AS assigned_to_email, o.org_code
       FROM routines r
       LEFT JOIN users creator ON creator.user_id = r.created_by
       LEFT JOIN users assignee ON assignee.user_id = r.assigned_to
       LEFT JOIN organizations o ON o.org_id = r.org_id
       ${whereSql}
      ORDER BY r.due_date
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM routines r ${whereSql}`, params);
  res.json({ routines: rows, page, limit, total });
});

// GET /routines/:routineId — includes its items (one row per LP point).
routinesRouter.get("/:routineId", async (req, res) => {
  const [routineRows] = await pool.query(
    `SELECT r.*, creator.email AS created_by_email, assignee.email AS assigned_to_email, o.org_code
       FROM routines r
       LEFT JOIN users creator ON creator.user_id = r.created_by
       LEFT JOIN users assignee ON assignee.user_id = r.assigned_to
       LEFT JOIN organizations o ON o.org_id = r.org_id
      WHERE r.routine_id = ?`,
    [req.params.routineId],
  );
  if (!routineRows[0]) return res.status(404).json({ error: "Routine not found" });

  const [items] = await pool.query("SELECT * FROM routine_items WHERE routine_id = ?", [req.params.routineId]);
  res.json({ routine: routineRows[0], items });
});

// POST /routines { routeName, routeType, orgId, dueDate, area, reason?,
//                   items: [{ lpId, itemType, requiredOilType }] }
// created_by is always the caller — never accepted from the request body.
routinesRouter.post("/", async (req, res) => {
  const { routeName, routeType, orgId, dueDate, area, reason, durationDays, items } = req.body || {};
  if (!routeType) return res.status(400).json({ error: "routeType is required" });
  if (routeType === "Emergency Top Up" && !reason) {
    return res.status(400).json({ error: "reason is required for Emergency Top Up routines" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO routines (created_by, org_id, status, route_name, route_type, due_date, reason, area, duration_days)
       VALUES (?, ?, 'Unassigned', ?, ?, ?, ?, ?, ?)`,
      [req.user.uid, orgId || null, routeName, routeType, dueDate || null, reason || null, area, durationDays || null],
    );
    const routineId = result.insertId;

    for (const item of items || []) {
      await conn.query(
        `INSERT INTO routine_items (routine_id, lp_id, item_type, required_oil_type) VALUES (?, ?, ?, ?)`,
        [routineId, item.lpId, item.itemType, item.requiredOilType || null],
      );
    }

    await conn.commit();
    res.status(201).json({ routineId });
  } catch (err) {
    await conn.rollback();
    const fkError = friendlyForeignKeyError(err, {
      fk_routines_org: `Organization ${orgId} does not exist`,
      fk_routine_items_lp: "One of the lubrication points in items does not exist",
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  } finally {
    conn.release();
  }
});

// POST /routines/:routineId/assign { assignedTo } — Unassigned -> Assigned.
routinesRouter.post("/:routineId/assign", async (req, res) => {
  const { assignedTo } = req.body || {};
  if (!assignedTo) return res.status(400).json({ error: "assignedTo is required" });

  try {
    const [result] = await pool.query(
      `UPDATE routines SET assigned_to = ?, status = 'Assigned' WHERE routine_id = ? AND status = 'Unassigned'`,
      [assignedTo, req.params.routineId],
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: "Routine not found, or not in Unassigned status" });
    }
    res.json({ status: "ok" });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_routines_assigned_to: `User ${assignedTo} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// POST /routines/:routineId/submit — Assigned/InProgress -> Submitted.
// The technician marks which items were implemented first (PUT on
// /routine-items/:id, not modeled here yet), then submits the routine
// itself for approval.
routinesRouter.post("/:routineId/submit", async (req, res) => {
  const [result] = await pool.query(
    `UPDATE routines SET status = 'Submitted', submitted_date = NOW()
      WHERE routine_id = ? AND status IN ('Assigned', 'InProgress')`,
    [req.params.routineId],
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "Routine not found, or not in a submittable status" });
  }
  res.json({ status: "ok" });
});

// POST /routines/:routineId/approve { comment? } — Submitted -> Approved.
// approved_by is always the caller.
routinesRouter.post("/:routineId/approve", async (req, res) => {
  const { comment } = req.body || {};
  const [result] = await pool.query(
    `UPDATE routines
        SET status = 'Approved', approved_by = ?, approved_date = NOW(),
            acc_comment = ?, acc_comment_by = ?, acc_comment_date = IF(? IS NOT NULL, NOW(), acc_comment_date)
      WHERE routine_id = ? AND status = 'Submitted'`,
    [req.user.uid, comment || null, req.user.uid, comment || null, req.params.routineId],
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "Routine not found, or not in Submitted status" });
  }
  await writeAuditLog(pool, {
    moduleId: "oil-lubrication",
    entityType: "routine",
    entityId: req.params.routineId,
    action: "Approve",
    actingUserId: req.user.uid,
    summary: comment ? `Approved with comment: ${comment}` : "Approved",
  });
  res.json({ status: "ok" });
});

// PUT /routine-items/:routineItemId — technician marks one item done/not
// done while working a routine. Mounted on its own path (not nested under
// /routines) since it's addressed by its own id.
export const routineItemsRouter = Router();
routineItemsRouter.use(requireAuth);
routineItemsRouter.put("/:routineItemId", async (req, res) => {
  const allowedFields = {
    implemented: "implemented",
    notImplementedReason: "not_implemented_reason",
    actualDate: "actual_date",
    actualQuantity: "actual_quantity",
    sampleTaken: "sample_taken",
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

  const [result] = await pool.query(`UPDATE routine_items SET ${sets.join(", ")} WHERE routine_item_id = ?`, [
    ...params,
    req.params.routineItemId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Routine item not found" });
  res.json({ status: "ok" });
});

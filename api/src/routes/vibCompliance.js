// Compliance — replaces "📋 Compliance Tracker". The wide, one-column-
// per-month sheet becomes one row per equipment per month here; reading
// GET /compliance returns compliance_status_effective (the VIEW that
// infers "Missing" for any past month with no recorded status), so the
// daily handleMarkMissingCompliance() backfill job this replaces simply
// doesn't need to exist — there's no write cost for that housekeeping at
// all now, just a read-time CASE expression.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const vibComplianceRouter = Router();
vibComplianceRouter.use(requireAuth);

// NOTE on a real limitation: compliance_status_effective only transforms
// ROWS THAT EXIST in compliance_records — a month nobody ever wrote a
// compliance_records row for returns nothing at all, not an inferred
// "Missing" entry. That's different from the original sheet, which has a
// fixed column for every month since tracking began regardless of whether
// any equipment's status was ever recorded there. Callers that need a full
// calendar (e.g. "show every month since Jan 2023, mark gaps Missing") are
// responsible for generating the expected month list themselves and
// treating any month absent from this response as Missing — this endpoint
// deliberately doesn't try to synthesize a full calendar server-side.
//
// GET /compliance?equipmentId=&month=
vibComplianceRouter.get("/", async (req, res) => {
  const { equipmentId, month } = req.query;
  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("c.equipment_id = ?");
    params.push(equipmentId);
  }
  if (month) {
    where.push("c.month = ?");
    params.push(month);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT c.equipment_id, c.month, c.effective_status, e.description, e.line
       FROM compliance_status_effective c
       JOIN equipment e ON e.equipment_id = c.equipment_id
       ${whereSql}
      ORDER BY c.equipment_id, c.month`,
    params,
  );
  res.json({ compliance: rows });
});

// PUT /compliance/:equipmentId/:month { status }
vibComplianceRouter.put("/:equipmentId/:month", async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });
  if (!/^\d{4}-\d{2}$/.test(req.params.month)) return res.status(400).json({ error: "month must be in YYYY-MM format" });

  try {
    await pool.query(
      `INSERT INTO compliance_records (equipment_id, month, status) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [req.params.equipmentId, req.params.month, status],
    );
    res.json({ status: "ok" });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_compliance_equipment: `Equipment ${req.params.equipmentId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

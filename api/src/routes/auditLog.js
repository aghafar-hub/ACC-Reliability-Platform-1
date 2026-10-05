// Read-only query endpoint over audit_log — see src/auditLog.js for the
// write-side helper and which actions currently call it.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const auditLogRouter = Router();
auditLogRouter.use(requireAuth, requireRole("App Admin"));

// GET /audit-log?moduleId=&entityType=&entityId=&page=&limit=
auditLogRouter.get("/", async (req, res) => {
  const { moduleId, entityType, entityId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (moduleId) {
    where.push("a.module_id = ?");
    params.push(moduleId);
  }
  if (entityType) {
    where.push("a.entity_type = ?");
    params.push(entityType);
  }
  if (entityId) {
    where.push("a.entity_id = ?");
    params.push(entityId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT a.*, u.email AS acting_user_email, o.org_code
       FROM audit_log a
       LEFT JOIN users u ON u.user_id = a.acting_user_id
       LEFT JOIN organizations o ON o.org_id = a.org_id
       ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log a ${whereSql}`, params);
  res.json({ auditLog: rows, page, limit, total });
});

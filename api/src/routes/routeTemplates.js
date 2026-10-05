// Route Templates — replaces "ROUTINE_TEMPLATES". A scheduled job (not
// built here — see database/README.md's roadmap) would periodically find
// templates with next_generate_date <= today and POST a real routine from
// each, same as the current app's generateDueRouteInstances trigger.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const routeTemplatesRouter = Router();
routeTemplatesRouter.use(requireAuth);

// GET /route-templates?status=&orgId=
routeTemplatesRouter.get("/", async (req, res) => {
  const { status, orgId } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("t.status = ?");
    params.push(status);
  }
  if (orgId) {
    where.push("t.org_id = ?");
    params.push(orgId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT t.*, o.org_code FROM route_templates t LEFT JOIN organizations o ON o.org_id = t.org_id ${whereSql} ORDER BY t.next_generate_date`,
    params,
  );
  res.json({ templates: rows });
});

// POST /route-templates — App Admin / Contractor Engineer, matches
// current template-management permissions.
routeTemplatesRouter.post("/", requireRole("App Admin", "Contractor Engineer"), async (req, res) => {
  const { routeName, routeType, orgId, area, oilType, frequency, nextGenerateDate } = req.body || {};
  if (!routeName || !routeType || !frequency) {
    return res.status(400).json({ error: "routeName, routeType, and frequency are required" });
  }
  if (!["Weekly", "Monthly", "Quarterly"].includes(frequency)) {
    return res.status(400).json({ error: "frequency must be Weekly, Monthly, or Quarterly" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO route_templates (route_name, route_type, org_id, area, oil_type, frequency, next_generate_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [routeName, routeType, orgId || null, area, oilType, frequency, nextGenerateDate || null, req.user.uid],
    );
    res.status(201).json({ templateId: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_templates_org: `Organization ${orgId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// PUT /route-templates/:templateId — e.g. pausing a template.
routeTemplatesRouter.put("/:templateId", requireRole("App Admin", "Contractor Engineer"), async (req, res) => {
  const allowedFields = { status: "status", nextGenerateDate: "next_generate_date", frequency: "frequency" };
  const sets = [];
  const params = [];
  for (const [bodyKey, column] of Object.entries(allowedFields)) {
    if (req.body?.[bodyKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(req.body[bodyKey]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "No updatable fields in request body" });

  const [result] = await pool.query(`UPDATE route_templates SET ${sets.join(", ")} WHERE template_id = ?`, [
    ...params,
    req.params.templateId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Template not found" });
  res.json({ status: "ok" });
});

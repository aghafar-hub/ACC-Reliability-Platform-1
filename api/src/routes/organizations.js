// Organizations — replaces "ORG_MASTER" (and absorbs the never-built
// CONTRACTOR_MASTER, redundant with org_type='Contractor' — see
// database/schema/00_core.sql's own comment). Every other module's org_id
// FK points here; this is where ACC/RHI/ASEC and any future contractor
// actually get created, instead of being seeded ad hoc.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get("/", async (req, res) => {
  const { orgType, status } = req.query;
  const where = [];
  const params = [];
  if (orgType) {
    where.push("org_type = ?");
    params.push(orgType);
  }
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(`SELECT * FROM organizations ${whereSql} ORDER BY org_code`, params);
  res.json({ organizations: rows });
});

organizationsRouter.post("/", requireRole("App Admin"), async (req, res) => {
  const { orgCode, orgName, orgType } = req.body || {};
  if (!orgCode || !orgName || !orgType) return res.status(400).json({ error: "orgCode, orgName, and orgType are required" });
  if (!["ACC", "Contractor"].includes(orgType)) return res.status(400).json({ error: "orgType must be ACC or Contractor" });

  try {
    const [result] = await pool.query("INSERT INTO organizations (org_code, org_name, org_type) VALUES (?, ?, ?)", [
      orgCode,
      orgName,
      orgType,
    ]);
    res.status(201).json({ orgId: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Organization code ${orgCode} already exists` });
    throw err;
  }
});

organizationsRouter.put("/:orgId", requireRole("App Admin"), async (req, res) => {
  const allowedFields = { orgName: "org_name", status: "status" };
  const sets = [];
  const params = [];
  for (const [bodyKey, column] of Object.entries(allowedFields)) {
    if (req.body?.[bodyKey] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(req.body[bodyKey]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "No updatable fields in request body" });

  const [result] = await pool.query(`UPDATE organizations SET ${sets.join(", ")} WHERE org_id = ?`, [
    ...params,
    req.params.orgId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Organization not found" });
  res.json({ status: "ok" });
});

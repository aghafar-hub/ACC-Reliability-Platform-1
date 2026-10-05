// Equipment CRUD — the first real payoff of the unified schema
// (database/schema/00_core.sql): Oil Lubrication's and Vibration
// Analysis's own point-level tables (lubrication_points, vib_points) both
// reference equipment.equipment_id, so this one endpoint is now the single
// source of truth both modules' frontends can share, instead of each
// maintaining its own independent equipment list.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const equipmentRouter = Router();
equipmentRouter.use(requireAuth);

// GET /equipment?search=&orgId=&line=&eqType=&status=&page=&limit=
equipmentRouter.get("/", async (req, res) => {
  const { search, orgId, line, eqType, status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (search) {
    where.push("(e.equipment_id LIKE ? OR e.description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (orgId) {
    where.push("e.org_id = ?");
    params.push(orgId);
  }
  if (line) {
    where.push("e.line = ?");
    params.push(line);
  }
  if (eqType) {
    where.push("e.eq_type = ?");
    params.push(eqType);
  }
  if (status) {
    where.push("e.status = ?");
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT e.*, o.org_code, o.org_name
       FROM equipment e
       LEFT JOIN organizations o ON o.org_id = e.org_id
       ${whereSql}
      ORDER BY e.equipment_id
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM equipment e ${whereSql}`, params);

  res.json({ equipment: rows, page, limit, total });
});

// GET /equipment/:equipmentId
equipmentRouter.get("/:equipmentId", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.*, o.org_code, o.org_name
       FROM equipment e
       LEFT JOIN organizations o ON o.org_id = e.org_id
      WHERE e.equipment_id = ?`,
    [req.params.equipmentId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Equipment not found" });
  res.json({ equipment: rows[0] });
});

// POST /equipment — App Admin only, matches current Apps Script behavior
// where equipment/contractor assignment is an admin action.
equipmentRouter.post("/", requireRole("App Admin"), async (req, res) => {
  const {
    equipmentId,
    description,
    mainArea,
    plantArea,
    subArea,
    line,
    eqType,
    orgId,
    criticality,
    parentEquipmentId,
  } = req.body || {};
  if (!equipmentId) return res.status(400).json({ error: "equipmentId is required" });

  try {
    await pool.query(
      `INSERT INTO equipment
         (equipment_id, description, main_area, plant_area, sub_area, line, eq_type, org_id, criticality, parent_equipment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [equipmentId, description, mainArea, plantArea, subArea, line, eqType, orgId || null, criticality, parentEquipmentId || null],
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Equipment ${equipmentId} already exists` });
    throw err;
  }
  res.status(201).json({ equipmentId });
});

// PUT /equipment/:equipmentId — partial update of whichever fields are sent.
equipmentRouter.put("/:equipmentId", requireRole("App Admin"), async (req, res) => {
  const allowedFields = {
    description: "description",
    mainArea: "main_area",
    plantArea: "plant_area",
    subArea: "sub_area",
    line: "line",
    eqType: "eq_type",
    orgId: "org_id",
    criticality: "criticality",
    parentEquipmentId: "parent_equipment_id",
    status: "status",
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

  const [result] = await pool.query(`UPDATE equipment SET ${sets.join(", ")} WHERE equipment_id = ?`, [
    ...params,
    req.params.equipmentId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Equipment not found" });
  res.json({ status: "ok" });
});

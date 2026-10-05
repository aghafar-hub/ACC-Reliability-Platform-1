// Lubrication Points — replaces Oil Lubrication's "Equipment Registry"
// sheet/EquipmentRegistry.js. Each row is one lubrication point on a piece
// of equipment (equipment_id is a real FK into the shared equipment table —
// see database/schema/00_core.sql); one equipment can own several points
// (e.g. left/right gearbox sides), same shape as today's one-equipment-to-
// many-LP_ID sheet rows.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const lubricationPointsRouter = Router();
lubricationPointsRouter.use(requireAuth);

// GET /lubrication-points?equipmentId=&orgId=&search=&page=&limit=
lubricationPointsRouter.get("/", async (req, res) => {
  const { equipmentId, orgId, search } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("lp.equipment_id = ?");
    params.push(equipmentId);
  }
  if (orgId) {
    where.push("lp.org_id = ?");
    params.push(orgId);
  }
  if (search) {
    where.push("(lp.lp_id LIKE ? OR lp.lubrication_point LIKE ? OR e.description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT lp.*, e.description AS equipment_description, o.org_code
       FROM lubrication_points lp
       JOIN equipment e ON e.equipment_id = lp.equipment_id
       LEFT JOIN organizations o ON o.org_id = lp.org_id
       ${whereSql}
      ORDER BY lp.lp_id
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM lubrication_points lp JOIN equipment e ON e.equipment_id = lp.equipment_id ${whereSql}`,
    params,
  );

  res.json({ lubricationPoints: rows, page, limit, total });
});

// GET /lubrication-points/:lpId
lubricationPointsRouter.get("/:lpId", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT lp.*, e.description AS equipment_description, o.org_code
       FROM lubrication_points lp
       JOIN equipment e ON e.equipment_id = lp.equipment_id
       LEFT JOIN organizations o ON o.org_id = lp.org_id
      WHERE lp.lp_id = ?`,
    [req.params.lpId],
  );
  if (!rows[0]) return res.status(404).json({ error: "Lubrication point not found" });
  res.json({ lubricationPoint: rows[0] });
});

// POST /lubrication-points — App Admin / Reliability Engineer, mirrors
// current equipment-registry-edit permissions.
lubricationPointsRouter.post("/", requireRole("App Admin", "Reliability Engineer"), async (req, res) => {
  const {
    lpId,
    equipmentId,
    lubricationLocation,
    pointCode,
    lubricationPoint,
    position,
    area,
    manufacturer,
    model,
    operatingTemperatureC,
    lubricantType,
    lubricantBrand,
    lubricantQuantityL,
    oilAnalysisRequired,
    oilAnalysisInterval,
    oilChangeInterval,
    orgId,
  } = req.body || {};
  if (!lpId || !equipmentId) return res.status(400).json({ error: "lpId and equipmentId are required" });

  try {
    await pool.query(
      `INSERT INTO lubrication_points
         (lp_id, equipment_id, lubrication_location, point_code, lubrication_point, position, area,
          manufacturer, model, operating_temperature_c, lubricant_type, lubricant_brand,
          lubricant_quantity_l, oil_analysis_required, oil_analysis_interval, oil_change_interval, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lpId,
        equipmentId,
        lubricationLocation,
        pointCode,
        lubricationPoint,
        position,
        area,
        manufacturer,
        model,
        operatingTemperatureC || null,
        lubricantType,
        lubricantBrand,
        lubricantQuantityL || null,
        !!oilAnalysisRequired,
        oilAnalysisInterval || null,
        oilChangeInterval || null,
        orgId || null,
      ],
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Lubrication point ${lpId} already exists` });
    const fkError = friendlyForeignKeyError(err, {
      fk_lp_equipment: `Equipment ${equipmentId} does not exist`,
      fk_lp_org: `Organization ${orgId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
  res.status(201).json({ lpId });
});

// PUT /lubrication-points/:lpId — partial update. Contractor (org_id) is
// deliberately NOT in the updatable set here — matches the current app's
// lockEquipmentRegistryContractor_() behavior: once set at creation, the
// owning contractor can't be silently changed through this endpoint. A
// separate, explicitly-audited reassignment endpoint is the right place
// for that if it's ever needed, not a generic field update.
lubricationPointsRouter.put("/:lpId", requireRole("App Admin", "Reliability Engineer"), async (req, res) => {
  const allowedFields = {
    lubricationLocation: "lubrication_location",
    pointCode: "point_code",
    lubricationPoint: "lubrication_point",
    position: "position",
    area: "area",
    manufacturer: "manufacturer",
    model: "model",
    operatingTemperatureC: "operating_temperature_c",
    lubricantType: "lubricant_type",
    lubricantBrand: "lubricant_brand",
    lubricantQuantityL: "lubricant_quantity_l",
    oilAnalysisRequired: "oil_analysis_required",
    oilAnalysisInterval: "oil_analysis_interval",
    oilChangeInterval: "oil_change_interval",
    lpStatus: "lp_status",
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

  const [result] = await pool.query(`UPDATE lubrication_points SET ${sets.join(", ")} WHERE lp_id = ?`, [
    ...params,
    req.params.lpId,
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Lubrication point not found" });
  res.json({ status: "ok" });
});

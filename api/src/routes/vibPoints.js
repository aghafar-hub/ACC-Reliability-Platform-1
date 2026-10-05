// VIB Points — replaces "VIB ID Registry". equipment_id is a real FK into
// the shared equipment table (database/schema/00_core.sql), same fix as
// lubrication_points in Oil Lubrication.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const vibPointsRouter = Router();
vibPointsRouter.use(requireAuth);

// GET /vib-points?equipmentId=&family=&orgId=
vibPointsRouter.get("/", async (req, res) => {
  const { equipmentId, family, orgId } = req.query;
  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("v.equipment_id = ?");
    params.push(equipmentId);
  }
  if (family) {
    where.push("v.family = ?");
    params.push(family);
  }
  if (orgId) {
    where.push("v.org_id = ?");
    params.push(orgId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT v.*, e.description AS equipment_description, o.org_code
       FROM vib_points v
       JOIN equipment e ON e.equipment_id = v.equipment_id
       LEFT JOIN organizations o ON o.org_id = v.org_id
       ${whereSql}
      ORDER BY v.vib_id`,
    params,
  );
  res.json({ vibPoints: rows });
});

// POST /vib-points — App Admin / Reliability Engineer.
vibPointsRouter.post("/", requireRole("App Admin", "Reliability Engineer"), async (req, res) => {
  const { vibId, equipmentId, positionCode, family, pointDescription, readingColumns, orgId } = req.body || {};
  if (!vibId || !equipmentId || !family) return res.status(400).json({ error: "vibId, equipmentId, and family are required" });
  if (!["RMS", "SPM"].includes(family)) return res.status(400).json({ error: "family must be RMS or SPM" });

  try {
    await pool.query(
      `INSERT INTO vib_points (vib_id, equipment_id, position_code, family, point_description, reading_columns, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vibId, equipmentId, positionCode, family, pointDescription, readingColumns, orgId || null],
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `VIB point ${vibId} already exists` });
    const fkError = friendlyForeignKeyError(err, {
      fk_vibpoints_equipment: `Equipment ${equipmentId} does not exist`,
      fk_vibpoints_org: `Organization ${orgId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
  res.status(201).json({ vibId });
});

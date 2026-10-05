// RMS/SPM Readings — replaces "📥 RMS DATA" / "📥 SPM DATA" (the event
// log) and "📋 Last RMS/SPM Reading" (now the last_rms_reading/
// last_spm_reading VIEWs — computed from the event log instead of a
// separately hand-upserted "current status" sheet; see
// database/schema/02_vibration_analysis.sql's own comment on this).
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const vibReadingsRouter = Router();
vibReadingsRouter.use(requireAuth);

// GET /rms-readings?equipmentId=&point=&page=&limit=
vibReadingsRouter.get("/rms-readings", async (req, res) => {
  const { equipmentId, point } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("r.equipment_id = ?");
    params.push(equipmentId);
  }
  if (point) {
    where.push("r.point = ?");
    params.push(point);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT r.* FROM rms_readings r ${whereSql} ORDER BY r.reading_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM rms_readings r ${whereSql}`, params);
  res.json({ readings: rows, page, limit, total });
});

// POST /rms-readings — upsert on the real [equipment_id, point, reading_date]
// match key (same semantics as the current app's "add or update" behavior
// for a reading taken at a specific date), via ON DUPLICATE KEY UPDATE
// against the uq_rms_match unique constraint.
vibReadingsRouter.post("/rms-readings", async (req, res) => {
  const { equipmentId, vibId, point, readingDate, axial, horizontal, vertical } = req.body || {};
  if (!equipmentId || !point || !readingDate) {
    return res.status(400).json({ error: "equipmentId, point, and readingDate are required" });
  }
  // maxVelocity is server-computed (the worst of the three axes), never
  // trusted from the client — same principle as every other server-derived
  // field in this API (next_due_date, approved_by, etc.).
  const maxVelocity = Math.max(...[axial, horizontal, vertical].filter((v) => typeof v === "number"));

  try {
    const [result] = await pool.query(
      `INSERT INTO rms_readings (equipment_id, vib_id, point, reading_date, axial, horizontal, vertical, max_velocity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE vib_id = VALUES(vib_id), axial = VALUES(axial), horizontal = VALUES(horizontal),
         vertical = VALUES(vertical), max_velocity = VALUES(max_velocity)`,
      [equipmentId, vibId || null, point, readingDate, axial ?? null, horizontal ?? null, vertical ?? null, Number.isFinite(maxVelocity) ? maxVelocity : null],
    );
    res.status(201).json({ readingId: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, {
      fk_rms_readings_equipment: `Equipment ${equipmentId} does not exist`,
      fk_rms_readings_vibpoint: `VIB point ${vibId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

// GET /last-rms-reading?equipmentId= — the "current status" view, one row
// per equipment+point, computed live from rms_readings.
vibReadingsRouter.get("/last-rms-reading", async (req, res) => {
  const { equipmentId } = req.query;
  const where = equipmentId ? "WHERE equipment_id = ?" : "";
  const params = equipmentId ? [equipmentId] : [];
  const [rows] = await pool.query(`SELECT * FROM last_rms_reading ${where} ORDER BY equipment_id, point`, params);
  res.json({ lastRmsReading: rows });
});

// ── SPM, same shape ───────────────────────────────────────────────────

vibReadingsRouter.get("/spm-readings", async (req, res) => {
  const { equipmentId, point } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (equipmentId) {
    where.push("r.equipment_id = ?");
    params.push(equipmentId);
  }
  if (point) {
    where.push("r.point = ?");
    params.push(point);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT r.* FROM spm_readings r ${whereSql} ORDER BY r.reading_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM spm_readings r ${whereSql}`, params);
  res.json({ readings: rows, page, limit, total });
});

vibReadingsRouter.post("/spm-readings", async (req, res) => {
  const { equipmentId, vibId, point, readingType, readingDate, hdm, hdc, gs } = req.body || {};
  if (!equipmentId || !point || !readingDate) {
    return res.status(400).json({ error: "equipmentId, point, and readingDate are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO spm_readings (equipment_id, vib_id, point, reading_type, reading_date, hdm, hdc, gs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE vib_id = VALUES(vib_id), hdm = VALUES(hdm), hdc = VALUES(hdc), gs = VALUES(gs)`,
      [equipmentId, vibId || null, point, readingType || "SPM", readingDate, hdm ?? null, hdc ?? null, gs ?? null],
    );
    res.status(201).json({ readingId: result.insertId });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, {
      fk_spm_readings_equipment: `Equipment ${equipmentId} does not exist`,
      fk_spm_readings_vibpoint: `VIB point ${vibId} does not exist`,
    });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

vibReadingsRouter.get("/last-spm-reading", async (req, res) => {
  const { equipmentId } = req.query;
  const where = equipmentId ? "WHERE equipment_id = ?" : "";
  const params = equipmentId ? [equipmentId] : [];
  const [rows] = await pool.query(`SELECT * FROM last_spm_reading ${where} ORDER BY equipment_id, point`, params);
  res.json({ lastSpmReading: rows });
});

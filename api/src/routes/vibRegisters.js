// RMS/SPM Registers — replaces "⚙ RMS Register" / "⚙ SPM Register" (the
// per-equipment threshold configuration that drives status classification
// on readings). One row per equipment per register — equipment_id is the
// primary key, a real FK into the shared equipment table.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { friendlyForeignKeyError } from "../dbErrors.js";

export const vibRegistersRouter = Router();
vibRegistersRouter.use(requireAuth);

vibRegistersRouter.get("/rms-register", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, e.description AS equipment_description, e.line, e.eq_type
       FROM rms_register r JOIN equipment e ON e.equipment_id = r.equipment_id ORDER BY r.equipment_id`,
  );
  res.json({ rmsRegister: rows });
});

vibRegistersRouter.put("/rms-register/:equipmentId", requireRole("App Admin", "Reliability Engineer"), async (req, res) => {
  const { namePlate, points, rmsGood, rmsAcceptable, rmsAlarm } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO rms_register (equipment_id, name_plate, points, rms_good, rms_acceptable, rms_alarm)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name_plate = VALUES(name_plate), points = VALUES(points),
         rms_good = VALUES(rms_good), rms_acceptable = VALUES(rms_acceptable), rms_alarm = VALUES(rms_alarm)`,
      [req.params.equipmentId, namePlate, points, rmsGood ?? 2.8, rmsAcceptable ?? 7.1, rmsAlarm ?? 18],
    );
    res.json({ status: "ok" });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_rmsreg_equipment: `Equipment ${req.params.equipmentId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

vibRegistersRouter.get("/spm-register", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, e.description AS equipment_description, e.line, e.eq_type
       FROM spm_register r JOIN equipment e ON e.equipment_id = r.equipment_id ORDER BY r.equipment_id`,
  );
  res.json({ spmRegister: rows });
});

vibRegistersRouter.put("/spm-register/:equipmentId", requireRole("App Admin", "Reliability Engineer"), async (req, res) => {
  const { points, spmType, spmNormal, spmCaution, spmAlarm } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO spm_register (equipment_id, points, spm_type, spm_normal, spm_caution, spm_alarm)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         points = VALUES(points), spm_type = VALUES(spm_type),
         spm_normal = VALUES(spm_normal), spm_caution = VALUES(spm_caution), spm_alarm = VALUES(spm_alarm)`,
      [req.params.equipmentId, points, spmType, spmNormal ?? 20, spmCaution ?? 35, spmAlarm ?? 50],
    );
    res.json({ status: "ok" });
  } catch (err) {
    const fkError = friendlyForeignKeyError(err, { fk_spmreg_equipment: `Equipment ${req.params.equipmentId} does not exist` });
    if (fkError) return res.status(400).json({ error: fkError });
    throw err;
  }
});

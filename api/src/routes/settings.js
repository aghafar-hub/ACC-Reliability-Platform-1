// Settings — replaces Platform Core's ADMIN_SETTINGS sheet, Vibration
// Analysis's Configuration sheet, and Oil Lubrication's Script Properties
// (three independent flat key/value stores — see database/schema/
// 00_core.sql's own comment). One table, scoped by module_id so each
// module's settings don't collide; 'global' is for platform-wide settings.
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// GET /settings?moduleId=
settingsRouter.get("/", async (req, res) => {
  const { moduleId } = req.query;
  const where = moduleId ? "WHERE module_id = ?" : "";
  const params = moduleId ? [moduleId] : [];
  const [rows] = await pool.query(`SELECT * FROM settings ${where} ORDER BY module_id, setting_key`, params);
  res.json({ settings: rows });
});

// PUT /settings/:moduleId/:settingKey { value } — App Admin only.
settingsRouter.put("/:moduleId/:settingKey", requireRole("App Admin"), async (req, res) => {
  const { value } = req.body || {};
  await pool.query(
    `INSERT INTO settings (module_id, setting_key, setting_value, modified_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), modified_by = VALUES(modified_by)`,
    [req.params.moduleId, req.params.settingKey, value, req.user.uid],
  );
  res.json({ status: "ok" });
});

// Oil Samples — replaces "Data_Entry". sample_uid is the real unique key;
// sample_id (the lab's own label) is NOT unique — the schema survey found
// 42 real collisions in production where the lab reuses sample-ID
// numbering across sampling rounds for the same point. Analyte columns are
// accepted as a flat object and whitelisted against a known column map
// rather than individually named as request-body fields, since there are
// ~30 of them and the set is unlikely to ever need per-field validation
// beyond "is it a number."
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const oilSamplesRouter = Router();
oilSamplesRouter.use(requireAuth);

const ANALYTE_FIELDS = {
  particleCount4um: "particle_count_4um",
  particleCount6um: "particle_count_6um",
  particleCount14um: "particle_count_14um",
  pqIndex: "pq_index",
  visc40c: "visc_40c",
  tan: "tan",
  oxidation: "oxidation",
  water: "water",
  wearAg: "wear_ag",
  wearAl: "wear_al",
  wearCr: "wear_cr",
  wearCu: "wear_cu",
  wearFe: "wear_fe",
  wearMo: "wear_mo",
  wearNi: "wear_ni",
  wearPb: "wear_pb",
  wearSn: "wear_sn",
  contaminantK: "contaminant_k",
  contaminantNa: "contaminant_na",
  contaminantSi: "contaminant_si",
  additiveB: "additive_b",
  additiveBa: "additive_ba",
  additiveCa: "additive_ca",
  additiveMg: "additive_mg",
  additiveP: "additive_p",
  additiveZn: "additive_zn",
};

// GET /oil-samples?lpId=&page=&limit=
oilSamplesRouter.get("/", async (req, res) => {
  const { lpId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (lpId) {
    where.push("s.lp_id = ?");
    params.push(lpId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT s.sample_uid, s.lp_id, s.sample_id, s.sample_date, s.report_status,
            s.contamination_rating, s.equipment_rating, s.lubricant_rating, s.alert_type
       FROM oil_samples s
       ${whereSql}
      ORDER BY s.sample_date DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM oil_samples s ${whereSql}`, params);
  res.json({ samples: rows, page, limit, total });
});

// GET /oil-samples/:sampleUid — full record including every analyte column.
oilSamplesRouter.get("/:sampleUid", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM oil_samples WHERE sample_uid = ?", [req.params.sampleUid]);
  if (!rows[0]) return res.status(404).json({ error: "Sample not found" });
  res.json({ sample: rows[0] });
});

// POST /oil-samples — any authenticated user can log a sample result (lab
// data entry isn't an admin-only action today).
oilSamplesRouter.post("/", async (req, res) => {
  const { sampleUid, lpId, sampleId, sampleDate, reportStatus, contaminationRating, equipmentRating, lubricantRating,
          alertType, sampleAnalysis, flaggedParameters } = req.body || {};
  if (!sampleUid || !lpId) return res.status(400).json({ error: "sampleUid and lpId are required" });

  const columns = ["sample_uid", "lp_id", "sample_id", "sample_date", "report_status", "contamination_rating",
    "equipment_rating", "lubricant_rating", "alert_type", "sample_analysis", "flagged_parameters"];
  const values = [sampleUid, lpId, sampleId, sampleDate, reportStatus, contaminationRating, equipmentRating,
    lubricantRating, alertType, sampleAnalysis, flaggedParameters];

  for (const [bodyKey, column] of Object.entries(ANALYTE_FIELDS)) {
    if (req.body?.[bodyKey] !== undefined) {
      columns.push(column);
      values.push(req.body[bodyKey]);
    }
  }

  try {
    await pool.query(
      `INSERT INTO oil_samples (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Sample ${sampleUid} already exists` });
    if (err.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: `Lubrication point ${lpId} does not exist` });
    throw err;
  }
  res.status(201).json({ sampleUid });
});

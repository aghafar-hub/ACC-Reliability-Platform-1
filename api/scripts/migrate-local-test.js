// Local test-import script. Reads the real exported data/*.xlsx files and
// loads them into the local acc_reliability database using the same
// mysql2 pool as the running API (src/db.js). This is a local test import
// only, not the final migration plan — see data_migration_survey notes.
//
// Reporting policy:
//  - Structural tables (organizations, equipment, lubrication_points — and
//    any row elsewhere that references a missing structural ID) are always
//    reported explicitly: the exact ID, how many rows reference it, and
//    which table(s).
//  - Reading/event-level tables (oil_samples, oil_actions, rms_readings,
//    spm_readings) have their non-structural skips (garbage values,
//    duplicates, malformed rows) summarized by category + count only.
//
// Usage: node scripts/migrate-local-test.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const CORE_FILE = path.join(DATA_DIR, "ACC Reliability Data Base.xlsx");
const OIL_FILE = path.join(DATA_DIR, "Oil Lubrication Data Base.xlsx");
const VIB_FILE = path.join(DATA_DIR, "Vibration & Condition Monitoring Data Base (1).xlsx");

const counts = {}; // table -> { inserted, skipped, failed }
const structuralGaps = new Map(); // `${refType}:${missingId}` -> { refType, missingId, byTable: Map(table -> count) }
const structuralIssues = []; // rare malformed/db-error rows *within* structural tables themselves
const readingSkipSummary = new Map(); // `${table}::${reason}` -> count

function bump(table, field) {
  counts[table] = counts[table] || { inserted: 0, skipped: 0, failed: 0 };
  counts[table][field]++;
}

function logStructuralGap(table, refType, missingId) {
  bump(table, "skipped");
  const key = `${refType}:${missingId}`;
  if (!structuralGaps.has(key)) structuralGaps.set(key, { refType, missingId, byTable: new Map() });
  const g = structuralGaps.get(key);
  g.byTable.set(table, (g.byTable.get(table) || 0) + 1);
}

function logStructuralIssue(table, reason, detail, isFailure = false) {
  bump(table, isFailure ? "failed" : "skipped");
  structuralIssues.push({ table, reason, detail });
}

function logReadingSkip(table, reason, isFailure = false) {
  bump(table, isFailure ? "failed" : "skipped");
  const key = `${table}::${reason}`;
  readingSkipSummary.set(key, (readingSkipSummary.get(key) || 0) + 1);
}

// ---------------------------------------------------------------------------
// Sheet reading helpers
// ---------------------------------------------------------------------------
function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null; // formula cell
    if ("richText" in v) return v.richText.map((rt) => rt.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

function readSheetViaPython(file, sheetName, headerRowNum) {
  // ExcelJS chokes on this workbook after it's been resaved by openpyxl (a
  // dangling drawing/comment rels reference it can't reconcile — confirmed
  // the file itself opens fine in real Excel, this is an ExcelJS-specific
  // parsing gap). Shell out to the openpyxl reader we've used reliably all
  // session instead, for this file only.
  const out = execFileSync(
    "python",
    [path.join(__dirname, "dump_sheet.py"), file, sheetName, String(headerRowNum)],
    { maxBuffer: 1024 * 1024 * 200, encoding: "utf8" }
  );
  const rows = JSON.parse(out);
  for (const r of rows) {
    if (r.Date) r.Date = new Date(r.Date);
  }
  return rows;
}

function readSheet(workbook, sheetName, headerRowNum) {
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  const headerRow = ws.getRow(headerRowNum);
  const colNames = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = cellValue(cell);
    if (name !== null && name !== undefined && String(name).trim() !== "") {
      colNames[colNumber] = String(name);
    }
  });
  const rows = [];
  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.cellCount === 0) continue;
    const obj = { _excelRow: r };
    let hasAny = false;
    for (const [colNumber, name] of Object.entries(colNames)) {
      const val = cellValue(row.getCell(Number(colNumber)));
      obj[name] = val;
      if (val !== null && String(val).trim() !== "") hasAny = true;
    }
    if (hasAny) rows.push(obj);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Value-cleaning helpers
// ---------------------------------------------------------------------------
function strOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || /^null$/i.test(s)) return null; // some source cells store the literal text "NULL"
  return s;
}

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "" || s.startsWith("#")) return null; // '#VALUE!', '#REF!', etc.
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function boolOrDefault(v, def = false) {
  const s = strOrNull(v);
  if (s === null) return def;
  return /^y(es)?$/i.test(s);
}

function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function dateTime(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function parseIntervalDays(v) {
  const s = strOrNull(v);
  if (s === null) return null;
  const low = s.toLowerCase();
  if (low.includes("needed")) return null;
  if (low === "monthly") return 30;
  let m = low.match(/^([\d.]+)\s*(day|week|month|y|year)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (unit.startsWith("day")) return Math.round(n);
  if (unit.startsWith("week")) return Math.round(n * 7);
  if (unit.startsWith("month")) return Math.round(n * 30);
  if (unit.startsWith("y")) return Math.round(n * 365);
  return null;
}

function resolveOrgId(raw, orgMap) {
  const s = strOrNull(raw);
  if (s === null) return null;
  const code = s.replace(/^ORG-/i, "").trim().toUpperCase();
  return orgMap.get(code) ?? null;
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------
async function migrateOrganizations(coreWb) {
  const rows = readSheet(coreWb, "ORG_MASTER", 1);
  const orgMap = new Map(); // CODE (upper) -> org_id

  for (const row of rows) {
    const code = strOrNull(row.OrgName);
    if (!code) {
      logStructuralIssue("organizations", "blank OrgName", `row ${row._excelRow}`);
      continue;
    }
    const orgType = strOrNull(row.OrgType) || "Contractor";
    const status = strOrNull(row.Status) || "Active";
    try {
      await pool.query(
        `INSERT INTO organizations (org_code, org_name, org_type, status)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE org_type = VALUES(org_type), status = VALUES(status)`,
        [code, code, orgType, status]
      );
      bump("organizations", "inserted");
    } catch (err) {
      logStructuralIssue("organizations", "db error", `${code}: ${err.message}`, true);
    }
  }

  const [orgRows] = await pool.query("SELECT org_id, org_code FROM organizations");
  for (const r of orgRows) orgMap.set(r.org_code.toUpperCase(), r.org_id);
  return orgMap;
}

async function migrateEquipment(coreWb, orgMap) {
  const rows = readSheet(coreWb, "EQUIPMENT_MASTER", 1);
  const equipmentIds = new Set();
  const parentLinks = []; // { equipmentId, parentId }

  for (const row of rows) {
    const equipmentId = strOrNull(row.Equipment_ID);
    if (!equipmentId) {
      logStructuralIssue("equipment", "blank Equipment_ID", `row ${row._excelRow}`);
      continue;
    }
    const orgId = resolveOrgId(row.Contractor, orgMap);
    const params = [
      equipmentId,
      strOrNull(row.Equipment_Description),
      strOrNull(row.Main_Area),
      strOrNull(row.Plant_Area),
      row.Sub_Area === null || row.Sub_Area === undefined ? null : String(row.Sub_Area),
      orgId,
      strOrNull(row.Criticality),
      strOrNull(row.Equipment_Status) || "Active",
      dateTime(row.Created_Date),
    ];
    try {
      await pool.query(
        `INSERT INTO equipment
           (equipment_id, description, main_area, plant_area, sub_area, org_id, criticality, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
         ON DUPLICATE KEY UPDATE
           description = VALUES(description), main_area = VALUES(main_area),
           plant_area = VALUES(plant_area), sub_area = VALUES(sub_area),
           org_id = VALUES(org_id), criticality = VALUES(criticality), status = VALUES(status)`,
        params
      );
      bump("equipment", "inserted");
      equipmentIds.add(equipmentId);
      const parentId = strOrNull(row.Parent_Equipment_ID);
      if (parentId) parentLinks.push({ equipmentId, parentId });
    } catch (err) {
      logStructuralIssue("equipment", "db error", `${equipmentId}: ${err.message}`, true);
    }
  }

  let parentLinked = 0;
  for (const { equipmentId, parentId } of parentLinks) {
    if (!equipmentIds.has(parentId)) {
      logStructuralGap("equipment (parent_equipment_id)", "equipment_id", parentId);
      continue;
    }
    try {
      await pool.query("UPDATE equipment SET parent_equipment_id = ? WHERE equipment_id = ?", [parentId, equipmentId]);
      parentLinked++;
    } catch (err) {
      logStructuralIssue("equipment (parent_equipment_id)", "db error", `${equipmentId}: ${err.message}`, true);
    }
  }
  counts.equipment.parentLinked = parentLinked;

  return equipmentIds;
}

async function migrateLubricationPoints(oilWb, equipmentIds, orgMap) {
  const rows = readSheet(oilWb, "Equipment Registry", 2);
  const lpIds = new Set();

  for (const row of rows) {
    const lpId = strOrNull(row.LP_ID);
    if (!lpId) {
      logStructuralIssue("lubrication_points", "blank LP_ID", `row ${row._excelRow}`);
      continue;
    }
    const equipmentId = strOrNull(row.Equipment_ID);
    if (!equipmentId || !equipmentIds.has(equipmentId)) {
      logStructuralGap("lubrication_points", "equipment_id", equipmentId || "(blank)");
      continue;
    }
    const orgId = resolveOrgId(row.Contractor, orgMap);
    const params = [
      lpId,
      equipmentId,
      strOrNull(row.Lubrication_Location),
      strOrNull(row.Point_Code),
      strOrNull(row.Lubrication_Point),
      strOrNull(row.Position),
      strOrNull(row.Area),
      strOrNull(row.Manufacturer),
      strOrNull(row.Model),
      numOrNull(row.Operating_Temperature_C),
      strOrNull(row.Lubricant_Type),
      strOrNull(row.Lubricant_Brand),
      numOrNull(row.Lubricant_Quantity_L),
      boolOrDefault(row.Oil_Analysis_Required, false),
      parseIntervalDays(row.Oil_Analysis_Interval),
      parseIntervalDays(row.Oil_Change_Interval),
      orgId,
      strOrNull(row.LP_Status) || "Active",
      dateTime(row.Created_Date),
    ];
    try {
      await pool.query(
        `INSERT INTO lubrication_points
           (lp_id, equipment_id, lubrication_location, point_code, lubrication_point, position, area,
            manufacturer, model, operating_temperature_c, lubricant_type, lubricant_brand,
            lubricant_quantity_l, oil_analysis_required, oil_analysis_interval, oil_change_interval,
            org_id, lp_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
         ON DUPLICATE KEY UPDATE
           equipment_id = VALUES(equipment_id), lubrication_location = VALUES(lubrication_location),
           point_code = VALUES(point_code), lubrication_point = VALUES(lubrication_point),
           position = VALUES(position), area = VALUES(area), manufacturer = VALUES(manufacturer),
           model = VALUES(model), operating_temperature_c = VALUES(operating_temperature_c),
           lubricant_type = VALUES(lubricant_type), lubricant_brand = VALUES(lubricant_brand),
           lubricant_quantity_l = VALUES(lubricant_quantity_l),
           oil_analysis_required = VALUES(oil_analysis_required),
           oil_analysis_interval = VALUES(oil_analysis_interval),
           oil_change_interval = VALUES(oil_change_interval), org_id = VALUES(org_id),
           lp_status = VALUES(lp_status)`,
        params
      );
      bump("lubrication_points", "inserted");
      lpIds.add(lpId);
    } catch (err) {
      logStructuralIssue("lubrication_points", "db error", `${lpId}: ${err.message}`, true);
    }
  }
  return lpIds;
}

async function migrateOilSamples(oilWb, lpIds) {
  const rows = readSheet(oilWb, "Data_Entry", 5);

  for (const row of rows) {
    const lpId = strOrNull(row["Lub ID"]);
    if (!lpId) {
      logReadingSkip("oil_samples", "blank Lub ID");
      continue;
    }
    if (!lpIds.has(lpId)) {
      logStructuralGap("oil_samples", "lp_id", lpId);
      continue;
    }
    const sampleId = strOrNull(row["sample ID "]);
    const sampleUid = sampleId ? `${lpId}__${sampleId}` : `${lpId}__row${row._excelRow}`;
    const params = [
      sampleUid,
      lpId,
      sampleId,
      dateOnly(row["Sample Date"]),
      strOrNull(row["Report Status"]),
      strOrNull(row["Contamination\nRating"]),
      strOrNull(row["Equipment Rating "]),
      strOrNull(row["Lubricant Rating "]),
      numOrNull(row["Particle Count >4um "]),
      numOrNull(row["Particle Count >6um "]),
      numOrNull(row["Particle Count >14um "]),
      numOrNull(row["PQ Index "]),
      numOrNull(row["Visc@40C (cSt)"]),
      numOrNull(row["TAN (mg KOH/g) "]),
      numOrNull(row["Oxidation (Ab/cm) "]),
      numOrNull(row["Water (Vol%)"]),
      numOrNull(row["Ag (Silver) "]),
      numOrNull(row["Al (Aluminum)"]),
      numOrNull(row["Cr (Chromium) "]),
      numOrNull(row["Cu (Copper)"]),
      numOrNull(row["Fe (Iron)"]),
      numOrNull(row["Mo (Molybdenum) "]),
      numOrNull(row["Ni (Nickel) "]),
      numOrNull(row["Pb (Lead) "]),
      numOrNull(row["Sn (Tin) "]),
      numOrNull(row["K \n(Potassium) "]),
      numOrNull(row["Na (Sodium)"]),
      numOrNull(row["Si (Silicon) "]),
      numOrNull(row["B (Boron) "]),
      numOrNull(row["Ba (Barium) "]),
      numOrNull(row["Ca (Calcium) "]),
      numOrNull(row["Mg (Magnesium) "]),
      numOrNull(row["P (Phosphorus) "]),
      numOrNull(row["Zn (Zinc) "]),
      strOrNull(row["Alert Type"]),
      strOrNull(row["Sample Analysis"]),
      strOrNull(row["Flagged Parameters"]),
    ];
    try {
      await pool.query(
        `INSERT INTO oil_samples
           (sample_uid, lp_id, sample_id, sample_date, report_status, contamination_rating,
            equipment_rating, lubricant_rating, particle_count_4um, particle_count_6um,
            particle_count_14um, pq_index, visc_40c, tan, oxidation, water,
            wear_ag, wear_al, wear_cr, wear_cu, wear_fe, wear_mo, wear_ni, wear_pb, wear_sn,
            contaminant_k, contaminant_na, contaminant_si,
            additive_b, additive_ba, additive_ca, additive_mg, additive_p, additive_zn,
            alert_type, sample_analysis, flagged_parameters)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE sample_id = VALUES(sample_id)`,
        params
      );
      bump("oil_samples", "inserted");
    } catch (err) {
      logReadingSkip("oil_samples", `db error: ${err.message}`, true);
    }
  }
}

async function migrateOilActions(oilWb, lpIds, orgMap) {
  const rows = readSheet(oilWb, "Action Tracker", 5);

  for (const row of rows) {
    const lpId = strOrNull(row["Lub ID"]);
    if (!lpId) {
      logReadingSkip("oil_actions", "blank Lub ID");
      continue;
    }
    if (!lpIds.has(lpId)) {
      logStructuralGap("oil_actions", "lp_id", lpId);
      continue;
    }
    const status = strOrNull(row.Status) || "Open";
    const orgId = resolveOrgId(row["Contractor "], orgMap);
    const params = [
      strOrNull(row["Ac. No."]),
      lpId,
      strOrNull(row["Oil Type "]),
      dateOnly(row["Revision Date"]),
      dateOnly(row["Sample Date"]),
      strOrNull(row["Sample Result "]),
      strOrNull(row["Sample Analysis"]),
      dateOnly(row["Last\nChange"]),
      status,
      strOrNull(row["Contractor \nAction "]),
      orgId,
      dateOnly(row["Completed Date"]),
      strOrNull(row["Prev. Month \nAgreed Action "]),
      strOrNull(row["ACC Action "]),
      strOrNull(row["Agreed Action"]),
      strOrNull(row["Closing Comment "]),
    ];
    try {
      await pool.query(
        `INSERT INTO oil_actions
           (action_no, lp_id, oil_type, revision_date, sample_date, sample_result, sample_analysis,
            last_change, status, contractor_action, org_id, completed_date,
            prev_month_agreed_action, acc_action, agreed_action, closing_comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      );
      bump("oil_actions", "inserted");
    } catch (err) {
      logReadingSkip("oil_actions", `db error: ${err.message}`, true);
    }
  }
}

async function migrateReadings(vibFile, equipmentIds, { sheetName, headerRow, table, valueCols, mapRow }) {
  const rows = readSheetViaPython(vibFile, sheetName, headerRow);
  const seen = new Map(); // key -> { sig }

  for (const row of rows) {
    const equipmentId = strOrNull(row["Equipment ID"]);
    const point = strOrNull(row["Asset ID"]);
    const dateRaw = row["Date"];
    if (!equipmentId || !point || !dateRaw) {
      logReadingSkip(table, "missing equipment_id/point/date");
      continue;
    }
    if (!equipmentIds.has(equipmentId)) {
      logStructuralGap(table, "equipment_id", equipmentId);
      continue;
    }
    const readingDate = dateTime(dateRaw);
    const key = `${equipmentId}||${point}||${readingDate}`;
    const sig = valueCols.map((c) => String(row[c] ?? "null")).join("|");
    if (seen.has(key)) {
      const kind = seen.get(key).sig === sig ? "duplicate reading key: exact duplicate" : "duplicate reading key: conflicting values (kept first row)";
      logReadingSkip(table, kind);
      continue;
    }
    seen.set(key, { sig });

    const params = mapRow(row, equipmentId, point, readingDate);
    try {
      await pool.query(params.sql, params.values);
      bump(table, "inserted");
    } catch (err) {
      logReadingSkip(table, `db error: ${err.message}`, true);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function loadWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

async function main() {
  console.log("Loading workbooks...");
  const [coreWb, oilWb] = await Promise.all([loadWorkbook(CORE_FILE), loadWorkbook(OIL_FILE)]);

  console.log("Migrating organizations...");
  const orgMap = await migrateOrganizations(coreWb);

  console.log("Migrating equipment...");
  const equipmentIds = await migrateEquipment(coreWb, orgMap);

  console.log("Migrating lubrication points...");
  const lpIds = await migrateLubricationPoints(oilWb, equipmentIds, orgMap);

  console.log("Migrating oil samples...");
  await migrateOilSamples(oilWb, lpIds);

  console.log("Migrating oil actions...");
  await migrateOilActions(oilWb, lpIds, orgMap);

  console.log("Migrating RMS readings...");
  await migrateReadings(VIB_FILE, equipmentIds, {
    sheetName: "\u{1F4E5} RMS DATA",
    headerRow: 3,
    table: "rms_readings",
    valueCols: ["AXial (mm/s)", "Horizontal (mm/s)", "Vertical (mm/s)", "Max Velocity (mm/s)"],
    mapRow: (row, equipmentId, point, readingDate) => ({
      sql: `INSERT INTO rms_readings (equipment_id, vib_id, point, reading_date, axial, horizontal, vertical, max_velocity)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      values: [
        equipmentId,
        point,
        readingDate,
        numOrNull(row["AXial (mm/s)"]),
        numOrNull(row["Horizontal (mm/s)"]),
        numOrNull(row["Vertical (mm/s)"]),
        numOrNull(row["Max Velocity (mm/s)"]),
      ],
    }),
  });

  console.log("Migrating SPM readings...");
  await migrateReadings(VIB_FILE, equipmentIds, {
    sheetName: "\u{1F4E5} SPM DATA",
    headerRow: 3,
    table: "spm_readings",
    valueCols: ["Type", "HDm (dBsv)", "HDc (dBsv)", "Gs"],
    mapRow: (row, equipmentId, point, readingDate) => ({
      sql: `INSERT INTO spm_readings (equipment_id, vib_id, point, reading_type, reading_date, hdm, hdc, gs)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      values: [
        equipmentId,
        point,
        strOrNull(row.Type) || "SPM",
        readingDate,
        numOrNull(row["HDm (dBsv)"]),
        numOrNull(row["HDc (dBsv)"]),
        numOrNull(row["Gs"]),
      ],
    }),
  });

  // -------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------
  console.log("\n================ MIGRATION REPORT ================");
  for (const [table, c] of Object.entries(counts)) {
    const extra = c.parentLinked !== undefined ? ` (parent links set: ${c.parentLinked})` : "";
    console.log(`${table}: inserted=${c.inserted} skipped=${c.skipped} failed=${c.failed}${extra}`);
  }

  console.log("\n================ STRUCTURAL GAPS (explicit — every one) ================");
  if (structuralGaps.size === 0) {
    console.log("(none)");
  } else {
    for (const { refType, missingId, byTable } of structuralGaps.values()) {
      const tableBreakdown = [...byTable.entries()].map(([t, n]) => `${n} rows in ${t}`).join(", ");
      console.log(`  ${refType} "${missingId}" not found — referenced by: ${tableBreakdown}`);
    }
  }

  console.log("\n================ STRUCTURAL ISSUES (malformed rows / db errors in structural tables) ================");
  if (structuralIssues.length === 0) {
    console.log("(none)");
  } else {
    for (const s of structuralIssues) console.log(`  ${s.table} :: ${s.reason} :: ${s.detail}`);
  }

  console.log("\n================ READING-LEVEL SKIPS (summarized by category) ================");
  if (readingSkipSummary.size === 0) {
    console.log("(none)");
  } else {
    for (const [key, n] of readingSkipSummary.entries()) {
      const [table, reason] = key.split("::");
      console.log(`  ${table}: ${n} rows skipped — ${reason}`);
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  await pool.end();
  process.exit(1);
});

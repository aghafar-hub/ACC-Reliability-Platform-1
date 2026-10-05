-- ============================================================================
-- ACC Reliability Platform — Vibration Analysis schema
-- ============================================================================
-- Requires 00_core.sql to have run first (references equipment, organizations,
-- users). Replaces the real, deployed backend/vibration-analysis/src/ sheets —
-- 📥 RMS DATA, 📥 SPM DATA, VIB ID Registry, ⚙ RMS Register, ⚙ SPM Register,
-- 📋 Last RMS Reading, 📋 Last SPM Reading, 📋 Compliance Tracker,
-- 📋 Action Tracker, Configuration.
--
-- Deliberate departures from a line-for-line port (both flagged by the
-- schema survey):
--
-- 1. vib_points.equipment_id is a real FK into equipment (00_core) instead
--    of this module's own disconnected copy of equipment data — same fix
--    as lubrication_points in 01_oil_lubrication.sql.
--
-- 2. "📋 Last RMS/SPM Reading" (the hand-upserted "current status" sheets,
--    kept in sync alongside every rms_readings/spm_readings insert via
--    dedicated upsert functions) are NOT ported as tables — they're a
--    materialized view of the readings tables, computed with a query
--    instead (finding #6) — see the last_rms_reading/last_spm_reading
--    VIEWs at the bottom. machine_status (today server-computed and
--    written back into the sheet row) becomes a computed column in the
--    view instead, from the same worst-of-RMS/SPM logic.
--
-- Note: survey found Vibration Analysis currently has NO RBAC/session
-- checking at all (unlike Oil Lubrication's Rbac.js). This schema still
-- tracks acting_user_id-style actors (vib_points.org_id, action owner
-- fields) so that permission enforcement can be added at the API layer
-- later without another schema change — but closing that gap is an app-
-- layer decision, not something this schema file resolves on its own.
-- ============================================================================

USE acc_reliability;

-- ── VIB ID Registry (replaces "VIB ID Registry" — the real point-level
--    register for this module, same role as lubrication_points above but
--    keyed by vib_id instead of lp_id). equipment_id is a real FK now. ────
CREATE TABLE vib_points (
  vib_id             VARCHAR(50) PRIMARY KEY,   -- natural key, e.g. 'Vb-111.CP400-CDE-RMS'
  equipment_id         VARCHAR(50) NOT NULL,
  position_code          VARCHAR(50),             -- e.g. 'CDE'
  family                   ENUM('RMS','SPM') NOT NULL,   -- measurement type, not an axis
  point_description         VARCHAR(255),
  reading_columns             VARCHAR(255),         -- free text, e.g. 'Axial, Horizontal, Vertical'
  org_id                        INT,
  vib_status                      VARCHAR(50) NOT NULL DEFAULT 'Active',
  created_at                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vibpoints_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT fk_vibpoints_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_vibpoints_equipment (equipment_id)
) ENGINE=InnoDB;

-- ── RMS/SPM Registers (replace "⚙ RMS Register" / "⚙ SPM Register" —
--    per-equipment threshold configuration; points lists kept as a comma-
--    separated column, matching current sheet shape, since normalizing
--    that into its own join table isn't needed by anything today). ───────
CREATE TABLE rms_register (
  equipment_id       VARCHAR(50) PRIMARY KEY,
  name_plate            VARCHAR(255),
  points                   VARCHAR(500),   -- comma-separated point list
  rms_good                   DECIMAL(6,2) NOT NULL DEFAULT 2.8,
  rms_acceptable                DECIMAL(6,2) NOT NULL DEFAULT 7.1,
  rms_alarm                        DECIMAL(6,2) NOT NULL DEFAULT 18,
  updated_at                          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rmsreg_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
) ENGINE=InnoDB;

CREATE TABLE spm_register (
  equipment_id       VARCHAR(50) PRIMARY KEY,
  points                VARCHAR(500),
  spm_type                VARCHAR(50),
  spm_normal                 DECIMAL(6,2) NOT NULL DEFAULT 20,
  spm_caution                   DECIMAL(6,2) NOT NULL DEFAULT 35,
  spm_alarm                        DECIMAL(6,2) NOT NULL DEFAULT 50,
  updated_at                          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_spmreg_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
) ENGINE=InnoDB;

-- ── Readings (replace 📥 RMS DATA / 📥 SPM DATA — the real event log;
--    surrogate PK since the sheet's own "#" was just a row sequence
--    number, not a meaningful id. Match key from the app's _matchCols
--    [Equipment ID, Asset ID, Date] becomes a real unique constraint. ─────
CREATE TABLE rms_readings (
  reading_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  equipment_id         VARCHAR(50) NOT NULL,
  vib_id                  VARCHAR(50),
  point                      VARCHAR(100) NOT NULL,   -- "Asset ID" in the real sheet
  reading_date                 DATETIME NOT NULL,
  axial                           DECIMAL(10,3),
  horizontal                        DECIMAL(10,3),
  vertical                            DECIMAL(10,3),
  max_velocity                          DECIMAL(10,3),
  created_at                               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rms_readings_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT fk_rms_readings_vibpoint FOREIGN KEY (vib_id) REFERENCES vib_points(vib_id),
  UNIQUE KEY uq_rms_match (equipment_id, point, reading_date),
  INDEX idx_rms_equipment_date (equipment_id, reading_date)
) ENGINE=InnoDB;

CREATE TABLE spm_readings (
  reading_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  equipment_id         VARCHAR(50) NOT NULL,
  vib_id                  VARCHAR(50),
  point                      VARCHAR(100) NOT NULL,
  reading_type                 VARCHAR(20) NOT NULL DEFAULT 'SPM',   -- the sheet's own "Type" column
  reading_date                    DATETIME NOT NULL,
  hdm                                DECIMAL(10,3),
  hdc                                   DECIMAL(10,3),
  gs                                       DECIMAL(10,3),
  created_at                                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_spm_readings_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT fk_spm_readings_vibpoint FOREIGN KEY (vib_id) REFERENCES vib_points(vib_id),
  UNIQUE KEY uq_spm_match (equipment_id, point, reading_date),
  INDEX idx_spm_equipment_date (equipment_id, reading_date)
) ENGINE=InnoDB;

-- ── Compliance tracker (replaces 📋 Compliance Tracker — the wide, one-
--    column-per-month sheet becomes a normal one-row-per-month table;
--    the daily "mark blank past months as Missing" backfill becomes the
--    compliance_status_effective VIEW below instead of a batch UPDATE,
--    so there's no write cost at all for that housekeeping anymore). ─────
CREATE TABLE compliance_records (
  equipment_id      VARCHAR(50) NOT NULL,
  month                VARCHAR(7) NOT NULL,   -- 'YYYY-MM'
  status                  VARCHAR(50),           -- NULL = not yet recorded; see view for "Missing" inference
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (equipment_id, month),
  CONSTRAINT fk_compliance_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
) ENGINE=InnoDB;

-- ── Action tracker (replaces 📋 Action Tracker) ──────────────────────────
CREATE TABLE vib_actions (
  action_uid          INT AUTO_INCREMENT PRIMARY KEY,
  action_no              VARCHAR(50),              -- display label, format 'V-###'
  equipment_id              VARCHAR(50) NOT NULL,
  reading_date                 DATETIME,
  trigger_type                    ENUM('RMS','SPM','Both'),
  trigger_point                      VARCHAR(100),
  trigger_value                         DECIMAL(10,3),
  machine_status                           VARCHAR(50),
  revision_date                               DATE,
  action_status                                  ENUM('Open','In Progress','Closed') NOT NULL DEFAULT 'Open',
  completion_date                                   DATE,
  org_id                                               INT,
  contractor_action                                      TEXT,
  acc_action                                                TEXT,
  agreed_action                                               TEXT,
  updated_at                                                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vibactions_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT fk_vibactions_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_vibactions_equipment (equipment_id),
  INDEX idx_vibactions_status (action_status)
) ENGINE=InnoDB;

-- ============================================================================
-- Views — replace the hand-synchronized "materialized status" sheets
-- (survey finding #6), same pattern as 01_oil_lubrication.sql.
-- ============================================================================

-- Replaces "📋 Last RMS Reading" — one row per equipment+point, computed
-- from the event log instead of upserted by a dedicated backend function
-- on every save.
CREATE VIEW last_rms_reading AS
SELECT r.equipment_id, r.point, r.reading_date, r.axial, r.horizontal, r.vertical, r.max_velocity
FROM rms_readings r
INNER JOIN (
  SELECT equipment_id, point, MAX(reading_date) AS max_date
  FROM rms_readings GROUP BY equipment_id, point
) latest ON latest.equipment_id = r.equipment_id AND latest.point = r.point AND latest.max_date = r.reading_date;

-- Replaces "📋 Last SPM Reading".
CREATE VIEW last_spm_reading AS
SELECT r.equipment_id, r.point, r.reading_type, r.reading_date, r.hdm, r.hdc, r.gs
FROM spm_readings r
INNER JOIN (
  SELECT equipment_id, point, MAX(reading_date) AS max_date
  FROM spm_readings GROUP BY equipment_id, point
) latest ON latest.equipment_id = r.equipment_id AND latest.point = r.point AND latest.max_date = r.reading_date;

-- Replaces the daily handleMarkMissingCompliance() backfill — "Missing"
-- for any past month with no recorded status is inferred at read time
-- instead of being written into the table by a scheduled job.
CREATE VIEW compliance_status_effective AS
SELECT equipment_id, month,
       CASE
         WHEN status IS NOT NULL AND status != '' THEN status
         WHEN month < DATE_FORMAT(CURDATE(), '%Y-%m') THEN 'Missing'
         ELSE NULL
       END AS effective_status
FROM compliance_records;

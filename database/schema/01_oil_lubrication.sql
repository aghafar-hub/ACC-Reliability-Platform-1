-- ============================================================================
-- ACC Reliability Platform — Oil Lubrication schema
-- ============================================================================
-- Requires 00_core.sql to have run first (references equipment, organizations,
-- users). Replaces the real, deployed backend/oil-lubrication/src/ sheets —
-- Equipment Registry, Data_Entry, Action Tracker, Oil Change LOG, Oil Top Up
-- LOG, ROUTINES, OA_ROUTINE_ITEMS, ROUTINE_TEMPLATES, Oil Inventory, Oil
-- Inventory LOG, OL_ACTION_PHRASES, OL_MODULE_RESPONSIBILITIES,
-- OL_NOTIFY_REVIEWERS, OL_IN_APP_NOTIFICATIONS, OL_SAMPLE_DIGEST_LOG.
--
-- Two deliberate departures from a line-for-line port, both flagged by the
-- schema survey:
--
-- 1. lubrication_points.equipment_id is a real FK into equipment (00_core),
--    not a free-standing module-local list — this is the fix for finding #1
--    (three disconnected equipment definitions). One equipment_id can still
--    own many lubrication points (left/right gearbox sides etc.), same as
--    today's one-equipment-to-many-LP_ID shape.
--
-- 2. "Oil Sample Tracker" (the hand-synchronized monthly-grid status sheet,
--    dual-written alongside every oil_samples insert) is NOT ported as a
--    table. It's a materialized view of oil_samples that a real database
--    computes with a query instead of a second table kept in sync by hand
--    (finding #6) — see the oil_sample_monthly_status VIEW at the bottom.
-- ============================================================================

USE acc_reliability;

-- ── Lubrication points (replaces "Equipment Registry" — NOT the same as
--    equipment; one equipment_id can own several lubrication points, e.g.
--    separate left/right gearbox sides, same shape as today's LP_ID rows) ──
CREATE TABLE lubrication_points (
  lp_id                    VARCHAR(50) PRIMARY KEY,  -- natural key, e.g. 'LP-111.AF040-GB-R'
  equipment_id             VARCHAR(50) NOT NULL,
  lubrication_location     VARCHAR(255),
  point_code               VARCHAR(50),
  lubrication_point        VARCHAR(255),
  position                 VARCHAR(100),
  area                     VARCHAR(100),
  manufacturer             VARCHAR(255),
  model                    VARCHAR(255),
  operating_temperature_c  DECIMAL(6,2),
  lubricant_type           VARCHAR(100),
  lubricant_brand          VARCHAR(100),
  lubricant_quantity_l     DECIMAL(10,2),
  oil_analysis_required    BOOLEAN NOT NULL DEFAULT FALSE,
  oil_analysis_interval    INT,                       -- days
  oil_change_interval      INT,                       -- days
  org_id                   INT,                        -- contractor; write-locked after creation at the app layer,
                                                         -- same as today's lockEquipmentRegistryContractor_()
  lp_status                VARCHAR(50) NOT NULL DEFAULT 'Active',
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lp_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT fk_lp_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_lp_equipment (equipment_id)
) ENGINE=InnoDB;

-- ── Oil samples (replaces Data_Entry). sample_uid is the real unique key —
--    survey confirmed (lp_id, sample_id) has 42 real collisions in
--    production data where the lab reuses sample-ID numbering across
--    rounds, so sample_id is kept purely as the lab's own label, not a
--    constraint. ───────────────────────────────────────────────────────
CREATE TABLE oil_samples (
  sample_uid            VARCHAR(100) PRIMARY KEY,   -- the real unique key (matches current app behavior)
  lp_id                 VARCHAR(50) NOT NULL,
  sample_id             VARCHAR(100),                -- lab's own label — NOT unique, kept for display/reference only
  sample_date           DATE,
  report_status         VARCHAR(50),
  contamination_rating  VARCHAR(50),
  equipment_rating      VARCHAR(50),
  lubricant_rating      VARCHAR(50),
  particle_count_4um    DECIMAL(10,2),
  particle_count_6um    DECIMAL(10,2),
  particle_count_14um   DECIMAL(10,2),
  pq_index              DECIMAL(10,2),
  visc_40c              DECIMAL(10,2),
  tan                   DECIMAL(10,2),
  oxidation              DECIMAL(10,2),
  water                  DECIMAL(10,2),
  wear_ag                DECIMAL(10,2),
  wear_al                DECIMAL(10,2),
  wear_cr                DECIMAL(10,2),
  wear_cu                DECIMAL(10,2),
  wear_fe                DECIMAL(10,2),
  wear_mo                DECIMAL(10,2),
  wear_ni                DECIMAL(10,2),
  wear_pb                DECIMAL(10,2),
  wear_sn                DECIMAL(10,2),
  contaminant_k          DECIMAL(10,2),
  contaminant_na         DECIMAL(10,2),
  contaminant_si         DECIMAL(10,2),
  additive_b             DECIMAL(10,2),
  additive_ba            DECIMAL(10,2),
  additive_ca            DECIMAL(10,2),
  additive_mg            DECIMAL(10,2),
  additive_p             DECIMAL(10,2),
  additive_zn            DECIMAL(10,2),
  alert_type             VARCHAR(50),
  sample_analysis        TEXT,
  flagged_parameters     TEXT,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_samples_lp FOREIGN KEY (lp_id) REFERENCES lubrication_points(lp_id),
  INDEX idx_samples_lp_date (lp_id, sample_date)
) ENGINE=InnoDB;

-- ── Actions (replaces Action Tracker). action_no kept as a display label
--    only (survey: not globally unique — repeats across different lp_id),
--    real PK is a surrogate. ───────────────────────────────────────────
CREATE TABLE oil_actions (
  action_uid              INT AUTO_INCREMENT PRIMARY KEY,
  action_no               VARCHAR(50),                -- display label, format 'O-###' — not unique, matches current data
  lp_id                   VARCHAR(50) NOT NULL,
  oil_type                VARCHAR(100),
  revision_date           DATE,
  sample_date             DATE,
  sample_result           VARCHAR(50),
  sample_analysis         TEXT,
  last_change             DATE,
  status                  ENUM('Open','In Progress','Waiting Stoppage','Closed') NOT NULL DEFAULT 'Open',
  contractor_action       TEXT,
  org_id                  INT,
  completed_date          DATE,
  prev_month_agreed_action TEXT,
  acc_action               TEXT,
  agreed_action            TEXT,
  closing_comment          TEXT,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_actions_lp FOREIGN KEY (lp_id) REFERENCES lubrication_points(lp_id),
  CONSTRAINT fk_actions_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_actions_lp (lp_id),
  INDEX idx_actions_status (status)
) ENGINE=InnoDB;

-- ── Route templates (replaces ROUTINE_TEMPLATES) ─────────────────────────
CREATE TABLE route_templates (
  template_id              INT AUTO_INCREMENT PRIMARY KEY,
  route_name                VARCHAR(255) NOT NULL,
  route_type                 VARCHAR(50) NOT NULL,   -- Oil Change / Sampling / Emergency Top Up
  org_id                      INT,
  area                        VARCHAR(100),
  oil_type                    VARCHAR(100),
  frequency                   ENUM('Weekly','Monthly','Quarterly') NOT NULL,
  next_generate_date          DATE,
  status                      ENUM('Active','Paused') NOT NULL DEFAULT 'Active',
  created_by                  INT,
  last_generated_routine_id   INT,   -- FK added after routines table exists, see ALTER below
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_templates_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_templates_created_by FOREIGN KEY (created_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ── Routines (replaces ROUTINES — the work-order/approval workflow).
--    created_by/assigned_to/approved_by are real FKs to users now (survey
--    finding #4: these were free-text strings before) — a user record must
--    exist for whoever's assigned, matching the fact that assignment is
--    already driven by a real logged-in session identity in the current app. ─
CREATE TABLE routines (
  routine_id          INT AUTO_INCREMENT PRIMARY KEY,
  created_by           INT NOT NULL,
  assigned_to           INT,
  org_id                 INT,
  status                 ENUM('Unassigned','Assigned','InProgress','Submitted','Approved','Paused','Cancelled')
                          NOT NULL DEFAULT 'Unassigned',
  submitted_date          DATETIME,
  approved_by             INT,
  approved_date            DATETIME,
  acc_comment              TEXT,
  acc_comment_by           INT,
  acc_comment_date         DATETIME,
  route_name               VARCHAR(255),
  route_type                VARCHAR(50),
  due_date                   DATE,
  source_template_id          INT,
  reason                       TEXT,      -- required for Emergency Top Up
  area                          VARCHAR(100),
  duration_days                 INT,      -- grace period
  created_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_routines_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT fk_routines_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(user_id),
  CONSTRAINT fk_routines_approved_by FOREIGN KEY (approved_by) REFERENCES users(user_id),
  CONSTRAINT fk_routines_acc_comment_by FOREIGN KEY (acc_comment_by) REFERENCES users(user_id),
  CONSTRAINT fk_routines_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_routines_template FOREIGN KEY (source_template_id) REFERENCES route_templates(template_id),
  INDEX idx_routines_status (status),
  INDEX idx_routines_assigned (assigned_to)
) ENGINE=InnoDB;

ALTER TABLE route_templates
  ADD CONSTRAINT fk_templates_last_routine FOREIGN KEY (last_generated_routine_id) REFERENCES routines(routine_id);

-- ── Routine items (replaces OA_ROUTINE_ITEMS — one row per LP point per routine) ─
CREATE TABLE routine_items (
  routine_item_id    INT AUTO_INCREMENT PRIMARY KEY,
  routine_id          INT NOT NULL,
  lp_id                 VARCHAR(50) NOT NULL,
  item_type              ENUM('Change','Sample','TopUp') NOT NULL,
  required_oil_type       VARCHAR(100),
  implemented              BOOLEAN,
  not_implemented_reason   TEXT,
  actual_date               DATE,
  actual_quantity            DECIMAL(10,2),
  sample_taken                BOOLEAN,
  created_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_routine_items_routine FOREIGN KEY (routine_id) REFERENCES routines(routine_id) ON DELETE CASCADE,
  CONSTRAINT fk_routine_items_lp FOREIGN KEY (lp_id) REFERENCES lubrication_points(lp_id),
  INDEX idx_routine_items_routine (routine_id)
) ENGINE=InnoDB;

-- ── Oil change / top-up events (replaces Oil Change LOG and Oil Top Up LOG
--    — kept as two tables, same as today, since Top Up carries its own
--    required Reason field and distinct workflow; merging them would lose
--    that distinction for no real benefit) ────────────────────────────────
CREATE TABLE oil_change_log (
  event_id          INT AUTO_INCREMENT PRIMARY KEY,
  lp_id               VARCHAR(50) NOT NULL,
  routine_item_id      INT,     -- optional FK
  event_date             DATETIME NOT NULL,
  quantity_used            DECIMAL(10,2),
  oil_brand_type            VARCHAR(100),
  done_by                    INT,
  org_id                      INT,
  condition_notes              TEXT,
  photo_url                     VARCHAR(500),
  next_due_date                  DATE,    -- server-computed from lubrication_points.oil_change_interval, never trusted from client
  created_at                      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_change_log_lp FOREIGN KEY (lp_id) REFERENCES lubrication_points(lp_id),
  CONSTRAINT fk_change_log_item FOREIGN KEY (routine_item_id) REFERENCES routine_items(routine_item_id),
  CONSTRAINT fk_change_log_user FOREIGN KEY (done_by) REFERENCES users(user_id),
  CONSTRAINT fk_change_log_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_change_log_lp_date (lp_id, event_date)
) ENGINE=InnoDB;

CREATE TABLE oil_topup_log (
  topup_id       INT AUTO_INCREMENT PRIMARY KEY,
  lp_id            VARCHAR(50) NOT NULL,
  routine_id         INT,     -- optional FK
  event_date           DATETIME NOT NULL,
  quantity               DECIMAL(10,2),
  oil_brand_type           VARCHAR(100),
  reason                     TEXT NOT NULL,   -- required, unlike oil_change_log's condition_notes
  requested_by                 INT,
  done_by                       INT,
  org_id                         INT,
  remarks                        TEXT,
  created_at                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_topup_log_lp FOREIGN KEY (lp_id) REFERENCES lubrication_points(lp_id),
  CONSTRAINT fk_topup_log_routine FOREIGN KEY (routine_id) REFERENCES routines(routine_id),
  CONSTRAINT fk_topup_log_requested_by FOREIGN KEY (requested_by) REFERENCES users(user_id),
  CONSTRAINT fk_topup_log_done_by FOREIGN KEY (done_by) REFERENCES users(user_id),
  CONSTRAINT fk_topup_log_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_topup_log_lp_date (lp_id, event_date)
) ENGINE=InnoDB;

-- ── Oil inventory (replaces Oil Inventory + Oil Inventory LOG). Current
--    stock and last-movement-date were live SUMIFS/MAXIFS sheet formulas —
--    here they're just queries (see the oil_inventory_current_stock VIEW
--    below) instead of denormalized columns that must be kept in sync. ───
CREATE TABLE oil_products (
  product_id            VARCHAR(50) PRIMARY KEY,
  lubricant_type         VARCHAR(100),
  lubricant_brand         VARCHAR(100),
  container_type            VARCHAR(50),
  container_size_l           DECIMAL(10,2),
  unit                         VARCHAR(20),
  recorder_level                DECIMAL(10,2),   -- sic, matches the real (misspelled) sheet column
  storage_location                VARCHAR(255),
  supplier                          VARCHAR(255),
  unit_cost                          DECIMAL(10,2),
  status                               VARCHAR(50) NOT NULL DEFAULT 'Active',
  notes                                 TEXT,
  org_id                                 INT,     -- stock is contractor-owned, not shared
  equivalent_to_type                      VARCHAR(100),
  equivalent_to_brand                      VARCHAR(100),
  created_at                                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_org FOREIGN KEY (org_id) REFERENCES organizations(org_id)
) ENGINE=InnoDB;

CREATE TABLE oil_inventory_log (
  movement_id       INT AUTO_INCREMENT PRIMARY KEY,
  product_id          VARCHAR(50) NOT NULL,
  movement_type          ENUM('Receipt','Issue','Adjustment') NOT NULL,
  quantity                 DECIMAL(10,2) NOT NULL,
  movement_date              DATETIME NOT NULL,
  linked_lp_id                 VARCHAR(50),
  linked_event_id                INT,
  org_id                           INT,
  done_by                           INT,
  reference                           VARCHAR(255),
  notes                                 TEXT,
  created_at                             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_log_product FOREIGN KEY (product_id) REFERENCES oil_products(product_id),
  CONSTRAINT fk_inv_log_lp FOREIGN KEY (linked_lp_id) REFERENCES lubrication_points(lp_id),
  CONSTRAINT fk_inv_log_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_inv_log_user FOREIGN KEY (done_by) REFERENCES users(user_id),
  INDEX idx_inv_log_product_date (product_id, movement_date)
) ENGINE=InnoDB;

-- ── Reference / admin tables (replace OL_ACTION_PHRASES,
--    OL_MODULE_RESPONSIBILITIES, OL_NOTIFY_REVIEWERS) ─────────────────────
CREATE TABLE action_phrases (
  phrase_id  INT AUTO_INCREMENT PRIMARY KEY,
  phrase     VARCHAR(500) NOT NULL
) ENGINE=InnoDB;

-- Survey finding #5: this, OL_NOTIFY_REVIEWERS, and Platform Core's own
-- user_roles/organizations already overlap conceptually (all answer "who
-- holds what role for what org"). Kept as its own table for now since the
-- notification routing concept (module × org × role → a specific person)
-- doesn't map 1:1 onto user_roles without a larger RBAC rework — flagged
-- here as a candidate for a follow-up consolidation pass, not done blind.
CREATE TABLE module_responsibilities (
  responsibility_id  INT AUTO_INCREMENT PRIMARY KEY,
  module_id            VARCHAR(50) NOT NULL,
  org_id                 INT NOT NULL,
  role_id                 INT,
  user_id                   INT NOT NULL,
  -- Standard SQL treats NULL as never equal to NULL, so a plain UNIQUE KEY
  -- on (module_id, org_id, role_id) silently allows duplicate rows whenever
  -- role_id is NULL ("responsible for this module/org regardless of role"
  -- — the common case). role_key coalesces NULL to 0 specifically so the
  -- uniqueness check below actually catches that case too.
  role_key                  INT AS (COALESCE(role_id, 0)) STORED,
  CONSTRAINT fk_resp_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_resp_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
  CONSTRAINT fk_resp_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE KEY uq_resp (module_id, org_id, role_key)
) ENGINE=InnoDB;

CREATE TABLE notify_reviewers (
  org_id   INT NOT NULL,
  user_id   INT NOT NULL,
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT fk_notify_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ── In-app notifications (replaces OL_IN_APP_NOTIFICATIONS) ──────────────
CREATE TABLE in_app_notifications (
  notification_id   INT AUTO_INCREMENT PRIMARY KEY,
  recipient_user_id   INT NOT NULL,
  type                  VARCHAR(50),
  message                 TEXT,
  org_id                    INT,
  link_page                  VARCHAR(100),
  link_record_id               VARCHAR(100),
  created_at                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read                         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at                           DATETIME,
  CONSTRAINT fk_notif_user FOREIGN KEY (recipient_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_notif_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_notif_recipient (recipient_user_id, is_read)
) ENGINE=InnoDB;

-- ── Sample digest log (replaces OL_SAMPLE_DIGEST_LOG — dedup tracker) ────
CREATE TABLE sample_digest_log (
  org_id   INT NOT NULL,
  month      VARCHAR(7) NOT NULL,   -- 'YYYY-MM'
  sent_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, month),
  CONSTRAINT fk_digest_org FOREIGN KEY (org_id) REFERENCES organizations(org_id)
) ENGINE=InnoDB;

-- ============================================================================
-- Views — replace the hand-synchronized "materialized status" sheets
-- (survey finding #6) with real queries over the event-log tables above.
-- ============================================================================

-- Replaces "Oil Last Change" (the formula-only sheet nobody actually reads
-- from the backend today) and the change-due half of what Oil Sample
-- Tracker's monthly grid was manually kept in sync for.
CREATE VIEW oil_last_change AS
SELECT lp_id, MAX(event_date) AS last_change_date,
       (SELECT next_due_date FROM oil_change_log l2
        WHERE l2.lp_id = l1.lp_id ORDER BY event_date DESC LIMIT 1) AS next_due_date
FROM oil_change_log l1
GROUP BY lp_id;

-- Replaces Oil Inventory's two SUMIFS/MAXIFS formula columns (current_stock,
-- last_movement_date) — computed from oil_inventory_log instead of stored
-- and kept in sync by a spreadsheet formula.
CREATE VIEW oil_inventory_current_stock AS
SELECT p.product_id,
       COALESCE(SUM(CASE
         WHEN l.movement_type = 'Receipt' THEN l.quantity
         WHEN l.movement_type = 'Issue' THEN -l.quantity
         WHEN l.movement_type = 'Adjustment' THEN l.quantity
       END), 0) AS current_stock,
       MAX(l.movement_date) AS last_movement_date
FROM oil_products p
LEFT JOIN oil_inventory_log l ON l.product_id = p.product_id
GROUP BY p.product_id;

-- Replaces "Oil Sample Tracker"'s monthly-grid status cells — last sample
-- date and days-since, per lubrication point, computed directly instead of
-- dual-written alongside every oil_samples insert.
CREATE VIEW oil_sample_last_status AS
SELECT lp.lp_id,
       MAX(s.sample_date) AS last_sample_date,
       DATEDIFF(CURDATE(), MAX(s.sample_date)) AS days_since_last_sample,
       lp.oil_analysis_interval
FROM lubrication_points lp
LEFT JOIN oil_samples s ON s.lp_id = lp.lp_id
WHERE lp.oil_analysis_required = TRUE
GROUP BY lp.lp_id, lp.oil_analysis_interval;

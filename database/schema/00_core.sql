-- ============================================================================
-- ACC Reliability Platform — Core schema (Platform Core)
-- ============================================================================
-- Shared foundation every module's own schema (01_oil_lubrication.sql,
-- 02_vibration_analysis.sql, ...) references via foreign key. Replaces:
--   - Platform Core's USERS/ROLES/USER_ROLES/ORG_MASTER/ROLE_PERMISSION
--     sheets (kept as-is below, just as real tables with real FKs)
--   - The never-built EQUIPMENT_MASTER skeleton — built for real here, and
--     made the ONE equipment table both feature modules reference, instead
--     of each module keeping its own independent, drifting equipment list
--     (Oil Lubrication's "Equipment Registry" keyed by LP_ID, Vibration's
--     RMS/SPM Register pair keyed by Equipment_ID — see 01/02 for how each
--     module's own point-level tables now point back to equipment.equipment_id)
--   - Three independently-reinvented flat key/value settings stores
--     (Platform Core's ADMIN_SETTINGS, Vibration's Configuration sheet,
--     Oil Lubrication's Script Properties) — one settings table, scoped by
--     module_id
--   - Per-module audit log reinvention (Oil Lubrication's own Audit Log
--     sheet) — one shared audit_log table, scoped by module_id
--
-- Deliberately NOT ported: the unused 8-layer RBAC skeleton (ROLE_MASTER,
-- MODULE_TAB_MASTER, FEATURE_MASTER, ACTION_MASTER, SCOPE_MASTER) — survey
-- confirmed these were designed but never read/written by any real code.
-- The simplified Role+Module+Action shape (role_permissions below) is what
-- actually ships and is kept as-is, just normalized into real tables.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS acc_reliability
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE acc_reliability;

-- ── Organizations (replaces ORG_MASTER; also absorbs the never-built
--    CONTRACTOR_MASTER — survey found it redundant with ORG_MASTER, which
--    already carries org_type = 'Contractor') ────────────────────────────
CREATE TABLE organizations (
  org_id      INT AUTO_INCREMENT PRIMARY KEY,
  org_code    VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. 'ACC', 'RHI', 'ASEC' — the ONE canonical
                                                -- code every module's FK uses, replacing each
                                                -- module's own ad hoc text + normalization code
                                                -- (oil-lubrication's canonicalContractor_(),
                                                -- vibration's un-normalized free-text Contractor column)
  org_name    VARCHAR(255) NOT NULL,
  org_type    ENUM('ACC','Contractor') NOT NULL,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Users / Roles (replaces USERS, ROLES, USER_ROLES) ───────────────────
CREATE TABLE users (
  user_id               INT AUTO_INCREMENT PRIMARY KEY,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  password_salt         VARCHAR(255) NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  org_id                INT NOT NULL,
  status                ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',  -- soft-delete only, matches current behavior
  theme_palette         VARCHAR(50),
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(org_id)
) ENGINE=InnoDB;

CREATE TABLE roles (
  role_id    INT AUTO_INCREMENT PRIMARY KEY,
  role_name  VARCHAR(100) NOT NULL UNIQUE  -- App Admin, Technician, Contractor Engineer, Reliability Engineer, Manager
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_id  INT NOT NULL,
  role_id  INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Modules (new — gives ROLE_PERMISSION's free-text ModuleId a real,
--    constrained reference instead of a typo-able string) ────────────────
CREATE TABLE modules (
  module_id    VARCHAR(50) PRIMARY KEY,   -- 'platform-core', 'oil-lubrication', 'vibration-analysis', ...
  module_name  VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- ── Role permissions (replaces ROLE_PERMISSION — the one RBAC table that
--    actually ships). action_code/module_id = '*' is kept as the literal
--    wildcard value, matching current ROLE-ADMIN behavior, rather than
--    inventing a separate "is_admin" flag that would need its own code path. ─
CREATE TABLE role_permissions (
  role_permission_id  INT AUTO_INCREMENT PRIMARY KEY,
  role_id             INT NOT NULL,
  module_id           VARCHAR(50) NOT NULL,   -- may be the literal '*' wildcard — not an FK for that reason
  action_code          VARCHAR(20) NOT NULL,   -- View/Create/Edit/Approve/Delete, or '*'
  allowed              BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
  UNIQUE KEY uq_role_module_action (role_id, module_id, action_code)
) ENGINE=InnoDB;

-- ── Equipment (the real EQUIPMENT_MASTER — never built before; now the
--    ONE table both Oil Lubrication's and Vibration Analysis's own
--    point-level tables reference, replacing three independently-drifting
--    equipment lists). org_id = owning/responsible contractor. line/eq_type
--    are additions beyond the original spec (Main/Plant/Sub_Area only) —
--    Vibration's two Register sheets rely on both heavily, so they're
--    promoted to real columns here instead of being pushed back down into
--    a module-specific table. ──────────────────────────────────────────
CREATE TABLE equipment (
  equipment_id         VARCHAR(50) PRIMARY KEY,  -- natural key, e.g. '531.BE220' — kept as-is from
                                                   -- the real sheets rather than a surrogate int, since
                                                   -- every existing sheet/reading/action already carries
                                                   -- this exact string and migration needs a direct match
  description          VARCHAR(500),
  main_area             VARCHAR(100),
  plant_area            VARCHAR(100),
  sub_area              VARCHAR(100),
  line                  VARCHAR(100),             -- e.g. 'CM1' — heavily used by Vibration's Register sheets
  eq_type               VARCHAR(100),             -- e.g. 'Mill', 'Fan' — Vibration's Eq Type column
  org_id                INT,                       -- owning/responsible contractor, nullable until assigned
  criticality            VARCHAR(50),
  parent_equipment_id   VARCHAR(50),               -- self-referencing, for equipment hierarchies
  status                 ENUM('Active','Inactive','Decommissioned') NOT NULL DEFAULT 'Active',
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipment_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  CONSTRAINT fk_equipment_parent FOREIGN KEY (parent_equipment_id) REFERENCES equipment(equipment_id)
) ENGINE=InnoDB;

-- ── Settings (replaces Platform Core's ADMIN_SETTINGS, Vibration's
--    Configuration sheet, and Oil Lubrication's Script Properties — one
--    table, scoped by module_id so module-specific settings don't collide) ─
CREATE TABLE settings (
  module_id      VARCHAR(50) NOT NULL,   -- 'global' for platform-wide settings
  setting_key    VARCHAR(100) NOT NULL,
  setting_value  TEXT,
  modified_by    INT,
  modified_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (module_id, setting_key),
  CONSTRAINT fk_settings_modified_by FOREIGN KEY (modified_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ── Audit log (replaces Oil Lubrication's own "Audit Log" sheet — made
--    shared/generic so Vibration Analysis and future modules get the same
--    audit trail without reinventing it again) ───────────────────────────
CREATE TABLE audit_log (
  audit_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  module_id        VARCHAR(50) NOT NULL,
  entity_type      VARCHAR(100) NOT NULL,   -- e.g. 'equipment', 'routine', 'action'
  entity_id        VARCHAR(100) NOT NULL,   -- the natural id of whatever changed
  action           VARCHAR(50) NOT NULL,    -- Create/Update/Delete/...
  acting_user_id   INT,                      -- nullable for system-triggered actions
  org_id           INT,
  summary          TEXT,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_log_user FOREIGN KEY (acting_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_audit_log_org FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  INDEX idx_audit_entity (module_id, entity_type, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- ── Idempotency log (replaces IDEMPOTENCY_LOG — generic duplicate-submit
--    guard, currently only used by createUser but kept general-purpose) ──
CREATE TABLE idempotency_log (
  operation_id  VARCHAR(100) PRIMARY KEY,
  user_id       INT,
  endpoint      VARCHAR(100) NOT NULL,
  result_json   TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

# Oil Analysis Module — Database Schema (Draft for Review)

**Status:** DRAFT — for review before anything gets built as real Google
Sheets or Apps Script code. Consolidates every decision from
`docs/oil-analysis-module-notes.md` into concrete sheet-by-sheet column
lists. Also adds the minimal Platform Core pieces this module depends on
(login, RBAC v1, shared Equipment Master).

Two backends, per the Foundation's module-isolation architecture: this
document defines what lives in **Platform Core's** sheets (shared) and
what lives in **Oil Analysis's own** sheets (module-owned, per the
settings-vs-data split you asked for).

---

## Part 1 — Platform Core (shared, minimal v1 scope)

Built once, used by every module including Oil Analysis. RBAC here is
the **simplified v1 scope**: role + org + contractor isolation — not the
full 8-layer chain (deferred).

### USERS
| Column | Notes |
|---|---|
| UserId | |
| Email | unique login name |
| PasswordHash / PasswordSalt | HMAC-SHA256, per-user salt |
| MustChangePassword | forced on first login |
| OrgId | FK → ORG_MASTER |
| Status | Active / Inactive (deactivate, never delete) |
| ThemePalette | user's chosen palette (theme setting lives here, not per-module) |
| CreatedDate / ModifiedDate | |

### ORG_MASTER
Admin-managed, not hardcoded — covers both "who a user belongs to" and
"who a piece of equipment is assigned to." | OrgId | OrgName | OrgType
(`ACC` / `Contractor`) | Status |. Seeded with ACC, RHI, ASEC; App Admin
can add a future contractor without a code change.

### ROLES / USER_ROLES
`ROLES`: RoleId, RoleName (App Admin, Technician, Contractor Engineer,
Reliability Engineer, Manager). `USER_ROLES`: UserId, RoleId —
many-to-many, a user can hold several roles at once.

### ROLE_PERMISSION (v1 simplified shape)
RoleId, ModuleId, ActionCode (`View` / `Create` / `Edit` / `Approve` /
`Delete`), Allowed. No Tab/Feature/Field layers yet — those get added to
this same table shape later without a schema change, per the Foundation
spec's simplified-RBAC decision.

### EQUIPMENT_MASTER (centralized — both modules read this)
Equipment_ID, Equipment_Description, Main_Area, Plant_Area, Sub_Area,
Contractor (FK → ORG_MASTER, OrgType=Contractor), Criticality
(High/Medium/Low), Parent_Equipment_ID, Equipment_Status
(Active/Inactive), Created_Date, Modified_Date. Write authority: App
Admin only (equipment/contractor changes) — open question on whether
point-level writes (LP/VIB) also require App Admin, flagged in the
Foundation spec.

### MODULE_REGISTRY
ModuleId, ModuleName, EndpointUrl, Enabled — lets Owner Center list/
toggle modules without a code change.

### ADMIN_SETTINGS
Key, Value, ModifiedDate, ModifiedBy — backup schedule, data-size alarm
thresholds, minimum-active-admin count, available theme palettes.

---

## Part 2 — Oil Analysis module (its own backend, its own Sheets)

### Settings sheet

**OA_SETTINGS** — Key, Value, ModifiedDate, ModifiedBy. Holds workflow
parameters, not business data:
- `ChangeDueCapYears` = 2 (the hard cap for analysis-required points)
- `SamplingCheckWindowMonths` = 6 (how close to the cap before an
  analysis request auto-triggers)
- Anything else operational that isn't a record of real activity.

**OA_ACTION_PHRASES** — No / Phrase. Reusable pick-list for the
Contractor Action / ACC Action / Agreed Action fields (carried over from
the old Action Registry sheet's concept — a maintained phrase list, not
free text every time).

### Data sheets

**OA_LP_REGISTER** (935 rows today — the module-owned point register,
per the Part-1/Part-2 split just confirmed)
| Column | Notes |
|---|---|
| LP_ID | permanent ID, e.g. `LP-111.AF040-GB-R` |
| Equipment_ID | FK → Platform Core's EQUIPMENT_MASTER |
| Lubrication_Location | |
| Point_Code | e.g. `GB`, `HC` |
| Lubrication_Point | description |
| Position | e.g. `L` / `R` / `R1`, blank where not applicable |
| Area | e.g. RM#1, Kiln#1 |
| Manufacturer / Model | |
| Operating_Temperature_C | |
| Lubricant_Type / Lubricant_Brand | |
| Lubricant_Quantity_L | pre-fills the change-event Quantity field |
| Oil_Analysis_Required | Yes/No |
| Oil_Analysis_Interval | e.g. "6 Months", only meaningful if required=Yes |
| Oil_Change_Interval | e.g. "2 Y", "As needed" — only meaningful if required=No |
| Contractor | FK → Platform Core's ORG_MASTER; drives contractor isolation for every record below that references this LP_ID |
| LP_Status | Active/Inactive |
| Created_Date / Modified_Date | |

**OA_CHANGE_LOG** (new — the universal, event-history redesign, replacing
the old Last-Change/Next-Due-only sheet)
| Column | Notes |
|---|---|
| EventId | |
| LP_ID | FK → OA_LP_REGISTER — covers **all 935 points**, not just the 151 analysis-required |
| EventType | Change / Top-up |
| EventDate | |
| QuantityUsed | pre-filled from OA_LP_REGISTER.Lubricant_Quantity_L, editable |
| OilBrandType | defaults from the register, editable |
| DoneBy | technician name |
| Contractor | inherited from the LP at event time |
| ConditionNotes | free text |
| PhotoUrl | optional, Drive reference |
| NextDueDate | computed at write time — see due-date logic below |
| Created_Date | |

**Due-date computation** (applies per LP_ID, drives what shows as
overdue on the log):
- Change-only points (Oil_Analysis_Required = No): `NextDueDate =
  EventDate + Oil_Change_Interval`. Flat, no analysis involved.
- Analysis-required points (Yes), capped at `ChangeDueCapYears` (2
  years): as the cap approaches, if no OA_SAMPLES row exists for this
  LP_ID within `SamplingCheckWindowMonths` (6 months) of the cap date, an
  analysis request is triggered (see OA_SAMPLES below). A normal result
  extends `NextDueDate` by a fresh `ChangeDueCapYears`; an abnormal
  result's recommended action drives what happens next (§ below).

**OA_SAMPLES** (oil analysis samples — only for LP_IDs where
Oil_Analysis_Required = Yes; fields carried over from the old
`Data_Entry` sheet's real chemistry columns, now keyed on LP_ID instead
of the old suffixed equipment code)
| Column | Notes |
|---|---|
| SampleId | |
| LP_ID | FK → OA_LP_REGISTER |
| SampleDate | |
| ReportStatus | Alert / Caution / Normal / Missing |
| ContaminationRating / EquipmentRating / LubricantRating | |
| ParticleCount_4um / _6um / _14um | |
| PQIndex | |
| Visc40C / TAN / Oxidation / Water | |
| Wear_Ag / Al / Cr / Cu / Fe / Mo / Ni / Pb / Sn | wear-metal readings |
| Contaminants_K / Na / Si | |
| Additives_B / Ba / Ca / Mg / P / Zn | |
| AlertType | short classification, e.g. "Caution – Elevated Fe & Si" |
| Recommendations | lab's free-text analysis |
| FlaggedParameters | e.g. "Cu:Alert,Fe:Alert" — from the old app's PDF-import feature |
| LabReportFileUrl | the original PDF, Drive reference — authoritative source |
| Contractor | inherited from the LP at sample time |
| Created_Date / Modified_Date | |

**OA_ACTIONS** (action tracker — fields carried over from the old
`Action Tracker` sheet, now keyed on LP_ID)
| Column | Notes |
|---|---|
| ActionId | e.g. `O-###` |
| LP_ID | FK → OA_LP_REGISTER |
| TriggerType | Sample / Change / Manual |
| TriggerReference | e.g. the SampleId or EventId that raised this action |
| Description | |
| RevisionDate | |
| Status | Open / In Progress / Waiting Stoppage / Closed |
| ContractorAction / ACCAction / AgreedAction | free text, pick-list assisted from OA_ACTION_PHRASES |
| ClosingComment | |
| Contractor | |
| CompletedDate | |
| Created_Date / Modified_Date | |

---

## Open items before this can be built

1. ~~Point-level write authority~~ **RESOLVED: App Admin only** — adding/
   editing an LP requires App Admin, same as equipment itself. No module
   role gets write access to `OA_LP_REGISTER`.
2. ~~`ROLE_PERMISSION` starting values~~ **AGREED** — simplified v1 shape
   (role + module + action) confirmed as the starting structure.
3. **Approval workflow for Oil Analysis — still open, needs more detail
   before deciding (see module notes for the explanation with
   examples).**
4. ~~332.FN400 and the 6 compressors~~ **CONFIRMED** — both get added to
   `OA_LP_REGISTER` as part of the initial import.


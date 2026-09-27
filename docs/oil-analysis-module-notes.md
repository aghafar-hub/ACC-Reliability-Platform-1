# Oil Analysis Module — Requirements Notes (Live Draft)

> Same style as `docs/requirements-notes.md`: a running, append-only log of
> the discussion, not a finished spec. This covers evolving
> `apps/oil-analysis` (the copied-in app) into the real Oil Analysis
> module. No implementation until the user says so explicitly.

## Context / trigger

User supplied two files for review (2026-09-27), explicitly asking for
review + discussion only, no changes yet:

- `Lubrication_App.xlsx` — a new, more complete lubrication register.
- `ACC_OIL_Analysis_Report_-_V2.2.xlsx` — the oil-analysis app's current
  real live database (a snapshot/export, not a live connection).

## Findings from reviewing both files

**`Lubrication_App.xlsx` (`Sheet1`, 935 data rows):**
- Columns: LP_ID, Equipment_ID, Lubrication_Location, Point_Code,
  Lubrication_Point, Position, Area, Manfacture, Model,
  Operating_Temperature_C, Lubricant_Type, Lubricant_Brand,
  Lubricant_Quantity_L, Oil_Analysis_Required, Oil_Analysis_Interval,
  Oil_Change_Interval, Contractor, LP_Status, Created_Date.
- **935 lubrication points across 604 unique equipment** — confirms one
  equipment can have several LPs (matches the earlier Asset Master data).
- `LP_ID` format e.g. `LP-111.AF040-GB-R` — same scheme as the
  `LP_POINT_MASTER` sheet already reviewed for the platform Foundation
  (this looks like an updated/expanded version of that same register).
- `Oil_Analysis_Required`: **151 "Yes"** (+2 "NO" — inconsistent casing,
  same as "No"), **782 "No"**.
- `Contractor`: RHI 472 / ASEC 463.
- `Oil_Change_Interval` (populated mainly for the non-analysis points):
  2Y (347), 3Y (160), "As needed" (92), 5Y (69), 1Y (54), 0.5Y (33),
  1.5Y (17), 4Y (11).

**`ACC_OIL_Analysis_Report_-_V2.2.xlsx` (the current live oil-analysis
database):**
- **Equipment Registry**: only **153 rows** — far fewer than the real
  935 LP count. Confirms the user's exact complaint: where one equipment
  has multiple lube points, the app fakes a unique key by suffixing the
  *equipment code itself*, e.g. `111.AF040 (L)` / `111.AF040 (R)` for
  that equipment's left/right gearboxes. 26 equipment in this registry
  already have 2+ suffixed codes this way (up to 4, e.g. `111.BC330 (L1)
  /(L2)/(R1)/(R2)`).
- **Data_Entry** (871 sample rows), **Action Tracker** (1,405 action
  rows), **Oil Change Log** (152 rows), **Oil Sample Tracker** (155
  equipment rows) — all keyed off that same suffixed "Equipment Code",
  not a real point ID.
- **The app today only covers the 153 oil-analysis equipment/points** —
  the ~784 change-only lubrication points from the new register aren't
  tracked here at all.
- **Oil Change Log today**: mostly (135/152) driven by
  `Frequency = "Oil Analysis"` (i.e. governed by the analysis interval,
  not a fixed calendar interval); only a handful (8 at 0.5Y, 3 at 2Y)
  already use a real time interval. Only Last Change / Next Due columns
  — no change-by-change history, no top-up tracking.
- `Data Entry_BD` sheet (2,642 rows) looks like an older/backup archive
  of sample data, separate from the live `Data_Entry` (871 rows) — not
  yet investigated in detail.

**Discrepancy flagged, not yet resolved:** old registry has 153
oil-analysis rows; new register has 151 "Yes" rows (+2 miscapitalized
"NO"). Not an exact match — some equipment's analysis requirement may
have changed, or codes don't align 1:1. Needs the matching exercise
(below) to actually surface where these differ, not a guess now.

## Decisions made (round 1)

- **"Update the database without touching the old database" clarified:**
  means design/build the new database structure **here, in this repo's
  copy** (`apps/oil-analysis`). The **original apps' live Google Sheets
  are never touched** — the Excel files supplied are reference snapshots
  of that live data, not something we write back to.
- **ID reconciliation: yes, do the matching.** Map old suffixed equipment
  codes (e.g. `111.AF040 (R)`) to new `LP_ID`s (e.g.
  `LP-111.AF040-GB-R`), same approach as the vibration app's earlier
  `vib-id-merge` effort — exact/fuzzy match, **flag anything ambiguous or
  unmatched for the user to decide rather than guessing.**
- **Oil Change Log needs a real redesign**, not just an extension: user
  wants a "reliable oil change log that tracks all oil changes and keeps
  history of changing or topping up" — i.e. a genuine event history
  (every change and every top-up logged as its own record), not just the
  old sheet's Last Change / Next Due columns.
- **Scope clarified — important, changes earlier framing:** `apps/
  oil-analysis` and `apps/vibration-analysis` (the copied-in apps) **are
  now the real modules going forward**, to be called "modules" inside
  the platform. **The original standalone apps (their own separate repos
  /live deployments) are never touched again** — all future edits happen
  only on these copies. This supersedes the earlier framing (round 20 of
  the platform notes) that treated these as a temporary bridge separate
  from "the real Foundation-based module" — they now appear to *be* that
  module, evolved in place, not replaced later. **Worth confirming
  explicitly** whether that also means Foundation's auth/RBAC/contractor-
  isolation will eventually be wired into these same copies too, rather
  than a separate fresh build.

## Open items (to ask about next, before any implementation)

- The 153-vs-151 discrepancy — resolve by actually running the matching
  exercise and showing the user what doesn't line up.
- Exact fields for a change/top-up event record (date, quantity, oil
  brand/type at time of change, done-by/contractor, condition notes,
  evidence photo?).
- Whether the Oil Change Log becomes **universal** across all 935 LPs
  (both the 151 analysis-required and the ~784 change-only), with oil
  *analysis* (sampling/lab reports) remaining a separate, additional
  workflow layered only on top of the 151 — or something else.
- How due-dates/overdue status get computed for analysis-required points:
  from `Oil_Analysis_Interval` (sampling due), from `Oil_Change_Interval`
  (change due), or both tracked independently per point.
- Confirm whether Foundation auth/RBAC/contractor-isolation is intended
  to land on these same module copies eventually (per the scope
  clarification above) — affects how much to design now vs. later.

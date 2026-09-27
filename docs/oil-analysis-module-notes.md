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

## Decisions made (round 2)

- **Change/top-up event fields:** Event type (Change / Top-up), Quantity
  used (**pre-filled from the LP's registered `Lubricant_Quantity_L`**,
  editable rather than typed from scratch each time), Done by /
  Contractor, Condition notes. Oil brand/type used and an optional photo
  are included by default as previously stated.
- **Due-date relationship for the 151 dual-tracked points confirmed:** a
  good/normal sample result can **defer or extend** the change-due date
  (matches the old sheet's own header note: "if frequency changes due to
  oil analysis, max changing is 2 years" — i.e. analysis results govern
  the real change date, up to a hard cap). Sampling-due and change-due
  are not fully independent for these points — analysis outcome feeds
  into the change date.
- **Foundation integration confirmed:** the Foundation's login/RBAC/
  contractor-isolation (already approved in the platform spec) **will
  eventually be wired directly into these same `apps/vibration-analysis`
  and `apps/oil-analysis` copies** — not built as separate fresh modules
  from scratch. These copies are the real, permanent modules going
  forward.
- **Universal Oil Change Log: confirmed.** One log/table covers all 935
  LPs. Concrete example used to confirm: equipment `123.BC100` has
  `LP-123.BC100-GB` (Yes, 6-month sampling, change date driven by
  analysis) and `LP-123.BC100-HC` (No, flat 2-year interval) — both
  appear as rows in the same log, each computing its own due-date
  differently, so anyone looking at one equipment sees everything due on
  it in one place. Oil analysis itself (sampling/lab reports) stays a
  separate workflow layered only on the analysis-required rows, but
  feeds its result into that row's shared-log due-date.

## Open items (to ask about next, before any implementation)

- The 153-vs-151 discrepancy — resolve by actually running the matching
  exercise and showing the user what doesn't line up.
- Whether "a good sample result can defer/extend the change date" has a
  precise rule (e.g. always push to +1 interval? reset to a fresh full
  interval? capped at the 2-year max regardless?) — confirmed the
  *direction*, not yet the exact formula.


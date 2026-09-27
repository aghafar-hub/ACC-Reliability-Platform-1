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

## ID matching exercise (round 3 — ran the analysis, no app changes)

Matched all 153 old Equipment Registry codes against the new register's
LP_IDs. Full row-by-row results sent to the user as a CSV. Summary:

- **104/153 (68%) matched cleanly.** 32 of these needed correcting for a
  systematic `R2.` line-prefix the old sheet used that the new register
  drops (e.g. old `R2.322.BE220` → new equipment `322.BE220`).
- **43/153 (28%) ambiguous — genuinely need a human decision**, in a few
  real patterns, not 43 unique problems:
  - **Pattern A (~25 cases, the biggest bucket):** old sheet had ONE row
    per equipment; new register splits that equipment into several real
    lube points (e.g. `531–534.BE220`, `541–544.BE180` bucket elevators:
    each old row → 5 new points — main gearbox, overrunning clutch,
    backstop, auxiliary gearbox, hydraulic coupling). Can't tell from
    data alone which point the old history belongs to.
  - **Pattern B (~8 cases):** same issue, split by side too
    (`341/342/351/352.BE0xx` — old had one row per L/R side, new has 5
    distinct points per side).
  - **Pattern C:** genuinely different suffix vocabulary, not guessable
    (`131.BC500 (M01)/(M02)` vs. new `GB-R/GB-L/HC-R/HC-L`;
    `534.LQ145 - Gearbox`/`- Girth Gear` vs. new `GB-HY`/`GG-HY`).
  - **Pattern D:** `131.RE300.M11`/`M12` — no coded-position match at
    all, only a loose text-description overlap.
- **6/153 (4%) genuinely missing from the new register** — all Coal#1
  air compressors (CP524/525/526/530/535). **Independently
  cross-validated**: the earlier vibration-app `vib-id-merge` migration
  separately flagged some of these same compressor codes as missing from
  the master DB — real data gap, not a matching error.

## Round 4 — resolution mechanism for ambiguous matches

- **Patterns A/B/C/D all resolved the same way**, per user's explicit
  instruction: built a review workbook (`oil-analysis-ambiguous-review.xlsx`,
  sent to user) — Tab 1 lists every ambiguous old code with its candidate
  LP_IDs as grouped/color-banded rows and a tickbox column; user ticks
  the one correct LP_ID per old code (worked example given: for
  `531.BE220`-style bucket elevators, the user said the oil-analysis
  history is related to the main Gear Box, so they'll tick `GB` and
  leave the rest unticked).
- **6 missing compressors: confirmed — add them to the register now.**
  Caught and corrected a real mistake before sending: since these came
  from the OLD oil-analysis Equipment Registry (which only ever lists
  analysis-required equipment), they must be `Oil_Analysis_Required =
  Yes` with `Oil_Analysis_Interval = "If needed"` (pulled from that old
  sheet's own "Interval" column) — not change-only. Tab 2 of the same
  workbook proposes one placeholder LP per compressor (real data
  pre-filled: lubricant type, area, contractor from the old sheet), for
  the user to confirm or correct the point-level breakdown.
- **Waiting on:** the user filling in and returning the review workbook
  before any of this gets applied to a real database structure.

## Round 5 — ambiguous matches resolved (review workbook returned)

User filled in and returned `oil-analysis-ambiguous-review.xlsx`. All 41
ambiguous cases accounted for — 40 confirmed mappings, 1 flagged as new
equipment. Full confirmed mapping:

| Old code | Resolved to |
|---|---|
| 123.BC100 | LP-123.BC100-GB |
| 123.BC200 | LP-123.BC200-GB |
| 131.BC100 | LP-131.BC100-GB |
| 131.BC500 (M01) | LP-131.BC500-GB-R |
| 131.BC500 (M02) | LP-131.BC500-GB-L |
| 131.RE300 | LP-131.RE300-TUT |
| 321.BE220 | LP-321.BE220-GB |
| 321.LQ120 (T) | LP-321.LQ120-HY |
| 321.LQ145 (T) | LP-321.LQ145-HY |
| 321.RF090 | LP-321.RF090-GB |
| R2.322.BE220 | LP-322.BE220-GB |
| R2.322.LQ120(T) | LP-322.LQ120-HY |
| R2.322.LQ145 (T) | LP-322.LQ145-HY |
| R2.322.RF090 | LP-322.RF090-GB |
| 341.BE040 L / R | LP-341.BE040-GB-L / -GB-R |
| 342.BE050 L / R | LP-342.BE050-GB-L / -GB-R |
| 351.BE350 L / R | LP-351.BE350-GB-L / -GB-R |
| 352.BE340 L / R | LP-352.BE340-GB-L / -GB-R |
| 431.HT120 | LP-431.HT120-HY |
| 431.HT120(BE) | LP-431.HT120-BRG |
| R2.432.HT120(T) | LP-432.HT120-HY |
| R2.432.HT120(BE) | LP-432.HT120-BRG |
| 461.LQ145 | LP-461.LQ145-HY |
| 462.LQ145 | LP-462.LQ145-HY |
| 471.AC100 | LP-471.AC100-GB |
| R2.472.AC100 | LP-472.AC100-GB |
| 531/532/533/534.BE220 | LP-{code}-GB (main gearbox, each) |
| 534.LQ145 - Gearbox | LP-534.LQ145-GB-HY |
| 534.LQ145 - Girth Gear | LP-534.LQ145-GG-HY |
| 541/542/543/544.BE180 | LP-{code}-GB (main gearbox, each) |

**Pattern A/B resolution confirmed in practice:** as the user said it
would, every multi-point bucket-elevator/hoist case (BE220/BE180 series)
resolved to the **main Gear Box (`GB`)** point specifically — the other
sub-points (overrunning clutch, backstop, auxiliary gearbox, hydraulic
coupling) get no migrated history, consistent with the "default to the
main gearbox" pattern, just confirmed case-by-case rather than applied
blindly.

**Exception — `332.FN400`: NOT a match.** User's note: "treat this as
new equipment, the old 322.FN400 is different" — this old code needs a
genuinely new equipment/LP entry created (same treatment as the missing
compressors), not mapped to the existing `332.FN400` candidates found
during matching (which the user determined are actually a different,
already-covered asset). **Root cause confirmed:** equipment `332.FN400`
already exists in the new register with two bearing points (`Fr.B`/
`Fx.B` — Free/Fixed Bearing), which is exactly where the *other* two old
codes for this equipment (`R2.332.FN400(Fr.B)`/`(Fx.B)`, "Final fan
free/fixed bearings") already matched cleanly. But the plain
`332.FN400` old code is a **different point on the same equipment** —
"Main EP Fan Gear drive L#2" (a gearbox), described in the old sheet
with `MOBIL SHC 632`, 6-month interval, area `RM2`, contractor `RHI` —
and the new register has no gearbox point for this equipment at all.
**Proposed new LP** (needs confirmation, not yet added):
`LP-332.FN400-GB`, Point_Code `GB`, Lubrication_Point "Main EP Fan Gear
drive", Lubricant_Type `MOBIL SHC 632`, Oil_Analysis_Required `Yes`,
Oil_Analysis_Interval `6 Months`, Area `RM2`, Contractor `RHI`.

**Missing compressors (Tab 2): accepted as proposed**, no corrections
made — one placeholder `AC` point per compressor, `Oil_Analysis_Required
= Yes`, `Oil_Analysis_Interval = "If needed"`, real lubricant/area/
contractor data as pre-filled.

**ID mapping/reconciliation exercise is now effectively complete**
pending the one `332.FN400` follow-up.

## Round 6 — both remaining items resolved

- **`LP-332.FN400-GB` confirmed** — add it as proposed (Point_Code `GB`,
  "Main EP Fan Gear drive", `MOBIL SHC 632`, `Yes`/6-month analysis
  interval, area `RM2`, contractor `RHI`).
- **Change-due extension rule for the 151 dual-tracked points —
  confirmed, event-driven (not a fixed formula):**
  1. Hard cap stays **2 years** for change-due on these points.
  2. As a point approaches its 2-year change-due date, the system checks
     whether an oil analysis sample has been taken **in the last 6
     months**. If not, it **triggers an oil-analysis request** for that
     point (a sampling task) rather than just letting it run out.
  3. Once that analysis result is in:
     - **Normal/OK → the change-due date extends by a full 2 years.**
     - **Not OK → follow the analysis's own recommended action.** If
       that recommendation is "change oil," a change task is generated
       from it. (Doesn't have to be "change" specifically — whatever the
       analysis recommends drives what happens next.)
  - **Minor detail not yet pinned down** (low-stakes, can settle at
    build time): whether the 2-year extension counts from the analysis
    result date or from the original due date — since the trigger fires
    within 6 months of the deadline either way, the difference is small.

Both items from the previous open-items list are now resolved. **ID
reconciliation and the core Oil Change Log design are complete** pending
the actual database/schema design work.

## Round 7 — login/RBAC brought forward, decided

User asked to review the Foundation's login/RBAC decisions before
starting any implementation. Reviewed §5–§6 of
`docs/platform-foundation-spec.md` with the user; three decisions:

- **Login is platform-wide, built once, shared across all modules —
  not an oil-analysis-specific login.** This is Platform Core's auth
  (§5 of the spec), built now as its own standalone piece of work rather
  than waiting for the rest of Platform Core, and every module —
  starting with Oil Analysis — authenticates against it.
- **RBAC v1 scope simplified**: role + org + the hard contractor-
  isolation rule, not the full 8-layer permission chain. Full
  granularity remains the long-term target (spec §6.3, updated) but is
  deferred until there's a concrete need for module/tab/feature/field-
  level control.
- **Time-of-day access rules: confirmed not needed** — closes a
  question that had been open since the original Foundation discussion.

**Open technical question, not yet decided:** Platform Core and
`apps/oil-analysis` are separate Apps Script Web App deployments (per
the architecture's module-isolation model, spec §2–§4). For
oil-analysis to accept a login session issued by Platform Core, its
backend needs to verify that session without necessarily calling back to
Platform Core on every request. **[PROPOSED, needs confirmation]**:
Platform Core issues a signed session token; both Apps Script projects
share a signing secret (stored in each project's Script Properties, never
in code/Sheets); oil-analysis's backend verifies the token's signature
locally. Keeps the two backends independently deployable (matches the
module-isolation requirement) without a live call to Platform Core on
every oil-analysis request.

## Round 8 — frontend integration approach: single-app, not iframes

User pushed back on the earlier token-verification framing: modules
must genuinely be **part of the app** (one shared sidebar/topbar/theme),
not separate apps behind a login screen. Clarified via follow-up:

- **Meaning confirmed:** shared visual shell/navigation specifically —
  not a change to backend architecture. Backend isolation per module
  (own Apps Script, own Sheets) **stays exactly as decided**.
- **New standing principle:** performance is the top design priority
  going forward, in every future decision, not just this one — "the app
  must be fast with no lag."
- **Decision: true single-app integration (not iframe embed).**
  `apps/oil-analysis` and `apps/vibration-analysis`'s pages get merged
  into the main frontend's own React bundle/router, mounted as routes
  under the shared sidebar/topbar — no iframe, no separate page load
  when switching modules. Chosen specifically because it gives the best
  runtime performance (instant module switching inside one already-
  loaded app), at the cost of more refactor work now (each module's own
  routing/sidebar/topbar/theme code needs removing, its actual pages
  remounted as routes in the shared shell instead). Recorded in
  `docs/platform-foundation-spec.md` §1b.

## Round 9 — theme unification and in-module navigation decided

- **Theme: one unified theme system, multiple palette choices kept.**
  Not a reduction to just Light/Dark — merge into one shared theming
  mechanism used app-wide, offering multiple selectable palettes (the
  existing palette lists from both modules, deduplicated/combined rather
  than picking one module's set over the other's). **Theme control moves
  to platform-level Settings** — a single shared place to change theme,
  not duplicated inside each module's own Settings page anymore.
- **In-module navigation: secondary nav within the module's content
  area.** Click "Oil Analysis" in the main sidebar → a secondary nav/tabs
  for that module's own pages (Dashboard, Add Sample, Action Tracker,
  etc.) appears nested in the content area — the main sidebar stays
  short (Dashboard, Vibration Analysis, Oil Analysis, ...), each
  module's internal structure stays visible but nested under it.

## Round 10 — database schema draft reviewed, 3 of 4 open items resolved

User reviewed `docs/oil-analysis-database-schema.md`:

1. **Point-level write authority: App Admin only** — confirmed, matches
   equipment-level authority exactly. No module role gets write access
   to `OA_LP_REGISTER`. Recorded in the Foundation spec §7.
2. **`ROLE_PERMISSION` starting shape: agreed** — role + module + action,
   no tab/feature/field layers yet.
3. **Approval workflow: user asked for more explanation before
   deciding** — see next message in the conversation for the concrete
   options/examples given.
4. **332.FN400 + 6 compressors: confirmed** — both get added to
   `OA_LP_REGISTER` in the initial import.

Also: user re-uploaded `ACC_PLATFORM_ASSET_MASTER_DB_v3.xlsx` — an
updated copy (`EQUIPMENT_MASTER` now 1,894 rows, up from 1,892;
`LP_POINT_MASTER` already carries the fuller 935-point schema).
Confirmed both the 6 compressors and `332.FN400` already exist in
`EQUIPMENT_MASTER`, but their LP entries aren't in `LP_POINT_MASTER` yet
— consistent with "agreed, not yet applied."

## Round 11 — approval workflow: Routine-based, resolved

User confirmed the real workflow, applying identically to both
change/top-up and sample-taking:

`Contractor Engineer creates a Routine, assigns a Technician → Technician
notified, executes each point (sees required oil type, logs what was
done, or marks "not implemented" + reason) → submits → Contractor
Engineer reviews and approves (this is what actually writes the data) →
ACC Engineer notified, may comment, never blocks/required.`

Schema updated in `docs/oil-analysis-database-schema.md` (round 11
section): added `OA_ROUTINES` (the work order) and `OA_ROUTINE_ITEMS`
(one row per LP point in it). `OA_CHANGE_LOG` rows now only get created
when a Change/Top-up routine item is **approved**, not when submitted.
`OA_SAMPLES` rows get created (SampleId/LP_ID/SampleDate) when a Sample
routine item is approved, with the actual lab chemistry/rating columns
filled in separately whenever the lab report arrives later — sample
collection and lab results are two different moments.

Two new questions this raised, not yet asked:
1. Who can create a Routine — Contractor Engineer only, or also Manager?
2. Can a Technician hold more than one open Routine at once, or does a
   new one wait until the current one is submitted?

## Round 12 — Routine questions resolved

1. **Routine creation: Contractor Engineer or Manager** — both roles can
   create/assign a routine, not Contractor Engineer only.
2. **Multiple open Routines per Technician: allowed** — a new routine
   doesn't wait for the current one to be submitted first.

Both applied to `docs/oil-analysis-database-schema.md`. **The Oil
Analysis database schema is now fully resolved** — no open items
remaining in that document.

## Open items (to ask about next, before any implementation)

- Confirm the shared-secret token verification mechanism (still needed
  even with single-app integration — Platform Core issues the session,
  and each module's backend, though bundled together in the frontend,
  still calls its own separate Apps Script API and needs to verify the
  session independently) — proposed but not yet re-confirmed under the
  single-app integration approach. This is the one remaining item before
  implementation can start.




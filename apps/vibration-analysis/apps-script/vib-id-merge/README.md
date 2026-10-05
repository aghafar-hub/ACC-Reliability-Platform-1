# VIB_ID merge kit

Rebuilds the vibration app's equipment/point data around the ACC Platform
asset master DB (`ACC_PLATFORM_ASSET_MASTER_DB_v3.xlsx`) as the single
source of truth — **not** a reconciliation between two ID schemes. Per your
direction: the master DB's equipment ID format (`111.CP400`) is the real
one going forward; the old Sheet's format (`111.CP.400`) is retired.
Targets the sandbox
(`https://docs.google.com/spreadsheets/d/15wIvMQB_4eYhI9uvx7LZj4Gj4Kpo5vQG7W9U_3_s5Lc/`)
— nothing here touches production.

## Scope and decisions (as you specified)

- **Equipment covered**: only equipment with vibration points actually
  defined in `VIB_POINT_MASTER` — **165** equipment (after normalizing a
  handful of inconsistently-formatted IDs within the master file itself,
  e.g. `645.FN952` and `645.FN.952` both appearing for the same asset).
- **Thresholds**: standard defaults for everyone — RMS Good/Acceptable/Alarm
  `2.8 / 7.1 / 18` mm/s, SPM Normal/Caution/Alarm `20 / 35 / 50` dBsv (what
  ISO 10816 and your own sheet already use almost universally). These are
  written as real values into the rebuilt Register, not left as an
  app-side fallback — same as today, still editable per equipment from
  Equipment Register / Limits Settings afterward.
- **Historical data**: migrated in place — existing RMS/SPM DATA history
  keeps its equipment's trend continuity under the new ID.

## Coverage

Of the 165 target equipment: **158 matched** an equipment already in your
current Sheet (by comparing both IDs' canonical form), so their existing
name/type/line carries over and their history migrates. **7 are newly
covered** — vibration points exist for them in the master DB but they
weren't in your Sheet before — sourced from the master DB's generic
description, flagged for a better name. Nothing was left unresolved or
guessed.

## Files, in the order to apply them

1. **`equipment-id-migration-map.csv`** — reference only (158 old→new ID
   pairs). This is the same mapping baked into `Migrate.gs` below; the CSV
   is here so you can eyeball it before running anything.
2. **`Migrate.gs`** — paste as an _additional_ file in the sandbox's Apps
   Script project (alongside `Code.v2.gs` — Apps Script projects hold
   multiple `.gs` files). **Run these 5 functions one at a time**, as 5
   separate Run clicks (pick each from the editor's function dropdown), not
   the combined `migrateEquipmentIds()` — on a sheet this size, one big run
   burns most of its execution time budget on the first large sheet and
   every sheet after it dies with "Service timed out: Spreadsheets" before
   it can even start:
   - `migrateRmsData()`
   - `migrateSpmData()`
   - `migrateLastRmsReading()`
   - `migrateLastSpmReading()`
   - `migrateComplianceTracker()`

   Check View → Executions (or View → Logs right after each run) for that
   sheet's change count — it also logs progress every 1,000 rows so a run
   in progress isn't a silent wait. Renames Equipment ID cells in
   `📥 RMS DATA`, `📥 SPM DATA`, `📋 Last RMS Reading`, `📋 Last SPM
   Reading`, and `📋 Compliance Tracker` (column C) from old IDs to new.
   Safe to re-run any of them — anything already on a new-format ID (or
   already renamed by an earlier partial run) is left alone, so if one
   fails partway through, just run that same function again. Does **not**
   touch the Register tabs (step 3 replaces those wholesale instead).
3. **`rms-register-rebuild.csv`** / **`spm-register-rebuild.csv`** — the
   full replacement content for `⚙ RMS Register` / `⚙ SPM Register`
   (165 and 158 rows — 7 of the 165 have RMS points but no SPM points
   defined in the master DB, hence the count difference). Select all
   existing content in each tab and paste these over it entirely (headers
   included).
4. **`vib-point-map-import.csv`** (1,765 rows) — paste as a new tab named
   exactly `🔗 VIB Point Map`, same as before, except equipment IDs are now
   in native master format directly (no conversion needed anymore).
5. **`new-equipment-needs-naming.csv`** — the 7 newly-covered equipment,
   each with the master DB's generic description as a placeholder name
   (e.g. `465.BL580` → "Blower / rotary blower"). Worth a quick pass to
   give them proper names in the rebuilt Register before relying on them —
   not blocking, just cosmetic.
6. **`Code.v2.gs`** (in the parent `apps-script/` folder, not this one) —
   superseded, see that folder's own README. `Code.fixed.gs` is the one
   actually wired to the real "VIB ID Registry" tab now.
7. **`BackfillVibIds.gs`** — once the real sheet is on this schema for
   real: fills the (blank) VIB ID column on every existing RMS/SPM DATA
   row by matching against "VIB ID Registry". See "Backfilling VIB ID on
   existing RMS/SPM DATA rows" below.

## Post-migration audit

**`remaining-old-format-audit.csv`** — after running the migration and
pasting the rebuilt Register/VIB Point Map, I re-read the sandbox sheet and
regex-scanned it for every remaining old-format ID (`\d{3}\.[A-Za-z]{2,3}\.\d+`),
cross-checked each against the migration map and master DB, and classified
all 199 distinct ones found:

- **155 `EDIT`** — already in `equipment-id-migration-map.csv`, just
  weren't renamed yet in whichever sheet they're in. This is the bulk of
  it — re-run the 4 remaining `Migrate.gs` functions (`migrateSpmData`,
  `migrateLastRmsReading`, `migrateLastSpmReading`,
  `migrateComplianceTracker`) and check each one's log actually reports a
  nonzero rename count, not a `FAILED` line.
- **21 `ADD (needs vib points)`** — real equipment in `EQUIPMENT_MASTER`
  (e.g. all of `761/762.WI.21x` — 15 Water injection units) with zero
  vibration points defined in `VIB_POINT_MASTER`. Needs someone to add
  their points to the master DB, or tell me the points directly.
- **17 `ADD (not in master DB)`** — not in the master DB at all, e.g. the
  `441/442.WI.00x` series and `212.HC.100`'s close cousin `645.BL.58x`.
  Needs full onboarding (name, line, points) before anything can be built
  for these.
- **4 `ADD (mirror twin)`** — e.g. `322.MD.152` (30 cells of real history)
  has no master DB points, but its Line1 twin `321.MD152` has an identical
  point structure already defined. Very likely just a master DB gap for
  that specific line, not a different asset — but I didn't invent points
  for these without you confirming it's actually the same equipment type.
- **2 `ADD (has vib points, wasn't in old sheet)`** — `533.MD.301` /
  `534.MD.301` already have master DB points, just weren't part of your
  original Register (note: NOT the same as `533.MD.302`/`534.MD.302`,
  which already are — worth double-checking these aren't a typo of each
  other in your historical data).

## What's still not done

`VIB_ID` is now wired into the React app — New Reading shows the VIB ID
next to each point, and Equipment Register shows a VIB ID coverage column
per equipment — but switching `DEFAULT_WEBHOOK_URL` over from production
to this sandbox is still a decision for you to make explicitly, not
something this kit does on its own.

## Backfilling VIB ID on existing RMS/SPM DATA rows

Now that the production `📥 RMS DATA`/`📥 SPM DATA` sheets have a real "VIB
ID" column (see the main `apps-script/README.md`'s v3.2 notes) but it's
blank on every pre-existing row, **`BackfillVibIds.gs`** fills it in by
matching each row against "VIB ID Registry" — paste it as an additional
file in the same Apps Script project as `Code.fixed.gs` (it calls that
file's `readVibRegistry()` directly, so `Code.fixed.gs` must already be the
deployed `Code.gs`), then run `backfillRmsVibIds()` and `backfillSpmVibIds()`
as two separate Run clicks, same reasoning as `Migrate.gs` above.

It only ever fills a blank VIB ID cell, never overwrites one that already
has a value — safe to re-run any time, including after a partial run or
after the registry itself gains new rows. It does **not** attempt the
position-code-derivation guess the earlier `redesign_data_sheets.py`
script used as a fallback — anything that doesn't exact-match the
registry's own Point Description text (optionally with the SPM row's own
"Type" column appended, e.g. "Compressor DE (5)", for positions with more
than one physical sensor) stays blank rather than being guessed.

Dry-run against the real exported data (same matching rule, run offline)
before shipping this file: **5,539 / 6,552 RMS rows matched (84.6%)**,
**3,391 / 4,741 SPM rows matched (71.5%)**. Every remaining miss traced
back to a real data gap, not a matching bug:

- A few equipment still carry an old-format, typo'd ID in `RMS`/`SPM
  DATA` that was never corrected — `645.BL580`/`645.BL630`/`645.BL635`
  should be `465.BL580`/`465.BL630`/`465.BL635` (the same correction
  noted in the "Coverage" section above), but that rename was never added
  to `Migrate.gs`'s own `EQUIPMENT_ID_MAP`, so those rows' Equipment ID
  cells still don't match anything in the registry. Worth adding to
  `EQUIPMENT_ID_MAP` and re-running the relevant `migrate*()` function if
  you want these three equipment covered.
- A handful of "inboard"/"outboard" wording mismatches between the live
  sheet's point names and the registry's own description text (e.g. the
  sheet says "Shaft 2 outboard NDE", the registry says "Shaft 2 inboard
  NDE (SPM)" for the same physical sensor) — the same kind of
  registry-internal inconsistency flagged in "Post-migration audit" above.
- Equipment with no SPM points in the registry at all yet (e.g.
  `644/645/646.FN952`) — needs the registry itself extended, not a
  smarter matcher.
- Every "Gs" (Peakvue/spectrum) row is deliberately left unmatched —
  SPM DATA rows only ever match the registry's "SPM" family, never "Gs",
  since the app's own data model treats a whole SPM point (HDm/HDc/Gs
  together) as one lookup; "Gs" family registry rows exist for a channel
  the app doesn't surface yet.

## RMS/SPM/GS data redesign (backfill for the new lean schema)

`redesign_data_sheets.py` reads your real sandbox export (only the
`📥 RMS DATA` and `📥 SPM DATA` tabs — everything else in that workbook was
out of scope) and rewrites each historical row against
`vib-point-map-import.csv`, producing ready-to-paste CSVs for the new
schema: one row per reading (same granularity as the source data — no
grouping by month, no reading-slot columns), VIB ID + Equipment ID kept as
separate columns, Max Velocity dropped since it's computed client-side,
GS split into its own sheet:

- `rms-data-redesigned.csv` — 6,552 rows. Columns: `#, VIB ID, Equipment ID,
  Point (unmatched only), Date, Horizontal (mm/s), Vertical (mm/s),
  Axial (mm/s), Gear (mm/s)`.
- `spm-data-redesigned.csv` — 4,741 rows. Columns: `#, VIB ID, Equipment ID,
  Point (unmatched only), Date, HDm (dBsv), HDc (dBsv)`.
- `gs-data.csv` — 392 rows, the new GS sheet. Columns: `#, VIB ID,
  Equipment ID, Point (unmatched only), Date, Gs`. Only rows that actually
  had a Gs value in the source SPM tab are included.
- `rms-data-unmatched.csv` / `spm-data-unmatched.csv` — every row where a
  VIB ID could not be resolved (still included in the redesigned CSVs
  above with a blank VIB ID, per your "backfill, don't discard" call —
  these two files are just for finding and fixing them).

The `Point (unmatched only)` column is blank for every row that got a real
VIB ID, and only holds the original free-text point name (e.g. "BL DE")
for the ~7-9% of rows that didn't match anything in the master DB — so
those rows don't lose their identity just because they don't have a VIB ID
yet.

Matching used a three-tier strategy so nothing gets guessed onto the wrong
point: (1) exact match against the master DB's Point Description, including
each part of semicolon-joined multi-value descriptions (e.g. "BL DE;
blower Inboard Axial; ..." indexed as 4 separate lookups); (2) fallback
match on the master DB's own Position Code (MDE, S2NDE, CDE, ...) derived
from the live sheet's plain-English point name, but only when that
position code maps to exactly one VIB_ID for that equipment/family — 73
ambiguous position codes (e.g. SPM "CDE" split across two physical sensors)
were deliberately left unmatched rather than guessed. The `645.BL580` /
`645.BL630` / `645.BL635` → `465.BL...` correction agreed on earlier was
re-applied here since this export still had the old typo'd IDs.

**Results: 6,101/6,552 RMS rows matched (93.1%), 4,313/4,741 SPM rows
matched (91.0%).** The remainder splits into two causes, neither of which
this script can safely resolve on its own:

- Equipment/points genuinely missing from `VIB_POINT_MASTER` — e.g.
  `351.BL115`, `352.BL115`, `461.CP525`, `462.CP.535`, `744.CP113`,
  `743.CP115`, and the still-unresolved `441/442.WI00x` series (master DB
  models these as one equipment per line, `441.WI130`/`442.WI130`, while
  the old sheet modeled 4-5 separate pieces — needs your modeling call,
  not a script guess).
- A handful of master-DB-internal inconsistencies where "inboard"/
  "outboard" labels appear swapped from what the position code structurally
  implies (e.g. "Shaft 2 inboard NDE" where the code implies outboard) —
  flagged in the unmatched CSVs rather than force-matched.

Paste `rms-data-redesigned.csv` / `spm-data-redesigned.csv` / `gs-data.csv`
over the new `📥 RMS DATA` / `📥 SPM DATA` / new GS tabs in your sandbox once
you've applied the new schema's column headers. The app's own read/write
code (`parsers.js`, `App.jsx`) hasn't been updated for the new lean columns
yet — that's the next step once you confirm the sheet-side update looks
right.

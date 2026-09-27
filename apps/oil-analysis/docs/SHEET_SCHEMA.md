# Google Sheet schema

The Apps Script reads/writes these tabs in the connected Google Sheet.
Columns are listed 0-indexed (as used in `matchCols`/array code) with the
1-indexed spreadsheet column letter alongside for reference.

**This document was originally verified directly against the live sheet**
(opened as an `.xlsx` export and inspected cell-by-cell with `openpyxl`, not
just inferred from the app's minified code) — every column position,
row-start offset, and match key below was cross-checked against real data,
not assumed. Row/column counts as of that check: **264 action rows**, **851
sample rows**, **150 oil change rows**, **152 registered equipment**. Two
tabs (**Equipment Registry**'s Contractor column, **Data_Entry**'s Flagged
Parameters column) were added to the live sheet after that original check,
confirmed directly by the user against the live sheet rather than
re-inspected with openpyxl — noted below where that applies.

This layout is load-bearing: it must match both the Apps Script's
`dataStartRowFor()` / `readSheet()` functions and this app's `parsers.js`.
If a column is ever inserted/removed/reordered in the sheet, update
`parsers.js` (and the Apps Script) to match — don't just add a field and
assume it lines up.

## Action Tracker

Data starts at **row 6** (rows 1–5 are title/filter-controls/status-summary/header).

| Index  | Column                   | Field                                                       |
| ------ | ------------------------ | ----------------------------------------------------------- |
| 0 (A)  | Ac. No.                  | `acNo`                                                      |
| 1 (B)  | Equipment Code           | `equipmentCode`                                             |
| 2 (C)  | Description              | `description`                                               |
| 3 (D)  | Oil Type                 | `oilType`                                                   |
| 4 (E)  | Revision Date            | `revisionDate`                                              |
| 5 (F)  | Sample Date              | `sampleDate`                                                |
| 6 (G)  | Sample Result            | `sampleResult`                                              |
| 7 (H)  | Sample Analysis          | `sampleAnalysis`                                            |
| 8 (I)  | Last Change              | `lastChange`                                                |
| 9 (J)  | Status                   | `status`                                                    |
| 10 (K) | Contractor Action        | `contractorAction`                                          |
| 11 (L) | Contractor               | `contractor`                                                |
| 12 (M) | Completed Date           | `completedDate`                                             |
| 13 (N) | Prev Month Agreed Action | `prevMonthAgreedAction`                                     |
| 14 (O) | Acc Action               | `accAction`                                                 |
| 15 (P) | Agreed Action            | `agreedAction`                                              |
| 16 (Q) | Closing Comment          | `closingComment`                                            |
| 17 (R) | Last Modified            | _(stamped automatically by the Apps Script on every write)_ |

Real values seen: `Status` is one of `Open` (57) / `In Progress` (3) /
`Waiting Stoppage` (32) / `Closed` (171); `Sample Result` includes `ALERT`,
`CAUTION`, `NORMAL`, `MISSING`, and `Oil Changed` — all of these have entries
in `theme.js`'s `badge()` and `LastActionsPanel.jsx`'s `RESULT_COLOR` maps.

**A row is matched for update/delete on columns [0, 1]** — `acNo` +
`equipmentCode` together. This isn't just theoretical caution: the live
data has two real cases (`O-242`, `O-251`) where the **same Ac. No. is
reused across two different equipment codes** (e.g. `O-242` appears once
for `R2.322.HY110` and once for `R2.332.FN110(Fr.B.)`). Matching on `acNo`
alone would silently hit whichever of those two rows the sheet happens to
list first — matching on the pair is what keeps that safe, and both
values are always the row's _original_ identity, never the edited one
(see `api.js`'s `saveAction`).

`api.js`'s write-verification for this sheet skips column 17 (Last
Modified, always fresh on read-back) and applies calendar-day tolerance
(not strict string equality) to columns 4, 5, 8, 12 — every date-bearing
field, since any of them can round-trip through a Google Sheets Date-typed
cell and come back in a different string form (see `sameCalendarDay()` in
`parsers.js`).

## Oil Change Log

Data starts at **row 4** (rows 1–3 are title/subtitle/header).

| Index     | Column                 | Field                                                                                                 |
| --------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| 0 (A)     | Asset                  | `equipmentCode`                                                                                       |
| 1 (B)     | Asset Name             | `assetName` (e.g. "Apron Feeder", "Belt Conveyor" — an equipment category, not unique per row)        |
| 2 (C)     | Lubrication Points     | `lubricationPoint`                                                                                    |
| 3 (D)     | Frequncy \[sic]        | `frequency`                                                                                           |
| 4 (E)     | Oil Type               | `oilType`                                                                                             |
| 5 (F)     | Brand                  | `brand`                                                                                               |
| 6 (G)     | Qty (ltr.)             | `quantity`                                                                                            |
| 7–8 (H–I) | \[merged] Change Dates | historical change-date columns; not read/written by this app                                          |
| 9 (J)     | Last change            | `changeDate`                                                                                          |
| 10 (K)    | Next Oil Change        | `nextDueDate`                                                                                         |
| 11 (L)    | Status                 | `status` — **a sheet formula**; the Apps Script's `updateRow` never writes this column, only reads it |
| 12 (M)    | Last Modified          | _(written automatically)_                                                                             |

Column 1 ("Asset Name") is real data (not blank, despite an earlier bad
assumption). It's still never written on update — the Apps Script's
`updateRow` special-cases this specific sheet to only ever touch columns 9
and 10 (`changeDate`/`nextDueDate`), regardless of what the rest of the row
contains — so there's no risk of accidentally clobbering it, and `api.js`'s
`saveOilChange` only verifies column 9 came back matching (with the same
calendar-day tolerance every date field gets).

Matched on columns **[0, 2, 4]** — Equipment Code + Lubrication Point + Oil
Type together (a piece of equipment can have more than one lubrication
point / oil type combination). Verified unique across all 150 real rows —
no collisions found.

**Not written from `Add Action`/`Edit Action` directly** — setting an
action's "Last Change" date computes a matching `_oilChangeTarget` (see
`actionAutofill.js` and `EditActionModal.jsx`) that `App.jsx`'s
`applyOilChangeSideEffect` then saves as a second, separately-verified
write, after the action itself is confirmed saved.

## Data_Entry (samples)

Data starts at **row 6** (rows 1–5 are title/instructions/header). **38
columns total (A–AL)**: the 37 data columns below, plus Last Modified.

| Index | Field                 | Index | Field                                     |
| ----- | --------------------- | ----- | ----------------------------------------- |
| 0     | `unitId`              | 19    | `wear.Cu`                                 |
| 1     | `description`         | 20    | `wear.Fe`                                 |
| 2     | `sampleId`            | 21    | `wear.Mo`                                 |
| 3     | `sampledDate`         | 22    | `wear.Ni`                                 |
| 4     | `reportStatus`        | 23    | `wear.Pb`                                 |
| 5     | `contaminationRating` | 24    | `wear.Sn`                                 |
| 6     | `equipmentRating`     | 25    | `contaminants.K`                          |
| 7     | `lubricantRating`     | 26    | `contaminants.Na`                         |
| 8     | `particleCount4um`    | 27    | `contaminants.Si`                         |
| 9     | `particleCount6um`    | 28    | `additives.B`                             |
| 10    | `particleCount14um`   | 29    | `additives.Ba`                            |
| 11    | `pqIndex`             | 30    | `additives.Ca`                            |
| 12    | `visc40C`             | 31    | `additives.Mg`                            |
| 13    | `tan`                 | 32    | `additives.P`                             |
| 14    | `oxidation`           | 33    | `additives.Zn`                            |
| 15    | `water`               | 34    | `alertType`                               |
| 16    | `wear.Ag`             | 35    | `recommendations` ("Sample Analysis")     |
| 17    | `wear.Al`             | 36    | `flaggedReadings` ("Flagged Parameters")  |
| 18    | `wear.Cr`             | 37    | _(Last Modified — written automatically)_ |

Column 34 is a real field, "Alert Type" — a short classification (e.g.
`"Caution – Elevated Fe & Si"`) distinct from column 35's longer free-text
analysis.

**Column 36, "Flagged Parameters",** is a newer addition (added to the live
sheet mid-session, confirmed by the user directly rather than re-verified
with openpyxl): a compact string like `"Cu:Alert,Fe:Alert,Al:Caution"`
listing which specific readings the lab itself flagged, parsed/formatted by
`parseFlaggedParams()`/`formatFlaggedParams()` in `parsers.js`. It's
populated by the bulk PDF import feature (see
[PDF_IMPORT.md](./PDF_IMPORT.md)) from cell background colors in the source
report, which carries more detail than the four rollup ratings alone — a
single wear metal can be flagged Alert even when the overall Contamination
Rating only reads Caution. Manually-entered samples (the "Manual Entry" tab
on Add Sample) leave this blank. `sampleTriggerReadings()` in `parsers.js`
prefers this real lab data over the app's own guessed-limit heuristic
(`SAMPLE_TRIGGER_CHECKS`) whenever it's present.

Adding this column shifted **Last Modified from index 36/column AK to index
37/column AL** — the Apps Script's own `LAST_MODIFIED_COL` map for this
sheet needs to say `38` (1-indexed) to match, or it will stamp the
timestamp into the Flagged Parameters column instead. This is a
backend-only change (not part of this repo); if `Last Modified` values look
wrong or missing after a write, check that constant first.

Matched on columns **[0, 2]** — Equipment Code + Sample ID. **Not
guaranteed unique**: 42 real (equipmentCode, sampleId) pairs repeat across
different sample dates in the live data (e.g. `111.HC100 (IR)` has two
distinct samples, dated 3-Jun-2026 and 12-Jul-2026, sharing the same
Sample ID `26165146253`) — the lab appears to reuse sample ID numbering
across sampling rounds for the same equipment. `updateSample`/`deleteSample`
(used by Equipment's Edit/Delete Sample actions) match on this same pair —
see the warning comment directly above `updateSample` in `api.js` for what
that means in practice: an edit to a sample sharing its ID with another
sample for the same equipment can land on the wrong row. The bulk PDF
import feature's own dedup check (does this equipment+Sample ID already
exist in `Data_Entry`?) has the same limitation but a lower-stakes failure
mode — at worst it re-flags an already-imported sample as "new" rather than
silently overwriting the wrong row, since it only ever appends.

## Equipment Registry

Row 1 = title, row 2 = header, row 3+ = data (152 rows in the live sheet as
of the original audit).

| Column A       | B           | C        | D           | E               | F        | G            | H     | I    | J          |
| -------------- | ----------- | -------- | ----------- | --------------- | -------- | ------------ | ----- | ---- | ---------- |
| Equipment Code | Description | Asset ID | Asset Class | Lubricant Grade | Interval | Manufacturer | Model | Area | Contractor |

This is the **authoritative equipment list** — every registered piece of
equipment, independent of whether it has a sample yet. It is **not** part
of the regular `readAll`/Full Sync — it's a separate, explicit "Sync
Equipment Registry" action in Settings → Configuration, persisted to
`localStorage` under its own key (see `equipmentRegistry.js`) so it
survives independent of the sample/action/oil-change cache. The app ships
with a bundled default snapshot (`equipmentRegistryDefault.js`, all 152
rows including Contractor) so equipment dropdowns work correctly even
before anyone has run a sync.

**Column J (Contractor)** was added to the live sheet after this schema was
first audited. There was a real bug here, since fixed: the Apps Script's
`readEquipmentRegistry()` originally stopped reading at column I (Area) and
never returned Contractor at all, so every "Sync Equipment Registry" run
silently wiped the field from any equipment whose contractor had only ever
come from the bundled default. `equipmentRegistry.js`'s `backfillContractor()`
repairs any equipment stuck in that emptied-out state by falling back to
the bundled default's contractor for that code — a stopgap for sessions
that already ran a sync before the backend fix landed; re-running "Sync
Equipment Registry" now pulls the real, current contractor straight from
column J. Note this is about the **read** path only — `api.js`'s own
`updateEquipmentRegistryEntry()` (used to edit an equipment's sampling
interval from Settings) still only ever sends 9 values (columns A–I),
deliberately never including Contractor, so an interval edit can't
accidentally clobber it. See the comment on `equipmentRegistryRow()` in
`api.js` for why that's believed to leave column J untouched rather than
blanking it.

## Oil Sample Tracker

A separate monthly-grid sheet tab: row 1 = header (`["Equipment", "Last
sample", "interval Days", "INTERVAL", <one column per month>, ...]`), each
subsequent row is one equipment's history across those month columns. Month
headers are either plain text (`"Jul-22"`) or real Date-typed cells (Apps
Script serializes those to ISO strings on read) — `parseTrackerRows()` in
`parsers.js` only treats a column as a month if its header actually parses
as one via `parseMonthLabelDate()`, which is also what skips the leading
"Last sample"/"interval Days"/"INTERVAL" metadata columns without needing
to hard-code their positions.

Each cell holds either a bare status string or **`"STATUS|DD MMM YYYY"`**
(e.g. `"CAUTION|26 Apr 2026"`) — `splitTrackerCell()` parses this; a cell
with no `|` is treated as status-only with no date. This is also the exact
format the Apps Script's `updateSampleTrackerMonthly` endpoint writes when
this app calls `updateSampleTracker` after a sample is saved (see
[API_CONTRACT.md](./API_CONTRACT.md)).

This sheet is read as part of `readAll` (`trackerRaw`, deliberately left
unparsed by `api.js` — see the comment there) and turned into
`{ [equipmentCode]: [{ monthLabel, status, date, sortDate }] }`, sorted
newest-month-first, by `parseTrackerRows()`. `App.jsx` then overlays live
`Data_Entry` samples on top with `overlaySamplesOnTracker()` — a sample
always wins over whatever the tracker sheet says for its own
equipment+month, so the Sample Tracker page, Reports, and Oil Report Search
all reflect the real current state even when a sample was entered straight
into `Data_Entry` and the tracker sheet itself has drifted (e.g. never
routed through "Add Sample", the only client action that also writes this
sheet). A month the tracker sheet has — including an explicit `MISSING` —
that `Data_Entry` has no sample for is left untouched, so a genuine gap
still shows as a gap rather than being erased by the overlay.

This app only ever **writes** one cell at a time to this sheet
(`updateSampleTracker`, fired automatically after every sample save,
including once per sample in a bulk PDF import — see
[PDF_IMPORT.md](./PDF_IMPORT.md)); it never reads/writes the "Last sample",
"interval Days", or "INTERVAL" metadata columns.

## Action Registry

A small two-column sheet tab: `No`, `Actions`. Backs the multi-select
"Contractor Action"/"ACC Action" pickers (`MultiSelectTags.jsx`) in
`EditActionModal.jsx` — a reusable pick list of action phrases (e.g.
"Change Oil", "Separate Water") rather than a hardcoded enum, so new phrases
can be added from Settings → Configuration without a code change. Like
Equipment Registry, this is synced separately from the main
sample/action/oil-change sync, persisted to its own `localStorage` key
(`actionRegistry.js`), and ships with a small bundled default list
(`actionRegistryDefault.js`, 7 entries) so the pickers aren't empty before
the first sync.

`api.js`'s `getActionRegistry()` parses defensively (the exact shape the
backend returns for this action — plain label strings vs. `{no, action}`
objects — was never fully confirmed) and `addActionRegistryEntry()` reuses
the same generic `append` write every other sheet uses, numbering the new
row sequentially after whatever's already there.

## Why this matters for the sync-verification fix

`api.js`'s write functions compare a freshly-read row against the row they
just tried to write, cell-by-cell, to confirm a save actually landed (see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-sync-bug-and-its-fix)). That
comparison is only meaningful if the column order here exactly matches
what's in the sheet — a mismatch would either produce false "save failed"
errors or, worse, false "success" on a save that actually wrote to the
wrong columns. Keep this document in sync with `parsers.js` and the Apps
Script whenever either changes.

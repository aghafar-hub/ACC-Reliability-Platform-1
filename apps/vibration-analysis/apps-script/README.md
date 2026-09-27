# Apps Script backend

This app has no server of its own — every read and write goes straight from
the browser to a Google Apps Script Web App bound to the Google Sheet that
is this app's database. That script's source isn't hosted anywhere else, so
it's kept here for reference, review, and — unlike `legacy-exact-copy/`,
which is deliberately never touched — so it can actually be fixed.

## Files

- **`vib-id-merge/`** — a sandbox-only kit for adopting the ACC Platform
  asset master DB's `VIB_ID` as a permanent point identifier: an importable
  CSV for a new `🔗 VIB Point Map` tab, a review list for equipment that
  didn't auto-match, and `Code.v2.gs` (the backend addition). See
  `vib-id-merge/README.md`.
- **`Code.gs`** — the script currently deployed behind the app's default
  webhook URL (`DEFAULT_WEBHOOK_URL` in `src/config.js`), reproduced
  verbatim as supplied, version "v3.1". One transcription artifact was
  corrected on the way in: the pasted source's `onEdit` function ended with
  an extra stray `)` after its closing `}`, which would be a hard syntax
  error and make the *entire* script (including `doGet`/`doPost`) fail to
  save in the Apps Script editor — since the live webhook demonstrably
  works, this was almost certainly lost/added in copy-paste, not something
  actually deployed. Removed; nothing else was changed. If your real
  Apps Script project's source differs from this file in any other way,
  this file is the one that's stale, not the live deployment.
- **`Code.fixed.gs`** — `Code.gs` with two bugs corrected (see below). Not
  deployed anywhere by default — this repo has no way to touch your Apps
  Script project. To apply it: open your Sheet → Extensions → Apps Script,
  replace `Code.gs`'s contents with this file, then **Deploy → Manage
  deployments → edit → New version → Deploy** (editing the file alone does
  nothing until you redeploy).

## Bugs found by comparing this script against the live Sheet

Both were found by reading `handleUpdateRegisterLimits()` and `onEdit()`
against the real column layout of "⚙ RMS Register" and "⚙ SPM Register"
(confirmed directly from the Sheet's own data, not inferred) and the real
tab name of the Action Tracker sheet (`SHEET_ACTIONS` in this same file).
Neither is a bug in the React app — both live entirely in this script, so
fixing them means redeploying `Code.fixed.gs`, not changing anything in
`src/`.

### 1. `updateRegisterLimits` writes every limit to the wrong column

This fires whenever a user saves changes from Equipment Register's edit
modal or the Limits Settings page. `handleUpdateRegisterLimits()`'s column
numbers assume a column layout that predates the sheets' current one — a
`Points` column (RMS side) exists between `Line` and `RMS Good` that this
function's column numbers don't account for, and the SPM side is shifted
the same way starting at `SPM Type`:

**RMS Register** (real layout: `Equipment ID(1), Equipment Name(2), Name
Plate(3), Eq Type(4), Line(5), Points(6), RMS Good(7), RMS Acceptable(8),
RMS Alarm(9)`):

| Field sent      | Original code writes to col | Which real column that is | Should be |
| ---------------- | ---------------------------- | -------------------------- | --------- |
| `rmsGood`         | 6                             | **Points**                 | 7         |
| `rmsAcceptable`    | 7                             | **RMS Good**                | 8         |
| `rmsAlarm`         | 8                             | **RMS Acceptable**          | 9         |
| `points`           | 9                             | **RMS Alarm**               | 6         |

So every save overwrites that equipment's measurement-point list (e.g.
`"Motor DE, Motor NDE"`) with a number, shifts Good into where Acceptable
should be and Acceptable into where Alarm should be, and finally overwrites
the real RMS Alarm cell with the raw comma-separated points string.
`namePlate`/`eqType`/`line` (columns 3–5) are unaffected — only the block
from `Points` onward is shifted.

**SPM Register** (real layout: `Equipment ID(1), Equipment Name(2),
Line(3), Points(4), SPM Type(5), SPM Normal(6), SPM Caution(7), SPM
Alarm(8)`):

| Field sent  | Original code writes to col | Which real column that is | Should be |
| ------------ | ---------------------------- | -------------------------- | --------- |
| `spmNormal`   | 5                             | **SPM Type**                | 6         |
| `spmCaution`  | 6                             | **SPM Normal**               | 7         |
| `spmAlarm`    | 7                             | **SPM Caution**              | 8         |

The real **SPM Alarm** column (8) is never written by the original code at
all — no matter what a user saves, it's permanently stuck at whatever value
it started with. `Code.fixed.gs` corrects the three column numbers and adds
the missing write to column 8.

(The app's own `docs/API_CONTRACT.md` previously described this — before
this script was available for review — as "Limits Settings overwrites the
SPM Alarm limit with the Caution value." That description was a reasonable
inference from the client bundle alone, but the real mechanism turned out
to be this column shift, which is both worse — it also corrupts `Points`
and `SPM Type` — and, for the SPM Alarm cell specifically, the opposite:
that cell is never touched at all, not overwritten.)

### 2. `onEdit`'s year/month row filter never runs

`onEdit(e)` guards itself with `if (sheet.getName() !== "🚨 Action Tracker")
return;` — but the real Action Tracker tab (see `SHEET_ACTIONS` at the top
of this file) is `"📋 Action Tracker"`. The names don't match, so this
function returns immediately on every edit and the year/month filter
feature it implements (hiding rows in the sheet's Action Tracker tab that
don't match cells `D3`/`G3`) has never actually run. `Code.fixed.gs` checks
against `SHEET_ACTIONS` directly instead of a second hardcoded string, so
it can't drift out of sync with the real tab name again.

## What this means for data already in the Sheet

Neither bug is retroactive — they only affect column values *written* by
`updateRegisterLimits`. If Equipment Register/Limits Settings saves have
already happened against the live sheet, the affected rows' `Points`/`SPM
Type` columns and RMS/SPM limit columns may already hold shifted or
corrupted values and are worth a manual spot-check before relying on them.

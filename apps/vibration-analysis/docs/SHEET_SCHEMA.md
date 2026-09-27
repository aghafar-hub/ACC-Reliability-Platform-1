# Google Sheet schema

Everything in this app lives in one Google Sheet. This document lays out
every tab this app reads or writes, and exactly which column maps to which
field in `src/parsers.js`. A copy of the actual deployed Apps Script backend
now lives at [`apps-script/Code.gs`](../apps-script/Code.gs), so most of
what used to be inference below is now confirmed directly against real
server code — see [`apps-script/README.md`](../apps-script/README.md) for
two real bugs found there in the process. Two confidence levels still
appear below, and each section says which applies:

- **Confirmed** — either the client sends/receives this literal column
  header text (found directly in `index-XLkmhznS.js`), or `Code.gs`'s own
  `SHEET_CFG`/sheet-name constants and reader functions settle it exactly.
- **Inferred** — neither source pins it down precisely (rare now — mainly
  the Compliance Tracker's underlying spreadsheet formatting, since
  `Code.gs` reads it generically by column position and never names its
  exact intended cell formats).

## 📥 RMS DATA (confirmed)

One row per RMS (vibration velocity) reading. Sheet tab name is literally
`"📥 RMS DATA"` — the emoji is part of the real tab name, sent as the
`sheet` parameter on every append/updateRow/deleteRow call for this data.
Per `Code.gs`'s `SHEET_CFG`: headers live on row 3, data starts row 4 (rows
1–2 are free for a title banner/instructions, matching the live sheet).

| Col | Header                | Field (`rowToRMS`) | Notes                                                                                                               |
| --- | --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 0   | `#`                   | `seq`              | Row sequence number, assigned client-side as `max(existing)+1`                                                      |
| 1   | `Equipment Name`      | `equipmentName`    |                                                                                                                     |
| 2   | `Equipment ID`        | `equipmentId`      | Match column for update/delete                                                                                      |
| 3   | `Asset ID`            | `point`            | The measurement point label (e.g. "Motor DE"), normalized on read — see `normalizePoint()`                          |
| 4   | `Date`                | `date`             | Match column for update/delete                                                                                      |
| 5   | `AXial (mm/s)`        | `axial`            | Note the header's own capitalization: "AXial", not "Axial"                                                          |
| 6   | `Gear\n(mm/s)`        | `gear`             | The header cell has a literal line break in it (wrapped text) — the lookup key must match exactly, newline included |
| 7   | `Horizontal (mm/s)`   | `horizontal`       |                                                                                                                     |
| 8   | `Vertical (mm/s)`     | `vertical`         |                                                                                                                     |
| 9   | `Max Velocity (mm/s)` | `maxVel`           | If blank on read, computed client-side as `max(axial, gear, horizontal, vertical)`                                  |

Match key for `updateRow`/`deleteRow`: columns `[2, 3, 4]` (Equipment ID,
Asset ID, Date).

## 📥 SPM DATA (confirmed)

One row per SPM (Shock Pulse Method bearing-condition) reading. Sheet tab
name is literally `"📥 SPM DATA"`. Same row layout as RMS DATA: headers on
row 3, data from row 4.

| Col | Header           | Field (`rowToSPM`) | Notes                           |
| --- | ---------------- | ------------------ | ------------------------------- |
| 0   | `#`              | `seq`              |                                 |
| 1   | `Equipment Name` | `equipmentName`    |                                 |
| 2   | `Equipment ID`   | `equipmentId`      | Match column                    |
| 3   | `Asset ID`       | `point`            | Measurement point, normalized   |
| 4   | `Type`           | `type`             | Defaults to `"SPM"` if blank    |
| 5   | `Date`           | `date`             | Match column                    |
| 6   | `HDm (dBsv)`     | `hdm`              | Maximum shock value             |
| 7   | `HDc (dBsv)`     | `hdc`              | Carpet (background) shock value |
| 8   | `Gs`             | `gs`               |                                 |

Match key: columns `[2, 3, 5]` (Equipment ID, Asset ID, Date).

## Equipment Register (confirmed: two separate tabs)

The Equipment Register page joins two separately-synced datasets by
`Equipment ID` — `readAll()`'s `rmsRegister` and `spmRegister` arrays. The
client never references either tab's name directly (`updateRegisterLimits`
takes a `type: "RMS" | "SPM"` instead of a `sheet` name, so the backend owns
that mapping), but `Code.gs` settles it: two separate tabs, `"⚙ RMS
Register"` and `"⚙ SPM Register"` (`SHEET_RMS_REG`/`SHEET_SPM_REG`), both
with headers on row 1 and data from row 2 — no title banner rows, unlike
RMS/SPM DATA.

**RMS side** (`rowToRmsRegister`), real column order confirmed from both
the live sheet and `handleUpdateRegisterLimits`'s (buggy) column indices:

| Col | Header           | Field           | Default if blank                                                 |
| --- | ---------------- | --------------- | ---------------------------------------------------------------- |
| 1   | `Equipment ID`   | `equipmentId`   |                                                                  |
| 2   | `Equipment Name` | `equipment`     |                                                                  |
| 3   | `Name Plate`     | `namePlate`     |                                                                  |
| 4   | `Eq Type`        | `eqType`        |                                                                  |
| 5   | `Line`           | `line`          | `"Line1"`/`"Line2"`/`"CM1"`/`"CM2"` in the live sheet            |
| 6   | `Points`         | `points`        | Comma-separated point list, e.g. `"Motor DE, Motor NDE, Fan DE"` |
| 7   | `RMS Good`       | `rmsGood`       | `2.8`                                                            |
| 8   | `RMS Acceptable` | `rmsAcceptable` | `7.1`                                                            |
| 9   | `RMS Alarm`      | `rmsAlarm`      | `18`                                                             |

**SPM side** (`rowToSpmRegister`), same sourcing:

| Col | Header           | Field         | Default if blank                                                                                      |
| --- | ---------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `Equipment ID`   | `equipmentId` |                                                                                                       |
| 2   | `Equipment Name` | `equipment`   |                                                                                                       |
| 3   | `Line`           | `line`        |                                                                                                       |
| 4   | `Points`         | `points`      | Comma-separated — can differ from the RMS side's Points list for the same equipment in the live sheet |
| 5   | `SPM Type`       | `spmType`     |                                                                                                       |
| 6   | `SPM Normal`     | `spmNormal`   | `20`                                                                                                  |
| 7   | `SPM Caution`    | `spmCaution`  | `35`                                                                                                  |
| 8   | `SPM Alarm`      | `spmAlarm`    | `50`                                                                                                  |

`updateRegisterLimits` (fired from both Equipment Register's Edit modal and
Limits Settings) sends `points` back as the **raw comma-separated string**
from the form, not the parsed/normalized array — whatever whitespace or
casing the user typed is what lands in the sheet.

> **This save path is currently broken on the live backend.** Every field
> from `RMS Good` (RMS side) or `SPM Type` (SPM side) onward gets written
> one column to the left of where it actually belongs — see
> [`apps-script/README.md`](../apps-script/README.md#1-updateregisterlimits-writes-every-limit-to-the-wrong-column)
> for the exact mapping and a corrected script. Nothing in `src/` is at
> fault; the client sends the fields listed above correctly.

## Last RMS Reading / Last SPM Reading (confirmed)

Two more tabs — `"📋 Last RMS Reading"` / `"📋 Last SPM Reading"`
(`SHEET_LAST_RMS`/`SHEET_LAST_SPM`), headers on row 1, data from row 2 —
one row per equipment+point, holding just the _most recent_ reading. This
is what the Dashboard reads instead of scanning the full RMS DATA/SPM DATA
history on every load. Written via dedicated
`upsertLastRMS`/`upsertLastSPM`/`deleteLastRMS`/`deleteLastSPM` actions
(again no `sheet` name — the backend owns it) and populated in bulk by
Settings → System → "Backfill Last Readings" (`backfillLastReadings`,
which the UI describes as scanning all RMS & SPM DATA history and writing
the latest-per-equipment-per-point row to these sheets). Per
`handleUpsertLastRMS`/`handleBackfillLastReadings`, Last RMS Reading is 12
columns wide (`equipmentId, equipment, line, point, date, axial, gear,
horizontal, vertical, maxVel, readingStatus, machineStatus`) and Last SPM
Reading is 11 (`equipmentId, equipment, line, point, spmType, date, hdm,
hdc, gs, readingStatus, machineStatus`) — note `line` (col 3) is written by
`handleBackfillLastReadings` as `''` in both, never actually populated from
the register data it already has in scope; only a plain `upsertLastRMS`/
`upsertLastSPM` write (which receives `line` from the client) fills it in.

**Last RMS** (`rowToLastRMS`) fields: `equipmentId`, `equipment`, `line`,
`point`, `date`, `axial`, `gear`, `horizontal`, `vertical`, `maxVel`
(read from `Max Velocity` or `Max Velocity (mm/s)` — either header works),
`readingStatus` (the computed Good/Acceptable/Alarm/Danger band, stamped by
the client at write time), `machineStatus` (a separate field the backend
appears to own — populated by something other than a plain reading save;
never set to a non-empty value by this app's own write path, always sent as
`""` on `upsertLastRMS`/`upsertLastSPM`). Match key: `[0, 3]` (Equipment ID,
Point).

**Last SPM** (`rowToLastSPM`): same shape, with `spmType`, `hdm`, `hdc`,
`gs` instead of the RMS fields.

`machineStatus` is worth calling out: the Compliance Tracker page and
Action Tracker both read it (as the "current machine status" driving the
compliance tiles and the Generate Monthly Actions candidate list), but
`upsertLastRMS`/`upsertLastSPM`'s own payload doesn't include a
`machineStatus` field at all — only `readingStatus` (the client-computed
Good/Acceptable/Alarm/Danger band) is sent. The client's own in-memory copy
of a freshly-saved reading sets `machineStatus: ""` locally, but that value
is never transmitted. **Confirmed against `apps-script/Code.gs`**: the
backend does stamp it itself, server-side — `handleUpsertLastRMS`/
`handleUpsertLastSPM` both call `recalcMachineStatus(ss, equipmentId)`
(which re-scans every row across both Last Reading sheets for that
equipment and reduces to the single worst `readingStatus` via
`worstStatus()`) and write the result into column 12 of Last RMS Reading
and column 11 of Last SPM Reading — the same column this table's `Last RMS`
row calls out below as "populated by something other than a plain reading
save". It's also included in these two actions' JSON response
(`{status, action, equipmentId, machineStatus}`), but since `api.js` sends
both through `fireAndForget()` (a `no-cors` fetch), the client never
actually reads that response — it just relies on the next `readAll()` to
pick the freshly-stamped value back up.

## Compliance Tracker (confirmed)

`readAll()`'s `compliance` array already arrives pre-shaped as one object
per equipment: `{ equipmentId, line, equipment, last, months: [{ month:
"YYYY-MM", status }] }`. The client does no column parsing for this one —
`rowToCompliance()` just defends the shape — but `Code.gs`'s `readCompliance()`
confirms the underlying tab: `"📋 Compliance Tracker"` (`SHEET_COMPLIANCE`),
headers on row 3, data from row 4, wide layout with one row per equipment
and a column per month: col A = `line`, B = `equipment`, C = `equipmentId`
(matched as "Asset ID" — a row with a blank C is skipped entirely), D =
`last`, and every column from E (index 4) onward is a month, its header
either an actual Date or text like `"Jan-26"`/`"2026-01"`
(`parseLabelToYearMonth()` parses both) and its cell a free-text status.
On every `readAll`, the backend also runs `handleMarkMissingCompliance()`
first, which writes the literal string `"Missing"` into any past month's
cell that's still blank — so the sheet itself accumulates these, not just
the client's read of it. `last` is whatever column D holds (also
overwritten — with the target month string, not a status — by
`updateCompliance`, see below); a blank/missing `last` is treated by
`classifyComplianceStatus()` as `"Alert"`, not `"Missing"` — see
`domain.js`.

Each month's `status` cell is free text, not a fixed enum —
`classifyComplianceStatus()` (`domain.js`) buckets it: `yes`/`normal`/`good`
→ Normal, `no` → Alert, `missing` → Missing, `alarm`/`danger` → themselves,
anything containing "caution"/"observation"/"under"/"comment" → Caution,
anything else → Other.

## Action Tracker (confirmed)

`appendAction`/`updateAction` send a named-field object (not a row array +
headers, unlike RMS/SPM DATA) — so every field name below is confirmed
directly from the client, and now also from `Code.gs`'s own
`ACTION_HEADERS` constant, which matches exactly. Tab name is `"📋 Action
Tracker"` (`SHEET_ACTIONS`), headers on row 5, data from row 6. Columns, in
the order the CSV export (`ACTION_HEADERS` in `parsers.js`) uses:

| Field               | Notes                                                        |
| ------------------- | ------------------------------------------------------------ |
| `Action No`         | Format `V-###` (e.g. `V-014`), zero-padded to 3 digits       |
| `Equipment ID`      |                                                              |
| `Equipment Name`    |                                                              |
| `Line`              |                                                              |
| `Reading Date`      |                                                              |
| `Trigger Type`      | `"RMS"`, `"SPM"`, or `"Both"`                                |
| `Trigger Point`     | Free text — the measurement point that triggered this action |
| `Trigger Value`     | Free text — the reading value, as a string                   |
| `Machine Status`    | `"Good"` / `"Acceptable"` / `"Alarm"` / `"Danger"`           |
| `Revision Date`     |                                                              |
| `Action Status`     | `"Open"` / `"In Progress"` / `"Closed"`                      |
| `Completion Date`   |                                                              |
| `Contractor`        | One of the comma-separated contractor list from Settings     |
| `Contractor Action` | Free text                                                    |
| `ACC Action`        | Free text                                                    |
| `Agreed Action`     | Free text                                                    |

**Action numbering**: `readLastActionNo` is the backend's own source of
truth (`{ status: "ok", nextNo, maxNum }`); if it can't be reached, the
client falls back to `max(existing V-### numbers) + 1`.

**`updateAction`'s payload is inconsistent with `appendAction`'s, but
harmlessly** — see [API_CONTRACT.md](./API_CONTRACT.md#known-gaps) for the
reproduced-as-found detail and why `Code.gs`'s `buildActionRow()` accepts
either shape.

## Configuration (confirmed — documented in-app and in `Code.gs`)

Settings → Configuration itself describes this sheet's exact shape (not
just inferred from wire traffic): a tab named exactly `Configuration`
(`SHEET_CONFIG`), header row 1 (`Key | Value`), data from row 2 — matches
`Code.gs` exactly. The app auto-populates rows on first `saveConfig` call;
there's no fixed key list documented beyond what `saveConfig`'s payload
sends: `webhookUrl`, `googleSheetUrl`, `contractors`.

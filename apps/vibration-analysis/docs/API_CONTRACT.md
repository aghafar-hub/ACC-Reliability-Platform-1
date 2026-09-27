# Apps Script webhook contract

This app talks to a Google Apps Script deployed as a Web App. The script
itself lives in your Google Sheet's Apps Script project — a copy of the
version currently deployed behind this app's default webhook URL is kept
at [`apps-script/Code.gs`](../apps-script/Code.gs) (see
[`apps-script/README.md`](../apps-script/README.md) for two real bugs found
there and a corrected `Code.fixed.gs`). This document describes the HTTP
contract `src/api.js` relies on; where a claim below is confirmed directly
against `Code.gs` rather than inferred from the client bundle alone, it
says so.

Base URL is whatever's set in **Settings → Configuration → Webhook URL** —
an `https://script.google.com/macros/s/XXXX/exec` URL, defaulting to the
production endpoint shipped in the original bundle (see
[DEPLOYMENT.md](./DEPLOYMENT.md) for why that default is left in place).

## Transport: fetch first, JSONP fallback, always GET

Every request this app makes — reads **and** writes — is a `GET`. There is
no `POST` anywhere in this app (unlike the sibling oil-analysis app, which
POSTs its writes). Two request paths exist:

1. **Verified** (`verifiedGet()` in `api.js`) — used for `readAll`, `test`,
   `backfillLastReadings`, `readLastActionNo`, `appendAction`,
   `updateAction`, `deleteAction`, `sendActionEmail`, `saveConfig`. Tries a
   plain `fetch(url?action=...&...)` with a 90-second abort timeout first;
   if that fails for any reason short of the timeout itself (network error,
   non-2xx, a CORS rejection), it silently falls back to **JSONP**
   (`<script src="...&callback=__vibjsonp_<timestamp>_<n>">`, 85-second
   timeout, global callback cleaned up after firing). A fetch that hits its
   own 90s timeout gets the whole flow retried once more before surfacing
   "Sync failed after 2 attempts…".
2. **Blind / fire-and-forget** (`fireAndForget()`) — used for every raw
   write: `append`, `updateRow`, `deleteRow`, `upsertLastRMS`,
   `upsertLastSPM`, `deleteLastRMS`, `deleteLastSPM`, `updateCompliance`,
   `updateRegisterLimits`. A `fetch(url, { mode: "no-cors" })` GET whose
   response the browser can't read and this app doesn't try to. The UI
   updates its own in-memory state optimistically and never checks these
   writes landed — see "Known gaps" below.

## Reads / verified actions — `?action=...`

| `action`               | Params                                                                                                                                                                                           | Returns                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readAll`              | —                                                                                                                                                                                                | `{ rms, spm, compliance, rmsRegister, spmRegister, lastRms, lastSpm, actions, config }` — full sync; see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md) for each field's row shape |
| `test`                 | —                                                                                                                                                                                                | `{ status: "ok", time }` — Settings → Configuration → "Test Connection"                                                                                                  |
| `backfillLastReadings` | —                                                                                                                                                                                                | `{ status: "ok", rmsRows, spmRows }` — scans full RMS/SPM history, rewrites the Last RMS/SPM Reading sheets                                                              |
| `readLastActionNo`     | —                                                                                                                                                                                                | `{ status: "ok", nextNo, maxNum }` — `nextNo` is the ready-to-use next `V-###` string; `maxNum` is the numeric part, used by Generate Monthly Actions' loop              |
| `appendAction`         | The 16 named Action Tracker fields (see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#action-tracker-confirmed))                                                                                           | New action row appended                                                                                                                                                  |
| `updateAction`         | See "Known gaps" below — **not** the same shape as `appendAction`                                                                                                                                | Existing action updated, matched on `Action No`                                                                                                                          |
| `deleteAction`         | `{ "Action No": actionNo }`                                                                                                                                                                      | Action row deleted                                                                                                                                                       |
| `sendActionEmail`      | Varies — single-action form sends the action's own fields plus `recipients` (JSON array string); "Email Filtered" sends `recipients`, `actions` (JSON array of a subset of fields), `filterDesc` | `{ status: "ok", sent, count? }` on success — routed through `GmailApp` server-side per Settings' own "New in v3" notes                                                  |
| `saveConfig`           | `{ config: JSON.stringify({ webhookUrl, googleSheetUrl, contractors }) }`                                                                                                                        | Written to the `Configuration` sheet's Key/Value rows                                                                                                                    |

`readConfig` and `readActions` are named in Settings → System's own "New in
v3" checklist as backend capabilities, but nothing in this client bundle
calls either directly — configuration and actions both arrive bundled
inside `readAll`'s response instead.

## Blind writes — `?action=...` (no-cors, response ignored)

| `action`               | Params                                                                                                                                                                    | Effect                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `append`               | `sheet`, `row` (JSON array), `headers` (JSON array)                                                                                                                       | Appends `row` to `sheet` — used only for the `📥 RMS DATA`/`📥 SPM DATA` sheets                                               |
| `updateRow`            | `sheet`, `matchCols` (JSON array), `matchValues` (JSON array), `row` (JSON array)                                                                                         | Overwrites the matched row — same two sheets                                                                                  |
| `deleteRow`            | `sheet`, `matchCols`, `matchValues`                                                                                                                                       | Deletes the matched row                                                                                                       |
| `upsertLastRMS`        | `equipmentId`, `equipmentName`, `line`, `point`, `date`, `axial`, `gear`, `horizontal`, `vertical`, `maxVelocity`, `readingStatus`                                        | Updates/creates this equipment+point's Last RMS Reading row                                                                   |
| `upsertLastSPM`        | `equipmentId`, `equipmentName`, `line`, `point`, `spmType`, `date`, `hdm`, `hdc`, `gs`, `readingStatus`                                                                   | Same, for SPM                                                                                                                 |
| `deleteLastRMS`        | `equipmentId`, `point`                                                                                                                                                    | Removes a Last RMS Reading row (fired when the last remaining RMS DATA row for that point is deleted)                         |
| `deleteLastSPM`        | `equipmentId`, `point`                                                                                                                                                    | Same, for SPM                                                                                                                 |
| `updateCompliance`     | `equipmentId`, `month` ("YYYY-MM"), `value` (defaults to `"Normal"`)                                                                                                      | Sets one equipment's compliance status for one month — fired automatically on New Reading save                                |
| `updateRegisterLimits` | `type: "RMS"` with `equipmentId, namePlate, eqType, line, rmsGood, rmsAcceptable, rmsAlarm, points`; or `type: "SPM"` with `equipmentId, spmNormal, spmCaution, spmAlarm` | Updates the Equipment Register's RMS or SPM side — **writes to the wrong column on the live backend**, see "Known gaps" below |

`sheet` is always one of the two literal tab names `"📥 RMS DATA"` /
`"📥 SPM DATA"` for `append`/`updateRow`/`deleteRow` — every other write
action is dedicated (no generic `sheet` parameter), so the backend owns
which tab it actually touches.

## Known gaps

- **No write is ever verified.** Unlike the sibling oil-analysis app's
  `api.js` (which follows every write with a verifying read and throws a
  `SaveVerificationError` on mismatch), this app's blind writes are truly
  fire-and-forget: the UI updates its own state and trusts the write
  landed. A dropped or failed write on the backend (a thrown error, a
  mismatched sheet name) has no client-visible symptom until the next full
  `readAll()` quietly reverts the optimistic change. This is a straight
  reconstruction of the original's actual behavior, not a simplification —
  the original genuinely doesn't verify these writes either.
- **`updateAction`'s payload doesn't match `appendAction`'s, but it turns
  out not to matter.** New actions are sent as the fully-named field object
  (`"Equipment ID"`, `"Reading Date"`, etc. — see
  [SHEET_SCHEMA.md](./SHEET_SCHEMA.md)). Edited actions are sent as the
  **raw camelCase form state** (`equipmentId`, `readingDate`, ...) with
  only an extra `"Action No"` key bolted on — confirmed directly from the
  bundle (`{...formState, "Action No": formState.actionNo}`). Confirmed
  against `apps-script/Code.gs`'s `buildActionRow()`: every field is read
  as `params['Field Name'] || params.fieldName || <default>`, so either
  key shape works. Reproduced exactly as found in `ActionTracker.jsx`'s
  save handler — harmless, not a bug, now that the handler side is visible.
- **The Limits Settings page and Equipment Register's edit modal both
  trigger a real backend bug: every RMS/SPM limit save lands in the wrong
  column.** This lives entirely in `updateRegisterLimits`'s handler on the
  Apps Script side, not in this app — see
  [`apps-script/README.md`](../apps-script/README.md#1-updateregisterlimits-writes-every-limit-to-the-wrong-column)
  for the full column-by-column breakdown. In short: an RMS save corrupts
  that equipment's `Points` list with a number and shifts Good/Acceptable/
  Alarm one column over; an SPM save corrupts `SPM Type` and `SPM Normal`
  and never actually reaches the real SPM Alarm column at all. A corrected
  script (`apps-script/Code.fixed.gs`) exists but isn't deployed anywhere
  by this repo — it has to be pasted into the Apps Script project and
  redeployed manually. Separately, Limits Settings' own form only collects
  Normal and Caution (there's no SPM Alarm field in that UI at all) and
  sends the Caution value as both `spmCaution` and `spmAlarm` — reproduced
  exactly as found in `pages/LimitsSettings.jsx`, and, combined with the
  backend bug above, means an SPM save from this page ends up writing the
  Caution value into both the real SPM Normal and SPM Caution columns.
- **Settings' Configuration-tab pass key (`17593`) is not real security.**
  It's a hardcoded string compared client-side (`btoa(input) ===
btoa("17593")`) — trivially recoverable by anyone who opens devtools or
  reads this repo. It exists to keep casual users from stumbling into the
  webhook URL / contractor list, not to gate access from anyone who'd
  actually look.
- **`autoSyncMinutes`/`enableAutoSync` exist in the default config object
  and nowhere else.** No Settings control reads or writes them, and no
  `setInterval` (or any periodic-sync mechanism at all) exists anywhere in
  the bundle. They look like a shipped-but-never-wired-up feature.

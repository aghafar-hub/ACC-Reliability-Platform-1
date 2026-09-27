# Apps Script webhook contract

This app talks to a Google Apps Script deployed as a Web App (**Execute
as: Me**, **Who has access: Anyone**). The script itself lives in your
Google Sheet's Apps Script project, not in this repo. This document
describes the HTTP contract this app relies on, so the script can be
maintained independently as long as the contract holds.

Base URL is whatever you paste into **Settings → Configuration** — an
`https://script.google.com/macros/s/XXXX/exec` URL.

## Reads — `GET`

Plain `fetch(url)` works for these (see
[ARCHITECTURE.md](./ARCHITECTURE.md#the-sync-bug-and-its-fix) for why reads,
unlike writes, don't need `no-cors`). Every GET this app makes also appends
a cache-busting `?_=<timestamp>` param and sends `cache: "no-store"` — see
the same section for why. Query params:

| `action`                                            | Params                  | Returns                                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readAll`                                           | —                       | `{ samples, actions, oilChanges, tracker }` — full sheet dump, each as arrays of raw row arrays (`tracker` includes its own header row — see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#oil-sample-tracker))     |
| `getEquipment`                                      | `id`                    | `{ samples, actions, oilChanges }` filtered to one equipment code — used both for the Equipment view and, in this app, as the **verification read** after every sample/action/oil-change write            |
| `readEquipmentRegistry`                             | —                       | `{ equipment: [...], count }` — the full Equipment Registry sheet, one object per row, including Contractor (see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#equipment-registry))                                 |
| `readActionRegistry`                                | —                       | The Action Registry sheet's pick list — parsed defensively by `api.js`'s `getActionRegistry()` since the exact returned shape (plain strings vs. `{no, action}` objects) was never fully confirmed        |
| `getDashboard`                                      | —                       | Aggregated counts, server-cached 5 minutes — not currently called by this app (it computes its own dashboard aggregates client-side instead)                                                              |
| `searchEquipment`                                   | `q`                     | Up to 20 matching rows — not currently called by this app                                                                                                                                                 |
| `getActions` / `getOilChanges` / `getRecentSamples` | `page`, `limit`         | Paginated raw rows — not currently called by this app                                                                                                                                                     |
| `getChanges`                                        | `since` (ISO timestamp) | Rows modified after `since`, for incremental sync — not currently called by this app; both of `App.jsx`'s sync buttons currently call `readAll` regardless (see the "Known gaps" note in ARCHITECTURE.md) |

`api.js` currently uses `readAll` (full sync), `getEquipment` (write
verification), `readEquipmentRegistry`/`readActionRegistry` (the two
separately-synced registries — see
[ARCHITECTURE.md](./ARCHITECTURE.md#two-equipment-lists-kept-separately-from-the-main-sync)).
The rest exist on the backend and are straightforward to wire up if a real
incremental sync or a search-as-you-type feature is ever needed.

## Writes — `POST`

Sent as `fetch(url, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) })`.
Because of `no-cors`, **the response is not readable** by this app — see
the architecture doc for why, and how this app compensates with a
verification read.

| `payload.action`      | Payload shape                                                          | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `append`              | `{ action: "append", sheet, row, headers }`                            | Appends `row` to `sheet`, creating the sheet with `headers` if it doesn't exist. Uses a linear scan to find "the first truly empty row after the data-start row" — **not safe for concurrent writes** (see [PDF_IMPORT.md](./PDF_IMPORT.md#the-review-before-add-flow) for why bulk sample import saves strictly sequentially, one at a time, rather than in parallel).                                                                                                                                                     |
| `updateRow`           | `{ action: "updateRow", sheet, matchCols, matchValues, row }`          | Finds the row where columns `matchCols` equal `matchValues`, overwrites it with `row`. **Special-cased per sheet**: Oil Change Log only ever writes columns 9–10 (Last Change/Next Due) regardless of what `row` contains (its Status column is a sheet formula); Equipment Registry appears to size the write to however many values are in `row` (this app deliberately sends only 9 of its 10 columns when editing an interval, to avoid touching Contractor — see the comment on `equipmentRegistryRow()` in `api.js`). |
| `deleteRow`           | `{ action: "deleteRow", sheet, matchCols, matchValues }`               | Deletes the matched row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `updateSampleTracker` | `{ action: "updateSampleTracker", equipmentCode, sampleDate, status }` | Finds or creates this sample's month column in the "Oil Sample Tracker" sheet and writes `"<status>                                                                                                                                                                                                                                                                                                                                                                                                                         | <display date>"`into this equipment's row — the exact`STATUS | DATE`format`parseTrackerRows()`expects (see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#oil-sample-tracker)). Fired automatically by`App.jsx` after every sample save (single-add and bulk PDF import both), best-effort — its own failure doesn't undo the sample save. |

`matchCols` is an array of 0-indexed column numbers; `matchValues` is the
corresponding array of values to match. See
[SHEET_SCHEMA.md](./SHEET_SCHEMA.md) for which columns each sheet is
matched on.

There is no separate write action for the Action Registry sheet — adding a
new entry (`api.js`'s `addActionRegistryEntry`) reuses the generic
`append` action above, on the assumption the backend's append handler
isn't hardcoded to specific sheet names. It hasn't needed a dedicated
endpoint so far.

## Error handling on the backend

The Apps Script wraps `doPost` in a try/catch and always returns a JSON
body describing the outcome (`{status: "ok"}`, `{status: "row_not_found"}`,
`{status: "error", message}`) — but because writes go through `no-cors`,
**this app never sees that body**. If you're debugging a write that isn't
landing, the fastest path is:

1. Open the Apps Script project → **Executions** (left sidebar, clock
   icon) to see whether `doPost` ran at all and whether it errored.
2. If nothing shows there for a request you just made, the request isn't
   reaching the script — check the deployed Web App version matches the
   code you're reading (**Deploy → Manage deployments**), since Apps
   Script doesn't auto-publish code changes to the live URL. This has
   bitten real deployments before: a sheet-layout change (like the
   Data_Entry Flagged Parameters column — see
   [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#data_entry-samples)) needs a
   matching backend constant update _and_ a new deployment version, not
   just a code edit, before it takes effect on the live URL.
3. For anything beyond a hard crash (e.g. a silent `row_not_found`), add
   temporary logging to a sheet tab (append a row to a "Debug Log" sheet
   from inside `doPost`'s branches) — the Executions log only reliably
   surfaces uncaught exceptions, not handled-but-unexpected return values.

This app's own verification-read approach (in `api.js`) is a client-side
way to catch the same class of problem without needing access to the
Apps Script's execution logs at all.

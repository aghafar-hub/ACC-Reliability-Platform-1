# Oil Lubrication data migration notes

Tracks the redesign of `apps/oil-analysis` (the embedded legacy Oil
Analysis app) and `backend/oil-lubrication/src/Code.js` (its real, deployed
Apps Script backend) to match the live "Oil Lubrication Data Base" Google
Sheet, tab by tab. `backend/oil-analysis/` (a separate, Routine/LP_ID-based
backend built earlier for a module never linked into the sidebar) is not
part of this — parked for possible later use.

## Step 1 — Equipment Registry (done)

The "Equipment Registry" tab was rebuilt around lubrication points, not
equipment: one row per LP_ID, and one Equipment_ID can now have several
LP_ID rows (e.g. a gearbox's left/right sides are two separate points,
each with its own interval/lubricant).

- `readEquipmentRegistry()` (backend) returns one object **per LP_ID** —
  deliberately not collapsed to one-per-equipment. Confirmed direction:
  "one row per Lub ID, grouped by equipment" is a presentation choice for
  consuming pages to make, not something baked into the data layer.
- `code` is set to **LP_ID**, not Equipment_ID: LP_ID is the column every
  other sheet (Data_Entry, Action Tracker, Oil Sample Tracker, Oil Change
  LOG) actually joins on — confirmed directly against the live sheet.
- The new sheet has no "Description" column — synthesized from
  `Lubrication_Location + " — " + Lubrication_Point` on both the backend
  and the bundled fallback snapshot (`equipmentRegistryDefault.js`).
- `assetId`/`assetClass` (old asset-tag fields) have no equivalent in the
  new sheet. Display fields and the Sample Tracker's asset-class filter
  degrade gracefully (show "—" / "All" only) rather than crash.
- Known gap, not yet addressed: `getActionRegistry`/`addActionRegistryEntry`
  in `api.js` reference a sheet called "Action Registry" that doesn't exist
  at all in the live workbook (closest real candidate is
  `OL_ACTION_PHRASES`).

Column layout (row 1 = title, row 2 = header, row 3+ = data):
`A=LP_ID, B=Equipment_ID, C=Report Equipment ID, D=Lubrication_Location,
E=Point_Code, F=Lubrication_Point, G=Position, H=Area, I=Manufacturer,
J=Model, K=Operating_Temperature_C, L=Lubricant_Type, M=Lubricant_Brand,
N=Lubricant_Quantity_L, O=Oil_Analysis_Required, P=Oil_Analysis_Interval,
Q=Oil_Change_Interval, R=Contractor, S=LP_Status, T=Created_Date,
U=Modified_Date`

## Step 2 — Oil Change Log redesign (done)

Two sheets are involved, and they play very different roles:

- **"Oil Change LOG"** (note the case — `SpreadsheetApp.getSheetByName` is
  case-sensitive, so the original v4.0 script's `"Oil Change Log"`
  reference silently returned an empty sheet) is the **real, append-only
  event log** this app now reads and writes exclusively. One row per real
  oil-change event; a row is never edited after being appended, since a
  change event is a historical fact, not mutable state. Row 1 = header,
  row 2+ = data (no title row, unlike Equipment Registry).
  Columns: `A=EventId, B=LP_ID, C=RoutineItemId, D=EventType, E=EventDate,
  F=QuantityUsed, G=OilBrandType, H=DoneBy, I=Contractor, J=ConditionNotes,
  K=PhotoUrl, L=NextDueDate, M=Created_Date`.
- **"Oil Last Change"** is a **separate, formula-only viewer** sheet — per
  the confirmed direction, the app never reads or writes it. Its own
  "Last change Date" column is a live `MAXIFS('Oil Change LOG'!E:E, 'Oil
  Change LOG'!B:B, LP_ID)` formula and its "Status" column depends on
  "Next Oil Change" via an `IF(...< TODAY()...)` formula — both already
  self-maintain from Oil Change LOG the moment a new event is appended,
  with no script involvement needed.

Old model (removed): a single "current row per equipment/point/oilType"
sheet, edited in place via `updateRow` (only ever touching Last Change /
Next Due — Status was a sheet formula even then). That model doesn't exist
in the live sheet anymore; there's nothing to migrate off of, it was purely
an artifact of the old, no-longer-deployed script.

**NextDueDate** is computed **server-side**, at log time, from the
point's own `Oil_Change_Interval` (Equipment Registry column Q — e.g.
`"2 Y"`, `"0.5 Y"`, `"As needed"`, or blank) — never trusted from the
client, so it can't drift from what the registry says the real interval
is. `intervalMonthsForOilChange_()` in the backend mirrors
`intervalMonths()` in `apps/oil-analysis/src/parsers.js`; keep both in
sync if the interval text format ever changes.

**Frontend shape**: every existing page (Dashboard, Oil Change Log,
Equipment, Reports, Sample Tracker, action autofill…) still consumes a
"current state per LP" object — same shape as the old sheet used to hand
them directly. That shape is now **derived client-side**
(`deriveCurrentOilChanges()` in `parsers.js`) from the raw event array
(`oilChangeEvents`, synced via `readAll`) plus the Equipment Registry: one
entry per registry row (per LP_ID), built from that LP's most recent
event. Pages were not touched — they still receive an `oilChanges` prop
built the same way as before, just sourced differently in `App.jsx`.

**Log form scope** (confirmed direction): the existing "Update Oil Change"
form — previously just a date field — now also asks for **Done By** and
**Notes** (`ConditionNotes`). Quantity/oil type/contractor are auto-filled
server-side from the point's registry entry; no photo upload (needs
separate infra, not built).

New backend endpoints:
- `doPost action=logOilChangeEvent` — appends one event; returns
  `{eventId, nextDueDate}` (informational only — the client can't read a
  blind POST response through Apps Script's no-cors requirement, so the
  usual postBlind-then-verify-read pattern is still used).
- `doGet action=getOilChangesForLp&lpId=XXXX` — all events for one LP_ID,
  newest first. Backs both the write-verification read and, later, a
  per-point history view.

`getDashboard()`'s overdue count no longer reads a per-row Status formula
(that sheet is gone) — it's derived the same way as the frontend: latest
event per LP_ID, checked against that event's own stored NextDueDate.

## Step 3 — Data_Entry / Action Tracker column shift (done)

Both sheets gained the same "Report Equipment ID" column Equipment
Registry did, inserted right after the LP_ID column — shifting everything
from Description onward by +1. LP_ID itself (Data_Entry col A, Action
Tracker col B — Action Tracker's col A is its own Ac.No ticket number) sits
*before* the insertion point in both sheets, so `.unitId`/`.equipmentCode`
were already reading correctly by coincidence; every other field was off
by one.

Confirmed against real rows read straight from the live sheet (not just
the header row) — `rowToSample`/`rowToAction` were run against an actual
Data_Entry and Action Tracker row and checked field-by-field before this
was considered done.

Column layout (0-based):
- **Data_Entry** (39 cols total): `0=Lub ID(LP_ID), 1=Report Equipment ID,
  2=Description, 3=sample ID, 4=Sample Date, 5=Report Status, 6-8=ratings,
  9-11=particle counts, 12=PQ Index, 13=Visc, 14=TAN, 15=Oxidation,
  16=Water, 17-25=wear(9), 26-28=contaminants(3), 29-34=additives(6),
  35=Alert Type, 36=Sample Analysis, 37=Flagged Parameters, 38=Last
  Modified`.
- **Action Tracker** (19 cols total): `0=Ac.No, 1=Lub ID(LP_ID),
  2=Report Equipment ID, 3=Description, 4=Oil Type, 5=Revision Date,
  6=Sample Date, 7=Sample Result, 8=Sample Analysis, 9=Last Change,
  10=Status, 11=Contractor Action, 12=Contractor, 13=Completed Date,
  14=Prev Month Agreed Action, 15=ACC Action, 16=Agreed Action,
  17=Closing Comment, 18=Last Modified`.

Also fixed along the way: `LAST_MODIFIED_COL` in the backend was still
targeting the pre-shift positions (38/17), and Action Tracker's value was
**already wrong before this shift** — 17 pointed at "Closing Comment", one
short of the real Last Modified column (18, now 19). Every Action Tracker
write before this fix was very likely stamping its timestamp into Closing
Comment instead. `getDashboard()`'s raw column reads (Sample Date/Report
Status/Action Status) and `searchEquipment()`'s Description read were
fixed the same way.

New `reportEquipmentId` field threaded through: `rowToSample`/`sampleToRow`,
`rowToAction`/`actionToRow`, `autofillFromEquipment()` (so a newly-created
action inherits it from the registry), and `AddSample.jsx`'s equipment
picker. Not wired into the PDF bulk-import path (`BulkImportReview.jsx`) —
imported samples leave this column blank, a minor, non-breaking gap.

## Step 4 — Routines (done)

Confirmed direction: build fresh inside `apps/oil-analysis`, not by fixing
and relinking the separate, parked `backend/oil-analysis` +
`frontend/src/pages/oil-analysis/*` module (which already has a complete
Routines UI, but models AssignedTo/CreatedBy/ApprovedBy around real
platform user logins — a fit for that module's own architecture, not this
one, which has no per-user login at all). That parked module's backend was
also built against an invented schema (`OA_LP_REGISTER`, `OA_ROUTINES`)
that doesn't match the real sheet (`Equipment Registry`, `ROUTINES`), so
reusing it wasn't a clean relink either way.

`ROUTINES` and `OA_ROUTINE_ITEMS` (both empty, no data yet) already carry
the right schema for this. Since there's no login system, CreatedBy /
AssignedTo / ApprovedBy / ACC_CommentBy are plain free-text fields — same
pattern as Oil Change LOG's "Done By" from Step 2 — not references to real
accounts.

**RoutineId/RoutineItemId are client-generated** (`newRoutineId()` in
parsers.js, a `prefix-<uuid>` string), not server-generated like Oil
Change LOG's EventId. `createRoutine` has to write a routine row AND N
item rows as one logical unit; a client-supplied id makes the
write-verification read exact (find by id) instead of guessing "the
newest matching routine", which isn't safe if two get created close
together.

New backend endpoints: `getRoutines`, `getRoutineItems&routineId=`,
`createRoutine`, `submitRoutineItem`, `submitRoutine`, `approveRoutine`,
`addRoutineComment`. Not part of the main Full Sync — the Routines page
fetches on demand, the same way Equipment Registry has its own separate
sync trigger rather than riding along with samples/actions/oil changes.

New pages: `pages/Routines.jsx` (list, filterable by status/contractor),
`pages/NewRoutine.jsx` (pick contractor + assignee, search/add lubrication
points from the registry, set each one's item type), `pages/RoutineDetail.jsx`
(mark each item done/not-done with quantity or a reason, submit the
routine, then an ACC review section — comment + approve — once submitted;
items lock once approved). Wired in as a genuine native sub-tab
(`frontend/src/navigation.ts`'s `routines` entry lost its `to:` — it was a
routed placeholder before this, now it's a real page inside the embedded
app like everything else in that list).

Deliberately NOT built: any auto-link between a routine item marked
"done" (a Change/Top-up item) and Oil Change LOG — that would mean this
step silently deciding whether completing a routine item should also
append an oil-change event and reset NextDueDate, which has real
behavioral implications worth its own confirmation rather than assuming.

## Step 5 — Oil Inventory (done)

Unlike Routines, no backing sheet existed for this at all — the schema
was designed from scratch (proposed, then built by hand in the live
sheet), following the same two-tab shape that worked for Step 2: an
append-only movement log as the sole source of truth, and a product
registry whose stock-level columns are sheet formulas fed by that log.

Confirmed schema (verified directly against the live sheet after it was
built, not assumed):
- **"Oil Inventory"** (16 cols): Product_ID, Lubricant_Type,
  Lubricant_Brand, Container_Type, Container_Size_L, Unit, Current_Stock
  (col G — **sheet formula**, `SUMIFS` of Receipts − Issues + Adjustments
  from the LOG tab, filtered by Product_ID), Recorder_Level *(spelled
  that way in the real sheet — not "corrected" to "Reorder_Level" in code
  or here)*, Storage_Location, Supplier, Unit_Cost, Status,
  Last_Movement_Date (col M — **sheet formula**, `MAXIFS` of MovementDate
  from the LOG tab), Notes, Created_Date, Modified_Date.
- **"Oil Inventory LOG"** (12 cols): MovementId, Product_ID, MovementType
  (Receipt/Issue/Adjustment), Quantity (always positive for Receipt/Issue;
  signed +/- for Adjustment — the one asymmetry in "quantity is always
  positive", needed so a downward stock correction can subtract), 
  MovementDate, LinkedLP_ID, LinkedEventId, Contractor, DoneBy, Reference,
  Notes, Created_Date.

A first pass at the LOG tab had 5 extra columns (Status,
Last_Movement_Date, Notes, Created_Date, Modified_Date) accidentally
copy-pasted in from the Oil Inventory tab's tail — caught before any code
was written against it, and removed.

Backend never writes to Current_Stock or Last_Movement_Date (columns G/M
on "Oil Inventory") — `updateOilProduct` does individual per-cell writes
to every OTHER column specifically to avoid touching those two, since
they sit in the middle of the row and a generic whole-row `updateRow`
would silently replace the formula with a static value (the same
corruption risk `equipmentRegistryRow` had to avoid in Step 1).
Product_ID/MovementId are client-generated (`newId()` in parsers.js,
generalized from Routines' `newRoutineId()`), same exact-verification
reasoning as Routines.

New pages: `pages/OilInventory.jsx` (list with a low-stock indicator when
Current_Stock ≤ Recorder_Level, search, Add Product form),
`pages/OilProductDetail.jsx` (stock/reorder/supplier summary, a
Log Movement form for Receipt/Issue/Adjustment — Issue can optionally
link to an LP_ID via a datalist off the Equipment Registry — and full
movement history). Wired in as a native sub-tab the same way Routines
was (`frontend/src/navigation.ts`'s `inventory` entry lost its `to:`).

One practical caveat surfaced to the user in the Add Product form itself:
Google Sheets formulas don't inherit into new rows automatically — a
newly added product's Current_Stock/Last_Movement_Date stay blank until
the G/M formula is copied down into that row (same as any lookup column
in this sheet).

## Option A hardening (done)

Triggered by a full reliability audit requested after the user found the
webhook URL needed re-pasting on a second device — the audit's actual
scope was "inspect all app sides, list every problem, give the path to
the strongest possible app," scaled for the ~20 people about to use this
concurrently. The audit's own report recommended landing "Option A"
(harden the current Apps Script + Sheets architecture) before deciding
whether "Option B" (fold this into Platform Core's login/RBAC) or
"Option C" (replace the Apps Script backend with a real server) are
worth doing — those two are explicitly deferred, not started.

Six items, all backend in `backend/oil-lubrication/src/Code.js` unless
noted:

1. **LockService around every write.** `appendRow`'s "scan column A for
   the first empty row, then write" and `findRowIndex`'s "scan for the
   matching row, then update/delete" both read a snapshot and write to a
   separately-computed row with no lock between the two steps — two
   concurrent requests could compute the same target row and the second
   write would silently clobber the first. `doPost` now wraps its entire
   dispatch chain in `LockService.getScriptLock().tryLock(30000)`, so
   only one write is ever in flight against the sheet at a time.
2. **Write allowlist + empty-match guard.** The generic
   `append`/`updateRow`/`deleteRow` actions took `data.sheet` straight
   from the client with no check — a `GENERIC_WRITE_ALLOWLIST` now
   restricts each to specific sheets. Separately, `findRowIndex` with an
   empty `matchCols` used to "match" the first data row by default (its
   inner compare loop just never ran), so a malformed or empty
   `matchCols`/`matchValues` could silently act on the wrong row; it now
   returns `-1` (not found) instead.
3. **Fixed the Action Registry.** The frontend's `readActionRegistry`
   action had no matching `doGet` case at all — it silently fell through
   to the `default` handler and always returned an empty list, so the
   Contractor/ACC Action multi-select pickers never actually loaded
   anything from the registry. The write path also targeted a sheet
   named "Action Registry," which doesn't exist (the real sheet is
   `OL_ACTION_PHRASES`, columns `No` / `Actions Phrase`). Added
   `readActionRegistry()` and fixed `apps/oil-analysis/src/api.js`'s
   `addActionRegistryEntry` to write to the real sheet name.
4. **Shared-secret check.** `checkSecret_(providedSecret)` compares
   against an `API_SECRET` Script Property on every `doGet`/`doPost`.
   Not real per-user auth — the secret ships inside the public frontend
   bundle, same exposure as the webhook URL itself — but it raises the
   bar from "anyone who has the URL" to "anyone who has the URL AND this
   value," and it's rotatable via the Script Property alone, no new
   deployment needed. **Fails open** (accepts every request) until
   `API_SECRET` is set, specifically so this ships without locking out
   the already-live app the instant it deploys — see the deployment doc
   for the value and the Script Property setup step.
   `apps/oil-analysis/src/config.js` now exports the matching
   `API_SECRET`, and `api.js`'s `getJSON`/`postBlind` inject it into
   every request automatically, so no individual call site changes.
5. **Incremental auto-sync + jitter** (`apps/oil-analysis/src/App.jsx`,
   `api.js`). Auto-sync used to run a full `readAll()` on every tick on a
   plain `setInterval` — with ~20 people's browsers on the same interval,
   that's a full-table read from every open tab, synchronized to the
   same moment repeatedly. Auto-sync now calls the backend's existing
   `getChanges(since)` action (Phase 8 — rows modified after a
   checkpoint) and merges results into the already-loaded arrays by id,
   falling back to a full sync when there's no checkpoint yet, the
   server reports `fullSyncRequired`, or every 6th tick (`getChanges`
   can't see row deletions, only additions/edits, so a periodic full
   sync is still needed to catch those). The polling loop itself switched
   from `setInterval` to a recursively-rescheduled `setTimeout` with
   +/-15% jitter per cycle, so open tabs don't all fire in the same
   instant every N minutes.
6. **Webhook URL default.** Checked against the user's actual live
   deployment URL — already matched `DEFAULT_WEBHOOK_URL` in
   `config.js`, so no change was needed here.

Not done as part of Option A (real per-user identity/authorization
instead of a shared secret, a real database instead of Sheets, request
rate limiting) — those are Option B/C territory, deferred.

## Option B Phase 1 — real identity (done)

What the audit found before this started: the app your team actually uses
(`apps/oil-analysis/`'s standalone GitHub Pages build) had **zero login** —
the shared Option A secret gates the API, but anyone with the URL could
open the app and act as anyone. The only "password" was a shared
Settings-tab PIN. Meanwhile Platform Core (the shell at the repo root) had
a real, working login/session system, just not connected to this app at
all, and no UI existed anywhere to actually create the ~20 accounts.

Scoped explicitly as identity only — **no access restrictions yet**.
Everyone can still do everything they could before; the difference is that
writes are now attributable to a real logged-in person instead of free
text, and the standalone no-login URL is retired. Role-based restriction
(who can approve a routine, edit the registry, etc.) is Phase 2, its own
decision — `hasPermission_`/`getContractorScope_` in
`backend/platform-core/src/Rbac.js` are still an explicit unimplemented
skeleton, unchanged by this phase.

1. **Manage Users admin page** — already existed
   (`frontend/src/components/AccountsPanel.tsx`, wired into the shell's
   Settings page, App-Admin-gated) from earlier work in this project;
   confirmed still correct rather than rebuilt. Lists accounts, creates
   one (email + org, temp password shown once), resets a password.
2. **Session passed into the embedded app.** `EmbeddedOilAnalysis.tsx`
   reads the shell's own `useAuth()` session and passes
   `{ token, claims }` into `mountOilAnalysis(container, { navBridge,
   session })` once at mount (this component only ever mounts behind
   `RequireAuth`, so a session is always there by then). `embed.jsx` and
   `App.jsx` thread it down; a new `SessionContext.jsx`
   (`useSession()`/`useSessionEmail()`) makes it available to any page
   without prop-drilling. Absent entirely for a standalone build, which
   no longer exists after item 5 below, but every consumer already treats
   a missing session as "nothing to prefill," not an error.
3. **Session token sent on every request.** `api.js`'s `getJSON`/
   `postBlind` attach it (`sessionToken`, alongside Option A's `secret`)
   automatically via a module-level `setSessionToken()` — set once by
   `App.jsx` from the `session` prop — the same pattern `API_SECRET`
   already used, so no individual call site changes.
4. **Identity auto-fill, not auto-lock.** Free-text "who did this" fields
   (Routine `createdBy`, "Reviewed By" driving `approvedBy`/`commentBy`,
   Oil Inventory movement `doneBy`, Oil Change Log `doneBy`) prefill from
   the logged-in user's email the first time a session becomes available,
   but stay editable — someone occasionally relays another person's
   verbal sign-off, and Phase 1 isn't the place to foreclose that.
   `createdBy` on Routine creation was never a form field at all (always
   sent as `""`), so that one is a pure silent improvement.
5. **Backend session verification**
   (`backend/oil-lubrication/src/Code.js`). `getSessionSecret_`,
   `base64UrlDecode_`, `signPayload_`, `requireSession_` copied verbatim
   from `backend/platform-core/src/Session.js`, per that file's own
   instruction to do exactly this in every module. A new `checkAuth_`
   combines it with Option A's `checkSecret_`: the shared secret still
   gates every request as before; a request that ALSO sends a session
   token must have that token verify successfully (rejected outright if
   malformed/tampered), while a request with no token at all still gets
   through on the shared secret alone. Fail-soft, not a hard cutover — a
   device with a not-yet-redeployed frontend, or a user with no Platform
   Core account yet, doesn't get locked out. The resolved identity
   (`actingUser`, "" when no session) is folded into every write's
   existing Debug Log entry, so writes are attributable to a real person
   even though nothing is restricted yet.
6. **Standalone deployment retired.** `.github/workflows/deploy.yml` no
   longer builds/deploys `apps/oil-analysis`'s standalone bundle (no
   `index.html` at `/apps/oil-analysis/` any more) — only the embed
   bundle, at the same path the shell already loads it from. The app is
   now reachable only by logging into the Platform Core shell.

Operationally, item 6 means every one of the ~20 people needs a real
account before they can use the app again — see the deployment guide's
"Option B Phase 1" section for the exact rollout sequence (set
`SESSION_SIGNING_SECRET` to match Platform Core's on the oil-lubrication
project, redeploy both, then create accounts before the standalone build
actually goes away in practice via a redeploy).

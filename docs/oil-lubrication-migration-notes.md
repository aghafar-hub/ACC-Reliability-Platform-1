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

## Step 4/5 — not started

Remaining greenfield tabs: Routines UI wiring (currently a placeholder),
Oil Inventory, full Action Tracker CRUD.

# Deployment guide — Apps Script backends and frontend config

Status: Platform Core and Oil Analysis backends are deployed and live
(both Web Apps confirmed responding). The frontend now has a real login,
app shell, and full Oil Analysis screens (LP register + the Routine
workflow) built against them — see
`docs/oil-analysis-module-notes.md` for what's built vs. still open.
Vibration Analysis has no backend code yet — that module hasn't had its
own schema/requirements pass, so it stays a separate linked app for now.

This doc is the steps to actually stand these up against the two Google
Sheets you created:

- **Platform Core** → "ACC Reliability Data Base"
  `https://docs.google.com/spreadsheets/d/1yQHakVTPkPQFOs_QXscEXBwySqZU8OR5kmRGbA48UAg`
- **Oil Analysis** → "Oil Lubrication Data Base"
  `https://docs.google.com/spreadsheets/d/1YCSMaVuXHjMuXFEcfzKrDmlq43_KLyDoGO7ME_1B4dk`

Both are already native Google Sheets (not raw uploaded .xlsx), so
`SpreadsheetApp.openById()` can open them directly — no conversion needed.

## 1. Generate one shared signing secret

Every module's backend verifies session tokens locally, using a secret
shared across all of them (spec §5). Generate **one** long random string
now and reuse it in every project below — never regenerate it per project.

Any of these work:
- In a terminal: `openssl rand -base64 32`
- Or just mash the keyboard for 40+ random characters.

Keep it somewhere safe (a password manager) — you'll paste the exact same
value into two (later, more) Apps Script projects' Script Properties, and
never into a Sheet or into code.

## 2. Platform Core project

1. Open the "ACC Reliability Data Base" Sheet.
2. **Extensions → Apps Script**. This creates a script bound to that Sheet
   (no need to separately choose which spreadsheet it points at — a bound
   script's `SpreadsheetApp.getActive()` would work too, but this codebase
   always uses `SpreadsheetApp.openById()` off a Script Property instead, so
   the same script could be rebound to a different Sheet later without
   code changes).
3. Delete the default empty `Code.gs`. For every file in
   `backend/platform-core/src/` (Auth.js, AssetMaster.js, AdminSettings.js,
   Code.js, Config.js, Rbac.js, Session.js, Users.js, Utils.js), create a
   matching script file (**File → New → Script**) and paste in its
   contents. `SampleTestUsers.js` is optional — see the note below.
4. **Project Settings (gear icon) → Script Properties → Add script property**:
   - `PLATFORM_CORE_SPREADSHEET_ID` = `1yQHakVTPkPQFOs_QXscEXBwySqZU8OR5kmRGbA48UAg`
   - `SESSION_SIGNING_SECRET` = *(the secret from step 1)*
5. **Deploy → New deployment → type: Web app**.
   - Execute as: **User deploying** (leave as-is, matches `appsscript.json`)
   - Who has access: **Anyone** (the app itself enforces login/session —
     this only controls who can reach the HTTP endpoint at all)
6. Copy the resulting Web App URL — this is Platform Core's endpoint. The
   frontend needs it as its API base URL for login/admin actions.

You already have a seed App Admin account in the `USERS` sheet
(`aghafar@arabiancementcompany.com`, `MustChangePassword = TRUE`) with the
temporary password from when the workbook was generated — use that to log
in the first time and set a real password via `changePassword`.

**Testing with one account per role**: `SampleTestUsers.js` (optional —
not wired into any web request, never runs on its own) adds one function,
`createSampleTestUsers_()`, that creates 7 test accounts in one pass: an
ACC Admin, Reliability Engineer and Manager, plus a Contractor Engineer
and a Technician for *each* of RHI and ASEC — exactly the combinations
needed to see the Oil Lubrication "Assigned To"/"Assign Technician"
dropdowns (`TechnicianPicker.jsx`) populate as real accounts instead of
falling back to free text, and to exercise the contractor-scoped
screens and the Patch 14 admin-only notification settings card from
every angle. To run it: add this file alongside the others above, then in
the Apps Script editor pick `createSampleTestUsers_` from the function
dropdown next to **Run ▶** and run it. Open **View → Executions** (or the
editor's own execution log right after it finishes) to read each
account's email and one-time temporary password — they're generated
fresh and shown only there, same as any account `createUser_` makes, so
copy them before closing that panel. Every account must change its
password on first login, same as a real one. Safe to run more than
once — an account that already exists is reported and skipped rather
than erroring out the whole batch.

**Lost or never copied one of those passwords?** Don't re-run
`createSampleTestUsers_()` — it skips anything that already exists, so it
won't give you a new one. Run `resetSampleTestUserPasswords_()` instead
(same file) — it looks all 7 sample emails up and issues each a fresh
temporary password in one pass, logged the same way. Works for any subset
of the 7 too (e.g. if only one account's password got lost, it still
re-logs all 7, so you don't have to remember which one).

## 3. Oil Analysis project

Same steps, against the "Oil Lubrication Data Base" Sheet instead:

1. Open it → **Extensions → Apps Script**.
2. Create script files for everything in `backend/oil-analysis/src/`
   (Code.js, Config.js, DueDates.js, LpRegister.js, Rbac.js, Routines.js,
   Session.js, Settings.js, Utils.js) and paste in their contents.
3. Script Properties:
   - `OIL_ANALYSIS_SPREADSHEET_ID` = `1YCSMaVuXHjMuXFEcfzKrDmlq43_KLyDoGO7ME_1B4dk`
   - `SESSION_SIGNING_SECRET` = *(the exact same secret as Platform Core's)*
4. **Deploy → New deployment → Web app** (same settings as above).
5. Copy the Web App URL.

### Install the due-date sweep trigger

The daily sweep needs a trigger. Apps Script's Trigger picker hides any
function ending in `_` (every internal function in this codebase does),
so bind the trigger to the small public wrapper instead:

**Triggers (clock icon) → Add Trigger**:
- Function: `runDailyDueDateCheck` (not `checkDueDates_` — it won't appear in the list)
- Event source: Time-driven
- Type: Day timer (pick any off-peak hour, e.g. 2–3am)

### Register the endpoint back in Platform Core

Open "ACC Reliability Data Base" → `MODULE_REGISTRY` sheet → find the
`oil-analysis` row → paste the Oil Analysis Web App URL into `EndpointUrl`.
Kept as a record — the frontend itself reads both URLs from its own build
config (below), not by fetching this sheet at runtime.

## 4. Frontend configuration

The frontend (`frontend/`) is a single Vite/React app that talks to both
Web Apps directly. It reads their URLs from env vars — never hardcoded in
source, same principle as the backends' Script Properties.

**Local development**: copy `frontend/.env.example` to `frontend/.env.local`
(gitignored) and fill in both deployed Web App URLs:

```
VITE_PLATFORM_CORE_URL=https://script.google.com/macros/s/.../exec
VITE_OIL_ANALYSIS_URL=https://script.google.com/macros/s/.../exec
```

Then `npm run dev` inside `frontend/`.

**CI build (GitHub Pages)**: `.github/workflows/deploy.yml` reads the same
two variables from the repository's Actions configuration rather than a
committed file (these URLs aren't secret — every real permission check
still happens server-side per request — but the repo's `.gitignore`
blocks committing any `.env.*` file on principle, and CI config is the
cleaner place for deploy-time values anyway). Before the next deploy, add
two **repository variables** (GitHub repo → Settings → Secrets and
variables → Actions → **Variables** tab, not Secrets):

- `VITE_PLATFORM_CORE_URL` = the Platform Core Web App URL
- `VITE_OIL_ANALYSIS_URL` = the Oil Analysis Web App URL

Without these set, the production build fails fast with a clear error
(`config.ts`'s `requireEnv`) rather than silently shipping a broken app.

**Not yet tested against the live backends**: this sandbox's network
egress blocks `script.google.com` entirely, so the login → dashboard →
Oil Analysis flow could only be verified with the UI shell (screenshots,
no console errors, clean error-handling when the fetch is blocked) — not
an actual authenticated round trip. Once you add the repository variables
and the next deploy runs (or you test locally with `.env.local`), do a
real login with the seed App Admin account and confirm the LP register
and Routines screens actually load data — that's the one thing this
session couldn't verify directly.

## 4b. Live "Oil Lubrication" backend — enabling the shared-secret check

The above (sections 2–4) documents the parked, never-linked
Routine/LP_ID-based `backend/oil-analysis/` project. The app actually in
production is `apps/oil-analysis`, backed by `backend/oil-lubrication/src/Code.js`
deployed against the "Oil Lubrication Data Base" Sheet — see
`docs/oil-lubrication-migration-notes.md` for that project's full history.

As of the Option A hardening pass, that backend checks a shared secret on
every request (`checkSecret_`) but **fails open** — accepts every request
unchanged — until you set it. To turn the check on:

1. Open the "Oil Lubrication Data Base" Sheet → **Extensions → Apps Script**.
2. **Project Settings (gear icon) → Script Properties → Add script property**:
   - `API_SECRET` = `5RfANz0fp5kycVaABAYrKZ9eWBJxXOBaghBKRM9o`
3. **Deploy → Manage deployments → pencil icon → New version → Deploy.**
   Editing the code or saving alone does *not* update the live `/exec`
   URL — this step is what actually ships `checkSecret_` (and the rest of
   the Option A backend changes) to the app everyone's already using.
4. The frontend build already sends this same value on every request
   (`apps/oil-analysis/src/config.js`'s `API_SECRET`, injected
   automatically by `api.js`), so no frontend redeploy is needed for this
   step specifically — only the backend redeploy in step 3.

If you ever need to rotate the secret: generate a new value, update the
Script Property, update `API_SECRET` in `config.js` to match, and rebuild/
redeploy the frontend — no new Apps Script deployment (no new URL) needed
for the backend, since it re-reads the Script Property on every request.

## 4c. Option B Phase 1 rollout — real login for Oil Lubrication

See `docs/oil-lubrication-migration-notes.md`'s "Option B Phase 1" section
for what changed and why. This is the order to actually turn it on without
locking your team out mid-rollout — **do these roughly in order**, since
step 4 removes the no-login URL your team currently uses:

1. **Sync the session-signing secret.** Open Platform Core's Apps Script
   project (the one behind "ACC Reliability Data Base") → Project Settings
   → Script Properties → copy the exact value of `SESSION_SIGNING_SECRET`
   (generated back in section 1 of this doc). Then open the "Oil
   Lubrication Data Base" Sheet → Extensions → Apps Script → Project
   Settings → Script Properties → add `SESSION_SIGNING_SECRET` with that
   **exact same value**. A mismatch here doesn't error loudly — every
   session token just silently fails verification and every request falls
   back to the shared-secret-only path (see `checkAuth_` in `Code.js`),
   so double-check the copy/paste.
2. **Redeploy the oil-lubrication backend** (Deploy → Manage deployments
   → pencil icon → New version → Deploy) — same reminder as section 4b:
   saving code alone doesn't update the live `/exec` URL.
3. **Create real accounts for the team.** Log into the Platform Core
   shell as App Admin → Settings → Accounts panel → add each person by
   email + org. Each temporary password is shown once — relay it to them
   directly (Slack/in person), since it's never emailed or shown again.
   They'll be forced to set a real password on first login.
4. **Redeploy the frontend** (push to this branch, or `workflow_dispatch`
   the "Deploy to GitHub Pages" action) — this is the step that actually
   removes the standalone no-login build. Do this only once enough of the
   team has a real account to log in with, since after this the only way
   to reach the Oil Lubrication app is through the shell's login.
5. **Verify**: log in as one of the new accounts, open Oil Lubrication
   from the sidebar, and check that a "Reviewed By"/"Done By" field
   (Routines detail, or Oil Inventory's Log Movement form) is already
   prefilled with that account's email instead of blank.

## 4d. Multi-file backend — Oil Lubrication's Code.js split

`backend/oil-lubrication/src/Code.js` used to be one ~1450-line file —
it's now split into 12 files by concern (see
`docs/oil-lubrication-migration-notes.md`'s "Solid app round" section for
the full list and why). Apps Script shares one global scope across every
file in a project regardless of file name, so this is purely
organizational — same deployment, same URL — but it does mean **each file
needs to exist separately in the Apps Script editor**, not just pasted
into Code.js:

1. Open the "Oil Lubrication Data Base" Sheet → Extensions → Apps Script.
2. For each of these files — `Config.js`, `Auth.js`, `Utils.js`,
   `Dashboard.js`, `EquipmentRegistry.js`, `SampleTracker.js`,
   `SheetTriggers.js`, `OilChanges.js`, `Routines.js`, `OilInventory.js`,
   `ActionRegistry.js` — click the **+** next to "Files" → Script → name
   it exactly that (drop the `.js`, Apps Script adds its own extension),
   then paste in that file's full contents from the repo.
3. Replace the existing `Code.js` file's contents with the new (much
   shorter) `Code.js` — now just `doGet`/`doPost`.
4. Save all files (Ctrl+S / the disk icon covers the whole project).
5. Deploy → Manage deployments → pencil icon → New version → Deploy —
   same reminder as always: saving alone doesn't update the live `/exec`
   URL.
6. Verify: `?action=test` on the deployed URL should still return the
   normal `{"status":"ok",...}` response — if any file was missed or
   misnamed, this fails with a script error instead.

Going forward, when a repo change touches one of these files, only that
one file needs re-pasting in the Apps Script editor before the next
redeploy — not the whole thing.

## 4e. Recurring Routes — new file + a trigger you set up once

The Routines redesign (suggested samples, progress, Route Types,
recurring templates) added one new backend file and one new sheet.

**File**: `backend/oil-lubrication/src/RouteTemplates.js` — new, doesn't
exist yet in the Apps Script editor. Same as section 4d's files: click the
**+** next to "Files" → Script → name it `RouteTemplates` (no `.js`) →
paste in its full contents. `Routines.js`, `Config.js`, and `Code.js` also
changed this round — replace their contents with the repo's current
versions too.

**Sheet**: `ROUTINE_TEMPLATES` — no manual creation needed. The backend's
`appendRow` helper creates it automatically (with headers) the first time
someone saves a recurring route from the app.

**Deploy**: same as always — save all files, then **Deploy → Manage
deployments → pencil icon → New version → Deploy**. Saving alone doesn't
update the live `/exec` URL.

**New step this round — a time-driven trigger** (this is what actually
turns a recurring template into a real, assignable route every cycle;
nothing runs on a schedule without it):

**Triggers (clock icon) → Add Trigger**:
- Function: `generateDueRouteInstances`
- Event source: Time-driven
- Type: Day timer (pick any off-peak hour, e.g. 2–3am)

**Verify it works without waiting a day**: open the script editor, pick
`generateDueRouteInstances` from the function dropdown at the top, click
**Run**. Check the execution log (View → Logs) for errors, and check the
`ROUTINES` sheet for a new row if anything was actually due. Safe to run
any time — it only generates routes for templates that are due within 3
days, and always advances each template's own schedule regardless, so
re-running it doesn't double-generate.

## 4f. Routine email notifications — new file + one sheet to fill in

Part of the "make this a real plant app" pass: until this, nothing in Oil
Lubrication ever told anyone anything — every handoff (routine assigned,
submitted for review, approved) depended entirely on someone opening the
app and noticing. This adds best-effort email at each of those three
points — a failure here never blocks or breaks the actual save, it's a
courtesy notification only (see `Notifications.js`'s own header comment).

**File**: `backend/oil-lubrication/src/Notifications.js` — new, doesn't
exist yet in the Apps Script editor. Same as section 4d: click the **+**
next to "Files" → Script → name it `Notifications` (no `.js`) → paste in
its full contents. `Routines.js` and `Code.js` also changed this round —
replace their contents with the repo's current versions too.

**Sheet you need to create and fill in yourself**: `OL_NOTIFY_REVIEWERS`
— two columns, `Contractor` and `Email`. One row per person who should be
emailed when a routine is submitted for their review:
- A row with `Contractor` = `RHI` or `ASEC` only gets that contractor's
  own "submitted for review" emails.
- A row with `Contractor` = `ACC` gets **every** contractor's "submitted"
  emails — use this for whoever at ACC oversees both.

This sheet is the reviewer distribution list; nothing reads it for
anything else. If you leave it empty (or never create the sheet), the
"submitted for review" email is silently skipped — nothing breaks, nobody
just gets notified, same as before this patch. The "assigned" and
"approved" emails don't need this sheet at all — they go straight to
whoever's in the routine's own Assigned To field (which is why Patch 1's
real-account picker matters here too: a free-text name that isn't an
actual email address is silently skipped, same reasoning).

**Deploy**: same as always — save all files, then **Deploy → Manage
deployments → pencil icon → New version → Deploy**.

**Verify**: create a test routine assigned to your own email, confirm you
get the "assigned" email; submit it (with your own email in
`OL_NOTIFY_REVIEWERS` for that contractor) and confirm the "submitted for
review" email arrives; approve it and confirm the "approved" email
arrives. Check `Debug Log` in the sheet for a `notifyRoutine*` entry if
one doesn't show up — that'll say why (bad address, MailApp quota, etc.)
without having broken the actual routine action.

## 4g. Action Tracker "Assigned To" + aging digest

Part of the same plant-readiness pass as 4f: Action Tracker actions had no
owner at all — just a Contractor, never a specific person — so a problem
could sit "Open" indefinitely with nobody accountable for closing it.

**Sheet change you need to make yourself**: the "Action Tracker" sheet
needs one new column at the end (column **T**, right after the existing
"Last Modified" column) with the header text `Assigned To`. Nothing else
about the sheet's layout changes — every existing column keeps its exact
position. Until you add this header, the app still works exactly as
before; the new field just won't have anywhere to land.

**Code**: `Notifications.js` gained `sendAgingActionsDigest_()` this
round — replace its contents with the repo's current version (same file
from section 4f, just grown). No other backend file changed for this
patch; the frontend-side "Assigned To" picker and the "No owner
assigned"/"Xd overdue" badges on the Action Tracker board are all
frontend-only, already live once you push (see the top-level workflow —
this branch auto-deploys to GitHub Pages).

**New trigger you set up once** — same pattern as section 4e's
`generateDueRouteInstances`, a separate scheduled check, not tied to any
button in the app:

**Triggers (clock icon) → Add Trigger**:
- Function: `sendAgingActionsDigest_`
- Event source: Time-driven
- Type: Day timer (pick any off-peak hour)

Uses the same `OL_NOTIFY_REVIEWERS` sheet section 4f already has you
maintain — no second list to keep in sync. Once a day, each contractor
with at least one action open 14+ days gets one email to its reviewers,
split into "no owner assigned" (the most urgent) and "assigned but still
aging."

**Verify**: open the script editor, pick `sendAgingActionsDigest_` from
the function dropdown, click **Run** — check `Debug Log` and your inbox.
Safe to run any time; it never writes anything, only reads and emails.

## 4h. Oil Inventory low-stock digest

Oil Inventory's "Recorder Level" field has always been there — you set a
threshold per product — but nothing ever acted on it. The product list
already shows a "Low" badge when stock is at or under that threshold, but
only if someone happens to open the page and look.

**Code**: `Notifications.js` gained `sendLowStockDigest_()` this round —
replace its contents with the repo's current version. No sheet changes,
no new columns — this only reads the existing Current_Stock (a sheet
formula, read as-is) and Recorder_Level columns.

**New trigger you set up once** — same pattern as sections 4e and 4g:

**Triggers (clock icon) → Add Trigger**:
- Function: `sendLowStockDigest_`
- Event source: Time-driven
- Type: Day timer (pick any off-peak hour)

Uses the same `OL_NOTIFY_REVIEWERS` sheet sections 4f/4g already have you
maintain. Once a day, each contractor with at least one Active product at
or below its recorder level gets one email listing them, with current
stock and the threshold side by side. A product with no recorder level
set, an Inactive product, or a brand-new product with no stock movements
yet (so no computed stock number) are all correctly skipped.

**Verify**: open the script editor, pick `sendLowStockDigest_` from the
function dropdown, click **Run** — check `Debug Log` and your inbox. Safe
to run any time; it never writes anything, only reads and emails.

## 4i. Closing the generic-write contractor-ownership gap

Security hardening, not a new feature: the generic `append`/`updateRow`/
`deleteRow` actions (the low-level write path a few specific edits still
use — Data_Entry, Action Tracker, Equipment Registry) were already
permission-checked and sheet-allowlisted, but never checked WHICH ROW a
scoped caller (a Contractor Engineer) was touching. Every other write in
this backend (logOilChangeEvent, createRoutine, addOilProduct, …) already
verifies the row's contractor matches the caller's scope — these three
generic actions were the one gap. A Contractor Engineer using the app
normally was never exposed to this (the UI never lets them target another
contractor's row), so this closes a gap in defense-in-depth rather than a
gap someone could trip on by accident.

Also locks Equipment Registry's Contractor column specifically: a scoped
caller's `row` payload now has its Contractor value silently overwritten
with whatever the sheet already has, before the write — reassigning
equipment between contractors is meant to be its own deliberate action
(nothing in the app exposes this as a normal edit today), not something
that rides along on an unrelated field change.

**Code**: `Config.js`, `Rbac.js`, and `Code.js` all changed — replace all
three with the repo's current versions. No sheet or schema changes, no
new trigger — this is pure backend logic.

**Verify**: nothing to click through specially — every existing
add/edit/delete flow (samples, actions, the equipment interval editor)
should work exactly as before, since none of them were ever touching
another contractor's row to begin with. If you want to specifically
confirm the block works, you'd need to hand-craft a request with another
contractor's LP_ID as a scoped user — not something the UI can do.

## 4j. Sample_UID column (fixes the duplicate Sample ID problem)

`(equipmentCode, sampleId)` — the pair samples were always matched by —
isn't guaranteed unique in the live sheet: 42 real collisions were found
during the schema audit, since the lab reuses sample IDs across different
sampling dates for the same equipment. Editing or deleting one of those
could, in rare cases, hit the wrong row.

**Sheet change you need to make yourself**: the "Data_Entry" sheet needs
one new column at the very end — column **AN** (right after the existing
"Last Modified" column) — with the header text `Sample_UID`. Every sample
saved from now on gets a real, unique, app-generated id written there
automatically; a sample saved before this column existed just has it
blank and keeps matching the old way — exactly as ambiguous as it always
was, never worse, since there's no way to retroactively invent a unique
id for historical rows.

**Code**: frontend only — `parsers.js` and `api.js` changed, no backend
files. Also fixed a real, separate bug found while building this: editing
a sample's verify-read was comparing the sheet's own "Last Modified"
column, which the backend stamps fresh on every write regardless of what
the client sent — that comparison could never succeed, so editing a
sample was very likely throwing a false "wasn't confirmed saved" error on
every single edit (not new adds, only edits). Both fixes are already live
once you push — no Apps Script redeploy needed for this one.

**Verify**: edit any existing sample (via Equipment → a sample's Edit
button) and confirm it saves without an error toast — that confirms the
Last Modified fix. Add two new samples for the same equipment with the
same Sample ID but different dates (recreating the original collision
scenario), then edit or delete one of them and confirm only that one
changed.

## 4k. RBAC transitional fail-open closed

Security hardening: `hasPermission_` (Rbac.js) used to fail OPEN — grant
full write access — for two transitional cases: a request with no
session token at all, and a real logged-in session whose account hadn't
been assigned a role yet. Deliberate at the time (see RBAC Increment 5's
own notes) so nobody got locked out mid-rollout, while accounts were
still being set up. Confirmed directly by the user that every real
account now has a role, so both cases now fail CLOSED instead — a
request with no role can no longer write anything, though it can still
read (reads were never gated by this check, only by contractor scope).

**Code**: `Rbac.js` only — replace with the repo's current version.

**Verify**: every real account's normal workflow should be completely
unaffected, since everyone already has a role. If anyone reports being
suddenly unable to save something, check that their account actually has
a role assigned in Platform Core's Accounts panel — that's now a hard
requirement to write anything, not just a soft default.

## 4l. Equivalent oils

Answers a gap discussed earlier but not built until now: when the market
no longer carries the exact oil brand a piece of equipment is spec'd for,
there was no way to record a substitute without creating a second,
unmatched inventory product that auto-deduction and the forecast could
never find. Confirmed directly by the user: this is a simple pairing
(one product replaces ONE original spec, not a group of several
interchangeable brands), and any Contractor Engineer can declare it for
their own contractor's stock — no ACC approval needed.

**Sheet change you need to make yourself**: the "Oil Inventory" sheet
needs two new columns at the end — columns **R** and **S** (right after
the existing "Contractor" column) — with the header text
`EquivalentToType` and `EquivalentToBrand`. Blank for every existing
product (an exact match, same as always); only set on a NEW product
created through the "This replaces a different spec'd oil" checkbox in
Add Product.

**Code**: `OilInventory.js` (backend) and `parsers.js`/`api.js`/
`OilInventory.jsx` (frontend) all changed. Auto-deduction
(`tryAutoDeductInventory_`) and the consumption forecast
(`getOilInventoryForecast`) both now fall back to a declared-equivalent
product whenever the exact originally-spec'd brand isn't in that
contractor's own inventory — see `findInventoryProductRow_`'s own
comment in OilInventory.js for the two-tier (exact, then equivalent)
matching logic both now share.

**Known gap, not addressed here**: there's currently no "Edit Product"
UI anywhere in the app (the backend's `updateOilProduct` exists and is
wired up, but nothing calls it) — equivalence, like every other editable
Oil Inventory field, can only be set at creation time today. Worth its
own follow-up if correcting a declared equivalence later turns out to be
needed in practice.

**Verify**: create a product, check "This replaces a different spec'd
oil," pick an original spec from the dropdown, save. Then log an oil
change against equipment registered for that ORIGINAL spec (with no
exact-match product in inventory) and confirm the new product's stock
goes down, not nothing. Check the Forecast view shows that original
spec's projected demand matched against the new product's current stock.

## 4m. Visible audit trail

Previously, "who changed this and when" meant opening the raw Google
Sheet and reading a bare Last Modified timestamp — no who, and nothing
any normal user could get to from inside the app. This adds a real
"who changed what, when" feed, visible from a new Activity page in the
sidebar.

**Sheet created automatically**: a new "Audit Log" tab, created the
first time any write happens after this deploys (same self-creating
pattern as the existing "Debug Log" tab) — nothing to add by hand.
Columns: Timestamp, Sheet, RecordId, Action, ActingUser, Contractor,
Summary. One row per successful create/update/delete, written
alongside every write this backend already makes (append, updateRow,
deleteRow, and every named action — createRoutine, logOilChangeEvent,
addOilProduct, etc.). Deliberately a plain one-line description of
what happened, not a field-by-field before/after diff — this codebase
has no single column→header map that would make a generic diff
readable across every sheet, and a vague diff is worse than a clear
sentence.

**New endpoint**: `getAuditTrail` (GET), paginated and newest-first,
scoped to the caller's own contractor exactly like every other read —
a Contractor Engineer only ever sees their own contractor's activity.
Optionally narrowed to one `recordId` (an LP_ID, routine id, template
id, or product id) for "show me this record's history."

**New page**: Activity, in the sidebar (both the standalone app's own
sidebar and the unified platform shell's Oil Lubrication sub-tabs) —
a simple filterable, paginated feed.

**Also fixed in passing**: `deleteRouteTemplate` had no
contractor-ownership check at all — the one generic-write-style gap
Patch 5's own pass missed, since every other mutating action on a
route template already has one. Noticed while resolving the record's
contractor for its audit entry (the same lookup both needed), fixed
the same way as Patch 5's others: `requireContractorMatch_` before the
delete goes through.

**Code**: new `AuditLog.js` (backend); `Rbac.js` gained
`resolveLpContractor_`; `Code.js` wires `recordAudit_` into every write
branch and adds the `getAuditTrail` GET case. Frontend: new
`pages/Activity.jsx`; `parsers.js` gained `rowToAuditEntry`; `api.js`
gained `getAuditTrail`; `theme.js`'s shared badge color map gained
`create`/`update`/`delete`; both `Sidebar.jsx` (standalone) and
`frontend/src/navigation.ts` (unified shell) gained the "Activity" nav
entry.

**Verify**: make any save (add a sample, log an oil change, approve a
routine), then open Activity and confirm a new entry appears at the
top with the right record id, action type, and your own account's
email. Try the record-id filter against that same LP_ID/routine id and
confirm only its own entries show.

## 4n. Conflict detection on concurrent edits

Previously, two people editing the same sample or action at the same time
got silent last-write-wins: the generic update path replaces the whole
row from whatever the client last loaded, so the second save silently
erased the first one with no warning to either person.

**How it works**: every sample/action already carries a `lastModified`
value from whenever it was loaded (the backend stamps this on every write
already — nothing new there). Editing it now sends that value back as
`expectedLastModified`. The backend compares it to the row's LIVE Last
Modified value before applying the overwrite — if the live value is newer
(someone else's write landed in between), the write is silently skipped
rather than applied.

**Why "silently skipped" rather than a clear error from the backend**:
this app's writes are blind POSTs (`mode: "no-cors"` — see api.js's own
header comment on why), so the browser can't read the POST response body
at all; nothing short of switching that pattern entirely could change
that, which is a much bigger and riskier change than this patch. Instead,
this reuses the EXISTING verify-read-after-write safety net every other
write failure already goes through: when the write is skipped, the
verify-read comes back showing the row unchanged, which api.js's updated
mismatch handling now recognizes specifically as a conflict (comparing
the live row's Last Modified against what the edit started from) and
throws a `ConflictError` with a clear, specific message — distinct from
the generic "wasn't confirmed saved" error — instead of the usual
message. The existing optimistic-save rollback (Part 3 of the earlier
performance pass) already un-does the local edit and shows the error
toast with no changes needed there.

**Scope**: Action Tracker and Data_Entry (sample) edits — the two fully
wired "edit an existing record" flows in the app's UI today. The same
backend guard (`hasConflict_`, in Utils.js) was also added to
`updateOilProduct`, ready for whenever an Edit Product screen gets built
(see Patch 8's own flagged gap — nothing calls that action today, so
there's no frontend flow to test against it yet). Equipment Registry
edits go through the same generic path but aren't actually protected —
that sheet has no configured Last Modified column at all (its own
`modifiedDate` field is separate, sheet-native bookkeeping, not something
this backend stamps), so `hasConflict_` has nothing to compare against
there. Worth a follow-up if concurrent Equipment Registry edits turn out
to be a real problem in practice.

**Code**: `Utils.js` gained `hasConflict_` (compares via `compareDates`,
not string equality — Sheets doesn't always round-trip the stamped ISO
string back as identical text, see the function's own comment);
`Code.js`'s `updateRow` branch checks it before applying the write;
`OilInventory.js`'s `updateOilProduct` got the same guard. Frontend:
`parsers.js`'s `rowToSample` now exposes `lastModified` (previously
discarded — `rowToAction` already had it); `api.js` gained `ConflictError`
and `detectConflict`, and `saveAction`/`updateSample` send
`expectedLastModified` and throw `ConflictError` specifically on a
detected conflict.

**Verify**: open the same action (or sample) in two browser tabs, edit and
save in the first tab, then edit and save in the second — the second save
should show "Someone else changed this [action/sample] while you were
editing it," and the record should still show the FIRST tab's edit, not
the second tab's.

## 4o. Offline queueing for poor plant-floor connectivity

Previously, a save that failed because the device had no connectivity at
all behaved exactly like any other failure: the optimistic entry was
rolled back and an error toast shown, so a technician who entered a
sample or action while walking through a low-signal part of the plant
just lost it and had to redo it once they were back somewhere with
reception.

**Scope**: new-record writes only — adding a sample, adding an action,
logging an oil change. These are the three "something happened in the
field, write it down" actions a technician does while on the floor.
Edits/deletes aren't queued (uncommon from the floor, and an edit queued
for an unknown length of time would likely collide with Patch 10's
conflict detection by the time it finally syncs — new records don't have
that problem, there's nothing to conflict with yet). Bulk PDF import is
also out of scope — a desk/office workflow with its own progress UI, not
a single in-field entry.

**The key safety property**: this only ever queues a write when
`postBlind`'s own `fetch()` call rejects — meaning the request never even
reached the server (api.js's new `NetworkError`, thrown nowhere else). A
failure anywhere else in a save — the verify-read afterward, a detected
conflict — is deliberately NOT treated as safe to retry, since the
original write might already have gone through; blindly resubmitting it
could create a duplicate row (append has no dedupe key check). Verified
directly: `network_error_test.mjs` confirms a write whose POST succeeded
but whose verify-read then failed is never classified as a `NetworkError`.

**How it works**: a failed save (specifically a `NetworkError`) keeps its
optimistic entry on screen instead of rolling it back, tags it
`_pendingSync: true`, and persists the write (payload + the display
record itself) to a `localStorage` queue (`offlineQueue.js`) — so it
survives a page reload, not just an in-memory retry. The queue is
flushed: once immediately on load, again on the browser's own `online`
event, and periodically (every 30s) as a fallback, since `online` isn't
fully reliable on every device (e.g. "connected to wifi with no real
internet" often still fires it). A flush processes the queue in order; a
`NetworkError` on any item stops that pass right there (still offline);
any other error means that one write was genuinely rejected once it
reached the server — it's dropped (with its optimistic entry rolled back
and an explanatory toast) rather than retried forever, and the rest of
the queue still gets its turn.

**UI**: a small "N entries pending" badge, visible both standalone
(Sidebar) and embedded in the platform shell (TopBar — the one place
guaranteed to render in both modes, since the embedded build skips its
own Sidebar entirely). The existing Online/Offline indicator already in
TopBar (from before this patch) is a useful companion to this, not
something built here.

**Code**: `api.js` gained `NetworkError` (thrown by `postBlind` instead of
a generic `Error`). New `offlineQueue.js`
(enqueue/get/remove/count/reinject, all `localStorage`-backed). `App.jsx`:
`onAddAction`/`onSaveOilChange`/`onAddSample` queue instead of rolling
back on a `NetworkError`; new `flushOfflineQueue` + an effect driving it;
`reinjectPendingRecords` called after every full-sync replace (`runSync`,
the startup fetch) so a queued-but-not-yet-flushed entry doesn't
disappear from the screen in the gap before the next flush runs.
`Sidebar.jsx`/`TopBar.jsx` render the pending-count badge.

**Verify**: with devtools open, add a sample (or action, or oil change)
while the Network tab is set to "Offline" — confirm an info toast ("No
connection — saved on this device and will sync automatically") instead
of an error, the entry stays visible, and the pending badge appears.
Switch back to "Online" — within ~30s (or immediately after a manual
"Sync") confirm a "synced" toast, the pending badge clears, and the
record is really in the sheet.

## 4p. Hardening against direct sheet edits

Every write this backend makes goes through doPost — RBAC-checked,
contractor-scoped, conflict-checked (Patch 10), audit-logged (Patch 9).
None of that applies to anyone with Editor access to the actual Google
Sheet just typing into a cell directly; nothing in the app layer could
see or stop that. Two mitigations, one automatic and one opt-in:

**1. Detection (on by default, nothing to turn on)**: Apps Script's
`onEdit` simple trigger fires for a real edit made in the Sheets UI, but
never for a change this backend's own doPost makes via the
`SpreadsheetApp` service — so if it fires at all for a governed data
sheet, it's a human editing the raw sheet directly, not the app. Every
such edit is now logged to the Audit Log (action type `direct-edit`),
with the real editor's email when Sheets exposes it, and shows up in the
Activity page flagged in red as "Direct sheet edit" — so even without
blocking it outright, someone can no longer bypass the app invisibly.

**2. Prevention (opt-in, you run it yourself)**: a new function,
`protectDataSheetsFromDirectEdits()`, restricts direct editing of every
governed sheet to this spreadsheet's own owner — everyone else gets
view-only on those sheets in the Sheets UI itself. This is NOT wired to
run automatically on deploy, on a schedule, or from any trigger — it
changes real edit permissions on a spreadsheet people may be actively
using, and the right call depends on who, if anyone, currently has a
legitimate reason to edit the raw sheet directly.

**To run it**: open the Apps Script project (Extensions → Apps Script
from the Sheet), select `protectDataSheetsFromDirectEdits` from the
function dropdown next to the Run button, and run it. Strongly
recommended: try it on a COPY of the spreadsheet first (File → Make a
copy) to confirm it behaves the way you expect before running it against
the live production sheet — this is the kind of change that's awkward to
walk back at a distance if it blocks someone who turns out to need direct
access. Safe to run more than once: an already-protected sheet is left
alone, not given a second, redundant protection layer.

**Which sheets are covered** (`DIRECT_EDIT_WATCH_SHEETS`, Config.js):
Data_Entry, Action Tracker, Equipment Registry, Oil Change LOG, ROUTINES,
OA_ROUTINE_ITEMS, ROUTINE_TEMPLATES, Oil Inventory, Oil Inventory LOG —
every sheet this app's doPost actually writes real operational data to.
Deliberately excludes OL_ACTION_PHRASES (a low-stakes reference list) and
the Debug Log/Audit Log sheets themselves.

**Known gap**: contractor attribution on a logged direct-edit entry is
only resolved for sheets this backend already knows how to join to a
contractor (an LP_ID-keyed sheet via the Equipment Registry, or a sheet
with its own Contractor column) — every watched sheet has one or the
other, so this covers all of them, but a scoped Contractor Engineer only
sees a direct-edit entry in their own Activity feed when that
resolution actually lands on their own contractor; an unscoped ACC/Admin
account always sees every direct-edit entry regardless.

**Code**: `Config.js` gained `DIRECT_EDIT_WATCH_SHEETS`,
`DIRECT_EDIT_LP_COL`, `DIRECT_EDIT_CONTRACTOR_COL`. `SheetTriggers.js`
gained `logDirectEditIfTracked_` (called from the existing `onEdit`,
ahead of its pre-existing filter-row logic — unchanged) and the opt-in
`protectDataSheetsFromDirectEdits`. Frontend: `Activity.jsx`'s
`ACTION_LABEL` and `theme.js`'s badge color map both gained a
`direct-edit` entry.

**Verify (detection)**: open the raw Google Sheet and edit a cell
directly in one of the watched sheets' data rows — open the app's
Activity page and confirm a new "Direct sheet edit" entry appears,
flagged in red, with your account's email if Sheets exposes it.

**Verify (protection, only if you ran it)**: as a non-owner account, try
to edit a cell directly in one of the watched sheets — Sheets should
refuse the edit with its own "you need permission" message. The app
itself should be completely unaffected, since it never edits these
sheets as "you," always as the deploying account.

## 4q. Monthly Activity Summary report + CSV export

The Reports page already had four solid, well-designed PDF reports — but
all four show CURRENT state (what's open right now, what's overdue as of
today), which isn't the same question a monthly management review
usually asks: "what actually got done in September." None of the
existing four answer that, and none of them export anything but a fixed-
layout PDF. This adds both.

**New report — Monthly Activity Summary**: a fifth card on the Reports
page, scoped to a calendar month (a native month picker, defaulting to
the current month) and optionally one contractor. Shows samples taken,
oil changes performed, and actions closed DURING that month, plus the
current open-action backlog as of today (not period-filtered — a
backlog is "right now," not "this month," on purpose). Reuses the exact
same jsPDF building blocks (branding, tables, charts, footer) the other
four reports already use, so it looks and feels identical.

**CSV export**: a second button on this card, "Export CSV" — the same
period/contractor-scoped data as the PDF, as a plain CSV (not a true
`.xlsx`) so this needed no new dependency and no further bundle-size
cost. CSV opens directly in Excel with no friction, which covers the
real need just as well as a true spreadsheet file would — same kind of
pragmatic call already made elsewhere in this plant-readiness pass (e.g.
Patch 8's simple pairing instead of full equivalence groups).

**Code**: `reportGenerators.js` gained `collectMonthlyActivity` (the
shared period/contractor filter both the PDF and CSV paths use — one
place decides what counts as "this period"), `buildMonthlyActivitySection`
+ `generateMonthlyActivitySummary` (PDF), `monthlyActivityPreview` (the
card's live stat preview before generating), and `exportMonthlyActivityCsv`.
`Reports.jsx` gained the fifth card, a month-picker state, and a second
"secondary action" button slot on the shared `ReportCard` component.
`App.jsx` now also passes `samples` and `oilChangeEvents` (the raw,
per-event arrays — not the derived "current state" shapes the other
reports use) down to `Reports`, since a period report needs each
individual event's own date, not a collapsed "latest state" view.

**Verify**: pick a month with known activity, generate the PDF, and
cross-check its counts against the Dashboard/Action Tracker for that
period. Click Export CSV and open the file in Excel — confirm the three
section headers (SAMPLES TAKEN / OIL CHANGES PERFORMED / ACTIONS CLOSED)
and that switching the contractor filter actually changes which rows
appear.

## 4r. Admin-controlled email notification settings

Every email Notifications.js sends (Routine assigned/submitted/approved,
the daily aging-actions and low-stock digests) used to go out under
whoever's personal Google account owns this Apps Script deployment, with
no way to turn it off platform-wide. This adds an admin screen for both.

**Where**: Oil Lubrication → Settings → Configuration tab (password
`17593`, same gate as the rest of that tab) → "Email Notifications"
card, near the bottom.

**What it controls**:
- **Enable email notifications** — on/off for every email this app
  sends, platform-wide (not per-device). Off means nobody gets any of
  them, not just whoever flips the switch.
- **Notifications From (email)** — the address these emails should
  appear to come from, instead of a personal inbox.
- **Display Name** — the friendly name shown in the From line.

**IMPORTANT — a Google constraint, not a limitation of this app**: typing
an address into "Notifications From" is not enough on its own. For Google
to actually send AS that address, it must first be added and verified as
a "Send As" alias on the Gmail/Workspace account that owns this Apps
Script deployment:

1. In that Gmail account: Settings (gear icon) → **See all settings** →
   **Accounts and Import** tab → **Send mail as** → **Add another email
   address**.
2. Enter the reliability-app address (e.g. `reliability@arabiancement.com`)
   and follow Google's verification step (a confirmation email/link).
3. Once verified, the From field here will actually take effect.

Until that's done, Google silently keeps sending from the deploying
account's own address no matter what's configured here — the **Display
Name** still changes immediately with no alias needed (most inboxes show
it instead of the raw address at a glance), but the underlying address
won't change until the alias is verified.

**Who can change it**: gated to real Admin accounts (ROLE-ADMIN in the
Platform Core session) — the server rejects a save from anyone else
(`requireAdmin_`, Rbac.js) regardless of what the UI shows. A
non-admin viewing this card sees it read-only with an explanatory note,
rather than being able to attempt a save that will just fail.

**Code**: `Rbac.js` gained `requireAdmin_`. `Notifications.js` gained
`getNotificationSettings_`/`updateNotificationSettings_` (stored in
Script Properties, not a sheet — small, rarely-changed global config, not
something anyone needs to browse/filter the way the
OL_NOTIFY_REVIEWERS distribution list is) and `sendNotificationEmail_`,
which every one of the five existing `MailApp.sendEmail` call sites now
goes through instead of calling it directly. `Code.js` gained the
`getNotificationSettings` GET case and the admin-gated
`updateNotificationSettings` POST action. Frontend: `api.js` gained
`getNotificationSettings`/`updateNotificationSettings`; `Settings.jsx`
gained the `NotificationSettingsCard` component, reads the session's
roles via `useSession()` (SessionContext.jsx) to decide whether to allow
editing.

**No stored value yet = notifications ON** when this patch first shipped —
**as of 4s below, it's the opposite**: a fresh deployment now defaults to
email OFF, since the in-app bell is the primary channel and nobody asked
for a personal inbox flooded by default. An admin who already saved a
value (on or off) before 4s keeps that exact value — only a never-touched
install changes behavior.

**Verify**: as an Admin, open the card, confirm it loads the current
state, toggle it off, save, and confirm (e.g. by approving a routine)
that no email goes out. Turn it back on, set a Display Name, save, and
confirm a real notification shows that name in the From line. As a
non-admin account, confirm the card shows read-only with the explanatory
note instead of editable fields.

## 4s. In-app notification bell (platform-wide, not just Oil Lubrication)

A bell in the platform shell's top-right corner, visible on every screen
(Dashboard, My Work, Settings, both embedded modules) — not something you
have to be inside Oil Lubrication to see. Fires on the exact same five
events 4f/4g/4h's emails already cover (routine assigned/submitted/
approved, aging-actions digest, low-stock digest); no new trigger types.
Unlike email, it is never gated by the Email Notifications toggle in 4r —
it's always on, since it's now the primary channel (see 4r's default-flip
note above).

**Where it lives**: `frontend/src/components/NotificationBell.tsx` (shell-
level, mounted once in `App.tsx`'s `ShellRoot`) reads straight from the Oil
Lubrication backend via `frontend/src/api/oilLubrication.ts` — the same
direct-to-`OIL_ANALYSIS_URL` client My Work's native routine list already
uses — rather than living inside the embedded Oil Lubrication app itself.
That's deliberate: every event today happens to originate there, but the
bell is a platform concept, not an Oil-Lubrication-page concept, so it
stays visible no matter which tab is open. Not shown for a Technician-only
account — `TechnicianShell` was already deliberately stripped down to just
My Work with no other chrome, and this doesn't change that.

**Clicking a notification**: marks it read (optimistic — the bell's own
next poll self-corrects if the blind "mark read" POST silently fails, same
spirit as every other best-effort write in this codebase) and navigates to
where it's about:
- A routine-related notification (assigned/submitted/approved) deep-links
  straight into **that specific routine's** detail view — not just the
  Routines list. This needed a small navigation extension: `embeddedNav.tsx`'s
  `navigateTo(moduleId, pageId)` gained an optional third `recordId` arg,
  threaded through to the embedded app's own `navBridge.navigate(pageId,
  recordId)`; `apps/oil-analysis/src/App.jsx`'s internal `navigate()` now
  stores that id and passes it to `Routines.jsx` as `initialRoutineId`,
  which opens `RoutineDetail` directly on mount (same pattern
  Equipment/OilReportSearch already use for "arrived wanting one specific
  record" via `initialCode`).
- A digest notification (aging actions / low stock) lands on the relevant
  list page itself (Action Tracker / Oil Inventory) — a digest covers
  multiple records, so there's no single one to deep-link to.

**Code**:
- `backend/oil-lubrication/src/InAppNotifications.js` (new) — the sheet
  `OL_IN_APP_NOTIFICATIONS` (self-creating, same pattern as `AuditLog.js`'s
  Audit Log), `recordInAppNotification_`/`recordInAppNotificationForEach_`
  (one row per recipient, so each reviewer's read state is independent even
  when several of them get the same digest), `getInAppNotifications_`
  (scoped strictly to the caller's own email — personal, like the email it
  parallels, never contractor-wide), `markInAppNotificationRead_`
  (ownership-checked — a notification can only be marked read by the email
  it's addressed to) and `markAllInAppNotificationsRead_`.
- `Notifications.js` — each of the five existing notify functions
  (`notifyRoutineAssigned_`, `notifyRoutineSubmitted_`,
  `notifyRoutineApproved_`, `sendAgingActionsDigest_`,
  `sendLowStockDigest_`) now also calls into InAppNotifications.js,
  unconditionally (not gated by `notify_email_enabled`). Also where the
  settings default flipped — see 4r's updated note above.
- `Code.js` — new `getInAppNotifications` GET case (scoped by
  `auth.session.email`, empty for an anonymous request) and
  `markNotificationRead`/`markAllNotificationsRead` POST actions (no
  `requirePermission_`/contractor check needed — ownership is enforced
  inside `markInAppNotificationRead_`/`markAllInAppNotificationsRead_`
  themselves, by email, so any logged-in user may call these for their own
  notifications only).
- `frontend/src/api/oilLubrication.ts` — `getInAppNotifications`,
  `markNotificationRead`, `markAllNotificationsRead`.
- `frontend/src/embeddedNav.tsx`, `apps/oil-analysis/src/App.jsx`,
  `apps/oil-analysis/src/pages/Routines.jsx` — the record-level deep-link
  plumbing described above.
- `frontend/src/components/NotificationBell.tsx` + `.css` (new) — the bell
  itself; polls every 60s plus once on mount.

**Nothing new to deploy in Apps Script beyond what 4f/4g/4h/4r already
need** — `InAppNotifications.js` is a new file to add to the Apps Script
project alongside the rest of `backend/oil-lubrication/src/`, same as any
other patch in this guide; the `OL_IN_APP_NOTIFICATIONS` sheet creates
itself on first use, nothing to pre-create by hand.

**Verify**: as a user with at least one notification addressed to their
email (e.g. assign yourself a routine), confirm the bell shows an unread
badge on login, the dropdown lists it, clicking it opens that exact
routine's detail view and the badge count drops by one; confirm "Mark all
read" clears the badge entirely; confirm a second account's unread
notifications are unaffected by the first account's mark-read actions.

## 4t. Contractor auto-lock + wider Assign Technician/Assigned To pickers

Two gaps in how a Routine or Action gets tied to a contractor and a real
account:

1. **The Contractor field was always a free manual dropdown**
   (New Route / Edit Action), even for a logged-in RHI or ASEC account —
   whose `equipmentRegistry` only ever contains their own contractor's
   equipment anyway (scoped server-side, see Rbac.js's
   `getContractorScope_`). The dropdown was never a real choice for them,
   just a field that happened to already get overwritten by equipment
   autofill. For such an account it's now a locked, read-only label
   instead — set automatically from their own session, not something they
   can get wrong. An ACC/Admin account (not tied to one contractor) still
   gets the manual dropdown, since an action/routine genuinely can belong
   to either contractor for them.
2. **"Assign Technician" on Routines only ever listed `ROLE-TECH`
   accounts** (`TechnicianPicker.jsx`'s own default), unlike Action
   Tracker's "Assigned To" which already passes `roleFilter={null}` to
   include Contractor Engineers too. Widened New Route and the
   "assign technician to an Unassigned routine" picker on Routine Detail
   to match — a routine can reasonably be assigned to a Contractor
   Engineer, not only a literal Technician account.

Both only matter once real accounts actually exist for RHI/ASEC to list —
see `TechnicianPicker.jsx`'s own file comment, and the "Testing with one
account per role" note under §2 above if you need test accounts to see
this working end to end.

**Code**: `SessionContext.jsx` gained `useSessionContractor()` (reads the
logged-in session's `orgId`, maps `ORG-RHI`/`ORG-ASEC` → `RHI`/`ASEC`,
same scheme `Rbac.js`'s `ORG_TO_CONTRACTOR` uses server-side; `""` for an
ACC/Admin account or a standalone build with no session). `NewRoutine.jsx`
and `EditActionModal.jsx` both read it to swap their Contractor `<select>`
for a locked label when non-empty, and default their contractor state to
it. `NewRoutine.jsx` and `RoutineDetail.jsx`'s `TechnicianPicker` calls
both gained `roleFilter={null}`.

**Verify**: log in as one of the RHI/ASEC sample test accounts (§2's
note), open New Route (or Add Action) and confirm Contractor shows as a
fixed "RHI"/"ASEC" label, not a dropdown, and that Assign Technician/
Assigned To lists both that contractor's Technician and Contractor
Engineer sample accounts — never the other contractor's. Log in as the
ACC Admin sample account and confirm Contractor is still a normal RHI/ASEC
dropdown there.

## 5. What's still open after this

- **Vibration Analysis backend**: not started — needs its own
  requirements/schema pass like Oil Analysis got, before any Apps Script
  code is written for it.
- **Lab report data entry into `OA_SAMPLES`**: `approveRoutine_` creates a
  `Pending`-status sample row when a Routine's Sample item is approved,
  but there's no function yet to fill in the actual chemistry results once
  the lab report comes back. That's a real gap, not an oversight — it
  needs its own quick round (who's allowed to enter it: Contractor
  Engineer? Reliability Engineer? both?) before it's built.
- **Routine rejection**: the confirmed workflow only has
  Submitted → Approved; there's no "send back to technician with a reason"
  path. If that turns out to be needed in practice, it needs a schema
  decision (where does the rejection reason get stored?) before it's coded.
- **RBAC permission rows** beyond App Admin's wildcard: `ROLE_PERMISSION`
  only has App Admin seeded. The Oil Analysis backend enforces its own
  role checks directly (Technician/Contractor Engineer/Manager/ACC) rather
  than going through that table, which is fine for now but means
  `ROLE_PERMISSION` isn't actually wired to anything yet.
- **Frontend gaps**: login, the shared app shell, and the full Oil
  Analysis workflow (LP register, Routines create/execute/submit/approve/
  comment) are now built (single-app integration, Option B). Still
  missing: the multi-palette theme switcher (spec §1a) — the app uses one
  fixed light theme for now; offline/PWA sync (`idb` is a dependency but
  nothing uses it yet — every screen requires a live connection); LP
  register admin editing UI (the backend supports it —
  `createLpPoint_`/`updateLpPoint_` — but there's no screen for it yet,
  App Admins would need to edit the Sheet directly); and lab-report entry
  once that's designed (see above). Vibration Analysis stays a plain
  external link in the sidebar until its own backend exists.
- **Technician-org cross-check**: `createRoutine_` trusts the creator's
  own org match but can't independently verify the *assigned* technician
  belongs to that same contractor (Oil Analysis has no access to Platform
  Core's `USERS` sheet) — noted in `Routines.js`. Low risk since only
  Contractor Engineers/Managers can create Routines in the first place,
  but worth knowing if something looks off in practice.

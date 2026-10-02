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

## 4u. SECURITY FIX — contractor isolation was broken on every first load

**Confirmed directly by the user, testing with the sample RHI/ASEC
accounts from §2: an RHI account could see ASEC's equipment (and, until
the next sync, every other contractor's data) across the app.** Root
cause and fix below; no Apps Script redeploy needed — this was entirely a
frontend bug.

**Mechanism**: `App.jsx` used to set the shell's session token on the api
client (`api.setSessionToken`) inside a `useEffect`. `AppShell` — a CHILD
of that same component — has its own mount effect that immediately fires
`getStartupBundle`, the one request that loads equipment, samples,
actions, oil changes and the sample tracker all at once. React always
runs a child's effects before its parent's on mount (confirmed directly
with an isolated test, not assumed) — so `AppShell`'s request was
**guaranteed** to fire before `App`'s effect had set the session token.
Every single mount, not intermittently.

A `getStartupBundle` request with no `sessionToken` isn't rejected by the
backend — `checkAuth_` (Auth.js) treats a missing token as an anonymous-
but-valid request (given a correct shared secret) and returns
`{ok: true, session: null}`. With `session: null`, `getContractorScope_`
returns `null` — "no contractor filter, show everything" — so that first
load came back completely unscoped for every account, RHI or ASEC alike.

Samples/actions/oil changes self-correct on the next sync (manual "Full
Sync" or the periodic incremental poll both fire long after this race
window, so they carry the token fine) — but the **Equipment Registry is
only ever fetched by that one racing call**; nothing else re-fetches it
automatically. So it stayed permanently unscoped for the whole session,
and got written into `localStorage` that way too, surviving into the next
page load — explaining why it looked like it was broken "everywhere,"
not just on first load.

**Fix**: moved `api.setSessionToken(session?.token || null)` out of the
`useEffect` and into `App()`'s render body directly. React always
finishes the entire render pass — parent AND every child — before running
any effect at all, so this guarantees the token is set before `AppShell`'s
mount effect can ever fire, regardless of effect ordering. Safe to call
unconditionally on every render: `session` is only ever set once at mount
by the embedding shell and never changes afterward (see
`EmbeddedOilAnalysis.tsx`), so this is idempotent.

**Verified** with a Playwright pass simulating the real backend's
scoping behavior: before the fix, the very first `getStartupBundle`
request had no `sessionToken` param; after the fix, every request —
including the very first — carries it, and a logged-in RHI test account
sees only RHI equipment (LP-101 in the test fixture), never ASEC's
(LP-201).

**Nothing to redeploy on Apps Script** — `App.jsx` is a frontend file
only; rebuild and redeploy the frontend/embedded bundles as usual.

**Worth a follow-up, not done here**: the backend's `checkAuth_` still
treats a request with no session token (given the shared secret) as
valid-but-unscoped for every READ. That fallback made sense while a
standalone, no-login deployment existed; that was retired. Now that every
real client always logs in, this is a looser-than-necessary backend
default — worth tightening to fail closed on reads with no session,
independent of this frontend fix, as defense in depth rather than relying
solely on the frontend always sending the token correctly.

## 4v. Oil Top Up LOG (Patch 17) — foundation for Emergency Top Up

New, separate history for ad-hoc oil top-ups (leakage, low level, seal
issue — anything reactive, not a scheduled change), tracked apart from
Oil Change LOG rather than folded into it — confirmed directly by the
user. This patch is just the storage + logging primitive; the Emergency
Top Up route type that actually produces these entries is a separate,
later patch.

**Code**: new `TopUps.js` — `logOilTopUp_` (mirrors `logOilChangeEvent`'s
shape and conventions, OilChanges.js) and `getTopUpsForLp`. `Code.js`
gained the `getTopUpsForLp` GET case and the `logOilTopUp` POST action
(same permission/contractor-match/audit pattern as `logOilChangeEvent`).
Frontend: `parsers.js` gained `rowToTopUpEvent`; `api.js` gained
`logOilTopUp`/`getTopUpsForLp` (same blind-POST-then-verify-read pattern
as every other write in this app).

**Deliberately different from Oil Change LOG in one way**: quantity is
never defaulted from the registry's `Lubricant_Quantity_L` — a top-up is
normally a partial amount, and silently assuming a full change's worth
would overstate how much is deducted from Oil Inventory. The caller must
supply a real `quantityUsed`.

**Inventory deduction**: reuses the exact same `tryAutoDeductInventory_`
path a regular oil change uses (confirmed directly by the user: a top-up
draws down stock exactly like a change does, just usually a smaller
quantity) — no new inventory logic needed.

**Nothing to pre-create in the Sheet** — `Oil Top Up LOG` is a brand new
tab with no equivalent in the original workbook, so (unlike Oil Change
LOG, which assumes it already exists) this self-creates with the right
header row on its first write, same pattern Patch 9's Audit Log and
Patch 15's `OL_IN_APP_NOTIFICATIONS` already use.

**Verify**: log a top-up for an LP with a valid Oil Inventory product
match, confirm a new `Oil Top Up LOG` row appears with the right Reason/
RequestedBy/quantity, and confirm an `Issue` movement for that same
quantity appears in `Oil Inventory LOG` against the matching product.

## 4w. Emergency Top Up route type (Patch 18)

A third route type alongside Oil Change/Sampling, for an urgent, reactive
top-up (leakage, low level, seal issue) — confirmed directly by the user
during design review. Always single-equipment (never a batch) and always
one-time (never recurring), but goes through the exact same Assign ->
Submit -> Approve workflow every other routine does. Approval logs an
**Oil Top Up LOG** entry (Patch 17) instead of an Oil Change LOG one, and
deducts from Oil Inventory the same way.

**Where**: New Route -> Route Type -> "Emergency Top Up". The form adapts:
Frequency and the "Filters & Suggestion" card disappear (don't apply to
picking one specific piece of equipment), a required **Reason** field
appears, "Select All" disappears, and picking equipment from the table
becomes single-select — choosing a different row replaces the previous
pick rather than adding to it.

**Code**: `Routines.js`'s `createRoutine` accepts `routeType ===
"Emergency Top Up"`, validates exactly one item and a non-blank `reason`,
and stores it in **ROUTINES' new trailing column 16 (Reason)** — blank
for every other route type. Item type for this route is `"TopUp"`,
distinct from `"Change"`/`"Sample"`. `NewRoutine.jsx` adapts the form as
above. `RoutineDetail.jsx`'s `applyApprovalSideEffects` gained an
`Emergency Top Up` branch calling `api.logOilTopUp` (quantity from the
item's own `actualQuantity`, same field the checklist already captures)
instead of `api.logOilChangeEvent`.

**IMPORTANT — column shift**: adding Reason as ROUTINES' column 16 means
the two columns `getRoutines()` appends after the real row (ItemsTotal,
ItemsDone) moved from index 16/17 to **17/18**. Both frontend row parsers
(`apps/oil-analysis/src/parsers.js`'s `rowToRoutine` and
`frontend/src/api/oilLubrication.ts`'s own copy) were updated together —
if you ever add another trailing ROUTINES column, update both of these,
or the item progress bar will silently show wrong/blank counts.

**Verify**: create an Emergency Top Up routine as a Contractor Engineer,
confirm it rejects more than one equipment and a blank reason, confirm
the created routine shows Reason correctly; submit its one item with a
quantity and approve it; confirm an `Oil Top Up LOG` row appears (not
`Oil Change LOG`) and Oil Inventory is deducted by that quantity.

## 4x. ACC equipment-first contractor derivation (Patch 19)

An ACC/unscoped account creating a one-time route (Oil Change, Sampling,
or Emergency Top Up) no longer picks a Contractor from a dropdown up
front — confirmed directly by the user during design review. Instead:
the equipment table shows both contractors' candidates at once; the
moment they pick (or Select All adds) their first piece of equipment,
Contractor locks to that equipment's own contractor and the candidate
list narrows to just that contractor, so a second, conflicting-contractor
pick is never even offered. Clearing the selection back to zero unlocks
it. An RHI/ASEC-scoped account is unaffected (already locked from mount,
Patch 16). A **recurring** route template still uses a real manual
Contractor dropdown for an ACC account — a template has no equipment list
to derive a contractor from at creation time (it's defined by Area/Oil
Type filters instead), so this one case keeps the old picker.

**Code** (all `NewRoutine.jsx`): `contractor` state now starts at `""`
for an ACC account (was defaulted to `"RHI"`); `toggleRow`/
`selectAllShown` lock it on first add; a small effect unlocks it back to
`""` once the one-time-route selection empties. The pre-existing "re-
apply the suggestion preset when contractor changes" effect **no longer
watches `contractor`** — only `routeType` — specifically so a manual
equipment pick never gets silently wiped out by the preset re-running
right after it locks the contractor (this was a real interaction bug
during implementation, caught before shipping: the old effect would fire
immediately after the lock and replace the just-picked equipment with
whatever the current suggestion preset selected instead).

**Verify**: as an ACC/Admin account, open Create Route (not recurring),
confirm Contractor shows "Set automatically once you pick equipment
below" and the table lists both RHI and ASEC equipment; pick one RHI row,
confirm Contractor now shows "RHI" and ASEC rows disappear from the
table; Clear Selection, confirm it unlocks and ASEC rows reappear. Switch
Frequency to Monthly/Quarterly and confirm Contractor becomes a real
RHI/ASEC dropdown again.

## 4y. Unified Routines overview — backend (Patch 20a)

Backend half of the Routines main-view redesign agreed during design
review: recurring templates become the primary list, each with a
computed Equipment Count / Next Due Date / Status / Last Completed, and a
standalone one-time routine (not generated from any template) shows up
as its own row in the exact same list — "each line on the table view is
for a routine," the user's own words. A template-generated instance does
NOT get its own top-level row; it's reached by drilling into its parent
template (frontend half, a later patch).

**Code**: new `getRoutinesOverview(scope)` in `RouteTemplates.js`. For
each `ROUTINE_TEMPLATES` row: `equipmentCount` is a fresh count against
the live Equipment Registry (not cached — reflects reality even if
equipment changed since the template was made); `nextDueDate` is simply
the template's own `NextGenerateDate`; `dueStatus` is `"Paused"` for a
paused template (its due date is stale/meaningless until resumed),
otherwise `"Overdue"` / `"Due Soon"` (≤7 days) / `"On Schedule"` from
comparing that date to today; `lastCompleted` is the most recent
`ApprovedDate` among `ROUTINES` rows whose `SourceTemplateId` matches.
For each standalone `ROUTINES` row (`SourceTemplateId` blank):
`frequency` is always the literal string `"One-time"` (there's no stored
frequency on a routine itself); `dueStatus` is `"Completed"` if already
Approved, otherwise the same Overdue/Due Soon/On Schedule comparison
against its own `DueDate`; `equipmentCount` comes from its own
`OA_ROUTINE_ITEMS` rows. New `Code.js` doGet case `getRoutinesOverview`.

**Verify**: hit `?action=getRoutinesOverview` directly (or via the old
UI's network tab until the new frontend view ships) and confirm the
counts/statuses match what you'd expect for a few real templates and
routines — a template-generated instance should never appear by its own
RoutineId in the response.

## 4z. Unified Routines overview — frontend (Patch 20b/20c)

Frontend half of the Routines main-view redesign — consumes
`getRoutinesOverview` (Patch 20a) to replace the old flat "every routine
instance" list with the agreed "templates become the main view"
architecture, confirmed via AskUserQuestion during design review.

**`apps/oil-analysis/src/pages/Routines.jsx`** — fully rewritten:

- **Overview** (new default landing view, `view === "overview"`): one
  table mixing `kind: "template"` and `kind: "routine"` rows from
  `getRoutinesOverview`, each showing Routine Name / Equipment Count /
  Frequency / Next Due Date / Status / Last Completed — "each line on the
  table view is for a routine," matching the user's own framing, just
  with recurring templates and standalone one-time routines sharing one
  list instead of two. Four clickable KPI cards (Total/On Schedule/Due
  Soon/Overdue) double as quick filters; an Area dropdown (no Line/Equipment
  Type filter — explicitly dropped during review) and a name/id search box
  sit alongside the per-status filter buttons.
- **Template Detail** (`view === "templateDetail"`, new): clicking a
  `kind: "template"` row drills into that one template's own generated
  `ROUTINES` instances (fetched via the existing `getRoutines` and filtered
  client-side by `sourceTemplateId`) — this view reuses the old flat list's
  KPI-card/status-filter/table rendering, just scoped to one template, and
  folds in the Pause/Resume/Delete actions that used to live in the
  removed `RouteTemplatesPanel` collapsible as header-level buttons next to
  the template's name.
- **Routine Detail / New Routine**: unchanged components, just rewired —
  a `kind: "routine"` overview row, or a row inside Template Detail, opens
  `RoutineDetail` directly; its Back button returns to Template Detail if
  the user drilled in from one, otherwise to the Overview.
- `RouteTemplatesPanel` (the old separate collapsible template list) and
  the old flat "list" view are both removed — fully superseded by the
  above two views.

**`apps/oil-analysis/src/api.js`**: new `getRoutinesOverview(webhookUrl)` —
GET `?action=getRoutinesOverview`, returns `json.items` as-is (already
plain JSON objects from the backend aggregation, not raw sheet rows, so no
`parsers.js` row-mapping is needed here unlike `getRoutines`).

**Dependency**: `recharts` (`^3.10.1`) added to
`apps/oil-analysis/package.json` in preparation for the charts/"Next 7
Days Due" panel (Patch 20d, not yet built) — not used by this patch itself.

**Verify**: open Routines — the overview should load with KPI cards and
the mixed template/routine table; clicking a recurring template's row
should open its own instance list with working Pause/Resume/Delete
buttons and a working Back button; a template-generated instance must
never show up as its own row on the Overview, only inside its parent
template's drill-down.

**Still open (Patch 20d, not yet built)**: the 3 charts (Upcoming Oil
Changes stacked bar, Routines by Area donut, Completion Rate Trend using
the agreed item-weighted formula) and the "Next 7 Days Due" side panel.

## 4aa. Oil Inventory monthly consumption — backend (Patch 21)

Backend for the Oil Inventory redesign's "Consumption" tab (design review:
Oil Inventory becomes a 5-tab page — Overview/Stock List/Consumption/
Forecast/Movements, Reorder Requests dropped). Distinct from
`getOilInventoryForecast` (Patch pre-existing, projects FUTURE need from
registry intervals): this is ACTUAL historical usage, as logged.

**Code**: new `getOilInventoryConsumption(monthsParam, scope)` in
`OilInventory.js`. Sums "Oil Inventory LOG" rows with `MovementType ===
"Issue"` (both auto-deducted ones from logged oil-change/top-up events and
manual Issues — Receipt/Adjustment never count as consumption), bucketed
by calendar month, for each product in scope, over a trailing window
(`months` param, default 6, capped at 24). Returns `{ months: [...
"YYYY-MM" labels, oldest first], byProduct: [{ productId, lubricant,
lubricantBrand, contractor, monthly: [...], total, averageMonthly }, ...],
totalsByMonth: [...] }` — `byProduct` only includes products with nonzero
consumption in the window (an all-zero row would just clutter the chart).
`totalsByMonth` is the scoped aggregate per month, for the tab's own
top-of-page trend chart; `byProduct` feeds both a per-product breakdown
table and (via `OilProductDetail`, a later patch) a per-product history
chart. New `Code.js` doGet case `getOilInventoryConsumption`.

**Verify**: hit `?action=getOilInventoryConsumption&months=6` and confirm
the month labels run oldest-to-newest ending at the current month, and
that a product with only Receipt/Adjustment movements (no Issues) is
correctly excluded from `byProduct`.

## 4ab. Forecast hybrid model — condition-based fallback (Patch 22)

Closes the gap flagged during design review: `getOilInventoryForecast`'s
"registry intervals x quantity" baseline has nothing to project for
condition-based equipment (`Oil_Change_Interval` blank/"As needed"/"If
needed" — changed by oil analysis results and actions, not a fixed
schedule), so those LPs previously contributed either a single "open
routine" occurrence or nothing at all, every single time, regardless of
how often they're actually changed in practice. Scheduled (has-interval)
equipment's forecast is completely unchanged by this patch.

**Code**: `OilInventory.js`'s `getOilInventoryForecast` now builds a
second per-LP map, `historyCountByLp` — how many Oil Change LOG events
each LP had in the trailing 12 months (alongside the pre-existing
`lastEventByLp`, same single pass over the log). For a condition-based LP
(`intervalMonthsForOilChange_` returns null): if it has any logged history
in that window, its contribution uses a historical-average rate —
`(historyCount / 12) x months` — instead of a registry interval that
doesn't exist for this equipment type. If it has zero logged history, the
existing "open Oil Change routine already targets it" check still applies
(known, real demand); failing that, the LP is NOT silently skipped —
it's added to a new `insufficientHistory` array in the response (`code`,
`area`, `contractor`, `lubricant`, `lubricantBrand`), so the forecast's
silence on that equipment is visible rather than indistinguishable from
"this equipment needs nothing right now."

**Verify**: for a condition-based LP with several logged Oil Change LOG
events inside the last 12 months, confirm its forecast contribution scales
with `?action=getOilInventoryForecast&months=N` for different N (the rate
is per-month, so doubling N should roughly double its contribution). For
a condition-based LP with zero logged history and no open routine, confirm
it appears in `insufficientHistory` instead of just being absent from
`forecast`.

**Still open**: the frontend Forecast tab (Patch 24) needs to actually
surface `insufficientHistory` — a flagged equipment list or a small callout
— rather than leaving it in the response unused.

## 4ac. Oil Inventory redesign — Movements endpoint + 5-tab frontend rebuild (Patch 23/24)

Closes out the Oil Inventory redesign agreed during design review: a
5-tab page (Overview/Stock List/Consumption/Forecast/Movements —
"Reorder Requests" dropped; a low-stock list already covers that need
without a separate approval-style tab duplicating the same record).

**Backend (Patch 23)**: new `getAllOilInventoryMovements(scope)` in
`OilInventory.js` — the Movements tab's own unified ledger across every
product, as opposed to the pre-existing `getOilInventoryMovements`
(still used by `OilProductDetail`, scoped to one product). Scoped
directly off each LOG row's own Contractor column rather than joining
back to Oil Inventory, since every logged movement already carries its
own contractor. New `Code.js` doGet case `getAllOilInventoryMovements`.

**Frontend (Patch 24)**: `apps/oil-analysis/src/pages/OilInventory.jsx`
rebuilt around a `TabBar` + 5 tab components, replacing the old flat
list + separate "Forecast" sub-view:

- **Overview** (new, default landing tab): 4 KPI cards (Total Products,
  Low Stock, This Month's Consumption, Open Shortfalls over a 3-month
  window), a 6-month consumption trend area chart (Recharts, from
  Patch 21's `getOilInventoryConsumption`), and a Low Stock quick table.
- **Stock List**: the original flat product list, search, and Add
  Product button — unchanged behavior, just relocated into its own tab.
- **Consumption** (new): a months selector (3/6/12), a bar chart of
  total consumption per month, and a per-product breakdown table sorted
  by total descending — both from Patch 21's aggregation.
- **Forecast**: the existing projected-need table, PLUS (closing the
  Patch 22 follow-up) a callout listing every equipment in
  `insufficientHistory` — condition-based equipment with no logged
  history to project from. Required also fixing `api.js`'s
  `getOilInventoryForecast`, which was silently dropping
  `insufficientHistory` from the backend response before this patch —
  caught via a Playwright assertion that the callout wasn't rendering
  despite the mocked backend response carrying it.
- **Movements** (new): the unified ledger from Patch 23, joined
  client-side against the already-fetched product list for
  lubricant/brand display, with a movement-type filter (All/Receipt/
  Issue/Adjustment) and a search box. Capped at displaying the first 200
  matching rows with a "narrow your filter" note, so an old plant with a
  long history doesn't render an unbounded table.

Recharts (`^3.10.1`, added to `package.json` in Patch 20's prep) is now
actually used — `AreaChart` for the Overview trend, `BarChart` for
Consumption — both themed off the active theme's own `accent`/`border`/
`textSecondary` tokens via a shared `ChartTooltip` component, so they
follow whichever of the (now 10, soon 11 — Patch 27) themes is active
rather than being hardcoded to one palette.

**Verify**: open Oil Inventory — Overview should load with KPI cards and
a trend chart; Stock List/Consumption/Forecast/Movements should each
load their own data on first click (not all fetched eagerly up front);
a condition-based LP with no logged history should show up in the
Forecast tab's callout, not just be silently absent from the table.

## 4ad. Routines: route-type tabs + charts + Next 7 Days panel (Patch 20d)

Closes out the Routines redesign against the reference mockup, point by
point, per the user's explicit review: route-type tabs ("tab for all
routines, and split in the oil analysis sampling and emergency top up"),
and the 3 charts + side panel previously flagged as "still missing."

**Route-type tabs**: `ROUTE_TYPE_TABS` = All Routines / Oil Sampling /
Emergency Top Up, each with a live count badge. Oil Change isn't its own
tab — it's the bulk of "All Routines" by default, matching the user's own
framing. Selecting a tab scopes EVERYTHING below it (KPIs, Area dropdown
options, the table, all 3 charts) to that route type — `routeTypeItems`,
derived from `overviewItems`. The Area/Status filter row and search box
were explicitly left untouched ("wait for me to ask you").

**Backend (new)**: `getRoutineCompletionTrend(months, scope)` in
`RouteTemplates.js` — the one chart that needed real backend support, the
other two are computed client-side from already-fetched overview data.
Item-weighted rate per month (the formula agreed during design review):
for routines due in a given month, rate = (LP items completed ON TIME) /
(total LP items), summed across those routines — not a binary per-routine
count. "On time" = an item's own ActualDate, date-only, on or before its
routine's DueDate. A month with zero routines due returns `null` (not
0%), so the chart can show "no data" instead of a misleading empty bar.
New `Code.js` doGet case `getRoutineCompletionTrend`; new `api.js` client
function of the same name.

**Frontend — all 3 charts + the side panel, `Routines.jsx`**:
- **Upcoming Routines (Next 3 Months)**: client-side stacked bar, items
  bucketed by the calendar month of their `nextDueDate`, stacked by
  Overdue/Due Soon/On Schedule (Completed/Paused excluded — this chart is
  about near-term workload).
- **Routines by Area**: client-side donut. Loaded the `dataviz` skill
  before building this — colors are the skill's validated 8-slot
  categorical palette (`references/palette.md`), picked light- or
  dark-surface variant by a luminance check on the active theme's own
  `cardBg` (this app has 10 themes, not just light/dark). Colors are
  assigned to area NAMES in a fixed alphabetical order
  (`areaColorMap`, keyed off the full `overviewItems`, not the
  route-type-filtered set) so switching tabs never repaints an area a
  different color — the skill's "color follows the entity, never its
  rank" rule. A blank area (every standalone one-time routine) folds into
  a fixed "Unassigned" grey bucket rather than taking a palette slot.
- **Completion Rate Trend**: bar chart from the new backend endpoint, a
  dashed `ReferenceLine` at 90%. The target line's label was first tried
  as an inline SVG label (`position: "insideTopRight"`) and overlapped
  the last bar in testing — moved to a small caption in the card header
  instead, caught and fixed before shipping.
- **Next 7 Days Due** side panel: routine/template level, NOT per-
  equipment like the reference mockup's individual LP cards —
  `getRoutinesOverview`'s items are already aggregated per routine, and
  per-equipment due dates would need a separate item-level fetch for
  every due-soon routine. Flagged here as a known simplification, not
  decided silently.

**Verify**: switch between the 3 route-type tabs and confirm the KPIs,
table, Next 7 Days panel, and all 3 charts scope down correctly each
time (e.g. the Emergency Top Up tab only ever shows standalone one-time
routines, since that route type is never recurring — confirmed in
Patch 18). Confirm an area keeps the same donut color across tab
switches. Verified with a Playwright test against the assembled
combined-site covering all of the above.

## 4ae. KPI card icon badges — Routines and Oil Inventory

Matches the reference mockup's circular icon badges on each KPI card —
flagged directly by the user after the route-type-tab pass above. Applied
to both `Routines.jsx`'s overview KPIs (Total Routines/On Schedule/Due
Soon/Overdue) and `OilInventory.jsx`'s Overview tab KPIs (Total Products/
Low Stock/This Month's Consumption/Open Shortfalls), plus icons on
Routines' 3 route-type tabs (droplet/flask/alert-triangle). Same pattern
in both files: a 36px circular badge, background = the KPI's status color
at ~13% opacity, icon in the solid color — all Tabler icon classes already
proven to render elsewhere in this codebase (`ti-box`, `ti-alert-triangle`,
`ti-chart-bar`, `ti-alert-circle`, `ti-calendar`, `ti-circle-check`,
`ti-clock`, `ti-droplet`, `ti-flask`).

**Known test-environment limitation**: this sandbox's egress proxy blocks
`cdn.jsdelivr.net` (where the Tabler icon webfont loads from, per
`index.html`), so none of this session's Playwright screenshots have ever
rendered any icon glyph — not just these new ones. Verified structurally
instead: lint, build, and the full Playwright assertion suites all still
pass post-change. The live GitHub Pages deployment has normal internet
access and will render these correctly for real users; there's nothing
to fix here, just nothing this sandbox can visually confirm.

## 4af. Equipment Viewer — new per-LP profile page (Patch 25)

New page, identified by LP_ID (the user's own "Lubrication_Point (column F)" —
one profile per lubrication point, not the broader Equipment_ID grouping
several LPs can share). Deliberately simpler than the reference mockup,
per explicit user decisions from design review: dropped Running Hours,
the Vibration/Temp/Load card, Photo/Attachments (so only 6 tabs —
Overview/Oil Samples/Oil Changes/Top Ups/Actions/Equipment Info, no
Attachments), the Line tag, and Installed year. Kept: Top Ups as their
own tracked history, Type relabeled from an existing field (no dedicated
"Type" column exists in the registry — used Position), a single
consolidated health card, and the Lubrication Timeline.

**No new backend** — everything needed is already client-side. Samples
and actions come from the existing `samples`/`actions` props (same
full-sync data every other page already uses); Oil Changes and Top Ups
are fetched on demand per selected LP via the existing
`getOilChangesForLp`/`getTopUpsForLp` backend actions. One real gap
found and fixed along the way: `api.js` had never exposed a standalone
`getOilChangesForLp` client function — only an inlined copy inside
`logOilChangeEvent`'s own write-verification step — so this page's build
failed with "not exported" until a proper standalone export was added
(mirroring the existing `getTopUpsForLp`).

**Computed fields** (not stored, confirmed directly by the user):
Criticality — High if the latest oil sample is in Alert or the oil
change is overdue, Medium for Caution/Warning, Normal otherwise. Overall
health (Good/Fair/Poor) — the worse of oil-analysis status, oil-change
overdue-ness, and open-action count.

**Navigation**: added as "Equipment Viewer" to both
`apps/oil-analysis/src/components/Sidebar.jsx` (the embedded app's own
nav, only rendered in the retired standalone-deployment path) and —
the one that actually matters, since the standalone deployment is
retired — `frontend/src/navigation.ts`'s `OIL_SUB_TABS`, which is what
the shell's unified sidebar actually renders. New `page === "equipmentviewer"`
branch in `apps/oil-analysis/src/App.jsx`, wired exactly like the
existing `equipment` page (sticky selected-code state restored after
Back, same pattern as `equipmentSelectedCode`).

**Verify**: open Equipment Viewer from the sidebar, search for a known
LP code, confirm the Overview tab's 4 cards (health, last sample/change/
top-up), the Lubrication Timeline (merged chronological events), and the
4 "Recent" quick tables all populate; check Oil Changes/Top Ups/Actions/
Equipment Info tabs individually.

## 4ag. Dashboard rebuild (Patch 26)

Full rewrite of `apps/oil-analysis/src/pages/Dashboard.jsx` (custom SVG
donut-arc rendering replaced with Recharts, consistent with every other
page rebuilt this round), covering every explicitly agreed point from
design review:

- **Equipment vs LP Points, as two separate KPIs** — Total Equipment
  (distinct `equipmentId` count) and Total LP Points (registry row
  count), each with an RHI/ASEC breakdown pill.
- **Real period-over-period comparison** ("make it a real working
  control for both") — a period selector (30/90/180 days) and a
  `periodStats` helper that counts real rows in the current window vs
  the immediately-preceding window of the same length, for Oil Changes/
  Oil Samples/Emergency Top Ups. No fabricated deltas.
- **Routine Compliance Rate split by type** — Oil Change/Sampling/
  Overall progress bars, each the share of that route type's items (from
  the existing `getRoutinesOverview`) that aren't Overdue.
- **Overdue Routines by Contractor**, **Activities by Contractor**
  (togglable donut: Oil Change/Oil Sample/Top Up), **Activities Trend**
  (6-month stacked bar, same toggle).
- **Condensed Oil Inventory widget** — an Inventory Status donut
  (Sufficient/Watch/Low/Out of Stock, tiered off `currentStock` vs
  `recorderLevel`) plus this month's consumption total, replacing the
  mockup's full Reorder Requests tab (already dropped per design review).
- **3 summary tables** — Top Overdue Routines, Open Actions, Upcoming
  Forecast Alerts (shortfalls + `insufficientHistory` from Patch 22).
- Area is used everywhere a "Line" grouping would have appeared in the
  mockup — no separate Line dimension exists in the data model, same
  simplification already applied throughout this round.
- A scoped RHI/ASEC session (`useSessionContractor()`) skips the
  Contractor filter entirely, same auto-lock pattern as Patch 16.

**New backend**: `getAllTopUps(scope)` in `TopUps.js` — every top-up
across every LP, the one aggregate the Dashboard needed that no existing
endpoint provided (mirrors `getAllOilInventoryMovements`'s pattern
exactly). New `Code.js` doGet case; new `api.js` client function. No
other new backend was needed — Oil Changes/Samples pull from data
already passed to every page (`oilChangeEvents`, newly threaded through
from `App.jsx`, and the existing `samples`/`actions` props), and
Inventory/Routines reuse the aggregations built in Patches 20-24.

**Verify**: open the Dashboard, confirm all 6 KPI cards show both a
value and an RHI/ASEC split, switch the period selector and confirm the
Oil Change/Sample/Top Up counts and % change update, switch the
Activities-by-Contractor dropdown between Oil Change/Oil Sample/Top Up
and confirm the donut updates, and check that Top Overdue Routines pulls
real entries when a template/routine is actually overdue.

## 4ah. New "ACC Corporate" theme (Patch 27)

New 11th theme, matching the reference mockups' visual language (dark
navy sidebar/topbar `#0B2340`, white cards `#FFFFFF` on a light app
background `#F4F6F9`, blue accent `#2563EB`) — confirmed directly by the
user ("make new theme style but keep all old styles, and be careful the
[theme is] always for whole platform"). None of the original 10 themes
were touched.

**Added in 3 places, kept in perfect sync** (the platform already
duplicates its theme palettes across these files, not something this
patch introduced):
- `apps/oil-analysis/src/theme.js` — full 31-key entry.
- `apps/vibration-analysis/src/theme.js` — the same palette, adapted to
  this file's own conventions (solid-hex pills instead of rgba, plus its
  `purple`/`purpleBg`/`pillPurple` extra keys every other theme there
  also has).
- `frontend/src/theme.ts` — the shell's own 9-key mini palette, which
  drives the Sidebar/every shell page's CSS custom properties.

No other wiring needed — `THEME_NAMES`/`THEME_PALETTES` are both
`Object.keys`/`.map()` over their respective theme objects, so the new
entry appears in both the shell's `ThemePicker` (`/settings`) and each
embedded app's own Appearance tab automatically.

**Verify**: open `/settings`, pick "ACC Corporate" — the shell's Sidebar
should restyle immediately; open Oil Lubrication (or Vibration Analysis)
and confirm it picked up the same theme without a manual reselect
(`persistPlatformTheme` writes into both embedded apps' own storage keys,
`embeddedNav`'s `pushTheme` live-updates one that's already mounted).
Verified with a Playwright test confirming the shell's own background
color (`rgb(11,35,64)` = `#0B2340`) and the embedded Oil Lubrication
module's background (`rgb(244,246,249)` = `#F4F6F9`) both match the new
palette after selecting it once in Settings.

## 4ai. Shell-level TopBar (Patch 28)

New `frontend/src/components/TopBar.tsx` + `TopBar.css`, matching the
reference mockup's own top bar — mounted once in `App.tsx`'s `ShellRoot`,
visible above every route. Contains, left to right: a breadcrumb for
whichever module/sub-tab is active (derived from `NAV_ITEMS` + the
current route + `useEmbeddedNav().activePageFor`), a language toggle
("EN / عربي" — UI-only, confirmed directly by the user: "make it no on
front end but we will not design the full Arabic view now"), the
notification bell, a settings shortcut, and a user-profile dropdown.

**Replaces the floating bell**: `NotificationBell.css`'s `.notif-bell`
was `position: fixed; top: 14px; right: 20px` (Patch 15) — changed to
`position: relative` so it lays out inline inside the new TopBar instead
of floating over the whole viewport. No change to `NotificationBell.tsx`
itself — same component, just repositioned by its container.

**Consolidates the account block — "replace sidebar, no duplicate"**,
confirmed directly by the user: Sidebar's old bottom block (General
Settings link, the signed-in email, Sign Out button —
`.sidebar-footer`/`.sidebar-settings-link`/`.sidebar-user`/
`.sidebar-logout`) was removed entirely from both `Sidebar.tsx` and
`Sidebar.css`. That functionality now lives only in the TopBar's own
settings icon and user-profile dropdown (email + role + Settings link +
Sign Out).

**Layout**: `App.tsx`'s `.app-shell` used to lay Sidebar and `.app-content`
side by side directly. Now there's a `.app-shell-right` flex-column
wrapper (TopBar fixed-height on top, `.app-content` filling the rest)
sitting next to Sidebar — Sidebar itself is unchanged, still spanning the
full viewport height as a direct `.app-shell` child.

**Verify**: open any page and confirm the TopBar's breadcrumb matches the
active module/sub-tab, the bell/settings/user-menu all still work exactly
as before (just relocated), and the old sidebar bottom block is gone.
Verified with a Playwright test confirming all of the above, including
that the breadcrumb updates correctly after navigating into an embedded
module's own sub-tab.

## 4aj. Consolidated Settings page with per-module tabs (Patch 29)

`frontend/src/pages/Settings.tsx` was a single page (theme picker +
account admin). It's now the platform's one Settings page with a tab
strip for "General" plus one tab per embedded module ("Oil Lubrication",
"Vibration Analysis") — answering the standing request "can we make it 1
setting and include tabs ... for each module."

**The module tabs are not a second settings screen** — each one reveals
that module's own already-mounted embedded instance, driven to its own
internal "settings" page (both apps already had this as a native
sub-tab — see `navigation.ts`'s `OIL_SUB_TABS`/`VIBRATION_SUB_TABS`, id
`"settings"`). This reuses the exact persistent-mount instances
`EmbeddedOilAnalysis.tsx`/`EmbeddedVibrationAnalysis.tsx` already keep
alive for the whole session (see Patch 20's/the embedding work's own
notes) — no second mount, no lost state, and the module keeps its synced
data when you switch back to General or away to another page.

**Mechanism**: `Settings.tsx` tracks the active tab via a `?module=`
query param on `/settings` (`setSearchParams`/`useSearchParams`, no new
context needed). Clicking a module tab calls
`embeddedNav.navigateTo(moduleId, 'settings')` (same call
`Sidebar.tsx`'s native sub-tab buttons already make) to drive that
module's internal page, then sets the query param. Both
`EmbeddedOilAnalysis.tsx` and `EmbeddedVibrationAnalysis.tsx` had their
`visible` check extended from `location.pathname === BASE_ROUTE` to also
cover `location.pathname === '/settings' && searchParams.get('module') ===
MODULE_ID`, so the same hidden-via-CSS persistent `<div>` becomes visible
in place, directly below Settings' own tab strip.

**DOM order matters here**: `App.tsx`'s `ShellRoot` used to render
`<EmbeddedVibrationAnalysis />`/`<EmbeddedOilAnalysis />` *before*
`<Routes>`. That was fine while at most one of {a routed page, an
embedded module} was ever visible at once. Patch 29 makes both visible
together on `/settings?module=...`, so they were moved to render *after*
`<Routes>` instead — Settings' own tab strip now renders first in the DOM
(on top), the revealed embedded settings panel renders after it (below),
rather than the reverse. Nothing else depends on the old order (each
embedded component's mount effect fires on its own, regardless of DOM
position).

Selecting "General" clears the query param (`setSearchParams({})`),
hiding both embedded panels again and showing the original
`ThemePicker` + `AccountsPanel` content, unchanged.

**Verify**: open `/settings` — General is the default tab, shows the
theme grid + (App Admin only) account admin panel, no embedded module
visible. Click "Oil Lubrication" — the URL gains `?module=oil-analysis`,
that module's own embedded Settings page appears directly below the tab
strip (its own "Configuration"/"System" tabs, etc. — same screen as
visiting Oil Lubrication → Settings from the sidebar), and the General
panel is gone. Click "Vibration Analysis" — same, for that module (shows
its own "Theme is now managed from the platform Settings page" notice,
confirming the de-duplication from the earlier theme-consolidation
patch). Click back to "General" — the theme grid returns, both embedded
panels hide again. Verified with a 12-assertion Playwright test plus a
rerun of the existing TopBar test (Patch 28) to confirm the `App.tsx`
reordering caused no regression on the plain `/oil-analysis` and
`/vibration-analysis` routes.

## 4ak. Equipment Viewer folded back into the Equipment tab (Patch 30)

Patch 25 built a new per-LP profile page ("Equipment Viewer") as its own
separate sidebar sub-tab. Direct feedback: that design belongs on the
existing "Equipment" tab's own single-lubrication-point view, not a
second tab — "that design is belong actually to equipment tab, not
required new tab." This patch merges the two and removes the duplicate.

**`apps/oil-analysis/src/pages/Equipment.jsx`**: the search screen (top
of the page — search by equipment code or LP_ID, the equipment/LP
autocomplete dropdown) and the combined multi-LP "equipment group" view
(selecting an Equipment_ID with several lubrication points) are
**unchanged** — explicitly kept the same per the request ("keep the
first search screen same equipment"). Only the single-lubrication-point
view (`isLpView` — reached by selecting one LP_ID, or clicking "Open
point" from the group view) was replaced with Equipment Viewer's tabbed
profile design: a health badge (Good/Fair/Poor) and criticality badge
(computed exactly as before — oil analysis status / oil-change overdue /
open actions), a sibling-LP count card, and six tabs (Overview, Oil
Samples, Oil Changes, Top Ups, Actions, Equipment Info) replacing the
old single stacked-sections layout.

**Real history, not just the derived current state**: the old single-LP
view's "Oil Change History" section only ever showed 0–1 rows — it read
from the same derived-current-state `oilChanges` prop used for the
"Next Oil Change" KPI, not an actual log. The new Oil Changes and Top Ups
tabs fetch the real per-LP history via `api.getOilChangesForLp`/
`api.getTopUpsForLp` (the same calls Equipment Viewer used), so this is a
genuine data upgrade, not just a visual one — Top Ups had no view at all
on Equipment before this.

**Nothing dropped**: every write/edit affordance the old single-LP view
had is still there, just relocated into the new tabs — View Report/Edit/
Delete buttons on the Oil Samples tab, Edit on the Actions tab, and the
header's Log Oil Change/New Action/Full Report buttons and "View all of
{equipmentId}" back-to-group button, unchanged.

**Removed entirely**: `apps/oil-analysis/src/pages/EquipmentViewer.jsx`
(deleted), its `page === "equipmentviewer"` branch, props, and sticky
`equipmentViewerSelectedCode` state in `App.jsx`, and its sidebar entry
in both `frontend/src/navigation.ts` (`OIL_SUB_TABS`, the real nav source
the shell renders) and `apps/oil-analysis/src/components/Sidebar.jsx`
(dead code in production, kept in sync anyway). `Equipment.jsx` now takes
two new props, `webhookUrl` and `pushToast` (same ones Equipment Viewer
took), passed from `App.jsx`'s existing `config.webhookUrl`/`pushToast`.

Note: there are two different "Equipment" entries in the shell — the
top-level sidebar item (`frontend/src/pages/`, route `/equipment`) is
still an unrelated `ComingSoon` placeholder; the page this patch changed
is Oil Lubrication's own "Equipment" sub-tab (`OIL_SUB_TABS`, reached via
Sidebar → Oil Lubrication → Equipment) — the real, working page the
request was about.

**Verify**: Sidebar → Oil Lubrication → Equipment sub-tab — the search
screen looks exactly as before; searching and selecting a single LP_ID
shows the new tabbed profile (health/criticality badges, 6 tabs); the Oil
Samples tab still has View Report/Edit/Delete icons; the Oil Changes/Top
Ups tabs show real fetched history; "View all of {equipmentId}" still
returns to the combined multi-LP group view, which renders exactly as
before. "Equipment Viewer" no longer appears anywhere in the sidebar.
Verified with a 10-assertion Playwright test.

## 4al. Removed duplicate top-level Dashboard/Equipment stubs — "treat it all as one app" (Patch 31)

Direct instruction after Patch 30: "we will treat all as one app from now
on" — scoped to navigation/duplication (not a full codebase merge of the
embedded modules into the shell). Two of the shell's top-level sidebar
items were empty placeholder pages shadowing real, already-built content
one click deeper inside Oil Lubrication:

- **Dashboard** (`/`) was `frontend/src/pages/Dashboard.tsx`, a one-line
  "Signed in as X..." stub — the real dashboard (KPIs, charts, Patch 26)
  is `apps/oil-analysis/src/pages/Dashboard.jsx`, only reachable before
  this patch via Oil Lubrication → Oil Dashboard.
- **Equipment** (`/equipment`) was a bare `<ComingSoon>` placeholder — the
  real page is `apps/oil-analysis/src/pages/Equipment.jsx` (just
  redesigned in Patch 30), only reachable via Oil Lubrication → Equipment.

**Fix**: both shell-level stub routes and `Dashboard.tsx` itself are
deleted. `EmbeddedOilAnalysis.tsx`'s `visible` check — already extended
once for Patch 29's Settings consolidation — now also covers `/` and
`/equipment` directly, reusing the exact same persistent-mount instance
(`FORCED_PAGE_BY_ROUTE` map). A new effect drives the embedded module to
its own `dashboard`/`equipment` page via `embeddedNav.navigateTo` whenever
one of these two routes becomes active, so clicking top-level "Dashboard"
always shows the dashboard (not whatever sub-tab was last open), and
likewise for "Equipment" — mirroring the Settings page's own
`selectTab`/`navigateTo` pattern. On a fresh login landing straight on
`/`, no forcing is even needed: the embedded app's own `page` state
already defaults to `"dashboard"` (`apps/oil-analysis/src/App.jsx`).

**`/reliability-measures` and `/compressors` are untouched** — those are
genuinely unbuilt features with no real page anywhere to point at, not
duplicates, so they stay as `<ComingSoon>`.

**Verify**: log in and land on `/` — the real Oil Dashboard (KPI cards,
charts) appears directly, no stub text, no extra click. Navigate to
Vibration Analysis, then back to "Dashboard" in the sidebar — still the
real dashboard, not whatever page was last open. Click "Equipment" in the
sidebar — the real search screen appears directly ("Find any piece of
equipment"), no "still to come" text. Verified with a 7-assertion
Playwright test, plus a full rerun of the Patch 28/29/30 regression tests
(TopBar, Settings tabs, Equipment Viewer merge) to confirm no regression.

## 4am. Patch 31 reverted — high-level vs. low-level Dashboard/Equipment (Patch 32)

Direct correction after Patch 31: "i think you mixed, between high level
and low level Equipment and dashboard, high level equipment and
dashboard it still not designed yet, we can call Oil Dashboard, Oil
Equipment." Patch 31 made the shell's top-level `/` and `/equipment`
nav items show Oil Lubrication's own Dashboard/Equipment pages directly.
That was wrong: those top-level slots are meant for a future, platform-
wide (HIGH-level) Dashboard and Equipment — covering every module, not
just Oil Lubrication — which hasn't been designed yet. Oil Lubrication's
own pages are the LOW-level, module-scoped versions, and showing them at
the top level misrepresented them as the whole platform's view.

**Reverted**: `frontend/src/App.tsx`'s `/` and `/equipment` routes are
back to plain `<ComingSoon>` placeholders, same treatment as Reliability
Measures/Compressors, until the real high-level pages are designed.
`EmbeddedOilAnalysis.tsx`'s `visible` check and its forcing effect are
back to Patch 29's state (just `/oil-analysis` and the Settings
`?module=` case) — the `FORCED_PAGE_BY_ROUTE` mechanism added in Patch 31
is gone.

**Renamed for clarity, so this distinction stays obvious going
forward**: Oil Lubrication's own Dashboard and Equipment sub-tabs/pages
are now explicitly labeled "Oil Dashboard" / "Oil Equipment" everywhere
a user sees them — `frontend/src/navigation.ts`'s `OIL_SUB_TABS` (the
real nav source), `apps/oil-analysis/src/components/TopBar.jsx`'s
`PAGE_TITLES` (the in-app page header shown inside the embedded module
itself), `apps/oil-analysis/src/components/Sidebar.jsx`'s own `NAV`
array (dead code in production, kept in sync per this project's own
convention), and the "How to Use" help topic title in `howtoTopics.js`.
`OIL_SUB_TABS`'s `dashboard` entry was already "Oil Dashboard" (it
predates this patch); only `equipment` needed renaming. The component
files themselves (`Dashboard.jsx`, `Equipment.jsx`) keep their plain
names — only user-facing labels changed.

**Verify**: top-level "Dashboard" and "Equipment" in the sidebar are
plain "this tab is on the sidebar — its design is still to come." stubs
again, with no Oil Lubrication content ever visible there. Inside Oil
Lubrication's own sub-nav, the entries read "Oil Dashboard" and "Oil
Equipment"; clicking either shows the same real pages as before (Patch
26's KPI dashboard, Patch 30's tabbed equipment profile), now with
matching in-app page headers. Verified with an 8-assertion Playwright
test, plus a full rerun of the Patch 28/29/30 regression suite (TopBar,
Settings tabs, Equipment merge) to confirm no regression.

## 4an. Mobile sidebar fix — hamburger/overlay instead of forced-permanently-open (Patch 33)

"Sidebar disappear on mobile view." Testing on a real phone-width,
touch-emulated viewport (390×844, matching a typical phone) confirmed a
severe mobile usability bug in the shell's own `Sidebar.tsx`/`Sidebar.css`:
the `@media (hover: none)` rule added earlier (999eb39, "Fix contrast,
mobile-nav, and keyboard-accessibility bugs") forced the rail permanently
open at 248px on any touch device, with no way to dismiss it. On a real
phone that's ~65% of the screen width, permanently, leaving actual page
content squeezed into a ~140px sliver — KPI cards and chart titles
visibly cut off, the TopBar's own page title overlapping the language
toggle. Likely what read as the sidebar "disappearing" — functionally,
everything ELSE did, crowded out by a sidebar that could never close.

**Root cause context**: both embedded apps (`apps/oil-analysis`,
`apps/vibration-analysis`) already have a proper hamburger-toggle
slide-in-overlay pattern for their own internal sidebars — but that code
is wrapped in `{!navBridge && (...)}` and never renders in production,
since both apps always mount with a `navBridge` when embedded under the
shell (only the retired standalone deployment hits that branch). The
shell's own `Sidebar.tsx` — the only sidebar that actually renders in
production — never got the equivalent treatment, just the "stay forced
open" fallback.

**Fix**: replaced the forced-open fallback below 861px with the same
hamburger + slide-in-overlay + backdrop pattern already proven in the
embedded apps' own (dead) code, now live for real:
- `Sidebar.tsx` takes `mobileOpen`/`onCloseMobile` props; its rail renders
  a `.sidebar-mobile-backdrop` sibling, closes on backdrop click, and
  closes on every nav-link/sub-tab click (`onNavigate`/`onClick`).
- `Sidebar.css`: below 861px, `.sidebar-rail` is `position: fixed`,
  off-screen by default (`translateX(-100%)`), sliding in
  (`.sidebar-rail--mobile-open`) with always-expanded labels/sub-nav (no
  intermediate collapsed state needed — it's an overlay, not a push
  layout). The old `@media (hover: none)` "stay at 248px" rules are now
  scoped `and (min-width: 861px)` — kept for a touchscreen laptop or
  landscape tablet, where 248px is a reasonable fraction of the screen
  and there's no hamburger button to open an overlay with.
- `TopBar.tsx`/`TopBar.css`: new `.shell-topbar-menu-btn` (hamburger,
  `Icon name="menu"`), visible only ≤860px, calling `onOpenMenu`.
- `App.tsx`'s `ShellRoot` owns `mobileNavOpen` state, passed to both;
  also resets it on every route change (`useLocation` + `useEffect`) as
  a backstop for browser back/forward, on top of the explicit close-on-
  click handling in Sidebar itself.
- Along the way, fixed the TopBar title/language-toggle collision visible
  in the same screenshots: `.shell-topbar-module` now truncates with
  ellipsis instead of overflowing, and `.shell-topbar-lang` (a UI-only
  placeholder anyway — "Arabic view not built yet") hides below 861px to
  give the crumb room.
- Added `menu`/`close` paths to `icons.tsx`'s small inline icon set.

**Verify**: at a real mobile viewport (390×844, touch-emulated), the
sidebar starts off-screen with a visible hamburger button and the
TopBar's title fully legible; tapping the hamburger slides the rail in
with a dimming backdrop; tapping a nav link, a native sub-tab, or the
backdrop itself all close it again; content fills the full screen width
throughout. Desktop hover/focus-expand behavior (≥861px) is unchanged.
Verified with a 10-assertion Playwright test at a touch-emulated mobile
viewport, plus a full rerun of the Patch 28/29/30/32 regression suite at
desktop width to confirm no regression.

## 4ao. Make it feel like a real app on mobile — PWA + bottom tab bar (Patch 34)

Direct request after Patch 33's sidebar fix: "the mobile view must be
like normal app any ... for now i think the mobile view must design
separate from web view." Agreed approach (confirmed with the user):
option 1+2 from a menu of options — a installable PWA (manifest +
service worker, full-screen, app icon, no browser chrome) plus app-like
navigation (bottom tab bar instead of a hamburger-only sidebar) — within
the same codebase, not a separate app/build. A native wrapper (Capacitor,
real App Store/Play Store listing) was offered as a third option and
explicitly deferred unless app-store distribution itself becomes a
requirement.

**PWA (installable, full-screen)**: `vite-plugin-pwa` was already a
`frontend/package.json` devDependency from the very first scaffolding
commit ("PWA skeleton") but never wired up — configured for real now in
`frontend/vite.config.ts`. `generateSW` mode, `registerType: 'autoUpdate'`.
Real app icons generated from `brand/acc-leaf-mark.png` (the actual ACC
mark) composited onto the default theme's navy background — 192/512/
512-maskable PWA icons, a 180px apple-touch-icon, and 16/32px favicons —
replacing `favicon.svg`, which turned out to be an unrelated leftover
placeholder from the original Vite/React starter template, never
ACC-branded. `index.html` gained the iOS-specific
`apple-mobile-web-app-capable`/`apple-mobile-web-app-status-bar-style`
meta tags (iOS doesn't read the manifest's `display:"standalone"` the
way Android/Chrome do) and `viewport-fit=cover` (safe-area support).

Because the deploy workflow (`.github/workflows/deploy.yml`) builds
`frontend` on its own and only copies the two modules' embed bundles into
the *final* `site/` output afterward, `generateSW`'s precache manifest —
scoped to whatever exists in `frontend/dist` at its own build time —
naturally only ever covers the shell's own small assets (13 entries,
~310KB), never either module's much larger (1-5MB) embed bundle. Those
are covered by a separate `runtimeCaching` rule instead
(StaleWhileRevalidate, keyed on any `/apps/` path) — fetched and cached
on first visit to each module, refreshed in the background on return
visits, never blocking the app's own install/precache on a multi-MB
download.

**Bottom tab bar** (`frontend/src/components/BottomNav.tsx`/`.css`,
≤860px only — same breakpoint as Sidebar's overlay mode and TopBar's
hamburger from Patch 33, all three must agree): 4 primary slots —
Dashboard, Oil Lubrication, Vibration Analysis, My Work — confirmed
directly by the user as the ones actually built/used today, plus a
"More" tab. Only 4-5 items fit a phone without feeling cramped (confirmed
with the user), so Equipment/Reliability Measures/Compressors (all still
`<ComingSoon>` placeholders) don't get primary slots — "More" reuses the
exact same slide-in Sidebar overlay the hamburger button already opens
(both drive `App.tsx`'s one `mobileNavOpen` state), rather than a second
navigation UI — also the user's own explicit choice over two new
alternatives (a horizontal tab strip, a bottom sheet) offered up front.
"More" itself highlights whenever the active route isn't one of the 4
primary tabs, so the bar always shows where you are even on a page that
only lives behind it.

**Three real, confirmed-by-measurement layout bugs found and fixed along
the way** (not theoretical — each one only showed up once BottomNav's
own `position: fixed; left:0; right:0` made the shell newly sensitive to
them):
- `.app-shell-right`'s new `padding-bottom` (reserving room for the fixed
  bar) was being added on top of its `min-height: 100svh` floor instead
  of carved out of it, since nothing in this project resets
  `box-sizing` — fixed by setting `box-sizing: border-box` on it
  explicitly.
- `.app-shell`/`.app-shell-right`/the mobile Sidebar overlay used `100vh`
  — the browser's tallest possible viewport, as if any collapsible
  mobile address-bar chrome were gone — switched to `100svh` (small
  viewport height, sized for that chrome actually being there), matching
  the convention `#root` in `index.css` already used.
- `.app-content--embedded` (the container each module's embed bundle
  mounts into — see `App.css`'s own long-standing comment on why it
  exists: cancelling the shared page padding via a negative margin, plus
  `zoom: 0.9` to fit each module's own fixed-px sizing) computed to ~11%
  *wider* than its own parent on a real browser engine once zoom and that
  negative margin combined — confirmed by direct measurement (~471px
  pre-zoom against an ~433px available width), not just theory. That
  oversized box pushed the whole page wider than the viewport, which
  then corrupted BottomNav's own measured width (a position:fixed
  element's `left/right:0` resolves against the layout viewport, which
  grows when something else forces horizontal overflow). Fixed by pinning
  `.app-content--embedded` to `width: 100%; max-width: 100%` instead of
  leaving it to `auto`, plus `overflow: hidden` as a second line of
  defense. A global `overflow-x: hidden` was also added to `body` in
  `index.css` as a general safety net against the same class of bug
  anywhere else on the page.

**Verify**: at a real mobile viewport (390×844, touch-emulated), the
page's manifest link resolves and its icons load (confirmed via direct
fetch, not just visual inspection); the bottom bar shows all 4 primary
tabs + More, Dashboard highlighted by default; tapping a tab navigates
and updates the active highlight; tapping Oil Lubrication shows the real
module content filling the screen with no horizontal overflow; tapping
More opens the same overlay Sidebar showing Equipment/Reliability
Measures/Compressors, and More highlights instead of any primary tab
while on a page like Settings. Desktop (≥861px) is unaffected — bottom
bar and hamburger both hidden, normal hover-expand sidebar. Verified with
a 16-assertion Playwright test (manifest/icons/service-worker fetched
directly, full bottom-nav interaction flow at a touch-emulated mobile
viewport, desktop-width checks), plus a full rerun of the Patch 28/29/
30/32/33 regression suite to confirm none of the CSS changes above
(`box-sizing`, `svh`, `overflow-x`, `width`/`overflow` on the embedded
container) broke anything elsewhere.

**Still open** (explicitly the next phase, not attempted in this patch —
"all screens organized well on mobile screen" goes well beyond the shell
chrome covered here): a screen-by-screen audit of both modules' own
dense pages (data tables, multi-column forms, KPI grids) for genuinely
mobile-appropriate layouts, starting with the highest-traffic ones (Oil
Dashboard, Routines, Equipment, Oil Inventory; Vibration Dashboard,
Equipment Reading) rather than relying on CSS reflow alone to make them
usable on a phone. The embedded modules' own internal TopBar.jsx
("Sheet"/"Sync" buttons) was observed overflowing at the very right edge
on a 390px screen during this patch's own testing — a first concrete
item for that follow-up pass, left alone here since it's inside a
module's own dense-page territory, not shell chrome.

## 4ap. One top bar, not two — Oil Lubrication consolidation (Patch 35)

Start of the "all screens organized well on mobile screen" follow-up
flagged at the end of Patch 34: "in all view i see 2 top bar, we need to
make it one." Confirmed it wasn't mobile-only — every Oil Lubrication page
on desktop and mobile alike stacked the shell's own `TopBar` (breadcrumb,
bell, settings, avatar) directly above the module's own internal
`TopBar.jsx` (page title, Online/offline, date, Sheet link, Sync button).
Scope, confirmed with the user: fix it everywhere in one pass; move
Online status + the Sync button into the shell's bar; drop the Sheet link
entirely rather than relocate it; keep the pending-sync-count badge.

**The module no longer renders its own bar when embedded.**
`apps/oil-analysis/src/components/TopBar.jsx` now takes a `navBridge` prop
(replacing the `sheetUrl` prop it used to take) and returns `null`
whenever `navBridge` is set — i.e. on every page except one. The Report
page is the one exception: its own "Back" button is contextual,
single-page navigation the shell has no way to know about, so that case
still renders a minimal one-button bar (just Back, nothing else). The
standalone (no-`navBridge`) code path — unused in production, see Patch
12's retirement of the old no-login deployment, kept only so the app
still runs if someone opens it directly during development — keeps its
full original bar, minus the Sheet link, which was removed from both
paths since the user asked to drop it "at all," not just from the
embedded one.

**The shell's own bar grew a module-aware Sync row.** A new
`NavBridge.sync()`/`NavBridge.onSyncStateChange()` pair
(`frontend/src/embeddedNav.tsx`) mirrors the existing `navigate`/
`onNavigate` pattern: the module sets `navBridge.sync` to its own
`runSync` function and calls `onSyncStateChange({ syncState,
pendingSyncCount })` on every change (`apps/oil-analysis/src/App.jsx`,
two small `useEffect`s next to the existing navigation-bridge one); the
shell stores the latest value per module (`EmbeddedNavProvider`'s
`syncInfoFor`/`setSyncInfo`) and `frontend/src/components/TopBar.tsx`
reads it via the active route's `moduleId` (added to `useBreadcrumb()`'s
return value). When `syncInfo` is non-null — i.e. the active page belongs
to a module that has registered a sync bridge — the shell's `TopBar`
renders the pending-count badge (only when count > 0), an Online/Offline
pill (`navigator.onLine`, listening for the `online`/`offline` window
events — a new `useOnlineStatus()` hook, not module-specific, so no
bridge round-trip needed for it), and a Sync button that calls
`embeddedNav.triggerSync(moduleId)` and disables itself mid-sync. On any
non-module page (Dashboard, Settings, etc.) `syncInfo` is `null` and none
of this renders — confirmed via `revert_oil_naming_test`'s still-passing
`topLevelDashboardIsStub` assertion, which exercises exactly that page.

**Mobile**: at ≤860px (the same breakpoint Sidebar/TopBar/BottomNav
already share), the Sync row's text labels collapse to icon-only
(`.shell-topbar-pending span`, `.shell-topbar-online
span:not(.shell-topbar-online-dot)`, `.shell-topbar-sync-btn span` all
`display:none`) so it doesn't collide with the bell/settings/avatar on an
already-tight phone width — caught and fixed one bug in my own first pass
here: those selectors target real `<span>` wrappers around each text
label, which the JSX didn't originally have (bare text nodes don't match
a `span` selector) — added the wrapper spans before this ever reached
testing.

**Verify**: a new Playwright script
(`topbar_consolidation_test.mjs`, desktop 1400×1000 + mobile 390×844)
confirms exactly one `.shell-topbar` and zero `.app-topbar` on Oil
Dashboard at both viewports, the Sync row present with a working Online
pill and Sync button, no horizontal overflow on mobile. Reaching the
Report page needed real sample/equipment data (the Sample Tracker's
cached 158 real LP-IDs don't line up with a minimal mock) — built one via
Equipment → search → Oil Samples tab → "View report," the same path
`equipment_merge_test.mjs` already uses — confirming exactly one
`.shell-topbar` *and* exactly one `.app-topbar` (the single-button Back
bar, nothing else) on that page, and that clicking Back returns to the
dashboard with the module's bar gone again. The one incidental match on
`a:has-text("Sheet")` during testing turned out to be the module's own
password-gated advanced Settings page ("Open Sheet," `apps/oil-analysis/
src/pages/Settings.jsx`) — a pre-existing, unrelated admin config link,
confirmed not visible on page load (`isVisible()` false) and out of this
patch's scope, not a leftover from the TopBar removal. Full regression
suite (`topbar_ui_test`, `settings_tabs_test`, `equipment_merge_test`,
`revert_oil_naming_test`, `mobile_sidebar_fix_test`,
`mobile_app_feel_test`) rerun clean — no regressions from the
`TopBar.tsx`/`TopBar.css` changes.

**Still open**: the broader screen-by-screen mobile audit this patch was
the first item of — Oil Lubrication's own dense pages (Oil Dashboard,
Routines, Equipment, Oil Inventory) haven't been reviewed for mobile
layout yet, just this one shell-chrome issue. Vibration Analysis has the
same double-top-bar problem (its own `TopBar` component follows the same
old pattern) — untouched here, explicitly deferred until Oil
Lubrication's audit is further along.

## 4aq. Mobile audit, item 1: a hidden CSS class-name collision clipping every page heading (Patch 36)

First item of the "screen-by-screen mobile audit" Patch 35 deferred.
Captured all 12 Oil Lubrication sub-tabs (plus the Equipment detail view)
at a real phone viewport (390×844) with populated mock data and reviewed
each screenshot. The single worst, most widespread finding: almost every
page's own heading, intro text, and even form labels had their first 1-2
characters clipped flush against the left edge of the screen —
"Routines" rendering as "outines," "Oil Change Forecast" as "il Change
Forecast," "EQUIPMENT" as "UIPMENT," and so on, across Routines, Add
Report, Oil Actions, Oil Change Forecast, Sample Tracker, Oil Inventory,
Reports, Activity, Settings, and the Equipment detail page — a pattern
too consistent to be a per-page bug.

**Root cause, confirmed by measurement** (same approach as Patch 34's
zoom investigation — direct `getBoundingClientRect()` on the clipped
element and every ancestor, not guessing from the rendered pixels alone):
the shell (`frontend/src/App.tsx`) and the Oil Analysis module
(`apps/oil-analysis/src/App.jsx`) **both independently named a CSS class
`.app-content`** for their own (unrelated) top-level content wrapper.
Both apps inject a plain, unscoped `<style>` tag straight into the one
shared document — there's no CSS scoping between an embedded module and
the shell that mounts it — so the module's own
`@media (max-width: 480px) { .app-content { padding: 8px !important } }`
rule (apps/oil-analysis/src/App.jsx, its own mobile-padding rule from
long before embedding existed) was *also* matching and overriding the
shell's `.app-content` (`frontend/src/App.css`, `padding: 2rem`), simply
because the module's `<style>` tag mounts into `<head>` after the shell's
own stylesheet and wins the cascade at equal specificity via
`!important`. That broke the exact assumption
`.app-content--embedded`'s `margin: -2rem` (added back in the original
embedding work, see `4`) was built on — it cancels exactly 2rem of the
shell's own `.app-content` padding, but at ≤480px the shell's actual
padding had silently become 8px instead, so cancelling -2rem against it
pushed every embedded page's content ~24px further left than the
viewport's own left edge. Confirmed directly: the embedded container's
own `left` (via `getBoundingClientRect()`) measured negative (off-screen)
at a 390px viewport before the fix, and a small positive number after.

**Fix**: renamed the *shell's* class only — `.app-content` →
`.shell-page-content` in `frontend/src/App.tsx` (the `<main>` wrapper)
and `frontend/src/App.css` (`.shell-page-content`,
`.shell-page-content h1`/`h2`). `.app-content--embedded` (the actual
mount-point div, a distinctly-named class, not a collision) and the two
embedded apps' own bundles are untouched — neither app's code needed to
change, since the fix just gives the shell's wrapper a name that can't
collide with whatever either embedded app happens to call its own
internal containers. Vibration Analysis was never touched (its own
`.app-content`, if it has one, no longer matters either way once the
shell's own class has a unique name) but is worth a quick check once its
own mobile audit starts.

**Verify**: the same `getBoundingClientRect()` measurement confirmed the
heading's own `left` moved from -10px to +10px after the fix (rebuilt
frontend only — neither embedded module needed rebuilding); re-captured
all 12 mobile screenshots and visually confirmed every previously-clipped
heading/label now renders in full on Routines, Activity, Oil Inventory,
and the rest. Full regression suite rerun (`topbar_ui_test`,
`settings_tabs_test`, `equipment_merge_test`, `revert_oil_naming_test`,
`mobile_sidebar_fix_test`, `mobile_app_feel_test`,
`topbar_consolidation_test`) — the renamed class broke two existing
tests' own hardcoded `main.app-content` selectors (not a product
regression, just stale test selectors), updated to
`main.shell-page-content` and reran clean.

**Still open**: the rest of the Patch 35 punch list — Routines' own data
table overflowing horizontally with its Status column cut off, Oil Change
Forecast's timeline/date-axis labels overlapping into illegible text,
Oil Actions' Kanban board only showing 2 of 4 status columns with no
scroll affordance (and drag-and-drop between distant scrolled columns
being impractical on touch), Activity's header row cramming a title +
search input + Filter button onto one line, and the generally
chrome-heavy filter-chip toolbars on Routines/Oil Actions/Oil Change
Forecast eating most of the screen before any real content shows.

## 4ar. Mobile audit, items 2-5: dense desktop pages rebuilt for a phone screen (Patch 37)

Continuing straight on from Patch 36's root-cause fix, the rest of the
punch list from the same mobile audit — all five items, worked one page
at a time, each built/screenshotted/regression-tested before moving to
the next, per the user's own "start with all tab one after one, don't
stop" direction.

**Routines table → mobile card list.** Both of Routines.jsx's own tables
(the overview's 6-column Routine Name/Equipment Count/Frequency/Next Due/
Status/Last Completed table, and the templateDetail drill-down's 6-column
instance table) were overflowing horizontally on a phone with the Status
column cut off the right edge, no mobile-friendly stacking. Reused a CSS
toggle pattern (`.dash-table-desktop`/`.dash-table-mobile`) that had
actually been sitting unused in App.jsx's own stylesheet since early
scaffolding — defined, but never once applied to any element — paired
with a one-line fix (a missing base `.dash-table-mobile { display: none
}` rule; only the mobile override existed, so without this the mobile
card list would have rendered on top of the desktop table on every screen
size, not just toggled between them). Each table now renders twice: the
original `<table>` wrapped in `className="dash-table-desktop"`
(unchanged), plus a new stacked-card list (`className="dash-table-mobile"`)
reusing the exact same data, showing route name + status badge on top,
equipment count/frequency, progress bar (template view only), and due/
created dates — all legible at 390px with no horizontal scroll needed.

**Oil Change Forecast timeline.** The per-point due-date timeline's
header row (9 date labels across a 120-day window) was overlapping into
illegible garbled text on a phone — root cause: `DotTimeline.jsx`'s own
track is `flex: 1, minWidth: 0`, which on a narrow screen let the browser
genuinely compress it toward zero width rather than just reflowing, so 9
text spans fighting for under 150px combined bled into each other
visually. The outer card already had `overflowX: auto`; the actual fix
was a `minWidth: 640` on a new inner wrapper around both the header row
and the point rows, so the whole thing scrolls horizontally as one
correctly-proportioned unit on a narrow viewport instead of being
squeezed — verified both at first paint (labels legible, card scrollable)
and scrolled all the way right (every one of the 9 date labels still
legible, no overlap).

**Oil Actions Kanban board.** The 4-column status board
(Open/In Progress/Waiting Stoppage/Closed) only ever showed about 1.5
columns on a phone with nothing hinting the rest were a swipe away, and
the page's own subtitle ("drag a card to change its status") describes a
gesture that isn't practical when most columns are off-screen. Rather
than trying to make 4 columns fit, or teach touch-drag across scrolled-
away drop zones, mobile gets a status-tab row (Open (n)/In Progress (n)/
Waiting Stoppage (n)/Closed (n)) showing one column at a time, full
width — status still changes exactly the way every other field does,
tapping a card opens the same `EditActionModal` that already has its own
Status dropdown, so no new interaction had to be invented. The per-card
markup was extracted into one shared `renderActionCard()` function so the
desktop grid and the mobile tab view can never drift out of sync with
each other.

**Activity header row.** Title + search input + Filter button were
crammed onto one line, truncating the input's own placeholder text. Added
a small reusable `.mobile-stack-row` CSS class (App.jsx's shared
stylesheet) that stacks a header's title/form pair vertically at
≤860px — the input also switched from a fixed `width: 220` to
`flex: 1, minWidth: 0` so it fills the stacked row's full width instead
of staying pinned at its old desktop size.

**Heavy filter-chip toolbars** (Routines, Oil Actions, Oil Change
Forecast) — each stacked an Area dropdown, several rows of status/area/
contractor pill buttons, and a search box above its own content, pushing
everything below the fold on first load. Added two small reusable pieces
(`src/hooks/useIsMobile.js`, a `window.matchMedia('(max-width:860px)')`
hook; `src/components/MobileFilterToggle.jsx`, a small pill button
showing an active-filter count) and a `filtersOpen` state per page,
defaulting to collapsed on mobile only (`useState(!isMobile)`) and always
open on desktop. Each page's filter row keeps its exact original
structure/DOM order — the toggle button and conditional rendering were
added *around* the existing JSX rather than restructuring it, specifically
so desktop (where `isMobile` is false and `filtersOpen` defaults true)
renders byte-identical to before this patch; only a phone ever sees the
toggle or starts collapsed. Oil Actions and Oil Change Forecast each kept
one thing permanently visible alongside the collapsible filters — the
Generate/Add action buttons and the Group By toggle respectively — since
those are primary actions/view controls, not filters, and collapsing them
away would have hidden functionality rather than just decluttering.

**Verify**: each of the five fixes was built, copied into the
`combined-site` scratchpad harness, and screenshotted at 390×844 before
moving to the next — confirmed Routines' table renders as cards with no
overflow (both the overview and the template-instance drill-down,
reached via the same path `equipment_merge_test.mjs` already uses to open
a real routine), the Oil Change Forecast timeline is legible collapsed
and fully scrolled right, the Oil Actions status tabs correctly filter to
one column at a time (verified both visually and via a DOM assertion
scoped to `.dash-table-mobile` specifically, after an initial version of
the assertion false-positived on the still-present-but-hidden desktop
grid), Activity's header stacks with the full placeholder text visible,
and all three filter toolbars collapse to a single "Filters" button by
default on mobile and expand back to the exact original row when tapped
(verified via a DOM presence check: the search input doesn't exist at all
collapsed, appears after tapping). Full regression suite
(`topbar_ui_test`, `settings_tabs_test`, `equipment_merge_test`,
`revert_oil_naming_test`, `mobile_sidebar_fix_test`, `mobile_app_feel_test`,
`topbar_consolidation_test`) plus the desktop-focused
`routines_overview_ui_test`/`routines_charts_ui_test` (specifically to
confirm the filter-collapse change didn't touch desktop's own rendering)
rerun clean after every single one of the five fixes, not just once at
the end.

**Still open**: Vibration Analysis was never in scope for this audit
("Start the mobile audit of Oil Lubrication's pages first") and likely
has its own double-top-bar issue (Patch 35's own scope) plus whatever a
similar page-by-page mobile pass on it would turn up — neither looked at
here. Beyond the 12 Oil Lubrication sub-tabs captured and reviewed in
this audit, no further mobile-specific issues were found in this pass,
but a second look focused specifically on real (non-mocked) production
data volumes — e.g. what the Routines card list looks like with hundreds
of routines rather than 2-3 — hasn't been done.

## 4as. Four more mobile/shell fixes from direct iPhone testing (Patch 38)

Direct feedback after trying the deployed app on a real iPhone, not caught
by the Patch 36/37 audit's own (desktop-browser, touch-emulated) testing:
the shell's own TopBar scrolled out of view instead of staying put; the
mobile sidebar had two separate buttons that both opened the exact same
overlay; a module's sidebar sub-tab list had no way to close once opened
short of leaving the module; and Vibration Analysis still had the same
double-top-bar problem Patch 35 had only fixed for Oil Analysis.

**TopBar wasn't pinned.** Nothing in the shell creates its own scroll
container — `#root`/`body` is the one real scrolling element (`index.css`)
— so `.shell-topbar` was a plain in-flow block that scrolled away with
the page underneath it like any other element, exactly matching "can't
see the top bar until I scroll up." Added `position: sticky; top: 0;
z-index: 50` to `.shell-topbar` (`frontend/src/components/TopBar.css`) —
50 sits below every floating-chrome layer that still needs to cover it
when open (Sidebar rail 100, NotificationBell's dropdown 200, BottomNav
300, the mobile Sidebar overlay/backdrop 499/500) but above ordinary
scrolling page content, which has none.

**Two buttons opened the same sidebar overlay.** TopBar's own hamburger
button (top-left, ≤860px) and BottomNav's "More" tab (bottom, ≤860px)
both called the identical `setMobileNavOpen(true)` / opened the identical
Sidebar overlay — "no need for the top left side button on mobile view,"
confirmed directly. Removed the `@media (max-width: 860px) {
.shell-topbar-menu-btn { display: inline-flex; } }` override in
`TopBar.css` so it now stays at its own default `display: none` on mobile
too (unchanged on desktop, where it was never the complaint); the button
stays in `TopBar.tsx`'s markup for a future >860px use, only its
visibility is CSS-gated, so no JS change was needed there.

**Sidebar sub-tab list had no close.** A module's sub-tab list
(`showSubTabs` in `Sidebar.tsx`) showed unconditionally for as long as
the route stayed on that module — with no separate open/closed state at
all, clicking the top-level "Oil Lubrication" link again while already
inside one of its own sub-tabs did nothing, since for a "native" sub-tab
(no `to`, see `SubTabItem`'s own file comment) the browser route never
actually changes — only the embedded module's own internal page does —
so `NavLink` saw itself already on the target route and no-opped.
Added a `collapsedModuleTo` state: clicking an active top-level item with
sub-tabs now toggles the list instead of attempting (and failing) to
navigate, and collapsing also sends the module back to its own first
sub-tab (index 0 — each module's own Dashboard, see `navigation.ts`) so
"click back to Oil Lubrication" actually lands you back on Oil
Dashboard, not wherever you happened to be. A `useEffect` keyed on
`location.pathname` resets this back to `null` on every real route
change (not on an internal sub-tab switch, which never touches the
route) — otherwise leaving Oil Lubrication collapsed and later returning
via BottomNav's own primary tab (which bypasses Sidebar's click handler
entirely) would show it still collapsed from an unrelated earlier visit
instead of expanded, as a fresh visit should.

**Vibration Analysis's own double top bar** — the exact Patch 35 problem,
never done for this module since that patch's own scope was explicitly
"Oil Lubrication's pages first." Same treatment: `apps/vibration-
analysis/src/components/TopBar.jsx` now returns `null` when `navBridge`
is set (no exception needed here — unlike Oil Analysis, this app has no
Report-style page with its own contextual Back button); two new
`useEffect`s wire `navBridge.sync`/`onSyncStateChange` exactly like Oil
Analysis's own Patch 35 wiring, with `pendingSyncCount` hardcoded to `0`
since this app has no offline-queue concept to report; `frontend/src/
pages/EmbeddedVibrationAnalysis.tsx` gained the matching
`onSyncStateChange` bridge call — the shell's own `TopBar.tsx` needed
*no* changes at all, since its `syncInfoFor(moduleId)` lookup was already
fully generic across any registered module, not hardcoded to Oil
Analysis.

One real bug caught and fixed before it ever reached testing: the two
new Vibration Analysis `useEffect`s were first placed right next to the
existing `navBridge.navigate` effect near the top of the component,
*before* `syncNow`'s own `const syncNow = useCallback(...)` declaration
further down the same function — referencing `syncNow` in a dependency
array ahead of its own declaration point is a temporal-dead-zone
violation, and did throw at runtime in testing (`ReferenceError: Cannot
access 'me' before initialization` in the minified bundle, `embed.js`)
once actually loaded in a browser rather than just type-checked. Fixed by
moving both effects to right after `syncNow`'s own declaration instead.

**Verify**: a new Playwright script
(`patch38_fixes_test.mjs`) confirms all four independently — TopBar's own
`boundingBox().y` stays at 0 after scrolling a tall page 2000px down
(sticky working, not just visually eyeballed); the hamburger button is
invisible on a 390px viewport while BottomNav's "More" is visible and
still opens the identical overlay; the sidebar sub-menu's visibility
toggles false→true→false across two clicks of the same active top-level
item; Vibration Analysis shows exactly one `.shell-topbar` with a working
Sync button inside it (the TDZ crash would have made this fail outright,
not just render wrong — caught on the very first run of this exact
test). Full regression suite (`topbar_ui_test`, `settings_tabs_test`,
`equipment_merge_test`, `revert_oil_naming_test`, `mobile_sidebar_fix_test`,
`mobile_app_feel_test`, `topbar_consolidation_test`,
`routines_overview_ui_test`, `routines_charts_ui_test`) rerun clean.

**Still open**: Vibration Analysis's own screen-by-screen mobile audit
(the equivalent of Patches 36-37, but for this module) hasn't been done —
only its double-top-bar issue, which was the one specifically reported,
is fixed here.

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

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
   Code.js, Config.js, Rbac.js, Session.js, Utils.js), create a matching
   script file (**File → New → Script**) and paste in its contents.
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

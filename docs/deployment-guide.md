# Deployment guide — Apps Script backends

Status: Platform Core and Oil Analysis backends are code-complete for the
features designed so far (see `docs/platform-foundation-spec.md` and
`docs/oil-analysis-module-notes.md`). Vibration Analysis has no backend
code yet — that module hasn't had its own schema/requirements pass.

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

`checkDueDates_` (in `DueDates.js`) needs to run daily so approaching
2-year caps with no recent sample get flagged automatically. In this
project's Apps Script editor:

**Triggers (clock icon) → Add Trigger**:
- Function: `checkDueDates_`
- Event source: Time-driven
- Type: Day timer (pick any off-peak hour, e.g. 2–3am)

### Register the endpoint back in Platform Core

Open "ACC Reliability Data Base" → `MODULE_REGISTRY` sheet → find the
`oil-analysis` row → paste the Oil Analysis Web App URL into `EndpointUrl`.
This is how the frontend discovers where to send Oil Analysis requests.

## 4. What's still open after this

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
- **Frontend**: still on the old full-page-link sidebar, not yet reworked
  into the agreed single-app integration (Option B), and has no screens at
  all yet for the Routine workflow described here.

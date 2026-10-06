# Test copy — setup, testing Phase 0, and releasing it

The test copy is a full second set of the platform: copies of the three
Google Sheets, each with its own copy of its Apps Script, and the website
running on your own computer. Nothing you do in it touches the live site or
live data. Every screen shows an orange **TEST COPY** label so it can't be
mistaken for live.

You need: a Windows (or Mac) computer with **Node.js 20 or newer**
(nodejs.org, "LTS") and **Git** (git-scm.com).

---

## Part A — Make the copies (one time, about 20 minutes)

Do this for each of the three spreadsheets: **Platform Core**, **Oil
Lubrication Data Base** and **Vibration**.

1. Open the live spreadsheet → **File → Make a copy**. Name it
   `TEST — <original name>`. Copying the spreadsheet also copies the Apps
   Script inside it.
2. Open the **copy** → **Extensions → Apps Script**. Check the files are
   there.
3. Replace the script files with this branch's versions (open each file in
   GitHub, copy all, paste over the file of the same name; use **+ → Script**
   for a file that doesn't exist yet):
   - **Oil test copy:** `backend/oil-lubrication/src/` — `ModuleAccess.js`
     (new), `ModuleAccessConfig.js` (new), `Code.js`, `Notifications.js`,
     `SampleOverdue.js`
   - **Vibration test copy:** `backend/vibration-analysis/src/` — `Auth.js`
     (new), `ModuleAccess.js` (new), `ModuleAccessConfig.js` (new), `Code.js`
   - **Platform Core test copy:** no changes.
4. **Project Settings (gear icon) → Script Properties.** This step is what
   keeps the test copy separate from live, so check every value:

   | Test copy | Property | Value |
   |---|---|---|
   | Platform Core | `PLATFORM_CORE_SPREADSHEET_ID` | **The test copy's own ID** (the long code in its address bar between `/d/` and `/edit`). If this still has the live ID, the test copy would change live users. |
   | Platform Core | `SESSION_SIGNING_SECRET` | A new value only for testing, e.g. `test-secret-2026-10`. |
   | Oil | `SESSION_SIGNING_SECRET` | The same test value. |
   | Oil | `notify_email_enabled` | `false`, so the test copy never emails real people. |
   | Vibration | `SESSION_SIGNING_SECRET` | The same test value. |

   Leave any other properties as they are.
5. **Deploy → New deployment → Select type: Web app.** Execute as **Me**,
   Who has access **Anyone** → **Deploy** → copy the **Web app URL** (it
   ends in `/exec`).

You now have three test URLs.

## Part B — Run the test website on your computer

1. Open **Command Prompt** (or PowerShell) and run:

   ```
   git clone https://github.com/aghafar-hub/ACC-Reliability-Platform-1.git
   cd ACC-Reliability-Platform-1
   git checkout claude/oil-phase-0
   ```

2. In the folder `tools\test-site`, copy `test-site.env.example` to
   `test-site.env`, open it in Notepad, and paste the three test URLs.
   The script refuses to start if any of them is a live address.
3. Run:

   ```
   node tools/test-site/test-site.mjs
   ```

   The first run installs and builds everything (a few minutes). Then it
   prints the addresses:
   - **On this computer:** `http://localhost:4173/`
   - **On your phone (same Wi-Fi):** the second address it prints. If
     Windows asks about the firewall, allow **private networks**.
4. Log in with your normal email and password — the accounts were copied
   with the Platform Core sheet.

Next time, `node tools/test-site/test-site.mjs --serve` starts it again
without rebuilding. After pulling new code, run it without `--serve`.

To sign in as someone else (a technician, a contractor engineer), reset
their password in **Settings → General → Users** on the test site. This
only changes the test copy, not their real password.

## Part C — What to try in Phase 0

1. **Settings → General → Module Access** (App Owner only):
   - The people who were already getting Oil alerts appear as responsible
     engineers.
   - **Add them all** gives every existing account access, with
     technician-only accounts listed as technicians.
   - Change a role's tab levels, and add an exception for one person.
2. Sign in as a contractor engineer:
   - Hidden tabs are gone from the menu.
   - A view-only tab shows "View only", and saving there is refused.
   - A module you weren't added to shows "You don't have access".
3. Set Oil to **Maintenance**:
   - Others see the yellow banner, can look around, and can't save.
   - Work saved offline on a phone stays queued and syncs after you set
     Oil back to **Active**.
4. Set a module to **Off** → it disappears for everyone but you.
5. Submit a routine as a technician → only the listed responsible
   engineers get the bell alert.
6. **Assign technician** only offers technicians listed for that
   contractor.

Changes in Module Access reach other people within about two minutes, or
straight away when they switch back to the browser tab.

## Part D — Releasing Phase 0 to live (only after you approve it)

Do this at a quiet time; it takes about 15 minutes.

1. **Back up:** File → Make a copy of each live spreadsheet, named
   `BACKUP before Phase 0 <date>`.
2. **Website first.** It's safe on its own: until a backend is updated,
   the website treats every module as fully open, exactly as today.
3. **Oil live script:**
   - Paste the same files as in Part A step 3.
   - **Deploy → Manage deployments → ✏ edit → Version: New version →
     Deploy.**
   - Live Oil already has `SESSION_SIGNING_SECRET` set, so the access
     rules start straight away. **Immediately** open Settings → General →
     Module Access → Oil Lubrication → **Add them all**. Until you do, only
     the people already getting alerts can open Oil.
4. **Vibration live script:**
   - Paste the files and deploy a new version. It stays open to everyone
     for now (no secret yet).
   - In Module Access → Vibration Analysis → **Add them all**.
   - Then add `SESSION_SIGNING_SECRET` to its Script Properties with the
     **same value as live Platform Core's**. The rules start once it's
     saved.
   - The old stand-alone Vibration page (no login) stops working at this
     point. That's expected; everyone uses it through the platform now.
5. Sign in as a non-admin and check the menus.
6. Fill in each module's **Version** and **Released** date under Status.

**If something goes wrong:**
- Apps Script → Manage deployments → ✏ edit → choose the previous version
  → Deploy.
- The website can be returned to the `main` backup.
- The new access sheets (`OL_MODULE_PEOPLE`, `OL_TAB_ACCESS`,
  `VIB_MODULE_PEOPLE`, `VIB_TAB_ACCESS`) can stay. The old code simply
  ignores them.

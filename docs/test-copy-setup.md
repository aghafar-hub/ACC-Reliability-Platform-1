# Test copy — setup, testing Phase 0, and releasing it

The test copy is a full second copy of the platform on GitHub, at
**https://aghafar-hub.github.io/ACC-Reliability-Platform-1/test/**. It is
built and published by the same GitHub Actions deploy as the live site, and
connects only to copies of the three Google Sheets. Nothing you do in it
touches the live site or live data:

- every screen shows an orange **TEST COPY** label;
- it keeps its own saved browser data (login, settings, offline queue)
  apart from the live site's, even in the same browser;
- the deploy refuses to build it if it's ever pointed at a live backend.

How it's published: code for testing goes on the **`claude/test-site`**
branch. A push there asks the live branch's deploy workflow to run again,
which rebuilds the live site unchanged from the live branch and puts the
test copy from `claude/test-site` under `/test/`. The `main` branch stays
untouched as the backup.

## Part A — Make the copies (one time, about 20 minutes)

Do this for each of the three spreadsheets: **Platform Core**, **Oil
Lubrication Data Base** and **Vibration**.

1. Open the live spreadsheet → **File → Make a copy**. Name it
   `TEST — <original name>`. Copying the spreadsheet also copies the Apps
   Script inside it.
2. Open the **copy** → **Extensions → Apps Script**. Check the files are
   there.
3. Replace the script files with the versions on the **`claude/test-site`**
   branch (open each file on GitHub, copy all, paste over the file of the
   same name; use **+ → Script** for a file that doesn't exist yet):
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

## Part B — Connect the test site (one time, 2 minutes)

1. On GitHub, open the repository → **Settings → Secrets and variables →
   Actions → Variables tab → New repository variable**. Add three:

   | Name | Value |
   |---|---|
   | `TEST_PLATFORM_CORE_URL` | Platform Core **test** web app URL |
   | `TEST_OIL_ANALYSIS_URL` | Oil **test** web app URL |
   | `TEST_VIBRATION_ANALYSIS_URL` | Vibration **test** web app URL |

2. Tell me when they're saved, and I'll start a deploy. You can also start
   one yourself: **Actions → Deploy to GitHub Pages → Run workflow**.
3. Open **https://aghafar-hub.github.io/ACC-Reliability-Platform-1/test/**
   and log in with your normal email and password. The accounts were copied
   with the Platform Core sheet.

If the test site ever opens without the orange label, open the live site
once and reload it, then go back to `/test/`. That lets your browser pick up
the live site's updated offline settings.

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
2. **Website first:** merge the tested branch into the live branch; GitHub
   Actions publishes it. It's safe on its own: until a backend is updated,
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
- The website can be returned to the `main` backup branch.
- The new access sheets (`OL_MODULE_PEOPLE`, `OL_TAB_ACCESS`,
  `VIB_MODULE_PEOPLE`, `VIB_TAB_ACCESS`) can stay. The old code simply
  ignores them.

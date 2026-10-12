# Phase 3 — speed, accessibility, tests (from the October 2026 audit)

What changed and how to install and check it. Phases 1 and 2: `security-phase1.md`,
`security-phase2.md`.

## What changed

| Change | Finding | Where |
|---|---|---|
| Oil loads much faster: the main download went from 6.8 MB (1.68 MB compressed) to 1.55 MB (0.38 MB compressed). The PDF reader, the PDF/Excel report tools and seven less-used pages (Add Report, Inventory, Activity, Reports, Team, How to use, Settings) load the first time they are opened | F-13 | `apps/oil-analysis`: `pdfReportParser.js`, `reportSections.js`, `pages/Reports.jsx`, `pages/NewReport.jsx`, `App.jsx`, `pdfWorkerFile.js`, vite configs |
| The built-in equipment list (every contractor's points, 0.6 MB) is no longer inside the app: each person gets their own contractor's list from the server at start-up | F-13, F-03 | `apps/oil-analysis/src/equipmentRegistry.js` |
| Pinch-zoom works on phones | F-17 | `frontend/index.html` |
| The phone Sync button has a name for screen readers | F-18 | `TopBar.tsx` |
| Oil tags (Plant overview) and Overdue flags (My Work) are readable in all five themes (4.5:1) | F-19 | `Plant.css`, `MyWork.css` |
| Vibration on phones: no button under 24 px, no text under 11 px (dashboard grid, area rows, Log view switch, Register and Limits row buttons, Measurement Tracker months) | F-20 | Vibration `VibDashboard.jsx`, `DashCharts.jsx`, `ContractorChips.jsx`, `MeasurementTracker.jsx`, `VibLimits.jsx`, `theme.js` |
| Security tests in the repo (made-up data only) run before every deploy; a failure stops the deploy | F-15 | `tests/security.test.cjs`, `.github/workflows/deploy.yml` |
| Signatures and the API secret are compared in constant time | I-01 | the three `Auth.js` / `Session.js` |
| Lab reports Returned for correction are left out of the Oil dashboard | I-02 | Oil `App.jsx` |
| Nightly backup of the three databases + restore guide | I-03 | Platform Core `Backup.js`, `docs/backup-and-restore.md` |
| Who can do what, from the code | I-04 | `docs/access-matrix.md` |

Not done: **I-05** (one shared write path for Oil and Vibration). It is a large rewrite
of both backends with little extra protection now that Phases 1–2 check every write;
better done together with the move to a real database (see the IT handover).

## Install (test copy first)

Paste into the **Test** Apps Script projects, then **Deploy → Manage deployments → Edit →
New version**:

1. **Platform Core:** `Session.js`, `Backup.js` (new file: **＋ → Script**, name it `Backup`), `InstallCheck.js`
2. **Oil Lubrication:** `Auth.js`, `InstallCheck.js`
3. **Vibration Analysis:** `Auth.js`, `InstallCheck.js`

The website part comes with the site build. Then set up the nightly backup on the
**live** Platform Core project (`docs/backup-and-restore.md`).

## How to check

- **Oil speed:** open Oil on a phone: the first screen comes up noticeably faster. Add Report → Import still reads lab PDFs; Reports still makes PDFs and Excel files.
- **Zoom:** on an Android phone, pinch to zoom any page.
- **Vibration on a phone:** dashboard grid cells, area rows and the Log's Timeline/Table switch are easy to tap.
- **Deploy tests:** GitHub → Actions → the latest "Deploy to GitHub Pages" run shows a green "Security tests" step.

## Real-phone check (3.6 — needs a person with the phones)

On one **Android** phone (Chrome) and one **iPhone** (Safari), test site first:

1. Open the site → install it (Android: menu → *Install app*; iPhone: Share → *Add to Home Screen*). It opens full screen from the home-screen icon.
2. Sign in with "Keep me signed in". Close and reopen the app: still signed in.
3. Oil → Add Report → pick a lab PDF from the phone's files → the review shows its samples.
4. Oil Analysis Report → open a report → **PDF** button → the PDF opens or downloads.
5. Vibration → New reading on your own machine → save.
6. Turn on airplane mode → add an Oil sample → it says "saved on this device". Turn airplane mode off → it syncs within a minute.
7. Type in a form near the bottom of the screen: the keyboard doesn't hide the field you type in.
8. The top bar and bottom bar don't sit under the phone's notch or home bar.
9. Phone back button / swipe back goes to the previous page, not out of the app.
10. After a new version is deployed, the app shows "New version ready. Reload to use it."

Write down for each phone: model, OS version, and which steps failed.

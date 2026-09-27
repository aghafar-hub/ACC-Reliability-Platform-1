# ACC Oil Analysis App (v2)

![CI](https://github.com/aghafar-hub/acc-oil-analysis-app/actions/workflows/ci.yml/badge.svg)

The Arabian Cement Oil Analysis Management app, rebuilt as real, readable
React source. The previous repo (`oil-analysis-app`) only ever contained
pre-built minified bundles with no source code, which made it effectively
impossible to maintain or fix bugs in — this repo replaces that with a
standard, linted, tested-by-CI project anyone can read and extend.

It uses the **same Google Sheet as its database**, through the same Apps
Script Web App webhook contract — no changes to the sheet or the Apps
Script are required to use this app (beyond the two small, additive
backend changes noted in
[`docs/SHEET_SCHEMA.md`](./docs/SHEET_SCHEMA.md), for the Equipment
Registry's Contractor column and Data_Entry's Flagged Parameters column).

**📖 Full documentation: [`docs/`](./docs/README.md)** — architecture,
a file-by-file code guide, the bulk PDF import feature, the Google Sheet
schema, the webhook API contract, and deployment instructions.

## Quick start

```bash
npm install
npm run dev
```

Open the app, go to **Settings**, and paste your Apps Script Web App URL
(the same one the original app used, e.g.
`https://script.google.com/macros/s/XXXX/exec`). It's stored only in your
browser's localStorage — never committed to this repo.

```bash
npm run lint          # ESLint
npm run format        # Prettier (auto-fix)
npm run format:check  # Prettier (check only, used in CI)
npm run build         # production build to dist/
```

## What this rebuild actually fixes

The original app silently lost edits: it wrote every change with
`fetch(webhookUrl, { mode: "no-cors" })`, which cannot read the server's
response, so a failed save looked identical to a successful one — the
screen updated, then the edit vanished on the next sync because it was
never actually written to the sheet.

This version (`src/api.js`) follows every write with a **verifying read**
and only updates the screen once the sheet actually reflects the change;
otherwise it shows a real error instead of a false "saved". Action data is
also lifted to one shared state array (`App.jsx`), used identically by
every page that shows actions (the Oil Analysis Report page, the Oil
Report Search page, and the Action Tracker page), so an edit made from any
one of them is reflected on the others immediately.

Full explanation, with the diagnosis that led to it: see
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#the-sync-bug-and-its-fix).

## What's here beyond the original app

Built on top of the rebuild, in the same "verified writes, real error
messages" spirit:

- **Bulk PDF lab-report import** (Add Sample → Import Lab Reports) — drop
  up to 30 lab-report PDFs, parsed entirely in the browser (no server
  involved), with per-cell severity color sampling and a mandatory
  review-before-add popup. See
  [`docs/PDF_IMPORT.md`](./docs/PDF_IMPORT.md).
- The Oil Sample Tracker sheet is now actually read and kept in sync — see
  "Known gaps" below for what that replaced.
- A Dashboard with an Area filter and a Contractor filter (combining as an
  intersection), a cross-system "Needs Attention" insight feed, and
  Contractor Performance stats.
- Oil Change Log and Sample Tracker both use a shared "dot timeline"
  visual (`components/DotTimeline.jsx`) instead of a plain table/chip row.
- Four downloadable PDF reports generated entirely client-side
  (`reportGenerators.js`), each scopable to one contractor or all of them.
- A 10-palette theme switcher (Settings → Appearance).

## Project structure

```
src/
  api.js                        Apps Script webhook client (reads + verified writes)
  parsers.js                    row <-> object mapping for every sheet tab
  pdfReportParser.js            client-side lab-report PDF parsing (bulk import)
  reportGenerators.js           client-side PDF report generation (the other direction)
  theme.js / ThemeContext.jsx   10-palette theme system + shared style tokens
  config.js                     localStorage persistence (webhook URL, cache)
  equipmentRegistry.js          Equipment Registry (separately synced, own localStorage key)
  actionRegistry.js             Action Registry pick-list (same pattern)
  actionAutofill.js             equipment -> action-field autofill, shared by 3 flows
  App.jsx                       top-level state (samples/actions/oilChanges/tracker) + routing
  components/
    Sidebar.jsx / TopBar.jsx / Toast.jsx / ErrorBoundary.jsx
    EquipmentSearch.jsx / MultiSelectTags.jsx / LineChart.jsx / DotTimeline.jsx
    EditActionModal.jsx / EditOilChangeModal.jsx / EditSampleModal.jsx
    LastActionsPanel.jsx        shared "Last N Actions" widget
    GenerateMonthlyActionsModal.jsx / GenerateOilChangeActionsModal.jsx
    BulkImportPanel.jsx / BulkImportReview.jsx   PDF bulk-import UI
  pages/
    Dashboard.jsx / Equipment.jsx / OilAnalysisReport.jsx / OilReportSearch.jsx
    ActionTracker.jsx / AddSample.jsx / OilChangeLog.jsx / SampleTracker.jsx
    Reports.jsx / HowToUse.jsx / Settings.jsx
docs/                           full documentation (start at docs/README.md)
.github/workflows/ci.yml        lint + format-check + build on every push/PR
```

See [`docs/CODE_GUIDE.md`](./docs/CODE_GUIDE.md) for what each file does.

## Known gaps

- **"Quick Sync" and "Full Sync" do the same thing** — both call a full
  `readAll()`. The backend has a since-timestamp incremental endpoint
  nothing currently calls; see
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#known-gaps).
- Sample edit/delete's match key (`unitId` + `sampleId`) is not guaranteed
  unique in the live sheet — see
  [`docs/SHEET_SCHEMA.md`](./docs/SHEET_SCHEMA.md#data_entry-samples) for
  what that means in practice and why it's a low-risk gap today.
- Settings' Configuration-tab password is a hardcoded client-side string,
  not real access control — see
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#known-gaps).
- Form field coverage favors what's visible in the original UI; a few
  less-used columns can be added the same way any other field was — see
  [`docs/SHEET_SCHEMA.md`](./docs/SHEET_SCHEMA.md).

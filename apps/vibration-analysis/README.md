# ACC Vibration Analysis App

![CI](https://github.com/aghafar-hub/acc-vibration-analysis-app/actions/workflows/ci.yml/badge.svg)

The Arabian Cement **Vibration & Condition Monitoring** app, rebuilt as
real, readable React source. The original repo
(`aghafar-hub/Vibration-Analysis-App`) only ever contained a pre-built
minified bundle with no source code — this repo replaces that with a
standard, linted, CI-checked project anyone can read and extend, while
staying behavior-faithful to the original.

It uses the **same Google Sheet as its database**, through the same Apps
Script Web App webhook contract — no changes to the sheet or the Apps
Script are required to use this app. A copy of that Apps Script backend
itself is included at [`apps-script/`](./apps-script) — see
[`apps-script/README.md`](./apps-script/README.md) for two real bugs found
there (unrelated to this rebuild — they live entirely in that script) and
a corrected version.

**📖 Full documentation: [`docs/`](./docs/README.md)** — architecture, a
file-by-file code guide, the Google Sheet schema, the webhook API
contract, and deployment instructions.

## Quick start

```bash
npm install
npm run dev
```

Open the app and go to **Settings → Configuration** (pass key `17593` —
see [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps) for why
that's not real access control) if you need to point it at a different
Apps Script Web App URL than the default it ships with. It's stored only
in your browser's `localStorage` — never committed to this repo.

```bash
npm run lint          # ESLint
npm run format        # Prettier (auto-fix)
npm run format:check  # Prettier (check only, used in CI)
npm run build          # production build to dist/
```

## How this rebuild was made

`legacy-exact-copy/` is a byte-for-byte copy of the original
`Vibration-Analysis-App` repo's compiled build — untouched, kept as a
reference and rollback point. Everything under `src/` at this repo's root
was built by decompiling that minified bundle: renaming its cryptic
identifiers, un-minifying its control flow, and reconstructing every page,
every status calculation, every theme color, and the entire webhook API
contract from what the code actually does — not from a description, and
not re-skinned from screenshots alone. Where that process turned up a real
quirk or bug in the original (an inconsistent webhook payload shape on
action edits, a threshold field that silently gets clobbered on save, a
passcode that isn't real security), it's reproduced faithfully here and
called out explicitly rather than quietly "fixed" — see
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#known-gaps) and
[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps) for the full
list.

## Project structure

```
src/
  api.js                          Apps Script webhook client (fetch + JSONP fallback, blind writes)
  parsers.js                      row <-> object mapping for every sheet, date/number helpers
  domain.js                       threshold resolution, RMS/SPM status banding + coloring
  config.js                       localStorage persistence (webhook URL, logo, threshold overrides)
  theme.js / ThemeContext.jsx     8-palette theme system + shared style tokens
  navigation.js                   sidebar nav list + page titles
  App.jsx                         top-level state (rms/spm/compliance/registers/actions) + routing
  components/
    Sidebar.jsx / TopBar.jsx / Modal.jsx / ConfirmModal.jsx / StatusBadge.jsx
    Icon.jsx / icons.jsx          hand-picked inline SVG icon set (no icon font/library)
    StatusDonut.jsx / LineChart.jsx   hand-rolled SVG charts (no charting library)
    ComplianceDot.jsx / ComplianceTimeline.jsx / ComplianceRow.jsx
    DashboardEquipmentCard.jsx / EquipmentEditModal.jsx / ReadingTable.jsx / ReadingModal.jsx
    ActionRow.jsx / ActionModal.jsx / EmailActionModal.jsx / EmailFilteredModal.jsx
    GenerateMonthlyActionsModal.jsx / ConfigUnlockModal.jsx / BackfillButton.jsx / ErrorBoundary.jsx
  pages/
    Dashboard.jsx / NewReading.jsx / EquipmentRegister.jsx / EquipmentReadings.jsx
    GraphsDashboard.jsx / ComplianceTracker.jsx / ActionTracker.jsx / LimitsSettings.jsx / Settings.jsx
docs/                             full documentation (start at docs/README.md)
legacy-exact-copy/                the original app's untouched compiled build, kept for reference
apps-script/                      the Apps Script webhook backend (Code.gs) + a bugfixed Code.fixed.gs
.github/workflows/                ci.yml (lint + format-check + build), deploy.yml (GitHub Pages)
```

See [`docs/CODE_GUIDE.md`](./docs/CODE_GUIDE.md) for what each file does.

## Known gaps

Reproduced from the original, not introduced here — see the linked
sections for detail:

- **No webhook write is ever verified** — every write is a blind
  fire-and-forget `no-cors` GET; the UI trusts it landed. See
  [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps).
- **`updateAction`'s payload shape doesn't match `appendAction`'s** — an
  edited action's fields are sent under different (camelCase) keys than a
  new one's, though confirmed harmless: the backend accepts either. See
  [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps).
- **Saving Equipment Register or Limits Settings limits writes to the
  wrong column, on the live Apps Script backend** — an off-by-one in
  `updateRegisterLimits` corrupts the Points/SPM Type columns and shifts
  every RMS/SPM threshold one slot over. Not a bug in this app's code; see
  [`apps-script/README.md`](./apps-script/README.md) for the exact mapping
  and a corrected script.
- **Settings' Configuration pass key (`17593`) is not real access
  control** — a hardcoded string compared client-side. See
  [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps).
- **`autoSyncMinutes`/`enableAutoSync` are unwired** — present in the
  default config, read/written by nothing. See
  [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md#known-gaps).

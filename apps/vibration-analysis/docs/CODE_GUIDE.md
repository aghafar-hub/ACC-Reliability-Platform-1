# Code guide

A walkthrough of every file in `src/`, grouped the way you'd want to read
them to understand the app, not strictly alphabetically. Every file's
top-of-file comment names which original bundle identifier it was ported
from (e.g. "ported from the original's `Cm`") — cross-reference against the
minified bundle in `legacy-exact-copy/` if you want to verify a mapping
yourself.

## Entry point

### `main.jsx`

Mounts `<App />` into `#root`, wrapped in `<ErrorBoundary>` (an addition —
see [ARCHITECTURE.md](./ARCHITECTURE.md#known-gaps)),
`<ThemeProvider>`, and `<React.StrictMode>`.

### `App.jsx`

Owns every data array (`rms`, `spm`, `compliance`, `rmsRegister`,
`spmRegister`, `lastRms`, `lastSpm`, `actions`), connection state
(`webhookUrl`, `sheetUrl`, `config`, `logoUrl`), per-equipment threshold
overrides (`thresholdsMap`), sync status, and page routing (a plain `page`
string, no router). `webhookRef`/`configRef` mirror the latest
`webhookUrl`/`config` in refs so the `syncNow`/`applyLastRms`/`applyLastSpm`
callbacks (built once with `useCallback`) always read current values
without needing to be rebuilt on every keystroke in Settings. `mutations`
(`addRMS`/`updateRMS`/`deleteRMS`/`addSPM`/`updateSPM`/`deleteSPM`) is the
one shared write API every reading-editing page uses — see
[ARCHITECTURE.md](./ARCHITECTURE.md#reading-writes-cascade-into-three-places).

### `navigation.js`

`NAV_ITEMS` (sidebar order/labels/icons) and the derived `PAGE_TITLES` map
— pulled out of `Sidebar.jsx` into their own module purely so exporting
them doesn't trip React Fast Refresh's "only export components" check.

## Theming

### `theme.js`

`THEMES` — the exact 8 palettes, `buildStyles(T)` — the shared style-object
builder, `pillStyle(color)` — the small pill/badge helper. See
[ARCHITECTURE.md](./ARCHITECTURE.md#theming).

### `ThemeContext.jsx`

`ThemeProvider`/`useTheme()`. Persists the selected theme name to
`localStorage` under `selected_theme` (same key the original uses) and also
mirrors the active palette onto CSS custom properties on `<html>`
(`--accent`, `--background`, etc.) for parity with the original's own
`Bs()` theme-switch function, even though nothing in this rebuild's own
components reads those variables (everything goes through `useTheme()`'s
`T`/`s` instead).

## Data layer

### `api.js`

The only file that talks to the network. See
[API_CONTRACT.md](./API_CONTRACT.md) for the full action list and
transport details (fetch-then-JSONP for reads/verified writes, blind
no-cors GETs for raw-sheet writes).

### `parsers.js`

Row ⟷ object converters, one pair per sheet: `rowToRMS`/`rmsToRow`,
`rowToSPM`/`spmToRow`, `rowToCompliance`, `rowToRmsRegister`,
`rowToSpmRegister`, `rowToLastRMS`, `rowToLastSPM`, `rowToAction`/
`actionToFields`. Also the small utilities every page uses:
`parseNumber()` (blank/null → `null`, not `0`), `parseSheetDate()` (Google
Sheets serial-date-aware, returns ISO `YYYY-MM-DD`), `formatDisplayDate()`
("DD Mon YYYY" for display), `monthKey()` (`YYYY-MM` from an ISO date), and
`normalizePoint()` (fixes a handful of real typos seen in the sheet's
"Asset ID"/point column: "ouboard"/"outbord" → "Outboard"). See
[SHEET_SCHEMA.md](./SHEET_SCHEMA.md) for exactly which column maps to which
field.

### `domain.js`

Threshold resolution and status derivation — the app's one shared "what
does this number mean" module. `resolveThresholds()` (register-vs-override
precedence — see [ARCHITECTURE.md](./ARCHITECTURE.md)), `rmsStatus()`/
`spmStatus()` (the banding functions), `rmsColorKey()`/`spmColorKey()`/
`combinedColorKey()` (status → theme color key), `spmToRmsStatus()` +
`SEVERITY_RANK`/`worseStatus()` (combining the two vocabularies),
`classifyComplianceStatus()`/`complianceColor()`/`complianceLetter()` (the
Compliance Tracker's free-text cell parsing), and
`buildDashboardEntries()` (the Dashboard's per-equipment status join across
Last RMS + Last SPM + the Equipment Register).

### `config.js`

`localStorage` persistence: `configStore.load()`/`.save()` (connection
settings + contractor list, key `app_config_v3`), `.loadLogo()`/
`.saveLogo()` (key `app_logo_url`), `toDriveDirectUrl()` (Google Drive
share-link → direct-viewable image URL conversion),
`loadThresholdOverrides()`/`saveThresholdOverrides()` (key
`vib_thresholds_v3`). `DEFAULT_WEBHOOK_URL` and `DEFAULT_LOGO_URL` are the
same production values the original bundle ships hardcoded.

## Shared components (`src/components/`)

### `Sidebar.jsx` / `TopBar.jsx`

Left nav (logo, theme-aware nav list, Open/Alert count badges, sync status
footer) and the sticky header (page title, date, "Sheet" link, Sync
button, mobile hamburger).

### `Icon.jsx` / `icons.jsx`

A small hand-picked stroke-icon set (no icon font or library — the original
loads neither), rendered via `<Icon d={ICONS.xxx} size={16} />`.

### `Modal.jsx` / `ConfirmModal.jsx`

The generic centered-dialog shell and the generic "are you sure?"
confirmation, used by every other modal in the app.

### `StatusBadge.jsx`

`<StatusBadge status="Alarm" colorKey="danger" />` — the small colored pill
used everywhere a reading/action/compliance status is shown. Also exports
`CountBadge` (the sidebar's numeric count pills).

### `StatusDonut.jsx`

Dashboard's clickable equipment-count donut (one arc per status).

### `LineChart.jsx`

Hand-rolled SVG trend chart with hover tooltips and dashed threshold lines
— no charting library is bundled anywhere in the original (confirmed: no
recharts/chart.js/d3/victory), so this is plain SVG too, matching the
sibling oil-analysis app's own approach. Used by Graphs Dashboard.

### `ComplianceDot.jsx` / `ComplianceTimeline.jsx` / `ComplianceRow.jsx`

The Compliance Tracker's visual building blocks, small to large: one
month's status as a colored square with a letter label; the full
scrollable per-equipment timeline with a hover tooltip; the collapsible
equipment row (6-month preview strip + expand-to-full-timeline) the
Compliance Tracker page renders one of per equipment.

### `DashboardEquipmentCard.jsx`

One equipment tile on the Dashboard — collapsed shows overall status +
"driven by" chips (which specific readings caused that status); expanded
shows the single latest RMS/SPM reading per type and a "View Graphs" link.

### `EquipmentEditModal.jsx`

Equipment Register's Edit modal — name plate/type/line, and (conditionally,
depending on which register(s) this equipment is in) RMS limits+points
and/or SPM limits.

### `ReadingTable.jsx` / `ReadingModal.jsx`

The small reading-history table (with inline edit/delete) and the
Add/Edit-one-reading form, both shared by Equipment Readings.

### `ActionRow.jsx` / `ActionModal.jsx` / `EmailActionModal.jsx` / `GenerateMonthlyActionsModal.jsx` / `EmailFilteredModal.jsx`

Action Tracker's building blocks: one collapsible action row; the
new/edit-action form; the single-action email dialog (defaults the first
recipient to `<contractor>@arabiancementcompany.com`); the
preview-then-generate bulk-action dialog (candidates = equipment whose most
recent reading in the chosen month was Alarm/Danger); the "email everything
currently filtered" dialog (warns first if no filters are active, so a
stray click doesn't email the whole tracker).

### `ConfigUnlockModal.jsx`

Settings → Configuration's pass-key lock screen — see
[API_CONTRACT.md](./API_CONTRACT.md#known-gaps) for why this isn't real
access control.

### `BackfillButton.jsx`

Settings → System's "Run Backfill Now" button + status line.

### `ErrorBoundary.jsx`

Not in the original — see
[ARCHITECTURE.md](./ARCHITECTURE.md#known-gaps).

## Pages (`src/pages/`)

Each page is a function component that receives its data and callbacks as
props from `App.jsx` — none of them fetch data themselves.

| Page                    | Purpose                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Dashboard.jsx`         | Equipment-count donut, 4 status tiles, quick filters, a grid of per-equipment status cards (`DashboardEquipmentCard`).                                                                           |
| `NewReading.jsx`        | Bulk "enter today's readings for one equipment" form — one card per configured RMS/SPM point, saved together; also updates that month's compliance status.                                       |
| `EquipmentRegister.jsx` | Equipment master list: totals, filters, a table of every registered equipment's name plate/type/line/limits/points, with `EquipmentEditModal`.                                                   |
| `EquipmentReadings.jsx` | Per-equipment reading log grouped by line, with inline Add/Edit/Delete via `ReadingTable`/`ReadingModal`.                                                                                        |
| `GraphsDashboard.jsx`   | Per-equipment trend charts — one `LineChart` per RMS point (Axial/Horiz/Vert/Max + threshold lines) and per SPM point (HDm/HDc + threshold lines), over a selectable time range.                 |
| `ComplianceTracker.jsx` | Reads the Compliance Tracker data: tiles, filters (including a Month filter), one `ComplianceRow` per equipment.                                                                                 |
| `ActionTracker.jsx`     | Manual actions, "Generate Monthly Actions", CSV export ("Export Excel" — genuinely a `.csv` blob, no spreadsheet library involved), single/bulk email.                                           |
| `LimitsSettings.jsx`    | Per-equipment RMS/SPM threshold editor — see [ARCHITECTURE.md](./ARCHITECTURE.md#threshold-resolution-has-a-specific-precedence) for when this actually has an effect.                           |
| `Settings.jsx`          | Three tabs: Appearance (logo + theme picker), Configuration (pass-key gated — webhook/sheet URL, contractors, Configuration-sheet setup notes), System (backfill, app info, setup instructions). |

## Where to make a change

- **Add a field to a reading/action**: update the relevant `rowTo*`/
  `*ToRow`/`*ToFields` pair in `parsers.js` first (matching the real sheet
  column — see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md)), then add it to the
  relevant form (`ReadingModal.jsx`, `ActionModal.jsx`, or
  `NewReading.jsx`) and display it wherever relevant.
- **Change how a reading's status is banded/colored**: `domain.js` —
  `rmsStatus()`/`spmStatus()` for the cutoffs, `rmsColorKey()`/
  `spmColorKey()`/`combinedColorKey()` for the color.
- **Change styling**: `theme.js` — colors and shared style objects only;
  component-specific one-off styles live inline in that component. Adding
  a new palette means adding a full new entry to `THEMES` with every key
  the others have.
- **Add a page**: create it under `src/pages/`, add a nav entry to
  `navigation.js`'s `NAV_ITEMS`, and wire it into the `page === "..."`
  conditionals in `App.jsx`.
- **Add/change a webhook action**: `api.js`, following the existing
  verified-vs-blind pattern (see [API_CONTRACT.md](./API_CONTRACT.md)).

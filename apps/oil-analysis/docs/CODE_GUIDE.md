# Code guide

A walkthrough of every file in `src/`, grouped the way you'd want to read
them to understand the app, not strictly alphabetically.

## Entry point

### `main.jsx`

Mounts `<App />` into `#root`, wrapped in `<ErrorBoundary>` and
`<React.StrictMode>`. Nothing app-specific happens here.

### `App.jsx`

Two components: the outer `App` owns only `config` (loaded from
`localStorage`) and wraps everything in `<ThemeProvider>`; the inner
`AppShell` is the actual app (split out so it can call `useTheme()` — see
[ARCHITECTURE.md](./ARCHITECTURE.md#theming)). `AppShell` owns:

- **Data state**: `samples`, `actions`, `oilChanges`, `trackerRaw` (raw Oil
  Sample Tracker rows), each seeded from `localStorage` cache on first
  render. `trackerByEquip` (parsed + samples-overlaid tracker history) is
  derived via `useMemo`, not stored directly.
- **Registry state**: `equipmentRegistry`, `actionRegistry` — separately
  synced, separately cached; see
  [ARCHITECTURE.md](./ARCHITECTURE.md#two-equipment-lists-kept-separately-from-the-main-sync).
- **Sync**: `runSync()` calls `api.readAll()` and replaces all four data
  arrays; runs once on mount if a webhook URL is configured, again on a
  timer if Auto-Sync is enabled (`config.autoSyncMinutes`), and again
  whenever either sidebar sync button is clicked (both currently call the
  same function — see the "Known gaps" note in ARCHITECTURE.md).
- **Write handlers**: `onAddAction`, `onUpdateAction`, `onDeleteAction`,
  `onSaveOilChange`, `onAddSample`, `onBulkAddSamples`, `onEditSample`,
  `onDeleteSample` — each calls the matching `api.js` function, updates
  local state _only on verified success_, and pushes a toast either way.
  `applyOilChangeSideEffect`/`applySampleTrackerSideEffect` are the
  best-effort cross-sheet side effects described in ARCHITECTURE.md.
- **Navigation**: a simple `page` string state (no router), plus
  `selectedEquipment`/`reportOrigin` (so the contextual report's Back
  button returns to wherever it was opened from) and
  `equipmentSelectedCode` (so the Equipment page restores its last-viewed
  equipment after Back).
- **Derived values**: `equipmentOptions` (unique sorted equipment codes
  from the registry, for dropdowns), `alertCount`/`openActionsCount` (for
  sidebar badges), via `useMemo`.

## Theming

### `theme.js`

`THEMES`: 10 complete color palettes (`Navy Dark` the default, plus
`Midnight Blue`, `Forest Green`, `Slate Light`, `Warm Sand`, `Pearl White`,
`Sky Blue`, `Rose Light`, `Mint Fresh`, `Carbon Dark`), ported verbatim
from the original app's own theme data — don't invent a color value here;
if something's needed that isn't in a palette, it wasn't in the original
either. `buildStyles(T)` turns one palette into the shared style-object
set (`s.card`, `s.btn`, `s.btnPrimary`, `s.input`, `s.select`, `s.table`,
`s.th`/`s.td`, `s.badge(status)`, `s.label`, `s.sectionTitle`,
`s.metricCard`, `s.nav`/`s.navItem(active)`, `s.infoBar`, `s.alertPulse`,
`s.topbar`, etc.) every component builds its layout from. Also exports
`RATING_OPTIONS` (`["Normal", "Caution", "Alert"]`), `statusColor(T,
status)`, and `trackerStatusChip(status)` (the N/C/A/M/S/U single-letter

- color mapping the Sample Tracker page and its dot-timeline redesign both
  use). A static `T`/`s` pair (always "Navy Dark") is exported too, for the
  few places that render outside a `<ThemeProvider>`'s reach.

### `ThemeContext.jsx`

`ThemeProvider`/`useTheme()` — a thin context wrapper around `theme.js`.
`useTheme()` throws if called outside a provider, which is deliberate: it
surfaces a missing provider immediately instead of silently rendering with
`undefined` colors.

## Data layer

### `api.js`

The only file that talks to the network. See
[ARCHITECTURE.md](./ARCHITECTURE.md#the-sync-bug-and-its-fix) for why it's
built the way it is. Exports:

- `readAll(webhookUrl)` — full sync, returns `{ samples, actions,
oilChanges, trackerRaw }`.
- `getDashboard(webhookUrl)` — the Apps Script's cached aggregate-counts
  endpoint (available if you want to use it instead of/alongside
  client-side aggregation — nothing currently calls it).
- `getEquipmentRegistry(webhookUrl)` / `updateEquipmentRegistryEntry(...)`
  — read the full Equipment Registry sheet; write just one equipment's
  editable fields (used today only for the sampling-interval editor in
  Settings). See the note on Contractor in
  [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#equipment-registry).
- `updateSampleTracker(webhookUrl, { equipmentCode, sampleDate, status })`
  — best-effort write to the Oil Sample Tracker sheet, fired after every
  sample save (single or bulk).
- `getEquipmentRows(webhookUrl, code)` — raw rows for one equipment code;
  used both directly and as the verification step after every write.
- `getActionRegistry(webhookUrl)` / `addActionRegistryEntry(webhookUrl,
label)` — read/append to the Action Registry sheet.
- `saveAction`, `deleteAction`, `saveOilChange`, `saveSample`,
  `updateSample`, `deleteSample` — writes, each verified.
- `SaveVerificationError` — thrown when a write can't be confirmed; callers
  catch it and surface the message via toast.
- Internal helpers worth knowing about if you're debugging a verification
  failure: `rowsEqual()` (cell-by-cell compare with per-column skip/date-
  tolerance rules), `logVerificationMismatch()` (console-logs exactly which
  column(s) differed).

### `parsers.js`

The largest shared file — pure functions, no side effects. Roughly four
groups:

- **Row ⟷ object converters**, one pair per sheet tab: `rowToAction` /
  `actionToRow` (+ `ACTION_HEADERS`, `nextAcNo`), `rowToOilChange` /
  `oilChangeToRow`, `rowToSample` / `sampleToRow` (+
  `parseFlaggedParams`/`formatFlaggedParams` for the Flagged Parameters
  column). See [SHEET_SCHEMA.md](./SHEET_SCHEMA.md) for exactly which
  column maps to which field.
- **Oil Sample Tracker parsing**: `parseTrackerRows()` (raw sheet rows →
  per-equipment month history) and `overlaySamplesOnTracker()` (layers live
  `Data_Entry` samples on top of that history) — see
  [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#oil-sample-tracker) for the cell
  format these parse.
- **Derived-status helpers**: `intervalMonths()` /
  `computeOilChangeNextDue()` / `computeOilChangeStatus()` (Oil Change Log
  due-date math, shared by that page and Equipment's "Log Oil Change"
  flow), `sampleTrackerStatus()` (OK/OVERDUE/MISSING for one equipment,
  with `OK_GRACE_MONTHS`/`OVERDUE_GRACE_MONTHS` buffers so crossing the
  interval by a few days doesn't immediately read as an alarm),
  `sampleTriggerReadings()` (which specific readings to show as "why this
  sample is flagged" — prefers a sample's real `flaggedReadings` from a
  PDF import over the app's own guessed-limit heuristic,
  `SAMPLE_TRIGGER_CHECKS`, when present).
- **Small utilities**: `formatDate()` (used everywhere a date is
  displayed), `sameCalendarDay()` (date-equality with round-trip tolerance,
  used by write verification).

### `config.js`

Thin `localStorage` wrapper:

- `loadConfig()` / `saveConfig()` — the webhook URL, sheet URL, theme name,
  and every other Settings toggle, keyed under `acc_oilapp_config`.
- `readCache(key)` / `writeCache(key, data)` — per-dataset cache
  (`acc_oilapp_cache_samples`, `..._trackerRaw`, etc.) so the UI has
  something to show immediately on load, before the first sync completes.

### `equipmentRegistry.js` / `equipmentRegistryDefault.js`

`loadEquipmentRegistry()` / `saveEquipmentRegistry()` — the
`localStorage`-backed Equipment Registry described in
[ARCHITECTURE.md](./ARCHITECTURE.md#two-equipment-lists-kept-separately-from-the-main-sync).
`backfillContractor()` is a one-time repair pass: any equipment stuck with
a blank Contractor (from before the backend's `readEquipmentRegistry()` was
fixed to read that column) gets it filled in from the bundled default.
`equipmentRegistryDefault.js` is a real snapshot of the live sheet — 152
equipment, all 10 columns including Area and Contractor.

### `actionRegistry.js` / `actionRegistryDefault.js`

Same pattern, for the Action Registry sheet's pick-list of reusable action
phrases (7 defaults). Much simpler — no backfill logic needed, since this
list has no history of a silently-dropped column.

### `actionAutofill.js`

Shared by `EditActionModal.jsx` (manual add/edit) and
`GenerateMonthlyActionsModal.jsx`/`GenerateOilChangeActionsModal.jsx` (bulk
auto-create) — all three need the exact same "pick an equipment code →
prefill Description/Oil Type/Contractor from the registry, Last Change Date
from the most recent Oil Change Log entry, Prev. Month Agreed Action from
the equipment's last action" logic, so it lives in one place
(`autofillFromEquipment()`) rather than three that could drift apart.
`toISODate()` here is also the one place that converts a display-format
date ("26 Mar 2026") to the ISO format `<input type="date">` needs, without
a UTC-conversion day-shift bug.

## PDF bulk import

### `pdfReportParser.js`

Client-side lab-report PDF parsing (pdf.js). This is the least obvious code
in the app — see the dedicated [PDF_IMPORT.md](./PDF_IMPORT.md) for the
parsing algorithm, the two real column-binning bugs it was built to avoid,
and the cell-color severity sampling.

### `components/BulkImportPanel.jsx` / `components/BulkImportReview.jsx`

The UI around the parser: a drop-zone (`BulkImportPanel`, max 30 files,
enforced client-side) that parses on demand with a progress bar, then hands
the results to `BulkImportReview` — the mandatory review-before-add modal
(duplicate/unmatched-equipment detection, an inline `EquipmentPicker` to
remap an unrecognized Unit ID, per-sample checkboxes, a save-progress bar).
See [PDF_IMPORT.md](./PDF_IMPORT.md#the-review-before-add-flow) for the
detection logic these two files implement.

## PDF report generation (the other direction)

### `reportGenerators.js`

The inverse of `pdfReportParser.js`: this app _producing_ PDFs, not reading
them. Four downloadable reports (`generateContractorActionReport`,
`generateOilChangeContractorReport`, `generateSampleOverdueReport`,
`generateCombinedReport`, the last one reusing the same three
section-builders as the first three so there's exactly one place that
computes each report's numbers), built with `jsPDF` + `jspdf-autotable`
entirely from data already in memory — no server round trip. Includes a
hand-rolled donut chart, stacked/horizontal bar charts, and table layouts
drawn with raw jsPDF calls (`drawDonut`, `stackedBars`, `horizontalBars`,
etc.) rather than a charting library, matching the rest of the app's
no-heavy-dependencies approach. `Reports.jsx` is the page that drives these.

## Shared components (`src/components/`)

### `Sidebar.jsx`

Left navigation (`NAV`, ported verbatim from the original app's own nav
list — don't reorder/relabel without checking the original first). Shows
the logo, alert/open-action count badges, sync status, and the two sync
buttons. Purely presentational plus that sync-status footer.

### `TopBar.jsx`

The persistent header bar above every page: page title (or `Report:
<unitId>` on the contextual report page), an online/offline indicator
(`navigator.onLine` + `online`/`offline` window events), today's date, an
"Open Sheet" link (if `sheetUrl` is configured), a Sync button, and the
mobile hamburger menu button.

### `Toast.jsx`

Renders the stack of transient notifications (`toasts` array from
`App.jsx`). This is the visible half of the sync-bug fix — it's what shows
the user a save actually failed.

### `ErrorBoundary.jsx`

Standard React error boundary. Catches any render-time exception the app
doesn't otherwise handle and shows a "Something went wrong" screen with a
reload button, instead of a blank white page. Renders outside the
`ThemeProvider`, so it imports the static default-theme `T` from `theme.js`
directly.

### `EquipmentSearch.jsx`

Type-to-filter equipment combobox — the equipment picker reused across
Dashboard, Equipment, Action Tracker, Oil Change Log, Add Sample, and Oil
Report Search. Takes `{code, description}` options, an optional `allowAll`
(prepends an "All Equipment" choice), and a controlled `value`/`onChange`.

### `MultiSelectTags.jsx`

Chip/tag multi-select for "Contractor Action"/"ACC Action" in
`EditActionModal.jsx`, backed by the Action Registry's pick list. Stores
selections as one comma-separated string (the underlying sheet cell is
plain text), since typing something not in the list and pressing
Enter/comma adds it as a free-text chip too — the registry is a pick list,
not a strict enum, so existing historical values that don't match anything
in it still render as their own chip.

### `LineChart.jsx`

Hand-rolled SVG line chart (no charting library), ported from the original
app's own component: a `viewBox="0 0 420 h"`, 5 horizontal gridlines with
value labels, one polyline per series split into separate segments at any
`null` gaps so missing data points don't draw a connecting line across
them. Used by `OilReportSearch.jsx`'s trend charts (Viscosity, Wear,
Contaminants, Physical Properties).

### `DotTimeline.jsx`

Shared "line with dots" visual used by both `OilChangeLog.jsx` and
`SampleTracker.jsx`: a horizontal line, one or more small circular dots
positioned by percentage along it, each always showing a short status
letter, with the full date/detail available as a native `title` tooltip on
hover rather than a permanently-drawn label. Takes `dots: [{pct, letter,
color, tooltip, accent?, accentTooltip?}]`, an optional `todayPct` (a
vertical reference line — used by Oil Change Log, not Sample Tracker), and
an optional `ticks` array (light vertical gridlines at given percentages).
The `accent` flag draws a small purple corner badge on a dot (Sample
Tracker uses this to mark a month an oil change happened, independent of
that month's N/C/A/M sample status).

### `EditOilChangeModal.jsx`

Shared by the Oil Change Log page and the Equipment tab's "Log Oil Change"
flow — only Last Change Date and Next Due Date are ever editable here;
everything else on the row (frequency, oil type, brand, quantity) is
managed directly in the sheet. Computes the new Next Due Date from the
equipment's frequency if left blank (`computeOilChangeNextDue()`).

### `EditSampleModal.jsx`

The Equipment page's "Edit Sample" form — ratings, lubricant properties,
wear metals, alert type, and recommendations for one existing sample. No
sample-ID/date/equipment editing (those are the row's identity, not
editable fields here).

### `EditActionModal.jsx`

The add/edit form for a single action row — all 18 real Action Tracker
fields (see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#action-tracker)), verified
field-by-field against both the live sheet and the original app's edit
form. Local form state only; calls `onSave(formValues)` when the user
clicks Save, and lets the parent decide what "save" means (add vs. update)
and how to handle failure. New actions opened with an equipment code
already known (e.g. from inside a report) get autofilled immediately via
`actionAutofill.js`; editing an existing action leaves its saved values
alone. Setting **Last Change** here also computes an `_oilChangeTarget`
(the matching Oil Change Log row, disambiguated by a lubrication-point
picker if the equipment has more than one) — see
[ARCHITECTURE.md](./ARCHITECTURE.md#best-effort-side-effects).

### `GenerateMonthlyActionsModal.jsx` / `GenerateOilChangeActionsModal.jsx`

Bulk action-creation tools, reached from Action Tracker ("Generate Monthly
Actions") and Oil Change Log ("Generate Oil Change Actions") respectively.
Both compute a candidate list (equipment whose latest sample is
Caution/Alert with no action on record at all; overdue lubrication points
whose equipment has no open action), let the user check/uncheck each row,
then create them one at a time via the same `onAddAction` every other flow
uses — sequential, with a per-row "Saving…/✓/✕" status so a partial-batch
failure is visible rather than silent.

### `LastActionsPanel.jsx`

The "Last N Actions" widget, shared verbatim by the Oil Analysis Report
page and the Oil Report Search page (and conceptually — same data/handlers
— by Action Tracker's own board UI). Handles: filtering actions to one
equipment code, the table, a read-only "view" modal on row click, and
opening `EditActionModal` for add/edit. Delegates the actual save/delete to
whatever `onAdd`/`onUpdate`/`onDelete` it was given — it doesn't know or
care whether those go to Google Sheets or somewhere else.

## Pages (`src/pages/`)

Each page is a function component that receives its data and callbacks as
props from `App.jsx` — none of them fetch data themselves.

| Page                    | Purpose                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dashboard.jsx`         | Systems Overview (equipment-health donut, Action Tracker mini-summary, Oil Change Forecast), Contractor Performance, counting cards, a cross-system "Needs Attention" insight feed, and an Equipment Status table — all scoped by an Area filter and a Contractor filter that combine as an intersection. |
| `Equipment.jsx`         | Single search box → one continuous card per equipment: registry details, full sample timeline (with edit/delete/view-report per sample), oil change history, and actions taken.                                                                                                                           |
| `OilAnalysisReport.jsx` | The contextual per-sample report (opened from Dashboard/Equipment): ratings, wear metals, additives, recommendations, last oil change, a full sample-history timeline for that equipment, and `LastActionsPanel`.                                                                                         |
| `OilReportSearch.jsx`   | The sidebar's standalone "Oil Analysis Report" destination — pick any equipment, see every sample as side-by-side columns (matching the original ExxonMobil report layout) plus trend charts and a condensed Sample Tracker strip.                                                                        |
| `ActionTracker.jsx`     | All actions as a drag-and-drop Kanban board grouped by status, with equipment/month/year/area/contractor filters. Uses the same action CRUD handlers as the report pages, plus "Generate Monthly Actions."                                                                                                |
| `AddSample.jsx`         | Two modes: "Manual Entry" (a form appending one row to `Data_Entry`) and "Import Lab Reports (PDF)" (`BulkImportPanel` — see [PDF_IMPORT.md](./PDF_IMPORT.md)).                                                                                                                                           |
| `OilChangeLog.jsx`      | Every lubrication point plotted on a shared due-date dot-timeline (`DotTimeline`, 30 days back to 90 days ahead), area/contractor filters, group-by-equipment/contractor, "Generate Oil Change Actions."                                                                                                  |
| `SampleTracker.jsx`     | Per-equipment card with an OK/OVERDUE/MISSING status and a monthly dot-timeline (`DotTimeline`) of N/C/A sample history, oil-changed months marked with an accent dot.                                                                                                                                    |
| `Reports.jsx`           | Four downloadable PDF reports (see `reportGenerators.js` above), each with a live contractor-scoped preview before generating.                                                                                                                                                                            |
| `HowToUse.jsx`          | Static help content (`howtoTopics.js`) — a side-nav of topics, each an accordion of numbered steps, ported from the original app's own help text.                                                                                                                                                         |
| `Settings.jsx`          | Two tabs: Appearance (theme picker, no password) and Configuration (password-gated — see "Known gaps" in ARCHITECTURE.md — webhook/sheet URL, Equipment Registry sync with a reconciliation UI, the sampling-interval editor, Action Registry sync, App Status, export/import/reset/clear-cache).         |

## Where to make a change

- **Add a field to actions/samples/oil changes**: update the relevant
  `rowTo*`/`*ToRow` pair in `parsers.js` first (matching the real sheet
  column — see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md)), then add the field to
  the relevant form (`EditActionModal.jsx`, `AddSample.jsx`, or
  `EditSampleModal.jsx`) and display it wherever relevant.
- **Change how a write is verified**: `api.js`, in the specific
  `save*`/`update*`/`delete*` function.
- **Change styling**: `theme.js` — colors and shared style objects only;
  component-specific one-off styles live inline in that component. Adding
  a new palette means adding a full new entry to `THEMES` with every key
  the others have (missing a key silently renders `undefined` for that
  color in that theme).
- **Add a page**: create it under `src/pages/`, add a nav entry in
  `Sidebar.jsx`'s `NAV` array, wire it into the `page === "..."`
  conditionals in `App.jsx`, and add its title to `TopBar.jsx`'s
  `PAGE_TITLES`.
- **Change the PDF import's parsing rules**: `pdfReportParser.js`'s
  `FIELD_ROWS` — see [PDF_IMPORT.md](./PDF_IMPORT.md) before touching
  `binToColumns()`/`joinItems()` themselves, since both exist to fix two
  specific, previously-real bugs.
- **Add/change a downloadable PDF report**: `reportGenerators.js` — reuse
  the existing `sectionTitle`/`statStrip`/`drawDonut`/`horizontalBars`/etc.
  helpers rather than hand-drawing a new report from scratch.

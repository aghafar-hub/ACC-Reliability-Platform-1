# ACC Reliability Platform — Design Reference

The Oil Lubrication module (redesigned on the test copy, design rounds D1–D5,
F, G, H) is the **reference for every module**. Vibration, My Work,
Reliability Measures, Compressors and anything new must look and behave the
same way. When in doubt, open the Oil Lubrication page that does the same job
and copy its pattern.

Code lives in `apps/oil-analysis/src` (module) and `frontend/src` (shell).
Reuse these components; don't hand-roll a new variant. A module in its own
app (e.g. `apps/vibration-analysis`) copies the component file across as is,
same name and props, so the two stay identical.

---

## 1. Page layout

Every page, top to bottom:

1. **Header row**: page title (`s.sectionTitle`) with a one-line subtitle in
   `T.textSecondary` that states the live numbers (e.g. "4 active products ·
   1,880 L in stock · 1 low"). Page-level controls sit on the right:
   contractor chips, then the primary button (e.g. "Create Route").
2. **Summary**: a row of tiles and/or charts that answer "what needs me?"
   before any list. Example: Actions shows a stage donut, open actions by
   area, and Past due / No owner tiles.
3. **Filters**: one row above the list. Every filter on the page affects
   every chart and the list.
4. **The list / board / table.** Rows open the record; tables scroll
   sideways inside their own card on a phone, never the page.

Empty spaces in a card row get filled with a useful chart, not left blank.

## 2. Navigation (shell)

- Module pages are **tabs across the top** (`MODULE_TABS` in
  `frontend/src/navigation.ts`). Related pages share a tab with a views
  sub-row; rarely used pages go under **More**. On a phone, the tabs become a
  page picker.
- The phone **bottom bar** has the quick ＋ sheet (`quickActions.ts`).
- Records are findable from the **global search** (Ctrl K) through
  `embeddedNav.search`.
- Inside a page, sub-pages use **underlined tabs with counts** (see Oil
  Inventory's `TabBar`). These are buttons, not a `role="tablist"`.

## 3. Components to reuse

| Need | Component | File |
|---|---|---|
| Any form popup (create / edit) | `ModalShell` + `FormSection` (+ `StepTrail` for a workflow, `ReadValue` for locked values) | `components/ModalShell.jsx` |
| Phone filters / short choices | `BottomSheet` + `SheetGroup`, `SheetChip`, `SheetButton` (Reset · Show N …) | `components/BottomSheet.jsx` |
| Phone list page parts | `PhoneSummary` (+ `SummaryBar`), `ChipRow`, `CountChip`, `FiltersPill`, `ShowMore` (50 at a time) | `components/PhoneParts.jsx` |
| Contractor switch | `ContractorChips` ("All contractors · RHI · ASEC") on every filter row, and `allLabel={null}` (RHI · ASEC) in forms; `ContractorTag` for a Location / contractor cell. Never a contractor dropdown. | `components/ContractorChips.jsx` |
| Any ID filter or picker (Equipment ID, Lub ID, Vib ID…) | `EquipmentSearch`: a dropdown you type into, in one box. Pick mode for forms; `freeText` for list filters (typing filters, the dropdown suggests IDs, a picked ID shows that one only — `idTextMatch`). Never a plain `<select>` of IDs or a search box without the dropdown. Shell: `IdSearch`. | `components/EquipmentSearch.jsx`, `frontend/src/components/IdSearch.tsx` |
| Kanban board (actions) | Oil Actions board: uppercase column title with a 2px stage-colour underline and count, white cards with a 3px stage-colour left edge, dashed "No actions here"; each column scrolls inside (`min(640px, 100vh − 220px)`) | `oil-analysis/src/pages/ActionTracker.jsx`, `vibration-analysis/src/pages/VibActions.jsx` |
| Number tiles | `InvTile` pattern: icon square, big number, label, sub-line, coloured left border when it needs attention, clickable to the list behind it | `pages/OilInventory.jsx`, `pages/TeamWorkload.jsx` (`Tile`) |
| One total split into parts | `Donut` with its legend beside it (numbers in text) | `components/DashCharts.jsx` |
| Parts per row (per area / technician / contractor) | `StackedBars` (tap a row to filter) | same |
| Progress to a target | `Ring`, `TargetBar` | same |
| A count per month | `MiniBars` (current month pale; a bar may carry its own `color`) | same |
| Two counts per month (opened vs closed) | `PairBars` (Vibration) / recharts `BarChart` (Oil) | same |
| Days of stock left | `Runway` | same |
| How full one stock is | `Gauge`, or the inline `StockMeter` in tables | same / `OilInventory.jsx` |
| Work per day ahead | `CalendarHeat` | same |
| This month planned vs done | `MonthProgress` | same |
| Trend over time | recharts `ComposedChart` + `Area type="monotone"`, dots, gradient fill; current partial month dashed | `OilInventory.jsx` consumption trend |
| Lab trend charts | `LabTrendCharts` (shared by report and point page; oil changes as a dotted line with an oil-drop symbol) | `components/LabTrendCharts.jsx` |
| Events on a timeline | one line with symbols: Normal ●, Caution ▲, Alert ◆, oil change = drop, top-up ⊕ | `components/PointHistory.jsx` |

## 4. Form popups

- Always `ModalShell`: icon, title, subtitle (record id · equipment), a status
  pill, body sections as `FormSection` cards, **footer that stays in view**
  with Cancel and the primary action. The destructive action (Delete) goes on
  the far left of the footer.
- Drawn on `<body>` (portal) so the shade covers the whole app; full screen on
  a phone; Esc and ✕ close it.
- Opens **over the page it came from**, never a blank page.
- Values the user can't change (worked out, locked) show as a read-only
  summary box, not as greyed-out inputs.
- A workflow record shows its steps (`StepTrail`, e.g. Draft → Open →
  Waiting Stoppage → Closure Requested → Closed).
- Picking many items: **two panes**, available (search + filters + tick
  boxes) | selected (count, remove ✕, clear). Filters narrow both the list and
  any "recommended" pre-selection, and reset when the type changes.

## 5. Colour

- Theme tokens only (`T.accent`, `T.success`, `T.warning`, `T.danger`,
  `T.info`, `T.textPrimary/Secondary/Muted`, `T.cardBg`, `T.appBg`,
  `T.cardSubBg`, `T.border`). Never hard-code a colour that a token covers.
  Charts must work in all 5 themes (incl. dark and High Contrast).
- **Status colours are fixed per status everywhere**, the same as the
  board columns: Draft = warning, Open = danger, Waiting Stoppage = accent,
  Closure Requested / To approve = info, Closed = success. Lab results:
  Normal = success, Caution = warning, Alert = danger.
- **Vibration levels (4):** Normal green ●, Caution amber ▲, Alert red ◆,
  Danger purple ■ (`apps/vibration-analysis/src/levels.js`, tokens
  `lvNormal…lvDanger` per theme, checked for colour-blind separation).
  `levelColor` for marks, `levelInk` for text.
- **Categories (contractors, oils, series)** use the categorical palette
  `SERIES_LIGHT` / `SERIES_DARK` (`pointHistory.js`) in fixed order. A
  contractor keeps its colour on every chart (ASEC = slot 0 blue, RHI =
  slot 1 orange).
- Charts with several statuses use several colours — not shades of one blue.
  Use a one-hue light → dark ramp only for a true amount (e.g. a heat map).
- Colour is never the only signal: every chart has its numbers in text, a
  legend, a shape or an icon.

## 6. Chips, buttons, text

- Choices of 2–5 options are **chips** (round, filled accent when on), not
  dropdowns — contractor, period, kind filters, All / Unread. Dropdowns are
  for long lists (areas, oils, months).
- Contractor accounts see only their own contractor: hide the contractor
  chips (the component does this when there is one option) and lock any
  contractor / location field to theirs.
- Minimum text 12 px; numbers that matter are 22–26 px bold.
- Icons: Tabler (`ti ti-*`) in the module apps, the shell's own SVG set in
  `frontend/src/icons.tsx`.

## 7. Data rules that shape the design

- **Oil stock location = contractor store (RHI / ASEC).** A product added by a
  contractor goes to its own store; ACC picks the store with chips.
- Every filter affects every chart on the page.
- Missing lab values are left out of charts, never drawn as 0.

## 8. Phone (≤860 px; mobile app design, M1–M3)

- **Header:** module or page name, search, sync and the bell. Settings,
  account, language and sign-out are in **More**.
- **Bottom bar:** Home · Equipment · ＋ · My Work · More.
- **More is a hub** (step 6, `src/mobile/MoreSheet.tsx`), the same size
  with two modules or ten: search (pages and Lub / Vib IDs), Recent pages
  (`src/mobile/recent.ts`), one tile per module (red badge = My Work items
  waiting for you), the platform pages as chips, then the account row with
  Settings · EN / عربي · Log out. Tapping a tile slides to that module's
  pages; Back returns to the hub.
- **＋ sheet:** ★ Most used (top 2, counted on this device) first, then the
  entries grouped under each module's name.
- **Module pages:** a **Module name ▾** button (opens "Switch module" with
  the badges), then the module's pages as chips with **full names** — as
  many as fit (3, 2 or 1, open page always shown) — and **More ▾** for the
  rest, which opens the hub straight on that module. No sideways swipe.
  Switching module keeps the same kind of page (Dashboard → Dashboard).
- **Back:** every sheet, popup and panel adds a history step
  (`useBackClose` in `src/mobile/useBackClose.ts`), so the iPhone swipe and
  the Android back button close it instead of leaving the page. Nested
  sheets (hub → module pages) close one level at a time.
- **Scrolling:** the page itself scrolls (no inner scroll box), so the
  browser bar collapses and a status-bar tap goes to the top. Each page's
  scroll position is kept for the visit (`ScrollKeeper`).
- **Keyboard:** `--app-vh` follows the visible height. The bottom bar
  hides while typing, and full-screen forms keep their footer above the
  keyboard (`src/mobile/viewport.ts`).
- **Updates:** a "New version ready — Reload" prompt replaces the silent
  reload, and asks the person to finish an open form first
  (`UpdatePrompt.tsx`).
- No sideways page scroll at 360 px and 390 px; tables scroll in their card.
- **No zooming, ever:** the viewport doesn't scale, pinch and double-tap
  are blocked, and every field uses 16 px text on a phone (iPhone zooms
  into smaller fields when they get focus). Never set a phone field below
  16 px.
- Tile and chart grids use `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`.
- Popups are full-screen sheets that close with Back.
- **Lists are cards, not tables** (M2): code + status badge with its symbol
  (● ▲ ◆) on the first line, name, then the reason in the status ink. The
  list keeps its desktop `data-testid`s. A summary bar (% good + health
  bar) sits above, charts open from it.
- **Filters:** one row of chips (most used choices + a **Filters** chip
  with the count of active ones). The rest live in a `BottomSheet` whose
  footer says what you'll get ("Show 611 equipment").
- **Machine / record pages:** the main actions sit in a bar pinned above
  the bottom bar (portalled to `body`: the shell's embedded box uses
  `contain: layout`, which traps `position: fixed`). It hides while typing.
- **Form popups** (`ModalShell`): full screen, footer pinned with buttons
  at 44 px; a field that spans two grid columns on desktop spans the one
  column on a phone.
- **Lists before charts** (M3, every list page in both modules): a
  `PhoneSummary` line with the 2–3 numbers that matter ("72 open · ◆ 50
  past due · ▲ 72 no owner") replaces the tiles and charts; tapping it
  opens them. The list is on the first screen.
- **Boards** (Actions, Oil Changes, Sampling Log, Vibration Actions): one
  column at a time, picked from a `ChipRow` of `CountChip`s with the count
  in the column's colour — no stacked columns with their own scroll boxes.
- **Long lists** show 50 cards, then "Show 50 more · N left" (`ShowMore`).
- **Tables that are lists of records** carry `data-phone-cards` (and
  `phone-cards-box` on their card): on a phone each row is a card, the
  first cell its title and the rest "Label  value" lines; labels come from
  the header (`phoneCardTables.js`). Number grids (readings H / V / A…)
  stay tables that scroll in their card.

## 8b. Plant overview (Home) and platform Equipment

- **Home** (`/`, `pages/PlantOverview.tsx`) joins every module: machine
  condition, Needs attention across modules, a card per module with a
  **Dashboard ›** link into that module, open actions by area and the work
  due in the next 5 weeks. ACC staff land here; contractors still land on
  My Work and see only their own machines.
- **Equipment** (`/equipment`, `/equipment/:id`, `pages/PlantEquipment.tsx`):
  every machine once, worst first, then one page per machine — overall
  condition first, then a panel per module with **Open in … ›**.
- **One machine = one Equipment ID.** These pages name machines by
  Equipment ID only (no LP-… or VIB-… point codes); the name is a hint.
- **Overall condition = the worse of the modules, as Good / Fair / Poor.**
  Vibration maps Normal → Good, Caution → Fair, Alert and Danger → Poor;
  each module panel keeps its own word (■ Danger stays visible there).
- **Data:** each module builds its part (`apps/*/src/plantSummary.js`) from
  the data it already holds and hands it over the navBridge
  (`onPlant`); the shell keeps a per-user copy on the device
  (`frontend/src/plant.ts`). A new module adds a `plantSummary.js` with the
  same shape and one entry in `PLANT_MODULES`.

## 8c. Arabic (right-to-left)

- One translator for the whole page (`frontend/src/i18n/translator.ts`):
  any text, placeholder, aria-label or title whose English is in the word
  list (`i18n/terms.ts`, overridden by Platform Core's TRANSLATIONS sheet)
  shows in Arabic. **Write UI words as whole phrases** (one text node) so
  they can be translated; put numbers in their own element or use a
  `{n}` pattern in the word list.
- New UI words go into `i18n/terms.ts` with a first Arabic suggestion; the
  App Owner adds them to the sheet from Settings → Language.
- Mark anything that must never be translated with `data-no-translate`.
- Codes and numbers stay left-to-right (monospace codes, `.plant-code`,
  charts); every line keeps its own reading order (`unicode-bidi:
  plaintext`), so English data inside Arabic pages reads correctly.
- Use logical CSS (`margin-inline-start`, `inset-inline-end`) for new
  layout so it mirrors by itself.

## 9. Checklist for a new or redesigned page

- [ ] Header with live-number subtitle; controls on the right.
- [ ] A summary row (tiles / charts) above the list, no empty gaps.
- [ ] Contractor chips if the page covers both contractors.
- [ ] Every ID filter is `EquipmentSearch` (type and pick in one box).
- [ ] Forms in `ModalShell` with `FormSection`s and a sticky footer.
- [ ] Status and contractor colours as in §5.
- [ ] Works in all 5 themes and at 390 px wide; no console errors.
- [ ] Page reachable from the module tabs (and global search if it has records).
- [ ] Playwright check added to the test-copy suite.

## One rule per element (both modules)

| Element | Rule |
|---|---|
| Page title | `<p>` in `s.sectionTitle` (22px Space Grotesk), left, 12.5px subtitle under it. Dashboards 26px / 14px. Never an `<h1>` (the shell underlines those). |
| Sub-pages of a page | Underlined tabs (Oil Inventory's TabBar): 13.5px, 600 / 700 when on, 3px accent underline, count badge. |
| Filters and view switches | Round chips: radius 999, 12.5px, padding 6px 14px; on = accent fill, white text, 700. Contractor = `ContractorChips`. |
| Buttons | `s.btn` (neutral) / `s.btnPrimary` (accent): radius 6, 13px. |
| Inputs, selects | radius 6. |
| Cards | `s.card`: radius 10, padding 20. |
| Tables | Full-page lists: 15px (inherit). Compact tables inside dashboard cards and dense lab grids: 12.5–13.5px. |
| Smallest text | 12px. |

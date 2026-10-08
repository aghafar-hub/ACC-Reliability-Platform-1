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
| Contractor switch | `ContractorChips` ("All contractors · RHI · ASEC"); `ContractorTag` for a Location / contractor cell | `components/ContractorChips.jsx` |
| Number tiles | `InvTile` pattern: icon square, big number, label, sub-line, coloured left border when it needs attention, clickable to the list behind it | `pages/OilInventory.jsx`, `pages/TeamWorkload.jsx` (`Tile`) |
| One total split into parts | `Donut` with its legend beside it (numbers in text) | `components/DashCharts.jsx` |
| Parts per row (per area / technician / contractor) | `StackedBars` (tap a row to filter) | same |
| Progress to a target | `Ring`, `TargetBar` | same |
| A count per month | `MiniBars` (current month pale) | same |
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

## 8. Phone

- No sideways page scroll at 390 px; tables scroll in their card.
- Tile and chart grids use `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`.
- Popups are full-screen sheets; the bottom bar stays.

## 9. Checklist for a new or redesigned page

- [ ] Header with live-number subtitle; controls on the right.
- [ ] A summary row (tiles / charts) above the list, no empty gaps.
- [ ] Contractor chips if the page covers both contractors.
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

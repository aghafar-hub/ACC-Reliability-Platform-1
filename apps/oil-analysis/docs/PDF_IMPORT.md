# Bulk PDF lab-report import

Add Sample → **Import Lab Reports (PDF)** lets you drop up to 30 lab-report
PDFs at once and have every sample in each one's history table parsed,
reviewed, and appended to `Data_Entry` — instead of typing each sample in
by hand. This document explains how it works and why, since the parsing
logic (`src/pdfReportParser.js`) is the least obvious code in this app.

## Why this is entirely client-side

This app has no backend of its own — see
[ARCHITECTURE.md](./ARCHITECTURE.md) — so "parse a PDF" and "process in the
background" both have to mean "in the browser tab, with a progress
indicator," not a server job. Parsing runs entirely in the browser via
[`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (Mozilla's PDF.js,
also what Firefox's built-in PDF viewer is built on).

**Pinned to `^4.10.38`, not latest.** The 5.x/6.x releases at the time this
was built depend on `Map.prototype.getOrInsertComputed`, a brand-new
"Upsert" JS API most real-world browsers don't support yet — loading them
threw `__privateGet(...).getOrInsertComputed is not a function` in actual
browser testing. `4.10.38` has none of those calls. Re-check this before
ever bumping the dependency: `grep -rn getOrInsertComputed
node_modules/pdfjs-dist/build/` on the candidate version — if it's not
empty, don't upgrade yet.

## The parsing problem

The source PDFs (an ExxonMobil "Sample Data & Trends" lab report export)
have no tagged table structure — just positioned text items and colored
rectangles, however the browser that printed the PDF happened to lay them
out. `pdfjsLib.getDocument(...).getPage(1).getTextContent()` returns a flat
list of `{ str, transform }` items with no row/column information at all.
`parsePdfReport()` in `pdfReportParser.js` reconstructs the table from
scratch:

1. **`buildRows()`** groups text items into rows by rounded y-position
   (±2pt tolerance — rows are ~13–14pt apart, comfortably separated).
2. The **"Sample ID" row's item x-positions become that page's column
   anchors** — every report has one, IDs are always present, and there are
   up to 5 sample columns (oldest → newest, left to right) spaced ~41–42pt
   apart.
3. Every other row's data items are bound to a column via
   **`binToColumns()`**, then joined into cell text via **`joinItems()`**.

Both of those functions exist because of real, specific failures found by
testing against actual uploaded reports — not hypothesized edge cases.
Understanding them means understanding the bugs they fix:

### `joinItems()`: only insert a space where the PDF actually has a gap

pdf.js splits a line into several same-style text runs even with **no
space** in the source text — a Unit ID like `"123.BC100"` comes back as
three separate items: `"123."`, `"BC"`, `"100"`, with **zero** gap between
each one's end and the next one's start. Naively joining every item in a
row with `" "` (the first version of this code did) turned that into
`"123. BC 100"`.

The fix measures the actual x-gap between consecutive items: a real space
in the source PDF measures **~1.5–1.7pt**; tightly-kerned characters within
one word measure **0pt**. `joinItems()` only inserts `" "` when the gap
exceeds `0.5`. This is used both for the header block (Unit ID,
Description, etc. — `parseHeaderFields()`) and for table cells
(`binToColumns()`).

### `binToColumns()`: interval assignment, not nearest-anchor

The first version of this bound each item to whichever anchor was
numerically **closest** to its x-position. This looked reasonable but
produced two real, confirmed-by-testing bugs:

- **Sample dates landed in the wrong column.** A "Sampled" cell like
  `"04 Jun 2024"` is three tokens (day, month, year) spanning almost the
  full column width. The year token, sitting near the right edge of its
  own column, measured numerically **closer** to the _next_ column's
  anchor than to its own — so `04 Jun` bound correctly to column 0 while
  `2024` got misfiled into column 1, corrupting the parsed date (a
  real observed case produced the year "2001" instead of "2024" —
  nowhere near either the correct year or a plausible typo, which is what
  made it clear the binning itself, not just a display bug, was wrong).
- **Sample IDs merged into one cell.** An 11-digit Sample ID nearly fills
  its entire column (leaving as little as ~0.5pt to the next column's
  anchor) — an even smaller gap than the ~1.5pt intra-cell word-space gap
  in the date row above. No single fixed "gap size" threshold can
  correctly separate "same cell" in one row from "different cell" in
  another when the actual gap sizes overlap like that (a clustering
  approach — grouping items by gap size before assigning columns — was
  tried and rejected for exactly this reason; it fixed the date bug but
  then merged all 5 Sample IDs into a single cell).

The actual fix: since columns are **left-anchored, not centered**, assign
each item to the **rightmost anchor that is `<= item.x`** — an interval
test (`column i owns [anchor_i, anchor_i+1)`), never "which anchor is
numerically closest." This gets both cases right without any clustering or
per-row-tuned threshold, because it only ever asks "which column's span
contains this x," not "which anchor is nearest." A small epsilon (1pt)
guards against float rounding at an exact boundary, and the **last**
column (which has no next anchor to bound it) keeps a `colWidth * 0.6`
max-distance cutoff to still drop the trend charts' legend labels and axis
ticks, which sit at roughly the same row heights as real table rows to the
right of the table.

If you're extending this parser and a value comes out in the wrong column
or with a mangled string, dump the raw items first (see "Debugging the
parser" below) before changing the binning/joining logic — both of the
above bugs looked like "just add a space" or "just widen the tolerance"
fixes at first glance, and both of those naive fixes broke a different real
case.

## What gets extracted

- **Header fields**: Unit ID, Description (`parseHeaderFields()`) — bounded
  at the _next_ recognized label (`ANY_HEADER_LABEL_RE`) rather than to the
  end of the row, since the account/sample/equipment info panels sit side
  by side and multiple labels can land on the same row.
- **Every sample column** in the visible history table (oldest → newest),
  not just the latest — `FIELD_ROWS` maps each row label (matched by
  normalized prefix, so `"Particle Count >4um"` vs `"Particle Count>4um"`
  don't need an exact match) to a schema field and a coercion (`text` /
  `date` / `num`).
- **Per-cell severity**, for any field marked `flaggable` in `FIELD_ROWS`
  (the wear metals, contaminants, additives, Visc, Oxidation, Water, TAN) —
  see "Cell color sampling" below. This is what populates `Data_Entry`'s
  Flagged Parameters column (see
  [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#data_entry-samples)).
- **Recommendation/Comments text**, only for the newest (rightmost) sample
  — the PDF doesn't print it for older history columns —
  `extractRecommendationSections()` scans pages after the first for a
  "Recommendation/Comments" heading through to "Sample Timeline".

Deliberately **not** extracted, per explicit product decision: Equipment
Age, Oil Age, Make-up Volume, Oil Changed, Filter Changed — always blank in
these reports and not part of this app's sample schema.

## Cell color sampling (Flagged Parameters)

A sample's overall ratings (Contamination/Equipment/Lubricant Rating) are a
rollup — they don't say _which_ specific wear metal or contaminant is the
problem. The lab report conveys that with cell background color instead
(a warm red for Alert, gold/yellow for Caution), so `parsePdfReport()`
renders the page to an off-screen canvas (`renderPageCanvas()`, 2x scale)
and samples pixels near each flaggable cell's position
(`sampleCellSeverity()`): four points offset from center (to avoid landing
on glyph ink), classified by `classifyColor()`'s RGB thresholds, majority
vote wins. This was verified against real rendered pixels in an actual
browser (not just designed by inference) during end-to-end Playwright
testing — it correctly produced flags like `"Visc:Alert,Cu:Alert,Fe:Caution,Si:Alert"`
for a real Alert-rated sample and no flags at all for Normal-rated ones.

## Failure handling

Every failure mode surfaces a specific, actionable error rather than
silently mis-parsing or dropping data — `parsePdfReports()` (the batch
wrapper) catches per-file and returns `{ok: false, fileName, error}` for
each failure, shown as a red banner in the review popup while the other
files in the same batch still parse normally:

- **No selectable text at all** (`tc.items.some(it => it.str.trim())`
  false): some PDFs — confirmed via one real uploaded report — are
  generated by a "Print to PDF" virtual printer driver rather than a
  browser's own "Save as PDF," and can have a broken/non-standard font
  cmap that defeats text extraction even though the page displays normal
  text visually. Building OCR support for this was explicitly scoped out
  as too large an undertaking for what appears to be a rare case; the
  error tells the user to re-export instead.
- **No Unit ID found**, **no "Sample ID" row found**, **no sample columns
  found** — each throws its own descriptive error naming what's missing,
  in case a future report format doesn't match the assumptions above.

## The review-before-add flow

Per explicit product requirement, nothing is written to the sheet until
the user reviews and confirms. `BulkImportPanel.jsx` orchestrates: pick
files (max 30, enforced client-side) → `parsePdfReports()` with a progress
callback → `BulkImportReview.jsx` modal → confirm → sequential save with
its own progress bar.

`BulkImportReview.jsx` flattens every parsed report's samples into one
list, each annotated by `buildCandidates()`:

- **`duplicate`**: does this exact equipment+Sample ID pair already exist
  in `Data_Entry` (the same key `_matchCols: [0, 2]` uses for everything
  else — see [SHEET_SCHEMA.md](./SHEET_SCHEMA.md#data_entry-samples))?
  Pre-unchecked and shown as "already saved — skipped" if so.
- **`matched`**: does the sample's `unitId` (straight from the PDF's Unit
  ID field) exist in the Equipment Registry? If not, it's flagged
  "unrecognized equipment code" with an inline `EquipmentPicker` — search
  the real registry and remap the sample to the correct code. A remapped
  sample is **not** auto-selected; the user has to explicitly check it
  after confirming the remap is correct.

Samples are grouped by (remapped, if applicable) equipment code in the
review UI. Confirming calls `App.jsx`'s `onBulkAddSamples`, which:

1. Saves each selected sample **sequentially**, not in parallel — the
   backend's `append` handler finds "the first truly empty row after the
   data-start row" via a linear scan with no locking, so two concurrent
   appends could collide on the same target row.
2. After each save, also fires `updateSampleTracker` for that sample's own
   month — including for backfilled older samples, each into its own
   historical tracker column, not just the newest sample into the current
   month. Best-effort: a tracker-update failure doesn't undo the sample
   save, just surfaces its own toast.
3. Runs one full `runSync()` at the end of the whole batch, rather than
   after every sample (which is what the single-sample `AddSample` flow's
   `applySampleTrackerSideEffect` does) — avoids up to ~150 redundant full
   syncs in a large batch.

## Debugging the parser

If a report parses incorrectly, don't guess from the rendered app — dump
the raw positioned text items first, since almost every bug here has come
from a wrong assumption about x/y positions or gaps, not from the
higher-level logic:

```js
// Node, using the legacy (non-worker) build — no canvas needed for this:
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
const pdf = await pdfjsLib.getDocument({ data: fs.readFileSync(path) }).promise;
const tc = await (await pdf.getPage(1)).getTextContent();
for (const it of tc.items) console.log(it.str, it.transform[4], it.transform[5], it.width);
```

Compare the real x/width values for the row in question against
`FIELD_ROWS`' label-matching and `binToColumns()`'s anchor logic before
changing either — see "The parsing problem" above for the two real bugs
this exact approach found and fixed.

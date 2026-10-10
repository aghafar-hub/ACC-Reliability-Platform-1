# Vibration report import

Vibration Log → open the month's report → **Import report file**. The
button shows while the report can be edited: a Draft or Returned report for
its contractor, or a report in ACC review for ACC.

The contractor's PDF is read in the browser. A check screen lists every
machine before anything is saved.

## Files

- **RHI:** one PDF per line (Line 1, Line 2). The Word report must be saved
  as PDF.
- **ASEC:** one PDF, or the month in two files. Pick both files together;
  the machines are merged.
- A file of the other contractor is refused. A file of another month or line
  gives a warning; machines of another line are skipped.
- A scanned PDF (no text) can't be read. The contractor must send the PDF
  saved from Word.

## What is read

| | RHI | ASEC |
|---|---|---|
| Readings | the "Overall vibration" tables. The last "Equipment overall vibration" table wins over the per-machine tables | the "Abbreviated Last Measurement Summary" of each machine (`M1H - Motor Outboard Horizontal .993 mm/Sec`, `… Peakvue … G-s`) |
| Condition | "Measurement summary": ALARM → Alert, Caution, Under observation → Caution | "Problems description": Unacceptable → Danger, Unsatisfactory → Alert, Satisfactory → Caution, Good → Normal |
| Recommendation | Action Plan of the summary table | "Recommendations:" bullets of the machine, else those of the problems table |

The reading date is each row's DATE (RHI) or the machine heading's date
(ASEC).

## The check screen

Tiles at the top:

- **New readings:** these will be added, or will replace the report's
  reading for the same VIB ID and date.
- **Already in the app:** the same VIB ID, date and values are saved in
  this report or another one. A report often repeats the last reading of a
  machine not measured this month. These are not added again.
- **Saved with another value:** another report has this VIB ID and date with
  a different value. That value is not changed; the row is listed in
  **Issues (Excel)**.
- **Need a fix:** not saved until fixed or skipped.
- **Skipped:** another contractor's machine (for example ASEC machines in an
  RHI report), another line, or a velocity with no direction.
- **Recommendations:** saved with the report.

Per machine:

- **Machine:** found by Equipment ID, else by name. If it isn't found, pick
  it from the list or skip it.
- **Condition:** a list; the report's own word is shown beside it. It goes
  on the machine's worst point. The other points keep their system status,
  never above the condition.
- **Recommendation:** text you can edit.
- Each reading row: the point as written in the report, the VIB ID (a list),
  the date, the values (editable), the system status, the report status, and
  what happens to the row.

Problems the screen asks you to fix:

- the machine is not in the app;
- it has no VIB IDs;
- no VIB ID fits the point, or more than one fits;
- the report has two sets of H/V/A under one bearing name;
- a velocity has no direction (RHI gear points "1 … 6");
- there is no date, or the date is after the report month.

**Issues (Excel)** downloads every problem, skipped row and "other value"
row, so it can be sorted out later.

**Save** sends only the new and corrected readings (`mode: merge`). The
report's other readings stay as they are. The conditions and
recommendations go to the sheet **Vibration Report Recommendations**.

## After approval

When ACC approves the report, the machines that need an action get the
report's recommendation as **Contractor recommendation**, written as
`YYYY-MM: text`. This is the same text that shows on the machine page as
"Last report recommendation".

A newer report replaces an older imported text. A recommendation typed in
the app is never overwritten. Each finding keeps its own month's
recommendation.

The report page has a **Recommendations** tab listing them.

## Code

- `apps/vibration-analysis/src/import/`
  - `textLines.js`: text lines, dates and numbers.
  - `rhiReport.js`: the RHI tables. Merged cells are matched to their rows
    by centring.
  - `asecReport.js`: the ASEC text.
  - `matchReport.js`: matches machines and VIB IDs, works out statuses,
    finds duplicates, and decides what to save.
  - `readReportFile.js`: pdf.js, loaded only when someone imports.
- `pages/VibImportReport.jsx`: the pick and check screens.
- Apps Script (`VibrationLog.js`):
  - `saveVibEntries` takes `mode: "merge"` and `recommendations`.
  - `getVibReport` returns `recommendations`.
  - `getVibEntriesFor` returns the readings of a list of machines (the
    duplicate check).
  - A machine's line falls back to the VIB ID Registry's Area when the RMS /
    SPM Register has no line.
- `VibActions.js`: approval fills "Contractor recommendation"; findings get
  a "Recommendation" column.

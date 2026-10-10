# Vibration Reports

Vibration Analysis → **Reports** (under "More ▾"). It is the same page as
Oil Reports, built from the same parts and colours. Everything is made in the
browser from the data the other Vibration pages already load. Nothing is
saved or sent.

## Ready-made reports

| Card | Preview | PDF / file |
|---|---|---|
| Contractor Action Status | open actions by stage | Open Actions by Stage + Past Due / No Owner (PDF or Excel) |
| Measurement Overdue / Missed | Overdue · Never measured · Due now · On time | Overdue / Never Measured + Contractor On-time % for the last 12 months (PDF or Excel) |
| Machines in Alert / Danger | Normal · Caution · Alert · Danger · Not read (window from Settings, default 6 m) | Condition by Area + Machines in Alert / Danger (PDF or Excel) |
| Monthly Activity Summary | machines measured, reports approved, actions opened / closed in the chosen month | PDF or CSV |

The "Reports for" chips (All contractors · RHI · ASEC) apply to every card.
Contractor accounts see only their own contractor and get no chips.

## New Report (builder)

1. Contractor: both, RHI or ASEC.
2. Period: last 3, 6 or 12 months. It applies to coverage, on-time %, the
   reports in the period, and actions closed.
3. Sections, in five groups:
   - **Machine Condition:** Condition by Area · Machines in Alert / Danger ·
     Status Changes
   - **Measurement Coverage:** Overdue / Never Measured · Coverage by Area
     (% per month) · Contractor On-time %
   - **Survey Reports:** Reports in the Period · Not Yet Approved
   - **Actions:** Open Actions by Stage · Past Due / No Owner · Closed in the
     Period
   - **Routes & Follow-ups:** Open Routes · Follow-up Readings Due (next 30
     days)
4. **Generate PDF** gives one page per section, with charts.
   **Generate Excel** gives one sheet per section, data only.

## Code

- `apps/vibration-analysis/src/vibReportData.js` holds every section and its
  rows, plus the card previews. It is the one list that drives the PDF, the
  Excel and the previews.
- `apps/vibration-analysis/src/vibReports.js` makes the PDF (jsPDF) and the
  Excel (ExcelJS). It loads only when someone downloads.
- `pages/VibReports.jsx` is the landing page. `pages/VibNewReport.jsx` is the
  builder.
- Apps Script: `ModuleAccessConfig.js` adds the `reports` tab and lets it
  read the dashboard, tracker, actions, log and routes. No new endpoints.

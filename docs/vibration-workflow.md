# Vibration Analysis — workflow rules (redesign)

The rules the redesigned Vibration Analysis module follows, taken from the
ACC Vibration Workflow and the decisions agreed with ACC. Each step of the
redesign adds its part here. Pages follow `docs/design-reference.md`.

## Severity

Four levels, everywhere: **Normal ●, Caution ▲, Alert ◆, Danger ■**
(colours: success, warning, orange `alert`, danger).

- **System status** comes from the equipment's limits:
  - RMS: the highest of H / V / A against the RMS Register limits (2.8 / 7.1 / 18 mm/s by default).
  - SPM: HDm against the SPM Register limits (20 / 35 / 50 dBsv by default).
  - G's: no limits.
- **Report status** is what the contractor's report says. Other words map onto the four levels:
  - Good → Normal
  - Satisfactory / Under observation → Caution
  - Unsatisfactory / Alarm → Alert
  - Unacceptable → Danger
- **Final status = the report status when given, otherwise the system status.** Both are kept, and **≠** marks where they differ.

## Vibration Log (step 1)

**What makes a report**
- One report per **contractor + scope + month**. RHI sends one report for Line 1 and one for Line 2; ASEC sends one for the Cement Mills.
- A second report for the same contractor, scope and month is refused.

**Readings**
- Readings are stored one row per **VIB ID**:
  - RMS: H / V / A in mm/s.
  - SPM: HDm / HDc in dBsv.
  - G's: in g.
- Until the Excel import is built, readings are typed on the report page.
- Checks on save:
  - the VIB ID must belong to the report's scope;
  - a measurement date is required and can't be in the future;
  - the same VIB ID can't appear twice on one date;
  - each family has its own number checks.
- When the same VIB ID is read twice in a month, the latest reading is the report reading.

**Workflow**
- **Draft → ACC review → Approved**, or ACC review → **Returned** with a reason → fixed → ACC review.
- Only an ACC engineer, manager or the App Owner can approve, return or reopen.
- The contractor engineer edits only while the report is Draft or Returned.

**45-day rule**
- A report is **due 45 days after its first measurement date**. Month end is used until the first reading is entered.
- Before submission, the report status is **Awaiting report**, then **Overdue**.
- On submission it becomes **Received**, or **Received late** if submitted after the due date.
- ACC can mark a month **Skipped**; a reason is required.

**History merge**
- Old reports were merged as **Historic**, with these statuses:
  - Received;
  - Report not imported: received at ACC, readings not in the app;
  - Missing.

**Coverage**
- Coverage lists every machine in the scope as measured or **Not measured**.

**Notifications**
- When a report is sent, both engineers get an email.
- When a report is approved, returned or reopened, the contractor engineer gets an email.

**Access**
- Contractor accounts see only their own contractor's reports.

**Audit**
- Every change is written to the `Vibration Audit` tab and shown in the report's History tab.

## Sheets

| Tab | Holds |
|---|---|
| `Vibration Log` | one row per report (header row 1) |
| `Vibration Log Entries` | one row per VIB ID reading |
| `Report Coverage` | one row per machine per report |
| `Vibration Audit` | who did what, when (created automatically) |

Columns are read by header name. Missing columns are added on the first save.

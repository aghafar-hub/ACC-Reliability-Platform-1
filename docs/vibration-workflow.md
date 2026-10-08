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

## New Reading, Equipment, Trends (step 2)

- **New Reading**: one machine, one measurement date, the numbers of each of its VIB IDs (only the fields that
  VIB ID takes). The reading goes into that month's report for the machine's contractor scope; when there is
  none a Draft is started (it then shows as *Awaiting report* until the contractor's report arrives). A VIB ID
  already read on that date needs **Replace**. Not allowed into an Approved / historic / skipped month (ACC
  reopens it first) or, for a contractor, a report that is with ACC. Opened from the Equipment list, the machine
  page or the phone's ＋ — always over the Equipment list.
- **Equipment list**: each machine's status = worst final status of its latest month with readings, compared with
  the month before (▲ worse / ▼ better), worst point, last measured; tiles for *got worse* and *not measured in
  90 days*; donut by status and bars by scope (both filter the list).
- **Machine page**: one card per point (latest RMS max, SPM HDm, G's with status), trend per point with the limit
  bands, report timeline (one line, ● ▲ ◆ ■ per month — opens that report), all readings, its reports.
- **Trends**: up to 6 machines on one chart (highest point value per date); limit bands only when all picked
  machines share the same limits.
- The old pages *Equipment Reading*, *Graphs* and the old *New reading* were replaced (they read the old RMS /
  SPM DATA tabs, which the Vibration Log now holds).

## Limits, intervals and automatic draft actions (step 3)

**Limits & intervals** (More → Limits & intervals)
- Only the **App Owner** changes them. Everyone else sees the page view only.
- Every change needs a **reason** and adds a row to `Vibration Limits`. The replaced row is kept with Active = No, so nothing is overwritten.
- Readings already saved keep the limits they were judged with (*Limits used* on each reading). A change applies to new readings only.

**Order of limits**
1. VIB ID limit.
2. Machine limit for that family (RMS / SPM / G's).
3. RMS / SPM Register.
4. Defaults: RMS 2.8 / 7.1 / 18 mm/s, SPM 20 / 35 / 50 dBsv.

G's has no limits, and gets no system status, unless 1 or 2 sets them.

**Interval and Active / Inactive**
- Each machine has a measurement **interval** in days (default 30). The machine page shows the next due date.
- Each machine is **Active** or **Inactive**. An inactive machine is left out of report scopes and coverage, and takes no new readings.

**Automatic draft actions**
- When ACC **approves** a report, every machine whose worst final status is Caution, Alert or Danger gets a **finding**:
  - The finding is added to the machine's **open action**, and the action's severity goes up if needed.
  - When the machine has no open action, a new **Draft** action is created.
- Normal machines: keep monitoring, no action.
- Approving the same report again (after a reopen) replaces its findings instead of adding them twice.
- A new finding on an action that is waiting for closure moves the action back to **Open**.
- Default follow-up reading: Alert → 30 days, Danger → 7 days.

## Actions (step 4)

**Actions page**
- Donut of open actions by stage.
- Open actions by scope, coloured by severity.
- Tiles: *Past due*, *No owner*, and (for ACC) *Waiting for your closure*. Each one filters the list.
- Board or table. The Closed column shows the last 60 days.
- The old **📋 Action Tracker** stays as a read-only tab.

**The action pop-up**
- Steps: Draft → Open → Waiting Stoppage → Closure Requested → Closed.
- Findings (each links to its report) and a link to the machine page.
- The four recommendations, the plan, closure, and history.

**Who does what**

| Stage | Contractor engineer | ACC engineer / manager |
|---|---|---|
| Draft | analysis + contractor recommendation | ACC recommendation, agreed action, owner, due date, priority, severity, follow-up reading; **Agree & open** (all three needed); **Cancel** with reason |
| Open | **Waiting stoppage** (one way), **Request closure** with evidence or comment | changes the plan; due date change needs a reason |
| Closure Requested | — | **Close** (closure date, verifier, evidence, comments saved) or **Return** with what is still needed (→ Open) |

**Rules**
- One open action per machine. *Add action* points to the existing one.
- Emails go out on:
  - assignment, to the owner;
  - a closure request, to the ACC engineers;
  - a decision, to the owner and the contractor engineer.

## Routes and My Work (step 5)

**Suggestions** (worked out on every read)
- **Interval due**: an Active machine whose last measurement + its interval falls inside the window (Next 7 / 14 / 30 / 60 / 90 days), or a machine never measured.
- **Follow-up**: an action with *Follow-up reading = Yes* that is Open or Waiting Stoppage. It is due on the last finding date + the follow-up days, and stays until the machine is measured again.
- A follow-up replaces the interval suggestion for that machine.
- No suggestion for a machine already on an active route (no duplicate active work).
- A suggestion can be **dismissed** with a reason; the reason is kept.

**Routes**
- The contractor engineer groups its own Active machines (two-pane picker) and sets the date and technician.
- An ACC engineer can raise an **Emergency** route for any machine; a reason is required.
- A route with no technician is *Unassigned* until the contractor engineer assigns one.
- **Flow:** Unassigned → Assigned → In Progress → Submitted → Closed. Returned (with a reason) goes back to the technician. Cancelled needs a reason.
- **Reassign** and **reschedule** need a reason.
- A machine can't be on two active routes.

**Technician (in My Work, not the module)**
- One **Done** box per VIB point, or a skip reason.
- A comment per machine and one for the route.
- **Submit** only when every point is done or skipped; a partial route stays open.
- Done means the field work was done. Readings come with the report.

**Contractor engineer**
- **Confirm & close**, or **Return** with a reason.
- Closing notifies the ACC engineers; there is no ACC approval gate.

**Notifications**
- Assignment → technician.
- Submission → contractor engineer.
- Return → technician.
- Closed → ACC engineers.
- Emergency route → contractor engineer.

**My Work** (backend `MyWork.js`)
- **Technician:** my vibration routes. The checklist opens right in My Work.
- **Contractor engineer:** routes to confirm, routes with no technician, measurements due in 7 days, reports to send, actions waiting for their recommendation, their actions due.
- **ACC engineer:** reports to review, actions to agree, closures to approve, overdue reports.
- **Managers:** escalations (10+ days late), view only. Managers don't approve reports or actions.

## Sheets

| Tab | Holds |
|---|---|
| `Vibration Log` | one row per report (header row 1) |
| `Vibration Log Entries` | one row per VIB ID reading |
| `Report Coverage` | one row per machine per report |
| `Vibration Audit` | who did what, when (created automatically) |
| `Vibration Limits` | limit / interval / status changes, with reason; Active = Yes for the current one |
| `Vibration Actions` | one row per action (4 parts, owner, due date, closure) |
| `Vibration Action Findings` | one row per finding (report, machine, severity, points) |
| `Vibration Routes` | one row per route |
| `Vibration Route Points` | one row per VIB point on a route (Done / skip reason / machine comment) |
| `Vibration Route Suggestions` | dismissed suggestions with the reason |

Columns are read by header name. Missing columns are added on the first save.

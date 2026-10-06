# Oil Lubrication — Phases 3 to 7, and the release checklist

Phases 1 and 2 are in `oil-phase-1.md` and `oil-phase-2.md`. The test copy
setup is in `test-copy-setup.md`.

## Phase 3: saved Suggestions

- Saving an action no longer creates routes on its own. A submitted
  action (Open, Waiting Stoppage) whose **Agreed Action** says *Change
  Oil*, *Top Up* or *Sample / Resample* gets a saved **Suggestion** for
  each kind of work. Each one keeps the lubrication point, the reason,
  the source action and the required date (the action's Due Date).
- **Routines → Suggestions (N)** lists them. **Create route** opens New
  Route with the point already picked. The New Route suggestion list
  shows saved suggestions next to the computed ones.
- When the route is created, the suggestion becomes **Converted** and
  links to the route. If the route is cancelled or deleted, the
  suggestion goes back to **Open**.
- Only one open suggestion is kept per point and kind of work.
- If the agreed action is edited while the suggestion is still open, the
  suggestion is updated or removed. If its route already exists, the
  route is left alone and the contractor's engineers are told.
- A Draft action has no suggestions. Closing an action removes its
  suggestions that were never turned into routes.
- New sheet: `OL_SUGGESTIONS` (created automatically).

## Phase 4: lab report flow

- A newly added lab report (Add Report) is **Pending Validation**. The
  contractor's engineers are asked to validate it, and the ACC engineers
  are informed.
- The contractor's **Contractor Engineer validates** it, even when ACC
  uploaded it. Only after validation does a Caution or Alert result
  create the Draft action from Phase 2.
- An **ACC Engineer can return** a report with a reason. The uploader and
  the contractor's engineers are told. Saving the corrected report puts
  it back to Pending Validation.
- **Oil Analysis Report** has a "Lab reports to review" panel at the top
  with **Validate** and **Return** buttons.
- When a sampling route is confirmed, the sampling log says **Awaiting
  Lab Report**.
- Reports from before Phase 4 have no status and count as validated.
- New `Data_Entry` columns AO–AV (Validation Status, Uploaded By/Date,
  Validated By/Date, Return Reason, Returned By/Date). They're added
  automatically. If anything is already in those columns, the app stops
  and names the column instead of overwriting it.

## Phase 5: inventory

- **Opening Balance:** a new product's first movement can be an Opening
  Balance (saved as an Adjustment, "Opening balance"). It's allowed once
  per product.
- **Low-stock level** per product. The contractor's engineer and ACC
  engineers can change it on the product page. The page also has a
  stock-over-time chart with the level drawn as a line.
- **Low-stock alert** when a movement takes stock down to or below the
  level. It fires once, when the level is crossed, not on every later
  movement.
- **Shortage check:** Forecast → choose the next 15/30/60/90 days, 6
  months or 1 year. A banner lists the oils whose stock won't cover the
  scheduled work.
- **Receipts and adjustments** are for the contractor's engineer. Other
  engineers can only record an Issue. *(This is a change: see the
  questions below.)*
- Oil used is no longer counted twice. Re-confirming the same route item
  doesn't log a second oil change or top-up.

## Phase 6: notifications

A daily job (run `installDailyOilNotificationsTrigger` once; it then runs
around 6:00 every morning) sends:

- **Due soon:** an oil change or sample due within 7 days that isn't on
  an open route goes to the contractor's engineers, in one message per
  contractor.
- **Route overdue** goes to the contractor's engineers and the assigned
  technician, once per route.
- **Stock shortage** for the next 30 days goes to the contractor's and
  ACC engineers, at most once a week per oil.
- **Escalation** (Phase 7, below).

Each item is announced once. What was already sent is kept in the new
`OL_NOTIFY_SENT` sheet.

Recipients for route events changed:

- A **submitted** route goes to the contractor's engineers only.
- A **confirmed** route goes to the technician, and the ACC engineers are
  informed.

## Phase 7: managers

- **New role: Contractor Manager** (`ROLE-CMGR`). It has the same rights
  as a Contractor Engineer for their own contractor, plus Team Workload
  and escalations. The existing **Manager** role (`ROLE-MGR`) acts as the
  ACC manager.
- **Module Access → People** has new lists: **ACC managers** and
  **RHI / ASEC managers**.
- **Escalation:** a route or an Open action that is still overdue **10
  days after it became overdue** goes to that contractor's managers and
  the ACC managers. Each item is escalated once.
- **Team Workload** (new Oil tab): for each contractor it shows routes
  (Draft / Assigned / In Progress / Waiting Approval / Returned /
  Overdue), actions (Draft / Open / Waiting Stoppage / Closure Requested
  / Overdue), lab reports waiting for validation, open suggestions and
  low-stock oils. It also has a table per technician. A contractor's
  people see only their own contractor. Technicians don't see the tab by
  default; change this in Module Access → tab levels.

## Test copy: files to paste (Apps Script editor)

Copy from the `claude/test-site` branch.

**Oil Lubrication (test) script:**

- New files (➕ → Script, name without `.js`): `ActionWorkflow`,
  `Suggestions`, `LabReports`, `DailyNotifications`, `Managers`.
- Replace: `Code`, `Config`, `Rbac`, `ModuleAccess`,
  `ModuleAccessConfig`, `Notifications`, `Routines`, `RouteTemplates`,
  `Dashboard`, `OilInventory`, `OilChanges`, `TopUps`, `SampleOverdue`.

**Vibration (test) script:** `ModuleAccess`, `ModuleAccessConfig` (plus
`Auth` and `Code` from Phase 0 if not done yet).

**Platform Core (test) script:** `Rbac`.

Then, in each script you changed: **Deploy → Manage deployments → ✏ →
New version → Deploy**.

**Run once, from the Run menu:**

| Script | Function | Phase |
|---|---|---|
| Oil | `migrateRouteStatusesPhase1DryRun`, then `migrateRouteStatusesPhase1` | 1 |
| Oil | `migrateActionStatusesPhase2DryRun`, then `migrateActionStatusesPhase2` | 2 |
| Oil | `installDailyOilNotificationsTrigger` | 6 |
| Platform Core | `addContractorManagerRole` | 7 |

## How to test each phase (test copy)

Use the test accounts: an ACC engineer, an RHI contractor engineer, an
RHI technician, and a manager.

1. **Phase 0, access:** in Settings → Module Access, set a tab to Hidden
   for a role and confirm it disappears for that user. Set the module to
   Maintenance or Off and confirm the banner, or that the module is
   hidden.
2. **Phase 1, routes:**
   1. As the contractor engineer, create a route with a technician; it is
      Assigned.
   2. As the technician, submit it; it goes to Waiting Approval.
   3. As the engineer, **Return** it with a reason.
   4. As the technician, **Resubmit** it.
   5. As the engineer, **Confirm** it.
   6. Try **Reschedule**. A route without a technician should be Draft.
3. **Phase 2, actions:**
   1. **Save as Draft** with fields missing.
   2. **Submit**. It must refuse until Agreed Action, Assigned To, Due
      Date and Duration are filled.
   3. Drag Open → Waiting Stoppage.
   4. **Request closure**, then as ACC **Reject**. The action should go
      back to where it was.
   5. Request again, have ACC approve, then **Close action**.
4. **Phase 3, suggestions:** submit an action "Change oil". It should
   appear under **Routines → Suggestions**. Create the route from it:
   the suggestion disappears. Cancel the route: it comes back.
5. **Phase 4, lab:**
   1. Add a report with a Caution result; it is Pending Validation and no
      action is made yet.
   2. As the contractor engineer, **Validate** it. A Draft action
      appears.
   3. As ACC, **Return** another report with a reason, edit it, and
      confirm it's Pending again.
6. **Phase 5, inventory:**
   1. On a new product, record an **Opening Balance**.
   2. Set a **Low-stock level** above the stock and issue oil. You should
      get one alert.
   3. In Forecast, change the shortage period.
   4. As ACC, only **Issue** should be offered.
7. **Phase 6, notifications:** run `runDailyOilNotifications` from the
   editor. Check the bell (and email, if enabled) for due-soon, overdue
   and shortage messages. Run it again; nothing should repeat.
8. **Phase 7, managers:**
   1. Run `addContractorManagerRole`, give a test user the **Contractor
      Manager** role, and add people to the new manager lists in Module
      Access.
   2. Set a test route's due date 30 days back and run
      `runDailyOilNotifications`. The managers should get the
      escalation.
   3. Open **Team Workload** and check the counts.

## Releasing to live (only after you approve the test)

1. Back up the live Oil and Platform Core spreadsheets (File → Make a
   copy).
2. Set Module Access → Oil Lubrication to **Maintenance**.
3. Merge the tested branch into the live branch (the website).
4. Paste the same files into the live scripts, deploy new versions, and
   run the one-time functions in the table above, in order.
5. Fill the new Module Access lists (ACC managers, contractor managers).
6. Set Oil back to **Active**.

**Undo:** restore the sheet copies and pick the previous version under
Manage deployments.

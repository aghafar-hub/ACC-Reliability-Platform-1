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
- **Changing a validated report:** only an ACC Engineer can. Any real
  change sends it back to **Pending Validation**.
  - The contractor's engineers are asked to validate it again, and the
    ACC engineers are informed.
  - Once it's re-validated, a Caution/Alert result makes its Draft action.
  - Other users see a lock instead of Edit. The ACC Engineer is warned
    before saving.
  - Saving without changing anything keeps it validated.
  - Reports from before Phase 4 follow the same rule but never make a
    Draft, because those results already have their actions.
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
- **Receipts, adjustments and the opening balance:** the contractor's
  engineer or an ACC engineer.
- **A manual Issue needs a reason.** Oil changes and top-ups already
  deduct stock automatically, so an Issue logged by hand must say why.
  The reason is saved in the movement's Notes and in the Activity log.
- **Where to set the low-stock level:**
  - when adding a product (Low-stock Level field);
  - in the Stock List, with the **Edit** button next to the level;
  - on the product page.
- The low-stock level also shows on the product's stock chart (dashed
  line) and on the Forecast chart (a dashed marker for each oil). The
  Forecast table adds **Low-stock Level** and **Stock After Work**
  columns.
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
- **Escalation**: see Phase 7 below.

Each item is announced once. What was already sent is kept in the new
`OL_NOTIFY_SENT` sheet.

Recipients for route events changed:

- A **submitted** route goes to the contractor's engineers only.
- A **confirmed** route goes to the technician, and the ACC engineers are
  informed.

## Phase 7: managers

- **New role: Contractor Manager** (`ROLE-CMGR`). It has the same rights
  as a Contractor Engineer for their own contractor, plus Team Workload
  and escalations. The **Manager** role (`ROLE-MGR`) is renamed **ACC
  Manager** (same id, so nobody's access changes).
- **New role: Visitor** (`ROLE-VIEW`). A visitor can see but never edit.
  - Which tabs a visitor sees is set per module in Module Access (Hidden
    or View).
  - Edit isn't offered for Visitor, and the server treats any Edit as
    View.
  - As with everyone, a visitor must be added to a module (as Member) to
    open it.
- **Module Access → People** has new lists: **ACC managers** and
  **RHI / ASEC managers**.
- **Escalation:** a route or an Open action that is still overdue **10
  days after it became overdue** goes to that contractor's managers and
  the ACC managers. It repeats once a week while the item stays overdue.
- **Team Workload** (new Oil tab): for each contractor it shows routes
  (Draft / Assigned / In Progress / Waiting Approval / Returned /
  Overdue), actions (Draft / Open / Waiting Stoppage / Closure Requested
  / Overdue), lab reports waiting for validation, open suggestions and
  low-stock oils. It also has a table per technician. A contractor's
  people see only their own contractor. Technicians don't see the tab by
  default; change this in Module Access → tab levels.

## Feedback round 1 (after testing)

- **Team Workload loads quickly now.** Finding each action's contractor
  used to re-read the whole Equipment Registry once per action, which hit
  Apps Script's time limit on real data. The registry is now read once
  per request.
- **Contractors compared:** ACC and the App Owner see a side-by-side
  table of RHI and ASEC at the top of Team Workload. The worse value of
  anything that should be low is in red. Team Workload is live: it is
  counted from the sheets every time it opens, with no separate database.
- **My Work:** the "Sample taken" box is removed. **Done** on a Sampling
  route item already means the sample was taken.
- **Sample IDs:**
  - Every lab report needs a Sample ID.
  - A Sample ID that is already saved is never added again.
  - Manual entry blocks it.
  - PDF import skips it and can't be ticked back on. It also catches the
    same ID twice in one import.
  - The server refuses it too. Editing a saved report still works.
- **Lab Drafts:** a Caution/Alert Draft is created only for a newly added
  report, once validated, whatever its sample date. Existing reports
  never create one.

### Triggers in the test scripts

The live scripts have time-driven triggers that were added by hand. The
test scripts start with none (only the sheet's own `onEdit` runs by
itself). To test the scheduled jobs, add them to the **test** Oil script
(⏰ Triggers → Add Trigger → function → Time-driven → Day timer):

| Function | What it does | Add in test? |
|---|---|---|
| `runDailyOilNotifications` | Phases 6–7 daily job (install with `installDailyOilNotificationsTrigger`) | Yes |
| `generateDueRouteInstances` | Creates the next routes from route templates | Yes |
| `checkSampleOverdueAndNotify` | Sample-overdue digest | Yes |
| `sendAgingActionsDigest` | Daily list of aging actions | Yes |
| `sendLowStockDigest` | Daily low-stock list. The Phase 5 alert (on crossing) and the Phase 6 shortage check now cover this | Optional; consider removing from live after release |

Keep notification email **off** in the test copy unless you want real
emails from test data.

## Phase 8: alternative oils

- **Approving an equivalent** (Oil Inventory → product → *Approved
  equivalent*, or when adding a product):
  - Only that contractor's **Contractor Engineer** can approve or remove
    one; ACC engineers can't.
  - The ACC engineers, that contractor's managers and the ACC managers are
    told (bell, and email if it's on).
  - The product page shows who approved it and when, and the Stock List
    marks the product "Approved equivalent for …".
  - Editing a product no longer changes its equivalence.
- **Oil to use on a route:** each point shows **Use: …**, for the
  technician in My Work and for engineers in Routines.
  - For an **oil change** it's the main oil when there's enough stock.
    Otherwise it's the approved equivalent, shown with the reason.
  - For a **top-up** it's **only the oil already in the point**. There's
    no mixing, ever.
- **Oil used:** when an oil-change or top-up item is set to Done, the
  technician picks the oil used from the allowed list only.
  - Saving without one, or with an oil that isn't allowed, is refused.
  - The server checks this too. A top-up with a different oil is refused
    with "No mixing".
- **Records:** the oil change / top-up log records the product used
  (new **Product_ID** column), and stock is taken from that product.
  - Consumption is therefore by the real brand.
  - The point's **current oil** is the product from its latest oil change.
    A point never changed through the app is taken to hold its
    registered oil.
- **Forecast:** a need is covered by the main oil **plus** its approved
  equivalents together; the Current Stock column says which.
- New columns (added automatically, refused if already used):
  - Oil Inventory T–U (EquivalentApprovedBy, EquivalentApprovedDate)
  - Oil Change LOG N (Product_ID)
  - Oil Top Up LOG M (Product_ID)
  - OA_ROUTINE_ITEMS M–N (OilUsedProductId, OilUsed)

**Test it:**
1. As the RHI contractor engineer, open a product and choose **Approve as
   an equivalent**, then pick the main oil. Check the bell for the ACC
   engineer and the managers.
2. Make the main oil short (stock below one change's quantity) and
   create an oil-change route. The route item says **Use: <equivalent>**.
3. As the technician, set the item to Done. **Oil used** is required; pick
   one and save.
4. Confirm the route. The oil change log shows that product, and its stock
   goes down (not the main oil's).
5. Create an emergency top-up for the same point. Only that same oil is
   offered.

## Phase 9: My Work per role (Platform Core)

My Work lives in the platform shell, so it collects work from **every
module**, not just Oil Lubrication.

- **How it works:**
  1. Each module's backend answers one standard request, `GET getMyWork`.
  2. The answer lists sections of work for that person. Each item has a
     title, details, an optional flag (Overdue / Returned / Due soon) and
     the page and record it opens.
  3. My Work asks every module that provides it, and shows one group per
     module.
  4. Clicking an item opens that page in the module.
- **Adding a module later** (for example Vibration Analysis) needs no
  change to the My Work page:
  1. Implement `getMyWork` in its backend with the same answer shape (see
     `backend/oil-lubrication/src/MyWork.js` for the format and an
     example).
  2. Set `myWork: true` on its entry in `MODULE_BACKENDS`
     (`frontend/src/moduleAccess.tsx`).
- **Oil Lubrication, by role:**

  | Role | Sections |
  |---|---|
  | Technician | Their assigned routes (the checklist, unchanged) |
  | Contractor Engineer | Routes waiting approval · Draft routes without a technician · suggestions to turn into routes · lab reports to validate · Draft actions to submit · closures approved, to close · actions overdue · low-stock oils · points due within 7 days |
  | ACC Engineer | Closure requests to approve · lab reports to review · new automatic Drafts · actions overdue (all contractors) |
  | ACC Manager / Contractor Manager | Overdue 10+ days (escalations) · team summary · overdue work per technician (a contractor manager sees only their contractor) |
  | App Owner | ACC Engineer + manager sections |
  | Visitor | Nothing (My Work is hidden for Visitor) |

  Someone with several roles gets all of their sections. Each section
  shows its first 5 items, with **Show more** for up to 15; the module
  pages have the full lists. A section with nothing in it is not shown.

**Test it:** open My Work as each of the test users (contractor engineer,
ACC engineer, managers, technician, visitor). Check the sections match
the table, and that clicking an item opens the right page.

## Test copy: files to paste (Apps Script editor)

Copy from the `claude/test-site` branch.

**Oil Lubrication (test) script:**

- New files (➕ → Script, name without `.js`): `ActionWorkflow`,
  `Suggestions`, `LabReports`, `DailyNotifications`, `Managers`,
  `AlternativeOils`, `MyWork`.
- Replace: `Code`, `Config`, `Rbac`, `ModuleAccess`,
  `ModuleAccessConfig`, `Notifications`, `Routines`, `RouteTemplates`,
  `Dashboard`, `OilInventory`, `OilChanges`, `TopUps`, `SampleOverdue`,
  `EquipmentRegistry`, `Utils`.

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
| Platform Core | `updateRolesPhase7` (adds Contractor Manager and Visitor, renames Manager) | 7 |

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
   4. Log an **Issue** without a reason: it's refused. Add a reason and
      it's saved.
7. **Phase 6, notifications:** run `runDailyOilNotifications` from the
   editor. Check the bell (and email, if enabled) for due-soon, overdue
   and shortage messages. Run it again; nothing should repeat.
8. **Phase 7, managers:**
   1. Run `updateRolesPhase7`, give a test user the **Contractor
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

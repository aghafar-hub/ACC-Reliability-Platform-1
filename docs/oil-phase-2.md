# Oil Lubrication — Phase 2: action workflow

## What changes

Action statuses become **Draft → Open → Waiting Stoppage → Closure
Requested → Closed**. Old **In Progress** actions read as **Open**.

- **Draft:** created automatically, never by hand:
  - **Lab Caution or Alert:** when a sample with a Caution/Alert result
    is saved, a Draft action is created for that point with the report's
    recommendations in *Sample Analysis*. Only samples taken in the last
    45 days count (so importing old reports doesn't flood the tracker).
    If the point already has an
    action that isn't Closed, no new one is made; both engineers are told
    about the new result instead.
  - **Leakage rule:** the 3rd top-up on the same point within 30 days
    creates a Draft "Check oil leakage — 3 top-ups in 30 days (dates)".
    Only one open leakage action per point.
  - Both the ACC and that contractor's responsible engineers (Module
    Access) get a bell notification to edit it.
- **Open:** a Draft becomes Open as soon as its **Agreed Action** is saved.
- **Overdue:** an Open action not closed 14 days after its Revision Date
  (same rule as today). Waiting Stoppage is never overdue. The daily
  aging digest now only lists Open actions.
- **Closure:**
  1. The Contractor Engineer presses **Request closure** with a comment.
     ACC Engineers are notified.
  2. An ACC Engineer presses **Approve closure** or **Reject** (a reason
     is required). Reject puts the action back to Open, and the reason is
     shown on it.
  3. After approval, the Contractor Engineer presses **Close action**.
     Completed Date is set automatically.
- The status picker only moves between Open and Waiting Stoppage. Dragging
  a card to Closure Requested or Closed opens the action instead. The
  server refuses any other status jump.
- Nine new columns are added at the end of `Action Tracker` (U–AC):
  Closure Request, Closure Requested By, Closure Requested Date, Closure
  Decision, Closure Decision By, Closure Decision Date, Closure Decision
  Note, Created By Rule, Rule Reference. They're added automatically the
  first time they're needed. If something is already in those columns,
  the app stops and says which column, rather than overwrite it.

Saving an Agreed Action still creates routes as it does today. That
changes to Suggestions in Phase 3.

## Test copy

In the **test** Oil Lubrication Apps Script:

1. **Add a new file:** ➕ → Script → name it `ActionWorkflow` → paste
   `backend/oil-lubrication/src/ActionWorkflow.js`.
2. Replace these files with the versions from the `claude/test-site` branch:
   - `backend/oil-lubrication/src/Code.js`
   - `backend/oil-lubrication/src/Rbac.js`
   - `backend/oil-lubrication/src/ModuleAccessConfig.js`
   - `backend/oil-lubrication/src/Notifications.js`
   - `backend/oil-lubrication/src/Dashboard.js`
   - `backend/oil-lubrication/src/RouteTemplates.js`
3. **Deploy → Manage deployments → ✏ edit → Version: New version → Deploy.**
4. Run `migrateActionStatusesPhase2DryRun` (only counts), then
   `migrateActionStatusesPhase2`. It's safe to run again.

## Releasing to live (only after you approve the test)

1. **Back up:** File → Make a copy of the live Oil spreadsheet.
2. Module Access → Oil Lubrication → **Maintenance**.
3. Merge the tested branch into the live branch (website).
4. Live Oil script: add `ActionWorkflow`, paste the same files, deploy a
   new version, then run the dry run and the migration.
5. Set Oil back to **Active**, version `Phase 2`.

**Undo:** restore the sheet copy and choose the previous version under
Manage deployments.

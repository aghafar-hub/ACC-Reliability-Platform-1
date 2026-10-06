# Oil Lubrication — Phase 2: action workflow

## What changes

Action statuses become **Draft → Open → Waiting Stoppage → Closure
Requested → Closed**. Old **In Progress** actions read as **Open**.

- **Save as Draft / Submit:** a new action (and every Draft) has two
  buttons:
  - **Save as Draft:** keeps whatever is filled in; the action stays
    Draft.
  - **Submit:** needs Agreed Action, Assigned To, Due Date and Duration.
    It makes the action **Open**. Submit is available to ACC Engineers,
    that contractor's engineer and the App Owner. The server checks all
    of this too.
- **Due Date and Duration** are set while the action is a Draft. New
  actions and automatic Drafts default to due in 7 days.
- **Overdue:** an Open action past **Due Date + Duration + 5 days**.
  Waiting Stoppage is never overdue. The daily overdue email uses the
  same rule.
- **Reschedule:** after Submit, the Due Date changes only with
  **Reschedule** and a reason. Either the ACC Engineer or the
  contractor's engineer can do it. The first due date is kept, and every
  reschedule is in the Activity log.
- **Waiting Stoppage is one-way:** it never goes back to Open. It moves on
  to closure. The status picker and dragging only allow Open → Waiting
  Stoppage.
- **Automatic Drafts:**
  - **Lab Caution or Alert:** a sample with a Caution/Alert result taken
    in the last 45 days creates a Draft for that point, with the report's
    recommendations in *Sample Analysis*. If the point already has an
    action that isn't Closed, no new one is made; both engineers are told
    about the new result instead.
  - **Leakage rule:** the 3rd top-up on the same point within 30 days
    creates a Draft "Check oil leakage — 3 top-ups in 30 days (dates)".
    Only one open leakage action per point.
  - Both the ACC and that contractor's responsible engineers get a bell
    notification to complete and submit it.
  - **Generate Monthly Actions** and **Generate Oil Change Actions** now
    create Drafts too.
- **Closure:**
  1. The Contractor Engineer presses **Request closure** with a comment
     (from Open or Waiting Stoppage). ACC Engineers are notified.
  2. An ACC Engineer presses **Approve closure** or **Reject** (a reason
     is required). Reject returns the action to the status it was in
     before the request, Open or Waiting Stoppage, with the reason shown.
  3. After approval, the Contractor Engineer presses **Close action**.
     Completed Date is set automatically.
- Sixteen new columns are added at the end of `Action Tracker` (U–AJ):
  the closure columns, Created By Rule, Rule Reference, Due Date,
  Duration (days), Closure Requested From, Original Due Date, Reschedule
  Reason, Rescheduled By, Rescheduled Date. They're added automatically.
  If something is already in those columns, the app stops and says which
  column, rather than overwrite it.
- **At release**, the migration also gives every action that isn't Closed
  a Due Date of Revision Date + 14 days (Duration 0). Actions overdue
  today stay overdue; with the 5-day grace they turn overdue 5 days later
  than under the old rule.

Saving an Agreed Action still creates routes as it does today (only on
Submit or for non-Draft actions). That changes to Suggestions in Phase 3.

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

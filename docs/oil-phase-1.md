# Oil Lubrication — Phase 1: route statuses and approval loop

## What changes

| Before | After |
|---|---|
| Unassigned | **Draft** |
| Assigned | Assigned |
| InProgress | **In Progress** |
| Submitted | **Waiting Approval** |
| Approved | **Confirmed** |
| Paused, Cancelled | unchanged |

- **Who confirms:** only the route's own Contractor Engineer (and the App
  Owner), also for routes an ACC Engineer created. ACC Engineers can no
  longer confirm routes.
- **Return for correction:** the Contractor Engineer writes a reason; the
  route goes back to In Progress with a red **Returned** badge and the
  technician is notified. The technician corrects it and presses
  **Resubmit for approval**.
- **ACC Engineers create routes:** the route goes straight to the
  technician, and that contractor's responsible engineers (Module Access)
  are informed in the bell.
- **Draft:** a route saved without a technician is a Draft until someone
  assigns one. Routes generated from recurring templates start as Draft.
- **Reschedule:** Contractor Engineer only, no approval. The first due
  date, the new date, the reason and who did it are kept; every reschedule
  is in the Activity log. The Edit form no longer changes the due date.
- **Overdue:** not submitted by due date + duration + 7 days. Waiting
  Approval and Confirmed routes are never overdue.
- The checklist can only be changed while the route is Assigned or
  In Progress.
- Seven new columns at the end of `ROUTINES` (T–Z): ReturnReason,
  ReturnedBy, ReturnedDate, OriginalDueDate, RescheduleReason,
  RescheduledBy, RescheduledDate. They're added automatically.

Old status names keep working. The backend and the website read either
name, so rows that haven't been converted yet and phones with old
offline work don't break.

## Test copy

In the **test** Oil Lubrication Apps Script, replace these files with
the versions from the `claude/test-site` branch, then **Deploy → Manage
deployments → ✏ edit → Version: New version → Deploy**:

- `backend/oil-lubrication/src/Routines.js`
- `backend/oil-lubrication/src/RouteTemplates.js`
- `backend/oil-lubrication/src/Code.js`
- `backend/oil-lubrication/src/Rbac.js`
- `backend/oil-lubrication/src/Notifications.js`
- `backend/oil-lubrication/src/OilInventory.js`
- `backend/oil-lubrication/src/Config.js`
- `backend/oil-lubrication/src/ModuleAccessConfig.js`

Then, in the same test script, convert the test sheet's old status names:

1. Choose `migrateRouteStatusesPhase1DryRun` in the function menu → **Run**.
   **Execution log** shows how many rows would change (nothing is
   written).
2. Choose `migrateRouteStatusesPhase1` → **Run**. It's safe to run again.

## Releasing to live (only after you approve the test)

1. **Back up:** File → Make a copy of the live Oil spreadsheet, named
   `BACKUP before Phase 1 <date>`.
2. Settings → General → Module Access → Oil Lubrication → **Maintenance**.
3. **Website:** merge the tested branch into the live branch; GitHub
   Actions publishes it.
4. **Live Oil script:** paste the same files as above → deploy a new
   version → run `migrateRouteStatusesPhase1DryRun`, then
   `migrateRouteStatusesPhase1`.
5. Set Oil back to **Active**, with version `Phase 1` and today's date.

**Undo:** restore the backup copy of the sheet and choose the previous
version under Manage deployments. Status names are rewritten in the
sheet, so a switch alone can't undo it.

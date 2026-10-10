# Activity (platform page)

`/activity` — every change in every module, newest first. **App Owner and
ACC managers only** (menu item hidden for others; each backend refuses too).
It replaces Oil Lubrication's own Activity tab.

| Source | Where it comes from |
|---|---|
| Oil | Oil sheet → `Audit Log` (`getActivityFeed`, ActivityFeed.js) |
| Vibration | Vibration sheet → `Vibration Audit` (`getActivityFeed`, ActivityFeed.js) |
| Platform | Platform Core → `PLATFORM_LOG` (Settings access, Email & notifications, Users) and `EQUIPMENT_LOG` (Equipment IDs) (`listPlatformActivity`, Activity.js) |

Also logged now: Module Access changes and delegations in both modules
(with a readable line, e.g. "Added sami@rhi.com (Technician, RHI)"), and
new users / password resets / role changes on the platform.

- Tiles: changes today, and this month per module.
- Filters: ID / text search, module, contractor (RHI · ASEC), person,
  change type, record type, date range (today → last 12 months).
- **Open** goes to the record (action, route, report, lab report, equipment
  or the settings page it changed). **Export** downloads what is shown as CSV.
- Contractor is the row's own when it has one, else from the Lub ID, the
  action / route, the report ID, or the platform list for the Equipment ID.

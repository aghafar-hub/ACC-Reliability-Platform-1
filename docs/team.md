# Team (platform page)

`/team` — work waiting and done across every module. Replaces Oil's Team
Workload tab and My Work → My team (that button now opens this page).

**Who sees what** (each module's `getTeamHistory`, ModuleAccess.js
`maTeamScope_`):

| Who | Sees |
|---|---|
| App Owner, ACC managers, ACC engineers | everyone, every contractor |
| Contractor manager | their own contractor |
| Contractor responsible engineer | their own technicians (opened from My Work) |

- Tiles: open work, overdue (and its share of open), done in the period,
  waiting for ACC, people.
- **Contractors**: one card per contractor — per module open (routes ·
  actions · lab reports / reports), overdue, done, overdue share.
- **People**: most loaded first — open work per module, overdue, done, load.
- **History**: each person's dated work (the former My team view).
- Filters: contractor, module, period (this week / this month / 3 months).

Open work per contractor comes from each module's `teamCollect_`
(TeamHistory.js): Oil — open routes, actions not closed, lab reports
pending; Vibration — open routes, reports not approved, actions not closed.

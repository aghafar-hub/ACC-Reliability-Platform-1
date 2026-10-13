# Who can do what (access matrix)

Two layers decide what a person can do (audit I-04):

1. **Tab levels** (Edit / View / Hidden), per role and module. The tables below are the
   **starting defaults** in the code (`backend/*/src/ModuleAccessConfig.js`). The App
   Owner can change them in **Settings → Module access**; what the live app uses is
   whatever is set there.
2. **Server rules that no tab level can open up**, listed after the tables. They are
   checked on the server for every request.

The Admin (role App Admin) has Edit on everything.

## Tab levels (defaults)

### Oil Lubrication

| Tab | Technician | Contractor Engineer | ACC Engineer | ACC Manager | Contractor Manager | Visitor |
|---|---|---|---|---|---|---|
| dashboard | Hidden | Edit | Edit | Edit | Edit | View |
| equipment | Hidden | Edit | Edit | Edit | Edit | View |
| routines | Hidden | Edit | Edit | Edit | Edit | View |
| oilreport | Hidden | Edit | Edit | Edit | Edit | View |
| upload | Hidden | Edit | Edit | Edit | Edit | View |
| actions | Hidden | Edit | Edit | Edit | Edit | View |
| oilchange | Hidden | Edit | Edit | Edit | Edit | View |
| tracker | Hidden | Edit | Edit | Edit | Edit | View |
| inventory | Hidden | Edit | Edit | Edit | Edit | View |
| reports | Hidden | Edit | Edit | Edit | Edit | View |
| activity | Hidden | Edit | Edit | Edit | Edit | View |
| settings | Hidden | Edit | Edit | Edit | Edit | Hidden |
| mywork | Edit | Edit | Edit | Edit | Edit | Hidden |
| team | Hidden | Edit | Edit | Edit | Edit | View |

### Vibration Analysis

| Tab | Technician | Contractor Engineer | ACC Engineer | ACC Manager | Contractor Manager | Visitor |
|---|---|---|---|---|---|---|
| dashboard | Hidden | Edit | Edit | Edit | Edit | View |
| log | Hidden | Edit | Edit | Edit | Edit | View |
| equipment | Hidden | Edit | Edit | Edit | Edit | View |
| trends | Hidden | Edit | Edit | Edit | Edit | View |
| routes | Hidden | Edit | Edit | Edit | Edit | View |
| newreading | Hidden | Edit | Edit | Edit | Edit | View |
| actions | Hidden | Edit | Edit | Edit | Edit | View |
| mywork | Edit | Edit | Edit | Edit | Edit | View |
| compliance | Hidden | Edit | Edit | Edit | Edit | View |
| equipreg | Hidden | Edit | Edit | Edit | Edit | View |
| limits | Hidden | Edit | Edit | Edit | Edit | View |
| reports | Hidden | Edit | Edit | Edit | Edit | View |
| settings | Hidden | Edit | Edit | Edit | Edit | Hidden |

## Server rules (always applied)

| Rule | Who | Where |
|---|---|---|
| Sees and changes only their own contractor's points, machines, samples, readings, actions and routes | Contractor manager, engineer, technician (RHI, ASEC) | Oil `getContractorScope_`, `requireLpContractorMatch_`; Vibration `vbScopeLists_`, `vbLegacyWriteDenial_` |
| A route holds one contractor's points only | everyone | Oil `createRoutine` |
| Validates, returns or rejects a lab report; corrects a validated one | ACC Engineer (and Admin) | Oil `requireAccEngineer_` |
| Approves or rejects an action closure | ACC Engineer (and Admin) | Oil and Vibration action workflow |
| Changes vibration limits, registers and module settings | ACC staff and Admin | Vibration `vbLegacyWriteDenial_`, Limits |
| Users, roles, password resets, equipment list, areas, email settings | Admin only | Platform Core `requireAppAdmin_` |
| Settings pages (module settings, ID check, module access) | whoever Settings → Settings access allows | `settings:*` read rules |
| A Visitor never edits, whatever the tab level | Visitor | ModuleAccess.js (capped at View) |
| Every sign-in ends (12 h, or 30 days with "Keep me signed in") and is cancelled on sign-out, role change, password change or reset, user deletion | everyone | `checkSessionAlive_` in the three backends |

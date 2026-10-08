# Responsible engineers and delegation

Applies to every module backend (Oil Lubrication, Vibration Analysis and any
future module). The code is in `ModuleAccess.js`, which is identical in every
module: copy it across when it changes.

## Who gets My Work

Engineer sections in My Work follow **responsibility**, not job title.

- A person gets the contractor engineer sections only when they are listed in
  Settings → Module Access as **Contractor Responsible Engineer** for that
  module and contractor. More than one person can be listed.
- A person gets the ACC engineer sections only when they are listed as an
  **ACC Responsible Engineer**.
- A colleague covering through an active delegation gets the same sections as
  the engineer they cover. While the cover lasts they also get access to the
  module, even if they are not listed. Their My Work answer includes
  `covering: [{ from, until, id }]`.
- Managers (ACC Manager, Contractor Manager) keep their escalations and team
  sections.
- The App Owner gets the manager sections. They get the ACC engineer
  sections only when listed or covering.
- **Nobody responsible.** Managers see a "Nobody responsible" warning when
  their side has no engineer available today. The App Owner sees it for ACC
  and for every contractor in `MA_CONFIG.orgToContractor`. "No engineer
  available" means every listed engineer is away and no cover is in place.

## Delegation rules

| Rule | Detail |
|---|---|
| Who sets it up | The engineer (if listed), or a manager of the same contractor. For ACC, the manager is an ACC manager. The App Owner can also set one up. |
| Who covers | A colleague with a platform account in the **same contractor**; ACC delegates to ACC. The rule is checked when the delegation is created (against the people list) and again every time the cover is used (against the colleague's own organisation). |
| Manager covers himself | When no engineer is free, a manager can delegate to himself. "Engineer away" can be left empty in that case. |
| One at a time | An engineer can have only one delegation over the same dates. |
| No delegating to someone away | You can't delegate to a colleague who has delegated their own work on those dates. |
| Length | Up to 120 days. The end date can't be in the past. |
| End early | The engineer, the colleague, the person who set it up, a manager of the same contractor, or the App Owner. |
| What the colleague can do | Everything the engineer can do, including approve and close. An ACC manager covering for an engineer can approve in Vibration. |

Notifications go out when a delegation starts and when it ends. They go in the
bell and by email, and the bell link opens My Work. They reach:

- the colleague;
- the engineer, when someone else set it up or ended it;
- the contractor managers;
- the ACC managers and ACC engineers.

The person who made the change is not notified.

## The screen: Settings → My delegations

`frontend/src/components/DelegationsPanel.tsx` asks every module for
`getMyDelegations` and shows the answers together.

- **Who sees it:** engineers, managers and the App Owner. Technicians and
  visitors don't.
- **Your responsibility:** one tile per module. It shows one of
  "Responsible engineer", "Covering for X until …", "Away — Y covers until …"
  or "Not a responsible engineer here".
- **Nobody responsible:** a warning above the tiles for managers and the App
  Owner. My Work's "Nobody responsible" card links here with
  `/settings?tab=delegations`.
- **Delegations:** one row per delegation, even when it covers several
  modules. Chips switch between Active & upcoming, Ended and All. The row
  shows who is away → who covers, the dates and number of days, the
  modules, the contractor, the reason and who set it up. Its End now button
  (Cancel for an upcoming one) ends the delegation in every module it covers.
- **New delegation (popup):**
  - Modules: chips, starting with the ones you're listed in.
  - Who is away: you, or, for a manager, any listed engineer or "No
    engineer free — I'll cover it myself".
  - Who covers: people in your own company with an engineer or manager
    account. Anyone already away on those dates is greyed out.
  - Dates, an optional reason, and a summary of what will happen.
  - The request is sent once per module, with no automatic retry, so it is
    never saved twice. Only a covering colleague who is not listed gets no
    New delegation button, so they can't pass the work on.

## Sheet

`MA_DELEGATIONS` is created on first use in each module spreadsheet. Its
columns:

`DelegationId, FromEmail, ToEmail, Side, Contractor, StartDate, EndDate,
Reason, CreatedBy, CreatedAt, Status, EndedBy, EndedAt`

The state shown in the app is worked out from the dates and Status:
Upcoming, Active, Ended or Expired.

## Requests

These requests are open to any signed-in person. The rules above are checked
inside each one.

- `getMyDelegations`: returns your side, your contractor, whether you are
  listed, whether you are a manager or the App Owner, who you are covering,
  the list of engineers, the delegations you can see, and `nobodyResponsible`.
- `maCreateDelegation`: takes `from`, `to`, `startDate`, `endDate` and
  `reason`. Leave out `from` to mean yourself; send `""` for a manager
  covering himself.
- `maEndDelegation`: takes `delegationId`.

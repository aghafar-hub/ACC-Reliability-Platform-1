# Settings access

Settings → **Settings access** (Admin) decides who sees which Settings
page, and whether they can only **view** it or also **edit** it.

| Level | Meaning |
|---|---|
| Hidden | the page is not in the menu |
| View | the page opens read-only |
| Edit · responsible | module settings only: Edit for that module's ACC responsible engineer, View for others with the role |
| Edit | can change it |

Fixed rules (cannot be changed on the page):

- **Appearance** is open to everyone, always.
- **Users**, **Settings access** and **Email & notifications** are Admin only.
- **Equipment & IDs**: others can view at most (Equipment IDs are owned by the platform).
- The Admin can edit everything.

Defaults (until the first save): Language view for all roles; My delegations
edit for ACC managers / engineers and contractor managers / engineers; Module
Access view for ACC managers; Equipment & IDs view for ACC managers and
engineers; Oil and Vibration settings view for ACC managers, *Edit ·
responsible* for ACC engineers.

**Exceptions for one person** replace that person's role level for one page.

## Where it is stored

Platform Core sheet, made on the first save:

- `SETTINGS_ACCESS` — Page | Role | Level | Updated_By | Updated_At
- `SETTINGS_ACCESS_PEOPLE` — Email | Page | Level | Updated_By | Updated_At
- `PLATFORM_LOG` — At | By | Area | Record | Change | Details (every change; shown on the Activity page later)

The modules read the same tabs through `PLATFORM_CORE_SPREADSHEET_ID`
(`PlatformEquipment.js`, `psaLevel_`), so Module Access and the ID check
follow the same rules on the server, not only in the menu.

# Email & notifications

Settings → **Email & notifications** (Admin only). **Everything is off.**

- **Platform sender** — one address sends for every module (to be created;
  leave it empty until it exists). *Send test email* is switched on in a
  later step.
- **Send emails** — the master switch. It can't be turned on without a
  sender; removing the sender turns it off. The bell is not affected.
- **What is sent** — per module (Oil, Vibration, Platform): each event can
  send an email, go into the daily digest, or both. The digest time is set
  at the bottom. Who receives comes from Module Access.

Each card saves on its own and shows who changed it last; every change is
written to `PLATFORM_LOG`. Stored in the Platform Core sheet,
`EMAIL_SETTINGS` (Key | Value | Updated_By | Updated_At), made on the first
save.

**Every module email goes through this switch, event by event.**

- Oil and Vibration send mail only through `msSendMail_(payload, event)`
  (`EmailEvents.js`, the same file in both modules).
- Nothing is sent unless there is a platform sender and *Send emails* is
  on. The settings are read through the module's 10-minute platform cache.
- A module that isn't connected to the platform
  (`PLATFORM_CORE_SPREADSHEET_ID` not set) sends nothing.
- Each email carries an event key, for example `routeAssigned`,
  `reportSent` or `platform:delegation`:
  - **Email** on: it is sent at once.
  - **Daily digest** on: it is added to the module's "Email Digest Queue"
    tab.
  - Both off: it is not sent. The bell still shows it.
- An event never saved in Settings counts as **Email**, as before the
  per-event switches.
- The event list in Settings (`EmailSettings.js` `EM_MODULES`) is exactly
  the emails the modules send. Keep it in step with `MS_EMAIL_EVENTS` in
  `EmailEvents.js`.

**Daily digest.** Run `installEmailDigest` once in each module's Apps Script
editor. It adds an hourly trigger. At the digest time set in Settings (once
a day), `sendEmailDigest` sends each person one email listing everything
queued for them, then empties the queue.

## Who's online + login history (Oct 2026)

Settings → **Who's online** — Admin and ACC managers only (Platform Core
`Presence.js` checks it too; it is not part of the Settings-access matrix).

- **Check-in:** while the app is in view the shell sends `heartbeat` every
  2 minutes (`frontend/src/presence.ts`): the module and page open, the
  device kind (phone / tablet / desktop, "app" when installed) and seconds
  since the person last touched the app. Nothing is sent while the tab is
  hidden or the phone is locked; never what is typed.
- **Status:** Online = checked in within 3 min and touched the app within
  3 min; Idle = app open but untouched, or closed within 15 min; Earlier
  today; Not today (last seen date kept in the `USER_PRESENCE` sheet,
  saved at most every 10 min per person). The live part is in the script
  cache, not a sheet.
- **Login history:** sheet `LOGIN_HISTORY` (At, Email, UserId, OrgId,
  Event, Device, Details) — Signed in, Failed sign-in (email only, never
  the password), Signed out, and Opened the app (first check-in of each day,
  so people who stay signed in still show their days of use). Newest 3,000
  rows are kept. The page shows days used, sign-ins and failed sign-ins per
  person, a day-by-day list and a CSV export.

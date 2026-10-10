# Settings access

Settings → **Settings access** (App Owner) decides who sees which Settings
page, and whether they can only **view** it or also **edit** it.

| Level | Meaning |
|---|---|
| Hidden | the page is not in the menu |
| View | the page opens read-only |
| Edit · responsible | module settings only: Edit for that module's ACC responsible engineer, View for others with the role |
| Edit | can change it |

Fixed rules (cannot be changed on the page):

- **Appearance** is open to everyone, always.
- **Users**, **Settings access** and **Email & notifications** are App Owner only.
- **Equipment & IDs**: others can view at most (Equipment IDs are owned by the platform).
- The App Owner can edit everything.

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

Settings → **Email & notifications** (App Owner only). **Everything is off.**

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

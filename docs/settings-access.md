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

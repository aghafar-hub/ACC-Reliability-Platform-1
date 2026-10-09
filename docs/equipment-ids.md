# Equipment IDs, Lub IDs and Vib IDs

## Who owns what

| ID | Owner | Where it lives |
|---|---|---|
| **Equipment ID** | the platform | Platform Core sheet → `EQUIPMENT_MASTER` |
| **Lub ID** | Oil Lubrication | Oil sheet → `Equipment Registry` (column A; its Equipment ID is column B) |
| **Vib ID** | Vibration Analysis | Vibration sheet → `VIB ID Registry` (column A; its Equipment ID is column B) |

Rules:

- An Equipment ID is created, changed and retired **only** on the platform:
  Settings → **Equipment & IDs** (App Owner). Every change is written to
  `EQUIPMENT_LOG` in the Platform Core sheet (who, when, before → after).
- Every Equipment ID in a module (Lub IDs, Vib IDs, the RMS / SPM registers,
  readings, actions) must be a copy of one in the platform list.
- **Name, area and contractor come from the platform.** The modules show the
  platform's values (Oil: `Plant_Area` as the area; Vibration: `Main_Area` →
  Line 1, Line 2, CM#1, CM#2) and use the platform's contractor for contractor
  access. The modules' own columns are kept but no longer used for these.
- Oil refuses to move a Lub ID to an Equipment ID that isn't on the platform
  (or is retired).

## How the modules read the platform list

Each module's Apps Script reads the Platform Core sheet directly
(`PlatformEquipment.js`, same Google account), kept for 10 minutes. It needs
one script property in each module project:

| Property | Value |
|---|---|
| `PLATFORM_CORE_SPREADSHEET_ID` | the Platform Core sheet's ID (same value as in the Platform Core project) |
| `ID_CHECK_EMAIL` (optional) | who gets the daily notice; empty = the script owner |

Without the property a module works as before and the page says it is "not
connected".

## The check ("Not matching")

| Problem | Module |
|---|---|
| Equipment ID not in the platform list | both (registries, registers, readings, actions, history) |
| Machine retired on the platform but still has Lub / Vib IDs | both |
| Lub / Vib ID with no Equipment ID | both |
| Lub / Vib ID listed more than once | both |
| Lub / Vib ID that doesn't contain its Equipment ID (e.g. `LP-321.LQ120…` under `321.LQ125`) | both |
| Records using a Lub ID / Vib ID that isn't in the registry | Oil: samples, actions, oil changes, top-ups, route items · Vibration: report entries |
| Machine in the RMS / SPM register with no Vib ID, and the reverse | Vibration |
| Contractor column differs from the platform (the platform's is used) | both |

- Results are kept in each module's `ID Check` tab. **Mark OK** there (or on
  the page) silences one; a problem that goes away is marked `Fixed`.
- **Check now** on the page runs it at once; otherwise the last result
  (up to 6 hours old) is shown.
- **Every morning at 07:00** (`idCheckDaily`) each module runs the check and,
  when there are problems it hasn't reported before, sends the App Owner one
  bell notice and one email listing them. The bell opens Settings →
  Equipment & IDs.

## Setting it up (once per module project)

1. Paste `PlatformEquipment.js` (new) and the changed files.
2. Project Settings → Script properties → add `PLATFORM_CORE_SPREADSHEET_ID`.
3. In the editor pick **installIdCheck** → Run, and allow the new permission
   (reading the Platform Core sheet, the daily trigger). The log shows how
   many machines it read and how many problems it found.
4. Deploy → Manage deployments → Edit → New version.

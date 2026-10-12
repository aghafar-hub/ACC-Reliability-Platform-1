# Security fixes — Phase 1 (from the October 2026 audit)

What changed, why, how to install it, and how to test it. The audit's findings
are named F-xx.

## What changed

| Fix | Finding | Where |
|---|---|---|
| Login tokens, the API secret and passwords are never written to the Debug Log (every logged value is filtered) | F-01 | Oil `Utils.js` (`logRedact_`), `Code.js` |
| Every sign-in has an end time: 12 hours, or 30 days with "Keep me signed in". A sign-in from before this change counts as 30 days from when it was made | F-02 | Platform Core `Session.js`, `Auth.js` |
| Sign-ins are cancelled when a user is deleted, their roles change, or their password is changed or reset. Signing out ends that device's sign-in | F-02 | Platform Core `Session.js`, `Users.js`, `Code.js`; sheet `SESSION_REVOKED` (made by itself) |
| All three backends refuse an ended or cancelled sign-in with "Your sign-in has ended — please sign in again." The app then goes back to the Login page and shows that message | F-02 | `checkSessionAlive_` in the three backends; `frontend/src/auth/sessionEnded.ts` |
| Passwords: at least 10 characters with letters and numbers, checked on the server. A normal change needs the current password; the forced first change doesn't | F-06 | Platform Core `Auth.js`; `ChangePassword.tsx` |
| Vibration start-up and full-sync data only hold the person's own contractor's machines, points, readings and actions | F-03 | Vibration `Code.js` (`vbScopeLists_`) |
| Vibration's older save actions: limits, registers and settings are ACC / App Owner only; other changes only on the person's own contractor's machines; they run under the script lock and are written to the Vibration audit | F-04, F-11 | Vibration `Code.js` (`vbLegacyWriteDenial_`) |
| An Oil route can only hold points of its own contractor | F-05 | Oil `Routines.js` (`createRoutine`) |
| Without `SESSION_SIGNING_SECRET` the Oil and Vibration backends serve nothing (they used to stay open) | F-21 | Oil `Auth.js`, Vibration `Code.js` |

## Install (test copy first)

**Order matters.** Paste Platform Core first, then Oil and Vibration. For each project, paste the files, then **Deploy → Manage deployments → Edit → New version**.

1. **Platform Core:** `Session.js`, `Auth.js`, `Users.js`, `Code.js`, `Utils.js`, `InstallCheck.js`
2. **Oil Lubrication:** `Auth.js`, `Code.js`, `Utils.js`, `Routines.js`, `InstallCheck.js`
3. **Vibration Analysis:** `Auth.js`, `Code.js`, `InstallCheck.js`
4. Script Property `PLATFORM_CORE_SPREADSHEET_ID` must be set in all three projects (Oil and Vibration already have it for the equipment list). Without it the end time still applies, but cancellations aren't seen.
5. Run the install check of each project: all OK.

Everyone signs in again once after this (their old sign-in has no end time recorded, so the 30-day rule applies to it from when it was made).

## Change the secrets (after this is live)

Old sign-ins, including any copied from the Debug Log before this fix, keep their signature until the signing secret changes.

1. Make a new long random value (e.g. two UUIDs joined).
2. Put it in **`SESSION_SIGNING_SECRET`** in the **Platform Core, Oil and Vibration** projects. The value must be the same in all three. Change all three within a few minutes.
3. Everyone signs in again. Old tokens are refused everywhere.
4. Change `API_SECRET` in the Oil project and `OIL_API_SECRET` / `API_SECRET` in the frontend (`frontend/src/api/oilLubrication.ts`, `apps/oil-analysis/src/config.js`) in the same release.

## How to test (test copy)

- **Sign-out:** sign in on two browsers, sign out on one → the other keeps working. Within 2 minutes the signed-out browser's old sign-in is refused.
- **Role change:** change a test user's role in Settings → Users. Within 2 minutes their open app goes to the Login page with "Your sign-in has ended".
- **Password:** "Change password" refuses `short1`, asks for the current password, and after a change other devices are signed out.
- **Vibration:** as an RHI engineer, the Equipment list shows only RHI machines; Limits can't be saved; as ACC, everything shows and saves.
- **Oil:** as an RHI engineer, a route can't hold an ASEC point.
- **Debug Log:** search the Oil spreadsheet for `sessionToken` → nothing new appears.

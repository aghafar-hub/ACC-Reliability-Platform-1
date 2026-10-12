# Security fixes — Phase 2 (data integrity, from the October 2026 audit)

What changed, why, how to install it, and how to test it. The audit's findings
are named F-xx. Phase 1 is in `security-phase1.md`.

## What changed

| Fix | Finding | Where |
|---|---|---|
| Six Oil saves now read the server's answer, so a refused or failed save shows its message instead of looking saved: Sample Tracker update, lab report correction, fill report details, Report Equipment ID, responsibilities, lab PDF upload | F-10 | Oil app `api.js` (`postAnswer`) |
| Lab report import: when the server doesn't confirm a PDF, none of that PDF's samples are saved and the screen says to import it again | F-09 | Oil app `BulkImportPanel.jsx`, `App.jsx` |
| A report whose kept PDF can't be found shows "PDF missing"; the ACC Engineer can validate it after writing a reason, which goes into the Audit Log. While the PDF exists, it must still be opened first | F-09 | Oil `LabReports.js` (`validateLabReport`), `Code.js`; `LabReviewPanel.jsx`, `LabReportViewer.jsx` |
| Text starting with `=` `+` `-` or `@` is saved as text, never as a spreadsheet formula (all three backends, every request). Numbers like `-5` and a lone `-` are unchanged | F-12 | `noFormulasIn_` in each backend's `Utils.js`, called in `Code.js` |
| Sign-out removes the modules' data from the device (cached samples, equipment, My Work, read cache) and reloads the page. If entries saved offline haven't been sent yet, it asks first. When a different person signs in on the device, the previous person's data goes, unsent entries included | F-08 | `frontend/src/auth/deviceData.ts`, `AuthContext.tsx` |
| 5 wrong passwords for one email within 15 minutes → that email waits 15 minutes (even with the right password). A successful sign-in or an App Owner password reset clears it. Wrong current passwords on Change password count too | F-07 | Platform Core `Auth.js` |
| Passwords are stored with a slower hash (2,000 rounds). Existing passwords keep working and are upgraded the next time each person signs in | F-07 | Platform Core `Auth.js` |
| Salts and temporary passwords come from Google's secure random source; temporary passwords always meet the password rules | F-07 | Platform Core `Auth.js` |
| Oil Debug Log keeps its newest 5,000 rows, the Audit Log its newest 50,000; saves log the record ID, not the whole row | F-16 | Oil `Utils.js`, `AuditLog.js`, `Code.js` |
| "Change password" in the user menu (desktop) and in More (phone); the page has a Cancel button | — | `TopBar.tsx`, `MoreSheet.tsx`, `ChangePassword.tsx` |

## Install (test copy first)

Paste these files into the **Test** Apps Script projects, then
**Deploy → Manage deployments → Edit → New version** for each project:

1. **Platform Core:** `Auth.js`, `Code.js`, `Utils.js`, `InstallCheck.js`
2. **Oil Lubrication:** `Code.js`, `Utils.js`, `AuditLog.js`, `LabReports.js`, `InstallCheck.js`
3. **Vibration Analysis:** `Code.js`, `Utils.js`, `InstallCheck.js`

The website part (Oil screens, sign-out, menu link) comes with the test site
build. Nobody needs to sign in again for Phase 2.

## How to test (test copy)

- **Wrong passwords:** sign in with a test user and a wrong password 5 times → "Too many wrong passwords. Try again in 15 minutes". The right password is refused too. Reset that user's password as App Owner → they can sign in at once.
- **Formula text:** add an Oil action with the comment `=1+1`. In the sheet the cell shows `=1+1`, not `2`.
- **Sign-out on a shared PC:** sign in, open Oil, sign out. Press F12 → Application → Local Storage: no `acc_oilapp_cache_…` entries remain.
- **Change password link:** user menu (top right) → Change password → Cancel returns.
- **Missing lab PDF:** a Pending Validation report whose PDF was never stored → Open report says "PDF missing"; Validate asks for a reason; the Audit Log shows it.
- **Failed save shows:** as an RHI engineer, re-import a lab PDF whose sample belongs to ASEC (or a validated one) → the screen shows the server's reason, not "corrected".

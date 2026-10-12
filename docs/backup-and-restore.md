# Backup and restore

The three databases are Google Sheets: **ACC Reliability Data Base** (Platform Core),
**Oil Lubrication** and **Vibration Analysis**. Google keeps a version history of each,
and since October 2026 a nightly copy is made as well (audit I-03).

## Set up the nightly copy (once)

1. Open the **Platform Core** Apps Script project.
2. **Project Settings → Script Properties → Add**: `BACKUP_SPREADSHEET_IDS` = the three
   spreadsheet IDs separated by commas. The ID is the long part of each sheet's address,
   between `/d/` and `/edit`.
3. In the editor pick **installBackupTrigger** and click **Run** (allow access when asked).
4. Pick **runBackupNow** and **Run** once to check. Open Google Drive → folder
   **"ACC Reliability — backups"**: one copy per database, named
   "… — backup YYYY-MM-DD HHMM".

Copies older than 14 days go to the Drive bin (and stay restorable there for 30 days).
The folder belongs to the account that runs the script and is shared with nobody — keep
it that way, the copies hold the same data as the live sheets.

## Restore

**A few cells or rows went wrong** (most cases):
1. Open the live sheet → **File → Version history → See version history**.
2. Pick a time before the mistake, find the rows, copy them, and paste them back into
   the live sheet (don't use "Restore this version" if other people have saved since —
   it would undo their work too).

**A whole sheet tab is damaged or deleted**:
1. Open the newest good copy in the backups folder.
2. Right-click the tab → **Copy to → Existing spreadsheet** → the live database.
3. In the live database, delete the damaged tab and rename the copied one to the
   exact old name ("Copy of …" → original name). The apps find tabs by name.

**The whole spreadsheet is lost**:
1. In the backups folder, right-click the newest good copy → **Make a copy**, rename it
   to the original name.
2. Put its ID in the Script Properties that point at it: Oil / Vibration projects use
   their bound spreadsheet; Platform Core's ID goes in `PLATFORM_CORE_SPREADSHEET_ID`
   in all three projects. A bound spreadsheet can't be swapped — in that case ask the
   developer to move the script project to the restored file.
3. Set sharing to **Restricted** again.
4. Run each project's install check (all OK) and sign in to the app.

## Test it twice a year

Restore one tab from a backup copy into the **test** copy of the database and open the
test site. Write down the date and the result.

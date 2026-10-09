# Arabic view and the Arabic word list

## For everyone

- **Switch language:** the **EN / عربي** button in the top bar (computer) or
  in **More** (phone), or **Settings → Language**. It is kept on the device.
- In Arabic the page reads right-to-left. Equipment IDs, LP / VIB codes,
  numbers, dates and charts stay as they are, left-to-right.
- What people type (comments, readings, names) is never translated.

## For the App Owner — checking the Arabic

The app's words live in Platform Core's spreadsheet, sheet **TRANSLATIONS**:

| Key | English | Arabic | Area | Notes | Status | Updated_By | Updated_At |
|---|---|---|---|---|---|---|---|

- **Key** is the app's id for the words — don't change it.
- **Arabic** is what the Arabic view shows. Empty = the first suggestion
  stays.
- **Status**: *Draft* (first suggestion, to be checked) or *Approved*.

Steps:

1. Open **Settings → Language → Arabic word list**.
2. Press **Add N words to the sheet** once. Every word goes into the
   sheet as *Draft* with a first Arabic suggestion. Words already in the
   sheet are never overwritten.
3. Check the words — here (search, change the Arabic, set *Approved*,
   **Save**) or straight in the spreadsheet. Everyone sees the change
   the next time they open the app.

When a later version adds new words, the same button adds just those.

## Rollout (Apps Script)

Platform Core needs two files pasted (same project, then **Deploy → Manage
deployments → Edit → New version**):

- `backend/platform-core/src/Translations.js` (new file)
- `backend/platform-core/src/Code.js` (adds `getTranslations`,
  `addTranslationTerms`, `saveTranslation`)

Until then the app uses its built-in first suggestions, and the word list
in Settings says it can't read the sheet.

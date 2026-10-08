/**
 * Arabic word list (mobile app M4). The platform's words live in the
 * TRANSLATIONS sheet so the App Owner can check and change the Arabic
 * directly in the spreadsheet (or later from Settings). The app reads the
 * whole list once at login and keeps a copy on the phone.
 *
 * TRANSLATIONS columns:
 *   Key | English | Arabic | Area | Notes | Status | Updated_By | Updated_At
 *   Key      — the app's id for the words (never change it)
 *   English  — the words as shown in English today (for reference)
 *   Arabic   — what the Arabic view shows; empty = English is shown
 *   Area     — where it appears (Navigation, Status, Oil, Vibration, …)
 *   Status   — "Draft" (first suggestion, to be checked) or "Approved"
 *
 * The sheet is created on first use. Adding terms never overwrites Arabic
 * that is already in the sheet — the sheet stays the source of truth.
 */

var TRANSLATIONS_SHEET = 'TRANSLATIONS';
var TRANSLATIONS_HEADERS = ['Key', 'English', 'Arabic', 'Area', 'Notes', 'Status', 'Updated_By', 'Updated_At'];

function translationsSheet_() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(TRANSLATIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TRANSLATIONS_SHEET);
    sheet.getRange(1, 1, 1, TRANSLATIONS_HEADERS.length).setValues([TRANSLATIONS_HEADERS]);
    sheet.setFrozenRows(1);
    // right-to-left reading for the Arabic column
    try { sheet.getRange('C:C').setHorizontalAlignment('right'); } catch (e) {}
  }
  return sheet;
}

/** Everyone signed in: { terms: [{ key, en, ar, area, status }], updatedAt } */
function getTranslations_() {
  var rows = readSheetAsObjects_(translationsSheet_());
  var latest = '';
  var terms = rows
    .filter(function (r) { return String(r.Key || '').trim(); })
    .map(function (r) {
      var at = r.Updated_At instanceof Date ? r.Updated_At.toISOString() : String(r.Updated_At || '');
      if (at > latest) latest = at;
      return {
        key: String(r.Key).trim(),
        en: String(r.English || ''),
        ar: String(r.Arabic || ''),
        area: String(r.Area || ''),
        status: String(r.Status || ''),
      };
    });
  return { terms: terms, updatedAt: latest, count: terms.length };
}

/**
 * App Owner: add the app's words that aren't in the sheet yet (with a
 * first Arabic suggestion marked Draft). Existing rows are left alone.
 * terms: [{ key, en, ar, area }]
 */
function addTranslationTerms_(userEmail, terms) {
  if (!terms || !terms.length) return { added: 0 };
  return withLock_(function () {
    var sheet = translationsSheet_();
    var have = {};
    readSheetAsObjects_(sheet).forEach(function (r) { have[String(r.Key).trim()] = true; });
    var now = new Date();
    var rows = [];
    terms.forEach(function (t) {
      var key = String((t && t.key) || '').trim();
      if (!key || have[key]) return;
      have[key] = true;
      rows.push([key, String(t.en || ''), String(t.ar || ''), String(t.area || ''), '', 'Draft', userEmail, now]);
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TRANSLATIONS_HEADERS.length).setValues(rows);
    return { added: rows.length };
  });
}

/** App Owner: change one word's Arabic (and mark it Approved or Draft). */
function saveTranslation_(userEmail, key, arabic, status) {
  key = String(key || '').trim();
  if (!key) throw new Error('Which word?');
  return withLock_(function () {
    var sheet = translationsSheet_();
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() !== key) continue;
      sheet.getRange(i + 1, 3).setValue(String(arabic || ''));
      sheet.getRange(i + 1, 6).setValue(status === 'Draft' ? 'Draft' : 'Approved');
      sheet.getRange(i + 1, 7, 1, 2).setValues([[userEmail, new Date()]]);
      return { saved: true };
    }
    throw new Error('That word is not in the list.');
  });
}

/**
 * Backfills the (mostly blank) "VIB ID" column on every existing row of
 * 📥 RMS DATA and 📥 SPM DATA by matching each row against the "VIB ID
 * Registry" tab — the same registry Code.fixed.gs's readVibRegistry()
 * already serves to the app. Paste this as an ADDITIONAL file in the same
 * Apps Script project as Code.fixed.gs (it calls that file's
 * readVibRegistry()/SHEET_VIB_REGISTRY directly — make sure Code.fixed.gs
 * is already the deployed Code.gs before running this).
 *
 * RUN ONE SHEET AT A TIME, same reasoning as Migrate.gs: 📥 RMS DATA alone
 * is 6,500+ rows and can burn most of one execution's time budget, so pick
 * each function from the editor's dropdown and Run it separately:
 *
 *   1. backfillRmsVibIds()
 *   2. backfillSpmVibIds()
 *
 * backfillVibIds() (runs both in one execution) is kept for convenience on
 * a small sheet, but expect the same timeout risk Migrate.gs warns about.
 *
 * ── Matching rule (deliberately conservative — never guesses) ───────────
 * For each RMS/SPM DATA row with a blank VIB ID and both an Equipment ID
 * and Asset ID (point name) present:
 *   1. Build the registry's own lookup, keyed by
 *      `equipmentId|family|normalizedText`, where every VIB ID Registry
 *      row contributes one key per semicolon-separated part of its own
 *      Point Description (some RMS points list several synonym phrases
 *      joined with ";", e.g. "Shaft 01 Inboard Axial; ...; Shaft 1
 *      inboard DE" — each part has to match on its own).
 *   2. For an RMS DATA row: look up `equipmentId|RMS|normalize(Asset ID)`.
 *   3. For an SPM DATA row: the registry often disambiguates multiple
 *      physical sensors at the same position with a suffix in the
 *      description text — e.g. "Compressor DE (5)" vs "Compressor DE
 *      (7)" — and the real SPM DATA sheet's own "Type" column holds that
 *      same suffix value (5, 7, A, B, ...) for exactly this reason. So
 *      SPM rows try `equipmentId|SPM|normalize("Asset ID (Type)")`
 *      first, falling back to `equipmentId|SPM|normalize(Asset ID)` alone
 *      (covers single-sensor positions, where Type is just "SPM" and the
 *      registry's own description has no numeric suffix at all). SPM rows
 *      are never matched against the registry's "Gs" family — the app's
 *      own data model (see vibPointKey() calls in src/App.jsx/NewReading
 *      .jsx) treats a whole SPM point (HDm/HDc/Gs together) as one "SPM"
 *      family lookup; "Gs" family registry rows exist for a Peakvue/
 *      spectrum channel the app doesn't surface yet.
 * No position-code-derivation fallback is attempted (unlike the earlier
 * sandbox-stage Python script) — anything that doesn't exact-match one of
 * the above stays blank rather than being guessed, matching this whole
 * project's own "don't guess" rule (see vib-id-merge/README.md's own
 * "left unmatched rather than guessed" cases). Only ever FILLS a blank
 * cell, never overwrites one that already has a value — safe to re-run
 * any time (e.g. after the registry itself gets new rows), including
 * after a partial/interrupted run.
 */

var BACKFILL_BATCH_SIZE = 1000;

function normalizeVibMatchText(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Builds `equipmentId|family|normalizedText` -> vibId, one entry per
// semicolon-separated part of each registry row's own Point Description.
// First writer for a given key wins (same "setdefault" convention the
// earlier Python matcher used) — a real collision here would mean the
// registry itself has two different VIB IDs claiming the identical
// description text for the same equipment+family, which is a registry
// data problem to fix at the source, not something this function should
// silently pick a winner for by overwriting.
function buildVibRegistryLookup(ss) {
  var rows = readVibRegistry(ss); // from Code.fixed.gs, same project
  var lookup = {};
  rows.forEach(function (r) {
    var eid = r['Equipment ID'];
    var family = r['Family'];
    var vibId = r['VIB ID'];
    if (!eid || !family || !vibId) return;
    String(r['Point Description'] || '')
      .split(';')
      .map(normalizeVibMatchText)
      .filter(Boolean)
      .forEach(function (part) {
        var key = eid + '|' + family + '|' + part;
        if (!(key in lookup)) lookup[key] = vibId;
      });
  });
  return lookup;
}

function backfillSheetVibIds(sheetName, vibIdCol, equipIdCol, assetIdCol, typeCol, family) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lookup = buildVibRegistryLookup(ss);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    var msg = sheetName + ': sheet not found, skipped';
    Logger.log(msg);
    return msg;
  }
  var cfg = SHEET_CFG[sheetName];
  var dataStart = cfg ? cfg.dataStartRow : 4;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < vibIdCol) {
    var msg2 = sheetName + ': no data rows, skipped';
    Logger.log(msg2);
    return msg2;
  }

  var totalRows = lastRow - dataStart + 1;
  var filled = 0;
  var alreadySet = 0;
  var unmatched = 0;
  for (var offset = 0; offset < totalRows; offset += BACKFILL_BATCH_SIZE) {
    var batchRows = Math.min(BACKFILL_BATCH_SIZE, totalRows - offset);
    var range = sheet.getRange(dataStart + offset, 1, batchRows, lastCol);
    var values = range.getValues();
    var batchFilled = 0;
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var existing = row[vibIdCol - 1];
      if (existing !== '' && existing !== null && existing !== undefined) {
        alreadySet++;
        continue;
      }
      var eid = String(row[equipIdCol - 1] || '').trim();
      var point = row[assetIdCol - 1];
      if (!eid || !point) continue;

      var vibId = '';
      if (typeCol) {
        var typeVal = row[typeCol - 1];
        if (typeVal !== '' && typeVal !== null && typeVal !== undefined) {
          var withType = eid + '|' + family + '|' + normalizeVibMatchText(point + ' (' + typeVal + ')');
          vibId = lookup[withType] || '';
        }
      }
      if (!vibId) {
        var plain = eid + '|' + family + '|' + normalizeVibMatchText(point);
        vibId = lookup[plain] || '';
      }

      if (vibId) {
        row[vibIdCol - 1] = vibId;
        batchFilled++;
      } else {
        unmatched++;
      }
    }
    if (batchFilled > 0) {
      range.setValues(values);
      filled += batchFilled;
    }
    Logger.log(
      sheetName + ': batch ' + (offset + 1) + '-' + (offset + batchRows) + ' of ' + totalRows +
      ' done, ' + batchFilled + ' filled this batch'
    );
  }

  var summary = sheetName + ': ' + filled + ' filled, ' + alreadySet + ' already had a VIB ID, ' +
    unmatched + ' unmatched (left blank), out of ' + totalRows + ' rows';
  Logger.log(summary);
  return summary;
}

// 📥 RMS DATA columns (see docs/SHEET_SCHEMA.md): VIB ID=3, Equipment ID=4,
// Asset ID=5. No Type column — RMS points match on Asset ID text alone.
function backfillRmsVibIds() {
  return backfillSheetVibIds(SHEET_RMS, 3, 4, 5, null, 'RMS');
}

// 📥 SPM DATA columns: VIB ID=3, Equipment ID=4, Asset ID=5, Type=6.
function backfillSpmVibIds() {
  return backfillSheetVibIds(SHEET_SPM, 3, 4, 5, 6, 'SPM');
}

// Convenience: runs both in one execution. Fine for a small sheet; on a
// sheet this size, prefer running the two functions above individually
// instead — each gets its own fresh execution time budget.
function backfillVibIds() {
  var summary = [backfillRmsVibIds(), backfillSpmVibIds()];
  Logger.log(summary.join('\n'));
  return summary;
}

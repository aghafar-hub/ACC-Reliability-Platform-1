// "VIB ID Registry" reader — one row per physical measurement point, the
// permanent identifier every RMS/SPM DATA row's own "VIB ID" column
// references (see apps/vibration-analysis/apps-script/vib-id-merge/README.md
// for how this tab was built). Real column order confirmed directly
// against the live sheet: VIB_ID(1), Equipment_ID(2), Position_Code(3),
// Family(4), Point_Description(5), "Reading columns "(6, stray trailing
// space in the real header), Contractor(7), VIB_Status(8).
//
// Reads by fixed column position rather than the generic readSheet() in
// Utils.js (same approach readCompliance() already uses for its own
// irregularly-shaped sheet) because that trailing-space header would
// otherwise leak into the JSON key every client-side lookup has to match
// exactly. Emits the same spaced, clean header-text keys every other
// sheet's reader in this project produces, so src/parsers.js's
// rowToVibPoint() on the client reads it the same way it reads everything
// else.
function readVibRegistry(ss) {
  var sheet = ss.getSheetByName(SHEET_VIB_REGISTRY);
  if (!sheet) return [];
  var dataStart = dataStartRowFor(SHEET_VIB_REGISTRY);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < dataStart || lastCol < 1) return [];
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, Math.max(lastCol, 8)).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue; // skip blank rows
    out.push({
      'VIB ID':             String(row[0]||'').trim(),
      'Equipment ID':       String(row[1]||'').trim(),
      'Position Code':      String(row[2]||'').trim(),
      'Family':             String(row[3]||'').trim(),
      'Point Description':  String(row[4]||'').trim(),
      'Reading Columns':    String(row[5]||'').trim(),
      'Contractor':         String(row[6]||'').trim(),
      'Status':             String(row[7]||'').trim(),
      'Area':               String(row[8]||'').trim(),
      _rowNum: dataStart + i,
    });
  }
  // the platform's contractor and area (PlatformEquipment.js)
  return peApplyToPoints_(out);
}

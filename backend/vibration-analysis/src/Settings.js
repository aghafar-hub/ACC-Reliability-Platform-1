// ─── Configuration sheet (webhookUrl/googleSheetUrl/contractors — the
// client's own Settings page) — read/save. ──────────────────────────────
function handleReadConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {status:'ok', config: readConfigRaw(ss)};
}

function readConfigRaw(ss) {
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) return {};
  var lastRow   = sheet.getLastRow();
  var dataStart = dataStartRowFor(SHEET_CONFIG);
  if (lastRow < dataStart) return {};
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 2).getValues();
  var out  = {};
  for (var i = 0; i < data.length; i++) {
    var key = String(data[i][0]||'').trim();
    var val = data[i][1];
    if (!key) continue;
    out[key] = val;
  }
  return out;
}

function handleSaveConfig(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG);
    sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
  }
  var configObj = {};
  try { configObj = JSON.parse(params.config || '{}'); } catch(e) { configObj = {}; }
  var dataStart = dataStartRowFor(SHEET_CONFIG);
  for (var key in configObj) {
    if (!configObj.hasOwnProperty(key)) continue;
    var val     = configObj[key];
    var lastRow = sheet.getLastRow();
    var found   = false;
    if (lastRow >= dataStart) {
      var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]||'').trim() === key) {
          sheet.getRange(dataStart + i, 2).setValue(val);
          found = true; break;
        }
      }
    }
    if (!found) sheet.appendRow([key, val]);
  }
  return {status:'ok', action:'saveConfig', keys:Object.keys(configObj).length};
}

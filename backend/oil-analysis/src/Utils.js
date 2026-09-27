/**
 * Shared helpers used across every Oil Analysis endpoint. Deliberately the
 * same shape as Platform Core's Utils.js (spec §10a durability decisions:
 * friendly error handling + duplicate-submission protection) — each
 * module's backend is independent, so this is a copy, not a shared import.
 */

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return jsonResponse_({ ok: true, data: data });
}

function safeHandle_(handlerFn) {
  var correlationId = Utilities.getUuid();
  try {
    return handlerFn();
  } catch (err) {
    console.error('[' + correlationId + '] ' + (err && err.stack ? err.stack : err));
    return jsonResponse_({
      ok: false,
      error: {
        message: 'Something went wrong. Please try again, and share this reference if it keeps happening.',
        correlationId: correlationId
      }
    });
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('System is busy, please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * IDEMPOTENCY_LOG isn't part of the module's core data model, so unlike
 * getSheet_ below (which throws on a missing sheet — a safety net against
 * typos in master-data sheet names), this creates the log sheet on first
 * use rather than requiring it to be added by hand in the Google Sheet.
 */
function getOrCreateIdempotencyLogSheet_() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(SHEET_NAMES.IDEMPOTENCY_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.IDEMPOTENCY_LOG);
    sheet.appendRow(['OperationId', 'UserId', 'Endpoint', 'ResultJson', 'CreatedDate']);
  }
  return sheet;
}

function withIdempotency_(operationId, endpoint, fn) {
  if (!operationId) {
    return fn();
  }
  var sheet = getOrCreateIdempotencyLogSheet_();
  var existing = findRowByColumn_(sheet, 'OperationId', operationId);
  if (existing) {
    return JSON.parse(existing['ResultJson']);
  }
  var result = fn();
  appendRow_(sheet, {
    OperationId: operationId,
    Endpoint: endpoint,
    ResultJson: JSON.stringify(result),
    CreatedDate: new Date()
  });
  return result;
}

function getSheet_(sheetName) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Expected sheet "' + sheetName + '" was not found.');
  }
  return sheet;
}

/** Reads a sheet into an array of plain objects keyed by header row. */
function readSheetAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    rows.push(row);
  }
  return rows;
}

function findRowByColumn_(sheet, columnName, value) {
  var rows = readSheetAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][columnName] === value) return rows[i];
  }
  return null;
}

function appendRow_(sheet, rowObject) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(rowObject, h) ? rowObject[h] : '';
  });
  sheet.appendRow(row);
}

/**
 * Updates the first row whose columnName equals value, setting each key in
 * updates. Used by the Routine workflow to move a routine/item through its
 * states without rewriting the whole sheet.
 */
function updateRowByColumn_(sheet, columnName, value, updates) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(columnName);
  if (colIndex === -1) {
    throw new Error('Column "' + columnName + '" not found.');
  }
  var values = sheet.getRange(2, colIndex + 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === value) {
      var rowIndex = i + 2;
      Object.keys(updates).forEach(function (key) {
        var c = headers.indexOf(key);
        if (c !== -1) {
          sheet.getRange(rowIndex, c + 1).setValue(updates[key]);
        }
      });
      return true;
    }
  }
  return false;
}

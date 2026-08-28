/**
 * Shared helpers used across every Platform Core endpoint.
 *
 * Implements two of the durability decisions from the Foundation spec
 * (docs/platform-foundation-spec.md §10a):
 *  - Friendly, safe error handling: callers never see a raw Apps
 *    Script/Sheets error or stack trace, only a correlation ID + message.
 *  - Duplicate-submission protection: every write can be tagged with a
 *    client-generated operation ID; a repeated ID is treated as
 *    already-done rather than re-applied.
 */

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return jsonResponse_({ ok: true, data: data });
}

/**
 * Wraps a handler so any thrown error becomes a safe, friendly response
 * instead of leaking a raw Apps Script stack trace to the client. Logs
 * the real error server-side with a correlation ID the user can quote to
 * support without exposing internals.
 */
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

/**
 * Runs fn while holding a script-wide lock, so two simultaneous requests
 * can never interleave writes to the same sheet. Throws if the lock can't
 * be acquired within the timeout, which safeHandle_ turns into a friendly
 * "please retry" response rather than corrupting data.
 */
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
 * Idempotency check: if operationId has already been recorded as
 * completed, returns the previous result instead of letting the caller
 * re-run the write (protects against double-tap submits and offline-sync
 * retries creating duplicate records).
 *
 * IDEMPOTENCY_LOG columns: OperationId, UserId, Endpoint, ResultJson, CreatedDate
 */
function withIdempotency_(operationId, endpoint, fn) {
  if (!operationId) {
    // No operation ID supplied — caller didn't opt into dedup, run normally.
    return fn();
  }
  var sheet = getSheet_(SHEET_NAMES.IDEMPOTENCY_LOG);
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

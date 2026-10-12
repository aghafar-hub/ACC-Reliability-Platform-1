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
 * Wraps a handler so any thrown error becomes a safe response instead of
 * an uncaught exception. Every throw site in this codebase already uses a
 * deliberate, safe-to-show message (e.g. "Invalid email or password.") —
 * those pass straight through. Only a message-less/unexpected failure
 * (a raw Apps Script/Sheets error) falls back to the generic text, so
 * internals still never leak, but expected validation errors are no
 * longer hidden behind it either. Always logs the real error server-side
 * with a correlation ID the user can quote to support.
 */
function safeHandle_(handlerFn) {
  var correlationId = Utilities.getUuid();
  try {
    return handlerFn();
  } catch (err) {
    console.error('[' + correlationId + '] ' + (err && err.stack ? err.stack : err));
    var message = (err && err.message) ? err.message
      : 'Something went wrong. Please try again, and share this reference if it keeps happening.';
    return jsonResponse_({
      ok: false,
      error: { message: message, correlationId: correlationId, sessionEnded: isSessionEndedError_(err) || /Invalid session token|malformed session token/.test(message) }
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

/**
 * Deletes every data row where columnName === value (e.g. clearing a
 * user's old USER_ROLES rows before writing their new role set). Deletes
 * bottom-to-top so each deleteRow() doesn't shift the index of a
 * not-yet-processed match above it.
 */
function deleteRowsByColumn_(sheet, columnName, value) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0];
  var col = headers.indexOf(columnName);
  if (col === -1) return 0;
  var deleted = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][col] === value) {
      sheet.deleteRow(i + 1); // +1: sheet rows are 1-based
      deleted++;
    }
  }
  return deleted;
}

// ── Text that would run as a spreadsheet formula (audit F-12) ──────────
// Google Sheets runs a cell that starts with = + - or @ as a formula, so a
// comment like =HYPERLINK(...) would become a live link. Every request's
// values pass through here first: such text gets a leading ' (Sheets
// keeps the text and hides the '; reading the cell back gives the
// original text). Numbers like -5 and keys used to find rows are left as
// they are.
var NO_FORMULA_SKIP_KEYS = { action: 1, secret: 1, sessionToken: 1, password: 1, newPassword: 1, currentPassword: 1,
  operationId: 1, matchCols: 1, matchValues: 1, callback: 1, q: 1 };

function noFormulaText_(s) {
  if (typeof s !== 'string' || !/^\s*[=+\-@]/.test(s)) return s;
  if (/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s)) return s; // a number
  if (/^\s*-+\s*$/.test(s)) return s; // "-" used as "none"
  return "'" + s;
}

function noFormulasIn_(v, depth) {
  depth = depth || 0;
  if (depth > 8 || v === null || v === undefined) return v;
  if (typeof v === 'string') {
    // some modules send a row as a JSON text (e.g. row: '["A","=1+1"]')
    if (/^\s*[\[{]/.test(v) && v.length < 200000) {
      try {
        var parsed = JSON.parse(v);
        var cleaned = noFormulasIn_(parsed, depth + 1);
        var again = JSON.stringify(cleaned);
        return again === JSON.stringify(parsed) ? v : again;
      } catch (e) { return v; }
    }
    return noFormulaText_(v);
  }
  if (Array.isArray(v)) return v.map(function (x) { return noFormulasIn_(x, depth + 1); });
  if (typeof v === 'object' && !(v instanceof Date)) {
    var out = {};
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      out[k] = (NO_FORMULA_SKIP_KEYS[k] || /base64/i.test(k)) ? v[k] : noFormulasIn_(v[k], depth + 1);
    }
    return out;
  }
  return v;
}

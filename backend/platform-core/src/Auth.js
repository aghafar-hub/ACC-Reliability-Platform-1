/**
 * Authentication — Foundation spec §5.
 *
 * - Own email+password login, not Google-account-based.
 * - App Admin creates users; a password is auto-generated and shown to
 *   the admin to relay manually (no email sending required for auth).
 * - Forced password change on first login.
 * - Admin manually resets a locked-out user's password (no self-service
 *   email reset link).
 * - No 2FA / idle auto-logout / failed-attempt lockout for v1 (decided).
 *
 * USERS sheet columns:
 *   UserId, Email, PasswordHash, PasswordSalt, MustChangePassword,
 *   OrgId, Status (Active/Inactive), CreatedDate, ModifiedDate
 */

var SALT_BYTES = 16;

function hashPassword_(password, salt) {
  var digest = Utilities.computeHmacSha256Signature(password, salt);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function generateSalt_() {
  var bytes = [];
  for (var i = 0; i < SALT_BYTES; i++) bytes.push(Math.floor(Math.random() * 256));
  return Utilities.base64Encode(bytes);
}

function generateTempPassword_() {
  // Human-relayable: avoids ambiguous characters (0/O, 1/l/I).
  var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var pwd = '';
  for (var i = 0; i < 10; i++) {
    pwd += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return pwd;
}

/**
 * App Admin only — enforced by the RBAC check in Code.js before this is
 * called, not just by convention here.
 */
function createUser_(email, orgId) {
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.USERS);
    if (findRowByColumn_(sheet, 'Email', email)) {
      throw new Error('A user with this email already exists.');
    }
    var tempPassword = generateTempPassword_();
    var salt = generateSalt_();
    appendRow_(sheet, {
      UserId: Utilities.getUuid(),
      Email: email,
      PasswordHash: hashPassword_(tempPassword, salt),
      PasswordSalt: salt,
      MustChangePassword: true,
      OrgId: orgId,
      Status: 'Active',
      CreatedDate: new Date(),
      ModifiedDate: new Date()
    });
    // Returned once, to the admin's screen, for manual relay — never
    // stored in plaintext and never emailed.
    return { email: email, tempPassword: tempPassword };
  });
}

function login_(email, password) {
  var sheet = getSheet_(SHEET_NAMES.USERS);
  var user = findRowByColumn_(sheet, 'Email', email);
  if (!user || user.Status !== 'Active') {
    throw new Error('Invalid email or password.');
  }
  var hash = hashPassword_(password, user.PasswordSalt);
  if (hash !== user.PasswordHash) {
    throw new Error('Invalid email or password.');
  }
  return {
    userId: user.UserId,
    email: user.Email,
    orgId: user.OrgId,
    mustChangePassword: !!user.MustChangePassword,
    sessionToken: issueSessionToken_(user.UserId)
  };
}

function changePassword_(userId, newPassword) {
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.USERS);
    var rows = readSheetAsObjects_(sheet);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].UserId === userId) {
        var salt = generateSalt_();
        var rowIndex = i + 2; // +1 header, +1 to move from 0-based to 1-based
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        sheet.getRange(rowIndex, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(newPassword, salt));
        sheet.getRange(rowIndex, headers.indexOf('PasswordSalt') + 1).setValue(salt);
        sheet.getRange(rowIndex, headers.indexOf('MustChangePassword') + 1).setValue(false);
        sheet.getRange(rowIndex, headers.indexOf('ModifiedDate') + 1).setValue(new Date());
        return { ok: true };
      }
    }
    throw new Error('User not found.');
  });
}

/**
 * App Admin only. Generates a fresh temp password the same way as
 * account creation, for the admin to relay manually.
 */
function adminResetPassword_(userId) {
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.USERS);
    var rows = readSheetAsObjects_(sheet);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].UserId === userId) {
        var tempPassword = generateTempPassword_();
        var salt = generateSalt_();
        var rowIndex = i + 2;
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        sheet.getRange(rowIndex, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(tempPassword, salt));
        sheet.getRange(rowIndex, headers.indexOf('PasswordSalt') + 1).setValue(salt);
        sheet.getRange(rowIndex, headers.indexOf('MustChangePassword') + 1).setValue(true);
        sheet.getRange(rowIndex, headers.indexOf('ModifiedDate') + 1).setValue(new Date());
        return { email: rows[i].Email, tempPassword: tempPassword };
      }
    }
    throw new Error('User not found.');
  });
}

// TODO: issueSessionToken_ / validateSessionToken_ — simple signed-token
// scheme (no 2FA/idle-timeout/device-limit per the v1 decision), to be
// implemented alongside Code.js's request-auth wrapper.
function issueSessionToken_(userId) {
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: auth & session');
}

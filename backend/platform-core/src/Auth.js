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
 * - Every sign-in has an end time and can be cancelled (Session.js).
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
 * called, not just by convention here. roleIds is optional (a user with
 * no role yet passes every hasPermission_ check as "nothing granted",
 * not as an error) — kept optional so this doesn't reject an old-shaped
 * request from a not-yet-redeployed frontend.
 */
function createUser_(email, orgId, roleIds) {
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.USERS);
    if (findRowByColumn_(sheet, 'Email', email)) {
      throw new Error('A user with this email already exists.');
    }
    var validRoleIds = readSheetAsObjects_(getSheet_(SHEET_NAMES.ROLES)).map(function (r) { return r.RoleId; });
    var roles = (roleIds || []).filter(function (r) { return r; });
    roles.forEach(function (r) {
      if (validRoleIds.indexOf(r) === -1) throw new Error('Unknown role: ' + r);
    });

    var tempPassword = generateTempPassword_();
    var salt = generateSalt_();
    var userId = Utilities.getUuid();
    appendRow_(sheet, {
      UserId: userId,
      Email: email,
      PasswordHash: hashPassword_(tempPassword, salt),
      PasswordSalt: salt,
      MustChangePassword: true,
      OrgId: orgId,
      Status: 'Active',
      CreatedDate: new Date(),
      ModifiedDate: new Date()
    });
    var userRolesSheet = getSheet_(SHEET_NAMES.USER_ROLES);
    roles.forEach(function (roleId) {
      appendRow_(userRolesSheet, { UserId: userId, RoleId: roleId });
    });
    // Returned once, to the admin's screen, for manual relay — never
    // stored in plaintext and never emailed.
    return { email: email, tempPassword: tempPassword };
  });
}

function login_(email, password, remember) {
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
    sessionToken: issueSessionToken_(user.UserId, remember)
  };
}

var PASSWORD_MIN_LENGTH = 10;

// The password rules, checked here on the server (the screen checks the
// same, but a direct request must not get around them).
function passwordProblem_(password, email) {
  var p = String(password == null ? '' : password);
  if (p.length < PASSWORD_MIN_LENGTH) return 'The new password needs at least ' + PASSWORD_MIN_LENGTH + ' characters.';
  if (p.length > 200) return 'The new password is too long.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'The new password needs letters and numbers.';
  if (email && p.toLowerCase().indexOf(String(email).split('@')[0].toLowerCase()) !== -1) return 'The new password must not contain your email name.';
  return '';
}

// session: the signed-in person. currentPassword is required, except for the
// forced change after an admin-made or reset password. Cancels every other
// sign-in of this person and returns a fresh token for this device.
function changePassword_(session, newPassword, currentPassword) {
  var userId = session.userId;
  var result = withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.USERS);
    var rows = readSheetAsObjects_(sheet);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].UserId === userId) {
        var problem = passwordProblem_(newPassword, rows[i].Email);
        if (problem) throw new Error(problem);
        var forced = rows[i].MustChangePassword === true || String(rows[i].MustChangePassword).toUpperCase() === 'TRUE';
        if (!forced && hashPassword_(String(currentPassword || ''), rows[i].PasswordSalt) !== rows[i].PasswordHash) {
          throw new Error('Your current password is not correct.');
        }
        if (hashPassword_(String(newPassword), rows[i].PasswordSalt) === rows[i].PasswordHash) {
          throw new Error('Choose a password different from the current one.');
        }
        var salt = generateSalt_();
        var rowIndex = i + 2; // +1 header, +1 to move from 0-based to 1-based
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        sheet.getRange(rowIndex, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(newPassword, salt));
        sheet.getRange(rowIndex, headers.indexOf('PasswordSalt') + 1).setValue(salt);
        sheet.getRange(rowIndex, headers.indexOf('MustChangePassword') + 1).setValue(false);
        sheet.getRange(rowIndex, headers.indexOf('ModifiedDate') + 1).setValue(new Date());
        revokeUserSessions_(userId, 'Password changed');
        return { ok: true };
      }
    }
    throw new Error('User not found.');
  });
  // a new sign-in for this device, kept as long as the old one was meant to be
  var hoursLeft = session.expiresAt ? (session.expiresAt - Date.now()) / 3600000 : 0;
  result.sessionToken = issueSessionToken_(userId, hoursLeft > SESSION_SHORT_HOURS);
  return result;
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
        revokeUserSessions_(userId, 'Password reset by admin');
        return { email: rows[i].Email, tempPassword: tempPassword };
      }
    }
    throw new Error('User not found.');
  });
}

// issueSessionToken_ / requireSession_ live in Session.js.

/**
 * Authentication — Foundation spec §5.
 *
 * - Own email+password login, not Google-account-based.
 * - App Admin creates users; a password is auto-generated and shown to
 *   the admin to relay manually (no email sending required for auth).
 * - Forced password change on first login.
 * - Admin manually resets a locked-out user's password (no self-service
 *   email reset link).
 * - No 2FA / idle auto-logout for v1 (decided). 5 wrong passwords in a row
 *   make that email wait 15 minutes (owner decision, October 2026 audit).
 * - Every sign-in has an end time and can be cancelled (Session.js).
 *
 * USERS sheet columns:
 *   UserId, Email, PasswordHash, PasswordSalt, MustChangePassword,
 *   OrgId, Status (Active/Inactive), CreatedDate, ModifiedDate
 */

var SALT_BYTES = 16;

// Stored hashes look like "v2$<rounds>$<hex>": HMAC-SHA256 repeated <rounds>
// times, so a copied USERS sheet is slow to guess against. Hashes made
// before this (one HMAC, no prefix) still work and are upgraded the next
// time that person signs in.
var PASSWORD_HASH_ROUNDS = 2000;

function bytesToHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function hashPasswordOnce_(password, salt) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(password, salt));
}

function hashPasswordRounds_(password, salt, rounds) {
  var key = Utilities.newBlob(String(salt)).getBytes();
  var d = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(password)).getBytes(), key);
  for (var i = 1; i < rounds; i++) d = Utilities.computeHmacSha256Signature(d, key);
  return 'v2$' + rounds + '$' + bytesToHex_(d);
}

// The hash to store for a new password.
function hashPassword_(password, salt) {
  return hashPasswordRounds_(password, salt, PASSWORD_HASH_ROUNDS);
}

// Same time whatever position the first difference is at.
function sameText_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function passwordMatches_(password, user) {
  var stored = String(user.PasswordHash || '');
  if (!stored || !user.PasswordSalt) return false;
  var m = /^v2\$(\d+)\$/.exec(stored);
  if (m) return sameText_(hashPasswordRounds_(String(password), user.PasswordSalt, Number(m[1])), stored);
  return sameText_(hashPasswordOnce_(String(password), user.PasswordSalt), stored);
}

// Random bytes from Google's secure UUIDs (Math.random is guessable).
function secureRandomBytes_(n) {
  var out = [];
  while (out.length < n) {
    var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
    for (var i = 0; i < d.length && out.length < n; i++) out.push(d[i] & 0xFF);
  }
  return out;
}

function generateSalt_() {
  return Utilities.base64Encode(secureRandomBytes_(SALT_BYTES));
}

function generateTempPassword_() {
  // Human-relayable: avoids ambiguous characters (0/O, 1/l/I). Two digits
  // are always included so it also meets the password rules.
  var letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  var digits = '23456789';
  var pick = function (alphabet, count) {
    var s = '', limit = 256 - (256 % alphabet.length);
    while (s.length < count) {
      secureRandomBytes_(count * 2).forEach(function (b) {
        if (s.length < count && b < limit) s += alphabet.charAt(b % alphabet.length);
      });
    }
    return s;
  };
  return pick(letters, 4) + pick(digits, 2) + pick(letters, 4);
}

// ── Too many wrong passwords ─────────────────────────────────────────
// 5 wrong passwords for one email within 15 minutes → that email waits
// 15 minutes, even with the right password. A successful sign-in or an
// admin reset clears the count.
var SIGNIN_MAX_FAILURES = 5;
var SIGNIN_WAIT_MINUTES = 15;

function signinThrottleKey_(email) {
  return 'signin|' + String(email || '').trim().toLowerCase();
}

function signinThrottleState_(email) {
  try {
    var raw = CacheService.getScriptCache().get(signinThrottleKey_(email));
    return raw ? JSON.parse(raw) : { n: 0, until: 0 };
  } catch (e) { return { n: 0, until: 0 }; }
}

function signinWaitError_(email) {
  var st = signinThrottleState_(email);
  if (st.until && st.until > Date.now()) {
    var mins = Math.max(1, Math.ceil((st.until - Date.now()) / 60000));
    return 'Too many wrong passwords. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + ', or ask the App Owner to reset your password.';
  }
  return '';
}

function signinFailed_(email) {
  var st = signinThrottleState_(email);
  if (st.until && st.until <= Date.now()) st = { n: 0, until: 0 };
  st.n = (st.n || 0) + 1;
  if (st.n >= SIGNIN_MAX_FAILURES) st.until = Date.now() + SIGNIN_WAIT_MINUTES * 60000;
  try { CacheService.getScriptCache().put(signinThrottleKey_(email), JSON.stringify(st), SIGNIN_WAIT_MINUTES * 60); } catch (e) {}
}

function signinCleared_(email) {
  try { CacheService.getScriptCache().remove(signinThrottleKey_(email)); } catch (e) {}
}

// Writes a new hash + salt for the user's row (row index from readSheetAsObjects_).
function writePasswordHash_(sheet, rowIndex, password) {
  var salt = generateSalt_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(rowIndex, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(password, salt));
  sheet.getRange(rowIndex, headers.indexOf('PasswordSalt') + 1).setValue(salt);
  return headers;
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
  var wait = signinWaitError_(email);
  if (wait) throw new Error(wait);
  var sheet = getSheet_(SHEET_NAMES.USERS);
  var rows = readSheetAsObjects_(sheet);
  var idx = -1;
  for (var i = 0; i < rows.length; i++) if (rows[i].Email === email) { idx = i; break; }
  var user = idx === -1 ? null : rows[idx];
  if (!user || user.Status !== 'Active' || !passwordMatches_(password, user)) {
    signinFailed_(email);
    throw new Error(signinWaitError_(email) || 'Invalid email or password.');
  }
  signinCleared_(email);
  // an older one-round hash is replaced by the slower kind now that we know the password
  if (String(user.PasswordHash).indexOf('v2$') !== 0) {
    try {
      withLock_(function () { writePasswordHash_(sheet, idx + 2, String(password)); });
    } catch (e) { /* the sign-in still works; the upgrade is retried next time */ }
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
        if (!forced) {
          var wait = signinWaitError_(rows[i].Email);
          if (wait) throw new Error(wait);
          if (!passwordMatches_(String(currentPassword || ''), rows[i])) {
            signinFailed_(rows[i].Email);
            throw new Error('Your current password is not correct.');
          }
        }
        if (passwordMatches_(String(newPassword), rows[i])) {
          throw new Error('Choose a password different from the current one.');
        }
        var rowIndex = i + 2; // +1 header, +1 to move from 0-based to 1-based
        var headers = writePasswordHash_(sheet, rowIndex, String(newPassword));
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
        var rowIndex = i + 2;
        var headers = writePasswordHash_(sheet, rowIndex, tempPassword);
        signinCleared_(rows[i].Email);
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

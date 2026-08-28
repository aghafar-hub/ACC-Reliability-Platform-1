/**
 * Platform Core Apps Script Web App entry point.
 *
 * This is one of several independent Apps Script Web App deployments
 * (spec §4) — Platform Core's own endpoint, separate from every feature
 * module's endpoint, so traffic and failures never cross between them.
 *
 * Every action goes through safeHandle_ (friendly errors, spec §10a) and,
 * where the action performs a write, through withIdempotency_ (duplicate-
 * submission protection, spec §10a).
 */

function doPost(e) {
  return safeHandle_(function () {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    // login is the one action allowed without an existing session.
    if (action === 'login') {
      return ok_(login_(body.email, body.password));
    }

    var session = requireSession_(body.sessionToken);

    switch (action) {
      case 'changePassword':
        return ok_(changePassword_(session.userId, body.newPassword));
      case 'createUser':
        return ok_(withIdempotency_(body.operationId, action, function () {
          requireAppAdmin_(session.userId);
          return createUser_(body.email, body.orgId);
        }));
      case 'adminResetPassword':
        requireAppAdmin_(session.userId);
        return ok_(adminResetPassword_(body.userId));
      // Additional actions (Asset Master, RBAC admin, settings) are wired
      // up as their implementations land — see the open backend tasks.
      default:
        throw new Error('Unknown action: ' + action);
    }
  });
}

function doGet(e) {
  return safeHandle_(function () {
    return ok_({ status: 'Platform Core is running' });
  });
}

// TODO: requireSession_ pairs with issueSessionToken_ in Auth.js.
function requireSession_(sessionToken) {
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: auth & session');
}

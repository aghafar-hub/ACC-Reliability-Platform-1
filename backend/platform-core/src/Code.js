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
          return createUser_(body.email, body.orgId, body.roleIds);
        }));
      case 'adminResetPassword':
        requireAppAdmin_(session.userId);
        return ok_(adminResetPassword_(body.userId));
      case 'setUserRoles':
        requireAppAdmin_(session.userId);
        return ok_(setUserRoles_(body.userId, body.roleIds));
      case 'listOrgUsers':
        return ok_(listOrgUsers_(session));
      case 'listRoles':
        return ok_(listRoles_());
      // Arabic word list (Translations.js)
      case 'getTranslations':
        return ok_(getTranslations_());
      case 'addTranslationTerms':
        requireAppAdmin_(session.userId);
        return ok_(addTranslationTerms_(session.email || session.userId, body.terms));
      case 'saveTranslation':
        requireAppAdmin_(session.userId);
        return ok_(saveTranslation_(session.email || session.userId, body.key, body.arabic, body.status));
      // Equipment list (AssetMaster.js): Equipment IDs are owned here
      case 'listEquipmentMaster':
        return ok_(listEquipmentMaster_(session));
      case 'saveEquipmentMaster':
        return ok_(saveEquipmentMaster_(session, body));
      case 'listEquipmentLog':
        return ok_(listEquipmentLog_(session, body.limit));
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

// requireSession_ (and issueSessionToken_, used by Auth.js's login_) live in Session.js.

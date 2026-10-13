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
    var body = noFormulasIn_(JSON.parse(e.postData.contents));
    var action = body.action;

    // login is the one action allowed without an existing session.
    if (action === 'login') {
      // Presence.js: every sign-in (and failed one) goes into LOGIN_HISTORY
      var signedIn;
      try {
        signedIn = login_(body.email, body.password, body.remember !== false);
      } catch (loginErr) {
        loginLog_(String(body.email || '').trim().toLowerCase(), '', '', 'Failed sign-in', body.device, '');
        throw loginErr;
      }
      loginLog_(signedIn.email, signedIn.userId, signedIn.orgId, 'Signed in', body.device, body.remember === false ? 'not kept signed in' : '');
      return ok_(signedIn);
    }

    var session = requireSession_(body.sessionToken);

    switch (action) {
      case 'changePassword':
        return ok_(changePassword_(session, body.newPassword, body.currentPassword));
      case 'createUser':
        return ok_(withIdempotency_(body.operationId, action, function () {
          requireAppAdmin_(session.userId);
          var created = createUser_(body.email, body.orgId, body.roleIds);
          platformLog_(session.email || session.userId, 'Users', String(body.email || ''), 'Added', [body.orgId].concat(body.roleIds || []).join(' · '));
          return created;
        }));
      case 'adminResetPassword':
        requireAppAdmin_(session.userId);
        var reset = adminResetPassword_(body.userId);
        platformLog_(session.email || session.userId, 'Users', actUserEmail_(body.userId), 'Password reset', '');
        return ok_(reset);
      case 'setUserRoles':
        requireAppAdmin_(session.userId);
        var roles = setUserRoles_(body.userId, body.roleIds);
        platformLog_(session.email || session.userId, 'Users', actUserEmail_(body.userId), 'Roles changed', (body.roleIds || []).join(', '));
        return ok_(roles);
      case 'deleteUser':
        var gone = deleteUser_(session, body.userId);
        platformLog_(session.email || session.userId, 'Users', gone.email, 'Deleted', '');
        return ok_(gone);
      case 'listOrgUsers':
        return ok_(listOrgUsers_(session));
      case 'listRoles':
        return ok_(listRoles_());
      // Arabic word list (Translations.js)
      case 'getTranslations':
        return ok_(getTranslations_());
      case 'addTranslationTerms':
        requireSettingsEdit_(session, 'language');
        return ok_(addTranslationTerms_(session.email || session.userId, body.terms));
      case 'saveTranslation':
        requireSettingsEdit_(session, 'language');
        return ok_(saveTranslation_(session.email || session.userId, body.key, body.arabic, body.status));
      // Settings access (SettingsAccess.js): who sees which Settings page
      case 'getSettingsAccess':
        return ok_(getSettingsAccess_(session));
      case 'saveSettingsAccess':
        return ok_(saveSettingsAccess_(session, body));
      // Email & notifications (EmailSettings.js): Admin only, all off by default
      // Activity page (Activity.js): Admin + ACC managers
      case 'listPlatformActivity':
        return ok_(listPlatformActivity_(session, body));
      case 'getEmailSettings':
        return ok_(getEmailSettings_(session));
      case 'saveEmailSettings':
        return ok_(saveEmailSettings_(session, body));
      // Equipment list (AssetMaster.js): Equipment IDs are owned here
      case 'listEquipmentMaster':
        return ok_(listEquipmentMaster_(session, body));
      case 'saveEquipmentMaster':
        return ok_(saveEquipmentMaster_(session, body));
      // Areas (Areas.js): the official area names; any user reads, Admin saves
      case 'getAreas':
        return ok_(getAreas_(session));
      case 'saveAreas':
        return ok_(saveAreas_(session, body));
      case 'listEquipmentLog':
        return ok_(listEquipmentLog_(session, body.limit));
      // Who's online + login history (Presence.js): Admin + ACC managers
      case 'heartbeat':
        return ok_(heartbeat_(session, body));
      case 'listPresence':
        return ok_(listPresence_(session));
      case 'listLoginHistory':
        return ok_(listLoginHistory_(session, body));
      case 'signOut':
        loginLog_(session.email || '', session.userId, session.orgId, 'Signed out', body.device, '');
        try { CacheService.getScriptCache().remove('pres|' + session.userId); } catch (e) {}
        revokeOneSession_(session.userId, session.sessionId); // this device's sign-in ends now
        return ok_({ signedOut: true });
      // Additional actions (Asset Master, RBAC admin, settings) are wired
      // up as their implementations land — see the open backend tasks.
      default:
        throw new Error('Unknown action: ' + action);
    }
  });
}

function doGet(e) {
  // Install check (InstallCheck.js): open <web app address>?action=installCheck
  // in a browser to see whether this deployment runs the latest files.
  if (e && e.parameter && e.parameter.action === 'installCheck') return ContentService.createTextOutput(checkInstall());
  return safeHandle_(function () {
    return ok_({ status: 'Platform Core is running' });
  });
}

// requireSession_ (and issueSessionToken_, used by Auth.js's login_) live in Session.js.

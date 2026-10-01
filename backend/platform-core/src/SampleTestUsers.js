/**
 * One-off admin tool — NOT wired into Code.js's doPost router, NOT called
 * automatically by anything. Run createSampleTestUsers_() once yourself
 * from the Apps Script editor (select it in the function dropdown next to
 * Run ▶, then Run) to create one test account per role, covering both
 * contractors, for exercising RBAC-dependent UI in one pass — the
 * TechnicianPicker/"Assigned To" dropdowns (needs real accounts to show
 * anything at all — see its own file comment), the contractor-scoped
 * routine/action screens, and the Patch 14 admin-only notification
 * settings card.
 *
 * Bypasses the ROLE-ADMIN check createUser_'s own comment mentions —
 * that check lives in Code.js's doPost dispatcher, gating the HTTP path;
 * running a function directly from the Apps Script editor already requires
 * edit access to the script project itself, a strictly higher bar than
 * being a platform Admin, so there's nothing left to additionally enforce
 * here. Same reasoning as Oil Lubrication's protectDataSheetsFromDirect-
 * Edits() — an editor-only tool, not a web-reachable one.
 *
 * Safe to re-run: a user that already exists is reported and skipped
 * rather than aborting the whole batch (createUser_ throws on a duplicate
 * email) — so if you add a role to the ROLES sheet later and re-run this,
 * only the genuinely new accounts get created.
 *
 * Passwords are generated fresh by createUser_ and returned exactly once
 * (same as every real admin-created account) — this function has nowhere
 * else to show them, so it logs the whole batch to the execution log
 * (View > Executions in the Apps Script editor, or the "Execution log"
 * panel right after running it from the editor). Copy them from there —
 * they can't be retrieved again afterward (use adminResetPassword_ for a
 * lost one, same as any real account).
 */
function createSampleTestUsers_() {
  var SAMPLE_USERS = [
    { label: 'ACC Admin',                email: 'admin.test@acc-test.local',      orgId: ORG_ACC,  roleIds: ['ROLE-ADMIN'] },
    { label: 'ACC Reliability Engineer', email: 'reliability.test@acc-test.local', orgId: ORG_ACC,  roleIds: ['ROLE-RENG'] },
    { label: 'ACC Manager',              email: 'manager.test@acc-test.local',     orgId: ORG_ACC,  roleIds: ['ROLE-MGR'] },
    { label: 'RHI Contractor Engineer',  email: 'ceng.rhi.test@acc-test.local',    orgId: 'ORG-RHI', roleIds: ['ROLE-CENG'] },
    { label: 'RHI Technician',           email: 'tech.rhi.test@acc-test.local',    orgId: 'ORG-RHI', roleIds: ['ROLE-TECH'] },
    { label: 'ASEC Contractor Engineer', email: 'ceng.asec.test@acc-test.local',   orgId: 'ORG-ASEC', roleIds: ['ROLE-CENG'] },
    { label: 'ASEC Technician',          email: 'tech.asec.test@acc-test.local',   orgId: 'ORG-ASEC', roleIds: ['ROLE-TECH'] },
  ];

  var results = [];
  SAMPLE_USERS.forEach(function (u) {
    try {
      var created = createUser_(u.email, u.orgId, u.roleIds);
      results.push({ label: u.label, email: u.email, orgId: u.orgId, roles: u.roleIds, status: 'created', tempPassword: created.tempPassword });
    } catch (err) {
      var alreadyExists = /already exists/i.test(err.message || '');
      results.push({
        label: u.label, email: u.email, orgId: u.orgId, roles: u.roleIds,
        status: alreadyExists ? 'already exists — skipped' : 'FAILED: ' + err.message,
      });
    }
  });

  Logger.log('─── Sample test accounts (one per role) ───');
  results.forEach(function (r) {
    if (r.status === 'created') {
      Logger.log(r.label + '  |  ' + r.email + '  |  ' + r.orgId + '  |  ' + r.roles.join(',') + '  |  password: ' + r.tempPassword);
    } else {
      Logger.log(r.label + '  |  ' + r.email + '  |  ' + r.orgId + '  |  ' + r.roles.join(',') + '  |  ' + r.status);
    }
  });
  Logger.log('Each must change this password on first login (MustChangePassword is set automatically, same as any admin-created account).');

  return results;
}

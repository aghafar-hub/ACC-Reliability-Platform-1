// Security regression tests (audit October 2026, findings F-xx). They load the
// real backend code with made-up data and run before every deploy
// (.github/workflows/deploy.yml). Run locally: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { platformCore, moduleBackend, signIn, clearSessionCache, PEOPLE, API_SECRET } = require("./lib/backends.cjs");

const resetPassword = (pc, who) => pc.post({ action: "adminResetPassword", sessionToken: signIn("owner"), userId: PEOPLE[who][0] }).data.tempPassword;

test("F-02: sign-ins end and can be cancelled (Platform Core and Oil)", () => {
  const pc = platformCore();
  const oil = moduleBackend("oil-lubrication", pc);
  const oilOk = (t) => oil.checkAuth_(API_SECRET, t);

  assert.equal(oilOk(signIn("rhiEng")).ok, true, "a fresh sign-in works");
  assert.equal(oilOk(signIn("rhiEng", { exp: Date.now() - 1000 })).sessionEnded, true, "a sign-in past its end time is refused");
  assert.equal(oilOk(signIn("rhiEng", { exp: undefined, iat: Date.now() - 40 * 86400e3 })).sessionEnded, true, "an old sign-in without an end time lasts 30 days");

  const temp = resetPassword(pc, "rhiTech");
  const a = pc.post({ action: "login", email: PEOPLE.rhiTech[1], password: temp }).data.sessionToken;
  const b = pc.post({ action: "login", email: PEOPLE.rhiTech[1], password: temp }).data.sessionToken;
  pc.post({ action: "signOut", sessionToken: a });
  clearSessionCache(pc, oil);
  assert.equal(oilOk(a).sessionEnded, true, "the signed-out device is refused");
  assert.equal(oilOk(b).ok, true, "the same person's other device keeps working");

  pc.post({ action: "setUserRoles", sessionToken: signIn("owner"), userId: PEOPLE.rhiTech[0], roleIds: ["ROLE-CENG"] });
  clearSessionCache(pc, oil);
  assert.equal(oilOk(b).sessionEnded, true, "a role change cancels the person's sign-ins");

  const eng = signIn("asecEng");
  pc.post({ action: "deleteUser", sessionToken: signIn("owner"), userId: PEOPLE.asecEng[0] });
  clearSessionCache(pc, oil);
  assert.equal(oilOk(eng).sessionEnded, true, "a deleted user is refused");
});

test("F-21: without SESSION_SIGNING_SECRET the modules serve nothing", () => {
  const pc = platformCore();
  const oil = moduleBackend("oil-lubrication", pc, { SESSION_SIGNING_SECRET: "" });
  assert.equal(oil.checkAuth_(API_SECRET, signIn("owner")).ok, false);
  const vib = moduleBackend("vibration-analysis", pc, { SESSION_SIGNING_SECRET: "" });
  assert.equal(vib.dispatchWithAccess_("readAll", { sessionToken: signIn("owner") }).accessDenied, true);
});

test("F-06 / F-07: password rules, wrong-password wait, slow hash", () => {
  const pc = platformCore();
  const email = PEOPLE.rhiEng[1];
  const temp = resetPassword(pc, "rhiEng");
  assert.match(pc.generateTempPassword_(), /^[A-Za-z]{4}[2-9]{2}[A-Za-z]{4}$/, "temporary passwords meet the rules");
  const users = pc.__book.USERS.data;
  const row = users.find((r) => r[1] === email);
  assert.match(String(row[2]), /^v2\$\d+\$[0-9a-f]{64}$/, "stored as the slow hash");

  let t = pc.post({ action: "login", email, password: temp }).data.sessionToken;
  let r = pc.post({ action: "changePassword", sessionToken: t, newPassword: "short1" });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /at least 10/);
  r = pc.post({ action: "changePassword", sessionToken: t, newPassword: "Plant2026safe" });
  assert.equal(r.ok, true, "forced first change needs no current password");
  t = r.data.sessionToken;
  r = pc.post({ action: "changePassword", sessionToken: t, newPassword: "Other2026pw" });
  assert.match(r.error.message, /current password/, "a normal change needs the current password");

  // the wrong current password above counted as one try: a reset starts the count again
  const fresh = resetPassword(pc, "rhiEng");
  for (let i = 0; i < 4; i++) assert.match(pc.post({ action: "login", email, password: "wrong" + i }).error.message, /Invalid email or password/);
  assert.match(pc.post({ action: "login", email, password: "wrong5" }).error.message, /Too many wrong passwords/, "5th wrong password: wait");
  assert.equal(pc.post({ action: "login", email, password: fresh }).ok, false, "even the right password waits");
  const again = resetPassword(pc, "rhiEng");
  assert.equal(pc.post({ action: "login", email, password: again }).ok, true, "an Admin reset ends the wait");

  // an old one-round hash still signs in and is upgraded
  const salt = "oldsalt==";
  row[2] = pc.hashPasswordOnce_("Legacy2026pw", salt);
  row[3] = salt;
  assert.equal(pc.post({ action: "login", email, password: "Legacy2026pw" }).ok, true);
  assert.match(String(row[2]), /^v2\$/);
});

test("F-05: an Oil route holds one contractor's points only", () => {
  const pc = platformCore();
  const oil = moduleBackend("oil-lubrication", pc);
  oil.resolveLpContractor_ = (lp) => ({ "LP-R1": "RHI", "LP-R2": "RHI", "LP-A1": "ASEC" })[lp] || "";
  const base = { routineId: "R-1", routeType: "Sampling", routeName: "Test route" };
  let r = oil.createRoutine(oil.SpreadsheetApp.getActiveSpreadsheet(), Object.assign({}, base, { contractor: "RHI", items: [{ lpId: "LP-R1" }, { lpId: "LP-A1" }] }));
  assert.match(r.error, /LP-A1 belongs to ASEC/);
  r = oil.createRoutine(oil.SpreadsheetApp.getActiveSpreadsheet(), Object.assign({}, base, { items: [{ lpId: "LP-R1" }, { lpId: "LP-A1" }] }));
  assert.match(r.error, /one contractor only/);
});

test("F-03 / F-04: Vibration data and older saves stay within the contractor", () => {
  const pc = platformCore();
  const vib = moduleBackend("vibration-analysis", pc);
  vib.vlMasterData_ = () => ({
    eq: { "M-RHI": { id: "M-RHI", contractor: "RHI" }, "M-ASEC": { id: "M-ASEC", contractor: "ASEC" } },
    vib: { "V-1": { "Equipment ID": "M-RHI" }, "V-2": { "Equipment ID": "M-ASEC" } },
  });
  const session = (who) => vib.getSessionOrNull_(signIn(who));
  const data = { rmsRegister: [{ "Equipment ID": "M-RHI" }, { "Equipment ID": "M-ASEC" }], vibPoints: [{ "VIB ID": "V-1" }, { "VIB ID": "V-2" }] };
  const rhi = vib.vbScopeLists_(session("rhiEng"), JSON.parse(JSON.stringify(data)));
  assert.deepEqual(rhi.rmsRegister.map((r) => r["Equipment ID"]), ["M-RHI"], "RHI sees RHI machines only");
  assert.deepEqual(rhi.vibPoints.map((r) => r["VIB ID"]), ["V-1"], "and RHI points only");
  const acc = vib.vbScopeLists_(session("accEng"), JSON.parse(JSON.stringify(data)));
  assert.equal(acc.rmsRegister.length, 2, "ACC sees everything");

  assert.match(vib.vbLegacyWriteDenial_("updateRegisterLimits", {}, session("rhiEng")), /Only ACC or the Admin/);
  assert.equal(vib.vbLegacyWriteDenial_("updateRegisterLimits", {}, session("accEng")), "");
  assert.notEqual(vib.vbLegacyWriteDenial_("upsertLastRMS", { equipmentId: "M-ASEC" }, session("rhiEng")), "", "no saving on the other contractor's machine");
  assert.equal(vib.vbLegacyWriteDenial_("upsertLastRMS", { equipmentId: "M-RHI" }, session("rhiEng")), "", "own machine is fine");
});

test("F-01: logs never hold tokens, secrets or passwords", () => {
  const oil = moduleBackend("oil-lubrication", platformCore());
  const out = JSON.stringify(oil.logRedact_({ sessionToken: "t", secret: "s", nested: { password: "p", pdfBase64: "x" }, keep: "ok" }));
  assert.doesNotMatch(out, /"t"|"s"|"p"|"x"/);
  assert.match(out, /"keep":"ok"/);
});

test("F-12: text starting with = + - @ is stored as text", () => {
  const pc = platformCore();
  for (const ctx of [pc, moduleBackend("oil-lubrication", pc), moduleBackend("vibration-analysis", pc)]) {
    const r = ctx.noFormulasIn_({ a: "=1+1", b: "@x", c: "-5", d: "-", e: "plain", row: '["=HYPERLINK(1)",2]', sessionToken: "=keep", matchValues: '["-x"]' });
    assert.equal(r.a, "'=1+1");
    assert.equal(r.b, "'@x");
    assert.equal(r.c, "-5");
    assert.equal(r.d, "-");
    assert.equal(r.e, "plain");
    assert.equal(JSON.parse(r.row)[0], "'=HYPERLINK(1)");
    assert.equal(r.sessionToken, "=keep");
    assert.equal(r.matchValues, '["-x"]');
  }
});

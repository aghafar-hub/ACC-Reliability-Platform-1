// Comments on Oil and Vibration actions (ActionComments.js): each comment
// keeps its author; contractors stay on their own actions; visitors read
// only; only the author deletes. Made-up people and actions.
const test = require("node:test");
const assert = require("node:assert/strict");
const { platformCore, moduleBackend, signIn, API_SECRET } = require("./lib/backends.cjs");

const ACTIONS = { "VA-0001": { contractor: "RHI", label: "VA-0001 (999.FN100)", people: ["eng@rhi.example.test", "acc.eng@example.test"] } };

function setup(module) {
  const ctx = moduleBackend(module, platformCore());
  ctx.acmAction_ = (ss, key) => ACTIONS[key] || null; // the action lookup is the module's own
  const sent = [];
  ctx.acmNotify_ = (ss, emails, message) => sent.push({ emails, message });
  ctx.maCheckRead_ = () => "";
  const s = (who) => (ctx.getSessionOrNull_ ? ctx.getSessionOrNull_(signIn(who)) : ctx.requireSession_(signIn(who)));
  const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
  return { ctx, s, ss, sent };
}

for (const module of ["vibration-analysis", "oil-lubrication"]) {
  test(`${module}: comments per person on an action`, () => {
    const { ctx, s, ss, sent } = setup(module);
    const add = (who, text) => ctx.acmAdd_(ss, s(who), { actionKey: "VA-0001", text });
    let r = add("rhiEng", "Bearing ordered, fitting at next stoppage.");
    assert.equal(r.status, "ok", JSON.stringify(r));
    r = add("accEng", "Please send the photo after fitting.");
    assert.equal(r.comments.length, 2);
    const [a, b] = r.comments;
    assert.equal(a.email, "eng@rhi.example.test");
    assert.equal(a.org, "RHI");
    assert.equal(a.role, "Contractor Engineer");
    assert.equal(b.org, "ACC");
    assert.equal(b.mine, true, "the reader's own comment is marked");
    assert.equal(a.mine, false);
    assert.deepEqual([...sent[1].emails], ["eng@rhi.example.test"], "the people on the action are told, not the author");

    assert.match(add("asecEng", "x").error, /another contractor/);
    assert.match(add("rhiEng", "   ").error, /Write the comment/);
    assert.match(add("rhiEng", "y".repeat(2001)).error, /too long/);

    const id = a.id;
    assert.match(ctx.acmDelete_(ss, s("accEng"), { commentId: id }).error, /Only the person who wrote/);
    const d = ctx.acmDelete_(ss, s("rhiEng"), { commentId: id });
    assert.equal(d.comments.length, 1, "a deleted comment leaves the thread");
    assert.equal(ctx.acmCounts_(ss)["VA-0001"], 1);
    const row = ss.getSheetByName(ctx.ACM_SHEET).getDataRange().getValues().find((x) => x[0] === id);
    assert.equal(row[8], "Yes", "kept in the sheet, marked Deleted");
  });
}

test("visitors read comments but can't add them", () => {
  const { ctx, ss } = setup("vibration-analysis");
  const visitor = { email: "visitor@example.test", roles: ["ROLE-VIEW"], orgId: "ORG-ACC" };
  assert.match(ctx.acmAdd_(ss, visitor, { actionKey: "VA-0001", text: "hello" }).error, /Visitors/);
});

// Through the real Oil routes: a made-up action row on the Action Tracker.
test("oil-lubrication: comment routes, contractor scope and card counts", () => {
  const oil = moduleBackend("oil-lubrication", platformCore());
  const ss = oil.SpreadsheetApp.getActiveSpreadsheet();
  oil.maEnsureSetup_();
  const ppl = ss.getSheetByName("OL_MODULE_PEOPLE");
  [["acc.eng@example.test", "", "ACC", "ACC Responsible Engineer"], ["eng@rhi.example.test", "", "RHI", "Contractor Responsible Engineer"], ["eng@asec.example.test", "", "ASEC", "Contractor Responsible Engineer"]].forEach((r) => ppl.appendRow(r));
  const at = ss.insertSheet("Action Tracker");
  for (let i = 1; i < oil.dataStartRowFor("Action Tracker"); i++) at.appendRow(["Ac. No.", "LP"]);
  const row = Array(36).fill("");
  Object.assign(row, { 0: "0-1", 1: "LP-T1", 10: "Open", 12: "RHI", 19: "tech@rhi.example.test" });
  at.appendRow(row);
  const post = (who, b) => JSON.parse(oil.doPost({ postData: { contents: JSON.stringify({ ...b, secret: API_SECRET, sessionToken: signIn(who) }) }, parameter: {} }).text);
  const get = (who, p) => JSON.parse(oil.doGet({ parameter: { ...p, secret: API_SECRET, sessionToken: signIn(who) } }).text);

  const r = post("rhiEng", { action: "addActionComment", actionKey: "0-1|LP-T1", text: "Filter changed." });
  assert.equal(r.status, "ok", JSON.stringify(r));
  const thread = get("accEng", { action: "getActionComments", actionKey: "0-1|LP-T1" });
  assert.equal(thread.comments.length, 1);
  assert.equal(thread.comments[0].org, "RHI");
  assert.equal(thread.comments[0].mine, false);
  assert.match(post("asecEng", { action: "addActionComment", actionKey: "0-1|LP-T1", text: "x" }).message, /another contractor/);
  assert.equal(get("rhiEng", { action: "getActionComments" }).counts["0-1|LP-T1"], 1, "own contractor sees the count");
  assert.equal(get("asecEng", { action: "getActionComments" }).counts["0-1|LP-T1"], undefined, "other contractor does not");
  assert.match(post("accEng", { action: "deleteActionComment", commentId: r.comments[0].id }).message, /Only the person/);
  assert.equal(post("rhiEng", { action: "deleteActionComment", commentId: r.comments[0].id }).comments.length, 0);
});

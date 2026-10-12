// The three real Apps Script backends (backend/*/src), loaded into the mock
// with made-up users and data. Nothing here is company data: the repo is public.
const fs = require("fs");
const path = require("path");
const { createContext, load, token } = require("./gas-mock.cjs");

const ROOT = path.join(__dirname, "..", "..", "backend");
const SIGNING_SECRET = "test-signing-secret";
const API_SECRET = "test-api-secret";

// uid, email, org, role
const PEOPLE = {
  owner: ["U1", "owner@example.test", "ORG-ACC", "ROLE-ADMIN"],
  accEng: ["U2", "acc.eng@example.test", "ORG-ACC", "ROLE-RENG"],
  rhiEng: ["U3", "eng@rhi.example.test", "ORG-RHI", "ROLE-CENG"],
  asecEng: ["U4", "eng@asec.example.test", "ORG-ASEC", "ROLE-CENG"],
  rhiTech: ["U5", "tech@rhi.example.test", "ORG-RHI", "ROLE-TECH"],
};

function srcFiles(module) {
  const dir = path.join(ROOT, module, "src");
  return [dir, fs.readdirSync(dir).filter((f) => f.endsWith(".js"))];
}

function platformCore() {
  const users = [["UserId", "Email", "PasswordHash", "PasswordSalt", "MustChangePassword", "OrgId", "Status", "ThemePalette", "CreatedDate", "ModifiedDate"]];
  const userRoles = [["UserId", "RoleId"]];
  Object.values(PEOPLE).forEach(([uid, email, org, role]) => {
    users.push([uid, email, "x", "y", false, org, "Active", "", "2026-01-01", "2026-01-01"]);
    userRoles.push([uid, role]);
  });
  const ctx = createContext({
    props: { SESSION_SIGNING_SECRET: SIGNING_SECRET, PLATFORM_CORE_SPREADSHEET_ID: "PC" },
    sheets: {
      USERS: users,
      USER_ROLES: userRoles,
      ROLES: [["RoleId", "RoleName"], ["ROLE-ADMIN", "App Admin"], ["ROLE-RENG", "Reliability Engineer"], ["ROLE-CENG", "Contractor Engineer"], ["ROLE-TECH", "Technician"]],
      IDEMPOTENCY_LOG: [["OperationId", "Endpoint", "ResultJson", "CreatedDate"]],
    },
  });
  const [dir, files] = srcFiles("platform-core");
  load(ctx, dir, files);
  ctx.post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return ctx;
}

// A module backend that reads sign-in lists from the given Platform Core.
function moduleBackend(module, pc, props = {}) {
  const ctx = createContext({
    props: Object.assign({ API_SECRET: API_SECRET, SESSION_SIGNING_SECRET: SIGNING_SECRET, PLATFORM_CORE_SPREADSHEET_ID: "PC" }, props),
    sheets: {},
  });
  const [dir, files] = srcFiles(module);
  load(ctx, dir, files);
  const own = ctx.SpreadsheetApp.openById;
  const pcBook = pc.SpreadsheetApp.getActiveSpreadsheet();
  ctx.SpreadsheetApp.openById = (id) => (id === "PC" ? pcBook : own(id));
  return ctx;
}

// A signed sign-in for one of PEOPLE (like Platform Core issues).
function signIn(who, extra = {}) {
  const [uid, email, org, role] = PEOPLE[who];
  return token(null, SIGNING_SECRET, Object.assign({ uid, email, org, roles: [role], iat: Date.now() - 1000, exp: Date.now() + 3600e3, sid: "s-" + Math.random() }, extra));
}

// Sign-in lists are cached for 2 minutes; tests clear the cache instead of waiting.
function clearSessionCache(...ctxs) {
  ctxs.forEach((c) => c.CacheService.getScriptCache().remove("sess|lists"));
}

module.exports = { platformCore, moduleBackend, signIn, clearSessionCache, PEOPLE, API_SECRET };

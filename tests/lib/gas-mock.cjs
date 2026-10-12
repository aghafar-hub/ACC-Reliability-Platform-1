// Minimal Apps Script mocks for the security tests: an in-memory spreadsheet,
// script properties, script cache, Utilities. Made-up data only (public repo).
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function makeSheet(name) {
  const data = [];
  // Like Apps Script: trailing rows with no content don't count.
  const lastRow = () => {
    let n = data.length;
    while (n > 0 && data[n - 1].every((v) => v === "" || v === null || v === undefined)) n--;
    return n;
  };
  const sheet = {
    name,
    data,
    getName: () => name,
    getDataRange: () => ({ getValues: () => data.slice(0, lastRow()).map((r) => r.slice()) }),
    getLastRow: () => lastRow(),
    getLastColumn: () => data.slice(0, lastRow()).reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => Math.max(1000, lastRow()),
    getMaxColumns: () => 26,
    appendRow: (row) => { data.push(row.slice()); },
    setFrozenRows: () => {},
    deleteRow: (i) => { data.splice(i - 1, 1); },
    deleteRows: (i, n) => { data.splice(i - 1, n); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues: (vals) => {
        for (let i = 0; i < nr; i++) {
          while (data.length < r + i) data.push([]);
          for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j];
        }
      },
      clearContent: () => {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = "";
      },
      setValue: (v) => { while (data.length < r) data.push([]); data[r - 1][c - 1] = v; },
      getValue: () => (data[r - 1] || [])[c - 1],
      getFormulas: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(""); out.push(row); } return out; },
      getValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((data[r - 1 + i]) || [])[c - 1 + j] ?? ""); out.push(row); }
        return out;
      },
    }),
  };
  return sheet;
}

function createContext({ props = {}, sheets = {} } = {}) {
  const book = {};
  Object.entries(sheets).forEach(([n, rows]) => { const s = makeSheet(n); rows.forEach((r) => s.appendRow(r)); book[n] = s; });
  const ss = {
    getSheetByName: (n) => book[n] || null,
    insertSheet: (n) => { if (book[n]) throw new Error("exists " + n); book[n] = makeSheet(n); return book[n]; },
  };
  const propStore = { ...props };
  const cacheStore = {};
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in propStore ? propStore[k] : null),
      setProperty: (k, v) => { propStore[k] = String(v); },
      setProperties: (o) => Object.entries(o).forEach(([k, v]) => { propStore[k] = String(v); }),
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => cacheStore[k] ?? null,
      put: (k, v) => { cacheStore[k] = v; },
      remove: (k) => { delete cacheStore[k]; },
      getAll: (ks) => Object.fromEntries(ks.filter((k) => k in cacheStore).map((k) => [k, cacheStore[k]])),
      putAll: (o) => Object.assign(cacheStore, o),
      removeAll: (ks) => ks.forEach((k) => delete cacheStore[k]),
    }) },
    Utilities: {
      base64DecodeWebSafe: (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
      base64EncodeWebSafe: (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      newBlob: (data) => { const buf = Buffer.isBuffer(data) ? data : typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data); return { _buf: buf, getBytes: () => buf, getDataAsString: () => buf.toString("utf8") }; },
      gzip: (blob) => { const buf = require("zlib").gzipSync(blob._buf); return { _buf: buf, getBytes: () => buf }; },
      ungzip: (blob) => { const buf = require("zlib").gunzipSync(blob._buf); return { _buf: buf, getBytes: () => buf, getDataAsString: () => buf.toString("utf8") }; },
      base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
      base64Decode: (s) => Buffer.from(s, "base64"),
      computeHmacSha256Signature: (v, k) => { const B = (x) => Array.isArray(x) ? Buffer.from(x.map((b) => b & 0xff)) : x; return Array.from(require("crypto").createHmac("sha256", B(k)).update(B(v)).digest()).map((b) => (b > 127 ? b - 256 : b)); },
      computeDigest: (alg, v) => Array.from(require("crypto").createHash("sha256").update(Array.isArray(v) ? Buffer.from(v.map((b) => b & 0xff)) : v).digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: "SHA_256" },
      getUuid: () => require("crypto").randomUUID(),
      formatDate: (d, tz, pat) => pat === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : pat === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString(),
    },
    ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: "json", JAVASCRIPT: "js" } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    MailApp: { sent: [], sendEmail(p) { this.sent.push(p); } },
    Session: { getScriptTimeZone: () => "UTC", getEffectiveUser: () => ({ getEmail: () => "owner@example.test" }) },
    ScriptApp: { triggers: [], getProjectTriggers() { return this.triggers; }, deleteTrigger() {}, newTrigger(fn) { const t = { fn, timeBased: () => t, everyDays: () => t, atHour: () => t, create: () => { ctx.ScriptApp.triggers.push({ getHandlerFunction: () => fn }); } }; return t; } },
    Logger: { log() {} },
    __book: book,
    __props: propStore,
    __cache: cacheStore,
  };
  vm.createContext(ctx);
  return ctx;
}

// A second spreadsheet (e.g. Platform Core) that openById(id) returns.
function addBook(ctx, id, sheets) {
  const book = {};
  Object.entries(sheets).forEach(([n, rows]) => { const s = makeSheet(n); rows.forEach((r) => s.appendRow(r)); book[n] = s; });
  const other = { getSheetByName: (n) => book[n] || null, insertSheet: (n) => { book[n] = makeSheet(n); return book[n]; }, __book: book };
  const active = ctx.SpreadsheetApp.getActiveSpreadsheet;
  const prev = ctx.SpreadsheetApp.openById;
  ctx.SpreadsheetApp.openById = (x) => (x === id ? other : prev(x));
  ctx.SpreadsheetApp.getActiveSpreadsheet = active;
  return other;
}

function load(ctx, dir, files) {
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f }));
}

function token(ctx, secret, payload) {
  // test placeholder iat (1) = "issued now", so sign-in end times apply
  if (payload && (!payload.iat || payload.iat < 1e12)) payload = Object.assign({}, payload, { iat: Date.now() });
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = require("crypto").createHmac("sha256", secret).update(b64).digest("hex");
  return b64 + "." + sig;
}

module.exports = { createContext, load, token, addBook };

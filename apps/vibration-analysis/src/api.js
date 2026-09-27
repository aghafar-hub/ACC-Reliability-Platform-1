// Client for the Google Apps Script Web App that backs this app — ported
// from the original bundle's `Qa`/`dm`/`gt`/`mn` functions. See
// docs/API_CONTRACT.md for the full action-by-action reference.
//
// Two very different transports are used, on purpose:
//
// READS (and the handful of writes whose result the UI actually needs to
// see — appendAction/updateAction/deleteAction/sendActionEmail/saveConfig/
// backfillLastReadings/readLastActionNo/test) go through `verifiedGet()`:
// try a plain `fetch()` first (works when the Apps Script deployment's GET
// response happens to carry usable CORS headers, or when a proxy in front
// of it does); if that fails for ANY reason short of our own 90s timeout —
// network error, non-2xx status, a CORS rejection — silently fall back to
// JSONP (script-tag injection with a `__vibjsonp_<timestamp>_<n>` global
// callback). JSONP has no CORS to fail on, since the browser is just
// executing a same-origin <script> tag whose src happens to be
// cross-origin, and Apps Script's `ContentService`/`TextOutput` response
// can be shaped as `callbackName(...)` for exactly this reason. Only a hard
// 90s timeout on the fetch attempt is treated specially: `readAll()` and
// friends retry the whole verifiedGet() flow once more before giving up.
//
// WRITES to the raw sheets (append/updateRow/deleteRow, the Last
// Reading upsert/delete actions, updateCompliance, updateRegisterLimits) go
// through `fireAndForget()`: a `fetch(..., { mode: "no-cors" })` GET whose
// response the browser is not allowed to read. The app never waits for or
// checks these — it optimistically updates its own in-memory state and
// trusts the write succeeded. There is no local re-fetch-and-compare
// verification step here (unlike the sibling oil-analysis app's api.js) —
// this is a straight reconstruction of what the original vibration app
// actually does, not an improvement on it. See docs/API_CONTRACT.md's
// "Known gaps" for what that means in practice.

let jsonpCounter = 0;

function jsonpRequest(webhookUrl, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `__vibjsonp_${Date.now()}_${jsonpCounter++}`;
    const query = new URLSearchParams({ ...params, callback: callbackName }).toString();
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("JSONP failed"));
    };
    script.src = `${webhookUrl}?${query}`;
    document.body.appendChild(script);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("JSONP timed out"));
    }, 85_000);
  });
}

// fetch() attempt with a 90s abort timeout; falls back to JSONP for any
// non-timeout failure (network error, non-ok status, CORS rejection).
async function fetchThenJsonp(webhookUrl, action, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  try {
    const query = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${webhookUrl}?${query}`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("__TIMEOUT__");
    return await jsonpRequest(webhookUrl, { action, ...params });
  }
}

// Verified GET: fetch-then-JSONP, with one retry of the whole flow if the
// fetch attempt itself hit the 90s timeout.
export async function verifiedGet(webhookUrl, action = "readAll", params = {}) {
  if (!webhookUrl) throw new Error("No webhook URL");
  try {
    return await fetchThenJsonp(webhookUrl, action, params);
  } catch (err) {
    if (String(err.message || "").includes("__TIMEOUT__")) {
      try {
        return await fetchThenJsonp(webhookUrl, action, params);
      } catch {
        throw new Error("Sync failed after 2 attempts — your data may be large. Try again or check your webhook URL.");
      }
    }
    throw err;
  }
}

// Blind fire-and-forget GET (no-cors — the response is unreadable and
// deliberately ignored). Used for every raw-sheet write.
function fireAndForget(webhookUrl, params) {
  if (!webhookUrl) return;
  const query = new URLSearchParams(params).toString();
  fetch(`${webhookUrl}?${query}`, { method: "GET", mode: "no-cors" }).catch(() => {});
}

// ── Reads ────────────────────────────────────────────────────────────────

// The one big sync call — returns { rms, spm, compliance, rmsRegister,
// spmRegister, lastRms, lastSpm, actions, config }. See
// docs/API_CONTRACT.md for each field's shape.
export function readAll(webhookUrl) {
  return verifiedGet(webhookUrl, "readAll");
}

// Settings → Configuration → "Test Connection". Expects { status: "ok",
// time } back from the Apps Script.
export function testConnection(webhookUrl) {
  return verifiedGet(webhookUrl, "test");
}

// Settings → System → "Run Backfill Now". Expects { status: "ok", rmsRows,
// spmRows } back.
export function backfillLastReadings(webhookUrl) {
  return verifiedGet(webhookUrl, "backfillLastReadings");
}

export function readLastActionNo(webhookUrl) {
  return verifiedGet(webhookUrl, "readLastActionNo");
}

export function appendAction(webhookUrl, fields) {
  return verifiedGet(webhookUrl, "appendAction", fields);
}

export function updateAction(webhookUrl, fields) {
  return verifiedGet(webhookUrl, "updateAction", fields);
}

export function deleteAction(webhookUrl, fields) {
  return verifiedGet(webhookUrl, "deleteAction", fields);
}

export function sendActionEmail(webhookUrl, fields) {
  return verifiedGet(webhookUrl, "sendActionEmail", fields);
}

export function saveConfig(webhookUrl, config) {
  return verifiedGet(webhookUrl, "saveConfig", { config: JSON.stringify(config) });
}

// ── Blind writes (raw sheets) ───────────────────────────────────────────

export function appendRow(webhookUrl, sheet, row, headers) {
  fireAndForget(webhookUrl, { action: "append", sheet, row: JSON.stringify(row), headers: JSON.stringify(headers) });
}

export function updateRow(webhookUrl, sheet, matchCols, matchValues, row) {
  fireAndForget(webhookUrl, {
    action: "updateRow",
    sheet,
    matchCols: JSON.stringify(matchCols),
    matchValues: JSON.stringify(matchValues),
    row: JSON.stringify(row),
  });
}

export function deleteRow(webhookUrl, sheet, matchCols, matchValues) {
  fireAndForget(webhookUrl, { action: "deleteRow", sheet, matchCols: JSON.stringify(matchCols), matchValues: JSON.stringify(matchValues) });
}

// Updates the Last RMS Reading sheet's row for one equipment+point — called
// after every RMS reading is saved so the Dashboard's "current status"
// stays in sync without a full re-sync.
export function upsertLastRMS(webhookUrl, fields) {
  fireAndForget(webhookUrl, { action: "upsertLastRMS", ...fields });
}

export function upsertLastSPM(webhookUrl, fields) {
  fireAndForget(webhookUrl, { action: "upsertLastSPM", ...fields });
}

export function deleteLastRMS(webhookUrl, equipmentId, point) {
  fireAndForget(webhookUrl, { action: "deleteLastRMS", equipmentId, point });
}

export function deleteLastSPM(webhookUrl, equipmentId, point) {
  fireAndForget(webhookUrl, { action: "deleteLastSPM", equipmentId, point });
}

export function updateCompliance(webhookUrl, equipmentId, month, value) {
  fireAndForget(webhookUrl, { action: "updateCompliance", equipmentId, month, value: value || "Normal" });
}

// type: "RMS" | "SPM" — see docs/API_CONTRACT.md for the expected fields.
export function updateRegisterLimits(webhookUrl, fields) {
  fireAndForget(webhookUrl, { action: "updateRegisterLimits", ...fields });
}

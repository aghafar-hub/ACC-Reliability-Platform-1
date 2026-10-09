// Device cache (speed): the last answer of each read, kept per person in the
// browser (IndexedDB, mirrored in memory) so a page opens with it at once
// and refreshes in the background — no loading screen after the first time.
//   - peek(action, params): the last answer, or null (first paint).
//   - remember(): after every successful read (api.js getChecked).
//   - fresh(): the answer if it is under FRESH_MS old — a page opened twice
//     in a row, or two parts of the app asking for the same thing, share it.
//   - staleAll(): after any save, so the next read goes to the server.
// Answers loaded from the device are never "fresh": they are shown, then
// replaced by the server's.

const FRESH_MS = 60_000;
const DB = "acc-device-cache";
const STORE = "answers";
const PREFIX = `${import.meta.env.VITE_STORAGE_PREFIX || ""}vib|`;
const mem = new Map(); // key -> { t, data }
let user = "anon";
let dbPromise = null;

export function keyOf(action, params) {
  return `${action}|${JSON.stringify(params || {})}`;
}
const full = (k) => `${PREFIX}${user}|${k}`;

// The person from the shell's session token (payload.email), so two people
// on one device never see each other's answers.
export function setCacheUser(token) {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    user = String(payload.email || "anon").toLowerCase();
  } catch {
    user = "anon";
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// Loads this person's answers into memory (before the app first renders).
export async function loadDeviceCache() {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const store = db.transaction(STORE, "readonly").objectStore(STORE);
      const start = `${PREFIX}${user}|`;
      const req = store.openCursor(IDBKeyRange.bound(start, `${start}￿`));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        mem.set(String(c.key).slice(start.length), { t: 0, data: c.value });
        c.continue();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function peek(action, params) {
  return mem.get(keyOf(action, params))?.data ?? null;
}

export function fresh(k) {
  const hit = mem.get(k);
  return hit && Date.now() - hit.t < FRESH_MS ? hit.data : null;
}

export function remember(k, data) {
  mem.set(k, { t: Date.now(), data });
  openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put(data, full(k));
    } catch {
      /* full or private mode: the memory copy still works */
    }
  });
}

export function staleAll() {
  mem.forEach((v) => (v.t = 0));
}

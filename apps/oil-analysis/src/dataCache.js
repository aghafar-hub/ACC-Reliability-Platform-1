import { useEffect, useState } from "react";

// Device cache (speed) for the reads pages make on their own (routes,
// inventory, top-ups, suggestions, workload…). The main data — samples,
// actions, oil changes — is already kept on the device by App.jsx.
//   - An answer kept on this device is returned at once; the server is asked
//     in the background, and when its answer differs, pages using that read
//     load again (useFreshTick) — from memory, so with no wait.
//   - An answer under FRESH_MS old is reused without asking again.
//   - After any save (markDirty) the next read waits for the server, so a
//     page never shows data from before your own change.
// Kept per person (session token's email), in IndexedDB.

const FRESH_MS = 60_000;
const DB = "acc-device-cache";
const STORE = "answers";
const PREFIX = `${import.meta.env.VITE_STORAGE_PREFIX || ""}oil|`;
const EVENT = "acc-oil-fresh";
const mem = new Map(); // key -> { t, data, dirty }
const inflight = new Map();
let user = "anon";
let dbPromise = null;
let loaded = null;

export function setCacheUser(token) {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    user = String(payload.email || "anon").toLowerCase();
  } catch {
    user = "anon";
  }
  loaded = null;
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

function loadDeviceCache() {
  if (loaded) return loaded;
  loaded = openDb().then(
    (db) =>
      db &&
      new Promise((resolve) => {
        try {
          const start = `${PREFIX}${user}|`;
          const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor(IDBKeyRange.bound(start, `${start}￿`));
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return resolve();
            const k = String(c.key).slice(start.length);
            if (!mem.has(k)) mem.set(k, { t: 0, data: c.value, dirty: false });
            c.continue();
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      })
  );
  return loaded;
}

function save(k, data) {
  openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).put(data, `${PREFIX}${user}|${k}`);
    } catch {
      /* full or private mode: the memory copy still works */
    }
  });
}

export function markDirty() {
  mem.forEach((v) => {
    v.dirty = true;
    v.t = 0;
  });
}

// Wraps an api read: (webhookUrl, ...args) => Promise<value>.
export function cachedRead(name, fn) {
  return async (webhookUrl, ...args) => {
    const k = `${name}|${JSON.stringify(args)}`;
    await loadDeviceCache();
    const hit = mem.get(k);
    if (hit && !hit.dirty && Date.now() - hit.t < FRESH_MS) return hit.data;
    const fetchIt = () => {
      if (inflight.has(k)) return inflight.get(k);
      const p = fn(webhookUrl, ...args)
        .then((v) => {
          const before = mem.get(k);
          const changed = !before || JSON.stringify(before.data) !== JSON.stringify(v);
          mem.set(k, { t: Date.now(), data: v, dirty: false });
          save(k, v);
          if (changed && before && !before.dirty) window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
          return v;
        })
        .finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    };
    if (hit && !hit.dirty) {
      // the device's copy now, the server's in the background
      fetchIt().catch(() => {});
      return hit.data;
    }
    return fetchIt();
  };
}

// A number that goes up when the server's answer for one of `names`
// differs from what was shown — put it in a load effect's dependencies.
export function useFreshTick(names) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = (e) => {
      if (names.includes(e.detail)) setTick((t) => t + 1);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the names are fixed per page
  return tick;
}

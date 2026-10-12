// What the modules keep on this device (audit F-08): on a shared plant PC
// or tablet the next person must not find the previous person's data in
// the browser. Cleared at sign-out and whenever a different person signs
// in; the page then reloads so nothing stays in memory either.
//
// The Oil offline queue (entries saved with no connection, not yet sent)
// and Vibration route drafts are unsent work: a sign-out asks first
// (unsentWorkCount), and they are kept when the same person's sign-in just
// ended, so they can sign in again and send them.

const LAST_USER_KEY = 'acc.lastUser';
const OIL_QUEUE_KEY = 'acc_oilapp_offline_queue';
const VIB_DRAFT_PREFIX = 'vibr-draft:';

// Module data kept on the device (keys as the app sees them; test builds
// add their own prefix underneath — storagePrefix.ts).
const DATA_KEY_PREFIXES = [
  'acc_oilapp_cache_',
  'oilapp_equipment_registry',
  'oilapp_action_registry',
  'vib_thresholds_v3',
  'acc.workCounts.v1',
  'acc.plant.v1.',
  'acc.mywork.v1.',
  'acc.moduleAccess.v1:',
  'acc.settingsAccess.v1:',
];

const STORAGE_PREFIX = (import.meta.env.VITE_STORAGE_PREFIX as string | undefined) || '';
const DEVICE_DB = 'acc-device-cache';
const DEVICE_STORE = 'answers';

// This site's localStorage keys, without the test-build prefix.
function siteKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.key(i);
      if (!raw) continue;
      if (STORAGE_PREFIX) {
        if (raw.startsWith(STORAGE_PREFIX)) out.push(raw.slice(STORAGE_PREFIX.length));
      } else if (!raw.startsWith('acc-test:')) {
        out.push(raw);
      }
    }
  } catch {
    // storage blocked: nothing kept
  }
  return out;
}

function queueLength(): number {
  try {
    const q = JSON.parse(localStorage.getItem(OIL_QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.length : 0;
  } catch {
    return 0;
  }
}

// Entries saved on this device that haven't reached the server yet.
export function unsentWorkCount(): number {
  return queueLength() + siteKeys().filter((k) => k.startsWith(VIB_DRAFT_PREFIX)).length;
}

// The modules' read cache (IndexedDB), this site's entries only.
function clearDeviceCache(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DEVICE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DEVICE_STORE);
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(DEVICE_STORE, 'readwrite');
          const store = tx.objectStore(DEVICE_STORE);
          ['oil|', 'vib|'].forEach((m) => {
            const start = STORAGE_PREFIX + m;
            store.delete(IDBKeyRange.bound(start, `${start}￿`));
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
    } catch {
      resolve();
    }
  });
}

// includeUnsent: also the offline queue and route drafts.
export async function clearModuleDeviceData(includeUnsent: boolean): Promise<void> {
  siteKeys().forEach((k) => {
    const unsent = k === OIL_QUEUE_KEY || k.startsWith(VIB_DRAFT_PREFIX);
    if ((unsent && includeUnsent) || (!unsent && DATA_KEY_PREFIXES.some((p) => k.startsWith(p)))) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
  });
  await Promise.race([clearDeviceCache(), new Promise((r) => setTimeout(r, 1500))]);
}

// At sign-in: a different person than last time on this device → nothing
// of the previous person's stays, unsent work included.
export async function forgetPreviousPerson(email: string): Promise<boolean> {
  const who = String(email || '').trim().toLowerCase();
  let last = '';
  try {
    last = localStorage.getItem(LAST_USER_KEY) || '';
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(LAST_USER_KEY, who);
  } catch {
    // ignore
  }
  if (last === who) return false;
  // first sign-in since this check exists: the data, not unsent work
  await clearModuleDeviceData(!!last);
  return !!last;
}

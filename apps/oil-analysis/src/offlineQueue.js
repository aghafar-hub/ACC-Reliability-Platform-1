// Patch 11 (plant-readiness pass): persists an "add a new record" write
// that failed because the device had no connectivity at all (see api.js's
// NetworkError) — so the technician's entry survives a page reload and
// gets retried automatically once the connection comes back, instead of
// either losing it entirely (the old behavior: any save failure rolled
// the optimistic entry back and showed an error) or leaving it stuck
// forever with no way to actually finish saving it.
//
// Scope: NEW records only (samples, actions, oil change events) — the
// three "something happened in the field, write it down" actions a
// technician does while walking the plant. Edits/deletes aren't queued:
// far less common from the floor, and an edit queued for an unknown
// length of time would almost certainly collide with Patch 10's conflict
// detection by the time it finally syncs — a problem new-record appends
// don't have (nothing to conflict with yet). Bulk PDF import is also out
// of scope — that's a desk/office workflow with its own progress UI, not
// a single in-field entry.
//
// Deliberately only ever enqueues from a NetworkError specifically (see
// api.js's own comment on that class) — a write that failed for any
// OTHER reason (a verify-read mismatch, a detected conflict) is not safe
// to blindly resubmit later, since the original write may already have
// landed server-side.

const QUEUE_KEY = "acc_oilapp_offline_queue";

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore — localStorage may be unavailable (private browsing, quota)
  }
}

// `record` is the already-built optimistic display object (tagged with
// the SAME id the caller used for its own optimistic React state entry —
// `_id` for a sample, `_id` for an action, `eventId` for an oil change
// event — so the eventual flush can find-and-replace it by that same
// key). Persisted alongside the write payload so a reload can still show
// "this is queued, not lost" without waiting for a flush to run first.
export function enqueueOfflineWrite(kind, id, payload, record) {
  const items = readQueue();
  items.push({ id, kind, payload, record, queuedAt: new Date().toISOString() });
  writeQueue(items);
}

export function getOfflineQueue() {
  return readQueue();
}

export function removeFromOfflineQueue(id) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function offlineQueueCount() {
  return readQueue().length;
}

// Re-injects any still-queued pending records of `kind` into a freshly
// fetched server list, keyed by `idKey` — used right after a full sync
// replace (runSync / the startup fetch), which would otherwise silently
// make a queued-but-not-yet-flushed entry disappear from the screen for
// however long it takes the next flush to run (the server obviously
// doesn't have it yet, so a plain replace has no way to know about it).
export function reinjectPendingRecords(serverList, kind, idKey) {
  const pending = readQueue().filter((item) => item.kind === kind);
  if (!pending.length) return serverList;
  const existingIds = new Set(serverList.map((item) => item[idKey]));
  const toAdd = pending.filter((item) => !existingIds.has(item.record[idKey])).map((item) => item.record);
  return toAdd.length ? [...serverList, ...toAdd] : serverList;
}

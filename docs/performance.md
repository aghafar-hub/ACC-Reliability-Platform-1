# Speed: how the app avoids loading screens

Google Apps Script answers each request in roughly 1–5 seconds, and more
when a request reads thousands of rows. The app hides that time in three
layers, so after the first use pages open at once.

## 1. Device cache (in the browser)

- **Vibration** (`apps/vibration-analysis/src/dataCache.js`): every read
  (dashboard, tracker, equipment, log, report, actions, routes, limits, the
  startup bundle) is kept in IndexedDB per person. A page opens with the last
  answer and replaces it with the server's when it arrives. An answer under a
  minute old is reused without asking again, and the same request already on
  its way is shared.
- **Warm-up:** once Vibration has started, it fetches the main pages' data in
  the background (dashboard, Measurement Tracker, log, actions, routes). The
  shell starts the modules right after login, so these pages are ready
  before anyone opens them.
- **Oil** (`apps/oil-analysis/src/dataCache.js`): the main data (samples,
  actions, oil changes) was already kept on the device. The reads pages make
  on their own (routes, routes overview, inventory, movements, consumption,
  forecast, top-ups, suggestions, workload, settings) now show the device's
  copy at once, and the page loads again by itself when the server's answer
  differs (`useFreshTick`).
- **Never stale after your own change:** any save marks the device cache, so
  the next read waits for the server. Checks after a save (`*Raw` functions
  in Oil's `api.js`) always read the sheet.
- **Sync** (top bar) asks for everything again, skipping both caches.
- Each person has their own copy; signing in as someone else on the same
  device doesn't show the first person's data.

## 2. Server cache (Vibration backend, `Cache.js`)

- The heavy reads are kept, gzipped, in the script cache.
- They are thrown away when anything changes: every write through the app,
  any hand edit in the spreadsheet (`onEdit`), a delegation, a Module Access
  change.
- The cache key carries:
  - **today's date**, so due and overdue states are never a day behind;
  - **who is asking**: contractor and approval rights, or the person for
    personal answers. A contractor is never given ACC's answer.
- An entry lives 6 hours at most.
- **File → Import into the spreadsheet** doesn't fire `onEdit`. After an
  import, press **Sync** once, or wait for the next save.

## 3. Lighter requests

- The Vibration startup bundle sends only what pages use: registers, VIB ID
  Registry, settings. The old Compliance Tracker, Last RMS / SPM Reading and
  Action Tracker lists (about 500 KB) are no longer sent.
- Inside one request, each tab is read once (`VL_READ_MEMO`).
- Sheet dates are turned into text with plain arithmetic instead of
  `Utilities.formatDate` for every cell.
- The startup bundle and limits are asked for together, not one after the
  other.

## Measured (local copy of the real data, backend slowed to 2 s per request)

| | Before | Now |
|---|---|---|
| Vibration dashboard, opening again | ~5.4 s | 0.5 s |
| Measurement Tracker, opening again | ~2.8 s | 0.3 s |
| Vibration pages, first time on a new device, 15 s after login | 2–5 s each | 0.1–0.55 s each |

The very first sign-in on a new device still waits for the server once.

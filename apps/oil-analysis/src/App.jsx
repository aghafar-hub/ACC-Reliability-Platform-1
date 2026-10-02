import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { DEFAULT_THEME } from "./theme";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Toast from "./components/Toast";
import Dashboard from "./pages/Dashboard";
import Equipment from "./pages/Equipment";
import OilAnalysisReport from "./pages/OilAnalysisReport";
import OilReportSearch from "./pages/OilReportSearch";
import ActionTracker from "./pages/ActionTracker";
import AddSample from "./pages/AddSample";
import OilChangeLog from "./pages/OilChangeLog";
import Routines from "./pages/Routines";
import OilInventory from "./pages/OilInventory";
import Activity from "./pages/Activity";
import Reports from "./pages/Reports";
import SampleTracker from "./pages/SampleTracker";
import HowToUse from "./pages/HowToUse";
import Settings from "./pages/Settings";
import { SessionProvider } from "./SessionContext";
import { loadConfig, saveConfig, readCache, writeCache } from "./config";
import { loadEquipmentRegistry, saveEquipmentRegistry } from "./equipmentRegistry";
import { loadActionRegistry, saveActionRegistry } from "./actionRegistry";
import { parseTrackerRows, overlaySamplesOnTracker, deriveCurrentOilChanges } from "./parsers";
import * as api from "./api";
import { enqueueOfflineWrite, getOfflineQueue, removeFromOfflineQueue, offlineQueueCount, reinjectPendingRecords } from "./offlineQueue";

let toastId = 0;

// Upserts `incoming` items into `prev` by key, preserving prev's order for
// items that were already there and appending genuinely new ones. Used to
// merge getChanges()'s "rows modified since <checkpoint>" results into the
// already-loaded arrays without a full re-fetch.
function mergeById(prev, incoming, keyFn) {
  const byKey = new Map(prev.map((item) => [keyFn(item), item]));
  incoming.forEach((item) => byKey.set(keyFn(item), item));
  return Array.from(byKey.values());
}

let optimisticIdCounter = 0;
// A save's full row is already known client-side before the network call
// (the form/caller builds the complete object) — only the write's
// confirmation is what the blind-POST-then-verify round trip is actually
// waiting on (see api.js's SaveVerificationError doc comment). So every
// add/edit/delete handler below applies its change to local state
// immediately under a temporary key, then reconciles once the network call
// settles: on success, the temp entry is replaced with the server-confirmed
// one (in case of e.g. server-side normalization); on failure, it's rolled
// back and the already-shown success toast is followed by an error one.
// This is what makes saving feel instant while keeping the exact same
// correctness guarantee — a save is never reported as real until it comes
// back from this same verify step, same as before this change.
function makeOptimisticId() {
  return `_optimistic_${Date.now()}_${++optimisticIdCounter}`;
}

// navBridge (only passed when mounted embedded — see src/embed.jsx) is a
// plain JS object, not React state: the embedding shell runs its own
// separate React root (React 19; this app is React 18), so there's no
// single component tree to pass state through in the usual way. Instead:
// this app writes navBridge.navigate = <its own internal navigate fn> so
// the outer shell can drive it, and calls navBridge.onNavigate(page) so
// the outer shell's sidebar can mirror the active page. Whenever navBridge
// is present at all, this app skips rendering its own Sidebar, since the
// outer shell renders a unified one instead. Standalone builds never pass
// navBridge, so none of this changes anything about how this app runs on
// its own.
export default function App({ navBridge, session } = {}) {
  const [config, setConfig] = useState(() => loadConfig());
  // Live theme override from the host shell's platform Settings page (see
  // frontend/src/embeddedNav.tsx's pushTheme) — takes priority over
  // config.themeName whenever the host has pushed one for this mount, but
  // stays null (falling back to config.themeName as before) in standalone
  // builds, since navBridge is never passed there.
  const [themeOverride, setThemeOverride] = useState(null);

  useEffect(() => {
    if (!navBridge) return;
    navBridge.setTheme = setThemeOverride;
  }, [navBridge]);

  // SECURITY BUGFIX: this used to be inside a useEffect here, keyed on
  // [session]. React always runs a CHILD's effects before its parent's on
  // mount (confirmed directly, not assumed) — and AppShell (rendered
  // below, a child of this component) has its own mount effect that fires
  // getStartupBundle immediately. That child effect was therefore
  // guaranteed to run, and its request to go out, BEFORE this effect ever
  // set the session token — every single mount, not intermittently. A
  // getStartupBundle request with no sessionToken isn't rejected by the
  // backend (checkAuth_, Auth.js, treats a missing token as an anonymous-
  // but-valid request given a correct shared secret) — it's served
  // completely UNSCOPED, every contractor's equipment/samples/actions/oil
  // changes at once. Worse, the Equipment Registry portion of that first
  // response is never re-fetched afterward by anything else (see
  // equipmentRegistry.js's own comment), so once cached, an RHI or ASEC
  // account would keep seeing every contractor's equipment in every
  // equipment-driven screen for the rest of that session, and on reload,
  // since it's also persisted to localStorage.
  //
  // Fixed by setting this synchronously in the render body instead of an
  // effect: React always finishes the ENTIRE render pass — parent and
  // every child — before running ANY effect, parent or child, so this is
  // guaranteed to be set before AppShell's own mount effect can fire,
  // closing the race regardless of effect ordering. Safe to call
  // unconditionally on every render: `session` is only ever set once at
  // mount by the embedding shell (see EmbeddedOilAnalysis.tsx) and never
  // changes afterward, so this is idempotent — not a side effect that
  // needs guarding against re-running, which is the usual reason this
  // kind of call belongs in useEffect.
  api.setSessionToken(session?.token || null);

  return (
    <SessionProvider session={session}>
      <ThemeProvider themeName={themeOverride || config.themeName || DEFAULT_THEME}>
        <AppShell config={config} setConfig={setConfig} navBridge={navBridge} />
      </ThemeProvider>
    </SessionProvider>
  );
}

function AppShell({ config, setConfig, navBridge }) {
  const { T } = useTheme();
  const [page, setPage] = useState("dashboard");
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [reportOrigin, setReportOrigin] = useState("dashboard"); // where "Back" on the Oil Analysis Report returns to
  const [equipmentSelectedCode, setEquipmentSelectedCode] = useState(""); // sticky so Equipment restores the same equipment after Back
  const [oilReportCode, setOilReportCode] = useState("");
  // Patch 15: set when the shell's notification bell navigates here with a
  // specific record (e.g. navBridge.navigate("routines", "RT-123")) — read
  // once by Routines below to open that routine's detail view directly,
  // then cleared so a later plain navBridge.navigate("routines") (no
  // recordId) isn't misread as "re-open the same routine again".
  const [deepLinkRoutineId, setDeepLinkRoutineId] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [samples, setSamples] = useState(() => readCache("samples")?.data || []);
  const [actions, setActions] = useState(() => readCache("actions")?.data || []);
  const [oilChangeEvents, setOilChangeEvents] = useState(() => readCache("oilChangeEvents")?.data || []);
  const [trackerRaw, setTrackerRaw] = useState(() => readCache("trackerRaw")?.data || []);
  const [equipmentRegistry, setEquipmentRegistry] = useState(() => loadEquipmentRegistry());
  const [actionRegistry, setActionRegistry] = useState(() => loadActionRegistry());
  const [syncState, setSyncState] = useState("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [toasts, setToasts] = useState([]);
  // Checkpoint for incremental sync (api.getChanges) — an ISO timestamp
  // captured just before the last successful sync request went out.
  const [lastSyncAt, setLastSyncAt] = useState(() => readCache("lastSyncAt")?.data || null);
  const autoSyncTickRef = useRef(0);
  // Patch 11 — how many new-record writes are sitting in the offline
  // queue right now (see offlineQueue.js). Not itself the source of
  // truth (that's localStorage, so it survives a reload) — just a React
  // state mirror of it so the Sidebar badge re-renders whenever it
  // changes, recomputed every time something is queued or a flush pass
  // finishes.
  const [pendingSyncCount, setPendingSyncCount] = useState(() => offlineQueueCount());
  const flushInProgressRef = useRef(false);

  // The tracker sheet only reflects samples added through this app (or
  // manually kept in sync by hand); Data_Entry is always current, since
  // every sample lands there regardless of how it was entered. Overlaying
  // samples on top of the sheet's parsed history means every tracker
  // consumer (Sample Tracker page, Reports, Oil Report Search) shows the
  // real current state even when the sheet itself has drifted.
  const trackerByEquip = useMemo(() => overlaySamplesOnTracker(parseTrackerRows(trackerRaw), samples), [trackerRaw, samples]);

  // "Current state per lubrication point" — every page below still wants
  // this shape (one entry per LP, last change / next due / status), so it's
  // rebuilt here from the raw append-only event log rather than each page
  // knowing about events at all.
  const oilChanges = useMemo(
    () => deriveCurrentOilChanges(equipmentRegistry, oilChangeEvents),
    [equipmentRegistry, oilChangeEvents]
  );

  const pushToast = useCallback((message, type = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "error" ? 8000 : 4000);
  }, []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  // Matches the original app's own architecture: samples/actions/oil
  // changes sync together (Full Sync). The equipment registry does NOT —
  // it's synced separately and explicitly from Settings → Configuration
  // (see equipmentRegistry.js), so it's not part of this.
  const runSync = useCallback(async () => {
    if (!config.webhookUrl) {
      pushToast("Add your Apps Script webhook URL in Settings first.", "error");
      return;
    }
    setSyncState("loading");
    setSyncMsg("Syncing from Google Sheets…");
    const requestStartedAt = new Date().toISOString();
    try {
      const { samples: smRaw, actions: acRaw, oilChangeEvents: ocRaw, trackerRaw: tr } = await api.readAll(config.webhookUrl);
      // Patch 11: a full replace from the server has no way to know about
      // a write still sitting in the offline queue (the server doesn't
      // have it yet) — re-add it so it doesn't disappear from the screen
      // until the next flush pass picks it up.
      const sm = reinjectPendingRecords(smRaw, "sample", "_id");
      const ac = reinjectPendingRecords(acRaw, "action", "_id");
      const oc = reinjectPendingRecords(ocRaw, "oilChange", "eventId");
      setSamples(sm);
      setActions(ac);
      setOilChangeEvents(oc);
      setTrackerRaw(tr);
      writeCache("samples", sm);
      writeCache("actions", ac);
      writeCache("oilChangeEvents", oc);
      writeCache("trackerRaw", tr);
      setLastSyncAt(requestStartedAt);
      writeCache("lastSyncAt", requestStartedAt);
      setSyncMsg(`Synced — ${sm.length} samples · ${ac.length} actions · ${oc.length} oil change events — ${new Date().toLocaleTimeString()}`);
      setSyncState("idle");
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message}`);
      setSyncState("error");
      pushToast(`Sync failed: ${err.message}`, "error");
    }
  }, [config.webhookUrl, pushToast]);

  // Background auto-sync uses this instead of runSync's full readAll() once
  // there's a checkpoint to sync from — cheaper against sheets this size
  // with ~20 people's browsers polling the same Apps Script deployment.
  // getChanges() can't see row DELETIONS (a removed row has no "Last
  // Modified" left to compare), so this alone would slowly drift stale;
  // the auto-sync scheduler below mixes in a full runSync() periodically
  // to catch those. Errors here don't toast — a background tick failing
  // silently retries next cycle instead of interrupting whoever's using
  // the app; the explicit "Sync now" button still goes through runSync.
  const runIncrementalSync = useCallback(async () => {
    if (!config.webhookUrl) return;
    if (!lastSyncAt) {
      await runSync();
      return;
    }
    const requestStartedAt = new Date().toISOString();
    try {
      const { samples: sm, actions: ac, oilChangeEvents: oc, fullSyncRequired } = await api.getChanges(
        config.webhookUrl,
        lastSyncAt
      );
      if (fullSyncRequired) {
        await runSync();
        return;
      }
      if (sm.length) {
        setSamples((prev) => {
          const next = mergeById(prev, sm, (s) => s._id);
          writeCache("samples", next);
          return next;
        });
      }
      if (ac.length) {
        setActions((prev) => {
          const next = mergeById(prev, ac, (a) => a._id);
          writeCache("actions", next);
          return next;
        });
      }
      if (oc.length) {
        setOilChangeEvents((prev) => {
          const next = mergeById(prev, oc, (e) => e.eventId);
          writeCache("oilChangeEvents", next);
          return next;
        });
      }
      setLastSyncAt(requestStartedAt);
      writeCache("lastSyncAt", requestStartedAt);
      if (sm.length || ac.length || oc.length) {
        setSyncMsg(
          `Synced — ${sm.length} new/updated samples · ${ac.length} actions · ${oc.length} oil change events — ${new Date().toLocaleTimeString()}`
        );
      }
    } catch (err) {
      setSyncMsg(`Background sync failed: ${err.message}`);
    }
  }, [config.webhookUrl, lastSyncAt, runSync]);

  // BUGFIX (confirmed via the live Network tab, not a hunch): this used to
  // be two separate effects — runSync() and the two registry fetches — both
  // keyed on [config.webhookUrl], so React fired all three fetch() calls in
  // the same instant on every app load. Google Apps Script Web Apps don't
  // handle simultaneous GET requests to the same deployment reliably: the
  // symptom was all three requests' redirect-to-content step
  // (exec?action=... -> 302 -> echo?user_content_key=...) coming back 404,
  // leaving the app stuck on whatever was cached (or the bundled default on
  // a fresh device) — which looked exactly like old equipment codes
  // reappearing and new equipment never showing up, even though the sheet
  // data, the backend, and the grouping logic were all independently
  // confirmed correct.
  //
  // PERFORMANCE: originally fixed by running three requests one at a time
  // instead of in parallel — correct, but still three full round trips
  // before first paint. Now uses one combined request instead
  // (api.getStartupBundle, backed by the backend's getStartupBundle action —
  // see Dashboard.js) that carries all three payloads in a single response.
  // This is still just ONE request in flight at a time, so the
  // never-parallel-GETs constraint above still holds — it's just one
  // request instead of three now, not three run concurrently.
  //
  // Equipment/Action Registry used to also need a manual "Sync" click in
  // Settings, once per device — the data was always in the sheet, the app
  // just never fetched it on its own. Now fetched automatically on every
  // app load, so a fresh browser/device is never stuck showing an empty
  // equipment dropdown or action picker. Always a straight REPLACE, never a
  // merge: both sheets (Equipment Registry, OL_ACTION_PHRASES) are the only
  // place this data is ever created, so anything sitting in the local cache
  // that's no longer in the sheet is stale leftover, never a legitimate
  // app-only addition — same reasoning as the "Remove all" fix this
  // replaced.
  useEffect(() => {
    if (!config.webhookUrl) return;
    let cancelled = false;
    (async () => {
      setSyncState("loading");
      setSyncMsg("Syncing from Google Sheets…");
      const requestStartedAt = new Date().toISOString();
      try {
        const { samples: smRaw, actions: acRaw, oilChangeEvents: ocRaw, trackerRaw: tr, equipment, actionPhrases } =
          await api.getStartupBundle(config.webhookUrl);
        if (cancelled) return;
        // Patch 11 — see runSync's identical comment above.
        const sm = reinjectPendingRecords(smRaw, "sample", "_id");
        const ac = reinjectPendingRecords(acRaw, "action", "_id");
        const oc = reinjectPendingRecords(ocRaw, "oilChange", "eventId");
        setSamples(sm);
        setActions(ac);
        setOilChangeEvents(oc);
        setTrackerRaw(tr);
        writeCache("samples", sm);
        writeCache("actions", ac);
        writeCache("oilChangeEvents", oc);
        writeCache("trackerRaw", tr);
        setLastSyncAt(requestStartedAt);
        writeCache("lastSyncAt", requestStartedAt);
        setSyncMsg(`Synced — ${sm.length} samples · ${ac.length} actions · ${oc.length} oil change events — ${new Date().toLocaleTimeString()}`);
        setSyncState("idle");
        if (equipment && equipment.length) {
          saveEquipmentRegistry(equipment);
          setEquipmentRegistry(equipment);
        }
        if (actionPhrases && actionPhrases.length) {
          saveActionRegistry(actionPhrases);
          setActionRegistry(actionPhrases);
        }
      } catch (err) {
        if (cancelled) return;
        setSyncMsg(`Sync failed: ${err.message}`);
        setSyncState("error");
        pushToast(`Sync failed: ${err.message}`, "error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushToast's own identity changes with config.webhookUrl, which would re-trigger this same effect redundantly; config.webhookUrl alone is the real trigger
  }, [config.webhookUrl]);

  // Jittered polling, mostly incremental: a plain setInterval would have
  // every open tab across ~20 people's devices fire their GET at the exact
  // same moment (they all started auto-sync near the same time, e.g. right
  // after a shared link or a deploy). Recomputing the delay each cycle with
  // +/-15% randomness spreads that out instead of hammering the Apps
  // Script deployment in one burst every N minutes. Every 6th tick runs a
  // full sync (readAll) instead of incremental (getChanges), since
  // incremental can't see deletions.
  useEffect(() => {
    if (!config.enableAutoSync || !config.webhookUrl) return;
    const minutes = Number(config.autoSyncMinutes) || 5;
    let cancelled = false;
    let timeoutId;

    const scheduleNext = () => {
      const jitter = 0.85 + Math.random() * 0.3;
      timeoutId = setTimeout(tick, minutes * 60 * 1000 * jitter);
    };

    const tick = async () => {
      autoSyncTickRef.current += 1;
      if (autoSyncTickRef.current % 6 === 0) {
        await runSync();
      } else {
        await runIncrementalSync();
      }
      if (!cancelled) scheduleNext();
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [config.enableAutoSync, config.autoSyncMinutes, config.webhookUrl, runSync, runIncrementalSync]);

  function updateConfig(patch) {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
  }

  // ── Action CRUD, shared by Oil Analysis Report, Action Tracker, and the
  // Oil Analysis Report search page. Local state is only updated AFTER the
  // server confirms the write — unlike the original app, which updated the
  // screen optimistically and could silently drift from what was actually
  // saved.
  const applyOilChangeSideEffect = useCallback(
    async (action) => {
      if (!action._oilChangeTarget) return;
      try {
        const saved = await api.logOilChangeEvent(config.webhookUrl, {
          lpId: action._oilChangeTarget.lpId,
          eventDate: action.lastChange,
          contractor: action._oilChangeTarget.contractor,
        });
        setOilChangeEvents((prev) => {
          const next = [...prev, saved];
          writeCache("oilChangeEvents", next);
          return next;
        });
      } catch (err) {
        pushToast(`Action saved, but the linked Oil Change Log entry wasn't: ${err.message}`, "error");
      }
    },
    [config.webhookUrl, pushToast]
  );

  // Keeps the Oil Sample Tracker sheet in sync with new samples automatically
  // — same best-effort side-effect pattern as applyOilChangeSideEffect: the
  // sample save itself already succeeded, so a failure here is surfaced as
  // its own toast rather than treated as the primary save failing. Re-syncs
  // afterward so the Sample Tracker page reflects the new entry right away
  // instead of only after the next manual sync.
  const applySampleTrackerSideEffect = useCallback(
    async (sample) => {
      try {
        await api.updateSampleTracker(config.webhookUrl, {
          equipmentCode: sample.unitId,
          sampleDate: sample.sampledDate,
          status: sample.reportStatus,
        });
        await runSync();
      } catch (err) {
        pushToast(`Sample saved, but the Sample Tracker wasn't updated: ${err.message}`, "error");
      }
    },
    [config.webhookUrl, pushToast, runSync]
  );

  const onAddAction = useCallback(
    async (action) => {
      const tempId = makeOptimisticId();
      setActions((prev) => {
        const next = [...prev, { ...action, _id: tempId }];
        writeCache("actions", next);
        return next;
      });
      pushToast("Action added.", "success");
      try {
        const saved = await api.saveAction(config.webhookUrl, action, { isNew: true });
        setActions((prev) => {
          const next = prev.map((a) => (a._id === tempId ? saved : a));
          writeCache("actions", next);
          return next;
        });
        await applyOilChangeSideEffect(action);
        return saved;
      } catch (err) {
        // Patch 11: the request never reached the server at all (see
        // api.js's NetworkError doc comment) — keep the optimistic entry
        // on screen instead of rolling it back, mark it pending, and let
        // the offline queue retry it automatically once connectivity is
        // back, rather than making the technician re-enter it.
        if (err instanceof api.NetworkError) {
          const pendingRecord = { ...action, _id: tempId, _pendingSync: true };
          enqueueOfflineWrite("action", tempId, { action }, pendingRecord);
          setPendingSyncCount(offlineQueueCount());
          setActions((prev) => {
            const next = prev.map((a) => (a._id === tempId ? pendingRecord : a));
            writeCache("actions", next);
            return next;
          });
          pushToast("No connection — this action is saved on this device and will sync automatically.", "info");
          return pendingRecord;
        }
        setActions((prev) => {
          const next = prev.filter((a) => a._id !== tempId);
          writeCache("actions", next);
          return next;
        });
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast, applyOilChangeSideEffect]
  );

  const onUpdateAction = useCallback(
    async (action) => {
      const matches = (a) =>
        a._matchValues?.[0] === action._matchValues?.[0] && a._matchValues?.[1] === action._matchValues?.[1];
      let previousAction;
      setActions((prev) => {
        const next = prev.map((a) => {
          if (!matches(a)) return a;
          previousAction = a;
          return { ...a, ...action };
        });
        writeCache("actions", next);
        return next;
      });
      pushToast("Action saved.", "success");
      try {
        const saved = await api.saveAction(config.webhookUrl, action, { isNew: false });
        setActions((prev) => {
          const next = prev.map((a) => (matches(a) ? saved : a));
          writeCache("actions", next);
          return next;
        });
        await applyOilChangeSideEffect(action);
        return saved;
      } catch (err) {
        setActions((prev) => {
          const next = prev.map((a) => (matches(a) && previousAction ? previousAction : a));
          writeCache("actions", next);
          return next;
        });
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast, applyOilChangeSideEffect]
  );

  const onDeleteAction = useCallback(
    async (action) => {
      let removedAction;
      let removedIndex = -1;
      setActions((prev) => {
        const idx = prev.findIndex((a) => a._id === action._id);
        if (idx === -1) return prev;
        removedIndex = idx;
        removedAction = prev[idx];
        const next = prev.filter((a) => a._id !== action._id);
        writeCache("actions", next);
        return next;
      });
      pushToast("Action deleted.", "success");
      try {
        await api.deleteAction(config.webhookUrl, action);
      } catch (err) {
        if (removedAction) {
          setActions((prev) => {
            const next = [...prev];
            next.splice(Math.min(removedIndex, next.length), 0, removedAction);
            writeCache("actions", next);
            return next;
          });
        }
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onSaveOilChange = useCallback(
    async (event) => {
      // eventId is server-generated (a UUID minted in OilChanges.js), so it
      // isn't known yet at this point — tracked under a temp marker instead
      // until the real one comes back, then swapped in by that same key
      // mergeById/runIncrementalSync already use for this array elsewhere.
      const tempId = makeOptimisticId();
      setOilChangeEvents((prev) => {
        const next = [...prev, { ...event, eventId: tempId }];
        writeCache("oilChangeEvents", next);
        return next;
      });
      pushToast("Oil change logged.", "success");
      try {
        const saved = await api.logOilChangeEvent(config.webhookUrl, event);
        setOilChangeEvents((prev) => {
          const next = prev.map((e) => (e.eventId === tempId ? saved : e));
          writeCache("oilChangeEvents", next);
          return next;
        });
        return saved;
      } catch (err) {
        // Patch 11 — see onAddAction's identical comment.
        if (err instanceof api.NetworkError) {
          const pendingRecord = { ...event, eventId: tempId, _pendingSync: true };
          enqueueOfflineWrite("oilChange", tempId, { event }, pendingRecord);
          setPendingSyncCount(offlineQueueCount());
          setOilChangeEvents((prev) => {
            const next = prev.map((e) => (e.eventId === tempId ? pendingRecord : e));
            writeCache("oilChangeEvents", next);
            return next;
          });
          pushToast("No connection — this oil change is saved on this device and will sync automatically.", "info");
          return pendingRecord;
        }
        setOilChangeEvents((prev) => {
          const next = prev.filter((e) => e.eventId !== tempId);
          writeCache("oilChangeEvents", next);
          return next;
        });
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onAddSample = useCallback(
    async (sample, headers) => {
      const tempId = makeOptimisticId();
      setSamples((prev) => {
        const next = [...prev, { ...sample, _id: tempId }];
        writeCache("samples", next);
        return next;
      });
      pushToast("Sample saved.", "success");
      try {
        const saved = await api.saveSample(config.webhookUrl, sample, headers);
        setSamples((prev) => {
          const next = prev.map((s2) => (s2._id === tempId ? saved : s2));
          writeCache("samples", next);
          return next;
        });
        await applySampleTrackerSideEffect(saved);
        return saved;
      } catch (err) {
        // Patch 11 — see onAddAction's identical comment.
        if (err instanceof api.NetworkError) {
          const pendingRecord = { ...sample, _id: tempId, _pendingSync: true };
          enqueueOfflineWrite("sample", tempId, { sample, headers }, pendingRecord);
          setPendingSyncCount(offlineQueueCount());
          setSamples((prev) => {
            const next = prev.map((s2) => (s2._id === tempId ? pendingRecord : s2));
            writeCache("samples", next);
            return next;
          });
          pushToast("No connection — this sample is saved on this device and will sync automatically.", "info");
          return pendingRecord;
        }
        setSamples((prev) => {
          const next = prev.filter((s2) => s2._id !== tempId);
          writeCache("samples", next);
          return next;
        });
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast, applySampleTrackerSideEffect]
  );

  // Bulk PDF import's confirm step, after the review popup. Writes are
  // sequential — the backend's "find the next empty row" append logic
  // isn't safe for concurrent writes — and each sample also updates its own
  // month's Oil Sample Tracker cell (not just the newest one, since a
  // backfilled older sample belongs in its own historical column). A full
  // resync happens once at the end rather than after every sample, since
  // that's what applySampleTrackerSideEffect would otherwise do up to 150
  // times in a large batch.
  const onBulkAddSamples = useCallback(
    async (samplesToAdd, onProgress) => {
      const savedSamples = [];
      let errors = 0;
      for (let i = 0; i < samplesToAdd.length; i++) {
        const sample = samplesToAdd[i];
        try {
          const saved = await api.saveSample(config.webhookUrl, sample);
          savedSamples.push(saved);
          try {
            await api.updateSampleTracker(config.webhookUrl, {
              equipmentCode: saved.unitId,
              sampleDate: saved.sampledDate,
              status: saved.reportStatus,
            });
          } catch {
            // best-effort, matches applySampleTrackerSideEffect — the sample itself is still saved
          }
        } catch (err) {
          errors++;
          pushToast(`${sample.unitId} / ${sample.sampleId}: ${err.message}`, "error");
        }
        onProgress?.(i + 1, samplesToAdd.length, errors);
      }
      if (savedSamples.length) {
        setSamples((prev) => {
          const next = [...prev, ...savedSamples];
          writeCache("samples", next);
          return next;
        });
        await runSync();
      }
      pushToast(
        `Bulk import: ${savedSamples.length} sample${savedSamples.length === 1 ? "" : "s"} added${errors ? `, ${errors} failed` : ""}.`,
        errors ? "error" : "success"
      );
      return { saved: savedSamples.length, failed: errors };
    },
    [config.webhookUrl, pushToast, runSync]
  );

  // Patch 11: replays whatever is sitting in the offline queue, one item
  // at a time and in the order queued (same "writes must be sequential"
  // reasoning as onBulkAddSamples — the backend's own append/findRowIndex
  // logic isn't safe for concurrent writes against the same sheet).
  //
  // A NetworkError on any item means the device is still offline — stop
  // this pass right there rather than churning through the rest of the
  // queue against a connection that clearly isn't back yet; the next
  // scheduled attempt (the 'online' event, or the periodic fallback
  // below) picks up again from wherever this left off. Any OTHER error
  // means the write itself was rejected for a real reason once it
  // actually reached the server — retrying the exact same payload
  // forever would never succeed, so that one item is dropped (and its
  // optimistic entry rolled back) with an explanatory toast, same as if
  // it had failed immediately back when it was first attempted; the rest
  // of the queue still gets its turn.
  const flushOfflineQueue = useCallback(async () => {
    if (flushInProgressRef.current || !config.webhookUrl) return;
    flushInProgressRef.current = true;
    try {
      for (const item of getOfflineQueue()) {
        try {
          let saved;
          if (item.kind === "sample") {
            saved = await api.saveSample(config.webhookUrl, item.payload.sample, item.payload.headers);
          } else if (item.kind === "action") {
            saved = await api.saveAction(config.webhookUrl, item.payload.action, { isNew: true });
          } else if (item.kind === "oilChange") {
            saved = await api.logOilChangeEvent(config.webhookUrl, item.payload.event);
          } else {
            removeFromOfflineQueue(item.id);
            continue;
          }
          removeFromOfflineQueue(item.id);
          setPendingSyncCount(offlineQueueCount());
          if (item.kind === "sample") {
            setSamples((prev) => {
              const next = prev.map((s2) => (s2._id === item.id ? saved : s2));
              writeCache("samples", next);
              return next;
            });
            applySampleTrackerSideEffect(saved).catch(() => {});
          } else if (item.kind === "action") {
            setActions((prev) => {
              const next = prev.map((a) => (a._id === item.id ? saved : a));
              writeCache("actions", next);
              return next;
            });
            applyOilChangeSideEffect(item.payload.action).catch(() => {});
          } else if (item.kind === "oilChange") {
            setOilChangeEvents((prev) => {
              const next = prev.map((e) => (e.eventId === item.id ? saved : e));
              writeCache("oilChangeEvents", next);
              return next;
            });
          }
          pushToast(`A queued ${item.kind === "oilChange" ? "oil change" : item.kind} synced.`, "success");
        } catch (err) {
          if (err instanceof api.NetworkError) break; // still offline — try the rest next time
          removeFromOfflineQueue(item.id);
          setPendingSyncCount(offlineQueueCount());
          if (item.kind === "sample") {
            setSamples((prev) => {
              const next = prev.filter((s2) => s2._id !== item.id);
              writeCache("samples", next);
              return next;
            });
          } else if (item.kind === "action") {
            setActions((prev) => {
              const next = prev.filter((a) => a._id !== item.id);
              writeCache("actions", next);
              return next;
            });
          } else if (item.kind === "oilChange") {
            setOilChangeEvents((prev) => {
              const next = prev.filter((e) => e.eventId !== item.id);
              writeCache("oilChangeEvents", next);
              return next;
            });
          }
          pushToast(`A queued ${item.kind === "oilChange" ? "oil change" : item.kind} couldn't be saved: ${err.message}`, "error");
        }
      }
    } finally {
      flushInProgressRef.current = false;
    }
  }, [config.webhookUrl, pushToast, applySampleTrackerSideEffect, applyOilChangeSideEffect]);

  // Tries once right away (covers "reopened the app/tab and connectivity
  // is already back"), again on the browser's own 'online' event, and
  // falls back to a periodic sweep — navigator.onLine / the 'online'
  // event aren't fully reliable on every device (e.g. "connected to wifi
  // with no real internet" often still fires 'online'), so a queued item
  // from a flaky connection shouldn't be able to get stuck forever with
  // nothing left to retry it.
  useEffect(() => {
    flushOfflineQueue();
    const onOnline = () => flushOfflineQueue();
    window.addEventListener("online", onOnline);
    const interval = setInterval(flushOfflineQueue, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [flushOfflineQueue]);

  const onEditSample = useCallback(
    async (original, updates) => {
      let previousSample;
      setSamples((prev) => {
        const next = prev.map((s2) => {
          if (s2._id !== original._id) return s2;
          previousSample = s2;
          return { ...s2, ...updates };
        });
        writeCache("samples", next);
        return next;
      });
      pushToast("Sample saved.", "success");
      try {
        const saved = await api.updateSample(config.webhookUrl, { ...original, ...updates });
        setSamples((prev) => {
          const next = prev.map((s2) => (s2._id === original._id ? saved : s2));
          writeCache("samples", next);
          return next;
        });
        return saved;
      } catch (err) {
        if (previousSample) {
          setSamples((prev) => {
            const next = prev.map((s2) => (s2._id === original._id ? previousSample : s2));
            writeCache("samples", next);
            return next;
          });
        }
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onDeleteSample = useCallback(
    async (sample) => {
      let removedSample;
      let removedIndex = -1;
      setSamples((prev) => {
        const idx = prev.findIndex((s2) => s2._id === sample._id);
        if (idx === -1) return prev;
        removedIndex = idx;
        removedSample = prev[idx];
        const next = prev.filter((s2) => s2._id !== sample._id);
        writeCache("samples", next);
        return next;
      });
      pushToast("Sample deleted.", "success");
      try {
        await api.deleteSample(config.webhookUrl, sample);
      } catch (err) {
        if (removedSample) {
          setSamples((prev) => {
            const next = [...prev];
            next.splice(Math.min(removedIndex, next.length), 0, removedSample);
            writeCache("samples", next);
            return next;
          });
        }
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  // Equipment Registry (loaded from localStorage, or the app's built-in
  // default list — see equipmentRegistry.js) is the authoritative equipment
  // list, same as the original app: it always has entries, so dropdowns
  // include equipment that has actions/oil-change records but no sample yet.
  const equipmentOptions = useMemo(
    () =>
      equipmentRegistry
        .map((e) => e.code)
        .filter(Boolean)
        .sort(),
    [equipmentRegistry]
  );

  const alertCount = useMemo(() => samples.filter((sm) => sm.reportStatus === "Alert").length, [samples]);
  const openActionsCount = useMemo(() => actions.filter((a) => a.status === "Open" || a.status === "In Progress").length, [actions]);

  function goToReport(sample, origin = "dashboard") {
    setSelectedEquipment(sample);
    setReportOrigin(origin);
    setPage("report");
    setMobileNavOpen(false);
  }
  function goToOilReport(code) {
    setOilReportCode(code || "");
    setPage("oilreport");
    setMobileNavOpen(false);
  }

  function navigate(nextPage, recordId) {
    if (nextPage !== "equipment") setSelectedEquipment(null);
    setDeepLinkRoutineId(nextPage === "routines" && recordId ? recordId : null);
    setPage(nextPage);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    if (!navBridge) return;
    navBridge.navigate = navigate;
    navBridge.onNavigate?.(page);
  });

  // Patch 35 ("make it one [top bar]"): lets the shell's own TopBar run
  // this module's sync instead of this module rendering a second,
  // duplicate bar with its own Sync button just to reach it — see
  // embeddedNav.tsx's NavBridge.sync/onSyncStateChange.
  useEffect(() => {
    if (!navBridge) return;
    navBridge.sync = runSync;
  }, [navBridge, runSync]);
  useEffect(() => {
    if (!navBridge) return;
    navBridge.onSyncStateChange?.({ syncState, pendingSyncCount });
  }, [navBridge, syncState, pendingSyncCount]);

  const cacheInfo = readCache("samples");

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter',sans-serif",
        background: T.appBg,
        color: T.textPrimary,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/*
        Mobile layout + shared page classes, ported verbatim (selectors,
        breakpoints, transform, transition, shadow) from the original app's
        own <style> block. Do not restyle this without re-checking the
        original first.
      */}
      <style>{`
        *{box-sizing:border-box}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${T.appBg}}
        ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:3px}
        select option{background:${T.inputBg};color:${T.textPrimary}}
        textarea{background:${T.inputBg};color:${T.textPrimary};border:1px solid ${T.border};border-radius:6px;outline:none;font-family:inherit}

        .mobile-menu-btn { display: none; }
        .sidebar-backdrop { display: none; }

        @media (max-width: 860px) {
          .app-sidebar {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            height: 100vh !important; width: 220px !important;
            z-index: 500 !important;
            transform: translateX(-110%) !important;
            transition: transform 0.28s cubic-bezier(.4,0,.2,1) !important;
            box-shadow: 4px 0 32px rgba(0,0,0,0.55) !important;
          }
          .app-sidebar.open { transform: translateX(0) !important; }
          .sidebar-backdrop.open {
            display: block !important; position: fixed !important;
            inset: 0 !important; background: rgba(0,0,0,0.6) !important; z-index: 499 !important;
          }
          .mobile-menu-btn { display: inline-flex !important; }
          .app-main { width: 100% !important; flex: 1 1 100% !important; min-width: 0 !important; }
          .app-topbar { padding: 10px 12px !important; flex-wrap: wrap !important; gap: 8px !important; }
          .app-topbar-title { font-size: 14px !important; }
          .app-content { padding: 10px !important; }
          .topbar-date { display: none !important; }

          .report-layout { grid-template-columns: 1fr !important; }
          .report-layout > div:first-child { border-right: none !important; border-bottom: 1px solid ${T.border}; }
          .dash-table-desktop { display: none !important; }
          .dash-table-mobile { display: flex !important; }
        }
        @media (max-width: 480px) {
          .app-content { padding: 8px !important; }
          .topbar-actions .ti + span { display: none; }
        }
      `}</style>
      {!navBridge && (
        <div
          className={`app-sidebar${mobileNavOpen ? " open" : ""}`}
          style={{
            width: 220,
            background: T.sidebarBg,
            borderRight: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <Sidebar
            page={page}
            onNavigate={navigate}
            alertCount={alertCount}
            openActionsCount={openActionsCount}
            syncState={syncState}
            syncMsg={syncMsg}
            logoUrl={config.logoUrl}
            hasCache={config.enableCache !== false && !!cacheInfo}
            cacheAgeMinutes={cacheInfo?.ageMinutes || 0}
            onFullSync={runSync}
            onQuickSync={runSync}
            pendingSyncCount={pendingSyncCount}
          />
        </div>
      )}
      {!navBridge && (
        <div className={`sidebar-backdrop${mobileNavOpen ? " open" : ""}`} onClick={() => setMobileNavOpen(false)} />
      )}
      <div className="app-main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopBar
          page={page}
          sample={selectedEquipment}
          navBridge={navBridge}
          syncState={syncState}
          onSync={runSync}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onBack={() => navigate(reportOrigin === "equipment" ? "equipment" : "dashboard")}
          pendingSyncCount={pendingSyncCount}
        />
        <div className="app-content" style={{ flex: 1, overflowY: "auto", padding: 24, background: T.appBg }}>
          {page === "dashboard" && (
            <Dashboard
              samples={samples}
              actions={actions}
              oilChangeEvents={oilChangeEvents}
              equipmentRegistry={equipmentRegistry}
              webhookUrl={config.webhookUrl}
              onSelectSample={(sm) => goToReport(sm, "dashboard")}
            />
          )}
          {page === "equipment" && (
            <Equipment
              samples={samples}
              equipmentRegistry={equipmentRegistry}
              actions={actions}
              oilChanges={oilChanges}
              actionRegistry={actionRegistry}
              webhookUrl={config.webhookUrl}
              pushToast={pushToast}
              onSelectSample={(sm) => goToReport(sm, "equipment")}
              onEditSample={onEditSample}
              onDeleteSample={onDeleteSample}
              onOpenReport={goToOilReport}
              onAddAction={onAddAction}
              onUpdateAction={onUpdateAction}
              onDeleteAction={onDeleteAction}
              onSaveOilChange={onSaveOilChange}
              initialCode={equipmentSelectedCode}
              onCodeChange={setEquipmentSelectedCode}
            />
          )}
          {page === "report" && selectedEquipment && (
            <OilAnalysisReport
              sample={selectedEquipment}
              samples={samples}
              actions={actions}
              oilChanges={oilChanges}
              equipmentOptions={equipmentOptions}
              equipmentRegistry={equipmentRegistry}
              actionRegistry={actionRegistry}
              onAddAction={onAddAction}
              onUpdateAction={onUpdateAction}
              onDeleteAction={onDeleteAction}
            />
          )}
          {page === "report" && !selectedEquipment && (
            <div style={{ color: T.textSecondary }}>Select a sample from the Dashboard or Equipment page first.</div>
          )}
          {page === "oilreport" && (
            <OilReportSearch
              samples={samples}
              oilChanges={oilChanges}
              actions={actions}
              equipmentRegistry={equipmentRegistry}
              actionRegistry={actionRegistry}
              trackerByEquip={trackerByEquip}
              onAddAction={onAddAction}
              onUpdateAction={onUpdateAction}
              initialCode={oilReportCode}
            />
          )}
          {page === "upload" && (
            <AddSample
              equipmentOptions={equipmentOptions}
              equipmentRegistry={equipmentRegistry}
              existingSamples={samples}
              onAdd={onAddSample}
              onBulkAdd={onBulkAddSamples}
            />
          )}
          {page === "actions" && (
            <ActionTracker
              actions={actions}
              samples={samples}
              oilChanges={oilChanges}
              equipmentRegistry={equipmentRegistry}
              actionRegistry={actionRegistry}
              onAddAction={onAddAction}
              onUpdateAction={onUpdateAction}
              onDeleteAction={onDeleteAction}
            />
          )}
          {page === "oilchange" && (
            <OilChangeLog
              oilChanges={oilChanges}
              actions={actions}
              equipmentRegistry={equipmentRegistry}
              onSave={onSaveOilChange}
              onAddAction={onAddAction}
            />
          )}
          {page === "routines" && (
            <Routines
              webhookUrl={config.webhookUrl}
              equipmentRegistry={equipmentRegistry}
              samples={samples}
              actions={actions}
              oilChanges={oilChanges}
              pushToast={pushToast}
              onDataChanged={runSync}
              initialRoutineId={deepLinkRoutineId}
              onInitialRoutineConsumed={() => setDeepLinkRoutineId(null)}
            />
          )}
          {page === "inventory" && (
            <OilInventory webhookUrl={config.webhookUrl} equipmentRegistry={equipmentRegistry} pushToast={pushToast} />
          )}
          {page === "reports" && (
            <Reports
              actions={actions}
              oilChanges={oilChanges}
              oilChangeEvents={oilChangeEvents}
              samples={samples}
              equipmentRegistry={equipmentRegistry}
              trackerByEquip={trackerByEquip}
            />
          )}
          {page === "activity" && <Activity webhookUrl={config.webhookUrl} />}
          {page === "tracker" && (
            <SampleTracker trackerByEquip={trackerByEquip} oilChanges={oilChanges} equipmentRegistry={equipmentRegistry} />
          )}
          {page === "howto" && <HowToUse />}
          {page === "settings" && (
            <Settings
              config={config}
              onSave={updateConfig}
              onSync={runSync}
              syncState={syncState}
              syncMsg={syncMsg}
              equipmentRegistry={equipmentRegistry}
              onRegistryChange={setEquipmentRegistry}
              actionRegistry={actionRegistry}
              onActionRegistryChange={setActionRegistry}
              navBridge={navBridge}
            />
          )}
        </div>
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

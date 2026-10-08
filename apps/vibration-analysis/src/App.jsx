import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendRow,
  deleteLastRMS,
  deleteLastSPM,
  deleteRow,
  getRmsSpmHistory,
  getStartupBundle,
  readAll,
  setCurrentPage,
  updateRow,
  upsertLastRMS,
  upsertLastSPM,
} from "./api";
import { configStore, DEFAULT_WEBHOOK_URL, loadThresholdOverrides, saveThresholdOverrides } from "./config";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { classifyComplianceStatus, resolveThresholds, rmsStatus, spmStatus, vibPointKey } from "./domain";
import { PAGE_TITLES } from "./navigation";
import {
  RMS_HEADERS,
  rmsToRow,
  rowToAction,
  rowToCompliance,
  rowToLastRMS,
  rowToLastSPM,
  rowToRmsRegister,
  rowToRMS,
  rowToSpmRegister,
  rowToSPM,
  rowToVibPoint,
  SPM_HEADERS,
  spmToRow,
} from "./parsers";
import { useTheme } from "./ThemeContext";

import Dashboard from "./pages/Dashboard";
import NewReading from "./pages/NewReading";
import EquipmentRegister from "./pages/EquipmentRegister";
import EquipmentReadings from "./pages/EquipmentReadings";
import GraphsDashboard from "./pages/GraphsDashboard";
import ComplianceTracker from "./pages/ComplianceTracker";
import ActionTracker from "./pages/ActionTracker";
import LimitsSettings from "./pages/LimitsSettings";
import Settings from "./pages/Settings";
import VibrationLog from "./pages/VibrationLog";
import { buildEquipment } from "./vibModel";

const RMS_SHEET = "📥 RMS DATA"; // original `qi`
const SPM_SHEET = "📥 SPM DATA"; // original `bi`

// Top-level app shell: owns every page's data (loaded once via readAll() and
// kept in memory — there's no per-page fetching), routing between the 9
// pages, and every write mutation. Ported from the original bundle's `Um`.
//
// navBridge (only passed when mounted embedded — see src/embed.jsx) is a
// plain JS object, not React state: the embedding shell runs its own
// separate React root (React 19; this app is React 18), so there's no
// single component tree to pass state through in the usual way. Instead:
// this app writes navBridge.navigate = setPage so the outer shell can drive
// it, and calls navBridge.onNavigate(page) so the outer shell's sidebar can
// mirror the active page. Whenever navBridge is present at all, this app
// skips rendering its own Sidebar, since the outer shell renders a unified
// one instead. Standalone builds never pass navBridge, so none of this
// changes anything about how this app runs on its own.
export default function App({ navBridge } = {}) {
  const { themeName } = useTheme();
  const [page, setPage] = useState("dashboard");
  useEffect(() => {
    setCurrentPage(page);
  }, [page]);
  const [graphAsset, setGraphAsset] = useState("");
  // Vibration Log: the report open on the Log tab (null = the timeline).
  const [openReportId, setOpenReportId] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [config, setConfig] = useState(() => configStore.load());
  const [logoUrl, setLogoUrl] = useState(() => configStore.loadLogo());

  const [rms, setRms] = useState([]);
  const [spm, setSpm] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [rmsRegister, setRmsRegister] = useState([]);
  const [spmRegister, setSpmRegister] = useState([]);
  const [lastRms, setLastRms] = useState([]);
  const [lastSpm, setLastSpm] = useState([]);
  const [actions, setActions] = useState([]);
  const [vibPoints, setVibPoints] = useState([]);
  const [thresholdsMap, setThresholdsMap] = useState({});
  const [syncState, setSyncState] = useState({ status: "idle", message: "Not synced yet" });

  // PERFORMANCE: `rms`/`spm` (RMS/SPM DATA — 6,500+/5,700+ rows) are loaded
  // lazily, not as part of the app's first-load fetch — see getStartupBundle's
  // own comment in the backend and loadRmsSpmHistory below. `startupLoaded`
  // gates the lazy fetch so it never races the startup fetch itself against
  // the same Apps Script Web App deployment (which doesn't reliably serve
  // simultaneous GETs — see oil-lubrication's own App.jsx for the same
  // constraint). `rmsSpmLoadedRef`/`loadingHistoryRef` make the lazy loader
  // idempotent: loaded once (by either path) and never refetched just from
  // re-visiting the same page, and never double-fired if already in flight.
  const [startupLoaded, setStartupLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const rmsSpmLoadedRef = useRef(false);
  const loadingHistoryRef = useRef(false);

  // Mirrors of webhookUrl/config kept in refs so async callbacks (sync,
  // per-reading upsert calls) always read the latest value without having
  // to be re-created on every keystroke in Settings — same pattern the
  // original uses (its `M`/`B` refs).
  const webhookRef = useRef(DEFAULT_WEBHOOK_URL);
  useEffect(() => {
    webhookRef.current = webhookUrl;
  }, [webhookUrl]);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    try {
      const loadedConfig = configStore.load();
      setConfig(loadedConfig);
      if (loadedConfig.webhookUrl) setWebhookUrl(loadedConfig.webhookUrl);
      if (loadedConfig.googleSheetUrl) setSheetUrl(loadedConfig.googleSheetUrl);
      setThresholdsMap(loadThresholdOverrides());
      setLogoUrl(configStore.loadLogo() || logoUrl);
    } catch {
      // localStorage unavailable — fall back to in-memory defaults already set above
    }
    const timer = setTimeout(() => loadStartupBundle(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount, mirroring the original's mount-only effect
  }, []);

  useEffect(() => {
    if (!navBridge) return;
    // Clicking the Vibration Log tab again goes back to the timeline.
    navBridge.navigate = (p) => {
      if (p === "log") setOpenReportId(null);
      setPage(p);
    };
    navBridge.onNavigate?.(page);
  });

  const setThreshold = useCallback((equipmentId, value) => {
    setThresholdsMap((prev) => {
      const next = { ...prev };
      if (value === null) delete next[equipmentId];
      else next[equipmentId] = value;
      saveThresholdOverrides(next);
      return next;
    });
  }, []);

  const syncNow = useCallback(async () => {
    const url = configRef.current?.webhookUrl || webhookRef.current;
    if (!url) {
      setSyncState({ status: "error", message: "No webhook URL — go to Settings → Configuration" });
      return;
    }
    setSyncState({ status: "loading", message: "Syncing…" });
    try {
      const data = await readAll(url);
      if (data.error) throw new Error(data.error);
      setRms((data.rms || []).map(rowToRMS));
      setSpm((data.spm || []).map(rowToSPM));
      setCompliance((data.compliance || []).map(rowToCompliance));
      setRmsRegister((data.rmsRegister || []).map(rowToRmsRegister));
      setSpmRegister((data.spmRegister || []).map(rowToSpmRegister));
      setLastRms((data.lastRms || []).map(rowToLastRMS));
      setLastSpm((data.lastSpm || []).map(rowToLastSPM));
      setActions((data.actions || []).map(rowToAction));
      // `vibPoints` comes from the "VIB ID Registry" tab, wired into
      // readAll() via readVibRegistry() (see
      // backend/vibration-analysis/src/VibRegistry.js) — an older webhook
      // that predates this still simply won't have the
      // key, which is fine, everything downstream already treats an empty
      // list as "no VIB IDs available yet" rather than an error.
      setVibPoints((data.vibPoints || []).map(rowToVibPoint));
      if (data.config && typeof data.config === "object") {
        const merged = { ...configRef.current };
        if (data.config.webhookUrl) merged.webhookUrl = data.config.webhookUrl;
        if (data.config.googleSheetUrl) {
          merged.googleSheetUrl = data.config.googleSheetUrl;
          setSheetUrl(data.config.googleSheetUrl);
        }
        if (data.config.contractors) merged.contractors = data.config.contractors;
        setConfig(merged);
      }
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSyncState({ status: "ok", message: `✓ Synced — ${(data.rms || []).length} RMS · ${(data.spm || []).length} SPM — ${time}` });
      // readAll() already included rms/spm above, so the lazy history loader
      // below has nothing left to fetch — mark it done so it doesn't fire a
      // redundant getRmsSpmHistory() call the next time a history page opens.
      rmsSpmLoadedRef.current = true;
      setStartupLoaded(true);
    } catch (err) {
      setSyncState({
        status: "error",
        message: String(err.message || err).includes("timed out")
          ? "Sync timed out — check your webhook URL in Settings"
          : String(err.message || err).slice(0, 80),
      });
    }
  }, []);

  // Lightweight first-load fetch: everything readAll() returns except
  // rms/spm — see getStartupBundle's own comment in the backend. Used only
  // on mount; the "Sync" button keeps calling the full readAll() above.
  const loadStartupBundle = useCallback(async () => {
    const url = configRef.current?.webhookUrl || webhookRef.current;
    if (!url) {
      setSyncState({ status: "error", message: "No webhook URL — go to Settings → Configuration" });
      return;
    }
    setSyncState({ status: "loading", message: "Loading…" });
    try {
      let data = await getStartupBundle(url);
      // RELIABILITY: a deployment that hasn't actually picked up the
      // getStartupBundle/getRmsSpmHistory addition yet (stale Apps Script
      // container, or a redeploy that hasn't fully propagated) answers with
      // {error: "Unknown action: ..."} rather than real data. readAll() is
      // the one action that has existed since before this split and is
      // guaranteed to work on any deployment version, so fall back to it
      // wholesale (including rms/spm, exactly like the Sync button) rather
      // than leaving the user with a permanently empty Dashboard.
      if (data.error && /unknown action/i.test(data.error)) {
        const full = await readAll(url);
        if (full.error) throw new Error(full.error);
        setRms((full.rms || []).map(rowToRMS));
        setSpm((full.spm || []).map(rowToSPM));
        setCompliance((full.compliance || []).map(rowToCompliance));
        setRmsRegister((full.rmsRegister || []).map(rowToRmsRegister));
        setSpmRegister((full.spmRegister || []).map(rowToSpmRegister));
        setLastRms((full.lastRms || []).map(rowToLastRMS));
        setLastSpm((full.lastSpm || []).map(rowToLastSPM));
        setActions((full.actions || []).map(rowToAction));
        setVibPoints((full.vibPoints || []).map(rowToVibPoint));
        if (full.config && typeof full.config === "object") {
          const merged = { ...configRef.current };
          if (full.config.webhookUrl) merged.webhookUrl = full.config.webhookUrl;
          if (full.config.googleSheetUrl) {
            merged.googleSheetUrl = full.config.googleSheetUrl;
            setSheetUrl(full.config.googleSheetUrl);
          }
          if (full.config.contractors) merged.contractors = full.config.contractors;
          setConfig(merged);
        }
        rmsSpmLoadedRef.current = true;
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setSyncState({
          status: "ok",
          message: `✓ Loaded (fallback — redeploy the backend to speed this up) — ${time}`,
        });
        return;
      }
      if (data.error) throw new Error(data.error);
      // RELIABILITY: Apps Script Web Apps can intermittently come back with
      // a valid-but-empty response on the very first hit after a redeploy or
      // idle period (a cold-start quirk, not a real "this spreadsheet has no
      // equipment yet" state) — the identical request has been observed to
      // succeed with real data moments later with no code change. One
      // silent retry (inline, so `finally` below still only fires once the
      // retry itself has settled) covers this so the user never has to
      // notice and click Sync manually to get a second attempt.
      const isEmptyBundle = (d) =>
        (d.compliance || []).length === 0 &&
        (d.rmsRegister || []).length === 0 &&
        (d.spmRegister || []).length === 0 &&
        (d.lastRms || []).length === 0 &&
        (d.lastSpm || []).length === 0;
      if (isEmptyBundle(data)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        data = await getStartupBundle(url);
        if (data.error) throw new Error(data.error);
      }
      setCompliance((data.compliance || []).map(rowToCompliance));
      setRmsRegister((data.rmsRegister || []).map(rowToRmsRegister));
      setSpmRegister((data.spmRegister || []).map(rowToSpmRegister));
      setLastRms((data.lastRms || []).map(rowToLastRMS));
      setLastSpm((data.lastSpm || []).map(rowToLastSPM));
      setActions((data.actions || []).map(rowToAction));
      setVibPoints((data.vibPoints || []).map(rowToVibPoint));
      if (data.config && typeof data.config === "object") {
        const merged = { ...configRef.current };
        if (data.config.webhookUrl) merged.webhookUrl = data.config.webhookUrl;
        if (data.config.googleSheetUrl) {
          merged.googleSheetUrl = data.config.googleSheetUrl;
          setSheetUrl(data.config.googleSheetUrl);
        }
        if (data.config.contractors) merged.contractors = data.config.contractors;
        setConfig(merged);
      }
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSyncState({ status: "ok", message: `✓ Loaded — ${time}` });
    } catch (err) {
      setSyncState({
        status: "error",
        message: String(err.message || err).includes("timed out")
          ? "Sync timed out — check your webhook URL in Settings"
          : String(err.message || err).slice(0, 80),
      });
    } finally {
      setStartupLoaded(true);
    }
  }, []);

  // Fetches rms/spm (the reading history getStartupBundle() leaves out) the
  // first time a page that actually needs it — Graphs Dashboard or
  // Equipment Readings — is opened. Guarded so it only ever runs once
  // (rmsSpmLoadedRef) and never twice concurrently (loadingHistoryRef).
  const loadRmsSpmHistory = useCallback(async () => {
    if (rmsSpmLoadedRef.current || loadingHistoryRef.current) return;
    const url = configRef.current?.webhookUrl || webhookRef.current;
    if (!url) return;
    loadingHistoryRef.current = true;
    setHistoryLoading(true);
    try {
      const data = await getRmsSpmHistory(url);
      if (data.error) throw new Error(data.error);
      setRms((data.rms || []).map(rowToRMS));
      setSpm((data.spm || []).map(rowToSPM));
      rmsSpmLoadedRef.current = true;
    } catch {
      // Leave rmsSpmLoadedRef false so the next visit to a history page
      // retries — same best-effort handling as the rest of this app's reads.
    } finally {
      loadingHistoryRef.current = false;
      setHistoryLoading(false);
    }
  }, []);

  // PERFORMANCE: fetch rms/spm lazily, only the first time the user actually
  // opens a page that needs reading history — never on first mount. Waits
  // for startupLoaded so this never races loadStartupBundle() against the
  // same Apps Script Web App deployment (see this file's rmsSpmLoadedRef
  // comment above for why that matters). Has to sit after loadRmsSpmHistory's
  // own declaration above — referencing it any earlier is a temporal-dead-
  // zone ReferenceError at runtime (same constraint noted below for syncNow).
  useEffect(() => {
    if (!startupLoaded) return;
    if (page !== "graphs" && page !== "registry") return;
    if (rmsSpmLoadedRef.current || loadingHistoryRef.current) return;
    loadRmsSpmHistory();
  }, [page, startupLoaded, loadRmsSpmHistory]);

  // Mirrors apps/oil-analysis's own Patch 35 wiring — lets the shell's own
  // TopBar show this module's Sync button instead of this module
  // rendering a second bar underneath the shell's for it (see
  // frontend/src/components/TopBar.tsx and embeddedNav.tsx's
  // NavBridge.sync/onSyncStateChange). No offline queue/pending-count
  // concept exists in this app (unlike Oil Analysis), so pendingSyncCount
  // is always 0 — the shell's own pending-count badge simply never shows
  // for this module, same effect as not having one. Has to sit after
  // syncNow's own declaration above, not right alongside the other
  // navBridge effect near the top of this component — referencing it any
  // earlier is a temporal-dead-zone ReferenceError at runtime.
  useEffect(() => {
    if (!navBridge) return;
    navBridge.sync = syncNow;
  }, [navBridge, syncNow]);
  useEffect(() => {
    if (!navBridge) return;
    navBridge.onSyncStateChange?.({ syncState: syncState.status, pendingSyncCount: 0 });
  }, [navBridge, syncState.status]);

  const rmsRegMap = useMemo(() => Object.fromEntries(rmsRegister.map((r) => [r.equipmentId, r])), [rmsRegister]);
  const spmRegMap = useMemo(() => Object.fromEntries(spmRegister.map((r) => [r.equipmentId, r])), [spmRegister]);
  const registryMap = useMemo(() => {
    const map = {};
    rmsRegister.forEach((r) => (map[r.equipmentId] = { ...map[r.equipmentId], ...r }));
    spmRegister.forEach((r) => (map[r.equipmentId] = { ...map[r.equipmentId], ...r }));
    return map;
  }, [rmsRegister, spmRegister]);
  const registryList = useMemo(() => Object.values(registryMap).sort((a, b) => a.equipmentId.localeCompare(b.equipmentId)), [registryMap]);

  // equipmentId|point|family -> vibId, per vibPointKey() in domain.js. Empty
  // whenever the current webhook has no VIB Point Map tab (production,
  // today) — every consumer treats a missing key as "no VIB ID yet", not
  // an error.
  const vibIdMap = useMemo(() => {
    const map = {};
    vibPoints.forEach((vp) => {
      if (vp.vibId) map[vibPointKey(vp.equipmentId, vp.description, vp.family)] = vp.vibId;
    });
    return map;
  }, [vibPoints]);

  // Equipment → scope, limits and VIB IDs, shared by the redesigned pages.
  const scopeEquipment = useMemo(() => buildEquipment(vibPoints, rmsRegister, spmRegister), [vibPoints, rmsRegister, spmRegister]);

  const actionCounts = useMemo(
    () => ({
      open: actions.filter((a) => a.actionStatus === "Open").length,
      alertEquip: compliance.filter((c) => classifyComplianceStatus(c.last) === "Alert").length,
    }),
    [actions, compliance]
  );

  const nextSeq = (list) => {
    let max = 0;
    list.forEach((r) => {
      const n = parseInt(r.seq, 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  };

  // Called right after a new/updated RMS reading is saved — recomputes its
  // status and pushes an upsertLastRMS write so the Dashboard's "current
  // status" reflects it without a full re-sync. Ported from the original's
  // `vn`.
  const applyLastRms = useCallback(
    (reading) => {
      const thresholds = resolveThresholds(thresholdsMap, reading.equipmentId, rmsRegMap, spmRegMap);
      const status = rmsStatus(reading.maxVel, thresholds);
      setLastRms((prev) => [
        ...prev.filter((r) => !(r.equipmentId === reading.equipmentId && r.point === reading.point)),
        { ...reading, _id: `LRMS|${reading.equipmentId}|${reading.point}`, readingStatus: status, machineStatus: "" },
      ]);
      const url = configRef.current?.webhookUrl || webhookRef.current;
      const reg = registryMap[reading.equipmentId] || {};
      upsertLastRMS(url, {
        equipmentId: reading.equipmentId,
        equipmentName: reading.equipmentName || reg.equipment || "",
        line: reg.line || "",
        point: reading.point,
        date: reading.date,
        axial: reading.axial ?? "",
        horizontal: reading.horizontal ?? "",
        vertical: reading.vertical ?? "",
        maxVelocity: reading.maxVel ?? "",
        readingStatus: status,
      });
    },
    [thresholdsMap, rmsRegMap, spmRegMap, registryMap]
  );

  const applyLastSpm = useCallback(
    (reading) => {
      const thresholds = resolveThresholds(thresholdsMap, reading.equipmentId, rmsRegMap, spmRegMap);
      const status = spmStatus(reading.hdm, thresholds);
      const spmType = (spmRegMap[reading.equipmentId] || {}).spmType || "";
      setLastSpm((prev) => [
        ...prev.filter((r) => !(r.equipmentId === reading.equipmentId && r.point === reading.point)),
        { ...reading, _id: `LSPM|${reading.equipmentId}|${reading.point}`, spmType, readingStatus: status, machineStatus: "" },
      ]);
      const url = configRef.current?.webhookUrl || webhookRef.current;
      const reg = registryMap[reading.equipmentId] || {};
      upsertLastSPM(url, {
        equipmentId: reading.equipmentId,
        equipmentName: reading.equipmentName || reg.equipment || "",
        line: reg.line || "",
        point: reading.point,
        spmType,
        date: reading.date,
        hdm: reading.hdm ?? "",
        hdc: reading.hdc ?? "",
        gs: reading.gs ?? "",
        readingStatus: status,
      });
    },
    [thresholdsMap, rmsRegMap, spmRegMap, registryMap]
  );

  // Full CRUD for RMS DATA / SPM DATA rows, each keeping the Last Reading
  // sheets and the Dashboard's in-memory status in sync as a side effect.
  // Ported from the original's `Vr`.
  const mutations = useMemo(
    () => ({
      addRMS: (reading) => {
        const seq = nextSeq(rms);
        const vibId = vibIdMap[vibPointKey(reading.equipmentId, reading.point, "RMS")] || "";
        const record = { ...reading, seq, vibId, _id: `RMS|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setRms((prev) => [...prev, record]);
        const url = configRef.current?.webhookUrl || webhookRef.current;
        appendRow(url, RMS_SHEET, rmsToRow(record), RMS_HEADERS);
        applyLastRms(record);
      },
      updateRMS: (reading) => {
        const vibId = vibIdMap[vibPointKey(reading.equipmentId, reading.point, "RMS")] || reading.vibId || "";
        const record = { ...reading, vibId, _id: `RMS|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setRms((prev) => prev.map((r) => (r._id === reading._id ? record : r)));
        const url = configRef.current?.webhookUrl || webhookRef.current;
        updateRow(url, RMS_SHEET, reading._matchCols, reading._matchValues, rmsToRow(record));
        applyLastRms(record);
      },
      deleteRMS: (reading) => {
        setRms((prev) => prev.filter((r) => r._id !== reading._id));
        const url = configRef.current?.webhookUrl || webhookRef.current;
        deleteRow(url, RMS_SHEET, reading._matchCols, reading._matchValues);
        const remaining = rms.filter((r) => r._id !== reading._id && r.equipmentId === reading.equipmentId && r.point === reading.point);
        if (remaining.length === 0) {
          setLastRms((prev) => prev.filter((r) => !(r.equipmentId === reading.equipmentId && r.point === reading.point)));
          deleteLastRMS(url, reading.equipmentId, reading.point);
        } else {
          applyLastRms(remaining.sort((a, b) => (b.date > a.date ? 1 : -1))[0]);
        }
      },
      addSPM: (reading) => {
        const seq = nextSeq(spm);
        const vibId = vibIdMap[vibPointKey(reading.equipmentId, reading.point, "SPM")] || "";
        const record = { ...reading, seq, vibId, type: "SPM", _id: `SPM|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setSpm((prev) => [...prev, record]);
        const url = configRef.current?.webhookUrl || webhookRef.current;
        appendRow(url, SPM_SHEET, spmToRow(record), SPM_HEADERS);
        applyLastSpm(record);
      },
      updateSPM: (reading) => {
        const vibId = vibIdMap[vibPointKey(reading.equipmentId, reading.point, "SPM")] || reading.vibId || "";
        const record = { ...reading, vibId, _id: `SPM|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setSpm((prev) => prev.map((r) => (r._id === reading._id ? record : r)));
        const url = configRef.current?.webhookUrl || webhookRef.current;
        updateRow(url, SPM_SHEET, reading._matchCols, reading._matchValues, spmToRow(record));
        applyLastSpm(record);
      },
      deleteSPM: (reading) => {
        setSpm((prev) => prev.filter((r) => r._id !== reading._id));
        const url = configRef.current?.webhookUrl || webhookRef.current;
        deleteRow(url, SPM_SHEET, reading._matchCols, reading._matchValues);
        const remaining = spm.filter((r) => r._id !== reading._id && r.equipmentId === reading.equipmentId && r.point === reading.point);
        if (remaining.length === 0) {
          setLastSpm((prev) => prev.filter((r) => !(r.equipmentId === reading.equipmentId && r.point === reading.point)));
          deleteLastSPM(url, reading.equipmentId, reading.point);
        } else {
          applyLastSpm(remaining.sort((a, b) => (b.date > a.date ? 1 : -1))[0]);
        }
      },
    }),
    [rms, spm, applyLastRms, applyLastSpm, vibIdMap]
  );

  let content;
  if (page === "log") {
    content = <VibrationLog webhookUrl={webhookUrl} openReportId={openReportId} setOpenReportId={setOpenReportId} scopeEquipment={scopeEquipment} />;
  } else if (page === "dashboard") {
    content = (
      <Dashboard
        lastRms={lastRms}
        lastSpm={lastSpm}
        registryMap={registryMap}
        rmsRegMap={rmsRegMap}
        spmRegMap={spmRegMap}
        thresholdsMap={thresholdsMap}
        setPage={setPage}
        setGraphAsset={setGraphAsset}
        syncState={syncState}
      />
    );
  } else if (page === "newreading") {
    content = (
      <NewReading
        registryList={registryList}
        rmsRegMap={rmsRegMap}
        spmRegMap={spmRegMap}
        thresholdsMap={thresholdsMap}
        mutations={mutations}
        webhookUrl={webhookUrl}
        compliance={compliance}
        setCompliance={setCompliance}
        vibIdMap={vibIdMap}
      />
    );
  } else if (page === "equipreg") {
    content = (
      <EquipmentRegister
        rmsRegister={rmsRegister}
        spmRegister={spmRegister}
        registryList={registryList}
        webhookUrl={webhookUrl}
        setRmsRegister={setRmsRegister}
        setSpmRegister={setSpmRegister}
        vibIdMap={vibIdMap}
      />
    );
  } else if (page === "registry") {
    content = (
      <EquipmentReadings
        registryList={registryList}
        rms={rms}
        spm={spm}
        rmsRegMap={rmsRegMap}
        spmRegMap={spmRegMap}
        thresholdsMap={thresholdsMap}
        mutations={mutations}
        historyLoading={historyLoading}
      />
    );
  } else if (page === "graphs") {
    content = (
      <GraphsDashboard
        registryList={registryList}
        rms={rms}
        spm={spm}
        graphAsset={graphAsset}
        setGraphAsset={setGraphAsset}
        thresholdsMap={thresholdsMap}
        rmsRegMap={rmsRegMap}
        spmRegMap={spmRegMap}
        historyLoading={historyLoading}
      />
    );
  } else if (page === "compliance") {
    content = <ComplianceTracker compliance={compliance} lastRms={lastRms} lastSpm={lastSpm} registryMap={registryMap} />;
  } else if (page === "actions") {
    content = (
      <ActionTracker
        actions={actions}
        setActions={setActions}
        registryList={registryList}
        registryMap={registryMap}
        lastRms={lastRms}
        lastSpm={lastSpm}
        webhookUrl={webhookUrl}
        config={config}
      />
    );
  } else if (page === "limits") {
    content = (
      <LimitsSettings
        registryList={registryList}
        thresholdsMap={thresholdsMap}
        setThresholds={setThreshold}
        rmsRegMap={rmsRegMap}
        spmRegMap={spmRegMap}
        webhookUrl={webhookUrl}
      />
    );
  } else if (page === "settings") {
    content = (
      <Settings
        webhookUrl={webhookUrl}
        setWebhookUrl={setWebhookUrl}
        sheetUrl={sheetUrl}
        setSheetUrl={setSheetUrl}
        themeName={themeName}
        onSync={syncNow}
        config={config}
        setConfig={setConfig}
        syncState={syncState}
        webhookRef={webhookRef}
      />
    );
  }

  return (
    <div style={{ minHeight: "100%" }}>
      {/*
        Sidebar.jsx/TopBar.jsx already wire up mobileOpen state, the
        app-sidebar "open" class, the sidebar-overlay backdrop, and the
        hamburger-btn toggle button -- but no @media rule anywhere ever
        made the hamburger visible or the sidebar collapse, so on a narrow
        screen the sidebar just sat fixed at 232px forever, eating most of
        the viewport. Mirrors apps/oil-analysis's own 860px breakpoint for
        consistency between the two sibling apps.
      */}
      <style>{`
        .hamburger-btn { display: none; }
        .sidebar-overlay { display: none; }

        @media (max-width: 860px) {
          .app-sidebar {
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }
          .app-sidebar.open { transform: translateX(0); }
          .hamburger-btn { display: inline-flex !important; }
          .sidebar-overlay.show {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 40;
          }
          .app-main { margin-left: 0 !important; }
        }
      `}</style>
      {!navBridge && (
        <Sidebar
          page={page}
          setPage={setPage}
          syncState={syncState}
          onSync={syncNow}
          actionCounts={actionCounts}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          logoUrl={logoUrl}
        />
      )}
      {!navBridge && (
        <div className={`sidebar-overlay${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />
      )}
      <div className="app-main" style={{ marginLeft: navBridge ? 0 : 232 }}>
        <TopBar
          title={PAGE_TITLES[page]}
          sheetUrl={sheetUrl}
          onSync={syncNow}
          syncState={syncState}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          navBridge={navBridge}
        />
        {content}
      </div>
    </div>
  );
}

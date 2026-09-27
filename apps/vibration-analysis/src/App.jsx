import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendRow, deleteLastRMS, deleteLastSPM, deleteRow, readAll, updateRow, upsertLastRMS, upsertLastSPM } from "./api";
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

const RMS_SHEET = "📥 RMS DATA"; // original `qi`
const SPM_SHEET = "📥 SPM DATA"; // original `bi`

// Top-level app shell: owns every page's data (loaded once via readAll() and
// kept in memory — there's no per-page fetching), routing between the 9
// pages, and every write mutation. Ported from the original bundle's `Um`.
export default function App() {
  const { themeName } = useTheme();
  const [page, setPage] = useState("dashboard");
  const [graphAsset, setGraphAsset] = useState("");
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
    const timer = setTimeout(() => syncNow(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount, mirroring the original's mount-only effect
  }, []);

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
      // `vibPoints` only exists on webhooks that have the sandbox's
      // "🔗 VIB Point Map" tab wired into their readAll() (Code.v2.gs) —
      // production's response simply won't have this key, which is fine,
      // everything downstream already treats an empty list as "no VIB IDs
      // available yet" rather than an error.
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
    } catch (err) {
      setSyncState({
        status: "error",
        message: String(err.message || err).includes("timed out")
          ? "Sync timed out — check your webhook URL in Settings"
          : String(err.message || err).slice(0, 80),
      });
    }
  }, []);

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
        gear: reading.gear ?? "",
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
        const record = { ...reading, seq, _id: `RMS|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setRms((prev) => [...prev, record]);
        const url = configRef.current?.webhookUrl || webhookRef.current;
        appendRow(url, RMS_SHEET, rmsToRow(record), RMS_HEADERS);
        applyLastRms(record);
      },
      updateRMS: (reading) => {
        const record = { ...reading, _id: `RMS|${reading.equipmentId}|${reading.point}|${reading.date}` };
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
        const record = { ...reading, seq, type: "SPM", _id: `SPM|${reading.equipmentId}|${reading.point}|${reading.date}` };
        setSpm((prev) => [...prev, record]);
        const url = configRef.current?.webhookUrl || webhookRef.current;
        appendRow(url, SPM_SHEET, spmToRow(record), SPM_HEADERS);
        applyLastSpm(record);
      },
      updateSPM: (reading) => {
        const record = { ...reading, _id: `SPM|${reading.equipmentId}|${reading.point}|${reading.date}` };
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
    [rms, spm, applyLastRms, applyLastSpm]
  );

  let content;
  if (page === "dashboard") {
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
        logoUrl={logoUrl}
        setLogoUrl={setLogoUrl}
        config={config}
        setConfig={setConfig}
        syncState={syncState}
        webhookRef={webhookRef}
      />
    );
  }

  return (
    <div style={{ minHeight: "100%" }}>
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
      <div className={`sidebar-overlay${mobileOpen ? " show" : ""}`} onClick={() => setMobileOpen(false)} />
      <div className="app-main" style={{ marginLeft: 232 }}>
        <TopBar
          title={PAGE_TITLES[page]}
          sheetUrl={sheetUrl}
          onSync={syncNow}
          syncState={syncState}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        {content}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getStartupBundle,
  readAll,
  getVibLimits,
  setCurrentPage,
} from "./api";
import { configStore, DEFAULT_WEBHOOK_URL, loadThresholdOverrides } from "./config";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { classifyComplianceStatus, vibPointKey } from "./domain";
import { PAGE_TITLES } from "./navigation";
import {
  rowToAction,
  rowToCompliance,
  rowToLastRMS,
  rowToLastSPM,
  rowToRmsRegister,
  rowToSpmRegister,
  rowToVibPoint,
} from "./parsers";
import { useTheme } from "./ThemeContext";

import Dashboard from "./pages/Dashboard";
import EquipmentRegister from "./pages/EquipmentRegister";
import ComplianceTracker from "./pages/ComplianceTracker";
import ActionTracker from "./pages/ActionTracker";
import Settings from "./pages/Settings";
import VibrationLog from "./pages/VibrationLog";
import VibEquipment from "./pages/VibEquipment";
import VibTrends from "./pages/VibTrends";
import VibLimits from "./pages/VibLimits";
import { buildEquipment } from "./vibModel";


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
  // Vibration Log: the report open on the Log tab (null = the timeline).
  const [openReportId, setOpenReportId] = useState(null);
  // Equipment: the machine open on the Equipment tab (null = the list).
  const [selectedEq, setSelectedEq] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [config, setConfig] = useState(() => configStore.load());
  const [logoUrl, setLogoUrl] = useState(() => configStore.loadLogo());

  const [compliance, setCompliance] = useState([]);
  const [rmsRegister, setRmsRegister] = useState([]);
  const [spmRegister, setSpmRegister] = useState([]);
  const [lastRms, setLastRms] = useState([]);
  const [lastSpm, setLastSpm] = useState([]);
  const [actions, setActions] = useState([]);
  const [vibPoints, setVibPoints] = useState([]);
  // Own limits, intervals and Active / Inactive (backend Limits.js).
  const [vibLimits, setVibLimits] = useState(null);
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
    const timer = setTimeout(() => loadStartupBundle(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount, mirroring the original's mount-only effect
  }, []);

  useEffect(() => {
    if (!navBridge) return;
    // Clicking the Vibration Log tab again goes back to the timeline.
    navBridge.navigate = (p) => {
      if (p === "log") setOpenReportId(null);
      if (p === "equipment") setSelectedEq(null);
      // old page ids from bookmarks / links
      setPage({ registry: "equipment", graphs: "trends" }[p] || p);
    };
    navBridge.onNavigate?.(page);
  });


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
      // after the bundle, never alongside it (one request at a time)
      getVibLimits(url)
        .then(setVibLimits)
        .catch(() => {});
    } catch (err) {
      setSyncState({
        status: "error",
        message: String(err.message || err).includes("timed out")
          ? "Sync timed out — check your webhook URL in Settings"
          : String(err.message || err).slice(0, 80),
      });
    }
  }, []);

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
  const scopeEquipment = useMemo(() => buildEquipment(vibPoints, rmsRegister, spmRegister, vibLimits), [vibPoints, rmsRegister, spmRegister, vibLimits]);
  const reloadLimits = useCallback(async () => {
    const url = configRef.current?.webhookUrl || webhookRef.current;
    const d = await getVibLimits(url);
    setVibLimits(d);
    return d;
  }, []);

  const actionCounts = useMemo(
    () => ({
      open: actions.filter((a) => a.actionStatus === "Open").length,
      alertEquip: compliance.filter((c) => classifyComplianceStatus(c.last) === "Alert").length,
    }),
    [actions, compliance]
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
        setPage={(p) => setPage({ graphs: "equipment", registry: "equipment" }[p] || p)}
        setGraphAsset={(id) => setSelectedEq(id || null)}
        syncState={syncState}
      />
    );
  } else if (page === "equipment" || page === "newreading") {
    content = (
      <VibEquipment
        key={page}
        webhookUrl={webhookUrl}
        scopeEquipment={scopeEquipment}
        selectedEq={page === "equipment" ? selectedEq : null}
        setSelectedEq={(id) => {
          setSelectedEq(id);
          if (page !== "equipment") setPage("equipment");
        }}
        startAdding={page === "newreading"}
        onAddClosed={() => page === "newreading" && setPage("equipment")}
        onOpenReport={(id) => {
          setOpenReportId(id);
          setPage("log");
        }}
      />
    );
  } else if (page === "trends") {
    content = <VibTrends webhookUrl={webhookUrl} scopeEquipment={scopeEquipment} />;
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
    content = <VibLimits webhookUrl={webhookUrl} limits={vibLimits} reload={reloadLimits} scopeEquipment={scopeEquipment} />;
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

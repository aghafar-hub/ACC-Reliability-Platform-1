import { useEffect, useState, useCallback, useMemo } from "react";
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
import Reports from "./pages/Reports";
import SampleTracker from "./pages/SampleTracker";
import HowToUse from "./pages/HowToUse";
import Settings from "./pages/Settings";
import { loadConfig, saveConfig, readCache, writeCache } from "./config";
import { loadEquipmentRegistry } from "./equipmentRegistry";
import { loadActionRegistry } from "./actionRegistry";
import { parseTrackerRows, overlaySamplesOnTracker } from "./parsers";
import * as api from "./api";

let toastId = 0;

export default function App() {
  const [config, setConfig] = useState(() => loadConfig());
  return (
    <ThemeProvider themeName={config.themeName || DEFAULT_THEME}>
      <AppShell config={config} setConfig={setConfig} />
    </ThemeProvider>
  );
}

function AppShell({ config, setConfig }) {
  const { T } = useTheme();
  const [page, setPage] = useState("dashboard");
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [reportOrigin, setReportOrigin] = useState("dashboard"); // where "Back" on the Oil Analysis Report returns to
  const [equipmentSelectedCode, setEquipmentSelectedCode] = useState(""); // sticky so Equipment restores the same equipment after Back
  const [oilReportCode, setOilReportCode] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [samples, setSamples] = useState(() => readCache("samples")?.data || []);
  const [actions, setActions] = useState(() => readCache("actions")?.data || []);
  const [oilChanges, setOilChanges] = useState(() => readCache("oilChanges")?.data || []);
  const [trackerRaw, setTrackerRaw] = useState(() => readCache("trackerRaw")?.data || []);
  const [equipmentRegistry, setEquipmentRegistry] = useState(() => loadEquipmentRegistry());
  const [actionRegistry, setActionRegistry] = useState(() => loadActionRegistry());
  const [syncState, setSyncState] = useState("idle");
  const [syncMsg, setSyncMsg] = useState("");
  const [toasts, setToasts] = useState([]);

  // The tracker sheet only reflects samples added through this app (or
  // manually kept in sync by hand); Data_Entry is always current, since
  // every sample lands there regardless of how it was entered. Overlaying
  // samples on top of the sheet's parsed history means every tracker
  // consumer (Sample Tracker page, Reports, Oil Report Search) shows the
  // real current state even when the sheet itself has drifted.
  const trackerByEquip = useMemo(() => overlaySamplesOnTracker(parseTrackerRows(trackerRaw), samples), [trackerRaw, samples]);

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
    try {
      const { samples: sm, actions: ac, oilChanges: oc, trackerRaw: tr } = await api.readAll(config.webhookUrl);
      setSamples(sm);
      setActions(ac);
      setOilChanges(oc);
      setTrackerRaw(tr);
      writeCache("samples", sm);
      writeCache("actions", ac);
      writeCache("oilChanges", oc);
      writeCache("trackerRaw", tr);
      setSyncMsg(`Synced — ${sm.length} samples · ${ac.length} actions · ${oc.length} oil changes — ${new Date().toLocaleTimeString()}`);
      setSyncState("idle");
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message}`);
      setSyncState("error");
      pushToast(`Sync failed: ${err.message}`, "error");
    }
  }, [config.webhookUrl, pushToast]);

  useEffect(() => {
    if (config.webhookUrl) runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.webhookUrl]);

  useEffect(() => {
    if (!config.enableAutoSync || !config.webhookUrl) return;
    const minutes = Number(config.autoSyncMinutes) || 5;
    const id = setInterval(runSync, minutes * 60 * 1000);
    return () => clearInterval(id);
  }, [config.enableAutoSync, config.autoSyncMinutes, config.webhookUrl, runSync]);

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
        const saved = await api.saveOilChange(config.webhookUrl, { ...action._oilChangeTarget, changeDate: action.lastChange });
        setOilChanges((prev) => {
          const next = prev.map((o) => (o._id === action._oilChangeTarget._id ? saved : o));
          writeCache("oilChanges", next);
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
      try {
        const saved = await api.saveAction(config.webhookUrl, action, { isNew: true });
        setActions((prev) => {
          const next = [...prev, saved];
          writeCache("actions", next);
          return next;
        });
        pushToast("Action added.", "success");
        await applyOilChangeSideEffect(action);
      } catch (err) {
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast, applyOilChangeSideEffect]
  );

  const onUpdateAction = useCallback(
    async (action) => {
      try {
        const saved = await api.saveAction(config.webhookUrl, action, { isNew: false });
        setActions((prev) => {
          const next = prev.map((a) =>
            a._matchValues?.[0] === action._matchValues?.[0] && a._matchValues?.[1] === action._matchValues?.[1] ? saved : a
          );
          writeCache("actions", next);
          return next;
        });
        pushToast("Action saved.", "success");
        await applyOilChangeSideEffect(action);
      } catch (err) {
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast, applyOilChangeSideEffect]
  );

  const onDeleteAction = useCallback(
    async (action) => {
      try {
        await api.deleteAction(config.webhookUrl, action);
        setActions((prev) => {
          const next = prev.filter((a) => a._id !== action._id);
          writeCache("actions", next);
          return next;
        });
        pushToast("Action deleted.", "success");
      } catch (err) {
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onSaveOilChange = useCallback(
    async (oilChange) => {
      try {
        const saved = await api.saveOilChange(config.webhookUrl, oilChange);
        setOilChanges((prev) => {
          const next = prev.map((o) => (o._id === oilChange._id ? saved : o));
          writeCache("oilChanges", next);
          return next;
        });
        pushToast("Oil change saved.", "success");
      } catch (err) {
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onAddSample = useCallback(
    async (sample, headers) => {
      try {
        const saved = await api.saveSample(config.webhookUrl, sample, headers);
        setSamples((prev) => {
          const next = [...prev, saved];
          writeCache("samples", next);
          return next;
        });
        pushToast("Sample saved.", "success");
        await applySampleTrackerSideEffect(saved);
        return saved;
      } catch (err) {
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

  const onEditSample = useCallback(
    async (original, updates) => {
      try {
        const saved = await api.updateSample(config.webhookUrl, { ...original, ...updates });
        setSamples((prev) => {
          const next = prev.map((s2) => (s2._id === original._id ? saved : s2));
          writeCache("samples", next);
          return next;
        });
        pushToast("Sample saved.", "success");
      } catch (err) {
        pushToast(err.message, "error");
        throw err;
      }
    },
    [config.webhookUrl, pushToast]
  );

  const onDeleteSample = useCallback(
    async (sample) => {
      try {
        await api.deleteSample(config.webhookUrl, sample);
        setSamples((prev) => {
          const next = prev.filter((s2) => s2._id !== sample._id);
          writeCache("samples", next);
          return next;
        });
        pushToast("Sample deleted.", "success");
      } catch (err) {
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

  function navigate(nextPage) {
    if (nextPage !== "equipment") setSelectedEquipment(null);
    setPage(nextPage);
    setMobileNavOpen(false);
  }

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
        />
      </div>
      <div className={`sidebar-backdrop${mobileNavOpen ? " open" : ""}`} onClick={() => setMobileNavOpen(false)} />
      <div className="app-main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopBar
          page={page}
          sample={selectedEquipment}
          sheetUrl={config.sheetUrl}
          syncState={syncState}
          onSync={runSync}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onBack={() => navigate(reportOrigin === "equipment" ? "equipment" : "dashboard")}
        />
        <div className="app-content" style={{ flex: 1, overflowY: "auto", padding: 24, background: T.appBg }}>
          {page === "dashboard" && (
            <Dashboard
              samples={samples}
              actions={actions}
              oilChanges={oilChanges}
              equipmentRegistry={equipmentRegistry}
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
          {page === "reports" && (
            <Reports actions={actions} oilChanges={oilChanges} equipmentRegistry={equipmentRegistry} trackerByEquip={trackerByEquip} />
          )}
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
            />
          )}
        </div>
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

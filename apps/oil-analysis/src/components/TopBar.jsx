import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";

const PAGE_TITLES = {
  dashboard: "Oil Dashboard",
  equipment: "Oil Equipment",
  oilreport: "Oil Analysis Report",
  upload: "Add Sample",
  actions: "Action Tracker",
  oilchange: "Oil Change Log",
  reports: "Oil Reports",
  tracker: "Oil Sample Tracker",
  howto: "How to Use",
  settings: "Settings",
};

function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// Persistent bar shown at the top of every page when this app runs
// STANDALONE (the retired, login-free deployment — see App.jsx's navBridge
// comment). When embedded in the platform shell (navBridge present,
// production's only real path), the shell's own TopBar is the only
// always-visible bar — Patch 35 ("make it one"): this app used to render
// its own full title/online/date/sync bar underneath the shell's, which
// read as two stacked top bars on every single page. Its Online status,
// pending-sync badge, and Sync button moved to the shell's own TopBar
// (module-aware — see frontend/src/components/TopBar.tsx and
// embeddedNav.tsx's NavBridge.sync/onSyncStateChange); the Sheet link was
// dropped entirely (not moved anywhere), confirmed directly by the user.
// The one piece kept here even when embedded is the Report page's own
// "Back" button — contextual, single-page navigation the shell has no
// way to know about, not a duplicate of anything the shell itself shows.
export default function TopBar({ page, sample, navBridge, syncState, onSync, onOpenMobileNav, onBack, pendingSyncCount }) {
  const { T, s } = useTheme();
  const online = useOnlineStatus();
  const title = page === "report" && sample ? `Report: ${sample.unitId}` : PAGE_TITLES[page] || "";

  if (navBridge) {
    if (page !== "report") return null;
    return (
      <div style={{ ...s.topbar, justifyContent: "flex-start" }} className="app-topbar">
        <button style={{ ...s.btn, padding: "6px 12px" }} onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
      </div>
    );
  }

  return (
    <div style={s.topbar} className="app-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="mobile-menu-btn" style={{ ...s.btn, padding: "6px 10px", display: "none" }} onClick={onOpenMobileNav}>
          <i className="ti ti-menu-2" aria-hidden="true" />
        </button>
        {page === "report" && (
          <button style={{ ...s.btn, padding: "6px 12px" }} onClick={onBack}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back
          </button>
        )}
        <span className="app-topbar-title" style={{ fontSize: 16, fontWeight: 700, color: T.sidebarText }}>
          {title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pendingSyncCount > 0 && (
          <span
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.warning, fontWeight: 600 }}
            title="Saved on this device — will upload automatically once there's a connection"
          >
            <i className="ti ti-cloud-upload" aria-hidden="true" />
            <span>
              {pendingSyncCount} {pendingSyncCount === 1 ? "entry" : "entries"} pending
            </span>
          </span>
        )}
        <span
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: online ? T.success : T.danger }}
          title={online ? "Browser is online" : "Browser is offline — changes will sync once reconnected"}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: online ? T.success : T.danger, flexShrink: 0 }} />
          <span className="topbar-date">{online ? "Online" : "Offline"}</span>
        </span>
        <span className="topbar-date" style={{ fontSize: 12, color: T.sidebarTextSecondary }}>
          {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
        </span>
        <button style={{ ...s.btn, fontSize: 12 }} onClick={onSync} disabled={syncState === "loading"}>
          <i
            className={`ti ${syncState === "loading" ? "ti-loader" : "ti-refresh"}`}
            style={{ animation: syncState === "loading" ? "spin 1s linear infinite" : "none" }}
            aria-hidden="true"
          />
          {syncState === "loading" ? " …" : " Sync"}
        </button>
      </div>
    </div>
  );
}

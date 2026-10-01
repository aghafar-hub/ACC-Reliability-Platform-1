import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";

const PAGE_TITLES = {
  dashboard: "Dashboard",
  equipment: "Equipment",
  oilreport: "Oil Analysis Report",
  upload: "Add Sample",
  actions: "Action Tracker",
  oilchange: "Oil Change Log",
  reports: "Reports",
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

// Persistent bar shown at the top of every page — matches the original app's
// layout exactly (title, online/offline indicator, date, Sheet link, Sync
// button), including the mobile menu button living inside it rather than in
// a separate mobile-only header.
export default function TopBar({ page, sample, sheetUrl, syncState, onSync, onOpenMobileNav, onBack, pendingSyncCount }) {
  const { T, s } = useTheme();
  const online = useOnlineStatus();
  const title = page === "report" && sample ? `Report: ${sample.unitId}` : PAGE_TITLES[page] || "";

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
        <span className="app-topbar-title" style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>
          {title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pendingSyncCount > 0 && (
          // Patch 11 — this is the one place guaranteed to render whether
          // this app is running standalone or embedded in the platform
          // shell (the embedded build skips its own Sidebar entirely, see
          // App.jsx's navBridge comment, so a Sidebar-only badge would
          // never be seen there at all).
          <span
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.warning, fontWeight: 600 }}
            title="Saved on this device — will upload automatically once there's a connection"
          >
            <i className="ti ti-cloud-upload" aria-hidden="true" />
            <span>
              {pendingSyncCount} {pendingSyncCount === 1 ? "entry" : "entries"} pending
            </span>
          </span>
        )}
        <span
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: online ? T.success : T.danger }}
          title={online ? "Browser is online" : "Browser is offline — changes will sync once reconnected"}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: online ? T.success : T.danger, flexShrink: 0 }} />
          <span className="topbar-date">{online ? "Online" : "Offline"}</span>
        </span>
        <span className="topbar-date" style={{ fontSize: 12, color: T.textSecondary }}>
          {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
        </span>
        {sheetUrl && (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.btn, textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <i className="ti ti-table" aria-hidden="true" /> Sheet
          </a>
        )}
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

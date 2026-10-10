import { useTheme } from "../ThemeContext";
import logo from "../assets/arabian-cement-logo.png";

// Nav id/label/icon list ported verbatim from the original app's own `mh`
// array — do not reorder or relabel without re-checking the original.
const NAV = [
  { id: "dashboard", label: "Oil Dashboard", icon: "ti-layout-dashboard" },
  { id: "equipment", label: "Oil Equipment", icon: "ti-engine" },
  { id: "routines", label: "Routines", icon: "ti-route" },
  { id: "oilreport", label: "Oil Analysis Report", icon: "ti-file-analytics" },
  { id: "upload", label: "Add Sample", icon: "ti-plus" },
  { id: "actions", label: "Action Tracker", icon: "ti-checklist" },
  { id: "oilchange", label: "Oil Change Log", icon: "ti-oil" },
  { id: "tracker", label: "Sample Tracker", icon: "ti-timeline" },
  { id: "inventory", label: "Oil Inventory", icon: "ti-package" },
  { id: "reports", label: "Oil Reports", icon: "ti-report" },
  { id: "team", label: "Team Workload", icon: "ti-users-group" },
  { id: "howto", label: "How to Use", icon: "ti-help-circle" },
  { id: "settings", label: "Settings", icon: "ti-settings" },
];

export default function Sidebar({
  page,
  onNavigate,
  alertCount,
  openActionsCount,
  syncState,
  syncMsg,
  logoUrl,
  hasCache,
  cacheAgeMinutes,
  onFullSync,
  onQuickSync,
  pendingSyncCount,
}) {
  const { T, s } = useTheme();
  const dotColor = syncState === "loading" ? T.accent : syncState === "error" ? T.danger : T.success;

  return (
    <>
      <div style={{ padding: "18px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 6 }}>
          <img
            src={logoUrl || logo}
            alt="Arabian Cement Logo"
            style={{ width: 188, height: "auto", objectFit: "contain", flexShrink: 0 }}
          />
        </div>
        <p style={{ fontSize: 12, color: "#4A6A8A", margin: 0, letterSpacing: 0.8, textTransform: "uppercase" }}>Oil Analysis Management</p>
      </div>
      <nav style={s.nav}>
        {NAV.map((item) => {
          const active = page === item.id || (page === "report" && item.id === "equipment");
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-current={active ? "page" : undefined}
              style={s.navItem(active)}
              onClick={() => {
                onNavigate(item.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate(item.id);
                }
              }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 17 }} aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === "dashboard" && alertCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: T.danger,
                    color: "#fff",
                    borderRadius: 20,
                    padding: "1px 7px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {alertCount}
                </span>
              )}
              {item.id === "actions" && openActionsCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: T.warning,
                    color: T.appBg,
                    borderRadius: 20,
                    padding: "1px 7px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {openActionsCount}
                </span>
              )}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1E3A5F" }}>
        {pendingSyncCount > 0 && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
            title="Saved on this device — will upload automatically once there's a connection"
          >
            <i className="ti ti-cloud-upload" style={{ fontSize: 12, color: T.warning }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: T.warning, fontWeight: 600 }}>
              {pendingSyncCount} {pendingSyncCount === 1 ? "entry" : "entries"} waiting to sync
            </span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background: dotColor,
              animation: syncState === "loading" ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 12, color: "#6B8CAE", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {syncMsg || "Sheets connected"}
          </span>
        </div>
        {hasCache && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <i className="ti ti-database" style={{ fontSize: 12, color: "#4A6A8A" }} aria-hidden="true" />
            <span style={{ fontSize: 12, color: "#4A6A8A" }}>
              {syncState === "loading" ? "Refreshing from sheet…" : `Cached data · ${Math.round(cacheAgeMinutes)}m old`}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={{ ...s.btnPrimary, flex: 1, fontSize: 12, padding: "7px 10px", opacity: syncState === "loading" ? 0.7 : 1 }}
            onClick={onFullSync}
            disabled={syncState === "loading"}
            title="Full Sync — re-reads every sheet"
          >
            <i
              className={`ti ${syncState === "loading" ? "ti-loader" : "ti-refresh"}`}
              style={{ animation: syncState === "loading" ? "spin 1s linear infinite" : "none" }}
              aria-hidden="true"
            />
            {syncState === "loading" ? " Syncing…" : " Full Sync"}
          </button>
          <button
            style={{ ...s.btn, fontSize: 12, padding: "7px 10px" }}
            onClick={onQuickSync}
            disabled={syncState === "loading"}
            title="Quick Sync — fetches only records changed since last sync (fast). Falls back to Full Sync if needed."
          >
            <i className="ti ti-bolt" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}

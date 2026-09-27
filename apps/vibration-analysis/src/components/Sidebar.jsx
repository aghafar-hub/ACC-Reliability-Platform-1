import { useTheme } from "../ThemeContext";
import { toDriveDirectUrl, DEFAULT_LOGO_URL } from "../config";
import { NAV_ITEMS } from "../navigation";
import Icon from "./Icon";
import { CountBadge } from "./StatusBadge";
import { ICONS } from "./icons";

export default function Sidebar({ page, setPage, syncState, onSync, actionCounts, mobileOpen, setMobileOpen, logoUrl }) {
  const { T } = useTheme();
  const dotColor = { ok: T.success, loading: T.info, error: T.danger, idle: T.textMuted }[syncState.status];

  return (
    <div
      className={`app-sidebar${mobileOpen ? " open" : ""}`}
      style={{
        width: 232,
        background: T.sidebarBg,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, background: T.sidebarBg }}>
        <img
          src={toDriveDirectUrl(logoUrl || DEFAULT_LOGO_URL)}
          alt="Arabian Cement"
          style={{ width: "100%", maxWidth: 190, display: "block", objectFit: "contain", maxHeight: 52 }}
          onError={(e) => {
            e.target.src = DEFAULT_LOGO_URL;
          }}
        />
        <div style={{ fontSize: 11.5, color: T.accent, marginTop: 8, fontWeight: 700, letterSpacing: 0.3 }}>
          Vibration & Condition Monitoring
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.key}
            onClick={() => {
              setPage(item.key);
              setMobileOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 8,
              cursor: "pointer",
              marginBottom: 2,
              fontSize: 13,
              fontWeight: 600,
              color: page === item.key ? T.accent : T.textSecondary,
              background: page === item.key ? T.navActive : "transparent",
            }}
          >
            <Icon d={ICONS[item.icon]} size={16} />
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.key === "actions" && actionCounts.open > 0 && <CountBadge color={T.danger}>{actionCounts.open}</CountBadge>}
            {item.key === "compliance" && actionCounts.alertEquip > 0 && (
              <CountBadge color={T.warning}>{actionCounts.alertEquip}</CountBadge>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: dotColor,
              flexShrink: 0,
              boxShadow: syncState.status === "loading" ? `0 0 0 3px ${dotColor}33` : "none",
            }}
          />
          <span style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.3 }}>{syncState.message}</span>
        </div>
        <button
          onClick={onSync}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "transparent",
            color: T.textPrimary,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Icon d={ICONS.sync} size={14} /> Sync Now
        </button>
      </div>
    </div>
  );
}

import { useTheme } from "../ThemeContext";
import Icon from "./Icon";
import { ICONS } from "./icons";

// Sticky top bar: page title, today's date, "Sheet" link (opens the
// configured Google Sheet URL), Sync button, and mobile hamburger — ported
// from the original's `wm`. Like the original, this only needs the setter
// half of the mobile-sidebar toggle (the hamburger button's onClick), not
// the current open/closed state itself.
export default function TopBar({ title, sheetUrl, onSync, syncState, setMobileOpen }) {
  const { T, s } = useTheme();
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div
      style={{
        height: 60,
        background: T.topbarBg,
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px 0 20px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <button
          className="hamburger-btn"
          onClick={() => setMobileOpen((v) => !v)}
          style={{ ...s.btnSecondary, padding: "6px 8px", display: "none", alignItems: "center", justifyContent: "center" }}
        >
          <Icon d={ICONS.hamburger} size={18} />
        </button>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: T.textHighlight,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: T.textSecondary }}>{today}</span>
        {sheetUrl && (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noreferrer"
            style={{ ...s.btnSecondary, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
          >
            <Icon d={ICONS.external} size={13} /> Sheet
          </a>
        )}
        <button
          onClick={onSync}
          style={{ ...s.btn, display: "flex", alignItems: "center", gap: 6 }}
          disabled={syncState.status === "loading"}
        >
          <Icon d={ICONS.sync} size={13} /> {syncState.status === "loading" ? "Syncing…" : "Sync"}
        </button>
      </div>
    </div>
  );
}

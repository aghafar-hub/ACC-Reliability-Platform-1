import { useTheme } from "../ThemeContext";
import Icon from "./Icon";
import { ICONS } from "./icons";

// Sticky top bar: page title, today's date, "Sheet" link (opens the
// configured Google Sheet URL), Sync button, and mobile hamburger — ported
// from the original's `wm`. Like the original, this only needs the setter
// half of the mobile-sidebar toggle (the hamburger button's onClick), not
// the current open/closed state itself.
//
// When embedded (navBridge set — production's only real path), the shell's
// own TopBar is the only persistent bar: this app used to render its own
// full title/date/Sheet/Sync bar underneath the shell's, on every page,
// the same duplicate-bar issue apps/oil-analysis had before its own Patch
// 35 fix, reported directly by the user for this module too. This app has
// no page with its own Back-button/contextual-nav need the way Oil
// Analysis's Report page does, so unlike that app's TopBar there's no
// exception here — embedded means render nothing at all. Online/offline
// and Sync moved to the shell's own TopBar (module-aware — see
// frontend/src/components/TopBar.tsx and embeddedNav.tsx's
// NavBridge.sync/onSyncStateChange, wired in App.jsx); the Sheet link was
// dropped entirely rather than relocated, matching the same call already
// made for Oil Analysis.
export default function TopBar({ title, sheetUrl, onSync, syncState, setMobileOpen, navBridge }) {
  const { T, s } = useTheme();
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  if (navBridge) return null;

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
            // T.textHighlight is tuned for the light cardBg -- for "ACC
            // Corporate" it's literally identical to topbarBg (#0B2340 both),
            // making this title 100% invisible. sidebarText is this app's
            // counterpart tuned for the dark topbarBg/sidebarBg surface.
            color: T.sidebarText,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: T.sidebarTextSecondary }}>{today}</span>
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

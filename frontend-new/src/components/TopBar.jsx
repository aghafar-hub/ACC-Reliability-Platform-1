import { useState, useRef, useEffect } from "react";
import { T } from "../theme";

// Real TopBar content, left to right (confirmed against every real
// screenshot in docs/visual-reference): breadcrumb, "● Online" status,
// "↻ Sync" button, "EN / عربي" language toggle, notification bell (opens a
// panel), settings gear, account avatar+email+role (opens a panel with
// Settings/Sign out). Sync/bell/gear/language are visual stubs for this
// phase, per the user's explicit "stubs are fine" instruction — only
// Sign out is wired to real logout.
function IconButton({ icon, onClick, title, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: `1px solid ${T.border}`,
        background: active ? T.navActive : T.cardBg,
        color: T.textSecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
    </button>
  );
}

export default function TopBar({ breadcrumb, user, onLogout }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setNotifOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const email = user?.email || "";
  const initials = email ? email.slice(0, 2).toUpperCase() : "?";
  const roleLabel = (user?.roles?.[0] || "").toUpperCase().replace(/\s+/g, "-") || "ROLE";

  return (
    <div
      ref={rootRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 24px",
        borderBottom: `1px solid ${T.border}`,
        background: T.topbarBg,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
        {breadcrumb.parent && (
          <>
            {breadcrumb.parent} <span style={{ color: T.textMuted, fontWeight: 400 }}>/</span>{" "}
          </>
        )}
        <span style={{ color: breadcrumb.parent ? T.textMuted : T.textPrimary, fontWeight: breadcrumb.parent ? 400 : 700 }}>
          {breadcrumb.page}
        </span>
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.success, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.success, display: "inline-block" }} />
          Online
        </span>

        <button
          type="button"
          onClick={() => {}}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            color: T.textPrimary,
            borderRadius: 6,
            padding: "7px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <i className="ti ti-refresh" aria-hidden="true" /> Sync
        </button>

        <div
          style={{
            display: "inline-flex",
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            overflow: "hidden",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span style={{ padding: "7px 10px", background: T.cardBg, color: T.textPrimary }}>EN</span>
          <span style={{ padding: "7px 2px", color: T.textMuted }}>/</span>
          <span style={{ padding: "7px 10px", background: T.cardBg, color: T.textMuted }}>عربي</span>
        </div>

        <div style={{ position: "relative" }}>
          <IconButton
            icon="ti-bell"
            active={notifOpen}
            title="Notifications"
            onClick={() => {
              setNotifOpen((v) => !v);
              setAccountOpen(false);
            }}
          />
          {notifOpen && (
            <div
              style={{
                position: "absolute",
                top: 42,
                right: 0,
                width: 260,
                background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15,30,45,0.12)",
                zIndex: 200,
              }}
            >
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border2}`, fontWeight: 700, fontSize: 13, color: T.textPrimary }}>
                Notifications
              </div>
              <div style={{ padding: "18px 14px", textAlign: "center", color: T.textMuted, fontSize: 12.5 }}>No notifications yet.</div>
            </div>
          )}
        </div>

        <IconButton icon="ti-settings" title="Settings" onClick={() => {}} />

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setAccountOpen((v) => !v);
              setNotifOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: T.accent,
                color: T.accentText,
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <span style={{ textAlign: "left", lineHeight: 1.2 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {email}
              </div>
              <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 0.4 }}>{roleLabel}</div>
            </span>
            <i className={`ti ti-chevron-${accountOpen ? "up" : "down"}`} style={{ fontSize: 13, color: T.textMuted }} aria-hidden="true" />
          </button>
          {accountOpen && (
            <div
              style={{
                position: "absolute",
                top: 44,
                right: 0,
                width: 160,
                background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15,30,45,0.12)",
                zIndex: 200,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: T.textPrimary, textAlign: "left" }}
              >
                <i className="ti ti-settings" aria-hidden="true" /> Settings
              </button>
              <button
                type="button"
                onClick={onLogout}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderTop: `1px solid ${T.border2}`, cursor: "pointer", fontSize: 13, color: T.textPrimary, textAlign: "left" }}
              >
                <i className="ti ti-logout" aria-hidden="true" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

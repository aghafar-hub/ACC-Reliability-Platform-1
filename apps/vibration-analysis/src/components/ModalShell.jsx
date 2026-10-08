import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";

// The one frame every form popup uses (design D5): a header with an icon,
// title, a short subtitle and optional status pill; a scrolling body; and
// a footer that stays in view with the buttons. On a phone it fills the
// screen like a sheet. Esc or the ✕ closes it. Drawn on <body> so the
// shade covers the whole app (top bar and tabs too).
export default function ModalShell({ icon, title, subtitle, badge, headerExtra, onClose, footer, width = 780, testid, children }) {
  const { T } = useTheme();
  const isMobile = useIsMobile();
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      style={{
        position: "fixed",
        fontFamily: "'IBM Plex Sans', 'Segoe UI', Roboto, sans-serif",
        inset: 0,
        background: "rgba(8, 15, 28, 0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        data-testid={testid}
        style={{
          background: T.cardBg,
          border: isMobile ? 0 : `1px solid ${T.border}`,
          borderRadius: isMobile ? 0 : 14,
          width: "100%",
          maxWidth: isMobile ? "100%" : width,
          maxHeight: isMobile ? "100%" : "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 18px 48px rgba(8, 15, 28, 0.28)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: isMobile ? "14px 16px" : "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          {icon && (
            <span
              aria-hidden="true"
              style={{ width: 38, height: 38, borderRadius: 10, background: T.accent + "1A", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}
            >
              <i className={`ti ti-${icon}`} />
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.textPrimary }}>{title}</span>
              {badge}
            </div>
            {subtitle && <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ border: `1px solid ${T.border}`, background: "none", color: T.textSecondary, borderRadius: 8, width: 34, height: 34, cursor: "pointer", flexShrink: 0, fontSize: 16 }}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 16px" : "18px 22px", background: T.appBg }}>{children}</div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: isMobile ? "12px 16px calc(12px + env(safe-area-inset-bottom))" : "14px 22px",
              borderTop: `1px solid ${T.border}`,
              background: T.cardBg,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// A titled block inside a form popup: number/icon, title, optional hint.
export function FormSection({ icon, title, hint, right, children, testid, style }) {
  const { T } = useTheme();
  return (
    <section
      data-testid={testid}
      style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14, ...style }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {icon && <i className={`ti ti-${icon}`} aria-hidden="true" style={{ color: T.accent, fontSize: 16 }} />}
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.textPrimary }}>{title}</span>
        {hint && <span style={{ fontSize: 12, color: T.textSecondary }}>{hint}</span>}
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

// A value the user can see but not type (worked out, or locked).
export function ReadValue({ label, children, hint, testid }) {
  const { T } = useTheme();
  return (
    <div data-testid={testid}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.textPrimary, minHeight: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", background: T.cardSubBg, borderRadius: 8, border: `1px dashed ${T.border}` }}>
        {children}
      </div>
      {hint && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

// The workflow as steps, the current one filled (e.g. Draft → Open → …).
export function StepTrail({ steps, current, testid }) {
  const { T } = useTheme();
  const at = steps.indexOf(current);
  return (
    <ol data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 6, listStyle: "none", padding: "0 0 2px", margin: "0 0 14px", overflowX: "auto", whiteSpace: "nowrap" }}>
      {steps.map((st, i) => {
        const done = at > i;
        const now = at === i;
        return (
          <li key={st} style={{ display: "flex", alignItems: "center", gap: 6 }} aria-current={now ? "step" : undefined}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: now ? 700 : 500,
                background: now ? T.accent : done ? T.accent + "1A" : T.cardBg,
                color: now ? "#fff" : done ? T.accent : T.textSecondary,
                border: `1px solid ${now || done ? T.accent : T.border}`,
              }}
            >
              {done && <i className="ti ti-check" aria-hidden="true" />}
              {st}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" style={{ width: 14, height: 2, background: done ? T.accent : T.border, borderRadius: 2 }} />}
          </li>
        );
      })}
    </ol>
  );
}

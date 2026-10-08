import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../ThemeContext";
import useBackClose from "../hooks/useBackClose";

// Phone bottom sheet (mobile app design M2): filters, pickers and short
// choices slide up from the bottom, within thumb reach. Grab bar, title,
// optional hint, scrolling body and a footer that stays in view (e.g.
// Reset · Show 611 equipment). Back / Esc / tapping the shade closes it.
export default function BottomSheet({ open, title, hint, onClose, footer, testid, children }) {
  const { T } = useTheme();
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, height: "var(--app-vh, 100%)", zIndex: 1000, fontFamily: "'IBM Plex Sans', 'Segoe UI', Roboto, sans-serif" }}>
      <div onClick={onClose} aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(8, 15, 28, 0.45)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testid}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "88%",
          display: "flex",
          flexDirection: "column",
          background: T.cardBg,
          color: T.textPrimary,
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.2)",
          animation: "accSheetIn .18s ease-out",
        }}
      >
        <style>{`@keyframes accSheetIn{from{transform:translateY(24px);opacity:.6}}@media (prefers-reduced-motion: reduce){[role=dialog]{animation:none!important}}`}</style>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: T.border, margin: "8px auto 6px" }} />
        <div style={{ padding: "4px 18px 8px" }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          {hint && <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 2 }}>{hint}</div>}
        </div>
        <div style={{ overflowY: "auto", padding: "4px 18px 12px", flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ display: "flex", gap: 10, padding: "10px 18px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.border}` }}>{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

// A titled group of choices inside a sheet.
export function SheetGroup({ label, children }) {
  const { T } = useTheme();
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

// Round choice chip (design reference §6), sized for thumbs.
export function SheetChip({ on, onClick, children, testid }) {
  const { T } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-testid={testid}
      style={{
        minHeight: 38,
        padding: "0 14px",
        borderRadius: 999,
        border: `1px solid ${on ? T.accent : T.border}`,
        background: on ? T.accent : T.cardBg,
        color: on ? T.accentText : T.textSecondary,
        fontWeight: 600,
        fontSize: 13.5,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Footer button of a sheet (Reset · Show N …): full height for thumbs.
export function SheetButton({ primary, onClick, children, testid, grow = 1 }) {
  const { T } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      style={{
        flex: grow,
        minHeight: 46,
        borderRadius: 10,
        fontFamily: "inherit",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        border: `1px solid ${primary ? T.accent : T.border}`,
        background: primary ? T.accent : T.cardBg,
        color: primary ? T.accentText : T.textPrimary,
      }}
    >
      {children}
    </button>
  );
}

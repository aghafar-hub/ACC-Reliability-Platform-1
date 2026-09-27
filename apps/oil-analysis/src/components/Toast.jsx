import { useTheme } from "../ThemeContext";

// Simple stacked toast notifications. Used to surface save failures instead
// of the original app's silent no-cors write with no feedback at all.
export default function Toast({ toasts, onDismiss }) {
  const { T } = useTheme();
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            background: t.type === "error" ? T.dangerBg : t.type === "success" ? T.successBg : T.infoBarBg,
            border: `1px solid ${t.type === "error" ? T.danger : t.type === "success" ? T.success : T.border}`,
            color: T.textPrimary,
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

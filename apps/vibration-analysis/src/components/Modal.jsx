import { useTheme } from "../ThemeContext";

// Generic centered modal shell used by every dialog/edit form in the app —
// ported from the original's `Mt`.
export default function Modal({ title, onClose, children, width = 520 }) {
  const { T, s } = useTheme();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          ...s.card,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.textHighlight }}>{title}</div>
          <button onClick={onClose} style={{ ...s.btnSecondary, padding: "4px 10px", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

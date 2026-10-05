// "ACC Corporate" palette ported from apps/oil-analysis/src/theme.js.
// IMPORTANT: this is the theme actually active in the live deployed app
// (confirmed via docs/visual-reference screenshots — Settings > Appearance
// shows it selected, and Settings > System > App Info prints
// "Theme: ACC Corporate" as text) — NOT "Navy Dark", which is only the
// code's DEFAULT_THEME constant. See docs/visual-reference/NOTES.md.
export const T = {
  appBg: "#F4F6F9",
  sidebarBg: "#0B2340",
  cardBg: "#FFFFFF",
  topbarBg: "#FFFFFF", // the real topbar strip is white/light, full width — only the left sidebar column is navy (see NOTES.md)
  border: "#D7DEE8",
  border2: "#E6EBF2",
  inputBg: "#FFFFFF",
  metricBg: "#FFFFFF",
  textPrimary: "#0F1E2D",
  textSecondary: "#5B6B7F",
  sidebarText: "#E8F0F8",
  sidebarTextSecondary: "#8CA3BE",
  textMuted: "#8796A8",
  textHighlight: "#0B2340",
  textSubtle: "#3D4C5E",
  accent: "#2563EB",
  accentText: "#FFFFFF",
  navActive: "rgba(37,99,235,0.08)",
  danger: "#DC2626",
  warning: "#D97706",
  success: "#16A34A",
  info: "#0891B2",
  dangerBg: "#FDEAEA",
  warningBg: "#FDF3E3",
  successBg: "#E8F8EE",
};

// Same shared style-object shapes as the old app's buildStyles(T), only the
// subset this Phase 1 build actually uses.
export const s = {
  nav: { flex: 1, padding: "12px 0", overflowY: "auto" },
  // Real app's active nav item is a SOLID filled block (not a subtle tint +
  // left border like apps/oil-analysis/src/theme.js's dark-theme styling) —
  // confirmed across every sidebar screenshot in docs/visual-reference.
  navItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 20px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? "#FFFFFF" : T.sidebarTextSecondary,
    background: active ? T.accent : "transparent",
    transition: "all 0.15s",
  }),
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    borderBottom: `1px solid ${T.border}`,
    position: "sticky",
    top: 0,
    background: T.topbarBg,
    zIndex: 100,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: T.textPrimary,
    margin: "0 0 16px",
  },
  metricCard: {
    background: T.metricBg,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: "12px 14px",
  },
  card: {
    background: T.cardBg,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  cardSubBg: T.appBg,
  select: {
    background: T.inputBg,
    border: `1px solid ${T.border}`,
    color: T.textPrimary,
    borderRadius: 6,
    padding: "8px 10px",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    background: T.inputBg,
    border: `1px solid ${T.border}`,
    color: T.textPrimary,
    borderRadius: 6,
    padding: "10px 12px",
    boxSizing: "border-box",
    fontSize: 13,
  },
  label: {
    display: "block",
    color: T.textSecondary,
    marginBottom: 4,
    fontSize: 12,
  },
  btnPrimary: {
    background: T.accent,
    border: "none",
    color: T.accentText,
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
};

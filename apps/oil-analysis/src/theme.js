// The platform's five themes (design system, D1): three light (ACC Light —
// the default —, Warm Paper, High Contrast) and two dark (Navy Dark, Carbon
// Dark). The same five are defined in the shell (frontend/src/theme.ts) and
// the other module, generated from one list so they never drift. Only
// surfaces and text change between themes: danger / warning / success always
// mean Alert / Caution / Normal, accent is the one action colour (buttons,
// links), and every text/background pair meets WCAG AA (4.5:1).
export const THEMES = {
  "ACC Light": {
    appBg: "#F3F5F8",
    sidebarBg: "#0B1B2E",
    cardBg: "#FFFFFF",
    topbarBg: "#FFFFFF",
    border: "#D9E0E8",
    border2: "#E8EDF2",
    inputBg: "#FFFFFF",
    metricBg: "#FFFFFF",
    textPrimary: "#0F1B2D",
    textSecondary: "#4A5A70",
    sidebarText: "#E8F0F8",
    sidebarTextSecondary: "#A9B8CC",
    textMuted: "#5F6D82",
    textHighlight: "#0B1B2E",
    textSubtle: "#3D4B60",
    accent: "#1E5BB8",
    accentText: "#FFFFFF",
    tableHead: "#F5F7FA",
    tableRow: "#FFFFFF",
    tableRowAlt: "#FAFBFC",
    scrollThumb: "#C3CEDC",
    cardSubBg: "#F5F7FA",
    infoBarBg: "#EEF3FA",
    codeBg: "#EEF1F6",
    codeText: "#1E4A8F",
    danger: "#C42B2B",
    warning: "#9A5500",
    success: "#18734A",
    info: "#0E7490",
    dangerBg: "#FBEAEA",
    warningBg: "#FFF3E0",
    successBg: "#E7F5EE",
    navActive: "rgba(30,91,184,0.1)",
    tableHover: "rgba(30,91,184,0.05)",
    pillDanger: "rgba(196,43,43,0.12)",
    pillWarning: "rgba(154,85,0,0.12)",
    pillSuccess: "rgba(24,115,74,0.12)",
    pillInfo: "rgba(14,116,144,0.12)",
  },
  "Warm Paper": {
    appBg: "#F5F1E8",
    sidebarBg: "#2B2620",
    cardBg: "#FFFDF7",
    topbarBg: "#FFFDF7",
    border: "#E2D9C6",
    border2: "#EDE6D8",
    inputBg: "#FFFEFA",
    metricBg: "#FFFDF7",
    textPrimary: "#2A2418",
    textSecondary: "#5A4E3C",
    sidebarText: "#F3ECDD",
    sidebarTextSecondary: "#BFB29A",
    textMuted: "#716553",
    textHighlight: "#1E1A12",
    textSubtle: "#4F4535",
    accent: "#1F58A8",
    accentText: "#FFFFFF",
    tableHead: "#F7F2E7",
    tableRow: "#FFFDF7",
    tableRowAlt: "#FBF7EE",
    scrollThumb: "#D6CBB3",
    cardSubBg: "#F7F2E7",
    infoBarBg: "#F2EDE1",
    codeBg: "#F1EBDD",
    codeText: "#1F4E8F",
    danger: "#B8322A",
    warning: "#995500",
    success: "#1E7346",
    info: "#0E6F86",
    dangerBg: "#F8E6E2",
    warningBg: "#FBEBD2",
    successBg: "#E3F1E6",
    navActive: "rgba(31,88,168,0.1)",
    tableHover: "rgba(31,88,168,0.05)",
    pillDanger: "rgba(184,50,42,0.12)",
    pillWarning: "rgba(153,85,0,0.12)",
    pillSuccess: "rgba(30,115,70,0.12)",
    pillInfo: "rgba(14,111,134,0.12)",
  },
  "High Contrast": {
    appBg: "#FFFFFF",
    sidebarBg: "#000000",
    cardBg: "#FFFFFF",
    topbarBg: "#000000",
    border: "#1A1A1A",
    border2: "#4D4D4D",
    inputBg: "#FFFFFF",
    metricBg: "#FFFFFF",
    textPrimary: "#000000",
    textSecondary: "#1A1A1A",
    sidebarText: "#FFFFFF",
    sidebarTextSecondary: "#E0E0E0",
    textMuted: "#333333",
    textHighlight: "#000000",
    textSubtle: "#1A1A1A",
    accent: "#0A3A8C",
    accentText: "#FFFFFF",
    tableHead: "#EDEDED",
    tableRow: "#FFFFFF",
    tableRowAlt: "#F5F5F5",
    scrollThumb: "#555555",
    cardSubBg: "#F2F2F2",
    infoBarBg: "#EEF2FA",
    codeBg: "#F0F0F0",
    codeText: "#0A3A8C",
    danger: "#A80000",
    warning: "#7A4300",
    success: "#00602E",
    info: "#00546B",
    dangerBg: "#FFE5E5",
    warningBg: "#FFEFD6",
    successBg: "#E0F3E8",
    navActive: "rgba(10,58,140,0.1)",
    tableHover: "rgba(10,58,140,0.05)",
    pillDanger: "rgba(168,0,0,0.12)",
    pillWarning: "rgba(122,67,0,0.12)",
    pillSuccess: "rgba(0,96,46,0.12)",
    pillInfo: "rgba(0,84,107,0.12)",
  },
  "Navy Dark": {
    appBg: "#0A1628",
    sidebarBg: "#0D1E35",
    cardBg: "#0F2138",
    topbarBg: "#0D1E35",
    border: "#1F3A5C",
    border2: "#19304D",
    inputBg: "#0A1628",
    metricBg: "#0F2138",
    textPrimary: "#E8F1FA",
    textSecondary: "#B6C7DA",
    sidebarText: "#E8F1FA",
    sidebarTextSecondary: "#9FB4CB",
    textMuted: "#8AA2BC",
    textHighlight: "#FFFFFF",
    textSubtle: "#C8D6E6",
    accent: "#4C9BFF",
    accentText: "#06142A",
    tableHead: "#0B1A2E",
    tableRow: "#0F2138",
    tableRowAlt: "#0C1C31",
    scrollThumb: "#1F3A5C",
    cardSubBg: "#0B1A2E",
    infoBarBg: "#0C2036",
    codeBg: "#060E1A",
    codeText: "#6BCF9E",
    danger: "#FF6B6B",
    warning: "#F2A541",
    success: "#4CC38A",
    info: "#38BDF8",
    dangerBg: "#3A1A1F",
    warningBg: "#3A2A12",
    successBg: "#10301F",
    navActive: "rgba(76,155,255,0.14)",
    tableHover: "rgba(76,155,255,0.08)",
    pillDanger: "rgba(255,107,107,0.16)",
    pillWarning: "rgba(242,165,65,0.16)",
    pillSuccess: "rgba(76,195,138,0.16)",
    pillInfo: "rgba(56,189,248,0.16)",
  },
  "Carbon Dark": {
    appBg: "#0E0F11",
    sidebarBg: "#141619",
    cardBg: "#17191C",
    topbarBg: "#141619",
    border: "#2A2E33",
    border2: "#22262A",
    inputBg: "#101114",
    metricBg: "#17191C",
    textPrimary: "#ECEDEE",
    textSecondary: "#BFC3C8",
    sidebarText: "#ECEDEE",
    sidebarTextSecondary: "#A4AAB1",
    textMuted: "#8E949B",
    textHighlight: "#FFFFFF",
    textSubtle: "#D0D3D7",
    accent: "#5B9BFF",
    accentText: "#0B1424",
    tableHead: "#121417",
    tableRow: "#17191C",
    tableRowAlt: "#141619",
    scrollThumb: "#3A3F45",
    cardSubBg: "#121417",
    infoBarBg: "#151A22",
    codeBg: "#0B0C0E",
    codeText: "#7EE2A8",
    danger: "#FF6B6B",
    warning: "#F2A541",
    success: "#4CC38A",
    info: "#38BDF8",
    dangerBg: "#3A1A1C",
    warningBg: "#3A2A12",
    successBg: "#10301F",
    navActive: "rgba(91,155,255,0.14)",
    tableHover: "rgba(91,155,255,0.08)",
    pillDanger: "rgba(255,107,107,0.16)",
    pillWarning: "rgba(242,165,65,0.16)",
    pillSuccess: "rgba(76,195,138,0.16)",
    pillInfo: "rgba(56,189,248,0.16)",
  },
};

export const LEGACY_THEME_NAMES = {
  "Midnight Blue": "Navy Dark",
  "Forest Green": "Navy Dark",
  "Vivid Spectrum": "Navy Dark",
  "Slate Light": "ACC Light",
  "Pearl White": "ACC Light",
  "Sky Blue": "ACC Light",
  "Mint Fresh": "ACC Light",
  "ACC Corporate": "ACC Light",
  "Vivid Spectrum Light": "ACC Light",
  "Warm Sand": "Warm Paper",
  "Rose Light": "Warm Paper",
};

export const DEFAULT_THEME = "ACC Light";
export const THEME_NAMES = Object.keys(THEMES);

// A stored theme name from before the five-theme set (e.g. "ACC Corporate",
// "Rose Light") maps to its nearest new theme — light to light, dark to dark.
export function resolveThemeName(name) {
  if (name && THEMES[name]) return name;
  if (name && LEGACY_THEME_NAMES[name]) return LEGACY_THEME_NAMES[name];
  return DEFAULT_THEME;
}


// Backward-compatible static export — the app's default theme's colors, for
// any code that hasn't been converted to useTheme() yet. Prefer useTheme().
export const T = THEMES[DEFAULT_THEME];

// Builds the shared style-object helpers for a given palette. Called once
// per theme change (see ThemeContext) rather than being a static object, so
// every style updates when the user switches themes.
export function buildStyles(T) {
  return {
    nav: { flex: 1, padding: "12px 0", overflowY: "auto" },
    navItem: (active) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 20px",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      // Sidebar's own background is always T.sidebarBg, which for the
      // "ACC Corporate" theme is dark while textSecondary is tuned for the
      // light cardBg -- sidebarTextSecondary is the counterpart tuned for
      // this surface instead (see the sidebarText/sidebarTextSecondary
      // entries added to THEMES above).
      color: active ? T.accent : T.sidebarTextSecondary,
      background: active ? T.navActive : "transparent",
      borderLeft: active ? `3px solid ${T.accent}` : "3px solid transparent",
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
      fontFamily: "'Space Grotesk','IBM Plex Sans',sans-serif",
      fontSize: 22,
      fontWeight: 700,
      color: T.textPrimary,
      margin: "0 0 16px",
    },
    metricCard: {
      background: T.metricBg,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: "12px 14px",
    },
    infoBar: {
      background: T.infoBarBg,
      border: `1px solid ${T.border2}`,
      borderRadius: 8,
      padding: "10px 14px",
    },
    select: {
      background: T.inputBg,
      border: `1px solid ${T.border}`,
      color: T.textPrimary,
      borderRadius: 6,
      padding: "8px 10px",
      cursor: "pointer",
    },
    card: {
      background: T.cardBg,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 20,
      marginBottom: 20,
    },
    btn: {
      background: T.cardSubBg,
      border: `1px solid ${T.border}`,
      color: T.textPrimary,
      borderRadius: 6,
      padding: "8px 14px",
      fontSize: 13,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    },
    btnPrimary: {
      background: T.accent,
      border: "none",
      color: T.accentText,
      borderRadius: 6,
      padding: "8px 14px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    },
    input: {
      width: "100%",
      background: T.inputBg,
      border: `1px solid ${T.border}`,
      color: T.textPrimary,
      borderRadius: 6,
      padding: "8px 10px",
      boxSizing: "border-box",
    },
    label: {
      display: "block",
      color: T.textSecondary,
      marginBottom: 4,
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
    },
    th: {
      textAlign: "left",
      padding: "8px 10px",
      borderBottom: `1px solid ${T.border}`,
      color: T.textSecondary,
      fontWeight: 600,
    },
    td: {
      padding: "8px 10px",
      borderBottom: `1px solid ${T.border}`,
      color: T.textPrimary,
    },
    alertPulse: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: T.danger,
      display: "inline-block",
      animation: "pulse 1.5s ease-in-out infinite",
    },
    badge(value) {
      const map = {
        Alert: T.danger,
        ALERT: T.danger,
        Caution: T.warning,
        CAUTION: T.warning,
        Warning: T.warning,
        Normal: T.success,
        NORMAL: T.success,
        Satisfactory: T.success,
        SATISFACTORY: T.success,
        Unsatisfactory: T.danger,
        UNSATISFACTORY: T.danger,
        "OIL CHANGED": T.accent,
        "Oil Changed": T.accent,
        MISSING: T.textMuted,
        Unassigned: T.danger,
        Assigned: T.textMuted,
        InProgress: T.warning,
        Submitted: T.accent,
        Approved: T.success,
        // Phase 1 route statuses (old names above kept for older data).
        Draft: T.danger,
        "In Progress": T.warning,
        "Waiting Approval": T.accent,
        Confirmed: T.success,
        Returned: T.danger,
        "Closure Requested": T.info,
        // Phase 4 — lab report review
        "Pending Validation": T.warning,
        Validated: T.success,
        Overdue: T.danger,
        Active: T.success,
        Paused: T.textMuted,
        Cancelled: T.danger,
        // Patch 9 — Audit Log action types (Activity.jsx).
        create: T.success,
        update: T.accent,
        delete: T.danger,
        // Patch 12 — flagged the same alarming color as "delete", since
        // it means the app's own rules (RBAC, conflict detection,
        // contractor scoping, …) were bypassed entirely for this change.
        "direct-edit": T.danger,
      };
      const color = map[value] || T.textSecondary;
      return {
        background: color + "22",
        color,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
      };
    },
  };
}

// Static default — used by the (now legacy) `s` export for anything not yet
// migrated to useTheme(). Prefer useTheme().
export const s = buildStyles(T);

export const RATING_OPTIONS = ["Normal", "Caution", "Alert"];

export function statusColor(T, status) {
  if (status === "Alert") return T.danger;
  if (status === "Caution" || status === "Warning") return T.warning;
  if (status === "Normal") return T.success;
  return T.textSecondary;
}

// Oil Sample Tracker's single-letter month chip (N/C/A/M/S/U/P) — shared by
// the Sample Tracker page and any condensed per-equipment tracker strip so
// both read the same cell text the same way.
export function trackerStatusChip(status) {
  const d = String(status || "")
    .trim()
    .toUpperCase();
  if (d.startsWith("NORM") || d === "N") return { label: "N", color: "#2DC653" };
  if (d.startsWith("CAUTI") || d.startsWith("WARN") || d === "C" || d === "W") return { label: "C", color: "#F4A261" };
  if (d.startsWith("ALERT") || d === "A") return { label: "A", color: "#E63946" };
  if (d.startsWith("MISSI") || d === "M") return { label: "M", color: "#6B8CAE" };
  // Written when a Sampling routine gets approved (RoutineDetail's
  // handleApprove) — "the sample was collected, lab result not in yet".
  // overlaySamplesOnTracker (parsers.js) already overwrites this with the
  // real result the moment a matching Data_Entry sample exists for the
  // same LP_ID + month, so this never needs to be cleared by hand.
  if (d.startsWith("PEND") || d.startsWith("AWAIT") || d === "P") return { label: "P", color: "#3A86FF" };
  if (d.startsWith("SATIS") || d === "S") return { label: "S", color: "#2DC653" };
  if (d.startsWith("UNSAT") || d === "U") return { label: "U", color: "#E63946" };
  return { label: d[0] || "?", color: "#6B8CAE" };
}

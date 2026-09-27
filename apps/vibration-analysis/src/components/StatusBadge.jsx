import { useTheme } from "../ThemeContext";
import { pillStyle } from "../theme";

// Small colored pill showing a status word — ported from the original's
// `kt` (+ its `Gn` pill-style helper). `colorKey` indexes into the active
// theme (e.g. "success", "warning", "danger", "purple", "info") — see
// domain.js's rmsColorKey/spmColorKey/combinedColorKey for how a status
// word maps to one of these keys.
export default function StatusBadge({ status, colorKey }) {
  const { T } = useTheme();
  const color = T[colorKey] || T.info;
  return <span style={pillStyle(color)}>{status || "—"}</span>;
}

// Small numeric count badge (sidebar nav "Open actions" / "Alert equipment"
// counters) — ported from the original's `Gn` used directly.
export function CountBadge({ color, children }) {
  return <span style={pillStyle(color)}>{children}</span>;
}

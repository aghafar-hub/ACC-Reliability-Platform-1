import { useTheme } from "../ThemeContext";

// Small "N of M done" bar shared by the Routines list and Routine Detail
// header — done/total comes straight from Routines.js's server-side item
// count, no extra fetch needed.
export default function ProgressBar({ done, total, width = 90 }) {
  const { T } = useTheme();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct >= 100 ? T.success : pct > 0 ? T.warning : T.textMuted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width, height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.2s" }} />
      </div>
      <span style={{ fontSize: 11, color: T.textSecondary, whiteSpace: "nowrap" }}>
        {total > 0 ? `${done}/${total} (${pct}%)` : "No items"}
      </span>
    </div>
  );
}

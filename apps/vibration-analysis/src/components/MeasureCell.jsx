import { useTheme } from "../ThemeContext";
import { levelColor } from "../levels";
import { monthLabel, shortDate } from "../vibModel";

// One machine-month of the Measurement Tracker (backend MeasurementTracker.js).
// Measured → the level's colour and symbol (a tick when the old tracker gave
// no level); Missed → red cross; this month still open and overdue → red
// outline; Not due → light; Not running → grey dash. Never colour alone.
const SYMBOL = { Normal: "●", Caution: "▲", Alert: "◆", Danger: "■" };

export const STATE_TONE = (T) => ({ Overdue: T.danger, "Due now": T.warning, "On time": T.success, "Never measured": T.textSecondary, "Not running": T.textSecondary });

export function cellText(c, month) {
  if (!c || !c.r) return `${monthLabel(month)}: no data`;
  const bits = [`${monthLabel(month)}: ${c.r}`];
  if (c.level) bits.push(c.level);
  if (c.first) bits.push(c.first === c.last || !c.last ? shortDate(c.first) : `${shortDate(c.first)} – ${shortDate(c.last)}`);
  if (c.readings) bits.push(`${c.readings} readings`);
  if (c.mark) bits.push(`old tracker: ${c.mark}`);
  return bits.join(" · ");
}

export default function MeasureCell({ c, month, size = 22, onClick }) {
  const { T } = useTheme();
  const r = c?.r || "";
  const base = { width: size, height: size, borderRadius: 5, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, lineHeight: 1, fontWeight: 800 };
  let style, mark;
  if (r === "Measured") {
    const col = c.level ? levelColor(T, c.level) : T.success;
    style = { ...base, background: col, color: "#fff" };
    mark = c.level ? SYMBOL[c.level] : "✓";
  } else if (r === "Missed") {
    style = { ...base, background: T.dangerBg, border: `2px solid ${T.danger}`, color: T.danger };
    mark = "✕";
  } else if (r === "Overdue") {
    style = { ...base, border: `2px dashed ${T.danger}`, color: T.danger };
    mark = "!";
  } else if (r === "Not due") {
    style = { ...base, background: `${T.success}22`, color: T.success };
    mark = "";
  } else if (r === "Not running") {
    style = { ...base, background: `${T.textMuted || T.textSecondary}33`, color: T.textSecondary };
    mark = "–";
  } else {
    style = { ...base, border: `1px solid ${T.border}` };
    mark = "";
  }
  const label = cellText(c, month);
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={label} aria-label={label} style={{ ...style, padding: 0, font: "inherit", fontSize: style.fontSize, cursor: onClick ? "pointer" : "default" }} data-r={r || "none"}>
      {mark}
    </Tag>
  );
}

export function MeasureLegend() {
  const { T } = useTheme();
  const items = [
    [{ r: "Measured", level: "Normal" }, "Measured (colour = level)"],
    [{ r: "Measured" }, "Measured, no level (old tracker)"],
    [{ r: "Missed" }, "Missed"],
    [{ r: "Overdue" }, "Overdue this month"],
    [{ r: "Not due" }, "Not due (inside interval + 7 days)"],
    [{ r: "Not running" }, "Not running"],
  ];
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12.5, color: T.textSecondary }} data-testid="vt-legend">
      {items.map(([c, l]) => (
        <span key={l} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <MeasureCell c={c} month="2026-01" size={16} />
          {l}
        </span>
      ))}
    </div>
  );
}

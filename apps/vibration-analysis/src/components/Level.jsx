import { useTheme } from "../ThemeContext";
import { levelBg, levelColor, levelInk } from "../levels";

// The shape for a level: Normal ●, Caution ▲, Alert ◆, Danger ■ — the same
// symbols the Oil point timeline uses, plus a square for Danger.
export function LevelSymbol({ level, size = 11 }) {
  const { T } = useTheme();
  const c = levelColor(T, level);
  const h = size;
  if (level === "Caution") return <svg width={h + 1} height={h} aria-hidden="true"><path d={`M${(h + 1) / 2} .5 ${h + 0.5} ${h - 0.5}H.5Z`} fill={c} /></svg>;
  if (level === "Alert") return <svg width={h + 1} height={h + 1} aria-hidden="true"><path d={`M${(h + 1) / 2} .5 ${h + 0.5} ${(h + 1) / 2} ${(h + 1) / 2} ${h + 0.5} .5 ${(h + 1) / 2}Z`} fill={c} /></svg>;
  if (level === "Danger") return <svg width={h} height={h} aria-hidden="true"><rect x=".5" y=".5" width={h - 1} height={h - 1} rx="1.5" fill={c} /></svg>;
  if (level === "Normal") return <svg width={h} height={h} aria-hidden="true"><circle cx={h / 2} cy={h / 2} r={h / 2 - 0.5} fill={c} /></svg>;
  return null;
}

// A level as a pill with its symbol. `text` overrides the label (e.g.
// "RMS Alert"); an empty level shows a dash.
export function LevelPill({ level, text, testid }) {
  const { T } = useTheme();
  if (!level) return <span style={{ color: T.textMuted }}>—</span>;
  return (
    <span
      data-testid={testid}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: levelBg(T, level), color: levelInk(T, level) }}
    >
      <LevelSymbol level={level} />
      {text || level}
    </span>
  );
}

// A neutral pill for workflow states (Draft, ACC review, Approved…). `tone`
// is a theme colour; the background is a pale tint of it.
export function StatePill({ tone, children, testid }) {
  const { T } = useTheme();
  const c = tone || T.textSecondary;
  return (
    <span data-testid={testid} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: c + "1A", color: c }}>
      {children}
    </span>
  );
}

import { useTheme } from "../ThemeContext";

// Number tile (design reference §3, Oil's InvTile): icon square, big number,
// label, sub-line; a coloured left border when `tone` marks it as needing
// attention; clickable to the list behind it.
export default function Tile({ icon, label, value, sub, tone, onClick, testid }) {
  const { T, s } = useTheme();
  const Tag = onClick ? "button" : "div";
  const c = tone || T.accent;
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testid}
      style={{ ...s.card, marginBottom: 0, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", width: "100%", boxSizing: "border-box", textAlign: "left", font: "inherit", cursor: onClick ? "pointer" : "default", borderLeft: `3px solid ${tone && tone !== T.accent ? tone : T.border}` }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 10, background: c + "1A", color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
        <i className={`ti ${icon}`} aria-hidden="true" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 22, fontWeight: 800, color: tone || T.textPrimary, lineHeight: 1.15 }}>{value}</span>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: T.textMuted || T.textSecondary }}>{sub}</span>}
      </span>
    </Tag>
  );
}

// The page header every redesigned page starts with: title, live-number
// subtitle, controls on the right.
export function PageHeader({ title, subtitle, right, testid }) {
  const { T, s } = useTheme();
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={s.sectionTitle}>{title}</h1>
        {subtitle && <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{right}</div>}
    </div>
  );
}

// Underlined sub-page tabs with counts (Oil Inventory's TabBar). Buttons,
// not a role="tablist".
export function TabBar({ tabs, value, onChange, testid }) {
  const { T } = useTheme();
  return (
    <div data-testid={testid} style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 14, overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${on ? T.accent : "transparent"}`, color: on ? T.accent : T.textSecondary, fontFamily: "inherit", fontWeight: on ? 700 : 500, padding: "9px 14px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {t.label}
            {t.count != null && <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 7px", borderRadius: 9, background: T.cardSubBg, color: T.textSecondary }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

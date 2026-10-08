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
// subtitle, controls on the right. Same as Oil's pages (Oil Inventory,
// Routines): a <p> title in sectionTitle, 12.5px subtitle. `big` is the
// dashboard size (Oil Dashboard: 26px title, 14px subtitle).
export function PageHeader({ title, subtitle, right, testid, big }) {
  const { T, s } = useTheme();
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ ...s.sectionTitle, margin: 0, ...(big ? { fontSize: 26 } : null) }}>{title}</p>
        {subtitle && <p style={{ fontSize: big ? 14 : 12.5, color: T.textSecondary, margin: big ? "4px 0 0" : "2px 0 0" }}>{subtitle}</p>}
      </div>
      {right && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{right}</div>}
    </div>
  );
}

// Underlined sub-page tabs with counts — the same as Oil Inventory's
// TabBar. Buttons, not a role="tablist".
export function TabBar({ tabs, value, onChange, testid }) {
  const { T } = useTheme();
  return (
    <div role="group" data-testid={testid} style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 14px",
              border: 0,
              borderBottom: `3px solid ${on ? T.accent : "transparent"}`,
              marginBottom: -1,
              background: "none",
              color: on ? T.accent : T.textSecondary,
              fontWeight: on ? 700 : 600,
              fontSize: 13.5,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.icon && <i className={`ti ${t.icon}`} aria-hidden="true" style={{ fontSize: 16 }} />} {t.label}
            {t.count != null && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: t.tone ? t.tone + "1F" : T.cardSubBg, color: t.tone || T.textSecondary }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

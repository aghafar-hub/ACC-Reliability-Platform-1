import { useTheme } from "../ThemeContext";

// Shared phone parts (mobile app design M2–M3), used by every list page so
// they all read the same: a one-line summary that opens the charts, a
// Filters pill that opens a BottomSheet, a sideways row of chips, and a
// "Show more" button for long lists (50 at a time).

export const PAGE_SIZE = 50;

// One-line summary card above a list; tapping it opens the page's charts.
export function PhoneSummary({ open, onToggle, testid, children }) {
  const { T } = useTheme();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={testid}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, padding: "10px 12px", marginBottom: 10, cursor: "pointer", fontFamily: "inherit", color: T.textPrimary, fontSize: 14, minHeight: 48 }}
    >
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{children}</span>
      <span style={{ fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap" }}>{open ? "Hide charts" : "Charts"}</span>
      <i className={`ti ti-chevron-${open ? "up" : "down"}`} aria-hidden="true" style={{ color: T.textSecondary }} />
    </button>
  );
}

// Thin stacked bar for a summary line: [{ value, color }]
export function SummaryBar({ parts }) {
  const { T } = useTheme();
  const total = parts.reduce((n, p) => n + (p.value || 0), 0) || 1;
  return (
    <span aria-hidden="true" style={{ flex: "1 1 80px", height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: T.border }}>
      {parts.map((p, i) => (
        <span key={i} style={{ width: `${((p.value || 0) / total) * 100}%`, background: p.color }} />
      ))}
    </span>
  );
}

// A row of chips that scrolls sideways instead of wrapping onto 3 lines.
export function ChipRow({ children, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 8, scrollbarWidth: "none" }}>
      {children}
    </div>
  );
}

// Round chip with a count (status filters on phone lists).
export function CountChip({ on, onClick, children, count, color, testid }) {
  const { T } = useTheme();
  const ink = color ? T[color] || color : T.textSecondary;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!on}
      data-testid={testid}
      style={{ flex: "0 0 auto", whiteSpace: "nowrap", minHeight: 38, borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accent : T.cardBg, color: on ? T.accentText : T.textSecondary }}
    >
      {children}
      {count != null && <b style={{ marginLeft: 6, color: on ? T.accentText : ink }}>{count}</b>}
    </button>
  );
}

// The "Filters · 2" pill that opens the page's filter sheet.
export function FiltersPill({ count = 0, onClick, testid }) {
  const { T } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      style={{ flex: "0 0 auto", whiteSpace: "nowrap", minHeight: 38, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: count ? T.accentText : T.accent, border: `1px solid ${count ? T.accent : T.accent + "66"}`, background: count ? T.accent : T.accent + "12" }}
    >
      <i className="ti ti-filter" aria-hidden="true" /> Filters{count ? ` · ${count}` : ""}
    </button>
  );
}

// "Show 50 more · 120 left" under a long list.
export function ShowMore({ shown, total, onMore, testid = "show-more" }) {
  const { T } = useTheme();
  if (shown >= total) return null;
  const left = total - shown;
  return (
    <button
      type="button"
      onClick={onMore}
      data-testid={testid}
      style={{ display: "block", width: "100%", minHeight: 46, margin: "4px 0 12px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.cardBg, color: T.accent, fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}
    >
      Show {Math.min(PAGE_SIZE, left)} more · {left} left
    </button>
  );
}

import { useTheme } from "../ThemeContext";

// Mobile-only (see each page's own `isMobile &&` guard around this) —
// Routines/Oil Actions/Oil Change Forecast each stack several rows of
// filter chips above their own content, which on a phone pushed everything
// below the fold on first load (the Patch 35 mobile audit's own finding).
// This toggles that existing filter row's visibility rather than redesigning
// it — the filters themselves are untouched, just collapsed by default on a
// narrow screen and one tap away.
export default function MobileFilterToggle({ open, onToggle, activeCount = 0 }) {
  const { T, s } = useTheme();
  return (
    <button
      type="button"
      style={{
        ...s.btn,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        marginBottom: 10,
        background: activeCount > 0 ? T.accent : "transparent",
        color: activeCount > 0 ? T.accentText : T.textSecondary,
        borderColor: activeCount > 0 ? T.accent : T.border,
      }}
      onClick={onToggle}
    >
      <i className={`ti ${open ? "ti-chevron-up" : "ti-filter"}`} aria-hidden="true" />
      Filters{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

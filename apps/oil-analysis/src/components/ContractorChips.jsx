import { useTheme } from "../ThemeContext";

// The contractor switch used on every page (design reference): round chips
// "All contractors · RHI · ASEC" instead of a dropdown. `value` is "All" or
// a contractor; `options` defaults to the two contractors. Pass
// `allLabel={null}` for a pick-one choice with no "All" (e.g. a new oil
// product's store).
const CONTRACTORS = ["RHI", "ASEC"];

export default function ContractorChips({ value, onChange, options = CONTRACTORS, allLabel = "All contractors", label = "Contractor", testid, size = "md" }) {
  const { T, s } = useTheme();
  // nothing to switch between (e.g. a contractor's own account sees one)
  if (allLabel && options.length < 2) return null;
  const list = allLabel ? ["All", ...options] : options;
  const pad = size === "sm" ? "4px 11px" : "6px 14px";
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid={testid}>
      {list.map((c) => {
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c)}
            style={{
              ...s.btn,
              padding: pad,
              fontSize: 12.5,
              borderRadius: 999,
              borderColor: on ? T.accent : T.border,
              background: on ? T.accent : T.cardBg,
              color: on ? "#fff" : T.textSecondary,
              fontWeight: on ? 700 : 500,
            }}
          >
            {c === "All" ? allLabel : c}
          </button>
        );
      })}
    </div>
  );
}

// A contractor's store / name as a small coloured tag (Location columns).
export function ContractorTag({ name }) {
  const { T } = useTheme();
  if (!name) return <span style={{ color: T.textSecondary }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: T.accent + "14", color: T.accent, whiteSpace: "nowrap" }}>
      <i className="ti ti-building-warehouse" aria-hidden="true" />
      {name}
    </span>
  );
}

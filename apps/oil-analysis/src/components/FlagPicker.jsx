import { useTheme } from "../ThemeContext";
import { LAB_GROUPS, LAB_PARAMS } from "../pointHistory";

// The lab's own marks on a hand-entered report — the yellow (Caution) and
// red (Alert) cells. A PDF import reads these from the cell colours; here
// each value is tapped through none → Caution → Alert → none. They feed
// the Oil Equipment charts (dot colours and limit lines).
const NEXT = { "": "Caution", Caution: "Alert", Alert: "" };
const COLOR = { Caution: "warning", Alert: "danger" };

export default function FlagPicker({ value, onChange }) {
  const { T, s } = useTheme();
  const list = value || [];
  const sevOf = (flag) => {
    const f = list.find((x) => String(x.param).toLowerCase() === flag.toLowerCase());
    const sev = String(f?.severity || "").toLowerCase();
    return sev === "alert" ? "Alert" : sev === "caution" || sev === "warning" ? "Caution" : "";
  };
  function cycle(flag) {
    const next = NEXT[sevOf(flag)];
    const rest = list.filter((x) => String(x.param).toLowerCase() !== flag.toLowerCase());
    onChange(next ? [...rest, { param: flag, severity: next }] : rest);
  }
  return (
    <div data-testid="flag-picker">
      <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "0 0 8px" }}>
        Tap each value the lab marked yellow (Caution) or red (Alert) on the report. Tap again to change, a third time to clear.
      </p>
      {LAB_GROUPS.map((g) => (
        <div key={g} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 4 }}>{g}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LAB_PARAMS.filter((p) => p.group === g).map((p) => {
              const sev = sevOf(p.flag);
              const c = sev ? T[COLOR[sev]] : null;
              return (
                <button
                  key={p.key}
                  type="button"
                  data-testid={`flag-${p.key}`}
                  onClick={() => cycle(p.flag)}
                  aria-label={`${p.label}: ${sev || "not marked"}`}
                  style={{
                    ...s.btn,
                    padding: "5px 10px",
                    fontSize: 12,
                    minHeight: 30,
                    borderColor: c || T.border,
                    background: c ? `${c}22` : s.btn.background,
                    fontWeight: sev ? 700 : 500,
                  }}
                >
                  {p.key}
                  {sev && <span style={{ fontSize: 11 }}>· {sev}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

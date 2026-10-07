// The lab trend charts — Viscosity, Wear, Contaminants, Physical Properties
// — exactly as the Oil Analysis Report draws them, shared with the
// lubrication point's "Lubrication History" so both pages always show the
// same graphs. Each value keeps its own colour, missing values are left out
// (never drawn as 0), and the legend is built from the same list as the
// lines. LabCountControls is the report's "Show Last 5 / 10 / 15 / All ·
// Since last oil change" row.
import LineChart from "./LineChart";
import { seriesColor } from "../pointHistory";
import { viscTempLabel } from "../labReport";

const WEAR_METALS = ["Ag", "Al", "Cr", "Cu", "Fe", "Mo", "Ni", "Pb", "Sn"];
const WEAR_NAMES = { Ag: "Silver", Al: "Aluminum", Cr: "Chromium", Cu: "Copper", Fe: "Iron", Mo: "Molybdenum", Ni: "Nickel", Pb: "Lead", Sn: "Tin" };
const CONTAMINANTS = ["Si", "Na", "K"];
const CONTAMINANT_NAMES = { K: "Potassium", Na: "Sodium", Si: "Silicon" };
const LAB_COUNTS = ["5", "10", "15", "all"];

// the report's own rule: blank / missing / NaN → no point (never 0)
const num = (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? null : Number(v));

// history: the shown samples, oldest first.
function buildLabCharts(T, history) {
  const series = (key, label, get) => ({ key, label, color: seriesColor(T, key), data: history.map((d) => num(get(d))) });
  const hasData = (sr) => sr.data.some((v) => v !== null && v !== 0);
  return [
    { title: "Viscosity", height: 90, datasets: [series("Visc", `${viscTempLabel(history) ? `Visc${viscTempLabel(history)}` : "Viscosity"} (cSt)`, (d) => d.visc40C)].filter(hasData) },
    { title: "Wear", height: 100, datasets: WEAR_METALS.map((m) => series(m, `${m} (${WEAR_NAMES[m]})`, (d) => d.wear?.[m])).filter(hasData) },
    { title: "Contaminants", height: 90, datasets: CONTAMINANTS.map((c) => series(c, `${c} (${CONTAMINANT_NAMES[c]})`, (d) => d.contaminants?.[c])).filter(hasData) },
    {
      title: "Physical Properties",
      height: 90,
      datasets: [series("Water", "Water (Vol%)", (d) => d.water), series("Oxidation", "Oxidation (Ab/cm)", (d) => d.oxidation), series("TAN", "TAN (mg KOH/g)", (d) => d.tan)].filter(hasData),
    },
  ];
}

export function LegendItem({ T, color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.textSecondary }}>
      <span style={{ width: 10, height: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

export function Chip({ T, s, active, onClick, children, testid, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testid}
      style={{
        ...s.btn,
        padding: "5px 11px",
        fontSize: 12,
        borderColor: active ? T.accent : T.border,
        color: active ? T.accent : T.textSecondary,
        fontWeight: active ? 700 : 500,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function LabCountControls({ T, s, count, setCount, sinceChange, setSinceChange, lastChangeTime, shown, total, testPrefix = "report", children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} data-testid={`${testPrefix}-filters`}>
      <span style={{ fontSize: 12, color: T.textSecondary }}>Show</span>
      {LAB_COUNTS.map((c) => (
        <Chip key={c} T={T} s={s} active={count === c} onClick={() => setCount(c)} testid={`${testPrefix}-count-${c}`}>
          {c === "all" ? "All" : `Last ${c}`}
        </Chip>
      ))}
      <Chip T={T} s={s} active={sinceChange} onClick={() => setSinceChange((v) => !v)} disabled={!lastChangeTime} testid={`${testPrefix}-since-change`}>
        <i className="ti ti-droplet" aria-hidden="true" /> Since last oil change
      </Chip>
      <span style={{ fontSize: 12, color: T.textSecondary }} data-testid={`${testPrefix}-shown`}>
        {shown} of {total} samples
      </span>
      {children}
    </div>
  );
}

// The chart cards. `layout="column"` stacks them (the report, beside its
// table); "grid" puts them two to a row (the point page).
export default function LabTrendCharts({ T, history, layout = "column", testPrefix = "report" }) {
  const charts = buildLabCharts(T, history);
  const labels = history.map((d) => d.sampledDate);
  return (
    <div
      style={
        layout === "grid"
          ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))", gap: 16 }
          : { display: "flex", flexDirection: "column", gap: 16 }
      }
      data-testid={`${testPrefix}-charts`}
    >
      {charts.map((ch) => (
        <div key={ch.title} style={{ background: T.appBg, borderRadius: 8, padding: "12px 14px", minWidth: 0 }} data-testid={`${testPrefix}-chart-${ch.title.replace(/\s+/g, "-")}`}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{ch.title}</span>
            {ch.datasets.length === 1 && <LegendItem T={T} color={ch.datasets[0].color} label={ch.datasets[0].label} />}
          </div>
          <LineChart datasets={ch.datasets} labels={labels} height={ch.height} connectNulls />
          {ch.datasets.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }} data-testid={`${testPrefix}-legend-${ch.title.replace(/\s+/g, "-")}`}>
              {ch.datasets.map((d) => (
                <LegendItem key={d.key} T={T} color={d.color} label={d.label} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

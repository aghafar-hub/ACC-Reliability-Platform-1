import { useMemo } from "react";
import TrendChart from "./TrendChart";
import { pointLabel } from "../vibModel";

// One machine's trend, per VIB ID (machine page → Trend): a chart for each
// picked VIB ID with its own readings — RMS: Horizontal / Vertical / Axial,
// SPM: HDm / HDc, G's: one line — so the machine's behaviour shows, not only
// the highest value. "Combine" draws the picked VIB IDs of one family in one
// chart (never mm/s and dBsv on one axis): colour = VIB ID, line style =
// direction (H solid, V dashed, A dotted; HDm solid, HDc dashed).
//
// points: the machine's VIB IDs [{ vibId, family, description, positionCode }]
// entries: getVibEquipmentHistory rows; limitsOf(point) → [c, a, d] | null

const FIELDS = {
  RMS: [
    { key: "Horizontal (mm/s)", label: "H", name: "Horizontal", dash: "" },
    { key: "Vertical (mm/s)", label: "V", name: "Vertical", dash: "7 4" },
    { key: "Axial (mm/s)", label: "A", name: "Axial", dash: "2 3" },
  ],
  SPM: [
    { key: "HDm (dBsv)", label: "HDm", name: "HDm", dash: "" },
    { key: "HDc (dBsv)", label: "HDc", name: "HDc", dash: "7 4" },
  ],
  Gs: [{ key: "G's (g)", label: "G's", name: "G's", dash: "" }],
};
const UNIT = { RMS: "mm/s", SPM: "dBsv", Gs: "g" };
const FAMILY_NAME = { RMS: "RMS velocity", SPM: "SPM", Gs: "G's (PeakVue)" };


function valuesOf(entries, vibId, key, from) {
  const byDate = {};
  entries.forEach((e) => {
    if (e["VIB ID"] !== vibId) return;
    const d = String(e["Measurement date"] || "").slice(0, 10);
    if (!d || (from && d < from)) return;
    const v = parseFloat(e[key]);
    if (!isNaN(v)) byDate[d] = v; // one reading per date and VIB ID
  });
  return Object.entries(byDate).map(([date, value]) => ({ date, value }));
}

export default function VibPointCharts({ T, points, entries, colors, limitsOf, combine, from, testid }) {
  const charts = useMemo(() => {
    if (combine) {
      // one chart per family; colour per VIB ID in the machine's fixed order
      return ["RMS", "SPM", "Gs"]
        .map((fam) => {
          const ps = points.filter((p) => p.family === fam);
          if (!ps.length) return null;
          const series = ps.flatMap((p) =>
            FIELDS[fam].map((f) => ({
              label: ps.length > 1 || FIELDS[fam].length > 1 ? `${pointLabel(p).split(" · ")[0]} ${f.label}` : pointLabel(p),
              color: colors[p._order % colors.length],
              dash: f.dash,
              points: valuesOf(entries, p.vibId, f.key, from),
            }))
          );
          const lim = ps.map(limitsOf);
          const same = lim.every((l) => JSON.stringify(l) === JSON.stringify(lim[0]));
          return { key: fam, title: `${FAMILY_NAME[fam]} — ${ps.length} point${ps.length > 1 ? "s" : ""} combined`, sub: same ? "" : "Points have different limits — bands not shown", fam, series, limits: same ? lim[0] : null };
        })
        .filter(Boolean);
    }
    return points.map((p) => ({
      key: p.vibId,
      title: pointLabel(p),
      sub: p.vibId,
      fam: p.family,
      limits: limitsOf(p),
      // fixed colours per direction (H / V / A always the same)
      series: FIELDS[p.family].map((f, i) => ({ label: f.name, color: colors[i], points: valuesOf(entries, p.vibId, f.key, from) })),
    }));
  }, [points, entries, colors, limitsOf, combine, from]);

  if (!points.length) return <div style={{ color: T.textSecondary, padding: 20 }}>Pick one or more VIB IDs above.</div>;
  return (
    // several charts: two per row on a wide screen (small multiples); one chart: full width
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: charts.length > 1 ? "repeat(auto-fit, minmax(min(100%, 520px), 1fr))" : "1fr" }} data-testid={testid}>
      {charts.map((c) => {
        const n = c.series.reduce((k, sr) => k + sr.points.length, 0);
        return (
          <div key={c.key} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px 8px", minWidth: 0 }} data-testid={`vm-pchart-${c.key}`}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <b style={{ color: T.textPrimary, fontSize: 14 }}>{c.title}</b>
              {c.sub && <span style={{ fontSize: 12, color: T.textSecondary }}>{c.sub}</span>}
              <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>
                {c.limits ? `Limits ${c.limits.join(" / ")} ${UNIT[c.fam]}${c.fam === "SPM" ? " (HDm)" : ""}` : c.fam === "Gs" ? "No limits for G's" : ""}
                {n ? "" : " · no readings in this period"}
              </span>
            </div>
            <TrendChart T={T} series={c.series} limits={c.limits} unit={UNIT[c.fam]} height={charts.length > 1 ? 250 : 260} width={charts.length > 1 ? 600 : 900} />
          </div>
        );
      })}
    </div>
  );
}

// The machine's VIB IDs as chips: All, or any mix; "only" (double-click /
// the small arrow) shows that one point alone.
export function PointPicker({ T, s, points, picked, onToggle, onAll, onOnly }) {
  if (points.length < 2) return null;
  const on = (id) => !picked || picked.includes(id);
  return (
    <div role="group" aria-label="VIB IDs" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} data-testid="vm-pick">
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary, marginRight: 2 }}>VIB IDs</span>
      <button type="button" aria-pressed={!picked} onClick={onAll} style={{ ...s.btn, padding: "4px 12px", fontSize: 12.5, borderRadius: 999, background: !picked ? T.accent : T.cardBg, color: !picked ? "#fff" : T.textPrimary, borderColor: !picked ? T.accent : T.border }} data-testid="vm-point-all">
        All ({points.length})
      </button>
      {points.map((p) => (
        <span key={p.vibId} style={{ display: "inline-flex", alignItems: "stretch", borderRadius: 999, border: `1px solid ${on(p.vibId) && picked ? T.accent : T.border}`, background: on(p.vibId) && picked ? T.accent + "18" : T.cardBg, overflow: "hidden" }}>
          <button type="button" aria-pressed={!!picked && picked.includes(p.vibId)} title={p.vibId} onClick={() => (picked ? onToggle(p.vibId) : onOnly(p.vibId))} style={{ border: "none", background: "none", padding: "4px 6px 4px 11px", fontSize: 12.5, color: T.textPrimary, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", gap: 6, alignItems: "center" }} data-testid={`vm-point-${p.vibId}`}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${picked && on(p.vibId) ? T.accent : T.textMuted}`, background: picked && on(p.vibId) ? T.accent : "transparent" }} />
            {pointLabel(p)}
          </button>
          <button type="button" aria-label={`Only ${p.vibId}`} title="Show only this point" onClick={() => onOnly(p.vibId)} style={{ border: "none", borderLeft: `1px solid ${T.border}`, background: "none", padding: "0 8px", fontSize: 11, color: T.textSecondary, cursor: "pointer" }} data-testid={`vm-only-${p.vibId}`}>
            only
          </button>
        </span>
      ))}
    </div>
  );
}

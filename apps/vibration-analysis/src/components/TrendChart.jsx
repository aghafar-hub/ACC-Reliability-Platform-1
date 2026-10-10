import { useMemo, useState } from "react";
import { levelBg } from "../levels";

// Readings over time on a real time scale (design reference §3 "Trend over
// time"): one line per series with dots, the limit bands shaded behind
// (Normal / Caution / Alert / Danger) with dashed limit lines, optional
// event markers (dotted vertical line + label), a crosshair tooltip on
// hover and a legend. Missing values are left out, never drawn as 0.
//
// series: [{ label, color, dash?, points: [{ date: "yyyy-mm-dd", value }] }] — dash: SVG dash pattern
// (line style as a second cue when colour alone can't tell series apart)
// limits: [caution, alert, danger] or null; unit: "mm/s" …
// width: drawing width in SVG units (smaller for a chart in a half-width
// column, so its text stays the same size on screen)
// span: ["yyyy-mm-dd", "yyyy-mm-dd"] — the time axis to use (several charts
// side by side share one axis, ending at the machine's last reading)
export default function TrendChart({ T, series, limits, unit, height = 260, width = 900, markers = [], span, testid }) {
  const [hover, setHover] = useState(null);
  const W = width;
  const H = height;
  const L = 44;
  const R = 16;
  const TOP = 14;
  const B = 28;
  const all = series.flatMap((s) => s.points.filter((p) => p.value != null && !isNaN(p.value)));
  const dates = useMemo(() => [...new Set(all.map((p) => p.date))].sort(), [all]);
  if (!all.length) return <div style={{ color: T.textSecondary, fontSize: 13, padding: 20 }}>No readings to draw yet.</div>;
  const t = (d) => new Date(d + "T00:00:00").getTime();
  const a0 = span?.[0] && span[0] < dates[0] ? span[0] : dates[0];
  const a1 = span?.[1] && span[1] > dates[dates.length - 1] ? span[1] : dates[dates.length - 1];
  const t0 = t(a0);
  const t1 = a1 > a0 ? t(a1) : t0 + 86400000;
  const maxV = Math.max(...all.map((p) => p.value));
  const minV = Math.min(0, ...all.map((p) => p.value));
  const top = limits ? Math.max(maxV * 1.15, limits[1] * 1.15) : maxV * 1.15 || 1;
  const yMax = limits && maxV > limits[2] * 0.9 ? Math.max(top, limits[2] * 1.1) : top;
  const x = (d) => L + ((t(d) - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => TOP + (1 - (v - minV) / (yMax - minV || 1)) * (H - TOP - B);
  const ticks = niceTicks(minV, yMax, 5);
  const months = monthTicks(a0, a1);
  const bands = limits
    ? [
        [minV, limits[0], "Normal"],
        [limits[0], limits[1], "Caution"],
        [limits[1], limits[2], "Alert"],
        [limits[2], yMax, "Danger"],
      ].filter(([a]) => a < yMax)
    : [];
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = null;
    dates.forEach((d) => {
      const dx = Math.abs(x(d) - px);
      if (!best || dx < best.dx) best = { d, dx };
    });
    setHover(best && best.dx < 40 ? best.d : null);
  };
  const hv = hover ? series.map((s) => ({ s, p: s.points.find((p) => p.date === hover && p.value != null) })).filter((r) => r.p) : [];
  return (
    <div data-testid={testid} style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Trend in ${unit}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: "block", fontFamily: "inherit" }}>
        {bands.map(([a, b, lvl]) => (
          <rect key={lvl} x={L} width={W - L - R} y={y(Math.min(b, yMax))} height={Math.max(0, y(Math.max(a, minV)) - y(Math.min(b, yMax)))} fill={levelBg(T, lvl)} opacity={0.75} />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={T.border2 || T.border} strokeWidth="1" />
            <text x={L - 6} y={y(v) + 4} fontSize="12" textAnchor="end" fill={T.textSecondary}>
              {v}
            </text>
          </g>
        ))}
        {limits &&
          limits.map((v, i) =>
            v < yMax ? (
              <g key={i}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={T.textMuted} strokeDasharray="4 4" />
                <text x={W - R - 4} y={y(v) - 4} fontSize="12" textAnchor="end" fill={T.textSecondary}>
                  {["Caution", "Alert", "Danger"][i]} {v}
                </text>
              </g>
            ) : null
          )}
        {months.map((m) => (
          <text key={m} x={x(m)} y={H - 8} fontSize="12" textAnchor="middle" fill={T.textSecondary}>
            {new Date(m + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: m.endsWith("-01-01") || m === months[0] ? "2-digit" : undefined })}
          </text>
        ))}
        {markers.map((mk, i) =>
          mk.date >= a0 && mk.date <= a1 ? (
            <g key={i}>
              <line x1={x(mk.date)} x2={x(mk.date)} y1={TOP} y2={H - B} stroke={T.textSecondary} strokeDasharray="2 3" />
              <text x={x(mk.date) + 4} y={TOP + 10} fontSize="12" fill={T.textSecondary}>
                {mk.label}
              </text>
            </g>
          ) : null
        )}
        {series.map((s, si) => {
          const pts = s.points.filter((p) => p.value != null && !isNaN(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
          return (
            <g key={si + s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || undefined} points={pts.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")} />
              {pts.map((p) => (
                <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={hover === p.date ? 5 : 3.5} fill={s.color} stroke={T.cardBg} strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
        {hover && <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={H - B} stroke={T.textPrimary} strokeOpacity="0.35" />}
      </svg>
      {hover && hv.length > 0 && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: 8,
            left: `${Math.min(70, (x(hover) / W) * 100)}%`,
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            color: T.textPrimary,
            boxShadow: "0 6px 18px rgba(0,0,0,.12)",
            pointerEvents: "none",
            minWidth: 150,
          }}
        >
          <b>{new Date(hover + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b>
          {hv.map(({ s, p }, i) => (
            <div key={i + s.label} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
              <Swatch s={s} w={14} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <b>
                {p.value} {unit}
              </b>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: T.textSecondary, marginTop: 6 }}>
          {series.map((s, i) => (
            <span key={i + s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Swatch s={s} w={22} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// legend / tooltip key: the series colour with its line style
function Swatch({ s, w }) {
  return (
    <svg width={w} height="6" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="0" x2={w} y1="3" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash || undefined} />
    </svg>
  );
}

function niceTicks(min, max, n) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function monthTicks(a, b) {
  const out = [];
  const [y0, m0] = a.split("-").map(Number);
  const [y1, m1] = b.split("-").map(Number);
  const total = (y1 - y0) * 12 + (m1 - m0);
  const every = total > 24 ? 6 : total > 12 ? 3 : total > 6 ? 2 : 1;
  for (let i = 1; i <= total; i += every) {
    const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  if (!out.length) out.push(a);
  return out;
}

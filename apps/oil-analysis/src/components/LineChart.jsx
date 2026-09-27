import { useTheme } from "../ThemeContext";

const EXTRA = ["#9B59B6", "#E67E22", "#1ABC9C", "#E74C3C"];

function formatTick(x) {
  const d = new Date(x);
  return isNaN(d) ? x : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Hand-rolled SVG line chart, ported from the original app's own `pi`
// component (viewBox 0 0 420 h, 5 horizontal gridlines, per-series
// polylines split at gaps so null values don't connect across them).
export default function LineChart({ datasets, labels, height = 100 }) {
  const { T } = useTheme();
  const colors = [T.success, T.accent, T.danger, T.warning, ...EXTRA];

  if (!datasets || datasets.length === 0 || !labels || labels.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontSize: 12 }}>
        No trend data
      </div>
    );
  }
  const flat = datasets.flatMap((s) => s.data.filter((v) => v != null));
  if (flat.length === 0) return null;

  const min = Math.min(...flat);
  const range = Math.max(...flat) - min || 1;
  const w = 420;
  const h = height;
  const left = 40;
  const right = 12;
  const top = 10;
  const bottom = 30;
  const plotW = w - left - right;
  const plotH = h - top - bottom;
  const x = (i) => left + (i / (labels.length - 1)) * plotW;
  const y = (v) => top + plotH - ((v - min) / range) * plotH;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const gy = top + plotH * (1 - f);
        const v = min + range * f;
        return (
          <g key={f}>
            <line x1={left} y1={gy} x2={w - right} y2={gy} stroke={T.border} strokeWidth={0.5} />
            <text x={left - 4} y={gy + 3} textAnchor="end" fontSize={8} fill={T.textSecondary}>
              {v % 1 === 0 ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {labels.map((lbl, i) => (
        <text key={i} x={x(i)} y={h - 4} textAnchor="middle" fontSize={8} fill={T.textSecondary}>
          {formatTick(lbl)}
        </text>
      ))}
      {datasets.map((series, si) => {
        const color = colors[si % colors.length];
        const segments = [];
        let current = [];
        series.data.forEach((v, i) => {
          if (v != null) current.push(i);
          else {
            if (current.length > 1) segments.push([...current]);
            current = [];
          }
        });
        if (current.length > 1) segments.push(current);
        return (
          <g key={si}>
            {segments.map((seg, i) => (
              <polyline
                key={i}
                points={seg.map((i2) => `${x(i2)},${y(series.data[i2])}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
            ))}
            {series.data.map((v, i) => (v != null ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={color} /> : null))}
          </g>
        );
      })}
    </svg>
  );
}

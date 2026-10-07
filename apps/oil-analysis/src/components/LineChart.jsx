import { useTheme } from "../ThemeContext";

const EXTRA = ["#9B59B6", "#E67E22", "#1ABC9C", "#E74C3C"];

function formatTick(x) {
  const d = new Date(x);
  return isNaN(d) ? x : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Hand-rolled SVG line chart, ported from the original app's own `pi`
// component (viewBox 0 0 420 h, 5 horizontal gridlines, per-series
// polylines split at gaps so null values don't connect across them).
// `dataset.color` fixes a line's colour (so a legend can match it whatever
// lines are left out); `connectNulls` draws one line through a gap (a
// value missing from one report) instead of breaking it.
//
// `markers`: [{ pos, label }] — a dotted vertical line with an oil-drop
// symbol at `pos` (a sample index, fractional = between two samples), e.g.
// an oil change. Hover/tap the drop for its label.
export default function LineChart({ datasets, labels, height = 100, connectNulls = false, markers = [] }) {
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
  const top = markers.length ? 14 : 10;
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
      {markers.map((m, i) => {
        const mx = x(Math.max(0, Math.min(labels.length - 1, m.pos)));
        return (
          <g key={`m${i}`} data-testid="chart-oil-change" style={{ cursor: "default" }}>
            <title>{m.label}</title>
            <line x1={mx} y1={top + 2} x2={mx} y2={top + plotH} stroke={T.warning} strokeWidth={1.2} strokeDasharray="2 3" />
            <path
              d={`M ${mx} ${top - 9} C ${mx + 4.5} ${top - 3.5}, ${mx + 4.5} ${top}, ${mx} ${top + 2} C ${mx - 4.5} ${top}, ${mx - 4.5} ${top - 3.5}, ${mx} ${top - 9} Z`}
              fill={T.warning}
              stroke={T.cardBg}
              strokeWidth={0.8}
            />
          </g>
        );
      })}
      {datasets.map((series, si) => {
        const color = series.color || colors[si % colors.length];
        const segments = [];
        let current = [];
        series.data.forEach((v, i) => {
          if (v != null) current.push(i);
          else if (!connectNulls) {
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

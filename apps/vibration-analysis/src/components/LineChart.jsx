import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDisplayDate } from "../parsers";

// Hand-rolled SVG trend chart with hover tooltips and dashed threshold
// lines — ported from the original's `lu`. No charting library is bundled
// anywhere in the original app (confirmed: no recharts/chart.js/d3/victory
// in the minified bundle), so this reconstruction is plain SVG too, matching
// the sibling oil-analysis app's own hand-rolled LineChart.jsx.
export default function LineChart({ title, series, thresholds = [], unit = "", height = 340 }) {
  const { T, s } = useTheme();
  const [hover, setHover] = useState(null);

  const width = 900;
  const chartHeight = height;
  const marginLeft = 55;
  const marginRight = 20;
  const marginTop = 28;
  const marginBottom = 42;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = chartHeight - marginTop - marginBottom;

  const xValues = Array.from(new Set(series.flatMap((sr) => sr.data.map((p) => p.x)))).sort();
  const yValues = series.flatMap((sr) => sr.data.map((p) => p.y)).filter((v) => v != null);
  const thresholdValues = thresholds.map((t) => t.value);

  let yMin = Math.min(0, ...yValues, ...thresholdValues);
  let yMax = Math.max(1, ...yValues, ...thresholdValues);
  yMax = yMax * 1.12;
  if (yMax === yMin) yMax = yMin + 1;

  const xForValue = (x) =>
    xValues.length <= 1 ? marginLeft + plotWidth / 2 : marginLeft + (xValues.indexOf(x) / (xValues.length - 1)) * plotWidth;
  const yForValue = (y) => marginTop + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

  const xLabelStep = Math.max(1, Math.ceil(xValues.length / 8));
  const xLabels = xValues.filter((_, i) => i % xLabelStep === 0 || i === xValues.length - 1);

  if (xValues.length === 0) {
    return (
      <div style={s.cardSub}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>{title}</div>
        <div style={{ padding: 24, textAlign: "center", color: T.textMuted }}>No data</div>
      </div>
    );
  }

  const hoverPoint = (() => {
    if (!hover) return null;
    const [seriesName, x] = hover.split("|");
    const sr = series.find((s2) => s2.name === seriesName);
    const point = sr && sr.data.find((p) => p.x === x);
    if (!point || point.y === null) return null;
    const px = xForValue(x);
    const py = yForValue(point.y);
    const boxX = px > width - 120 ? px - 110 : px + 8;
    const boxY = py < 40 ? py + 8 : py - 32;
    return { seriesName, x, point, sr, boxX, boxY };
  })();

  return (
    <div style={s.cardSub}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.textPrimary, marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <svg
          width={width}
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
          style={{ display: "block", maxWidth: "100%", cursor: "crosshair" }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = marginTop + plotHeight * t;
            return <line key={t} x1={marginLeft} y1={y} x2={marginLeft + plotWidth} y2={y} stroke={T.border2} strokeWidth={0.8} />;
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const value = yMin + (yMax - yMin) * (1 - t);
            return (
              <text key={t} x={marginLeft - 5} y={marginTop + plotHeight * t + 4} textAnchor="end" fontSize="10" fill={T.textMuted}>
                {value.toFixed(1)}
              </text>
            );
          })}
          {thresholds.map((t, i) => (
            <line
              key={i}
              x1={marginLeft}
              y1={yForValue(t.value)}
              x2={marginLeft + plotWidth}
              y2={yForValue(t.value)}
              stroke={t.color}
              strokeWidth={1.5}
              strokeDasharray="5,4"
              opacity={0.7}
            />
          ))}
          {series.map((sr) => {
            const points = sr.data.filter((p) => p.y !== null && p.y !== undefined);
            if (points.length < 2) return null;
            const d = "M" + points.map((p) => `${xForValue(p.x)},${yForValue(p.y)}`).join("L");
            return <path key={sr.name} d={d} fill="none" stroke={sr.color} strokeWidth={2} strokeLinejoin="round" />;
          })}
          {series.map((sr) =>
            sr.data
              .filter((p) => p.y !== null && p.y !== undefined)
              .map((p, i) => {
                const key = `${sr.name}|${p.x}`;
                const isHover = hover === key;
                return (
                  <circle
                    key={i}
                    cx={xForValue(p.x)}
                    cy={yForValue(p.y)}
                    r={isHover ? 7 : 4}
                    fill={sr.color}
                    stroke={T.cardBg}
                    strokeWidth={isHover ? 2.5 : 1.5}
                    style={{ cursor: "pointer", transition: "r 0.1s" }}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })
          )}
          {hoverPoint && (
            <>
              <rect
                x={hoverPoint.boxX}
                y={hoverPoint.boxY}
                width={105}
                height={36}
                rx={4}
                fill={T.cardBg}
                stroke={T.border}
                strokeWidth={1}
              />
              <text x={hoverPoint.boxX + 6} y={hoverPoint.boxY + 14} fontSize="11" fill={T.textHighlight} fontWeight="700">
                {formatDisplayDate(hoverPoint.x)}
              </text>
              <text x={hoverPoint.boxX + 6} y={hoverPoint.boxY + 28} fontSize="11" fill={hoverPoint.sr.color} fontWeight="700">
                {hoverPoint.seriesName}: {hoverPoint.point.y?.toFixed(2)} {unit}
              </text>
            </>
          )}
          {xLabels.map((x) => (
            <text key={x} x={xForValue(x)} y={chartHeight - 8} textAnchor="middle" fontSize="10" fill={T.textMuted}>
              {formatDisplayDate(x)}
            </text>
          ))}
          <line x1={marginLeft} y1={marginTop} x2={marginLeft} y2={marginTop + plotHeight} stroke={T.border} strokeWidth={1} />
          <line
            x1={marginLeft}
            y1={marginTop + plotHeight}
            x2={marginLeft + plotWidth}
            y2={marginTop + plotHeight}
            stroke={T.border}
            strokeWidth={1}
          />
        </svg>
      </div>
      {(series.length > 1 || thresholds.length > 0) && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
          {series.map((sr) => (
            <span key={sr.name} style={{ fontSize: 11.5, color: T.textSecondary, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 3, background: sr.color, display: "inline-block", borderRadius: 2 }} />
              {sr.name}
            </span>
          ))}
          {thresholds.map((t, i) => (
            <span key={i} style={{ fontSize: 11.5, color: t.color, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 12, height: 2, background: t.color, display: "inline-block", borderRadius: 1, opacity: 0.7 }} />
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

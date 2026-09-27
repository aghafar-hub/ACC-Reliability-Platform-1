import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { complianceColor } from "../domain";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LETTER = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  return `${MONTH_ABBR[parseInt(month, 10) - 1]} ${year}`;
}

// Full-width scrollable dot timeline for one equipment's whole compliance
// history, with a hover tooltip — ported from the original's `Pm`.
export default function ComplianceTimeline({ months }) {
  const { T } = useTheme();
  const [hover, setHover] = useState(null);

  if (!months || months.length === 0) {
    return <div style={{ color: T.textMuted, fontSize: 12, padding: 12 }}>No month data available.</div>;
  }

  const dotSpacing = 14;
  const gap = 6;
  const width = Math.max(500, months.length * (dotSpacing + gap));
  const svgHeight = 90;
  const axisY = svgHeight * 0.42;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4, position: "relative" }}>
      <svg width={width} height={svgHeight} style={{ display: "block", minWidth: "100%", overflow: "visible" }}>
        <line
          x1={dotSpacing / 2}
          y1={axisY}
          x2={width - dotSpacing / 2}
          y2={axisY}
          stroke={T.border}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {months.map((m, i) => {
          const cx = i * (dotSpacing + gap) + dotSpacing / 2;
          const color = complianceColor(T, m.status);
          const isBlank = !m.status || m.status === "";
          const isHover = hover && hover.month === m.month;
          const r = isHover ? dotSpacing * 0.7 : dotSpacing * 0.5;
          const [year, month] = m.month.split("-");
          const letter = MONTH_LETTER[parseInt(month, 10) - 1] || "";
          return (
            <g key={m.month}>
              <circle
                cx={cx}
                cy={axisY}
                r={r}
                fill={isBlank ? T.border : color}
                stroke={isBlank ? T.border2 : color}
                strokeWidth={isHover ? 3 : 1.5}
                style={{
                  cursor: "pointer",
                  transition: "r 0.12s,stroke-width 0.12s",
                  filter: isHover ? `drop-shadow(0 0 4px ${color}88)` : "none",
                }}
                onMouseEnter={() => setHover(m)}
                onMouseLeave={() => setHover(null)}
              />
              <text x={cx} y={axisY + dotSpacing * 0.7 + 13} textAnchor="middle" fontSize="9" fill={T.textMuted}>
                {letter}
              </text>
              {(month === "01" || i === 0) && (
                <text x={cx} y={axisY + dotSpacing * 0.7 + 23} textAnchor="middle" fontSize="8" fill={T.textSubtle || T.textMuted}>
                  {year}
                </text>
              )}
            </g>
          );
        })}
        {hover &&
          (() => {
            const idx = months.findIndex((m) => m.month === hover.month);
            const cx = idx * (dotSpacing + gap) + dotSpacing / 2;
            const boxWidth = 140;
            const boxHeight = 42;
            const boxX = Math.min(cx - boxWidth / 2, width - boxWidth - 4);
            const boxY = axisY - dotSpacing - boxHeight - 10;
            const color = complianceColor(T, hover.status);
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={Math.max(2, boxX)}
                  y={Math.max(2, boxY)}
                  width={boxWidth}
                  height={boxHeight}
                  rx={6}
                  fill={T.cardBg}
                  stroke={color}
                  strokeWidth={1.5}
                  style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))" }}
                />
                <text
                  x={Math.max(2, boxX) + boxWidth / 2}
                  y={Math.max(2, boxY) + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={T.textHighlight}
                >
                  {monthLabel(hover.month)}
                </text>
                <text
                  x={Math.max(2, boxX) + boxWidth / 2}
                  y={Math.max(2, boxY) + 32}
                  textAnchor="middle"
                  fontSize="11"
                  fill={color}
                  fontWeight="600"
                >
                  {hover.status || "Missing"}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}

import { useTheme } from "../ThemeContext";

// Dashboard's equipment-count donut (Good/Acceptable/Alarm/Danger slices,
// clickable to filter) — ported from the original's `Tm`.
export default function StatusDonut({ slices, total, onClick, activeSlice }) {
  const { T } = useTheme();
  const radius = 68;
  const cx = 88;
  const cy = 88;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = slices.map((slice) => {
    const fraction = total > 0 ? slice.count / total : 0;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const arc = { ...slice, dash, gap, offset };
    offset += dash;
    return arc;
  });

  return (
    <svg width={176} height={176} viewBox="0 0 176 176">
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset + circumference * 0.25}
          style={{ cursor: "pointer", opacity: activeSlice === null || activeSlice === arc.key ? 1 : 0.3, transition: "opacity 0.15s" }}
          onClick={() => onClick(arc.key)}
        />
      ))}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="800" fill={T.textHighlight}>
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill={T.textSecondary}>
        Equipment
      </text>
    </svg>
  );
}

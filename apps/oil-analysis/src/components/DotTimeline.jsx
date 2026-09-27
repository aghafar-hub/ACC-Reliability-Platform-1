import { useTheme } from "../ThemeContext";

// One consistent "line with dots" visual, shared by the Oil Change Log
// (one dot per lubrication point, positioned by days until due along a
// shared window) and the Oil Sample Tracker (one dot per month, evenly
// spaced along an equipment's own history) — each dot always shows its
// short status letter, and the exact date/detail only appears as a native
// tooltip on hover instead of a permanently-drawn label fighting its
// neighbors for space.
export default function DotTimeline({ dots, todayPct, ticks, height = 34, dotSize = 22 }) {
  const { T } = useTheme();
  return (
    <div style={{ position: "relative", flex: 1, height, minWidth: 0 }}>
      {ticks?.map((pct) => (
        <span key={pct} style={{ position: "absolute", left: `${pct}%`, top: -6, bottom: -6, width: 1, background: T.border2 }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          height: 3,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${T.border2}, ${T.border}, ${T.border2})`,
        }}
      />
      {todayPct != null && (
        <span
          title="Today"
          style={{ position: "absolute", left: `${todayPct}%`, top: -8, bottom: -8, width: 2, background: T.accent, borderRadius: 2 }}
        />
      )}
      {dots.map((d, i) => (
        <div
          key={d.key ?? i}
          title={d.tooltip}
          style={{
            position: "absolute",
            left: `${d.pct}%`,
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: dotSize > 20 ? 10 : 9,
            fontWeight: 800,
            color: "#fff",
            background: d.color,
            border: `2px solid ${T.cardBg}`,
            boxShadow: `0 0 0 1px ${d.color}55, 0 3px 8px rgba(0,0,0,0.28)`,
            cursor: "default",
          }}
        >
          {d.letter}
          {d.accent && (
            <span
              title={d.accentTooltip}
              style={{
                position: "absolute",
                right: -3,
                bottom: -3,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#7C3AED",
                border: `1.5px solid ${T.cardBg}`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

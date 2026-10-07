import { useTheme } from "../ThemeContext";

// "N of M done" for a route (Routes list, Route Detail header) — a small
// progress ring (design D5): full and green when every point is done, blue
// while under way, an empty grey ring before it starts. done/total come
// straight from Routines.js's server-side item count, no extra fetch.
// `width` is kept for old call sites; the ring has a fixed size.
// eslint-disable-next-line no-unused-vars
export default function ProgressBar({ done, total, width }) {
  const { T } = useTheme();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct >= 100 ? T.success : T.accent;
  const size = 44;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const label = total > 0 ? `${done} of ${total} points done` : "No points";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }} title={label} aria-label={label} role="img" data-testid="route-progress">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${T.textMuted || T.textSecondary}33`} strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={pct >= 100 ? T.success : T.textPrimary} fontFamily="'IBM Plex Sans','Segoe UI',Roboto,sans-serif">
          {total > 0 ? `${done}/${total}` : "—"}
        </text>
      </svg>
      {total > 0 && pct >= 100 && <span style={{ fontSize: 12, color: T.success, fontWeight: 700, whiteSpace: "nowrap" }}>Done</span>}
    </span>
  );
}

// The dashboard chart kit (design D4) — small hand-drawn SVG charts, each
// for one kind of question: Donut (one total split into ≤ 5 parts),
// Ring (progress toward 100 % with a target tick), TargetBar (on-time share
// per contractor against the target), MiniBars (a count per month, current
// month pale) and Runway (days of stock left with 30/60/90-day lines).
// Every chart keeps its numbers in text next to it, so colour is never the
// only way to read it, and shows the exact value on hover/tap.
import { useState } from "react";

const FONT = "'IBM Plex Sans','Segoe UI',Roboto,sans-serif";
// The empty part of a ring or bar: muted text at 20 % — soft in every
// theme (the border colour is near-black in High Contrast).
const track = (T) => `${T.textMuted || T.textSecondary}33`;

function arcPath(cx, cy, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

// segments: [{ label, value, color }]; the centre shows `center` / `sub`.
export function Donut({ T, segments, size = 132, thickness = 18, center, sub, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const gap = total > 0 && segments.filter((x) => x.value > 0).length > 1 ? 0.035 : 0;
  let a = -Math.PI / 2;
  const arcs = segments.map((seg) => {
    const sweep = total ? (seg.value / total) * Math.PI * 2 : 0;
    const out = { ...seg, a0: a + gap / 2, a1: a + sweep - gap / 2 };
    a += sweep;
    return out;
  });
  const shown = hover != null ? arcs[hover] : null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} style={{ flexShrink: 0, fontFamily: FONT }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={track(T)} strokeWidth={thickness} />
      {arcs.map((seg, i) =>
        seg.value <= 0 ? null : seg.a1 - seg.a0 >= Math.PI * 2 - 0.01 ? (
          <circle
            key={seg.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={hover === i ? thickness + 3 : thickness}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ) : (
          <path
            key={seg.label}
            d={arcPath(c, c, r, seg.a0, Math.max(seg.a0 + 0.001, seg.a1))}
            fill="none"
            stroke={seg.color}
            strokeWidth={hover === i ? thickness + 3 : thickness}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "default" }}
          >
            <title>{`${seg.label}: ${seg.value}`}</title>
          </path>
        )
      )}
      <text x={c} y={c + (sub ? 2 : 7)} textAnchor="middle" fontSize={shown ? 20 : 24} fontWeight="700" fill={T.textPrimary}>
        {shown ? shown.value : center}
      </text>
      {(shown || sub) && (
        <text x={c} y={c + 20} textAnchor="middle" fontSize="12" fill={T.textSecondary}>
          {shown ? shown.label : sub}
        </text>
      )}
    </svg>
  );
}

// Progress toward 100 % with the target as a tick on the ring.
export function Ring({ T, pct, target, size = 96, thickness = 10, color, label }) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const a0 = -Math.PI / 2;
  const a1 = a0 + (p / 100) * Math.PI * 2;
  const ta = a0 + ((target || 0) / 100) * Math.PI * 2;
  const tick = (rad) => [c + rad * Math.cos(ta), c + rad * Math.sin(ta)];
  const [tx0, ty0] = tick(r - thickness / 2 - 4);
  const [tx1, ty1] = tick(r + thickness / 2 + 4);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} style={{ flexShrink: 0, fontFamily: FONT }}>
      <title>{label}</title>
      <circle cx={c} cy={c} r={r} fill="none" stroke={track(T)} strokeWidth={thickness} />
      {p >= 99.9 ? (
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness} />
      ) : (
        p > 0 && <path d={arcPath(c, c, r, a0, a1)} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" />
      )}
      {target != null && <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke={T.textPrimary} strokeWidth="2.5" strokeLinecap="round" />}
      <text x={c} y={c + 7} textAnchor="middle" fontSize={size > 90 ? 21 : 17} fontWeight="700" fill={T.textPrimary}>
        {pct == null ? "—" : `${pct}%`}
      </text>
    </svg>
  );
}

// One on-time bar per row against the target line.
export function TargetBar({ T, pct, target, color, height = 12 }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: "relative", height, borderRadius: height / 2, background: track(T), flex: 1, minWidth: 60 }}>
      <div style={{ position: "absolute", inset: 0, width: `${p}%`, borderRadius: height / 2, background: color }} />
      {target != null && (
        <div
          title={`Target ${target} %`}
          style={{ position: "absolute", left: `calc(${target}% - 1.5px)`, top: -4, bottom: -4, width: 3, borderRadius: 2, background: T.textPrimary }}
        />
      )}
    </div>
  );
}

// A count per month: one series, its own scale, value shown on hover/tap,
// the current (partial) month drawn pale.
export function MiniBars({ T, data, color, height = 84, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={ariaLabel} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, borderBottom: `1px solid ${T.border}` }}>
        {data.map((d, i) => (
          <div
            key={d.key}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default" }}
          >
            <div
              style={{
                width: "100%",
                height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%`,
                background: color,
                opacity: d.partial ? 0.4 : hover === i ? 0.85 : 1,
                borderRadius: "4px 4px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {data.map((d) => (
          <span key={d.key} style={{ flex: 1, textAlign: "center", fontSize: 12, color: T.textSecondary }}>
            {d.label}
          </span>
        ))}
      </div>
      {hover != null && (
        <div
          style={{
            position: "absolute",
            bottom: height + 8,
            left: `${((hover + 0.5) / data.length) * 100}%`,
            transform: "translateX(-50%)",
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 12,
            fontWeight: 700,
            color: T.textPrimary,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,.12)",
            pointerEvents: "none",
          }}
        >
          {data[hover].label}: {data[hover].value}
          {data[hover].partial ? " so far" : ""}
        </div>
      )}
    </div>
  );
}

// Days of stock left: one bar per oil, scaled to 120 days, with dashed
// lines at 30 / 60 / 90; under 30 days red, under 60 amber.
export function Runway({ T, rows, maxDays = 120 }) {
  const toneFor = (d) => (d < 30 ? T.danger : d < 60 ? T.warning : T.accent);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,40%) 1fr", gap: "0 10px" }}>
        <span />
        <div style={{ position: "relative", height: 16 }}>
          {[30, 60, 90].map((m) => (
            <span key={m} style={{ position: "absolute", left: `${(m / maxDays) * 100}%`, transform: "translateX(-50%)", fontSize: 12, color: T.textSecondary }}>
              {m} d
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={`${r.label}|${r.contractor}`} style={{ display: "contents" }}>
            <span style={{ fontSize: 12.5, color: T.textPrimary, padding: "7px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>
              {r.label}
              {r.contractor ? <span style={{ color: T.textSecondary }}> · {r.contractor}</span> : null}
            </span>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              {[30, 60, 90].map((m) => (
                <span key={m} style={{ position: "absolute", left: `${(m / maxDays) * 100}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${T.border}` }} />
              ))}
              {r.noProduct ? (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.danger }}>No stock product</span>
              ) : (
                <>
                  <div
                    title={`${r.days} days left`}
                    style={{ height: 14, width: `${Math.max(2, (Math.min(r.days, maxDays) / maxDays) * 100 - 8)}%`, background: toneFor(r.days), borderRadius: "0 4px 4px 0" }}
                  />
                  <span style={{ marginLeft: 6, fontSize: 12.5, fontWeight: 700, color: T.textPrimary, whiteSpace: "nowrap" }}>
                    {r.days > maxDays ? `${maxDays}+` : r.days} d
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One stacked bar per row (e.g. per area: Poor / Fair / Good), all on one
// scale so rows compare; the count of each part shows on hover and the
// row total sits at the end. 2px gaps between parts.
export function StackedBars({ T, rows, onRow, activeLabel, labelWidth = 110 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + p.value, 0)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r) => {
        const total = r.parts.reduce((n, p) => n + p.value, 0);
        const active = activeLabel === r.label;
        return (
          <button
            key={r.label}
            type="button"
            onClick={() => onRow?.(r)}
            aria-pressed={active}
            title={`${r.label}: ${r.parts.map((p) => `${p.value} ${p.label}`).join(", ")}`}
            style={{
              display: "grid",
              gridTemplateColumns: `${labelWidth}px 1fr 44px`,
              alignItems: "center",
              gap: 8,
              border: 0,
              padding: "2px 4px",
              borderRadius: 6,
              background: active ? T.accent + "14" : "none",
              cursor: onRow ? "pointer" : "default",
              fontFamily: "inherit",
              color: T.textPrimary,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ display: "flex", gap: 2, height: 14 }}>
              {r.parts.map((p) =>
                p.value > 0 ? (
                  <span
                    key={p.label}
                    onMouseEnter={() => setHover(`${r.label}|${p.label}`)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      width: `${(p.value / max) * 100}%`,
                      background: p.color,
                      borderRadius: 3,
                      outline: hover === `${r.label}|${p.label}` ? `2px solid ${T.textPrimary}` : "none",
                    }}
                  />
                ) : null
              )}
            </span>
            <b style={{ fontSize: 13, textAlign: "right" }}>{total}</b>
          </button>
        );
      })}
    </div>
  );
}

// Half-circle gauge: how full one stock is, with the low-stock level as a
// tick (D5 — the oil on a lubrication point, a product page in Inventory).
export function Gauge({ T, value, max, level, unit = "L", size = 180, label }) {
  const w = size;
  const h = size / 2 + 22;
  const r = size / 2 - 14;
  const cx = w / 2;
  const cy = size / 2 + 2;
  const top = Math.max(1, max || 0, value || 0, (level || 0) * 1.5);
  const frac = (v) => Math.max(0, Math.min(1, (v || 0) / top));
  const at = (f, rad) => [cx - rad * Math.cos(Math.PI * f), cy - rad * Math.sin(Math.PI * f)];
  const arc = (f0, f1, rad) => {
    const [x0, y0] = at(f0, rad);
    const [x1, y1] = at(f1, rad);
    return `M ${x0} ${y0} A ${rad} ${rad} 0 0 1 ${x1} ${y1}`;
  };
  const low = level != null && value != null && value <= level;
  const color = value == null ? T.textMuted : low ? (value <= level * 0.5 ? T.danger : T.warning) : T.success;
  const f = frac(value);
  const [lx0, ly0] = at(frac(level), r - 12);
  const [lx1, ly1] = at(frac(level), r + 12);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ fontFamily: FONT, flexShrink: 0 }}>
      <title>{label}</title>
      <path d={arc(0, 1, r)} fill="none" stroke={track(T)} strokeWidth="14" strokeLinecap="round" />
      {f > 0 && <path d={arc(0, Math.max(0.01, f), r)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />}
      {level != null && <line x1={lx0} y1={ly0} x2={lx1} y2={ly1} stroke={T.textPrimary} strokeWidth="2.5" strokeLinecap="round" />}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="700" fill={T.textPrimary}>
        {value == null ? "—" : `${Math.round(value * 10) / 10} ${unit}`}
      </text>
      <text x={14} y={h - 4} fontSize="12" fill={T.textSecondary}>0</text>
      <text x={w - 14} y={h - 4} textAnchor="end" fontSize="12" fill={T.textSecondary}>{`${Math.round(top)} ${unit}`}</text>
    </svg>
  );
}

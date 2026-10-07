import { useMemo, useState } from "react";
import { ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import { pickSamples } from "../labReport";
import LabTrendCharts, { LabCountControls } from "./LabTrendCharts";
import useIsMobile from "../hooks/useIsMobile";
import { formatDate, intervalMonths } from "../parsers";
import {
  DAY,
  LAB_GROUPS,
  LAB_PARAMS,
  ON_TIME_GRACE_DAYS,
  PERIODS,
  buildCycles,
  everyText,
  cycleSummary,
  flagFor,
  leakWindows,
  limitsFor,
  monthTicks,
  paramValue,
  periodRange,
  tickLabel,
  toTime,
  trendWarning,
} from "../pointHistory";

// Oil Equipment E3 — one lubrication point's history on one real time axis.
// What shows depends on the point:
//   sampled .................. lab values — the Oil Analysis Report's own
//                              charts and Show controls (LabTrendCharts)
//   oil changed on a schedule  oil change cycles (planned vs actual)
//   both ..................... both, stacked
//   changed as needed ........ cycles without planned marks
// and a timeline of samples, changes and top-ups underneath (its period
// buttons — 1 year, 2 years… — apply to the timeline and cycles).

const M = { top: 8, right: 16, left: 0, bottom: 0 };
const SEV_COLOR = { Alert: "danger", Caution: "warning" };
const SAMPLE_STATUS = { Alert: "Alert", Caution: "Caution", Warning: "Caution", Normal: "Normal" };
const STATUS_COLOR = { Alert: "danger", Caution: "warning", Normal: "success" };
const CYCLE_COLOR = { "On time": "success", Late: "warning", Overdue: "danger", Current: "accent" };
// One timeline line: every event sits on it, told apart by its symbol.
const LANE_Y = 1;
const TYPE_LABEL = { Change: "Oil changes", Sample: "Samples", TopUp: "Top-ups" };
const TYPE_ICON = { Change: "ti-droplet", Sample: "ti-flask", TopUp: "ti-droplet-plus" };

// Round axis ticks from 0 to just above max (with room for the C / A
// letters): steps of 1, 2, 2.5 or 5 × 10^n, about four of them.

function fmtNum(v) {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  if (a >= 100) return String(Math.round(v));
  if (a >= 1 || a === 0) return String(Math.round(v * 100) / 100);
  return String(Number(v.toPrecision(2)));
}

function Seg({ T, s, active, onClick, children, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      style={{ ...s.btn, padding: "6px 12px", fontSize: 12.5, borderColor: active ? T.accent : T.border, color: active ? T.accent : T.textSecondary, fontWeight: active ? 700 : 500 }}
    >
      {children}
    </button>
  );
}

function Key({ T, items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: T.textSecondary, margin: "0 0 10px" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {it.symbol && <SymbolIcon T={T} kind={it.symbol} />}
          {it.dot && <span style={{ width: 9, height: 9, borderRadius: "50%", background: it.dot, display: "inline-block" }} />}
          {it.ring && <span style={{ width: 8, height: 8, borderRadius: "50%", border: `2.5px solid ${it.ring}`, display: "inline-block" }} />}
          {it.line && <span style={{ width: 16, height: 0, borderTop: `2px ${it.dashed ? "dashed" : "solid"} ${it.line}`, display: "inline-block" }} />}
          {it.area && <span style={{ width: 14, height: 10, background: it.area, display: "inline-block", borderRadius: 2 }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// The symbol for an event: Normal ●, Caution ▲, Alert ◆ (lab result),
// no result ○, oil change = an oil drop (same as on the lab charts),
// top-up = a small ⊕. `kind` comes from symbolKind(event).
function symbolKind(e) {
  if (e.type === "Change") return "change";
  if (e.type === "TopUp") return "topup";
  return e.status === "Alert" ? "alert" : e.status === "Caution" ? "caution" : e.status === "Normal" ? "normal" : "none";
}
function EventSymbol({ T, kind, x = 0, y = 0, size = 1 }) {
  const k = size;
  if (kind === "change")
    return (
      <path
        d={`M ${x} ${y - 9 * k} C ${x + 6.5 * k} ${y - 2 * k}, ${x + 6.5 * k} ${y + 3 * k}, ${x} ${y + 6 * k} C ${x - 6.5 * k} ${y + 3 * k}, ${x - 6.5 * k} ${y - 2 * k}, ${x} ${y - 9 * k} Z`}
        fill={T.warning}
        stroke={T.cardBg}
        strokeWidth={1.5}
      />
    );
  if (kind === "alert") return <rect x={x - 5.5 * k} y={y - 5.5 * k} width={11 * k} height={11 * k} transform={`rotate(45 ${x} ${y})`} fill={T.danger} stroke={T.cardBg} strokeWidth={1.5} />;
  if (kind === "caution") return <path d={`M ${x} ${y - 7 * k} L ${x + 7 * k} ${y + 5.5 * k} L ${x - 7 * k} ${y + 5.5 * k} Z`} fill={T.warning} stroke={T.cardBg} strokeWidth={1.5} />;
  if (kind === "normal") return <circle cx={x} cy={y} r={5.5 * k} fill={T.success} stroke={T.cardBg} strokeWidth={1.5} />;
  if (kind === "topup")
    return (
      <g>
        <circle cx={x} cy={y} r={5 * k} fill={T.cardBg} stroke={T.accent} strokeWidth={1.6} />
        <path d={`M ${x - 2.6 * k} ${y} H ${x + 2.6 * k} M ${x} ${y - 2.6 * k} V ${y + 2.6 * k}`} stroke={T.accent} strokeWidth={1.6} />
      </g>
    );
  return <circle cx={x} cy={y} r={5 * k} fill={T.cardBg} stroke={T.textSecondary} strokeWidth={1.6} />;
}
function SymbolIcon({ T, kind }) {
  return (
    <svg width="16" height="16" viewBox="-8 -9 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <EventSymbol T={T} kind={kind} size={0.85} />
    </svg>
  );
}

function TipBox({ T, children }) {
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: T.textPrimary, maxWidth: 260 }}>
      {children}
    </div>
  );
}

function TimelineTooltip({ T, active, payload }) {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload;
  if (!e?.type) return null;
  return (
    <TipBox T={T}>
      <div style={{ color: T.textSecondary }}>{formatDate(e.t)}</div>
      <div style={{ fontWeight: 700 }}>{e.title}</div>
      {e.lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </TipBox>
  );
}

function TimelineChart({ T, events, range, ticks, leaks, plannedMarks, nextChangeT, nextSampleT, onOpenEvent }) {
  const shape = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return <g />;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => onOpenEvent(payload)} data-testid={`tl-${payload.type}`} data-symbol={symbolKind(payload)}>
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        <EventSymbol T={T} kind={symbolKind(payload)} x={cx} y={cy} size={payload.type === "Change" ? 1.15 : 1} />
        {payload.tag && (
          <text x={cx} y={cy - 15} textAnchor="middle" fontSize={10} fontWeight={payload.color === "warning" ? 700 : 400} fill={payload.color === "warning" ? T.warning : T.textSecondary}>
            {payload.tag}
          </text>
        )}
      </g>
    );
  };
  const plannedShape = (props) => {
    const { cx, cy } = props;
    if (cx == null || cy == null) return <g />;
    return <line x1={cx} x2={cx} y1={cy - 11} y2={cy + 11} stroke={T.textSecondary} strokeWidth={2} strokeDasharray="3 2" />;
  };
  const byType = (type) => events.filter((e) => e.type === type);
  return (
    <ResponsiveContainer width="100%" height={120}>
      <ScatterChart margin={{ ...M, top: 22 }}>
        <XAxis
          type="number"
          dataKey="t"
          scale="time"
          domain={[range.start, range.end]}
          ticks={ticks}
          tickFormatter={tickLabel}
          allowDataOverflow
          tick={{ fontSize: 12, fill: T.textSecondary }}
          axisLine={{ stroke: T.border }}
          tickLine={false}
        />
        <YAxis type="number" dataKey="y" width={12} domain={[0.4, 1.6]} ticks={[]} axisLine={false} tickLine={false} />
        <ReferenceLine y={LANE_Y} stroke={T.border2} strokeWidth={3} ifOverflow="visible" />
        {leaks.map((w) => (
          <ReferenceArea
            key={w.from}
            x1={w.from - 2 * DAY}
            x2={w.to + 2 * DAY}
            y1={0.6}
            y2={1.4}
            fill={T.danger}
            fillOpacity={0.15}
            stroke="none"
            ifOverflow="hidden"
            label={{ value: "Possible leak", position: "insideTopLeft", fill: T.textSecondary, fontSize: 12 }}
          />
        ))}
        {nextChangeT && (
          <ReferenceLine x={nextChangeT} stroke={T.accent} strokeDasharray="5 4" ifOverflow="hidden" label={{ value: "Next change", position: "top", fill: T.textSecondary, fontSize: 12 }} />
        )}
        {nextSampleT && (
          <ReferenceLine x={nextSampleT} stroke={T.info} strokeDasharray="2 3" ifOverflow="hidden" label={{ value: "Next sample", position: "insideBottomRight", fill: T.textSecondary, fontSize: 12 }} />
        )}
        <Tooltip content={<TimelineTooltip T={T} />} cursor={false} isAnimationActive={false} />
        <Scatter data={plannedMarks} shape={plannedShape} isAnimationActive={false} />
        <Scatter data={byType("TopUp")} shape={shape} isAnimationActive={false} />
        <Scatter data={byType("Sample")} shape={shape} isAnimationActive={false} />
        <Scatter data={byType("Change")} shape={shape} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function CyclePanel({ T, cycles, summary, asNeeded, isMobile }) {
  const [showAll, setShowAll] = useState(false);
  const newestFirst = [...cycles].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, 6);
  const maxDays = Math.max(1, ...cycles.map((c) => Math.max(c.days, c.plannedDays || 0)));
  const statusText = (c) => {
    if (c.status === "Late") return `Late ${c.lateDays} d`;
    if (c.status === "On time") return c.lateDays > 0 ? `On time (+${c.lateDays} d)` : "On time";
    if (c.status === "Overdue") return `Overdue ${c.lateDays} d`;
    if (c.current && c.planned) return `Due in ${-c.lateDays} d`;
    return c.current ? "Current" : "—";
  };
  const tile = (label, value, testid) => (
    <div data-testid={testid} style={{ background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: 12, color: T.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
  return (
    <div data-testid="cycle-panel">
      <div data-testid="cycle-summary" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {!asNeeded && tile("Changed on time", summary.onTimeRate === null ? "—" : `${summary.onTime} of ${summary.judged} (${summary.onTimeRate}%)`, "cycle-ontime")}
        {!asNeeded && tile("Average days late", summary.avgDaysLate === null ? "—" : `${summary.avgDaysLate} d`, "cycle-avglate")}
        {tile("Average cycle", summary.avgDays === null ? "—" : `${summary.avgDays} d`, "cycle-avgdays")}
        {tile("Top-ups per cycle", summary.avgTopUpLitres === null ? "—" : `${summary.avgTopUpLitres} L`, "cycle-avgtopup")}
      </div>
      {!asNeeded && (
        <Key
          T={T}
          items={[
            { dot: T.success, label: "Changed on time" },
            { dot: T.warning, label: `Late (over ${ON_TIME_GRACE_DAYS} d)` },
            { dot: T.accent, label: "Current oil" },
            { dot: T.danger, label: "Overdue" },
            { line: T.textPrimary, label: "Planned change" },
          ]}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((c) => {
          const color = T[CYCLE_COLOR[c.status]] || T.accent;
          const lifePct = c.current && c.plannedDays ? Math.round((c.days / c.plannedDays) * 100) : null;
          return (
            <div key={c.index} data-testid={`cycle-row-${c.index}`} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr 150px", gap: isMobile ? 4 : 12, alignItems: "center" }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>
                  {c.current ? "Current oil" : `Cycle ${c.index}`} · {formatDate(c.start)}
                  {!c.current && ` → ${formatDate(c.end)}`}
                </div>
                <div style={{ color: T.textSecondary }}>{c.oil || "Oil not recorded"}</div>
              </div>
              <div>
                <div style={{ position: "relative", height: 12, background: T.cardSubBg, borderRadius: 4 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (c.days / maxDays) * 100)}%`, background: color, borderRadius: 4 }} />
                  {c.plannedDays !== null && (
                    <div
                      title={`Planned ${formatDate(c.planned)}`}
                      style={{ position: "absolute", top: -3, bottom: -3, width: 2, left: `calc(${Math.min(100, (c.plannedDays / maxDays) * 100)}% - 1px)`, background: T.textPrimary }}
                    />
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 3 }}>
                  <span style={{ color: T.textPrimary, fontWeight: 700 }}>{statusText(c)}</span> · {c.days} d
                  {c.plannedDays !== null && ` of ${c.plannedDays} d planned`}
                  {lifePct !== null && ` · ${lifePct}% of oil life used`}
                  {c.current && c.planned && ` · next due ${formatDate(c.planned)}`}
                </div>
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary }}>
                Top-ups <strong style={{ color: T.textPrimary }}>{c.topUps}</strong> · {c.topUpLitres} L
                <br />
                Oil used <strong style={{ color: T.textPrimary }}>{c.oilUsed} L</strong>
              </div>
            </div>
          );
        })}
      </div>
      {!showAll && newestFirst.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: "8px 0", fontSize: 12.5 }}>
          Show all {newestFirst.length} cycles
        </button>
      )}
    </div>
  );
}

function TimelineList({ T, events, onOpenEvent }) {
  const desc = [...events].sort((a, b) => b.t - a.t);
  return (
    <div data-testid="ph-timeline-list" style={{ borderLeft: `2px solid ${T.border2}`, marginLeft: 8, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      {desc.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onOpenEvent(e)}
          style={{ position: "relative", textAlign: "left", background: "none", border: "none", padding: "4px 0", cursor: "pointer", color: T.textPrimary, minHeight: 32 }}
        >
          <span style={{ position: "absolute", left: -23, top: 6, background: T.cardBg, lineHeight: 0 }}>
            <SymbolIcon T={T} kind={symbolKind(e)} />
          </span>
          <div style={{ fontSize: 12, color: T.textSecondary }}>{formatDate(e.t)}</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            <i className={`ti ${TYPE_ICON[e.type]}`} aria-hidden="true" /> {e.title}
          </div>
          {e.lines.map((l) => (
            <div key={l} style={{ fontSize: 12, color: T.textSecondary }}>
              {l}
            </div>
          ))}
        </button>
      ))}
    </div>
  );
}

export default function PointHistory({ reg, samples, sameOilSamples, changes, topUps, nextChangeDue, nextSampleDue, onOpenSample, onOpenChanges, onOpenTopUps }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState("2y");
  const [view, setView] = useState("chart");
  const [types, setTypes] = useState({ Change: true, Sample: true, TopUp: true });
  // Lab charts: the Oil Analysis Report's own controls and charts (shared).
  const [labCount, setLabCount] = useState("10");
  const [labSinceChange, setLabSinceChange] = useState(false);
  const [now] = useState(() => Date.now());

  const samplesAsc = useMemo(
    () => (samples || []).map((sm) => ({ sm, t: toTime(sm.sampledDate) })).filter((x) => x.t !== null).sort((a, b) => a.t - b.t).map((x) => ({ ...x.sm, _t: x.t })),
    [samples]
  );
  const changesAsc = useMemo(
    () => (changes || []).map((c) => ({ ...c, _t: toTime(c.eventDate) })).filter((c) => c._t !== null).sort((a, b) => a._t - b._t),
    [changes]
  );
  const lastChangeTime = changesAsc.length ? changesAsc[changesAsc.length - 1]._t : null;
  const labShown = pickSamples(samplesAsc, { count: labCount, sinceChange: labSinceChange, lastChangeTime });
  const interval = reg?.oilChangeInterval || "";
  const asNeeded = !intervalMonths(interval);
  const sampled = reg?.oilAnalysisRequired === "Yes" || samplesAsc.length > 0;
  const showCycles = changesAsc.length > 0 || !asNeeded;

  // Built from changesAsc so each cycle's change objects are the timeline's own.
  const cycles = useMemo(() => buildCycles({ changes: changesAsc, topUps, interval, now }), [changesAsc, topUps, interval, now]);
  const summary = useMemo(() => cycleSummary(cycles), [cycles]);
  const nextChangeT = toTime(nextChangeDue) || (cycles.length ? cycles[cycles.length - 1].planned : null);
  const nextSampleT = nextSampleDue ? toTime(nextSampleDue) : null;

  const firstTime = Math.min(
    ...[samplesAsc[0]?._t, changesAsc[0]?._t, ...(topUps || []).map((t) => toTime(t.eventDate))].filter((t) => t !== null && t !== undefined),
    now
  );
  const range = periodRange(period, { now, firstTime, lastChangeTime, futureTimes: [nextChangeT, nextSampleT] });
  const ticks = monthTicks(range.start, range.end);
  const inRange = (t) => t >= range.start && t <= range.end;

  // Lab values: limits, trends, which have data.
  const lab = useMemo(() => {
    return LAB_PARAMS.map((p) => {
      const has = samplesAsc.some((sm) => paramValue(sm, p) !== null);
      if (!has) return null;
      const limits = limitsFor(p, samplesAsc, sameOilSamples || []);
      const trend = trendWarning(samplesAsc, p, limits?.direction || (p.low ? "down" : "up"), lastChangeTime);
      const flagged = samplesAsc.filter((sm) => flagFor(sm, p)).length;
      return { p, limits, trend, flagged };
    }).filter(Boolean);
  }, [samplesAsc, sameOilSamples, lastChangeTime]);

  const topics = LAB_GROUPS.map((g) => ({ group: g, items: lab.filter((x) => x.p.group === g) })).filter((g) => g.items.length);
  const trends = lab.filter((x) => x.trend);

  // Timeline events.
  const prevCycleOf = (c) => cycles.find((x) => x.nextChange === c) || null;
  const events = useMemo(() => {
    const out = [];
    let prevOil = "";
    changesAsc.forEach((c, i) => {
      const prev = prevCycleOf(c);
      const judged = prev && (prev.status === "On time" || prev.status === "Late") ? prev : null;
      const lines = [`${c.quantityUsed || "—"} L${c.oilBrandType ? ` · ${c.oilBrandType}` : ""}`];
      if (judged?.planned) lines.push(`Planned ${formatDate(judged.planned)} — ${judged.status === "Late" ? `late ${judged.lateDays} d` : "on time"}`);
      if (c.doneBy) lines.push(`By ${c.doneBy}`);
      const switched = i > 0 && c.oilBrandType && prevOil && c.oilBrandType !== prevOil;
      out.push({
        id: `c${i}`,
        type: "Change",
        t: c._t,
        y: LANE_Y,
        title: switched ? `Oil change — switched to ${c.oilBrandType}` : "Oil change",
        lines,
        color: judged ? (judged.status === "Late" ? "warning" : "success") : "accent",
        tag: judged?.status === "Late" ? `+${judged.lateDays}d` : switched ? c.oilBrandType : "",
        ref: c,
      });
      prevOil = c.oilBrandType || prevOil;
    });
    samplesAsc.forEach((sm, i) => {
      const st = SAMPLE_STATUS[sm.reportStatus] || "";
      const flags = (sm.flaggedReadings || []).map((f) => `${f.param} ${f.severity}`).join(", ");
      out.push({
        id: `s${i}`,
        type: "Sample",
        t: sm._t,
        y: LANE_Y,
        title: `Sample ${sm.sampleId || ""} — ${sm.reportStatus || "no result"}`,
        lines: flags ? [`Lab marks: ${flags}`] : [],
        color: STATUS_COLOR[st] || "textSecondary",
        status: st,
        ref: sm,
      });
    });
    (topUps || []).forEach((tu, i) => {
      const t = toTime(tu.eventDate);
      if (t === null) return;
      out.push({ id: `t${i}`, type: "TopUp", t, y: LANE_Y, title: `Top-up ${tu.quantity || "—"} L`, lines: [tu.reason, tu.oilBrandType].filter(Boolean), color: "accent", ref: tu });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesAsc, samplesAsc, topUps, cycles]);
  const shownEvents = events.filter((e) => types[e.type] && inRange(e.t));
  const leaks = leakWindows(topUps).filter((w) => w.to >= range.start && w.from <= range.end);
  const plannedMarks = types.Change
    ? cycles.filter((c) => !c.current && c.planned !== null && inRange(c.planned)).map((c) => ({ t: c.planned, y: LANE_Y, type: "", planned: true }))
    : [];

  function openEvent(e) {
    if (e.type === "Sample") onOpenSample?.(e.ref);
    else if (e.type === "Change") onOpenChanges?.(e.ref);
    else if (e.type === "TopUp") onOpenTopUps?.(e.ref);
  }

  const sectionTitle = (text, sub) => (
    <div style={{ margin: "18px 0 10px" }}>
      <p style={{ fontWeight: 700, margin: 0 }}>{text}</p>
      {sub && <p style={{ fontSize: 12, color: T.textSecondary, margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );

  return (
    <div style={{ ...s.card, marginBottom: 20 }} data-testid="point-history">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ fontWeight: 700, margin: 0 }}>Lubrication History</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Seg T={T} s={s} active={view === "chart"} onClick={() => setView("chart")} testid="ph-view-chart">
            Chart
          </Seg>
          <Seg T={T} s={s} active={view === "table"} onClick={() => setView("table")} testid="ph-view-table">
            Table
          </Seg>
        </div>
      </div>

      {sampled && (
        <>
          {sectionTitle("Lab values", "The same charts as the Oil Analysis Report.")}
          {lab.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No lab values recorded yet.</p>
          ) : (
            <>
              {trends.length > 0 && (
                <div data-testid="ph-trend-warnings" style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {trends.map(({ p, trend }) => (
                    <div key={p.key} style={{ fontSize: 12.5 }}>
                      <i className={`ti ${trend.direction === "rising" ? "ti-trending-up" : "ti-trending-down"}`} aria-hidden="true" style={{ color: T.warning, marginRight: 6 }} />
                      <strong>{p.label}</strong> {trend.direction} {trend.values.length} samples in a row since the last oil change:{" "}
                      {trend.values.map(fmtNum).join(" → ")} {p.unit}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <LabCountControls
                  T={T}
                  s={s}
                  count={labCount}
                  setCount={setLabCount}
                  sinceChange={labSinceChange}
                  setSinceChange={setLabSinceChange}
                  lastChangeTime={lastChangeTime}
                  shown={labShown.length}
                  total={samplesAsc.length}
                  testPrefix="ph-lab"
                />
              </div>
              {labShown.length === 0 ? (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No samples since the last oil change ({formatDate(lastChangeTime)}).</p>
              ) : view === "chart" ? (
                <LabTrendCharts T={T} history={labShown} changes={changesAsc} layout="grid" testPrefix="lab" />
              ) : (
                <div data-testid="lab-table" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {topics.map((g) => (
                    <div key={g.group} style={{ overflowX: "auto" }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{g.group}</div>
                      <table style={{ ...s.table, fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={s.th}>Date</th>
                            <th style={s.th}>Sample</th>
                            <th style={s.th}>Result</th>
                            {g.items.map((x) => (
                              <th key={x.p.key} style={s.th}>
                                {x.p.key}
                                {x.p.unit ? ` (${x.p.unit})` : ""}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...labShown].reverse().map((sm) => (
                            <tr key={sm._id || sm.sampleId} onClick={() => onOpenSample?.(sm)} style={{ cursor: "pointer" }}>
                              <td style={s.td}>{formatDate(sm.sampledDate)}</td>
                              <td style={s.td}>{sm.sampleId}</td>
                              <td style={s.td}>{sm.reportStatus || "—"}</td>
                              {g.items.map((x) => {
                                const f = flagFor(sm, x.p);
                                return (
                                  <td key={x.p.key} style={{ ...s.td, background: f ? `${T[SEV_COLOR[f]]}22` : undefined, fontWeight: f ? 700 : undefined }}>
                                    {fmtNum(paramValue(sm, x.p))}
                                    {f ? ` ${f}` : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          <tr>
                            <td style={{ ...s.td, color: T.textSecondary }} colSpan={3}>
                              Limits (Caution / Alert)
                            </td>
                            {g.items.map((x) => (
                              <td key={x.p.key} style={{ ...s.td, color: T.textSecondary }}>
                                {x.limits ? `${fmtNum(x.limits.caution)} / ${fmtNum(x.limits.alert)}` : "—"}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCycles &&
        (sectionTitle(
          "Oil change cycles",
          asNeeded ? "This point is changed as needed — no planned date to compare with." : `Planned every ${everyText(interval)}. On time = changed within ${ON_TIME_GRACE_DAYS} days of the due date.`
        ))}
      {showCycles &&
        (cycles.length === 0 ? (
          <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No oil changes logged yet.</p>
        ) : (
          <CyclePanel T={T} cycles={cycles} summary={summary} asNeeded={asNeeded} isMobile={isMobile} />
        ))}

      {sectionTitle("Timeline", "Click an event to open it.")}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {PERIODS.map((pr) => (
          <Seg key={pr.id} T={T} s={s} active={period === pr.id} onClick={() => setPeriod(pr.id)} testid={`ph-period-${pr.id}`}>
            {pr.label}
          </Seg>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.keys(TYPE_LABEL).map((k) => (
          <Seg key={k} T={T} s={s} active={types[k]} onClick={() => setTypes((t) => ({ ...t, [k]: !t[k] }))} testid={`ph-type-${k}`}>
            <i className={`ti ${TYPE_ICON[k]}`} aria-hidden="true" /> {TYPE_LABEL[k]} <span style={{ color: T.textSecondary, fontWeight: 500 }}>{events.filter((e) => e.type === k && inRange(e.t)).length}</span>
          </Seg>
        ))}
      </div>
      {shownEvents.length === 0 && !nextChangeT && !nextSampleT ? (
        <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Nothing logged in this period.</p>
      ) : view === "table" ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...s.table, fontSize: 12 }} data-testid="timeline-table">
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Event</th>
                <th style={s.th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {[...shownEvents].sort((a, b) => b.t - a.t).map((e) => (
                <tr key={e.id} onClick={() => openEvent(e)} style={{ cursor: "pointer" }}>
                  <td style={s.td}>{formatDate(e.t)}</td>
                  <td style={s.td}>{e.title}</td>
                  <td style={{ ...s.td, color: T.textSecondary }}>{e.lines.join(" · ")}</td>
                </tr>
              ))}
              {leaks.map((w) => (
                <tr key={`leak${w.from}`}>
                  <td style={s.td}>{formatDate(w.from)}</td>
                  <td style={s.td}>Possible leak</td>
                  <td style={{ ...s.td, color: T.textSecondary }}>{w.count} top-ups between {formatDate(w.from)} and {formatDate(w.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isMobile ? (
        <>
          {(nextChangeT || nextSampleT) && (
            <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
              {nextChangeT && <>Next change <strong>{formatDate(nextChangeT)}</strong>. </>}
              {nextSampleT && <>Next sample <strong>{formatDate(nextSampleT)}</strong>.</>}
            </p>
          )}
          {leaks.length > 0 && (
            <p style={{ fontSize: 12.5, margin: "0 0 10px" }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger }} /> Possible leak: {leaks.map((w) => `${w.count} top-ups ${formatDate(w.from)} – ${formatDate(w.to)}`).join("; ")}
            </p>
          )}
          <TimelineList T={T} events={shownEvents} onOpenEvent={openEvent} />
        </>
      ) : (
        <div data-testid="ph-timeline">
          <Key
            T={T}
            items={[
              { symbol: "normal", label: "Normal" },
              { symbol: "caution", label: "Caution" },
              { symbol: "alert", label: "Alert" },
              { symbol: "change", label: "Oil change (+d = late)" },
              { symbol: "topup", label: "Top-up" },
              { line: T.textSecondary, dashed: true, label: "Planned change" },
              { line: T.accent, dashed: true, label: "Next due" },
              { area: `${T.danger}33`, label: "Possible leak" },
            ]}
          />
          <TimelineChart
            T={T}
            events={shownEvents}
            range={range}
            ticks={ticks}
            leaks={leaks}
            plannedMarks={plannedMarks}
            nextChangeT={nextChangeT && inRange(nextChangeT) ? nextChangeT : null}
            nextSampleT={nextSampleT && inRange(nextSampleT) ? nextSampleT : null}
            onOpenEvent={openEvent}
          />
        </div>
      )}
    </div>
  );
}

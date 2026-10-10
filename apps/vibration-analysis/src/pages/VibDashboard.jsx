import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibDashboard, peekCached } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import { Donut, StackedBars } from "../components/DashCharts";
import Tile, { PageHeader } from "../components/Tile";
import { LevelPill, LevelSymbol } from "../components/Level";
import { LEVEL_RANK, LEVELS, levelColor, levelInk } from "../levels";
import { monthLabel, shortDate } from "../vibModel";
import { generateVibDashboardPdf } from "../vibPdf";

// Vibration Dashboard: the plant's machine condition at a glance (one
// request, backend Dashboard.js). Tiles → the list behind them; the
// "machines measured" grid (per area per month) opens the Measurement
// Tracker; condition by area filters the donut and the worst machines; a
// worst machine opens its Equipment page.

// "Not read" window: Settings → Vibration Analysis → Intervals (default 6 months)
const NOT_READ_DEFAULT = 6;
const PERIODS = [
  { id: 3, label: "3 m" },
  { id: 6, label: "6 m" },
  { id: 12, label: "12 m" },
];
const shortMonth = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-GB", { month: "short" });
const unitOf = (f) => (f === "RMS" ? "mm/s" : f === "SPM" ? "dBsv" : "g");

export default function VibDashboard({ webhookUrl, onOpenMachine, onOpenPage }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  // the last answer kept on this device first (dataCache.js), then the server's
  const [d, setD] = useState(() => peekCached("getVibDashboard"));
  const [error, setError] = useState("");
  const [contractor, setContractor] = useState("All");
  const [period, setPeriod] = useState(() => (typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px)").matches ? 6 : 12));
  const [scope, setScope] = useState(null); // an area: "Line 1", "CM#1"…
  const [busyPdf, setBusyPdf] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await getVibDashboard(webhookUrl);
      // an unexpected answer (old server, error page) shows the error card
      // with Retry instead of breaking the page
      if (!res || !Array.isArray(res.months) || !Array.isArray(res.machines)) {
        setD(null);
        setError(res?.error || "The server sent an unexpected answer. Check the connection and try again.");
        return;
      }
      setD(res);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl]);
  useEffect(() => {
    load();
  }, [load]);

  const me = d?.me || {};
  const months = (d?.months || []).slice(-period);
  const NOT_READ_MONTHS = Math.min(d?.months?.length || 12, Number(d?.notReadMonths) || NOT_READ_DEFAULT);
  const cutoff = d ? d.months[d.months.length - NOT_READ_MONTHS] : "";
  const inC = (c) => contractor === "All" || c === contractor;
  const allMachines = useMemo(() => (d?.machines || []).filter((m) => inC(m.contractor)), [d, contractor]); // eslint-disable-line react-hooks/exhaustive-deps
  const machines = allMachines.filter((m) => !scope || m.area === scope);
  const notRead = (m) => !m.lastMonth || m.lastMonth < cutoff;
  const condOf = (m) => (notRead(m) ? "Not read" : m.status || "Not read");
  // machines measured per area per month (backend MeasurementTracker.js); areas also filter the condition cards
  // (the contractor chips keep the areas where that contractor has machines)
  const grid = (d?.grid || []).filter((g) => allMachines.some((m) => m.area === g.area));
  const scopes = grid.map((g) => ({ key: g.area, label: g.area }));
  const notReadColor = T.textMuted || T.textSecondary;
  const segs = [...LEVELS.map((lv) => ({ label: lv, value: machines.filter((m) => condOf(m) === lv).length, color: levelColor(T, lv) })), { label: `Not read ${NOT_READ_MONTHS} m`, value: machines.filter((m) => condOf(m) === "Not read").length, color: notReadColor + "66" }];
  const danger = allMachines.filter((m) => !notRead(m) && m.status === "Danger");
  const alert = allMachines.filter((m) => !notRead(m) && m.status === "Alert");
  const thisMonth = d?.today?.slice(0, 7);
  const newAlert = alert.filter((m) => m.lastMonth === thisMonth && !["Alert", "Danger"].includes(m.prevStatus)).length;
  const worst = [...machines]
    .filter((m) => !notRead(m) && (LEVEL_RANK[m.status] || 0) >= 2)
    .sort((a, b) => (LEVEL_RANK[b.status] || 0) - (LEVEL_RANK[a.status] || 0) || (b.worstPoint?.ratio || 0) - (a.worstPoint?.ratio || 0))
    .slice(0, 8);
  const lastMeasured = allMachines.reduce((best, m) => (m.lastDate && m.lastDate > best ? m.lastDate : best), "");
  const onTimePct = d && d.onTime.due ? Math.round((d.onTime.onTime / d.onTime.due) * 100) : null;

  // share of machines measured that month: ≥ 90 % green, ≥ 70 % amber, below red; none due → light
  const cellStyle = (c) => {
    const base = { width: "100%", height: 26, borderRadius: 6, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700 };
    if (c.pct == null) return { ...base, background: `${T.textMuted || T.textSecondary}22`, color: T.textSecondary };
    if (c.pct >= 90) return { ...base, background: T.success, color: "#fff" };
    if (c.pct >= 70) return { ...base, background: T.warning, color: "#fff" };
    return { ...base, background: T.dangerBg, border: `2px solid ${T.danger}`, color: T.danger };
  };
  const legend = [
    ["90 % or more measured", T.success],
    ["70–89 %", T.warning],
    ["Under 70 %", T.danger, true],
    ["No machines due", `${T.textMuted || T.textSecondary}22`],
  ];

  const pdf = async () => {
    setBusyPdf(true);
    try {
      await generateVibDashboardPdf({ d, contractor, machines: allMachines.map((m) => ({ ...m, status: notRead(m) ? "" : m.status })), grid, months });
    } finally {
      setBusyPdf(false);
    }
  };

  const card = { ...s.card, marginBottom: 0, minWidth: 0 };
  const cardTitle = (t, hint) => (
    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12, color: T.textPrimary }}>
      {t} {hint && <span style={{ fontWeight: 400, fontSize: 12, color: T.textSecondary }}>{hint}</span>}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-dashboard">
      <PageHeader
        big
        title="Vibration Dashboard"
        subtitle={
          d
            ? [`${allMachines.length} machines`, `${allMachines.reduce((n, m) => n + (m.vibIds || 0), 0).toLocaleString("en-GB")} VIB IDs`, lastMeasured ? `last measured ${shortDate(lastMeasured)}` : "nothing measured yet"].join(" · ")
            : "Loading…"
        }
        right={
          <>
            {!me.contractor && <ContractorChips value={contractor} onChange={(c) => { setContractor(c); setScope(null); }} testid="vd-contractor" />}
            <div role="group" aria-label="Period" style={{ display: "flex", gap: 6 }} data-testid="vd-period">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} style={{ ...s.btn, padding: "6px 14px", fontSize: 12.5, borderRadius: 999, background: period === p.id ? T.accent : T.cardBg, color: period === p.id ? "#fff" : T.textPrimary, borderColor: period === p.id ? T.accent : T.border }}>
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" style={s.btnGhost} onClick={pdf} disabled={!d || busyPdf} data-testid="vd-pdf">
              <i className="ti ti-download" aria-hidden="true" /> {busyPdf ? "Making PDF…" : "PDF"}
            </button>
          </>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          Couldn't load the dashboard: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!d && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {d && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0,1fr))", marginBottom: 14 }}>
            <Tile icon="ti-square-filled" value={danger.length} label="Danger machines" sub={danger.slice(0, 3).map((m) => m.equipmentId).join(" · ") || "none"} tone={danger.length ? levelInk(T, "Danger") : undefined} onClick={() => onOpenPage("equipment")} testid="vd-tile-danger" />
            <Tile icon="ti-diamond-filled" value={alert.length} label="Alert machines" sub={`${newAlert} new this month`} tone={alert.length ? levelInk(T, "Alert") : undefined} onClick={() => onOpenPage("equipment")} testid="vd-tile-alert" />
            <Tile
              icon="ti-calendar-check"
              value={d.measuring.overdue}
              label="Machines overdue for measuring"
              sub={`${d.measuring.dueNow} due now · interval + ${d.measuring.graceDays} days`}
              tone={d.measuring.overdue ? T.danger : undefined}
              onClick={() => onOpenPage("compliance")}
              testid="vd-tile-measuring"
            />
            <Tile icon="ti-clock" value={d.followUps.due} label="Follow-up readings due" sub={`${d.followUps.overdue} overdue · next 14 days`} tone={d.followUps.overdue ? T.warning : undefined} onClick={() => onOpenPage("routes")} testid="vd-tile-followups" />
            <Tile icon="ti-checklist" value={d.actions.open} label="Open vibration actions" sub={`${d.actions.pastDue} past due · ${d.actions.noOwner} no owner`} tone={d.actions.pastDue ? T.danger : undefined} onClick={() => onOpenPage("actions")} testid="vd-tile-actions" />
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,0.75fr) minmax(0,1.6fr)", marginBottom: 12 }}>
            <div style={card} data-testid="vd-condition">
              {cardTitle("Machine condition", scope ? scopes.find((x) => x.key === scope)?.label : "latest final status")}
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <Donut T={T} size={140} segments={segs} center={machines.length} sub="machines" ariaLabel="Machines by latest status" />
                <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, flex: 1, minWidth: 140 }}>
                  {segs.map((x, i) => (
                    <span key={x.label} style={{ display: "flex", gap: 8, alignItems: "center", color: T.textPrimary }}>
                      {i < 4 ? <LevelSymbol level={LEVELS[i]} /> : <span style={{ width: 11, height: 11, borderRadius: 3, background: x.color }} />}
                      {x.label}
                      <b style={{ marginLeft: "auto" }}>{x.value}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={card} data-testid="vd-measured">
              {cardTitle("Machines measured", "share of machines measured each month, by area · tap for the Measurement Tracker")}
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: `${isMobile ? 96 : 150}px repeat(${months.length}, minmax(${period > 6 ? 26 : 40}px, 1fr))`, gap: 6, alignItems: "center", minWidth: isMobile ? 96 + months.length * 32 : 0 }}>
                  <span />
                  {months.map((m) => (
                    <span key={m} style={{ fontSize: 12, color: T.textSecondary, textAlign: "center" }}>
                      {shortMonth(m)}
                    </span>
                  ))}
                  {grid.map((g) => (
                    <div key={g.area} style={{ display: "contents" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.area}</span>
                      {g.cells
                        .filter((c) => months.includes(c.month))
                        .map((c) => {
                          const text = c.pct == null ? "no machines due" : `${c.measured} of ${c.measured + c.missed} machines measured (${c.pct}%)`;
                          return (
                            <button
                              key={c.month}
                              type="button"
                              title={`${g.area} · ${monthLabel(c.month)}: ${text}`}
                              aria-label={`${g.area} ${monthLabel(c.month)}: ${text}`}
                              onClick={() => onOpenPage("compliance")}
                              data-testid={`vd-cell-${g.area}-${c.month}`}
                              style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
                            >
                              <span style={cellStyle(c)}>{c.pct == null || period > 6 ? "" : c.pct}</span>
                            </button>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12, fontSize: 12.5, color: T.textSecondary }}>
                {legend.map(([l, c, dashed]) => (
                  <span key={l} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: dashed ? T.dangerBg : c, border: dashed ? `2px dashed ${c}` : "none", boxSizing: "border-box" }} />
                    {l}
                  </span>
                ))}
                <span style={{ marginLeft: "auto" }} data-testid="vd-ontime">
                  Measured in {d.onTime.year}: <b style={{ color: T.textPrimary }}>{d.onTime.onTime} of {d.onTime.due} machine-months{onTimePct != null ? ` (${onTimePct}%)` : ""}</b>
                  {d.targets && <> · target <b style={{ color: onTimePct != null && onTimePct < d.targets.measured ? T.warning : T.success }}>{d.targets.measured}%</b></>}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)" }}>
            <div style={card} data-testid="vd-scopes">
              {cardTitle("Condition by area", "tap a row to filter")}
              <StackedBars
                T={T}
                labelWidth={isMobile ? 100 : 150}
                activeLabel={scope ? scopes.find((x) => x.key === scope)?.label : null}
                onRow={(r) => {
                  const k = scopes.find((x) => x.label === r.label)?.key;
                  setScope(scope === k ? null : k);
                }}
                rows={scopes.map((sc) => {
                  const l = allMachines.filter((m) => m.area === sc.key);
                  return {
                    label: sc.label,
                    parts: [...LEVELS.map((lv) => ({ label: lv, value: l.filter((m) => condOf(m) === lv).length, color: levelColor(T, lv) })), { label: "Not read", value: l.filter((m) => condOf(m) === "Not read").length, color: notReadColor + "66" }],
                  };
                })}
              />
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: T.textSecondary }}>
                {LEVELS.map((lv) => (
                  <span key={lv} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <LevelSymbol level={lv} /> {lv}
                  </span>
                ))}
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: notReadColor + "66" }} /> Not read {NOT_READ_MONTHS} m
                </span>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {scopes.map((sc) => {
                  const need = allMachines.filter((m) => m.area === sc.key && !notRead(m) && (LEVEL_RANK[m.status] || 0) >= 3).length;
                  return need ? (
                    <span key={sc.key} style={{ fontSize: 12.5, color: T.textSecondary }}>
                      {sc.label}: <b style={{ color: T.alert || T.danger }}>{need} need action</b> (Alert or Danger)
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div style={card} data-testid="vd-worst">
              {cardTitle("Worst machines", "highest reading vs limit, latest report · last 6 months trend")}
              {worst.length === 0 && <div style={{ color: T.textSecondary, fontSize: 13 }}>No machine at Caution or above{scope ? " in this area" : ""}.</div>}
              {worst.map((m) => (
                <button
                  key={m.equipmentId}
                  type="button"
                  onClick={() => onOpenMachine(m.equipmentId)}
                  data-testid={`vd-worst-${m.equipmentId}`}
                  style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "minmax(0,1.3fr) auto minmax(0,1fr) 110px 14px", gap: 10, alignItems: "center", width: "100%", padding: "9px 4px", border: 0, borderBottom: `1px solid ${T.border}`, background: "none", cursor: "pointer", font: "inherit", textAlign: "left", color: T.textPrimary }}
                >
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 13 }}>{m.equipmentId}</b>
                    <span style={{ display: "block", fontSize: 12, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  </span>
                  <LevelPill level={m.status} />
                  {!isMobile && (
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 13 }}>{m.worstPoint?.value != null ? `${m.worstPoint.family === "SPM" ? "HDm " : ""}${m.worstPoint.value} ${unitOf(m.worstPoint.family)}` : "—"}</b>
                      <span style={{ display: "block", fontSize: 12, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.worstPoint?.point || ""} · {shortDate(m.lastDate)}
                      </span>
                    </span>
                  )}
                  {!isMobile && <Spark T={T} values={m.series.map((x) => x.value)} color={levelColor(T, m.status)} label={`${m.family} max per month`} />}
                  {!isMobile && <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: T.textSecondary }} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// A small trend line (monthly max), last point marked.
function Spark({ T, values, color, label }) {
  if (values.length < 2) return <span style={{ fontSize: 12, color: T.textSecondary }}>one report</span>;
  const w = 110;
  const h = 30;
  const max = Math.max(...values) * 1.1 || 1;
  const pts = values.map((v, i) => [(i * (w - 6)) / (values.length - 1) + 3, h - 3 - (v / max) * (h - 6)]);
  return (
    <svg width={w} height={h} role="img" aria-label={`${label}: ${values.join(", ")}`}>
      <title>{`${label}: ${values.join(", ")}`}</title>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}

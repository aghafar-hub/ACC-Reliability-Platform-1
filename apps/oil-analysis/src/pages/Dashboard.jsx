import { useEffect, useMemo, useState } from "react";
import { useFreshTick } from "../dataCache";
import BottomSheet, { SheetButton, SheetChip, SheetGroup } from "../components/BottomSheet";
import { useTheme } from "../ThemeContext";
import { useSessionContractor } from "../SessionContext";
import * as api from "../api";
import { Donut, MiniBars, Ring, Runway, TargetBar } from "../components/DashCharts";
import {
  CONTRACTORS,
  TOP_UP_RISING_MONTHS,
  alertsWithoutAction,
  monthlyCounts,
  oilHealth,
  openActionsOldest,
  overdueOilChanges,
  overdueRoutes,
  periodCounts,
  risingStreak,
  routesOnTime,
  samplingOnTime,
  scopeRegistry,
  stockRunway,
  stockShortages,
} from "../dashboardLogic";
import { fmtNum } from "../inventoryLogic";

// Oil Dashboard (design D4). Top to bottom it answers: what needs doing now
// (four "Needs attention" cards, most urgent first, each opening the list
// behind it), how the plant is doing this period vs the one before (Plant
// health), how activity is trending, and the three lists behind the cards.
// Chart type follows the question — donut for the oil-health split, a ring
// for sampling on time, target bars for routes, small bars per month, a
// runway for days of stock. Phone: the cards become rows, the numbers a
// two-column grid and the long lists fold away.

const PERIODS = [
  { days: 30, label: "30 days", long: "last 30 days", prev: "the 30 days before" },
  { days: 90, label: "3 months", long: "last 3 months", prev: "the 3 months before" },
  { days: 180, label: "6 months", long: "last 6 months", prev: "the 6 months before" },
];

function useIsPhone() {
  const q = "(max-width: 760px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

function Seg({ options, value, onChange, label }) {
  return (
    <div className="odb-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ▲ 12 % — `goodWhenUp` false for things where less is better (top-ups).
function Delta({ T, change, goodWhenUp = true, suffix = "%" }) {
  if (change == null || change === 0) return null;
  const up = change > 0;
  const good = up === goodWhenUp;
  return (
    <span style={{ color: good ? T.success : T.danger, fontWeight: 700 }}>
      {up ? "▲" : "▼"} {Math.abs(change)}
      {suffix === "%" ? " %" : ` ${suffix}`}
    </span>
  );
}

function SplitBars({ T, values }) {
  const max = Math.max(1, ...CONTRACTORS.map((c) => values[c] || 0));
  return (
    <div className="odb-split">
      {CONTRACTORS.map((c) => (
        <div key={c} className="odb-split-row">
          <span>{c}</span>
          <div className="odb-split-track">
            <div style={{ width: `${((values[c] || 0) / max) * 100}%`, background: T.accent }} />
          </div>
          <b>{fmtNum(values[c] || 0)}</b>
        </div>
      ))}
    </div>
  );
}

// "1954 d" is hard to read — a year or more is shown in years.
function fmtLate(days) {
  return days >= 365 ? `${(days / 365).toFixed(1)} y` : `${days} d`;
}

const TONE_ICON = { danger: "ti-alert-triangle", warning: "ti-clock", success: "ti-circle-check" };

function AttentionCard({ T, tone, tag, count, title, rows, more, primary, onPrimary, split, empty, onRow, testid }) {
  const t = count > 0 ? tone : "success";
  const color = T[t];
  return (
    <section className="odb-card odb-att" style={{ borderTopColor: color }} data-testid={testid}>
      <span className="odb-tag" style={{ color, background: color + "1A" }}>
        <i className={`ti ${TONE_ICON[t]}`} aria-hidden="true" /> {tag}
      </span>
      <p className="odb-att-head">
        <b style={{ color: count > 0 ? T.textPrimary : color }}>{count}</b> {title}
      </p>
      {count === 0 ? (
        <p className="odb-muted" style={{ margin: "6px 0 0" }}>
          {empty}
        </p>
      ) : (
        <ul className="odb-att-list">
          {rows.slice(0, 3).map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => onRow?.(r)} title={r.left}>
                <span className={r.mono ? "odb-mono" : ""}>{r.left}</span>
                <b style={{ color: r.tone ? T[r.tone] : color }}>{r.right}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="odb-att-foot">
        <button type="button" className={count > 0 && (tone === "danger") ? "odb-btn odb-btn--primary" : "odb-btn"} onClick={onPrimary}>
          {primary}
        </button>
        <span className="odb-muted">{more || split}</span>
      </div>
    </section>
  );
}

// Phone: one tappable row per attention card.
function AttentionRow({ T, tone, count, title, detail, onClick, testid }) {
  const color = T[count > 0 ? tone : "success"];
  return (
    <button type="button" className="odb-att-row" style={{ borderLeftColor: color }} onClick={onClick} data-testid={testid}>
      <b style={{ color }}>{count}</b>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <i className="ti ti-chevron-right" aria-hidden="true" />
    </button>
  );
}

function Panel({ title, link, onLink, sub, children, phone, count, testid }) {
  if (phone) {
    return (
      <details className="odb-card odb-fold" data-testid={testid}>
        <summary>
          <span>{title}</span>
          <span className="odb-muted">{count}</span>
        </summary>
        <div style={{ marginTop: 10 }}>{children}</div>
      </details>
    );
  }
  return (
    <section className="odb-card" data-testid={testid}>
      <div className="odb-panel-head">
        <h3>{title}</h3>
        {link && (
          <button type="button" className="odb-link" onClick={onLink}>
            {link} <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        )}
      </div>
      {sub && <p className="odb-muted" style={{ margin: "2px 0 12px" }}>{sub}</p>}
      {children}
    </section>
  );
}

function styleSheet(T) {
  return `
.odb { --c-card:${T.cardBg}; --c-border:${T.border}; --c-text:${T.textPrimary}; --c-sub:${T.textSecondary}; --c-accent:${T.accent}; --c-accent-text:${T.accentText}; --c-track:${(T.textMuted || T.textSecondary) + "33"};
  color: var(--c-text); font-family: 'IBM Plex Sans','Segoe UI',Roboto,sans-serif; max-width: 1480px; }
.odb h2 { font-family: 'Space Grotesk','IBM Plex Sans',sans-serif; font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.odb h3 { font-size: 16px; font-weight: 700; margin: 0; }
.odb-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
.odb-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.odb-chip-filter, .odb-chip-on, .odb-chip-off { flex: 0 0 auto; min-height: 36px; padding: 0 13px; border-radius: 999px; font: 600 13px inherit; font-family: inherit; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.odb-chip-filter { border: 1px solid ${T.accent}66; background: ${T.accent}14; color: ${T.accent}; }
.odb-chip-on { border: 1px solid ${T.accent}; background: ${T.accent}; color: ${T.accentText}; }
.odb-chip-off { border: 1px solid ${T.border}; background: ${T.cardBg}; color: ${T.textSecondary}; }
/* filters = round chips, the same as ContractorChips on every other page */
.odb-seg { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.odb-seg button { border: 1px solid var(--c-border); background: var(--c-card); color: var(--c-sub); font: 500 12.5px inherit; font-family: inherit; padding: 6px 14px; border-radius: 999px; cursor: pointer; }
.odb-seg button.on { background: var(--c-accent); border-color: var(--c-accent); color: var(--c-accent-text); font-weight: 700; }
.odb-select { height: 33px; border: 1px solid var(--c-border); border-radius: 6px; background: var(--c-card); color: var(--c-text); padding: 0 10px; font: 400 13px inherit; font-family: inherit; }
.odb-btn { border: 1px solid var(--c-border); background: var(--c-card); color: var(--c-accent); font: 600 13px inherit; font-family: inherit; padding: 8px 14px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.odb-btn--primary { background: var(--c-accent); color: var(--c-accent-text); border-color: var(--c-accent); }
.odb-link { border: 0; background: none; color: var(--c-accent); font: 600 13.5px inherit; font-family: inherit; cursor: pointer; padding: 0; }
.odb-muted { color: var(--c-sub); font-size: 13px; }
.odb-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12.5px; }
.odb-section { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 10px; flex-wrap: wrap; }
.odb-section h3 { font-size: 17px; }
.odb-card { background: var(--c-card); border: 1px solid var(--c-border); border-radius: 10px; padding: 16px 18px; min-width: 0; }
.odb-grid4 { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
.odb-att { border-top: 4px solid; display: flex; flex-direction: column; }
.odb-tag { align-self: flex-start; display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
.odb-att-head { margin: 10px 0 6px; font-size: 15px; font-weight: 600; }
.odb-att-head b { font-family: 'Space Grotesk',sans-serif; font-size: 30px; margin-right: 4px; vertical-align: -3px; }
.odb-att-list { list-style: none; margin: 0 0 10px; padding: 0; flex: 1; }
.odb-att-list button { display: flex; justify-content: space-between; gap: 10px; width: 100%; border: 0; background: none; color: var(--c-text); padding: 5px 0; font: 400 13.5px inherit; font-family: inherit; cursor: pointer; text-align: left; }
.odb-att-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odb-att-list button:hover span { text-decoration: underline; }
.odb-att-list b { white-space: nowrap; }
.odb-att-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; flex-wrap: wrap; }
.odb-kpis { display: grid; grid-template-columns: 1.45fr repeat(5, minmax(0,1fr)); gap: 14px; }
.odb-kpi { display: flex; flex-direction: column; gap: 6px; text-align: left; font-family: inherit; color: var(--c-text); cursor: pointer; }
.odb-kpi:hover { border-color: var(--c-accent); }
.odb-kpi-label { font-size: 14px; font-weight: 600; }
.odb-kpi-value { font-family: 'Space Grotesk',sans-serif; font-size: 30px; font-weight: 700; line-height: 1.1; }
.odb-kpi-value small { font-size: 15px; color: var(--c-sub); font-weight: 600; }
.odb-kpi-sub { font-size: 13px; color: var(--c-sub); }
.odb-split { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.odb-split-row { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; gap: 8px; font-size: 12.5px; color: var(--c-sub); }
.odb-split-row b { text-align: right; color: var(--c-text); }
.odb-split-track { height: 7px; border-radius: 4px; background: var(--c-track); overflow: hidden; }
.odb-split-track div { height: 100%; border-radius: 4px; }
.odb-legend { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.odb-legend span { display: flex; align-items: center; gap: 7px; }
.odb-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.odb-row2 { display: grid; grid-template-columns: 1.75fr 1fr; gap: 14px; margin-top: 14px; }
.odb-row3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 14px; }
.odb-panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.odb-trend { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 4px; }
.odb-trend > div + div { border-left: 1px solid var(--c-border); padding-left: 18px; }
.odb-trend-title { font-weight: 600; font-size: 14px; margin: 0; }
.odb-trend-now { margin: 2px 0 10px; font-size: 13px; color: var(--c-sub); }
.odb-trend-now b { font-family: 'Space Grotesk',sans-serif; font-size: 22px; color: var(--c-text); margin-right: 4px; }
.odb-target-row { margin-bottom: 14px; }
.odb-target-line { display: flex; align-items: center; gap: 12px; }
.odb-target-line > b:first-child { width: 44px; font-size: 14px; }
.odb-target-line > b:last-child { width: 46px; text-align: right; font-size: 15px; }
.odb-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.odb-table th { text-align: left; font-weight: 600; color: var(--c-sub); font-size: 12.5px; padding: 6px 8px; border-bottom: 1px solid var(--c-border); }
.odb-table td { padding: 9px 8px; border-bottom: 1px solid var(--c-border); vertical-align: top; }
.odb-table tr:last-child td { border-bottom: 0; }
.odb-table tbody tr { cursor: pointer; }
.odb-table tbody tr:hover td { background: color-mix(in srgb, var(--c-accent) 6%, transparent); }
.odb-table small { display: block; color: var(--c-sub); font-size: 12.5px; }
.odb-pill { display: inline-flex; gap: 4px; align-items: center; font-size: 12.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.odb-att-row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; background: var(--c-card); border: 1px solid var(--c-border); border-left: 4px solid; border-radius: 10px; padding: 12px 14px; color: var(--c-text); font-family: inherit; cursor: pointer; }
.odb-att-row > b { font-family: 'Space Grotesk',sans-serif; font-size: 28px; min-width: 34px; text-align: center; }
.odb-att-row span { flex: 1; min-width: 0; }
.odb-att-row strong { display: block; font-size: 15px; }
.odb-att-row small { display: block; font-size: 13px; color: var(--c-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.odb-att-row .ti { color: var(--c-accent); font-size: 18px; }
.odb-fold summary { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; cursor: pointer; list-style: none; }
.odb-fold summary::-webkit-details-marker { display: none; }
@media (max-width: 1280px) {
  .odb-kpis { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .odb-row3 { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 1080px) {
  .odb-grid4 { grid-template-columns: 1fr 1fr; }
  .odb-row2 { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .odb h2 { font-size: 22px; }
  .odb-controls { width: 100%; }
  .odb-kpis { grid-template-columns: 1fr 1fr; gap: 10px; }
  .odb-kpis .odb-health { grid-column: 1 / -1; }
  .odb-kpi-value { font-size: 26px; }
  .odb-card { padding: 14px; }
  .odb-row3 { grid-template-columns: 1fr; gap: 10px; margin-top: 10px; }
  .odb-row2 { gap: 10px; margin-top: 10px; }
  .odb-trend { grid-template-columns: 1fr; }
  .odb-trend > div + div { border-left: 0; padding-left: 0; border-top: 1px solid var(--c-border); padding-top: 12px; }
  .odb-hide-phone { display: none; }
}
`;
}

export default function Dashboard({ samples, actions, oilChangeEvents, oilChanges, trackerByEquip, equipmentRegistry, webhookUrl, navigate }) {
  const { T } = useTheme();
  const scopedContractor = useSessionContractor();
  const phone = useIsPhone();
  // phone: the filters live in a bottom sheet; one row of chips shows them
  const [filterOpen, setFilterOpen] = useState(false);
  const [contractor, setContractor] = useState(scopedContractor || "All");
  const [area, setArea] = useState("All");
  const [periodDays, setPeriodDays] = useState(90);
  const [exporting, setExporting] = useState(false);

  const [topUps, setTopUps] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [products, setProducts] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [target, setTarget] = useState(api.DEFAULT_ON_TIME_TARGET);
  const [sampleTarget, setSampleTarget] = useState(api.DEFAULT_ON_TIME_TARGET);
  const [loadingExtra, setLoadingExtra] = useState(true);

  const freshTick = useFreshTick(["getAllTopUps", "getRoutines", "getOilInventory", "getDashboardSettings", "getOilInventoryForecast"]); // dataCache.js: load again when the server's answer differs
  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    setLoadingExtra(true);
    Promise.all([
      api.getAllTopUps(webhookUrl).catch(() => []),
      api.getRoutines(webhookUrl).catch(() => []),
      api.getOilInventory(webhookUrl).catch(() => []),
      api.getDashboardSettings(webhookUrl),
    ])
      .then(([tu, ro, prod, settings]) => {
        if (cancelled) return;
        setTopUps(tu);
        setRoutes(ro);
        setProducts(prod);
        setTarget(settings.onTimeTarget);
        setSampleTarget(settings.samplesTarget ?? settings.onTimeTarget);
      })
      .finally(() => {
        if (!cancelled) setLoadingExtra(false);
      });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl, freshTick]);

  // The stock card looks ahead as far as the period looks back.
  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    api
      .getOilInventoryForecast(webhookUrl, { days: periodDays })
      .then((fc) => !cancelled && setForecast(fc))
      .catch(() => !cancelled && setForecast({ forecast: [] }));
    return () => {
      cancelled = true;
    };
  }, [webhookUrl, periodDays]);

  const period = PERIODS.find((p) => p.days === periodDays) || PERIODS[1];
  const activeFilters = (contractor !== "All" ? 1 : 0) + (area !== "All" ? 1 : 0);
  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  const areaOptions = useMemo(() => ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean))).sort()], [registry]);
  const scoped = useMemo(() => scopeRegistry(registry, { contractor, area }), [registry, contractor, area]);
  const codes = useMemo(() => (contractor === "All" && area === "All" ? null : new Set(scoped.map((r) => r.code))), [scoped, contractor, area]);
  const contractorOf = useMemo(() => new Map(registry.map((r) => [r.code, r.contractor])), [registry]);

  const ocRows = useMemo(() => (oilChangeEvents || []).map((e) => ({ date: e.eventDate, contractor: e.contractor || contractorOf.get(e.lpId), code: e.lpId })), [oilChangeEvents, contractorOf]);
  const sampleRows = useMemo(() => (samples || []).map((sm) => ({ date: sm.sampledDate, contractor: contractorOf.get(sm.unitId) || "", code: sm.unitId })), [samples, contractorOf]);
  const topUpRows = useMemo(() => (topUps || []).map((t) => ({ date: t.eventDate, contractor: t.contractor || contractorOf.get(t.lpId), code: t.lpId })), [topUps, contractorOf]);
  const scopedRoutes = useMemo(
    () => (routes || []).filter((r) => (contractor === "All" || r.contractor === contractor) && (area === "All" || !r.area || r.area === area)),
    [routes, contractor, area]
  );

  const m = useMemo(() => {
    const now = new Date();
    const oc = periodCounts(ocRows, codes, periodDays, now);
    const smp = periodCounts(sampleRows, codes, periodDays, now);
    const tu = periodCounts(topUpRows, codes, periodDays, now);
    const sampledPoints = new Set(
      sampleRows.filter((r) => (!codes || codes.has(r.code)) && r.date && new Date(r.date) >= new Date(now.getTime() - periodDays * 86400000)).map((r) => r.code)
    ).size;
    const actionsOpen = openActionsOldest(actions, codes, now);
    const equipBy = { RHI: new Set(), ASEC: new Set() };
    const lpBy = { RHI: 0, ASEC: 0 };
    scoped.forEach((r) => {
      if (equipBy[r.contractor]) equipBy[r.contractor].add(r.equipmentId || r.code);
      if (lpBy[r.contractor] != null) lpBy[r.contractor]++;
    });
    const trendOc = monthlyCounts(ocRows, codes, 6, now);
    const trendSmp = monthlyCounts(sampleRows, codes, 6, now);
    const trendTu = monthlyCounts(topUpRows, codes, 6, now);
    return {
      oc,
      smp,
      tu,
      sampledPoints,
      equipment: new Set(scoped.map((r) => r.equipmentId || r.code)).size,
      points: scoped.length,
      equipBy: { RHI: equipBy.RHI.size, ASEC: equipBy.ASEC.size },
      lpBy,
      overdueOc: overdueOilChanges(oilChanges, codes, now),
      labAlerts: alertsWithoutAction(samples, actions, codes),
      lateRoutes: overdueRoutes(scopedRoutes, "All", now),
      health: oilHealth(samples, codes, periodDays, now),
      sampling: samplingOnTime(scoped, trackerByEquip),
      routesOT: routesOnTime(scopedRoutes, periodDays, now),
      actionsOpen,
      actionsPastDue: actionsOpen.filter((a) => a.stage.label === "Past due").length,
      actionsBy: actionsOpen.reduce((acc, a) => ((acc[a.contractor] = (acc[a.contractor] || 0) + 1), acc), { RHI: 0, ASEC: 0 }),
      trendOc,
      trendSmp,
      trendTu,
      tuRising: risingStreak(trendTu),
    };
  }, [ocRows, sampleRows, topUpRows, codes, periodDays, actions, scoped, oilChanges, samples, scopedRoutes, trackerByEquip]);

  const shortages = useMemo(() => stockShortages(forecast?.forecast, contractor), [forecast, contractor]);
  const runway = useMemo(() => stockRunway(products, forecast?.forecast, contractor).slice(0, 6), [products, forecast, contractor]);
  const lowCount = useMemo(
    () => products.filter((p) => (contractor === "All" || p.contractor === contractor) && p.currentStock != null && p.recorderLevel != null && p.currentStock <= p.recorderLevel).length,
    [products, contractor]
  );

  if (!webhookUrl) {
    return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;
  }

  const splitText = (list, key = "contractor") => {
    const by = { RHI: 0, ASEC: 0 };
    list.forEach((x) => {
      const c = x[key] || contractorOf.get(x.code);
      if (by[c] != null) by[c]++;
    });
    return contractor === "All" ? `RHI ${by.RHI} · ASEC ${by.ASEC}` : "";
  };
  const go = (page, rec) => navigate?.(page, rec);
  const planOilChanges = () => go("routines", { newRoute: { lpId: "", routeType: "Oil Change", workType: "Oil Change", contractor: contractor === "All" ? "" : contractor, reason: "" } });

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const att = [
    {
      key: "oc",
      testid: "att-oilchanges",
      tone: "danger",
      tag: "Overdue",
      count: m.overdueOc.length,
      title: m.overdueOc.length === 1 ? "oil change overdue" : "oil changes overdue",
      rows: m.overdueOc.map((r) => ({ key: r.code, left: r.code, right: fmtLate(r.days), mono: true, code: r.code })),
      primary: "Plan oil changes",
      onPrimary: planOilChanges,
      onRow: (r) => go("equipment", r.code),
      split: splitText(m.overdueOc),
      empty: "Every oil change is on schedule.",
      phoneDetail: m.overdueOc[0] ? `Worst: ${m.overdueOc[0].code} · ${fmtLate(m.overdueOc[0].days)} late` : "All on schedule",
      phoneGo: () => go("oilchange"),
    },
    {
      key: "lab",
      testid: "att-labalerts",
      tone: "danger",
      tag: "Lab alert",
      count: m.labAlerts.length,
      title: m.labAlerts.length === 1 ? "sample in Alert, no action yet" : "samples in Alert, no action yet",
      rows: m.labAlerts.map((r) => ({ key: r.code, left: r.code, right: r.reason, mono: true, code: r.code })),
      primary: "Raise actions",
      onPrimary: () => (m.labAlerts[0] ? go("oilreport", m.labAlerts[0].code) : go("actions")),
      onRow: (r) => go("oilreport", r.code),
      split: splitText(m.labAlerts),
      empty: "Every Alert result has an action.",
      phoneDetail: m.labAlerts.length ? m.labAlerts.slice(0, 3).map((r) => r.code.replace(/^LP-/, "")).join(" · ") : "Every Alert has an action",
      phoneGo: () => (m.labAlerts[0] ? go("oilreport", m.labAlerts[0].code) : go("actions")),
    },
    {
      key: "routes",
      testid: "att-routes",
      tone: "warning",
      tag: "Late routes",
      count: m.lateRoutes.length,
      title: m.lateRoutes.length === 1 ? "route overdue" : "routes overdue",
      rows: m.lateRoutes.map((r) => ({ key: r.routineId, left: r.routeName || r.routineId, right: `${r.days} d`, id: r.routineId })),
      primary: "Open routes",
      onPrimary: () => go("routines"),
      onRow: (r) => go("routines", r.id),
      split: splitText(m.lateRoutes),
      empty: "No route is past due.",
      phoneDetail: m.lateRoutes[0] ? `${m.lateRoutes[0].routeName || m.lateRoutes[0].routineId} ${m.lateRoutes[0].days} days late` : "None past due",
      phoneGo: () => go("routines"),
    },
    {
      key: "stock",
      testid: "att-stock",
      tone: "warning",
      tag: "Stock",
      count: forecast ? shortages.length : 0,
      title: `${shortages.length === 1 ? "oil" : "oils"} short for the next ${period.days === 180 ? "6 months" : period.days === 90 ? "90 days" : "30 days"}`,
      rows: shortages.map((b) => ({ key: b.label, left: b.label, right: b.noProduct && !b.hasStock ? "No stock product" : `${fmtNum(b.shortBy)} L short`, tone: b.noProduct && !b.hasStock ? "warning" : "danger" })),
      primary: "Open inventory",
      onPrimary: () => go("inventory"),
      onRow: () => go("inventory"),
      more: lowCount ? `${lowCount} below low-stock` : "",
      empty: forecast ? "Stock covers the planned work." : "Checking stock…",
      phoneDetail: shortages[0] ? `${shortages[0].label} · ${shortages[0].noProduct && !shortages[0].hasStock ? "no stock product" : `${fmtNum(shortages[0].shortBy)} L short`}` : "Stock covers the planned work",
      phoneGo: () => go("inventory"),
    },
  ];

  const h = m.health;
  const healthSegs = [
    { label: "Normal", value: h.Normal, color: T.success },
    { label: "Caution", value: h.Caution, color: T.warning },
    { label: "Alert", value: h.Alert, color: T.danger },
  ];
  const s = m.sampling;
  const rot = m.routesOT;

  async function exportPdf() {
    setExporting(true);
    try {
      const { generateDashboardPdf } = await import("../reportGenerators");
      await generateDashboardPdf({
        contractor,
        area,
        periodLabel: period.long,
        prevLabel: period.prev,
        target,
        m,
        attention: att.map((a) => ({ tag: a.tag, count: a.count, title: a.title, rows: a.rows.slice(0, 5), empty: a.empty })),
        shortages,
        runway,
      });
    } finally {
      setExporting(false);
    }
  }

  const kpis = (
    <div className="odb-kpis">
      <button type="button" className="odb-card odb-kpi odb-health" onClick={() => go("oilreport")} data-testid="kpi-health">
        <span className="odb-kpi-label">Oil health — latest sample per point</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Donut
            T={T}
            segments={healthSegs}
            size={phone ? 112 : 128}
            center={h.normalPct == null ? "—" : `${h.normalPct}%`}
            sub="Normal"
            ariaLabel={`Oil health: ${h.Normal} Normal, ${h.Caution} Caution, ${h.Alert} Alert`}
          />
          <div className="odb-legend">
            {healthSegs.map((x) => (
              <span key={x.label}>
                <i style={{ background: x.color }} />
                <b>{x.value}</b> {x.label}
              </span>
            ))}
          </div>
        </div>
        {h.deltaPts != null && h.deltaPts !== 0 && (
          <span className="odb-kpi-sub">
            <Delta T={T} change={h.deltaPts} suffix="pts" /> Normal vs {period.prev}
          </span>
        )}
      </button>

      <button type="button" className="odb-card odb-kpi" onClick={() => go("oilchange")} data-testid="kpi-oilchanges">
        <span className="odb-kpi-label">Oil changes</span>
        <span className="odb-kpi-value">{m.oc.total}</span>
        <span className="odb-kpi-sub">
          <Delta T={T} change={m.oc.change} /> {m.oc.change ? "· " : ""}
          {m.overdueOc.length} overdue
        </span>
        {contractor === "All" && !phone && <SplitBars T={T} values={m.oc.byContractor} />}
      </button>

      <button type="button" className="odb-card odb-kpi" onClick={() => go("tracker")} data-testid="kpi-sampling">
        <span className="odb-kpi-label">Sampling on time</span>
        <div style={{ display: "flex", alignItems: "center", gap: phone ? 8 : 12 }}>
          <Ring T={T} pct={s.pct} target={sampleTarget} size={phone ? 68 : 88} color={s.pct != null && s.pct >= sampleTarget ? T.success : T.accent} label={`${s.pct ?? "—"} % of points sampled on time, target ${sampleTarget} %`} />
          <span className="odb-kpi-sub" style={{ lineHeight: 1.5, minWidth: 0 }}>
            <b style={{ color: T.textPrimary, fontSize: 18 }}>{m.smp.total}</b> taken
            {m.smp.change ? (
              <>
                <br />
                <Delta T={T} change={m.smp.change} />
              </>
            ) : null}
            <br />
            target {sampleTarget} %
          </span>
        </div>
        <span className="odb-kpi-sub">
          {s.late} of {s.due} points overdue
        </span>
      </button>

      <button type="button" className="odb-card odb-kpi" onClick={() => go("oilchange")} data-testid="kpi-topups">
        <span className="odb-kpi-label">Emergency top-ups</span>
        <span className="odb-kpi-value">{m.tu.total}</span>
        <span className="odb-kpi-sub">
          <Delta T={T} change={m.tu.change} goodWhenUp={false} /> {m.tu.change ? "· " : ""}lower is better
        </span>
        {contractor === "All" && !phone && <SplitBars T={T} values={m.tu.byContractor} />}
      </button>

      <button type="button" className="odb-card odb-kpi" onClick={() => go("actions")} data-testid="kpi-actions">
        <span className="odb-kpi-label">Open actions</span>
        <span className="odb-kpi-value">{m.actionsOpen.length}</span>
        <span className="odb-kpi-sub" style={{ color: m.actionsPastDue ? T.danger : undefined, fontWeight: m.actionsPastDue ? 700 : 400 }}>
          {m.actionsPastDue} past due
        </span>
        {contractor === "All" && !phone && <SplitBars T={T} values={m.actionsBy} />}
      </button>

      <button type="button" className="odb-card odb-kpi" onClick={() => go("equipment")} data-testid="kpi-equipment">
        <span className="odb-kpi-label">Equipment / LP points</span>
        <span className="odb-kpi-value">
          {fmtNum(m.equipment)} <small>/ {fmtNum(m.points)}</small>
        </span>
        <span className="odb-kpi-sub">{m.sampledPoints} points sampled</span>
        {contractor === "All" && !phone && <SplitBars T={T} values={m.lpBy} />}
      </button>
    </div>
  );

  const trend = (
    <div className="odb-trend">
      {[
        { title: "Oil changes", data: m.trendOc, color: T.accent },
        { title: "Samples", data: m.trendSmp, color: T.accent },
        { title: "Emergency top-ups", data: m.trendTu, color: T.accent, rising: m.tuRising >= TOP_UP_RISING_MONTHS ? m.tuRising : 0 },
      ].map((t) => (
        <div key={t.title} data-testid={`trend-${t.title}`}>
          <p className="odb-trend-title">{t.title}</p>
          <p className="odb-trend-now">
            <b>{t.data[t.data.length - 1].value}</b> this month so far
          </p>
          <MiniBars T={T} data={t.data} color={t.color} ariaLabel={`${t.title} per month: ${t.data.map((d) => `${d.label} ${d.value}`).join(", ")}`} />
          {t.rising > 0 && (
            <p style={{ margin: "8px 0 0", color: T.warning, fontWeight: 700, fontSize: 13 }} data-testid="topup-rising">
              <i className="ti ti-trending-up" aria-hidden="true" /> Rising {t.rising} months in a row — check for leaks
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const routesCard = (
    <div data-testid="routes-ontime">
      {[...(contractor === "All" ? CONTRACTORS : [contractor]), ...(contractor === "All" ? ["All"] : [])].map((c) => {
        const b = rot[c] || { due: 0, onTime: 0, overdueNow: 0, pct: null };
        return (
          <div key={c} className="odb-target-row">
            <div className="odb-target-line">
              <b>{c}</b>
              <TargetBar T={T} pct={b.pct} target={target} color={c === "All" ? T.textSecondary : b.pct != null && b.pct < target ? T.warning : T.accent} />
              <b>{b.pct == null ? "—" : `${b.pct}%`}</b>
            </div>
            <p className="odb-muted" style={{ margin: "4px 0 0 56px" }}>
              {b.due ? `${b.onTime} of ${b.due} on time` : "No routes due in this period"}
              {b.overdueNow > 0 && <span style={{ color: T.danger, fontWeight: 700 }}> · {b.overdueNow} overdue now</span>}
            </p>
          </div>
        );
      })}
      <p className="odb-muted" style={{ margin: 0, display: "flex", gap: 14 }}>
        <span>
          <i style={{ display: "inline-block", width: 14, height: 8, borderRadius: 4, background: T.accent, marginRight: 5 }} />
          On time
        </span>
        <span>
          <i style={{ display: "inline-block", width: 3, height: 12, background: T.textPrimary, marginRight: 5, verticalAlign: -2 }} />
          Target {target} %
        </span>
      </p>
    </div>
  );

  const routesTable =
    m.lateRoutes.length === 0 ? (
      <p className="odb-muted">No route is past due.</p>
    ) : (
      <table className="odb-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Contractor</th>
            <th>Late</th>
          </tr>
        </thead>
        <tbody>
          {m.lateRoutes.slice(0, 5).map((r) => (
            <tr key={r.routineId} onClick={() => go("routines", r.routineId)}>
              <td>
                {r.routeName || r.routineId}
                <small>
                  {r.itemsTotal ? `${r.itemsTotal} points · ` : ""}
                  {r.assignedTo || "no technician"}
                </small>
              </td>
              <td>{r.contractor}</td>
              <td style={{ color: T.danger, fontWeight: 700, whiteSpace: "nowrap" }}>{r.days} d</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const actionsTable =
    m.actionsOpen.length === 0 ? (
      <p className="odb-muted">No open actions.</p>
    ) : (
      <table className="odb-table">
        <thead>
          <tr>
            <th>Equipment / action</th>
            <th>Status</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {m.actionsOpen.slice(0, 5).map((a, i) => (
            <tr key={a.acNo || i} onClick={() => go("actions")}>
              <td>
                <span className="odb-mono">{a.equipmentCode}</span>
                <small>{a.agreedAction || a.accAction || a.contractorAction || a.sampleAnalysis || "—"}</small>
              </td>
              <td>
                <span className="odb-pill" style={{ color: T[a.stage.tone] || T.textSecondary, background: (T[a.stage.tone] || T.textSecondary) + "1A" }}>
                  {a.stage.label}
                </span>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{a.age == null ? "—" : `${a.age} d`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const runwayBody = loadingExtra && !runway.length ? <p className="odb-muted">Loading…</p> : runway.length === 0 ? <p className="odb-muted">No stock usage recorded yet.</p> : <Runway T={T} rows={runway} />;

  return (
    <div className="odb" data-testid="oil-dashboard">
      <style>{styleSheet(T)}</style>
      <div className="odb-top">
        <div>
          <h2>Oil Dashboard</h2>
          <p className="odb-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {today} · {fmtNum(m.equipment)} equipment · {fmtNum(m.points)} lubrication points · {m.sampledPoints} sampled
          </p>
        </div>
        {phone ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", width: "100%", scrollbarWidth: "none", paddingBottom: 2 }} data-testid="dashboard-filter-row">
            <button type="button" className="odb-chip-filter" onClick={() => setFilterOpen(true)} data-testid="dashboard-filters">
              <i className="ti ti-filter" aria-hidden="true" /> Filters{activeFilters ? ` · ${activeFilters}` : ""}
            </button>
            <button type="button" className="odb-chip-on" onClick={() => setFilterOpen(true)}>{period.label}</button>
            {!scopedContractor && <button type="button" className={contractor === "All" ? "odb-chip-off" : "odb-chip-on"} onClick={() => setFilterOpen(true)}>{contractor === "All" ? "All contractors" : contractor}</button>}
            {areaOptions.length > 2 && <button type="button" className={area === "All" ? "odb-chip-off" : "odb-chip-on"} onClick={() => setFilterOpen(true)}>{area === "All" ? "All areas" : area}</button>}
          </div>
        ) : (
        <div className="odb-controls">
          {!scopedContractor && (
            <Seg label="Contractor" value={contractor} onChange={setContractor} options={["All", ...CONTRACTORS].map((c) => ({ value: c, label: c }))} />
          )}
          {areaOptions.length > 2 && (
            <select className="odb-select" aria-label="Dashboard area" value={area} onChange={(e) => setArea(e.target.value)}>
              {areaOptions.map((a) => (
                <option key={a} value={a}>
                  {a === "All" ? "All areas" : a}
                </option>
              ))}
            </select>
          )}
          <Seg label="Period" value={periodDays} onChange={setPeriodDays} options={PERIODS.map((p) => ({ value: p.days, label: p.label }))} />
          <button type="button" className="odb-btn odb-hide-phone" onClick={exportPdf} disabled={exporting} data-testid="dashboard-pdf">
            <i className={`ti ${exporting ? "ti-loader" : "ti-file-download"}`} aria-hidden="true" /> {exporting ? "Preparing…" : "Export PDF"}
          </button>
        </div>
        )}
      </div>
      <BottomSheet
        open={phone && filterOpen}
        title="Filters"
        hint="Apply to every card and chart on this page"
        onClose={() => setFilterOpen(false)}
        testid="dashboard-filter-sheet"
        footer={
          <>
            <SheetButton onClick={() => { setContractor("All"); setArea("All"); setPeriodDays(90); }}>Reset</SheetButton>
            <SheetButton primary grow={2} onClick={() => setFilterOpen(false)} testid="dashboard-filter-show">Show {fmtNum(m.equipment)} equipment</SheetButton>
          </>
        }
      >
        <SheetGroup label="Period">
          {PERIODS.map((p) => (
            <SheetChip key={p.days} on={periodDays === p.days} onClick={() => setPeriodDays(p.days)}>{p.label}</SheetChip>
          ))}
        </SheetGroup>
        {!scopedContractor && (
          <SheetGroup label="Contractor">
            {["All", ...CONTRACTORS].map((c) => (
              <SheetChip key={c} on={contractor === c} onClick={() => setContractor(c)}>{c}</SheetChip>
            ))}
          </SheetGroup>
        )}
        {areaOptions.length > 2 && (
          <SheetGroup label="Area">
            <select style={{ width: "100%", minHeight: 44, fontSize: 15, borderRadius: 10, border: `1px solid ${T.border}`, background: T.cardBg, color: T.textPrimary, padding: "0 10px", fontFamily: "inherit" }} aria-label="Dashboard area" value={area} onChange={(e) => setArea(e.target.value)}>
              {areaOptions.map((a) => (
                <option key={a} value={a}>{a === "All" ? "All areas" : a}</option>
              ))}
            </select>
          </SheetGroup>
        )}
      </BottomSheet>

      <div className="odb-section">
        <h3>Needs attention</h3>
        <span className="odb-muted">{phone ? "tap to open" : "most urgent first · each card opens the list behind it"}</span>
      </div>
      {phone ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {att.map((a) => (
            <AttentionRow key={a.key} T={T} tone={a.tone} count={a.count} title={a.title.charAt(0).toUpperCase() + a.title.slice(1)} detail={a.phoneDetail} onClick={a.phoneGo} testid={a.testid} />
          ))}
        </div>
      ) : (
        <div className="odb-grid4">
          {att.map((a) => (
            <AttentionCard key={a.key} T={T} {...a} />
          ))}
        </div>
      )}

      <div className="odb-section">
        <h3>Plant health · {period.long}</h3>
        <span className="odb-muted">compared with {period.prev}</span>
      </div>
      {kpis}

      <div className="odb-row2">
        <Panel title="Activity trend · 6 months" phone={phone} count="6 months ›" testid="panel-trend"
          sub="One small chart per activity, each on its own scale, so the few top-ups aren't flattened by the oil changes. Pale bar = this month so far.">
          {trend}
        </Panel>
        <Panel title="Routes done on time" link="Routes" onLink={() => go("routines")} phone={phone} count={rot.All?.pct != null ? `${rot.All.pct} % ›` : "›"} testid="panel-routes"
          sub={`Share of routes finished by their due date · target ${target} %`}>
          {routesCard}
        </Panel>
      </div>

      <div className="odb-row3">
        <Panel title="Overdue routes" link={m.lateRoutes.length ? `All ${m.lateRoutes.length}` : "Routes"} onLink={() => go("routines")} phone={phone} count={`${m.lateRoutes.length} ›`} testid="panel-overdue-routes">
          {routesTable}
        </Panel>
        <Panel title="Open actions · oldest first" link={`All ${m.actionsOpen.length}`} onLink={() => go("actions")} phone={phone} count={`${m.actionsOpen.length} ›`} testid="panel-actions">
          {actionsTable}
        </Panel>
        <Panel title="Days of stock left" link="Inventory" onLink={() => go("inventory")} phone={phone} count={shortages.length ? `${shortages.length} short ›` : "›"} testid="panel-stock"
          sub="At the recent rate of use · lines at 30 / 60 / 90 days">
          {runwayBody}
        </Panel>
      </div>
    </div>
  );
}

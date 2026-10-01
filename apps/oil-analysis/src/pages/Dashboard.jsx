import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import { useSessionContractor } from "../SessionContext";
import * as api from "../api";

const PERIOD_OPTIONS = [
  { days: 30, label: "Last 30 Days" },
  { days: 90, label: "Last 3 Months" },
  { days: 180, label: "Last 6 Months" },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function ChartTooltip({ T, active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      {label && <div style={{ color: T.textSecondary, marginBottom: 2 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ color: T.textPrimary, fontWeight: 700 }}>
          <span style={{ color: p.color || p.payload?.fill }}>●</span> {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

// Period-over-period count for one event log — real counts over real date
// ranges (not a fabricated delta), confirmed directly by the user ("make
// it a real working control for both"). Returns this period's total, the
// RHI/ASEC breakdown, and % change vs the immediately-preceding period of
// the same length.
function periodStats(rows, dateKey, contractorKey, periodDays, scopeCodes, codeKey) {
  const now = new Date();
  const periodStart = daysAgo(periodDays);
  const prevStart = daysAgo(periodDays * 2);
  let total = 0;
  let prevTotal = 0;
  const byContractor = { RHI: 0, ASEC: 0 };
  rows.forEach((r) => {
    if (scopeCodes && !scopeCodes.has(r[codeKey])) return;
    const d = new Date(r[dateKey]);
    if (isNaN(d.getTime())) return;
    if (d >= periodStart && d <= now) {
      total++;
      const c = r[contractorKey];
      if (c === "RHI" || c === "ASEC") byContractor[c]++;
    } else if (d >= prevStart && d < periodStart) {
      prevTotal++;
    }
  });
  const pctChange = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : total > 0 ? 100 : 0;
  return { total, byContractor, pctChange };
}

function KpiCard({ T, s, icon, color, label, value, sub, pctChange, breakdown }) {
  return (
    <div style={{ ...s.metricCard, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 34, height: 34, borderRadius: "50%", background: T[color] + "22", color: T[color],
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0,
          }}
        >
          <i className={`ti ${icon}`} aria-hidden="true" />
        </span>
        <div style={{ fontSize: 11, color: T.textSecondary }}>{label}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary }}>{value}</span>
        {pctChange != null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: pctChange >= 0 ? T.success : T.danger }}>
            <i className={`ti ti-arrow-${pctChange >= 0 ? "up" : "down"}`} aria-hidden="true" /> {Math.abs(pctChange)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: T.textSecondary }}>{sub}</div>}
      {breakdown && (
        <div style={{ display: "flex", gap: 10, fontSize: 10.5 }}>
          <span style={{ color: T.accent, fontWeight: 700 }}>RHI {breakdown.RHI}</span>
          <span style={{ color: T.warning, fontWeight: 700 }}>ASEC {breakdown.ASEC}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ samples, actions, oilChangeEvents, equipmentRegistry, webhookUrl, onSelectSample }) {
  const { T, s } = useTheme();
  const scopedContractor = useSessionContractor();
  const [contractorFilter, setContractorFilter] = useState(scopedContractor || "All");
  const [areaFilter, setAreaFilter] = useState("All");
  const [periodDays, setPeriodDays] = useState(90);
  const [activityType, setActivityType] = useState("All"); // Activities Trend toggle
  const [contractorDonutType, setContractorDonutType] = useState("Oil Change"); // Activities by Contractor toggle

  const [topUps, setTopUps] = useState([]);
  const [routineItems, setRoutineItems] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [consumption, setConsumption] = useState(null);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    setLoadingExtra(true);
    Promise.all([
      api.getAllTopUps(webhookUrl),
      api.getRoutinesOverview(webhookUrl),
      api.getOilInventory(webhookUrl),
      api.getOilInventoryForecast(webhookUrl, 3),
      api.getOilInventoryConsumption(webhookUrl, 6),
    ])
      .then(([tu, ro, prod, fc, cons]) => {
        if (cancelled) return;
        setTopUps(tu);
        setRoutineItems(ro);
        setInventoryProducts(prod);
        setForecast(fc);
        setConsumption(cons);
      })
      .finally(() => { if (!cancelled) setLoadingExtra(false); });
    return () => { cancelled = true; };
  }, [webhookUrl]);

  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  const areaOptions = useMemo(() => ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean))).sort()], [registry]);
  const contractorOptions = ["All", "RHI", "ASEC"];

  const scopeCodes = useMemo(() => {
    const matchesContractor = (r) => contractorFilter === "All" || r.contractor === contractorFilter;
    const matchesArea = (r) => areaFilter === "All" || r.area === areaFilter;
    if (contractorFilter === "All" && areaFilter === "All") return null;
    return new Set(registry.filter((r) => matchesContractor(r) && matchesArea(r)).map((r) => r.code));
  }, [registry, contractorFilter, areaFilter]);

  const scopedRegistry = scopeCodes ? registry.filter((r) => scopeCodes.has(r.code)) : registry;
  const totalEquipment = useMemo(() => new Set(scopedRegistry.map((r) => r.equipmentId || r.code)).size, [scopedRegistry]);
  const totalLpPoints = scopedRegistry.length;

  // Raw oil-change events carry no equipmentCode/contractor of their own in
  // the row shape rowToOilChangeEvent builds (lpId + contractor only) — map
  // to the same {date,contractor,code} shape periodStats expects.
  const ocRows = useMemo(
    () => (oilChangeEvents || []).map((e) => ({ date: e.eventDate, contractor: e.contractor, code: e.lpId })),
    [oilChangeEvents]
  );
  const sampleRows = useMemo(() => {
    const byCode = new Map(registry.map((r) => [r.code, r.contractor]));
    return (samples || []).map((sm) => ({ date: sm.sampledDate, contractor: byCode.get(sm.unitId) || "", code: sm.unitId }));
  }, [samples, registry]);
  const topUpRows = useMemo(() => (topUps || []).map((t) => ({ date: t.eventDate, contractor: t.contractor, code: t.lpId })), [topUps]);

  const ocStats = periodStats(ocRows, "date", "contractor", periodDays, scopeCodes, "code");
  const sampleStats = periodStats(sampleRows, "date", "contractor", periodDays, scopeCodes, "code");
  const topUpStats = periodStats(topUpRows, "date", "contractor", periodDays, scopeCodes, "code");

  const scopedActions = useMemo(
    () => (scopeCodes ? (actions || []).filter((a) => scopeCodes.has(a.equipmentCode)) : actions || []),
    [actions, scopeCodes]
  );
  const openActions = scopedActions.filter((a) => a.status !== "Closed");
  const openActionsByContractor = { RHI: 0, ASEC: 0 };
  openActions.forEach((a) => { if (a.contractor === "RHI" || a.contractor === "ASEC") openActionsByContractor[a.contractor]++; });

  const equipByContractor = useMemo(() => {
    const out = { RHI: new Set(), ASEC: new Set() };
    scopedRegistry.forEach((r) => { if (out[r.contractor]) out[r.contractor].add(r.equipmentId || r.code); });
    return { RHI: out.RHI.size, ASEC: out.ASEC.size };
  }, [scopedRegistry]);
  const lpByContractor = useMemo(() => {
    const out = { RHI: 0, ASEC: 0 };
    scopedRegistry.forEach((r) => { if (out[r.contractor] != null) out[r.contractor]++; });
    return out;
  }, [scopedRegistry]);

  // Activities Trend (last 6 months) — stacked by type, filtered to the
  // active toggle (All shows all 3 stacked, a single type isolates it).
  const trendData = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString(undefined, { month: "short" }), "Oil Change": 0, "Oil Sample": 0, "Top Up": 0 });
    }
    const idx = {};
    months.forEach((m, i) => { idx[m.key] = i; });
    function bucket(rows, field) {
      rows.forEach((r) => {
        if (scopeCodes && !scopeCodes.has(r.code)) return;
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const i = idx[`${d.getFullYear()}-${d.getMonth()}`];
        if (i === undefined) return;
        months[i][field]++;
      });
    }
    bucket(ocRows, "Oil Change");
    bucket(sampleRows, "Oil Sample");
    bucket(topUpRows, "Top Up");
    return months;
  }, [ocRows, sampleRows, topUpRows, scopeCodes]);

  // Routine Compliance Rate (split by type, confirmed directly by the
  // user) + Overdue Routines by Contractor — both derived from the
  // already-fetched unified Routines overview (Patch 20), scoped the same
  // way as everything else on this page.
  const scopedRoutineItems = useMemo(
    () => (contractorFilter === "All" ? routineItems : routineItems.filter((i) => i.contractor === contractorFilter)),
    [routineItems, contractorFilter]
  );
  function complianceFor(routeType) {
    const items = routeType === "Overall" ? scopedRoutineItems : scopedRoutineItems.filter((i) => i.routeType === routeType);
    const relevant = items.filter((i) => i.dueStatus !== "Paused");
    if (relevant.length === 0) return null;
    const onTrack = relevant.filter((i) => i.dueStatus !== "Overdue").length;
    return Math.round((onTrack / relevant.length) * 100);
  }
  const overdueByContractor = useMemo(() => {
    const out = { RHI: 0, ASEC: 0 };
    routineItems.forEach((i) => { if (i.dueStatus === "Overdue" && out[i.contractor] != null) out[i.contractor]++; });
    return out;
  }, [routineItems]);

  // Activities by Contractor donuts — RHI vs ASEC split for the selected
  // activity type, within the active period.
  const contractorDonutData = useMemo(() => {
    const stats = contractorDonutType === "Oil Change" ? ocStats : contractorDonutType === "Oil Sample" ? sampleStats : topUpStats;
    return [
      { name: "RHI", value: stats.byContractor.RHI, color: T.accent },
      { name: "ASEC", value: stats.byContractor.ASEC, color: T.warning },
    ].filter((d) => d.value > 0);
  }, [contractorDonutType, ocStats, sampleStats, topUpStats, T.accent, T.warning]);

  // Condensed Oil Inventory widget — Inventory Status donut by stock-level
  // tier, confirmed directly by the user as the simplified replacement for
  // the mockup's full Reorder Requests tab.
  const inventoryStatus = useMemo(() => {
    const scoped = contractorFilter === "All" ? inventoryProducts : inventoryProducts.filter((p) => p.contractor === contractorFilter);
    const tiers = { Sufficient: 0, Watch: 0, Low: 0, "Out of Stock": 0 };
    scoped.forEach((p) => {
      if (p.currentStock == null) return;
      if (p.currentStock <= 0) tiers["Out of Stock"]++;
      else if (p.recorderLevel != null && p.currentStock <= p.recorderLevel) tiers.Low++;
      else if (p.recorderLevel != null && p.currentStock <= p.recorderLevel * 1.5) tiers.Watch++;
      else tiers.Sufficient++;
    });
    return tiers;
  }, [inventoryProducts, contractorFilter]);
  const inventoryStatusData = [
    { name: "Sufficient", value: inventoryStatus.Sufficient, color: T.success },
    { name: "Watch (≤ moderate)", value: inventoryStatus.Watch, color: T.warning },
    { name: "Low", value: inventoryStatus.Low, color: T.danger },
    { name: "Out of Stock", value: inventoryStatus["Out of Stock"], color: T.textMuted },
  ].filter((d) => d.value > 0);

  // Tables
  const topOverdueRoutines = useMemo(() => {
    const now = Date.now();
    return (contractorFilter === "All" ? routineItems : routineItems.filter((i) => i.contractor === contractorFilter))
      .filter((i) => i.dueStatus === "Overdue" && i.nextDueDate)
      .map((i) => ({ ...i, daysOverdue: Math.floor((now - new Date(i.nextDueDate).getTime()) / 86400000) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10);
  }, [routineItems, contractorFilter]);

  const upcomingForecastAlerts = useMemo(() => {
    if (!forecast) return [];
    const shortfalls = forecast.forecast.filter((f) => f.shortfall != null && f.shortfall > 0).map((f) => ({
      oilType: f.lubricant, contractor: f.contractor, status: "Shortfall", detail: `${f.shortfall} L short`,
    }));
    const insufficient = (forecast.insufficientHistory || []).map((e) => ({
      oilType: e.lubricant, contractor: e.contractor, status: "No History", detail: e.code,
    }));
    return [...shortfalls, ...insufficient].slice(0, 10);
  }, [forecast]);

  if (!webhookUrl) {
    return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {!scopedContractor && (
          <select style={{ ...s.select, width: 150 }} value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)}>
            {contractorOptions.map((c) => (
              <option key={c} value={c}>{c === "All" ? "All Contractors" : c}</option>
            ))}
          </select>
        )}
        <select style={{ ...s.select, width: 150 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          {areaOptions.map((a) => (
            <option key={a} value={a}>{a === "All" ? "All Areas" : a}</option>
          ))}
        </select>
        <select style={{ ...s.select, width: 170 }} value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.days} value={p.days}>{p.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard T={T} s={s} icon="ti-building-factory-2" color="accent" label="Total Equipment" value={totalEquipment} breakdown={equipByContractor} />
        <KpiCard T={T} s={s} icon="ti-droplet" color="info" label="Total LP Points" value={totalLpPoints} breakdown={lpByContractor} />
        <KpiCard T={T} s={s} icon="ti-oil" color="success" label={`Oil Changes (${periodDays}d)`} value={ocStats.total} pctChange={ocStats.pctChange} breakdown={ocStats.byContractor} />
        <KpiCard T={T} s={s} icon="ti-flask" color="accent" label={`Oil Samples (${periodDays}d)`} value={sampleStats.total} pctChange={sampleStats.pctChange} breakdown={sampleStats.byContractor} />
        <KpiCard T={T} s={s} icon="ti-droplet-plus" color="danger" label={`Emergency Top Ups (${periodDays}d)`} value={topUpStats.total} pctChange={topUpStats.pctChange} breakdown={topUpStats.byContractor} />
        <KpiCard T={T} s={s} icon="ti-checklist" color="warning" label="Open Actions" value={openActions.length} breakdown={openActionsByContractor} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Activities Trend (Last 6 Months)</p>
            <div style={{ display: "flex", gap: 6 }}>
              {["All", "Oil Change", "Oil Sample", "Top Up"].map((t) => (
                <button
                  key={t}
                  style={{ ...s.btn, fontSize: 11, padding: "4px 10px", background: activityType === t ? T.accent : "transparent", color: activityType === t ? T.accentText : T.textSecondary, borderColor: activityType === t ? T.accent : T.border }}
                  onClick={() => setActivityType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(activityType === "All" || activityType === "Oil Change") && <Bar dataKey="Oil Change" stackId={activityType === "All" ? "s" : undefined} fill={T.accent} />}
              {(activityType === "All" || activityType === "Oil Sample") && <Bar dataKey="Oil Sample" stackId={activityType === "All" ? "s" : undefined} fill={T.info || T.accent} />}
              {(activityType === "All" || activityType === "Top Up") && <Bar dataKey="Top Up" stackId={activityType === "All" ? "s" : undefined} fill={T.danger} radius={activityType === "All" ? [4, 4, 0, 0] : undefined} />}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={s.card}>
          <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Routine Compliance Rate</p>
          {["Oil Change", "Sampling", "Overall"].map((rt) => {
            const rate = complianceFor(rt);
            return (
              <div key={rt} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                  <span style={{ color: T.textSecondary }}>{rt}</span>
                  <span style={{ fontWeight: 700 }}>{rate == null ? "—" : `${rate}%`}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
                  <div style={{ width: `${rate || 0}%`, height: "100%", background: rate >= 90 ? T.success : rate >= 70 ? T.warning : T.danger }} />
                </div>
              </div>
            );
          })}
          <p style={{ fontWeight: 700, margin: "16px 0 10px" }}>Overdue Routines by Contractor</p>
          {["RHI", "ASEC"].map((c) => (
            <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0" }}>
              <span style={{ color: T.textSecondary }}>{c}</span>
              <span style={{ fontWeight: 700, color: overdueByContractor[c] > 0 ? T.danger : T.success }}>{overdueByContractor[c]}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Activities by Contractor</p>
            <select style={{ ...s.select, width: 140, fontSize: 11 }} value={contractorDonutType} onChange={(e) => setContractorDonutType(e.target.value)}>
              <option>Oil Change</option>
              <option>Oil Sample</option>
              <option>Top Up</option>
            </select>
          </div>
          {contractorDonutData.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No activity in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={contractorDonutData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2} label={({ name, value }) => `${name} ${value}`}>
                  {contractorDonutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip T={T} />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card}>
          <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Oil Inventory & Forecast</p>
          {loadingExtra ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
          ) : inventoryStatusData.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No products to report on.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={inventoryStatusData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={65} paddingAngle={2}>
                    {inventoryStatusData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip T={T} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11 }}>
                {inventoryStatusData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ color: T.textPrimary }}>{d.name}</span>
                    <span style={{ color: T.textSecondary }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {consumption?.totalsByMonth?.length > 0 && (
            <p style={{ fontSize: 10.5, color: T.textMuted, margin: "10px 0 0" }}>
              This month's consumption: {consumption.totalsByMonth[consumption.totalsByMonth.length - 1]} L
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <p style={{ fontWeight: 700, margin: 0, padding: "14px 16px 0" }}>Top Overdue Routines</p>
          {topOverdueRoutines.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12, padding: "10px 16px 16px" }}>None overdue.</p>
          ) : (
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Routine</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 8px" }}>Contractor</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {topOverdueRoutines.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 16px" }}>{r.routeName || r.id}</td>
                    <td style={{ padding: "6px 8px" }}>{r.contractor}</td>
                    <td style={{ padding: "6px 16px", color: T.danger, fontWeight: 700 }}>{r.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <p style={{ fontWeight: 700, margin: 0, padding: "14px 16px 0" }}>Open Actions</p>
          {openActions.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12, padding: "10px 16px 16px" }}>None open.</p>
          ) : (
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Equipment</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {openActions.slice(0, 10).map((a, i) => (
                  <tr key={a._id || i} style={{ borderTop: `1px solid ${T.border}`, cursor: onSelectSample ? "pointer" : "default" }}>
                    <td style={{ padding: "6px 16px" }}>{a.equipmentCode}</td>
                    <td style={{ padding: "6px 8px" }}>{a.status}</td>
                    <td style={{ padding: "6px 16px" }}>{a.agreedAction || a.accAction || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <p style={{ fontWeight: 700, margin: 0, padding: "14px 16px 0" }}>Upcoming Forecast Alerts</p>
          {upcomingForecastAlerts.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12, padding: "10px 16px 16px" }}>Nothing flagged.</p>
          ) : (
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Oil Type</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 8px" }}>Status</th>
                  <th style={{ textAlign: "left", color: T.textSecondary, padding: "4px 16px" }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {upcomingForecastAlerts.map((a, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 16px" }}>{a.oilType}</td>
                    <td style={{ padding: "6px 8px", color: a.status === "Shortfall" ? T.danger : T.warning, fontWeight: 700 }}>{a.status}</td>
                    <td style={{ padding: "6px 16px" }}>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

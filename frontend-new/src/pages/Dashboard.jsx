import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { T, s } from "../theme";
import * as api from "../api";
import { bucketAllLubricationPoints } from "../sampleStatus";

// Full Oil Dashboard rebuild matching the REAL page (docs/visual-reference/
// Screenshot 2026-10-06 004638.png + 004658.png), not the slimmed-down
// 3-card version from the first Phase 1 pass.
//
// API GAPS (no fabricated numbers — see the report for these): there is no
// endpoint for oil_change_log or oil_topup_log at all (no route file
// exists for either table), so "Oil Changes Overdue", "Oil Changes (Nd)",
// and "Emergency Top Ups (Nd)" render "—" instead of a number, and their
// Activities Trend / Activities-by-Contractor series render as honest
// zero/empty rather than invented figures. There is also no
// inventory-forecast endpoint, so "Upcoming Forecast Alerts" is always
// empty. Separately (not an API gap): routines and oil_inventory products
// were never part of the original data migration scope, so those sections
// are empty from real-but-empty local data, not from a missing endpoint.
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

function ChartTooltip({ active, payload, label }) {
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

function periodStats(rows, dateKey, orgKey, periodDays) {
  const now = new Date();
  const periodStart = daysAgo(periodDays);
  const prevStart = daysAgo(periodDays * 2);
  let total = 0;
  let prevTotal = 0;
  const byOrg = { RHI: 0, ASEC: 0 };
  rows.forEach((r) => {
    const d = new Date(r[dateKey]);
    if (isNaN(d.getTime())) return;
    if (d >= periodStart && d <= now) {
      total++;
      const o = r[orgKey];
      if (o === "RHI" || o === "ASEC") byOrg[o]++;
    } else if (d >= prevStart && d < periodStart) {
      prevTotal++;
    }
  });
  const pctChange = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : total > 0 ? 100 : 0;
  return { total, byOrg, pctChange };
}

function KpiCard({ icon, color, label, value, sub, pctChange, breakdown, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{ ...s.metricCard, display: "flex", flexDirection: "column", gap: 8, textAlign: "left", fontFamily: "inherit", width: "100%", cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: T[color] + "22", color: T[color], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
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
    </Tag>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [lps, setLps] = useState([]);
  const [samples, setSamples] = useState([]);
  const [actions, setActions] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [invProducts, setInvProducts] = useState([]);
  const [invMovements, setInvMovements] = useState([]);

  const [contractorFilter, setContractorFilter] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");
  const [periodDays, setPeriodDays] = useState(180);
  const [activityType, setActivityType] = useState("All");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [eq, lp, sm, ac, ro, prod, mov] = await Promise.all([
          api.getAllEquipment(),
          api.getAllLubricationPoints(),
          api.getAllOilSamples(),
          api.getAllOilActions(),
          api.getAllRoutines(),
          api.getAllOilInventoryProducts(),
          api.getAllOilInventoryMovements(),
        ]);
        if (cancelled) return;
        setEquipment(eq);
        setLps(lp);
        setSamples(sm);
        setActions(ac);
        setRoutines(ro);
        setInvProducts(prod);
        setInvMovements(mov);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lpById = useMemo(() => new Map(lps.map((lp) => [lp.lp_id, lp])), [lps]);
  const areaOptions = useMemo(() => ["All", ...Array.from(new Set(lps.map((lp) => lp.area).filter(Boolean))).sort()], [lps]);

  const scopedLps = useMemo(
    () =>
      lps.filter((lp) => (contractorFilter === "All" || lp.org_code === contractorFilter) && (areaFilter === "All" || lp.area === areaFilter)),
    [lps, contractorFilter, areaFilter]
  );
  const scopedLpIds = useMemo(() => new Set(scopedLps.map((lp) => lp.lp_id)), [scopedLps]);
  const scopedSamples = useMemo(() => samples.filter((sm) => scopedLpIds.has(sm.lp_id)), [samples, scopedLpIds]);
  const scopedActions = useMemo(() => actions.filter((a) => scopedLpIds.has(a.lp_id)), [actions, scopedLpIds]);
  const scopedRoutines = useMemo(
    () => routines.filter((r) => contractorFilter === "All" || r.org_code === contractorFilter),
    [routines, contractorFilter]
  );
  const scopedInvProducts = useMemo(
    () => invProducts.filter((p) => contractorFilter === "All" || p.org_code === contractorFilter),
    [invProducts, contractorFilter]
  );

  const totalEquipment = useMemo(() => new Set(scopedLps.map((lp) => lp.equipment_id)).size, [scopedLps]);
  const totalLpPoints = scopedLps.length;
  const equipByContractor = useMemo(() => {
    const out = { RHI: new Set(), ASEC: new Set() };
    scopedLps.forEach((lp) => out[lp.org_code]?.add(lp.equipment_id));
    return { RHI: out.RHI.size, ASEC: out.ASEC.size };
  }, [scopedLps]);
  const lpByContractor = useMemo(() => {
    const out = { RHI: 0, ASEC: 0 };
    scopedLps.forEach((lp) => {
      if (out[lp.org_code] != null) out[lp.org_code]++;
    });
    return out;
  }, [scopedLps]);

  const sampleStats = periodStats(
    scopedSamples.map((sm) => ({ sample_date: sm.sample_date, org_code: lpById.get(sm.lp_id)?.org_code })),
    "sample_date",
    "org_code",
    periodDays
  );

  const needingAttention = useMemo(() => {
    const buckets = bucketAllLubricationPoints(scopedLps, scopedSamples);
    return buckets.Overdue.length + buckets.Missing.length;
  }, [scopedLps, scopedSamples]);

  const fleetHealth = useMemo(() => {
    const periodStart = daysAgo(periodDays);
    const counts = { Normal: 0, Caution: 0, Alert: 0 };
    scopedSamples.forEach((sm) => {
      const d = new Date(sm.sample_date);
      if (isNaN(d) || d < periodStart) return;
      if (counts[sm.report_status] != null) counts[sm.report_status]++;
    });
    const total = counts.Normal + counts.Caution + counts.Alert;
    return { ...counts, total, normalPct: total > 0 ? Math.round((counts.Normal / total) * 100) : null };
  }, [scopedSamples, periodDays]);

  const openActions = useMemo(() => scopedActions.filter((a) => a.status !== "Closed"), [scopedActions]);
  const openActionsByContractor = useMemo(() => {
    const out = { RHI: 0, ASEC: 0 };
    openActions.forEach((a) => {
      const org = lpById.get(a.lp_id)?.org_code;
      if (out[org] != null) out[org]++;
    });
    return out;
  }, [openActions, lpById]);

  function routineOverdue(r) {
    if (r.status === "Approved" || r.status === "Cancelled") return false;
    return r.due_date && new Date(r.due_date) < new Date();
  }
  function complianceFor(routeType) {
    const relevant = scopedRoutines.filter((r) => r.status !== "Paused" && (routeType === "Overall" || r.route_type === routeType));
    if (relevant.length === 0) return null;
    const onTrack = relevant.filter((r) => !routineOverdue(r)).length;
    return Math.round((onTrack / relevant.length) * 100);
  }
  const overdueByContractor = useMemo(() => {
    const out = { RHI: 0, ASEC: 0 };
    scopedRoutines.forEach((r) => {
      if (routineOverdue(r) && out[r.org_code] != null) out[r.org_code]++;
    });
    return out;
  }, [scopedRoutines]);
  const topOverdueRoutines = useMemo(() => {
    const now = Date.now();
    return scopedRoutines
      .filter(routineOverdue)
      .map((r) => ({ ...r, daysOverdue: Math.floor((now - new Date(r.due_date).getTime()) / 86400000) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10);
  }, [scopedRoutines]);

  const trendData = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString(undefined, { month: "short" }), "Oil Change": 0, "Oil Sample": 0, "Top Up": 0 });
    }
    const idx = {};
    months.forEach((m, i) => (idx[m.key] = i));
    scopedSamples.forEach((sm) => {
      const d = new Date(sm.sample_date);
      if (isNaN(d.getTime())) return;
      const i = idx[`${d.getFullYear()}-${d.getMonth()}`];
      if (i !== undefined) months[i]["Oil Sample"]++;
    });
    return months;
  }, [scopedSamples]);

  const contractorDonuts = [
    { label: "Oil Change", data: [] }, // no oil_change_log endpoint — see gap note
    {
      label: "Oil Sample",
      data: [
        { name: "RHI", value: sampleStats.byOrg.RHI, color: T.accent },
        { name: "ASEC", value: sampleStats.byOrg.ASEC, color: T.warning },
      ].filter((d) => d.value > 0),
    },
    { label: "Top Up", data: [] }, // no oil_topup_log endpoint — see gap note
  ];

  const inventoryStatus = useMemo(() => {
    const tiers = { Sufficient: 0, Watch: 0, Low: 0, "Out of Stock": 0 };
    scopedInvProducts.forEach((p) => {
      if (p.current_stock == null) return;
      if (p.current_stock <= 0) tiers["Out of Stock"]++;
      else if (p.recorder_level != null && p.current_stock <= p.recorder_level) tiers.Low++;
      else if (p.recorder_level != null && p.current_stock <= p.recorder_level * 1.5) tiers.Watch++;
      else tiers.Sufficient++;
    });
    return tiers;
  }, [scopedInvProducts]);
  const inventoryStatusData = [
    { name: "Sufficient", value: inventoryStatus.Sufficient, color: T.success },
    { name: "Watch (≤ moderate)", value: inventoryStatus.Watch, color: T.warning },
    { name: "Low", value: inventoryStatus.Low, color: T.danger },
    { name: "Out of Stock", value: inventoryStatus["Out of Stock"], color: T.textMuted },
  ].filter((d) => d.value > 0);
  const thisMonthConsumption = useMemo(() => {
    const now = new Date();
    const total = invMovements
      .filter((m) => m.movement_type === "Issue")
      .filter((m) => {
        const d = new Date(m.movement_date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    return total;
  }, [invMovements]);

  if (error) {
    return (
      <div style={{ color: T.danger, fontSize: 13, background: T.dangerBg, padding: "10px 14px", borderRadius: 8 }}>{error}</div>
    );
  }
  if (loading) return <p style={{ color: T.textSecondary }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...s.select, width: 150 }} value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)}>
          {["All", "RHI", "ASEC"].map((c) => (
            <option key={c} value={c}>{c === "All" ? "All Contractors" : c}</option>
          ))}
        </select>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 12 }}>
        <KpiCard icon="ti-droplet-filled" color="warning" label="Oil Changes Overdue" value="—" sub="No endpoint yet" />
        <KpiCard icon="ti-flask-2" color="danger" label="Samples Needing Attention" value={needingAttention} sub="Overdue or Missing" />
        <KpiCard
          icon="ti-heart-rate-monitor"
          color="success"
          label={`Oil Health (${periodDays}d)`}
          value={fleetHealth.normalPct == null ? "—" : `${fleetHealth.normalPct}%`}
          sub={fleetHealth.total === 0 ? "No lab results in this period" : `Normal · ${fleetHealth.Caution} Caution, ${fleetHealth.Alert} Alert`}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard icon="ti-building-factory-2" color="accent" label="Total Equipment" value={totalEquipment} breakdown={equipByContractor} />
        <KpiCard icon="ti-droplet" color="info" label="Total LP Points" value={totalLpPoints} breakdown={lpByContractor} />
        <KpiCard icon="ti-droplet-filled" color="success" label={`Oil Changes (${periodDays}d)`} value="—" sub="No endpoint yet" />
        <KpiCard icon="ti-flask" color="accent" label={`Oil Samples (${periodDays}d)`} value={sampleStats.total} pctChange={sampleStats.pctChange} breakdown={sampleStats.byOrg} />
        <KpiCard icon="ti-droplet-plus" color="danger" label={`Emergency Top Ups (${periodDays}d)`} value="—" sub="No endpoint yet" />
        <KpiCard icon="ti-checklist" color="warning" label="Open Actions" value={openActions.length} breakdown={openActionsByContractor} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Activities Trend (Last 6 Months)</p>
            <div style={{ display: "flex", gap: 6 }}>
              {["All", "Oil Change", "Oil Sample", "Top Up"].map((t) => (
                <button
                  key={t}
                  style={{ ...s.select, padding: "4px 10px", fontSize: 11, background: activityType === t ? T.accent : "transparent", color: activityType === t ? "#fff" : T.textSecondary, borderColor: activityType === t ? T.accent : T.border, cursor: "pointer" }}
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
              <Tooltip content={<ChartTooltip />} cursor={{ fill: T.accent + "10" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(activityType === "All" || activityType === "Oil Change") && <Bar dataKey="Oil Change" fill={T.accent} />}
              {(activityType === "All" || activityType === "Oil Sample") && <Bar dataKey="Oil Sample" fill={T.info} />}
              {(activityType === "All" || activityType === "Top Up") && <Bar dataKey="Top Up" fill={T.danger} radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 10.5, color: T.textMuted, margin: "6px 0 0" }}>
            "Oil Change" and "Top Up" bars are zero — no API endpoint exists yet for oil_change_log / oil_topup_log.
          </p>
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
          <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Activities by Contractor</p>
          <div style={{ display: "flex", gap: 8 }}>
            {contractorDonuts.map(({ label, data }) => (
              <div key={label} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, margin: "0 0 2px" }}>{label}</p>
                {data.length === 0 ? (
                  <p style={{ color: T.textMuted, fontSize: 10.5, margin: "30px 0" }}>No activity</p>
                ) : (
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" innerRadius={28} outerRadius={50} paddingAngle={2} label={({ value }) => value}>
                        {data.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 2, fontSize: 10.5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: T.accent, display: "inline-block" }} /> <span style={{ color: T.textSecondary }}>RHI</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: T.warning, display: "inline-block" }} /> <span style={{ color: T.textSecondary }}>ASEC</span>
            </span>
          </div>
        </div>

        <div style={s.card}>
          <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Oil Inventory & Forecast</p>
          {inventoryStatusData.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No products to report on.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={inventoryStatusData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={65} paddingAngle={2}>
                    {inventoryStatusData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11 }}>
                {inventoryStatusData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ color: T.textPrimary }}>{d.name}</span> <span style={{ color: T.textSecondary }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {thisMonthConsumption > 0 && <p style={{ fontSize: 10.5, color: T.textMuted, margin: "10px 0 0" }}>This month's consumption: {thisMonthConsumption} L</p>}
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
                  <tr key={r.routine_id} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 16px" }}>{r.route_name || r.routine_id}</td>
                    <td style={{ padding: "6px 8px" }}>{r.org_code}</td>
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
                {openActions.slice(0, 10).map((a) => (
                  <tr key={a.action_uid} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 16px" }}>{lpById.get(a.lp_id)?.equipment_id || a.lp_id}</td>
                    <td style={{ padding: "6px 8px" }}>{a.status}</td>
                    <td style={{ padding: "6px 16px" }}>{a.agreed_action || a.acc_action || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <p style={{ fontWeight: 700, margin: 0, padding: "14px 16px 0" }}>Upcoming Forecast Alerts</p>
          <p style={{ color: T.textSecondary, fontSize: 12, padding: "10px 16px 16px" }}>Nothing flagged.</p>
          <p style={{ fontSize: 10, color: T.textMuted, padding: "0 16px 14px" }}>No forecast endpoint exists yet.</p>
        </div>
      </div>
    </div>
  );
}

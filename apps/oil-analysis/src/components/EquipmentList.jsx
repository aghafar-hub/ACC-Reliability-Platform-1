import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import { HEALTH_COLOR, HEALTH_RANK, healthForLp, worstHealth } from "../equipmentHealth";
import { Donut, StackedBars } from "./DashCharts";
import ContractorChips from "./ContractorChips";

// Oil Equipment opening screen: every machine (or lubrication point) with
// its health and why, filters, and a "Needs attention" shortcut.

const PAGE = 50;

function HealthCell({ T, health, reasons }) {
  const color = T[HEALTH_COLOR[health]];
  return (
    <div>
      <span style={{ fontSize: 12, fontWeight: 700, color, background: color + "22", borderRadius: 4, padding: "2px 8px" }}>{health}</span>
      {reasons.length > 0 && (
        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 3, lineHeight: 1.4 }}>
          {reasons.slice(0, 2).join(" · ")}
          {reasons.length > 2 ? ` · +${reasons.length - 2} more` : ""}
        </div>
      )}
    </div>
  );
}

function soonest(dates) {
  return dates.filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || "";
}

export default function EquipmentList({ registry, idx, scopedContractor, onOpenEquipment, onOpenLp }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("equipment");
  const [area, setArea] = useState("All");
  const [contractor, setContractor] = useState("All");
  const [healthFilter, setHealthFilter] = useState("all");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const points = useMemo(() => {
    const now = Date.now();
    return registry.map((reg) => {
      const h = healthForLp(reg, idx, now);
      const oc = idx.oilChange.get(reg.code) || null;
      return { reg, h, nextChange: oc?.nextDueDate || "", changeOverdue: oc?.status === "Overdue" };
    });
  }, [registry, idx]);

  const machines = useMemo(() => {
    const map = new Map();
    points.forEach((p) => {
      const id = p.reg.equipmentId || p.reg.code;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return Array.from(map.entries()).map(([id, list]) => {
      const health = worstHealth(list.map((p) => p.h));
      const reasons = [];
      list
        .filter((p) => p.h.health !== "Good")
        .sort((a, b) => b.h.score - a.h.score)
        .forEach((p) => p.h.reasons.forEach((r) => reasons.push(`${p.reg.code}: ${r.text}`)));
      return {
        id,
        list,
        health,
        reasons,
        score: Math.max(...list.map((p) => p.h.score)),
        area: list[0].reg.area || "",
        contractor: list[0].reg.contractor || "",
        attention: list.filter((p) => p.h.health !== "Good").length,
        openActions: list.reduce((n, p) => n + p.h.openActions, 0),
        overdueActions: list.reduce((n, p) => n + p.h.overdueActions, 0),
        nextChange: soonest(list.map((p) => p.nextChange)),
        changeOverdue: list.some((p) => p.changeOverdue),
      };
    });
  }, [points]);

  const areas = useMemo(() => Array.from(new Set(registry.map((r) => r.area).filter(Boolean))).sort(), [registry]);
  const contractors = useMemo(() => Array.from(new Set(registry.map((r) => r.contractor).filter(Boolean))).sort(), [registry]);

  const counts = useMemo(() => {
    const src = view === "equipment" ? machines.map((m) => m.health) : points.map((p) => p.h.health);
    return { Poor: src.filter((h) => h === "Poor").length, Fair: src.filter((h) => h === "Fair").length, Good: src.filter((h) => h === "Good").length };
  }, [view, machines, points]);

  // Overview (D5): the plant's health split and which areas have the most
  // problems — for the current view and contractor, before the area,
  // health and text filters (clicking them sets those filters).
  const overview = useMemo(() => {
    const src = (view === "equipment" ? machines : points).filter((r) => {
      const reg = view === "equipment" ? r.list[0].reg : r.reg;
      return contractor === "All" || reg.contractor === contractor;
    });
    const healthOf = (r) => (view === "equipment" ? r.health : r.h.health);
    const total = { Good: 0, Fair: 0, Poor: 0 };
    const byArea = new Map();
    src.forEach((r) => {
      const hl = healthOf(r);
      total[hl]++;
      const a = (view === "equipment" ? r.area : r.reg.area) || "No area";
      if (!byArea.has(a)) byArea.set(a, { Good: 0, Fair: 0, Poor: 0 });
      byArea.get(a)[hl]++;
    });
    const areaRows = [...byArea.entries()]
      .map(([label, n]) => ({ label, n }))
      .sort((x, y) => (x.label === "No area") - (y.label === "No area") || y.n.Poor - x.n.Poor || y.n.Fair - x.n.Fair || x.label.localeCompare(y.label));
    return { total, all: src.length, areaRows };
  }, [view, machines, points, contractor]);
  const [showAllAreas, setShowAllAreas] = useState(false);

  const q = text.trim().toLowerCase();
  const healthOk = (h) => healthFilter === "all" || (healthFilter === "attention" ? h !== "Good" : h === healthFilter);
  const rows = (view === "equipment" ? machines : points)
    .filter((r) => {
      const reg = view === "equipment" ? r.list[0].reg : r.reg;
      if (area !== "All" && reg.area !== area) return false;
      if (contractor !== "All" && reg.contractor !== contractor) return false;
      if (!healthOk(view === "equipment" ? r.health : r.h.health)) return false;
      if (!q) return true;
      const hay = view === "equipment"
        ? [r.id, r.area, ...r.list.map((p) => `${p.reg.code} ${p.reg.description || ""} ${p.reg.lubricationPoint || ""}`)]
        : [r.reg.code, r.reg.equipmentId, r.reg.description, r.reg.lubricationPoint, r.reg.area];
      return hay.filter(Boolean).some((x) => String(x).toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const ha = view === "equipment" ? a.health : a.h.health;
      const hb = view === "equipment" ? b.health : b.h.health;
      const sa = view === "equipment" ? a.score : a.h.score;
      const sb = view === "equipment" ? b.score : b.h.score;
      return HEALTH_RANK[hb] - HEALTH_RANK[ha] || sb - sa || String(view === "equipment" ? a.id : a.reg.code).localeCompare(String(view === "equipment" ? b.id : b.reg.code));
    });

  const chip = (key, label, n, colorKey) => {
    const active = healthFilter === key;
    const color = colorKey ? T[colorKey] : T.accent;
    return (
      <button
        key={key}
        type="button"
        onClick={() => { setHealthFilter(active ? "all" : key); setLimit(PAGE); }}
        aria-pressed={active}
        style={{ ...s.btn, padding: "6px 14px", fontSize: 12.5, borderRadius: 999, borderColor: active ? color : T.border, color: active ? color : T.textSecondary, fontWeight: active ? 700 : 500 }}
      >
        {label} <strong style={{ marginLeft: 4, color }}>{n}</strong>
      </button>
    );
  };

  const nextChangeCell = (date, overdue) =>
    date ? <span style={{ color: overdue ? T.danger : undefined, fontWeight: overdue ? 700 : undefined }}>{formatDate(date)}{overdue ? " (overdue)" : ""}</span> : <span style={{ color: T.textMuted }}>—</span>;

  const healthSegs = [
    { label: "Good", value: overview.total.Good, color: T.success },
    { label: "Fair", value: overview.total.Fair, color: T.warning },
    { label: "Poor", value: overview.total.Poor, color: T.danger },
  ];
  const goodPct = overview.all ? Math.round((overview.total.Good / overview.all) * 100) : null;
  const areaRows = showAllAreas ? overview.areaRows : overview.areaRows.slice(0, 6);

  return (
    <div data-testid="equipment-list">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ ...s.card, marginBottom: 0 }} data-testid="eq-health-donut">
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15, color: T.textPrimary }}>Plant status · {overview.all} {view === "equipment" ? "equipment" : "points"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Donut T={T} segments={healthSegs} size={128} center={goodPct == null ? "—" : `${goodPct}%`} sub="Good" ariaLabel={`${overview.total.Good} Good, ${overview.total.Fair} Fair, ${overview.total.Poor} Poor`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {healthSegs.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => { setHealthFilter(healthFilter === x.label ? "all" : x.label); setLimit(PAGE); }}
                  aria-pressed={healthFilter === x.label}
                  style={{ display: "flex", alignItems: "center", gap: 8, border: 0, background: healthFilter === x.label ? x.color + "1A" : "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", color: T.textPrimary, fontSize: 14 }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color }} />
                  <b>{x.value}</b> {x.label}
                </button>
              ))}
              <span style={{ fontSize: 12, color: T.textSecondary, paddingLeft: 8 }}>Tap one to show only those</span>
            </div>
          </div>
        </div>
        <div style={{ ...s.card, marginBottom: 0 }} data-testid="eq-area-bars">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15, color: T.textPrimary }}>Problems by area</p>
            <span style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 10 }}>
              {healthSegs.slice().reverse().map((x) => (
                <span key={x.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: x.color }} />
                  {x.label}
                </span>
              ))}
            </span>
          </div>
          {overview.areaRows.length === 0 ? (
            <p style={{ color: T.textSecondary, margin: 0, fontSize: 13 }}>No areas in the register.</p>
          ) : (
            <>
              <StackedBars
                T={T}
                activeLabel={area === "All" ? null : area}
                onRow={(r) => { setArea(area === r.label || r.label === "No area" ? "All" : r.label); setLimit(PAGE); }}
                rows={areaRows.map((r) => ({
                  label: r.label,
                  parts: [
                    { label: "Poor", value: r.n.Poor, color: T.danger },
                    { label: "Fair", value: r.n.Fair, color: T.warning },
                    { label: "Good", value: r.n.Good, color: T.success + "99" },
                  ],
                }))}
              />
              {overview.areaRows.length > 6 && (
                <button type="button" style={{ ...s.btn, marginTop: 8, fontSize: 12 }} onClick={() => setShowAllAreas((v) => !v)}>
                  {showAllAreas ? "Show fewer" : `All ${overview.areaRows.length} areas`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {chip("attention", "Needs attention", counts.Poor + counts.Fair, "warning")}
        {chip("Poor", "Poor", counts.Poor, "danger")}
        {chip("Fair", "Fair", counts.Fair, "warning")}
        {chip("Good", "Good", counts.Good, "success")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div role="group" aria-label="View" style={{ display: "inline-flex", gap: 6 }}>
          {[["equipment", "Equipment"], ["points", "Lubrication points"]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => { setView(k); setLimit(PAGE); }}
              style={{ ...s.btn, padding: "6px 14px", fontSize: 12.5, borderRadius: 999, background: view === k ? T.accent : T.cardBg, borderColor: view === k ? T.accent : T.border, color: view === k ? T.accentText : T.textSecondary, fontWeight: view === k ? 700 : 500 }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          style={{ ...s.input, width: 220, flex: "1 1 180px", maxWidth: 320 }}
          type="search"
          aria-label="Filter the list"
          placeholder="Filter by code, name or area…"
          value={text}
          onChange={(e) => { setText(e.target.value); setLimit(PAGE); }}
        />
        <select style={{ ...s.select, width: "auto" }} aria-label="Area" value={area} onChange={(e) => { setArea(e.target.value); setLimit(PAGE); }}>
          <option value="All">All areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {!scopedContractor && contractors.length > 1 && (
          <ContractorChips value={contractor} onChange={(c) => { setContractor(c); setLimit(PAGE); }} options={contractors} testid="eq-contractor" />
        )}
      </div>

      {rows.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>Nothing matches these filters.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              {view === "equipment" ? (
                <tr>
                  <th style={s.th}>Equipment</th>
                  <th style={s.th}>Area</th>
                  {!scopedContractor && <th style={s.th}>Contractor</th>}
                  <th style={s.th}>Points</th>
                  <th style={s.th}>Health</th>
                  <th style={s.th}>Next oil change</th>
                  <th style={s.th}>Open actions</th>
                </tr>
              ) : (
                <tr>
                  <th style={s.th}>Lubrication point</th>
                  <th style={s.th}>Area</th>
                  {!scopedContractor && <th style={s.th}>Contractor</th>}
                  <th style={s.th}>Health</th>
                  <th style={s.th}>Latest result</th>
                  <th style={s.th}>Next oil change</th>
                  <th style={s.th}>Open actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) =>
                view === "equipment" ? (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => onOpenEquipment(r.id)} data-testid={`eq-row-${r.id}`}>
                    <td style={s.td}>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent }}>{r.id}</div>
                      <div style={{ fontSize: 12, color: T.textSecondary }}>{r.list[0].reg.description || ""}</div>
                    </td>
                    <td style={s.td}>{r.area || "—"}</td>
                    {!scopedContractor && <td style={s.td}>{r.contractor || "—"}</td>}
                    <td style={s.td}>
                      {r.list.length}
                      {r.attention > 0 && <div style={{ fontSize: 12, color: T.warning }}>{r.attention} need attention</div>}
                    </td>
                    <td style={s.td}><HealthCell T={T} health={r.health} reasons={r.reasons} /></td>
                    <td style={s.td}>{nextChangeCell(r.nextChange, r.changeOverdue)}</td>
                    <td style={s.td}>
                      {r.openActions || "—"}
                      {r.overdueActions > 0 && <div style={{ fontSize: 12, color: T.danger }}>{r.overdueActions} overdue</div>}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.reg.code} style={{ cursor: "pointer" }} onClick={() => onOpenLp(r.reg.code)} data-testid={`lp-row-${r.reg.code}`}>
                    <td style={s.td}>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent }}>{r.reg.code}</div>
                      <div style={{ fontSize: 12, color: T.textSecondary }}>{r.reg.lubricationPoint || r.reg.description || ""}</div>
                    </td>
                    <td style={s.td}>{r.reg.area || "—"}</td>
                    {!scopedContractor && <td style={s.td}>{r.reg.contractor || "—"}</td>}
                    <td style={s.td}><HealthCell T={T} health={r.h.health} reasons={r.h.reasons.map((x) => x.text)} /></td>
                    <td style={s.td}>
                      {r.h.latest ? (
                        <>
                          <span style={s.badge(r.h.latest.reportStatus)}>{r.h.latest.reportStatus || "—"}</span>
                          <div style={{ fontSize: 12, color: T.textSecondary }}>{r.h.latest.sampledDate}</div>
                        </>
                      ) : (
                        <span style={{ color: T.textMuted }}>{r.reg.oilAnalysisRequired === "Yes" ? "none yet" : "not sampled"}</span>
                      )}
                    </td>
                    <td style={s.td}>{nextChangeCell(r.nextChange, r.changeOverdue)}</td>
                    <td style={s.td}>
                      {r.h.openActions || "—"}
                      {r.h.overdueActions > 0 && <div style={{ fontSize: 12, color: T.danger }}>{r.h.overdueActions} overdue</div>}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button type="button" style={s.btn} onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({rows.length - limit} left)
          </button>
        </div>
      )}
    </div>
  );
}

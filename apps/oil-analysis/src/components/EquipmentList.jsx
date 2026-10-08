import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import { HEALTH_COLOR, HEALTH_RANK, healthForLp, worstHealth } from "../equipmentHealth";
import { Donut, StackedBars } from "./DashCharts";
import ContractorChips from "./ContractorChips";
import BottomSheet, { SheetButton, SheetChip, SheetGroup } from "./BottomSheet";
import useIsMobile from "../hooks/useIsMobile";

// Oil Equipment opening screen: every machine (or lubrication point) with
// its health and why, filters, and a "Needs attention" shortcut.

const PAGE = 50;
// status shown as a word plus a shape, never colour alone (design reference §5)
const HEALTH_SYMBOL = { Good: "●", Fair: "▲", Poor: "◆" };

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
  // phone: charts fold into a one-line health bar; area/contractor in a sheet
  const phone = useIsMobile();
  const [chartsOpen, setChartsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

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
        style={{ ...s.btn, padding: "6px 14px", fontSize: 12.5, borderRadius: 999, borderColor: active ? color : T.border, color: active ? color : T.textSecondary, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", flex: "0 0 auto", minHeight: phone ? 38 : undefined }}
      >
        {HEALTH_SYMBOL[key] ? <span aria-hidden="true" style={{ color, marginRight: 4 }}>{HEALTH_SYMBOL[key]}</span> : null}
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

  const charts = (
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
  );

  if (phone) {
    return (
      <PhoneList
        {...{ T, s, view, setView, area, setArea, areas, contractor, setContractor, contractors, scopedContractor, text, setText, rows, limit, setLimit, chip, counts, goodPct, overview, chartsOpen, setChartsOpen, sheetOpen, setSheetOpen, onOpenEquipment, onOpenLp, nextChangeCell, charts }}
      />
    );
  }

  return (
    <div data-testid="equipment-list">
      {charts}
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

// ── Phone (mobile app design M2) ─────────────────────────────────────────
// Search and the list first: the two charts fold into a one-line health bar
// (tap to open them), status chips swipe sideways, area and contractor sit
// in a filter sheet, and each row is a card with the status as a word plus
// a shape. The same filters and data as the desktop table.
function PhoneList({ T, s, view, setView, area, setArea, areas, contractor, setContractor, contractors, scopedContractor, text, setText, rows, limit, setLimit, chip, counts, goodPct, overview, chartsOpen, setChartsOpen, sheetOpen, setSheetOpen, onOpenEquipment, onOpenLp, nextChangeCell, charts }) {
  const total = overview.all || 1;
  const pct = (n) => `${(n / total) * 100}%`;
  const extraFilters = (area !== "All" ? 1 : 0) + (contractor !== "All" ? 1 : 0);
  const reset = () => { setArea("All"); setContractor("All"); setLimit(PAGE); };
  const card = { display: "block", width: "100%", textAlign: "left", background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, padding: "11px 12px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", color: T.textPrimary };
  const pill = (health) => {
    const color = T[HEALTH_COLOR[health]];
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color, background: color + "1F", borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap", flexShrink: 0 }}>
        {HEALTH_SYMBOL[health]} {health}
      </span>
    );
  };

  return (
    <div data-testid="equipment-list">
      <button type="button" onClick={() => setChartsOpen((v) => !v)} aria-expanded={chartsOpen} data-testid="eq-summary"
        style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <span style={{ fontSize: 14 }}><b style={{ fontSize: 16 }}>{goodPct == null ? "—" : `${goodPct}%`}</b> good</span>
        <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: T.border }}>
          <span style={{ width: pct(overview.total.Good), background: T.success }} />
          <span style={{ width: pct(overview.total.Fair), background: T.warning }} />
          <span style={{ width: pct(overview.total.Poor), background: T.danger }} />
        </span>
        <span style={{ fontSize: 13, color: T.danger, fontWeight: 700 }}>◆ {overview.total.Poor}</span>
        <i className={`ti ti-chevron-${chartsOpen ? "up" : "down"}`} aria-hidden="true" style={{ color: T.textSecondary }} />
      </button>
      {chartsOpen && charts}

      <div role="group" aria-label="View" style={{ display: "flex", background: T.border + "AA", borderRadius: 11, padding: 3, marginBottom: 10 }}>
        {[["equipment", "Equipment"], ["points", "Lubrication points"]].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setLimit(PAGE); }}
            style={{ flex: 1, minHeight: 36, border: 0, borderRadius: 9, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", background: view === k ? T.cardBg : "transparent", color: view === k ? T.textPrimary : T.textSecondary, boxShadow: view === k ? "0 1px 2px rgba(0,0,0,.12)" : "none" }}>
            {label}
          </button>
        ))}
      </div>
      <input
        style={{ ...s.input, width: "100%", boxSizing: "border-box", minHeight: 44, fontSize: 15, marginBottom: 10 }}
        type="search"
        aria-label="Filter the list"
        placeholder="Filter by code, name or area…"
        value={text}
        onChange={(e) => { setText(e.target.value); setLimit(PAGE); }}
      />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 8, scrollbarWidth: "none" }}>
        {chip("attention", "Needs attention", counts.Poor + counts.Fair, "warning")}
        {chip("Poor", "Poor", counts.Poor, "danger")}
        {chip("Fair", "Fair", counts.Fair, "warning")}
        {chip("Good", "Good", counts.Good, "success")}
        <button type="button" onClick={() => setSheetOpen(true)} data-testid="eq-filters"
          style={{ ...s.btn, flex: "0 0 auto", whiteSpace: "nowrap", minHeight: 38, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, color: T.accent, borderColor: T.accent + "66", background: T.accent + "12", fontWeight: 600 }}>
          <i className="ti ti-filter" aria-hidden="true" /> Filters{extraFilters ? ` · ${extraFilters}` : ""}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "0 2px 8px" }}>
        {rows.length} {view === "equipment" ? "equipment" : "points"} · worst first{area !== "All" ? ` · ${area}` : ""}{contractor !== "All" ? ` · ${contractor}` : ""}
      </p>

      {rows.length === 0 ? (
        <div style={{ ...card, cursor: "default", textAlign: "center", color: T.textSecondary }}>
          Nothing matches these filters.
          {extraFilters > 0 && (
            <div><button type="button" style={{ ...s.btn, marginTop: 8 }} onClick={reset}>Clear filters</button></div>
          )}
        </div>
      ) : (
        rows.slice(0, limit).map((r) => {
          const eq = view === "equipment";
          const reg = eq ? r.list[0].reg : r.reg;
          const health = eq ? r.health : r.h.health;
          const reasons = eq ? r.reasons : r.h.reasons.map((x) => x.text);
          const open = eq ? r.openActions : r.h.openActions;
          const late = eq ? r.overdueActions : r.h.overdueActions;
          return (
            <button key={eq ? r.id : reg.code} type="button" style={card} onClick={() => (eq ? onOpenEquipment(r.id) : onOpenLp(reg.code))} data-testid={eq ? `eq-row-${r.id}` : `lp-row-${reg.code}`}>
              <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 14, color: T.accent }}>{eq ? r.id : reg.code}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[eq ? reg.description : reg.lubricationPoint || reg.description, reg.area, !scopedContractor && reg.contractor].filter(Boolean).join(" · ")}
                  </span>
                  {reasons.length > 0 && (
                    <span style={{ display: "block", fontSize: 12.5, color: health === "Poor" ? T.danger : T.warning, marginTop: 2, lineHeight: 1.35 }}>
                      {reasons.slice(0, 2).join(" · ")}{reasons.length > 2 ? ` · +${reasons.length - 2}` : ""}
                    </span>
                  )}
                  <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                    {eq && <span>{r.list.length} point{r.list.length === 1 ? "" : "s"}</span>}
                    <span>Next change {nextChangeCell(eq ? r.nextChange : r.nextChange, eq ? r.changeOverdue : r.changeOverdue)}</span>
                    {open > 0 && <span>{open} open action{open === 1 ? "" : "s"}{late ? <b style={{ color: T.danger }}> · {late} overdue</b> : ""}</span>}
                  </span>
                </span>
                {pill(health)}
                <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: T.textMuted, marginTop: 2 }} />
              </span>
            </button>
          );
        })
      )}
      {rows.length > limit && (
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <button type="button" style={{ ...s.btn, minHeight: 44, width: "100%" }} onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({rows.length - limit} left)
          </button>
        </div>
      )}

      <BottomSheet
        open={sheetOpen}
        title="Filters"
        hint="Apply to the list and the health bar"
        onClose={() => setSheetOpen(false)}
        testid="eq-filter-sheet"
        footer={
          <>
            <SheetButton onClick={reset}>Reset</SheetButton>
            <SheetButton primary grow={2} onClick={() => setSheetOpen(false)} testid="eq-filter-show">
              Show {rows.length} {view === "equipment" ? "equipment" : "points"}
            </SheetButton>
          </>
        }
      >
        {!scopedContractor && contractors.length > 1 && (
          <SheetGroup label="Contractor">
            {["All", ...contractors].map((c) => (
              <SheetChip key={c} on={contractor === c} onClick={() => { setContractor(c); setLimit(PAGE); }}>{c}</SheetChip>
            ))}
          </SheetGroup>
        )}
        <SheetGroup label="Area">
          <select style={{ ...s.select, width: "100%", minHeight: 44, fontSize: 15 }} aria-label="Area" value={area} onChange={(e) => { setArea(e.target.value); setLimit(PAGE); }}>
            <option value="All">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </SheetGroup>
      </BottomSheet>
    </div>
  );
}

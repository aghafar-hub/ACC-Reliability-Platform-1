import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import { HEALTH_COLOR, HEALTH_RANK, healthForLp, worstHealth } from "../equipmentHealth";

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
        style={{ ...s.btn, borderColor: active ? color : T.border, color: active ? color : T.textSecondary, fontWeight: active ? 700 : 500 }}
      >
        {label} <strong style={{ marginLeft: 4, color }}>{n}</strong>
      </button>
    );
  };

  const nextChangeCell = (date, overdue) =>
    date ? <span style={{ color: overdue ? T.danger : undefined, fontWeight: overdue ? 700 : undefined }}>{formatDate(date)}{overdue ? " (overdue)" : ""}</span> : <span style={{ color: T.textMuted }}>—</span>;

  return (
    <div data-testid="equipment-list">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {chip("attention", "Needs attention", counts.Poor + counts.Fair, "warning")}
        {chip("Poor", "Poor", counts.Poor, "danger")}
        {chip("Fair", "Fair", counts.Fair, "warning")}
        {chip("Good", "Good", counts.Good, "success")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "inline-flex", border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
          {[["equipment", "Equipment"], ["points", "Lubrication points"]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => { setView(k); setLimit(PAGE); }}
              style={{ ...s.btn, border: "none", borderRadius: 0, background: view === k ? T.accent : "transparent", color: view === k ? T.accentText : T.textSecondary }}
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
          <select style={{ ...s.select, width: "auto" }} aria-label="Contractor" value={contractor} onChange={(e) => { setContractor(e.target.value); setLimit(PAGE); }}>
            <option value="All">All contractors</option>
            {contractors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
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

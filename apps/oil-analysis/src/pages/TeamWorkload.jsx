import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { Donut, StackedBars } from "../components/DashCharts";

// Phase 7 — managers' view: per contractor, the open work and what's late.
// Live: the backend counts it straight from the sheets on every open (no
// separate store), so it's as current as the sheets themselves.
// A contractor's people only get their own contractor back (the backend
// scopes it); ACC sees every contractor. Escalation of items still overdue
// 10 days later runs in the daily notification job (Managers.js).

// ACC / App Owner: the contractors side by side, worse value in red.
const COMPARE_ROWS = [
  { label: "Open routes", get: (c) => c.routes.draft + c.routes.assigned + c.routes.inProgress },
  { label: "Routes overdue", get: (c) => c.routes.overdue, bad: true },
  { label: "Routes overdue (% of open)", get: (c) => pct(c.routes.overdue, c.routes.draft + c.routes.assigned + c.routes.inProgress), bad: true, unit: "%" },
  { label: "Routes returned for correction", get: (c) => c.routes.returned, bad: true },
  { label: "Routes waiting approval", get: (c) => c.routes.waitingApproval, bad: true },
  { label: "Open actions", get: (c) => c.actions.open + c.actions.waitingStoppage },
  { label: "Actions overdue", get: (c) => c.actions.overdue, bad: true },
  { label: "Actions overdue (% of Open)", get: (c) => pct(c.actions.overdue, c.actions.open), bad: true, unit: "%" },
  { label: "Draft actions not submitted", get: (c) => c.actions.draft, bad: true },
  { label: "Closure requested", get: (c) => c.actions.closureRequested },
  { label: "Lab reports to validate", get: (c) => c.labReportsPending, bad: true },
  { label: "Open suggestions (no route yet)", get: (c) => c.suggestionsOpen, bad: true },
  { label: "Low-stock oils", get: (c) => c.lowStock, bad: true },
  { label: "Technicians", get: (c) => c.technicians.length },
];

function pct(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function CompareTable({ contractors }) {
  const { T, s } = useTheme();
  return (
    <div style={{ ...s.card, marginBottom: 20 }} data-testid="team-compare">
      <p style={{ ...s.sectionTitle, marginTop: 0 }}>Contractors compared</p>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Measure</th>
              {contractors.map((c) => (
                <th key={c.contractor} style={s.th}>
                  {c.contractor}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => {
              const values = contractors.map((c) => row.get(c));
              const worst = Math.max(...values);
              const differs = values.some((v) => v !== worst);
              return (
                <tr key={row.label}>
                  <td style={s.td}>{row.label}</td>
                  {values.map((v, i) => {
                    const hot = row.bad && differs && v === worst && v > 0;
                    return (
                      <td key={contractors[i].contractor} style={{ ...s.td, color: hot ? T.danger : undefined, fontWeight: hot ? 700 : undefined }}>
                        {v}
                        {row.unit || ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: T.textSecondary, margin: "10px 0 0" }}>Red marks the contractor with more of something that should be low.</p>
    </div>
  );
}

// Route stages for the per-technician bars: not started → in progress →
// sent for approval in one blue, light → dark; returned in amber (it needs
// fixing). Overdue overlaps these, so it's named next to the technician.
function techStages(T) {
  const blue = (pct) => `color-mix(in srgb, ${T.accent} ${pct}%, ${T.cardBg})`;
  return [
    { key: "assigned", label: "Not started", color: blue(35) },
    { key: "inProgress", label: "In progress", color: blue(65) },
    { key: "waitingApproval", label: "Waiting approval", color: blue(100) },
    { key: "returned", label: "Returned", color: T.warning },
  ];
}

// Totals across the contractors shown, for the tiles at the top.
function sumOf(contractors, get) {
  return contractors.reduce((n, c) => n + (Number(get(c)) || 0), 0);
}
const openRoutes = (c) => c.routes.draft + c.routes.assigned + c.routes.inProgress + c.routes.waitingApproval + c.routes.returned;
const openActions = (c) => c.actions.draft + c.actions.open + c.actions.waitingStoppage + c.actions.closureRequested;

function Tile({ T, s, icon, label, value, sub, bad, testid }) {
  const hot = bad && value > 0;
  const color = hot ? T.danger : T.accent;
  return (
    <div style={{ ...s.card, marginBottom: 0, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", borderLeft: `3px solid ${hot ? T.danger : T.border}` }} data-testid={testid}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: color + "1A", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
        <i className={`ti ${icon}`} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: hot ? T.danger : T.textPrimary, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12.5, color: T.textSecondary, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: T.textMuted }}>{sub}</div>}
      </div>
    </div>
  );
}

// Contractors side by side as bars: one row per measure, one bar per
// contractor, all on the row's own scale (counts of different things
// never share an axis). Contractor colours stay fixed by name.
function CompareBars({ T, s, contractors }) {
  const palette = [T.accent, T.textSecondary, T.info, T.success];
  const colorOf = (i) => palette[i % palette.length];
  const rows = [
    { label: "Open routes", get: openRoutes },
    { label: "Routes overdue", get: (c) => c.routes.overdue, bad: true },
    { label: "Returned for correction", get: (c) => c.routes.returned, bad: true },
    { label: "Open actions", get: openActions },
    { label: "Actions overdue", get: (c) => c.actions.overdue, bad: true },
    { label: "Lab reports to validate", get: (c) => c.labReportsPending, bad: true },
    { label: "Suggestions without a route", get: (c) => c.suggestionsOpen, bad: true },
  ];
  return (
    <div style={{ ...s.card, marginBottom: 0 }} data-testid="team-compare-bars">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Contractors compared</span>
        <span style={{ display: "flex", gap: 12, fontSize: 12, color: T.textSecondary }}>
          {contractors.map((c, i) => (
            <span key={c.contractor} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(i) }} />
              {c.contractor}
            </span>
          ))}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => {
          const vals = contractors.map((c) => Number(r.get(c)) || 0);
          const max = Math.max(1, ...vals);
          const worst = Math.max(...vals);
          return (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 190px) 1fr", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: T.textPrimary }}>{r.label}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {vals.map((v, i) => {
                  const hot = r.bad && v > 0 && v === worst && vals.some((x) => x !== worst);
                  return (
                    <div key={contractors[i].contractor} style={{ display: "flex", alignItems: "center", gap: 6 }} title={`${contractors[i].contractor}: ${v}`}>
                      <span style={{ height: 10, width: `${(v / max) * 85}%`, minWidth: v ? 4 : 0, background: colorOf(i), borderRadius: 3 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: hot ? T.danger : T.textPrimary }}>{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: T.textSecondary, margin: "12px 0 0" }}>A red number is the contractor with more of something that should be low.</p>
    </div>
  );
}

function StageDonut({ T, title, segments, sub, testid }) {
  const total = segments.reduce((n, x) => n + x.value, 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} data-testid={testid}>
      <Donut T={T} segments={segments} size={104} thickness={15} center={total} sub={sub} ariaLabel={`${title}: ${segments.map((x) => `${x.value} ${x.label}`).join(", ")}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 2 }}>{title}</span>
        {segments.map((x) => (
          <span key={x.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.textPrimary }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: x.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{x.label}</span>
            <b>{x.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function ContractorCard({ T, s, c }) {
  const [showTable, setShowTable] = useState(false);
  const blue = (pct) => `color-mix(in srgb, ${T.accent} ${pct}%, ${T.cardBg})`;
  const routeSegs = [
    { label: "Draft (no technician)", value: c.routes.draft, color: blue(25) },
    { label: "Assigned", value: c.routes.assigned, color: blue(45) },
    { label: "In progress", value: c.routes.inProgress, color: blue(70) },
    { label: "Waiting approval", value: c.routes.waitingApproval, color: blue(100) },
    { label: "Returned", value: c.routes.returned, color: T.warning },
  ];
  const actionSegs = [
    { label: "Draft", value: c.actions.draft, color: blue(25) },
    { label: "Open", value: c.actions.open, color: blue(55) },
    { label: "Waiting stoppage", value: c.actions.waitingStoppage, color: blue(78) },
    { label: "Closure requested", value: c.actions.closureRequested, color: blue(100) },
  ];
  const attention = [
    { label: "routes overdue", value: c.routes.overdue, icon: "ti-route" },
    { label: "routes returned", value: c.routes.returned, icon: "ti-arrow-back-up" },
    { label: "actions overdue", value: c.actions.overdue, icon: "ti-checklist" },
    { label: "draft actions not submitted", value: c.actions.draft, icon: "ti-pencil" },
    { label: "lab reports to validate", value: c.labReportsPending, icon: "ti-flask" },
    { label: "low-stock oils", value: c.lowStock, icon: "ti-package" },
  ].filter((x) => x.value > 0);
  const name = c.contractor === "—" ? "No contractor" : c.contractor;
  return (
    <div data-testid={`team-${c.contractor}`} style={{ ...s.card, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: T.accent + "1A", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
          {name.slice(0, 2).toUpperCase()}
        </span>
        <p style={{ ...s.sectionTitle, margin: 0 }}>{name}</p>
        <span style={{ fontSize: 12.5, color: T.textSecondary }}>
          {c.technicians.length} technician{c.technicians.length === 1 ? "" : "s"} · {c.suggestionsOpen} open suggestion{c.suggestionsOpen === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: T.appBg, borderRadius: 10, padding: 14 }}>
          <StageDonut T={T} title="Routes by stage" segments={routeSegs} sub="routes" testid={`team-routes-${c.contractor}`} />
        </div>
        <div style={{ background: T.appBg, borderRadius: 10, padding: 14 }}>
          <StageDonut T={T} title="Actions by stage" segments={actionSegs} sub="actions" testid={`team-actions-${c.contractor}`} />
        </div>
        <div style={{ background: T.appBg, borderRadius: 10, padding: 14 }} data-testid={`team-attention-${c.contractor}`}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Needs attention</span>
          {attention.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.success, margin: "8px 0 0", fontWeight: 600 }}>
              <i className="ti ti-circle-check" aria-hidden="true" /> Nothing late or waiting.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {attention.map((x) => (
                <span key={x.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textPrimary }}>
                  <i className={`ti ${x.icon}`} aria-hidden="true" style={{ color: T.danger }} />
                  <b style={{ color: T.danger, minWidth: 22 }}>{x.value}</b> {x.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {c.technicians.length > 0 && (
        <div style={{ margin: "4px 0 10px" }} data-testid={`team-bars-${c.contractor}`}>
          {/* D5 — work per technician: one bar each, by stage, same scale */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Routes per technician</p>
            <span style={{ display: "flex", gap: 10, fontSize: 12, color: T.textSecondary, flexWrap: "wrap" }}>
              {techStages(T).map((st) => (
                <span key={st.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: st.color }} />
                  {st.label}
                </span>
              ))}
            </span>
          </div>
          <StackedBars
            T={T}
            labelWidth={190}
            rows={c.technicians.map((t) => ({
              label: `${String(t.email).split("@")[0]}${t.overdue ? ` · ${t.overdue} overdue` : ""}`,
              parts: techStages(T).map((st) => ({ label: st.label, value: Number(t[st.key]) || 0, color: st.color })),
            }))}
          />
          <button type="button" style={{ ...s.btn, marginTop: 10, fontSize: 12.5, padding: "5px 12px" }} onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
            <i className={`ti ${showTable ? "ti-chevron-up" : "ti-table"}`} aria-hidden="true" /> {showTable ? "Hide the table" : "Show as a table"}
          </button>
        </div>
      )}
      {c.technicians.length > 0 && showTable && (
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Technician</th>
                <th style={s.th}>Assigned</th>
                <th style={s.th}>In Progress</th>
                <th style={s.th}>Waiting Approval</th>
                <th style={s.th}>Returned</th>
                <th style={s.th}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {c.technicians.map((t) => (
                <tr key={t.email}>
                  <td style={s.td}>{t.email}</td>
                  <td style={s.td}>{t.assigned}</td>
                  <td style={s.td}>{t.inProgress}</td>
                  <td style={s.td}>{t.waitingApproval}</td>
                  <td style={{ ...s.td, color: t.returned ? T.danger : undefined }}>{t.returned}</td>
                  <td style={{ ...s.td, color: t.overdue ? T.danger : undefined, fontWeight: t.overdue ? 700 : undefined }}>{t.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TeamWorkload({ webhookUrl }) {
  const { T, s } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCompareTable, setShowCompareTable] = useState(false);

  const refresh = useCallback(async () => {
    if (!webhookUrl) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.getTeamWorkload(webhookUrl));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!webhookUrl) return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;

  const contractors = (data && data.contractors) || [];
  const compared = contractors.filter((c) => c.contractor !== "—" && c.contractor !== "ACC");
  const updated = data?.generatedAt ? new Date(data.generatedAt) : null;
  return (
    <div>
      <div className="mobile-stack-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: 0 }}>Team Workload</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "2px 0 0" }}>
            Open work per contractor, counted live from the sheets{updated && !isNaN(updated) ? ` · updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}.
          </p>
        </div>
        <button type="button" style={s.btn} onClick={refresh} disabled={loading}>
          <i className="ti ti-refresh" aria-hidden="true" /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {loading && !data && (
        <div style={{ ...s.card, color: T.textSecondary, marginBottom: 16 }}>Reading routes, actions, lab reports and stock from the sheets…</div>
      )}
      {error && <div style={{ ...s.card, color: T.danger, marginBottom: 16 }}>Couldn't load the workload: {error}</div>}
      {!loading && !error && contractors.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", color: T.textSecondary, padding: 30 }}>
          <i className="ti ti-mood-smile" aria-hidden="true" style={{ fontSize: 28, color: T.success }} />
          <p style={{ margin: "6px 0 0" }}>No open work.</p>
        </div>
      )}
      {contractors.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14, marginBottom: 20 }} data-testid="team-tiles">
          <Tile T={T} s={s} icon="ti-route" label="Open routes" value={sumOf(contractors, openRoutes)} sub={`${sumOf(contractors, (c) => c.routes.overdue)} overdue`} testid="team-tile-routes" />
          <Tile T={T} s={s} icon="ti-alarm" label="Routes overdue" value={sumOf(contractors, (c) => c.routes.overdue)} bad testid="team-tile-routes-overdue" />
          <Tile T={T} s={s} icon="ti-checklist" label="Open actions" value={sumOf(contractors, openActions)} sub={`${sumOf(contractors, (c) => c.actions.overdue)} overdue`} testid="team-tile-actions" />
          <Tile T={T} s={s} icon="ti-alert-triangle" label="Actions overdue" value={sumOf(contractors, (c) => c.actions.overdue)} bad testid="team-tile-actions-overdue" />
          <Tile T={T} s={s} icon="ti-flask" label="Lab reports to validate" value={sumOf(contractors, (c) => c.labReportsPending)} bad testid="team-tile-lab" />
          <Tile T={T} s={s} icon="ti-package" label="Low-stock oils" value={sumOf(contractors, (c) => c.lowStock)} bad testid="team-tile-stock" />
        </div>
      )}
      {compared.length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          <CompareBars T={T} s={s} contractors={compared} />
          <button type="button" style={{ ...s.btn, marginTop: 10, fontSize: 12.5, padding: "5px 12px" }} onClick={() => setShowCompareTable((v) => !v)} aria-expanded={showCompareTable}>
            <i className={`ti ${showCompareTable ? "ti-chevron-up" : "ti-table"}`} aria-hidden="true" /> {showCompareTable ? "Hide the full table" : "All measures as a table"}
          </button>
          {showCompareTable && (
            <div style={{ marginTop: 12 }}>
              <CompareTable contractors={compared} />
            </div>
          )}
        </div>
      )}
      {contractors.map((c) => (
        <ContractorCard key={c.contractor} T={T} s={s} c={c} />
      ))}
    </div>
  );
}

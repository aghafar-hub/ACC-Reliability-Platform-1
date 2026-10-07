import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { StackedBars } from "../components/DashCharts";

// Phase 7 — managers' view: per contractor, the open work and what's late.
// Live: the backend counts it straight from the sheets on every open (no
// separate store), so it's as current as the sheets themselves.
// A contractor's people only get their own contractor back (the backend
// scopes it); ACC sees every contractor. Escalation of items still overdue
// 10 days later runs in the daily notification job (Managers.js).

function Count({ label, value, warn }) {
  const { T } = useTheme();
  const hot = warn && value > 0;
  return (
    <div style={{ minWidth: 92, padding: "8px 10px", borderRadius: 8, background: T.bgSecondary || T.bg, border: `1px solid ${hot ? T.danger : T.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: hot ? T.danger : T.textPrimary }}>{value}</div>
      <div style={{ fontSize: 12, color: T.textSecondary }}>{label}</div>
    </div>
  );
}

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

export default function TeamWorkload({ webhookUrl }) {
  const { T, s } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  return (
    <div>
      <div className="mobile-stack-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Team Workload</p>
        <button type="button" style={s.btn} onClick={refresh} disabled={loading}>
          <i className="ti ti-refresh" aria-hidden="true" /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {loading && !data && (
        <div style={{ ...s.card, color: T.textSecondary, marginBottom: 16 }}>Reading routes, actions, lab reports and stock from the sheets…</div>
      )}
      {error && <div style={{ ...s.card, color: T.danger, marginBottom: 16 }}>Couldn't load the workload: {error}</div>}
      {!loading && !error && contractors.length === 0 && <div style={s.card}>No open work.</div>}
      {compared.length >= 2 && <CompareTable contractors={compared} />}
      {contractors.map((c) => (
        <div key={c.contractor} data-testid={`team-${c.contractor}`} style={{ ...s.card, marginBottom: 20 }}>
          <p style={{ ...s.sectionTitle, marginTop: 0 }}>{c.contractor === "—" ? "No contractor" : c.contractor}</p>

          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, margin: "4px 0 6px" }}>Routes</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Count label="Draft" value={c.routes.draft} />
            <Count label="Assigned" value={c.routes.assigned} />
            <Count label="In Progress" value={c.routes.inProgress} />
            <Count label="Waiting Approval" value={c.routes.waitingApproval} />
            <Count label="Returned" value={c.routes.returned} warn />
            <Count label="Overdue" value={c.routes.overdue} warn />
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, margin: "4px 0 6px" }}>Actions</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Count label="Draft" value={c.actions.draft} />
            <Count label="Open" value={c.actions.open} />
            <Count label="Waiting Stoppage" value={c.actions.waitingStoppage} />
            <Count label="Closure Requested" value={c.actions.closureRequested} />
            <Count label="Overdue" value={c.actions.overdue} warn />
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, margin: "4px 0 6px" }}>Other</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Count label="Lab reports to validate" value={c.labReportsPending} warn />
            <Count label="Open suggestions" value={c.suggestionsOpen} />
            <Count label="Low-stock oils" value={c.lowStock} warn />
          </div>

          {c.technicians.length > 0 && (
            <div style={{ margin: "4px 0 16px" }} data-testid={`team-bars-${c.contractor}`}>
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
            </div>
          )}
          {c.technicians.length > 0 && (
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
      ))}
    </div>
  );
}

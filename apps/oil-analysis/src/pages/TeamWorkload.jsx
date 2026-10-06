import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";

// Phase 7 — managers' view: per contractor, the open work and what's late.
// A contractor's people only get their own contractor back (the backend
// scopes it); ACC sees every contractor. Escalation of items still overdue
// 10 days later runs in the daily notification job (Managers.js).

function Count({ label, value, warn }) {
  const { T } = useTheme();
  const hot = warn && value > 0;
  return (
    <div style={{ minWidth: 92, padding: "8px 10px", borderRadius: 8, background: T.bgSecondary || T.bg, border: `1px solid ${hot ? T.danger : T.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: hot ? T.danger : T.textPrimary }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textSecondary }}>{label}</div>
    </div>
  );
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
  return (
    <div>
      <div className="mobile-stack-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Team Workload</p>
        <button type="button" style={s.btn} onClick={refresh} disabled={loading}>
          <i className="ti ti-refresh" aria-hidden="true" /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <div style={{ ...s.card, color: T.danger, marginBottom: 16 }}>{error}</div>}
      {!loading && !error && contractors.length === 0 && <div style={s.card}>No open work.</div>}
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

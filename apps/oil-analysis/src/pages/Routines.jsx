import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import RoutineDetail from "./RoutineDetail";
import NewRoutine from "./NewRoutine";

const STATUS_FILTERS = ["All", "Assigned", "InProgress", "Submitted", "Approved"];
const CONTRACTOR_FILTERS = ["All", "RHI", "ASEC"];

// No login system exists in this app (see parsers.js's Routines section) —
// a Routine here is "assign a checklist of lubrication points to a
// contractor", tracked by free-text AssignedTo/CreatedBy fields, not real
// user accounts. Not synced with the main Full Sync — loaded on demand,
// same as Equipment Registry.
export default function Routines({ webhookUrl, equipmentRegistry, pushToast }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("list"); // "list" | "detail" | "new"
  const [selectedRoutineId, setSelectedRoutineId] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");

  const refresh = useCallback(async () => {
    if (!webhookUrl) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getRoutines(webhookUrl);
      setRoutines(rows.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!webhookUrl) {
    return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;
  }

  if (view === "new") {
    return (
      <NewRoutine
        webhookUrl={webhookUrl}
        equipmentRegistry={equipmentRegistry}
        pushToast={pushToast}
        onCreated={(routineId) => {
          setSelectedRoutineId(routineId);
          setView("detail");
          refresh();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "detail" && selectedRoutineId) {
    return (
      <RoutineDetail
        webhookUrl={webhookUrl}
        routineId={selectedRoutineId}
        equipmentRegistry={equipmentRegistry}
        pushToast={pushToast}
        onBack={() => {
          setView("list");
          setSelectedRoutineId(null);
          refresh();
        }}
      />
    );
  }

  const visible = routines.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (contractorFilter !== "All" && r.contractor !== contractorFilter) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Routines</p>
        <button style={s.btnPrimary} onClick={() => setView("new")}>
          <i className="ti ti-plus" aria-hidden="true" /> New Routine
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((st) => (
          <button
            key={st}
            style={{
              ...s.btn,
              fontSize: 12,
              background: statusFilter === st ? T.accent : "transparent",
              color: statusFilter === st ? T.accentText : T.textSecondary,
              borderColor: statusFilter === st ? T.accent : T.border,
            }}
            onClick={() => setStatusFilter(st)}
          >
            {st}
          </button>
        ))}
        <div style={{ width: 1, background: T.border, margin: "0 4px" }} />
        {CONTRACTOR_FILTERS.map((c) => (
          <button
            key={c}
            style={{
              ...s.btn,
              fontSize: 12,
              background: contractorFilter === c ? T.accent : "transparent",
              color: contractorFilter === c ? T.accentText : T.textSecondary,
              borderColor: contractorFilter === c ? T.accent : T.border,
            }}
            onClick={() => setContractorFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: T.textSecondary }}>Loading routines…</p>
      ) : error ? (
        <p style={{ color: T.danger }}>{error}</p>
      ) : visible.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No routines match the filter.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Assigned To</th>
                <th style={s.th}>Contractor</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Created</th>
                <th style={s.th}>Submitted</th>
                <th style={s.th}>Approved</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.routineId}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedRoutineId(r.routineId);
                    setView("detail");
                  }}
                >
                  <td style={s.td}>{r.assignedTo}</td>
                  <td style={s.td}>{r.contractor || "—"}</td>
                  <td style={s.td}>
                    <span style={s.badge(r.status)}>{r.status}</span>
                  </td>
                  <td style={s.td}>{r.createdDate || "—"}</td>
                  <td style={s.td}>{r.submittedDate || "—"}</td>
                  <td style={s.td}>{r.approvedDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

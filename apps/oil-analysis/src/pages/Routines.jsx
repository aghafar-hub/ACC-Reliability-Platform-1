import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import RoutineDetail from "./RoutineDetail";
import NewRoutine from "./NewRoutine";
import ProgressBar from "../components/ProgressBar";

const STATUS_FILTERS = ["All", "Unassigned", "Assigned", "InProgress", "Submitted", "Approved"];

// How long a routine has sat since it was created without being submitted —
// surfaced so a stalled routine (assigned to a contractor who hasn't
// touched it, or an auto-generated one nobody's assigned yet) is visible
// without opening it.
function agingLabel(createdDate, status) {
  if (!createdDate || status === "Submitted" || status === "Approved") return null;
  const created = new Date(createdDate);
  if (isNaN(created)) return null;
  const days = Math.floor((Date.now() - created.getTime()) / 86400000);
  if (days <= 0) return "Created today";
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function RouteTemplatesPanel({ webhookUrl, pushToast, refreshSignal }) {
  const { T, s } = useTheme();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(null); // templateId currently being acted on

  const refresh = useCallback(async () => {
    if (!webhookUrl) return;
    setLoading(true);
    try {
      const rows = await api.getRouteTemplates(webhookUrl);
      setTemplates(rows);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, pushToast]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, refreshSignal]);

  async function toggleStatus(t) {
    setWorking(t.templateId);
    try {
      const next = t.status === "Active" ? "Paused" : "Active";
      await api.setRouteTemplateStatus(webhookUrl, t.templateId, next);
      await refresh();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(null);
    }
  }

  async function remove(t) {
    setWorking(t.templateId);
    try {
      await api.deleteRouteTemplate(webhookUrl, t.templateId);
      await refresh();
      pushToast("Recurring route deleted.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: 16 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
          <i className={`ti ti-chevron-${open ? "down" : "right"}`} aria-hidden="true" style={{ marginRight: 6 }} />
          Recurring Routes {templates.length > 0 ? `(${templates.length})` : ""}
        </p>
      </div>
      {open &&
        (loading ? (
          <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 10 }}>Loading…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 10 }}>No recurring routes yet — set Frequency in Create Route.</p>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Route Name</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Contractor</th>
                  <th style={s.th}>Area</th>
                  <th style={s.th}>Frequency</th>
                  <th style={s.th}>Next Generate</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.templateId}>
                    <td style={s.td}>{t.routeName}</td>
                    <td style={s.td}>{t.routeType}</td>
                    <td style={s.td}>{t.contractor}</td>
                    <td style={s.td}>{t.area || "All"}</td>
                    <td style={s.td}>{t.frequency}</td>
                    <td style={s.td}>{t.nextGenerateDate || "—"}</td>
                    <td style={s.td}>
                      <span style={s.badge(t.status)}>{t.status}</span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11.5 }} disabled={working === t.templateId} onClick={() => toggleStatus(t)}>
                          {t.status === "Active" ? "Pause" : "Resume"}
                        </button>
                        <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11.5 }} disabled={working === t.templateId} onClick={() => remove(t)}>
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}

// No login system exists in this app (see parsers.js's Routines section) —
// a Routine here is "assign a checklist of lubrication points to a
// contractor", tracked by free-text AssignedTo/CreatedBy fields, not real
// user accounts. Not synced with the main Full Sync — loaded on demand,
// same as Equipment Registry.
export default function Routines({ webhookUrl, equipmentRegistry, samples, actions, oilChanges, pushToast }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("list"); // "list" | "detail" | "new"
  const [selectedRoutineId, setSelectedRoutineId] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [templatesRefreshKey, setTemplatesRefreshKey] = useState(0);

  // Real contractor values from the registry, not a hardcoded guess — so a
  // future third contractor shows up here automatically.
  const contractorFilters = useMemo(() => {
    const real = Array.from(new Set((equipmentRegistry || []).map((r) => r.contractor).filter(Boolean))).sort();
    return ["All", ...real];
  }, [equipmentRegistry]);

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

  if (view === "detail" && selectedRoutineId) {
    return (
      <RoutineDetail
        webhookUrl={webhookUrl}
        routineId={selectedRoutineId}
        equipmentRegistry={equipmentRegistry}
        samples={samples}
        actions={actions}
        oilChanges={oilChanges}
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
          <i className="ti ti-plus" aria-hidden="true" /> Create Route
        </button>
      </div>

      {view === "new" && (
        <NewRoutine
          webhookUrl={webhookUrl}
          equipmentRegistry={equipmentRegistry}
          samples={samples}
          actions={actions}
          oilChanges={oilChanges}
          pushToast={pushToast}
          onCreated={(routineId, templateId) => {
            setView("list");
            refresh();
            if (routineId) {
              setSelectedRoutineId(routineId);
              setView("detail");
            }
            if (templateId) setTemplatesRefreshKey((k) => k + 1);
          }}
          onCancel={() => setView("list")}
        />
      )}

      <RouteTemplatesPanel webhookUrl={webhookUrl} pushToast={pushToast} refreshSignal={templatesRefreshKey} />

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
        {contractorFilters.map((c) => (
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
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Route Name</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Assigned To</th>
                <th style={s.th}>Contractor</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Progress</th>
                <th style={s.th}>Due</th>
                <th style={s.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const aging = agingLabel(r.createdDate, r.status);
                return (
                  <tr
                    key={r.routineId}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedRoutineId(r.routineId);
                      setView("detail");
                    }}
                  >
                    <td style={s.td}>{r.routeName || r.assignedTo || "—"}</td>
                    <td style={s.td}>{r.routeType || "—"}</td>
                    <td style={s.td}>{r.assignedTo || <span style={{ color: T.danger, fontWeight: 700 }}>Unassigned</span>}</td>
                    <td style={s.td}>{r.contractor || "—"}</td>
                    <td style={s.td}>
                      <span style={s.badge(r.status)}>{r.status}</span>
                    </td>
                    <td style={s.td}>
                      <ProgressBar done={r.itemsDone} total={r.itemsTotal} />
                    </td>
                    <td style={s.td}>{r.dueDate || "—"}</td>
                    <td style={s.td}>
                      {r.createdDate || "—"}
                      {aging && <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>{aging}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

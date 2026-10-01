import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import RoutineDetail from "./RoutineDetail";
import NewRoutine from "./NewRoutine";
import ProgressBar from "../components/ProgressBar";

const STATUS_FILTERS = ["All", "Unassigned", "Assigned", "InProgress", "Submitted", "Approved"];

// Patch 20: the unified Routines overview's own status vocabulary — distinct
// from a single instance's workflow status (Unassigned/.../Approved) above.
// See RouteTemplates.js's getRoutinesOverview for exactly how each is
// computed (a template's own NextGenerateDate vs. today, or a standalone
// routine's DueDate vs. today / already Approved).
const DUE_STATUS_FILTERS = ["All", "Overdue", "Due Soon", "On Schedule", "Paused", "Completed"];
const DUE_STATUS_COLOR = { Overdue: "danger", "Due Soon": "warning", "On Schedule": "success", Paused: "textMuted", Completed: "success", Unknown: "textMuted" };

function DueStatusBadge({ T, status }) {
  const color = T[DUE_STATUS_COLOR[status]] || T.textSecondary;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: color + "22",
        borderRadius: 4,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function formatDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

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

// A routine instance's own due-passed check — distinct from its workflow
// status (Unassigned/Assigned/.../Approved), since a route can be
// "Assigned" and still be sitting past its due date. Submitted/Approved
// routines are done with, so they don't count as overdue even past their
// due date.
function isOverdue(r, now) {
  if (!r.dueDate || r.status === "Submitted" || r.status === "Approved") return false;
  const d = new Date(r.dueDate);
  return !isNaN(d) && d.getTime() < now;
}

// No login system exists in this app (see parsers.js's Routines section) —
// a Routine here is "assign a checklist of lubrication points to a
// contractor", tracked by free-text AssignedTo/CreatedBy fields, not real
// user accounts. Not synced with the main Full Sync — loaded on demand,
// same as Equipment Registry.
export default function Routines({
  webhookUrl,
  equipmentRegistry,
  samples,
  actions,
  oilChanges,
  pushToast,
  onDataChanged,
  initialRoutineId,
  onInitialRoutineConsumed,
}) {
  const { T, s } = useTheme();
  // Patch 20: "overview" (the new unified templates + standalone-routines
  // list) is now the landing view, replacing the old "list" (every
  // instance, flat). "templateDetail" drills into one recurring template's
  // own generated instances — see openOverviewItem below.
  const [view, setView] = useState("overview"); // "overview" | "templateDetail" | "detail" | "new"
  const [selectedRoutineId, setSelectedRoutineId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null); // the overview item being drilled into

  // Patch 15: the notification bell deep-links straight into a specific
  // routine's detail view (e.g. "you were assigned RT-123") instead of
  // leaving the user to find it in the list themselves — mirrors the
  // initialCode/oilReportCode pattern Equipment/OilReportSearch already
  // use for the same "arrived here from outside wanting one specific
  // record" case. Unaffected by the Patch 20 restructure.
  useEffect(() => {
    if (!initialRoutineId) return;
    setSelectedRoutineId(initialRoutineId);
    setView("detail");
    onInitialRoutineConsumed?.();
  }, [initialRoutineId, onInitialRoutineConsumed]);

  // ─── Overview (Patch 20 main view) ───────────────────────────────────
  const [overviewItems, setOverviewItems] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);
  const [areaFilter, setAreaFilter] = useState("All");
  const [dueStatusFilter, setDueStatusFilter] = useState("All");
  const [overviewSearch, setOverviewSearch] = useState("");

  const refreshOverview = useCallback(async () => {
    if (!webhookUrl) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const items = await api.getRoutinesOverview(webhookUrl);
      setOverviewItems(items);
    } catch (err) {
      setOverviewError(err.message);
    } finally {
      setOverviewLoading(false);
    }
  }, [webhookUrl]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const areaOptions = useMemo(
    () => ["All", ...Array.from(new Set(overviewItems.map((i) => i.area).filter(Boolean))).sort()],
    [overviewItems]
  );

  const overviewKpis = useMemo(
    () => ({
      total: overviewItems.length,
      onSchedule: overviewItems.filter((i) => i.dueStatus === "On Schedule").length,
      dueSoon: overviewItems.filter((i) => i.dueStatus === "Due Soon").length,
      overdue: overviewItems.filter((i) => i.dueStatus === "Overdue").length,
    }),
    [overviewItems]
  );

  const visibleOverviewItems = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    return overviewItems.filter((i) => {
      if (areaFilter !== "All" && i.area !== areaFilter) return false;
      if (dueStatusFilter !== "All" && i.dueStatus !== dueStatusFilter) return false;
      if (q && !(i.routeName || "").toLowerCase().includes(q) && !(i.id || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [overviewItems, areaFilter, dueStatusFilter, overviewSearch]);

  function openOverviewItem(item) {
    if (item.kind === "template") {
      setSelectedTemplate(item);
      setView("templateDetail");
    } else {
      setSelectedRoutineId(item.id);
      setView("detail");
    }
  }

  // ─── Template Detail (drill-down into one recurring template's own
  // generated instances) — reuses the exact instance-list rendering the
  // old flat "list" view used, just scoped to one template instead of
  // every routine in the system. ──────────────────────────────────────
  const [templateInstances, setTemplateInstances] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateWorking, setTemplateWorking] = useState(false);
  const [instanceStatusFilter, setInstanceStatusFilter] = useState("All");
  const [instanceOverdueOnly, setInstanceOverdueOnly] = useState(false);

  const refreshTemplateInstances = useCallback(async () => {
    if (!webhookUrl || !selectedTemplate) return;
    setTemplateLoading(true);
    try {
      const rows = await api.getRoutines(webhookUrl);
      setTemplateInstances(
        rows
          .filter((r) => r.sourceTemplateId === selectedTemplate.id)
          .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
      );
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setTemplateLoading(false);
    }
  }, [webhookUrl, selectedTemplate, pushToast]);

  useEffect(() => {
    if (view === "templateDetail") refreshTemplateInstances();
  }, [view, refreshTemplateInstances]);

  async function toggleTemplateStatus() {
    if (!selectedTemplate) return;
    setTemplateWorking(true);
    try {
      const next = selectedTemplate.templateStatus === "Active" ? "Paused" : "Active";
      await api.setRouteTemplateStatus(webhookUrl, selectedTemplate.id, next);
      setSelectedTemplate((t) => ({ ...t, templateStatus: next, dueStatus: next === "Paused" ? "Paused" : t.dueStatus }));
      pushToast(`Route ${next === "Paused" ? "paused" : "resumed"}.`, "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setTemplateWorking(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplate) return;
    if (!window.confirm(`Delete the recurring route "${selectedTemplate.routeName}"? This doesn't delete routines it already generated.`)) return;
    setTemplateWorking(true);
    try {
      await api.deleteRouteTemplate(webhookUrl, selectedTemplate.id);
      pushToast("Recurring route deleted.", "success");
      setView("overview");
      setSelectedTemplate(null);
      refreshOverview();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setTemplateWorking(false);
    }
  }

  const now = Date.now();
  const visibleTemplateInstances = templateInstances.filter((r) => {
    if (instanceStatusFilter !== "All" && r.status !== instanceStatusFilter) return false;
    if (instanceOverdueOnly && !isOverdue(r, now)) return false;
    return true;
  });

  function openRoutine(routineId) {
    setSelectedRoutineId(routineId);
    setView("detail");
  }

  function backToOverviewOrTemplate() {
    setSelectedRoutineId(null);
    if (selectedTemplate) {
      setView("templateDetail");
      refreshTemplateInstances();
    } else {
      setView("overview");
      refreshOverview();
    }
  }

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
        onDataChanged={onDataChanged}
        onBack={backToOverviewOrTemplate}
      />
    );
  }

  if (view === "new") {
    return (
      <NewRoutine
        webhookUrl={webhookUrl}
        equipmentRegistry={equipmentRegistry}
        samples={samples}
        actions={actions}
        oilChanges={oilChanges}
        pushToast={pushToast}
        onCreated={(routineId, templateId) => {
          setView("overview");
          refreshOverview();
          if (routineId) {
            setSelectedRoutineId(routineId);
            setView("detail");
          }
          void templateId; // overview already re-fetches both templates and standalone routines
        }}
        onCancel={() => setView(selectedTemplate ? "templateDetail" : "overview")}
      />
    );
  }

  if (view === "templateDetail" && selectedTemplate) {
    const overdueCount = templateInstances.filter((r) => isOverdue(r, now)).length;
    const unassignedCount = templateInstances.filter((r) => r.status === "Unassigned").length;
    return (
      <div>
        <button style={{ ...s.btn, marginBottom: 14 }} onClick={() => { setView("overview"); setSelectedTemplate(null); refreshOverview(); }}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Routines
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
          <div>
            <p style={{ ...s.sectionTitle, margin: 0 }}>{selectedTemplate.routeName}</p>
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "4px 0 0" }}>
              {selectedTemplate.routeType} · {selectedTemplate.contractor} · {selectedTemplate.frequency}
              {selectedTemplate.area ? ` · ${selectedTemplate.area}` : ""} · {selectedTemplate.equipmentCount} equipment
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <DueStatusBadge T={T} status={selectedTemplate.dueStatus} />
            <button style={s.btn} disabled={templateWorking} onClick={toggleTemplateStatus}>
              {selectedTemplate.templateStatus === "Active" ? "Pause" : "Resume"}
            </button>
            <button style={{ ...s.btn, color: T.danger, borderColor: T.danger }} disabled={templateWorking} onClick={deleteTemplate}>
              <i className="ti ti-trash" aria-hidden="true" /> Delete Route
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, margin: "16px 0 20px" }}>
          {[
            { label: "Instances Generated", value: templateInstances.length, color: "accent" },
            { label: "Unassigned", value: unassignedCount, color: "danger" },
            { label: "Overdue", value: overdueCount, color: "warning" },
            { label: "Next Due", value: formatDateShort(selectedTemplate.nextDueDate), color: "textPrimary", isText: true },
          ].map((m) => (
            <div key={m.label} style={s.metricCard}>
              <div style={{ fontSize: m.isText ? 14 : 20, fontWeight: 800, color: T[m.color] }}>{m.value}</div>
              <div style={{ fontSize: 10, color: T.textSecondary }}>{m.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              style={{
                ...s.btn,
                fontSize: 12,
                background: instanceStatusFilter === st ? T.accent : "transparent",
                color: instanceStatusFilter === st ? T.accentText : T.textSecondary,
                borderColor: instanceStatusFilter === st ? T.accent : T.border,
              }}
              onClick={() => setInstanceStatusFilter(st)}
            >
              {st}
            </button>
          ))}
          <div style={{ width: 1, background: T.border, margin: "0 4px" }} />
          <button
            style={{
              ...s.btn,
              fontSize: 12,
              background: instanceOverdueOnly ? T.danger : "transparent",
              color: instanceOverdueOnly ? "#fff" : T.textSecondary,
              borderColor: instanceOverdueOnly ? T.danger : T.border,
            }}
            onClick={() => setInstanceOverdueOnly((v) => !v)}
          >
            Overdue only
          </button>
        </div>

        {templateLoading ? (
          <p style={{ color: T.textSecondary }}>Loading instances…</p>
        ) : visibleTemplateInstances.length === 0 ? (
          <div style={s.card}>
            <p style={{ color: T.textSecondary, margin: 0 }}>
              {templateInstances.length === 0 ? "No instances generated yet." : "No instances match the filter."}
            </p>
          </div>
        ) : (
          <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Route Name</th>
                  <th style={s.th}>Assigned To</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Progress</th>
                  <th style={s.th}>Due</th>
                  <th style={s.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {visibleTemplateInstances.map((r) => {
                  const aging = agingLabel(r.createdDate, r.status);
                  const overdue = isOverdue(r, now);
                  return (
                    <tr
                      key={r.routineId}
                      style={{ cursor: "pointer", background: overdue ? T.danger + "0d" : "transparent" }}
                      onClick={() => openRoutine(r.routineId)}
                    >
                      <td style={s.td}>{r.routeName || "—"}</td>
                      <td style={s.td}>{r.assignedTo || <span style={{ color: T.danger, fontWeight: 700 }}>Unassigned</span>}</td>
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

  // ─── Default: Overview ────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Routines</p>
        <button style={s.btnPrimary} onClick={() => setView("new")}>
          <i className="ti ti-plus" aria-hidden="true" /> Create Route
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { key: "All", label: "Total Routines", value: overviewKpis.total, color: "accent" },
          { key: "On Schedule", label: "On Schedule", value: overviewKpis.onSchedule, color: "success" },
          { key: "Due Soon", label: "Due Soon (≤7 days)", value: overviewKpis.dueSoon, color: "warning" },
          { key: "Overdue", label: "Overdue", value: overviewKpis.overdue, color: "danger" },
        ].map((m) => (
          <div
            key={m.key}
            onClick={() => setDueStatusFilter((cur) => (cur === m.key ? "All" : m.key))}
            title={`${m.value} ${m.label} — click to filter the list below`}
            style={{ ...s.metricCard, cursor: "pointer", border: `1px solid ${dueStatusFilter === m.key ? T[m.color] : T.border}` }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: T[m.color] }}>{m.value}</div>
            <div style={{ fontSize: 10, color: T.textSecondary }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...s.select, width: 160 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          {areaOptions.map((a) => (
            <option key={a} value={a}>
              {a === "All" ? "All Areas" : a}
            </option>
          ))}
        </select>
        {DUE_STATUS_FILTERS.map((st) => (
          <button
            key={st}
            style={{
              ...s.btn,
              fontSize: 12,
              background: dueStatusFilter === st ? T.accent : "transparent",
              color: dueStatusFilter === st ? T.accentText : T.textSecondary,
              borderColor: dueStatusFilter === st ? T.accent : T.border,
            }}
            onClick={() => setDueStatusFilter(st)}
          >
            {st}
          </button>
        ))}
        <input
          style={{ ...s.input, flex: 1, minWidth: 180 }}
          type="search"
          placeholder="Search by route name or id…"
          value={overviewSearch}
          onChange={(e) => setOverviewSearch(e.target.value)}
        />
      </div>

      {overviewLoading ? (
        <p style={{ color: T.textSecondary }}>Loading routines…</p>
      ) : overviewError ? (
        <p style={{ color: T.danger }}>{overviewError}</p>
      ) : visibleOverviewItems.length === 0 ? (
        <div style={s.card}>
          <p style={{ color: T.textSecondary, margin: 0 }}>No routines match the filter.</p>
        </div>
      ) : (
        <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Routine Name</th>
                <th style={s.th}>Equipment Count</th>
                <th style={s.th}>Frequency</th>
                <th style={s.th}>Next Due Date</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Last Completed</th>
              </tr>
            </thead>
            <tbody>
              {visibleOverviewItems.map((item) => (
                <tr key={item.id} style={{ cursor: "pointer" }} onClick={() => openOverviewItem(item)}>
                  <td style={s.td}>
                    {item.kind === "template" && <i className="ti ti-repeat" style={{ marginRight: 6, color: T.textMuted }} aria-hidden="true" title="Recurring" />}
                    {item.routeName || item.id}
                  </td>
                  <td style={s.td}>{item.equipmentCount}</td>
                  <td style={s.td}>{item.frequency}</td>
                  <td style={s.td}>{formatDateShort(item.nextDueDate)}</td>
                  <td style={s.td}>
                    <DueStatusBadge T={T} status={item.dueStatus} />
                  </td>
                  <td style={s.td}>{formatDateShort(item.lastCompleted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

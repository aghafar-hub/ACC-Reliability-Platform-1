import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeContext";
import { useSession, useSessionContractor } from "../SessionContext";
import * as api from "../api";
import RoutineDetail from "./RoutineDetail";
import NewRoutine from "./NewRoutine";
import ProgressBar from "../components/ProgressBar";
import MobileFilterToggle from "../components/MobileFilterToggle";
import useIsMobile from "../hooks/useIsMobile";

const STATUS_FILTERS = ["All", "Unassigned", "Assigned", "InProgress", "Submitted", "Approved"];
const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];

// Route-type tab: "All Routines" keeps every route type in one unified
// list; the other three pull out just that type. Originally Oil Change
// had no tab of its own (it was meant to just be read off "All Routines",
// per an earlier design pass) — added back directly at the user's
// request since in practice people still wanted to filter down to just
// Oil Change routes the same way they can for Sampling/Emergency Top Up.
const ROUTE_TYPE_TABS = [
  { key: "All", label: "All Routines", icon: "ti-list" },
  { key: "Oil Change", label: "Oil Change", icon: "ti-droplet" },
  { key: "Sampling", label: "Oil Sampling", icon: "ti-flask" },
  { key: "Emergency Top Up", label: "Emergency Top Up", icon: "ti-alert-triangle" },
];

// Icon + circular badge color per KPI card, matching the reference mockup.
const KPI_ICONS = { All: "ti-calendar", "On Schedule": "ti-circle-check", "Due Soon": "ti-clock", Overdue: "ti-alert-triangle" };

// dataviz skill's validated 8-slot categorical palette (references/palette.md)
// — light- and dark-surface steps of the same 8 hues, picked by a crude
// luminance check on the active theme's own card surface (see
// pickCategoricalPalette below) since this app has 10 themes spanning both
// light and dark, not just one. Colors are assigned to AREA NAMES in a
// fixed alphabetical order (areaColorMap), never by count-rank, so a
// filtered-down chart never repaints an area that was already shown a
// different color.
const CATEGORICAL_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const CATEGORICAL_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

function pickCategoricalPalette(T) {
  const hex = (T.cardBg || "#0D1E35").replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? CATEGORICAL_LIGHT : CATEGORICAL_DARK;
}

function ChartTooltip({ T, active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      {label && <div style={{ color: T.textSecondary, marginBottom: 2 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ color: T.textPrimary, fontWeight: 700 }}>
          <span style={{ color: p.color || p.payload?.fill }}>●</span> {p.name}: {p.value}
          {typeof p.value === "number" && p.unit ? p.unit : ""}
        </div>
      ))}
    </div>
  );
}

// Patch 20: the unified Routines overview's own status vocabulary — distinct
// from a single instance's workflow status (Unassigned/.../Approved) above.
// See RouteTemplates.js's getRoutinesOverview for exactly how each is
// computed (a template's own NextGenerateDate vs. today, or a standalone
// routine's DueDate vs. today / already Approved).
const DUE_STATUS_FILTERS = ["All", "Overdue", "Due Soon", "On Schedule", "Paused", "Completed"];
const DUE_STATUS_COLOR = { Overdue: "danger", "Due Soon": "warning", "On Schedule": "success", Paused: "textMuted", Completed: "success", Unknown: "textMuted" };

// Same 3 icons NewRoutine.jsx's own ROUTE_TYPES uses, so a route's type
// reads the same icon whether you're creating it or looking at the list.
const ROUTE_TYPE_ICON = { "Oil Change": "ti-droplet", "Sampling": "ti-flask", "Emergency Top Up": "ti-alert-triangle" };

function RouteTypeBadge({ T, routeType }) {
  if (!routeType) return <span style={{ color: T.textMuted }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
      <i className={`ti ${ROUTE_TYPE_ICON[routeType] || "ti-droplet"}`} aria-hidden="true" />
      {routeType}
    </span>
  );
}

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

// Completion % only exists on standalone one-time routines (see
// RouteTemplates.js's getRoutinesOverview — a recurring template's own
// "equipment" are a spec, not a checklist with done/not-done items), so a
// template row always gets null here and shows no tint/column value.
// Same red->amber->green bucketing as a dueStatus badge, not a continuous
// gradient — easier to scan a column of them at a glance.
function completionColor(pct, T) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 100) return T.success;
  if (pct >= 50) return T.accent;
  if (pct > 0) return T.warning;
  return T.danger;
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
  const isMobile = useIsMobile();
  // Bug-hunt: "Create Route" was shown to every logged-in account with no
  // role check at all, but the backend's createRoutine action requires
  // "Create" permission (Code.js's requirePermission_) and Rbac.js's
  // ROLE_GRANTS only gives that to ROLE-CENG/ROLE-RENG/ROLE-MGR/ROLE-ADMIN
  // — a ROLE-TECH account (View+Edit only) could fill the whole form out
  // correctly and it would still always fail. Because createRoutine is a
  // blind no-cors POST (see api.js's own comment on why), the client can
  // never read that rejection back directly — it only ever showed up as
  // the generic, misleading "wasn't confirmed saved" error from the
  // follow-up verify-read finding nothing. Hiding the entry point for a
  // Technician avoids that dead end entirely, mirroring the same
  // session.claims.roles check EditActionModal.jsx/Settings.jsx already
  // use for their own role-gated UI.
  const session = useSession();
  const canCreateRoutines = useMemo(() => {
    const roles = session?.claims?.roles;
    if (!session) return true; // no session to check against — standalone build
    return (roles || []).some((r) => r === "ROLE-ADMIN" || r === "ROLE-CENG" || r === "ROLE-RENG" || r === "ROLE-MGR");
  }, [session]);
  // Hard-delete (as opposed to Cancel, which keeps the record) is Admin-
  // only — see backend/oil-lubrication/src/Routines.js's deleteRoutine
  // comment. Same "don't even show an entry point that would always fail
  // server-side" reasoning as canCreateRoutines above.
  const isAdmin = useMemo(() => {
    const roles = session?.claims?.roles;
    if (!session) return true; // no session to check against — standalone build
    return (roles || []).some((r) => r === "ROLE-ADMIN");
  }, [session]);
  // Routines had no Contractor filter at all — same pattern as Oil
  // Inventory/Dashboard: locked to the account's own contractor for a
  // scoped RHI/ASEC session (its data is already scoped server-side, see
  // getRoutinesOverview/getRoutines' own scope filter in the backend — a
  // dropdown there would be a no-op), a real "All Contractors"/RHI/ASEC
  // picker for an ACC/unscoped account.
  const scopedContractor = useSessionContractor();
  const [contractorFilter, setContractorFilter] = useState(scopedContractor || "All");
  // Collapsed by default on mobile only (the Area dropdown + 6 due-status
  // pills + search box were stacking several rows above the actual list on
  // a phone — the Patch 35 mobile audit's own finding); always open on
  // desktop, where there was never a problem to begin with.
  const [filtersOpen, setFiltersOpen] = useState(!isMobile);
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
  const [routeTypeTab, setRouteTypeTab] = useState("All");
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

  // Item counts per route-type tab, for the tab row's own badge counts —
  // always computed off the FULL overviewItems, never the already-filtered
  // set, so switching tabs doesn't change what the other tabs' own counts read.
  const routeTypeCounts = useMemo(() => {
    const counts = { All: overviewItems.length, "Oil Change": 0, Sampling: 0, "Emergency Top Up": 0 };
    overviewItems.forEach((i) => {
      if (i.routeType === "Oil Change") counts["Oil Change"]++;
      else if (i.routeType === "Sampling") counts.Sampling++;
      else if (i.routeType === "Emergency Top Up") counts["Emergency Top Up"]++;
    });
    return counts;
  }, [overviewItems]);

  // Items for the active route-type tab — KPIs, the Area dropdown's
  // options, the table, and all 3 charts below scope to this, not to
  // overviewItems directly, so switching tabs shows that route type's own
  // totals (matching the reference mockup's per-tab KPI behavior).
  const routeTypeItems = useMemo(() => {
    let items = routeTypeTab === "All" ? overviewItems : overviewItems.filter((i) => i.routeType === routeTypeTab);
    if (contractorFilter !== "All") items = items.filter((i) => i.contractor === contractorFilter);
    return items;
  }, [overviewItems, routeTypeTab, contractorFilter]);

  const areaOptions = useMemo(
    () => ["All", ...Array.from(new Set(routeTypeItems.map((i) => i.area).filter(Boolean))).sort()],
    [routeTypeItems]
  );

  const overviewKpis = useMemo(
    () => ({
      total: routeTypeItems.length,
      onSchedule: routeTypeItems.filter((i) => i.dueStatus === "On Schedule").length,
      dueSoon: routeTypeItems.filter((i) => i.dueStatus === "Due Soon").length,
      overdue: routeTypeItems.filter((i) => i.dueStatus === "Overdue").length,
    }),
    [routeTypeItems]
  );

  const visibleOverviewItems = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    return routeTypeItems.filter((i) => {
      if (areaFilter !== "All" && i.area !== areaFilter) return false;
      if (dueStatusFilter !== "All" && i.dueStatus !== dueStatusFilter) return false;
      if (q && !(i.routeName || "").toLowerCase().includes(q) && !(i.id || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [routeTypeItems, areaFilter, dueStatusFilter, overviewSearch]);

  // "Upcoming Routines (Next 3 Months)" — each of the next 3 calendar
  // months (including the current one), items bucketed by the month their
  // nextDueDate falls in and stacked by dueStatus. Completed/Paused items
  // are excluded — this chart is about near-term workload, not history.
  const upcomingChartData = useMemo(() => {
    const today = new Date();
    const buckets = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), Overdue: 0, "Due Soon": 0, "On Schedule": 0 });
    }
    const idxByKey = {};
    buckets.forEach((b, i) => { idxByKey[b.key] = i; });
    routeTypeItems.forEach((item) => {
      if (item.dueStatus !== "Overdue" && item.dueStatus !== "Due Soon" && item.dueStatus !== "On Schedule") return;
      if (!item.nextDueDate) return;
      const d = new Date(item.nextDueDate);
      if (isNaN(d.getTime())) return;
      const idx = idxByKey[`${d.getFullYear()}-${d.getMonth()}`];
      if (idx === undefined) return;
      buckets[idx][item.dueStatus]++;
    });
    return buckets;
  }, [routeTypeItems]);

  // "Routines by Area" — a blank area (every standalone one-time routine,
  // which carries no area of its own) folds into a fixed "Unassigned"
  // bucket rather than getting its own palette slot, same as the dataviz
  // skill's "fold into Other" guidance for a category beyond the palette.
  const areaColorMap = useMemo(() => {
    const palette = pickCategoricalPalette(T);
    const areas = Array.from(new Set(overviewItems.map((i) => i.area).filter(Boolean))).sort();
    const map = {};
    areas.forEach((a, i) => { map[a] = palette[i % palette.length]; });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- T is read for its current cardBg only; re-keying on every theme object identity change is fine but we intentionally don't depend on routeTypeItems so colors stay stable across tab/filter changes
  }, [overviewItems, T.cardBg]);

  const areaChartData = useMemo(() => {
    const counts = {};
    routeTypeItems.forEach((item) => {
      const key = item.area || "Unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([area, count]) => ({ area, count, color: area === "Unassigned" ? T.textMuted : areaColorMap[area] || T.textMuted }))
      .sort((a, b) => b.count - a.count);
  }, [routeTypeItems, areaColorMap, T.textMuted]);

  // "Next 7 Days Due" — routine/template level (not per-equipment like the
  // reference mockup's LP-level cards): getRoutinesOverview's items are
  // already aggregated per routine/template, and breaking that back down to
  // individual lubrication points would need a separate per-item fetch for
  // every due-soon routine. Flagged to the user as a simplification, not
  // decided silently.
  const next7DaysItems = useMemo(() => {
    return routeTypeItems
      .filter((i) => i.dueStatus === "Overdue" || i.dueStatus === "Due Soon")
      .filter((i) => i.nextDueDate)
      .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
      .slice(0, 6);
  }, [routeTypeItems]);

  // Completion Rate Trend (Patch 20d) — fetched once on mount, independent
  // of the route-type tab/filters above (the backend aggregation isn't
  // scoped by route type, matching "Completion Rate Trend" being a
  // whole-program metric in the reference mockup).
  const [completionTrend, setCompletionTrend] = useState(null);
  const [completionTrendLoading, setCompletionTrendLoading] = useState(true);

  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    setCompletionTrendLoading(true);
    api
      .getRoutineCompletionTrend(webhookUrl, 6)
      .then((res) => { if (!cancelled) setCompletionTrend(res); })
      .catch(() => { if (!cancelled) setCompletionTrend(null); })
      .finally(() => { if (!cancelled) setCompletionTrendLoading(false); });
    return () => { cancelled = true; };
  }, [webhookUrl]);

  const completionChartData = useMemo(() => {
    if (!completionTrend) return [];
    return completionTrend.months.map((m, i) => {
      const [y, mo] = m.split("-").map(Number);
      return {
        month: new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        rate: completionTrend.rateByMonth[i],
      };
    });
  }, [completionTrend]);

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
        canEdit={canCreateRoutines}
        isAdmin={isAdmin}
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
          <>
            {/* Desktop: the full 6-column table. Mobile (<=860px, see
                App.jsx's own .dash-table-desktop/.dash-table-mobile toggle):
                a stacked card list instead — a 6-column table only scrolled
                horizontally with no visible affordance, leaving the Status/
                Progress/Due/Created columns cut off the right edge of a
                phone screen (the Patch 35 mobile audit's own finding). */}
            <div className="dash-table-desktop" style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "auto", maxHeight: 520 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Route Name</th>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Assigned To</th>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Status</th>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Progress</th>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Due</th>
                    <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Created</th>
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

            <div className="dash-table-mobile" style={{ flexDirection: "column", gap: 10 }}>
              {visibleTemplateInstances.map((r) => {
                const aging = agingLabel(r.createdDate, r.status);
                const overdue = isOverdue(r, now);
                return (
                  <div
                    key={r.routineId}
                    style={{ ...s.card, cursor: "pointer", background: overdue ? T.danger + "0d" : T.cardBg }}
                    onClick={() => openRoutine(r.routineId)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.routeName || "—"}</span>
                      <span style={s.badge(r.status)}>{r.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                      {r.assignedTo || <span style={{ color: T.danger, fontWeight: 700 }}>Unassigned</span>}
                    </div>
                    <div style={{ margin: "8px 0" }}>
                      <ProgressBar done={r.itemsDone} total={r.itemsTotal} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted }}>
                      <span>Due {r.dueDate || "—"}</span>
                      <span>
                        Created {r.createdDate || "—"}
                        {aging ? ` · ${aging}` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Default: Overview ────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Routines</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!scopedContractor && (
            <select style={{ ...s.select, width: 170, fontSize: 12 }} value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)}>
              <option value="All">All Contractors</option>
              {CONTRACTOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {canCreateRoutines && (
            <button style={s.btnPrimary} onClick={() => setView("new")}>
              <i className="ti ti-plus" aria-hidden="true" /> Create Route
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {ROUTE_TYPE_TABS.map((t) => (
          <button
            key={t.key}
            style={{
              ...s.btn,
              background: routeTypeTab === t.key ? T.accent : "transparent",
              color: routeTypeTab === t.key ? T.accentText : T.textSecondary,
              borderColor: routeTypeTab === t.key ? T.accent : T.border,
            }}
            onClick={() => setRouteTypeTab(t.key)}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label} ({routeTypeCounts[t.key] ?? 0})
          </button>
        ))}
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
            style={{ ...s.metricCard, cursor: "pointer", border: `1px solid ${dueStatusFilter === m.key ? T[m.color] : T.border}`, display: "flex", alignItems: "center", gap: 12 }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: T[m.color] + "22",
                color: T[m.color],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              <i className={`ti ${KPI_ICONS[m.key]}`} aria-hidden="true" />
            </span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T[m.color] }}>{m.value}</div>
              <div style={{ fontSize: 10, color: T.textSecondary }}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {isMobile && (
        <MobileFilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((o) => !o)}
          activeCount={(areaFilter !== "All" ? 1 : 0) + (dueStatusFilter !== "All" ? 1 : 0) + (overviewSearch.trim() ? 1 : 0)}
        />
      )}
      {filtersOpen && (
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
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "3 1 480px", minWidth: 0 }}>
          {overviewLoading ? (
            <p style={{ color: T.textSecondary }}>Loading routines…</p>
          ) : overviewError ? (
            <p style={{ color: T.danger }}>{overviewError}</p>
          ) : visibleOverviewItems.length === 0 ? (
            <div style={s.card}>
              <p style={{ color: T.textSecondary, margin: 0 }}>No routines match the filter.</p>
            </div>
          ) : (
            <>
              {/* Desktop: full 6-column table. Mobile (<=860px): a stacked
                  card list — see the templateDetail table above for why.
                  Fixed height with its own internal scroll (confirmed
                  directly by the user) instead of growing the whole page
                  taller as more routines pile up — sticky header so the
                  column labels stay put while scrolling. */}
              <div className="dash-table-desktop" style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "auto", maxHeight: 520 }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Routine Name</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Type</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Equipment Count</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Frequency</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Next Due Date</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Status</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Completion</th>
                      <th style={{ ...s.th, position: "sticky", top: 0, background: T.cardBg, zIndex: 1 }}>Last Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOverviewItems.map((item) => {
                      const compColor = completionColor(item.completionPct, T);
                      return (
                        <tr
                          key={item.id}
                          style={{ cursor: "pointer", background: compColor ? compColor + "14" : undefined }}
                          onClick={() => openOverviewItem(item)}
                        >
                          <td style={s.td}>
                            {item.kind === "template" && <i className="ti ti-repeat" style={{ marginRight: 6, color: T.textMuted }} aria-hidden="true" title="Recurring" />}
                            {item.routeName || item.id}
                          </td>
                          <td style={s.td}>
                            <RouteTypeBadge T={T} routeType={item.routeType} />
                          </td>
                          <td style={s.td}>{item.equipmentCount}</td>
                          <td style={s.td}>{item.frequency}</td>
                          <td style={s.td}>{formatDateShort(item.nextDueDate)}</td>
                          <td style={s.td}>
                            <DueStatusBadge T={T} status={item.dueStatus} />
                          </td>
                          <td style={s.td}>
                            {item.completionPct === null || item.completionPct === undefined ? (
                              <span style={{ color: T.textMuted }}>—</span>
                            ) : (
                              <ProgressBar done={item.itemsDone} total={item.equipmentCount} width={70} />
                            )}
                          </td>
                          <td style={s.td}>{formatDateShort(item.lastCompleted)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="dash-table-mobile" style={{ flexDirection: "column", gap: 10 }}>
                {visibleOverviewItems.map((item) => {
                  const compColor = completionColor(item.completionPct, T);
                  return (
                  <div
                    key={item.id}
                    style={{ ...s.card, cursor: "pointer", background: compColor ? compColor + "14" : s.card.background }}
                    onClick={() => openOverviewItem(item)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {item.kind === "template" && <i className="ti ti-repeat" style={{ marginRight: 6, color: T.textMuted }} aria-hidden="true" title="Recurring" />}
                        {item.routeName || item.id}
                      </span>
                      <DueStatusBadge T={T} status={item.dueStatus} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                      <RouteTypeBadge T={T} routeType={item.routeType} /> · {item.equipmentCount} equipment{item.frequency ? ` · ${item.frequency}` : ""}
                    </div>
                    {item.completionPct !== null && item.completionPct !== undefined && (
                      <div style={{ marginTop: 6 }}>
                        <ProgressBar done={item.itemsDone} total={item.equipmentCount} width={120} />
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMuted, marginTop: 8 }}>
                      <span>Due {formatDateShort(item.nextDueDate)}</span>
                      <span>Last done {formatDateShort(item.lastCompleted)}</span>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div style={s.card}>
            <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Next 7 Days Due</p>
            {next7DaysItems.length === 0 ? (
              <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Nothing overdue or due soon.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {next7DaysItems.map((item) => (
                  <div
                    key={item.id}
                    style={{ cursor: "pointer", paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}
                    onClick={() => openOverviewItem(item)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{item.routeName || item.id}</span>
                      <DueStatusBadge T={T} status={item.dueStatus} />
                    </div>
                    <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>
                      {formatDateShort(item.nextDueDate)}
                      {item.area ? ` · ${item.area}` : ""} · {item.equipmentCount} equipment
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginTop: 20 }}>
        <div style={s.card}>
          <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Upcoming Routines (Next 3 Months)</p>
          {upcomingChartData.every((b) => !b.Overdue && !b["Due Soon"] && !b["On Schedule"]) ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Nothing due in the next 3 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={upcomingChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Overdue" stackId="s" fill={T.danger} />
                <Bar dataKey="Due Soon" stackId="s" fill={T.warning} />
                <Bar dataKey="On Schedule" stackId="s" fill={T.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card}>
          <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Routines by Area</p>
          {areaChartData.length === 0 ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No routines to chart.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={areaChartData} dataKey="count" nameKey="area" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {areaChartData.map((d) => (
                      <Cell key={d.area} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip T={T} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
                {areaChartData.map((d) => (
                  <div key={d.area} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ color: T.textPrimary }}>{d.area}</span>
                    <span style={{ color: T.textSecondary }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Completion Rate Trend (Last 6 Months)</p>
            <span style={{ fontSize: 10.5, color: T.danger, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${T.danger}` }} /> Target 90%
            </span>
          </div>
          {completionTrendLoading ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
          ) : completionChartData.every((d) => d.rate == null) ? (
            <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No completed routines in this window yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={completionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={32} unit="%" />
                <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
                <ReferenceLine y={90} stroke={T.danger} strokeDasharray="4 4" />
                <Bar dataKey="rate" name="Completion Rate" fill={T.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p style={{ fontSize: 10.5, color: T.textMuted, margin: "8px 0 0" }}>
            Item-weighted: LP items completed on time ÷ total LP items, across routines due that month.
          </p>
        </div>
      </div>
    </div>
  );
}

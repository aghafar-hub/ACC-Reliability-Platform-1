import { useCallback, useEffect, useMemo, useState } from "react";
import { useFreshTick } from "../dataCache";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeContext";
import { useSession, useSessionContractor } from "../SessionContext";
import * as api from "../api";
import { ROUTE_STATUS, isRouteOverdue, isRouteReturned } from "../parsers";
import RoutineDetail from "./RoutineDetail";
import NewRoutine from "./NewRoutine";
import ProgressBar from "../components/ProgressBar";
import BottomSheet, { SheetButton, SheetGroup } from "../components/BottomSheet";
import { ChipRow, CountChip, FiltersPill } from "../components/PhoneParts";
import useIsMobile from "../hooks/useIsMobile";
import { CalendarHeat, TargetBar } from "../components/DashCharts";
import { routesOnTime } from "../dashboardLogic";
import ContractorChips from "../components/ContractorChips";
import { areaText, useAreaNames } from "../officialAreas";

const STATUS_FILTERS = ["All", ROUTE_STATUS.DRAFT, ROUTE_STATUS.ASSIGNED, ROUTE_STATUS.IN_PROGRESS, ROUTE_STATUS.WAITING, ROUTE_STATUS.CONFIRMED];
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
const DUE_STATUS_FILTERS = ["All", "Overdue", "Due Soon", "On Schedule", "Waiting Approval", "Paused", "Completed"];
const DUE_STATUS_COLOR = { Overdue: "danger", "Due Soon": "warning", "On Schedule": "success", "Waiting Approval": "accent", Paused: "textMuted", Completed: "success", Unknown: "textMuted" };

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

function DueStatusBadge({ T, status, returned }) {
  const color = T[DUE_STATUS_COLOR[status]] || T.textSecondary;
  const badge = (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
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
  if (!returned) return badge;
  // Phase 1: sent back to the technician for correction.
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {badge}
      <span style={{ fontSize: 12, fontWeight: 700, color: T.danger, background: T.danger + "22", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
        Returned
      </span>
    </span>
  );
}

// Completion % only exists on standalone one-time routines (see
// RouteTemplates.js's getRoutinesOverview — a recurring template's own
// "equipment" are a spec, not a checklist with done/not-done items), so a
// template row always gets null here and shows no indicator. 0% is left
// neutral (textMuted) rather than danger — a brand-new routine that
// hasn't started yet isn't "bad," just not started; urgency is already
// the Status column's own job (Overdue/Due Soon badge). First cut of this
// painted the ENTIRE row background by this color, which on real data —
// where most routines sit at 0% until worked — turned nearly the whole
// table pink/red and visually swallowed the card's own white background
// (confirmed directly by the user via screenshot). Now just a left-edge
// stripe, same "colored indicator without painting the row" pattern as
// DueStatusBadge already uses for the Status column.
function completionColor(pct, T) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 100) return T.success;
  if (pct >= 50) return T.accent;
  if (pct > 0) return T.warning;
  return T.textMuted;
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
  if (!createdDate || status === ROUTE_STATUS.WAITING || status === ROUTE_STATUS.CONFIRMED || status === ROUTE_STATUS.CANCELLED) return null;
  const created = new Date(createdDate);
  if (isNaN(created)) return null;
  const days = Math.floor((Date.now() - created.getTime()) / 86400000);
  if (days <= 0) return "Created today";
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// Phase 1: Overdue once not submitted by due date + duration + 1 week
// (see parsers.js's isRouteOverdue). Waiting Approval / Confirmed never are.
function isOverdue(r, now) {
  return isRouteOverdue(r, new Date(now));
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
  initialNewRoute,
  onInitialNewRouteConsumed,
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
    return (roles || []).some((r) => r === "ROLE-ADMIN" || r === "ROLE-CENG" || r === "ROLE-CMGR" || r === "ROLE-RENG" || r === "ROLE-MGR");
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
  const [sheetOpen, setSheetOpen] = useState(false);
  // Patch 20: "overview" (the new unified templates + standalone-routines
  // list) is now the landing view, replacing the old "list" (every
  // instance, flat). "templateDetail" drills into one recurring template's
  // own generated instances — see openOverviewItem below.
  const [view, setView] = useState("overview"); // "overview" | "templateDetail" | "detail" | "new" | "suggestions"
  // Phase 3: saved Suggestions (sub-tab) and the one picked to start a route from.
  const [suggestions, setSuggestions] = useState(null);
  const [fromSuggestion, setFromSuggestion] = useState(null);
  // The page Create Route was opened from — it stays behind the popup and
  // is where Cancel goes back to.
  const [newFrom, setNewFrom] = useState("overview");
  // Suggestions page: the ones ticked to go into one route, and its filter.
  const [pickedSg, setPickedSg] = useState([]);
  const [sgType, setSgType] = useState("All");
  const refreshSuggestions = useCallback(async () => {
    try {
      setSuggestions(await api.getSuggestions(webhookUrl));
    } catch {
      setSuggestions((prev) => prev || []);
    }
  }, [webhookUrl]);
  const freshTick = useFreshTick(["getSuggestions", "getRoutinesOverview", "getRoutines", "getDashboardSettings"]); // dataCache.js: load again when the server's answer differs
  useEffect(() => {
    refreshSuggestions();
  }, [refreshSuggestions, freshTick]);
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

  // Oil Equipment → "Create Route": New Route with that point already picked
  // (same path as creating a route from a saved suggestion).
  useEffect(() => {
    if (!initialNewRoute) return;
    setFromSuggestion(initialNewRoute);
    setNewFrom("overview");
    setView("new");
    onInitialNewRouteConsumed?.();
  }, [initialNewRoute, onInitialNewRouteConsumed]);

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
  }, [refreshOverview, freshTick]);

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
  // a route's area as the platform's official name (Settings → Equipment & IDs → Areas)
  const resolveArea = useAreaNames();
  const routeTypeItems = useMemo(() => {
    let items = routeTypeTab === "All" ? overviewItems : overviewItems.filter((i) => i.routeType === routeTypeTab);
    if (contractorFilter !== "All") items = items.filter((i) => i.contractor === contractorFilter);
    return items.map((i) => (i.area ? { ...i, area: areaText(resolveArea(i.area)) || i.area } : i));
  }, [overviewItems, routeTypeTab, contractorFilter, resolveArea]);

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



  // "Busy days ahead" (D5) — lubrication points due per day for the next
  // five weeks, from each route's next due date; overdue ones are counted
  // separately (they belong to the past, not the calendar).
  const busyDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map();
    let overdue = 0;
    routeTypeItems.forEach((item) => {
      if (!item.nextDueDate || item.dueStatus === "Paused") return;
      const d = new Date(item.nextDueDate);
      if (isNaN(d.getTime())) return;
      if (d < today) {
        overdue++;
        return;
      }
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(k) || { count: 0, routes: [] };
      cur.count += Number(item.equipmentCount) || 0;
      cur.routes.push(item.routeName || item.id);
      map.set(k, cur);
    });
    map.forEach((v) => {
      v.detail = `${v.routes.length} route${v.routes.length === 1 ? "" : "s"}, ${v.count} point${v.count === 1 ? "" : "s"} — ${v.routes.slice(0, 3).join(", ")}${v.routes.length > 3 ? "…" : ""}`;
    });
    return { map, overdue };
  }, [routeTypeItems]);

  // "Next N Days Due" — routine/template level (getRoutinesOverview's items
  // are already one per routine/template). Overdue first, then everything
  // whose next due date falls inside the chosen window (7 / 15 days,
  // 1 / 3 months).
  const [dueWindow, setDueWindow] = useState(7);
  const nextDueItems = useMemo(() => {
    const until = Date.now() + dueWindow * 86400000;
    return routeTypeItems
      .filter((i) => i.nextDueDate)
      .filter((i) => i.dueStatus === "Overdue" || new Date(i.nextDueDate).getTime() <= until)
      .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
  }, [routeTypeItems, dueWindow]);

  // Completion Rate Trend (Patch 20d) — fetched once on mount, independent
  // of the route-type tab/filters above (the backend aggregation isn't
  // scoped by route type, matching "Completion Rate Trend" being a
  // whole-program metric in the reference mockup).
  // D5 — the shared on-time target (Oil Settings → Dashboard) and each
  // contractor's routes done on time over the last 3 months.
  const [onTimeTarget, setOnTimeTarget] = useState(api.DEFAULT_ON_TIME_TARGET);
  const [onTimeByContractor, setOnTimeByContractor] = useState(null);
  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    api.getDashboardSettings(webhookUrl).then((st) => { if (!cancelled) setOnTimeTarget(st.onTimeTarget); });
    api.getRoutines(webhookUrl).then((rows) => { if (!cancelled) setOnTimeByContractor(routesOnTime(rows, 90)); }).catch(() => { if (!cancelled) setOnTimeByContractor(null); });
    return () => { cancelled = true; };
  }, [webhookUrl, freshTick]);
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

  // Create Route opens over whichever page it was started from.
  const newRouteModal =
    view === "new" ? (
      <NewRoutine
        initialSuggestion={fromSuggestion}
        webhookUrl={webhookUrl}
        equipmentRegistry={equipmentRegistry}
        samples={samples}
        actions={actions}
        oilChanges={oilChanges}
        pushToast={pushToast}
        onCreated={(routineId, templateId) => {
          setPickedSg([]);
          setView("overview");
          setFromSuggestion(null);
          refreshOverview();
          refreshSuggestions();
          if (routineId) {
            setSelectedRoutineId(routineId);
            setView("detail");
          }
          void templateId; // overview already re-fetches both templates and standalone routines
        }}
        onCancel={() => setView(newFrom === "templateDetail" && !selectedTemplate ? "overview" : newFrom)}
      />
    ) : null;
  const baseView = view === "new" ? newFrom : view;

  if (baseView === "suggestions") {
    const regByCode = {};
    (equipmentRegistry || []).forEach((r) => (regByCode[r.code] = r));
    const all = (suggestions || []).filter((sg) => contractorFilter === "All" || sg.contractor === contractorFilter);
    const types = Array.from(new Set(all.map((sg) => sg.routeType || sg.workType).filter(Boolean)));
    const list = all.filter((sg) => sgType === "All" || (sg.routeType || sg.workType) === sgType);
    const picked = all.filter((sg) => pickedSg.includes(sg.suggestionId));
    const first = picked[0];
    // One route = one route type and one contractor: once something is
    // ticked, suggestions that can't join it are greyed out.
    const fits = (sg) => !first || ((sg.routeType || "") === (first.routeType || "") && (sg.contractor || "") === (first.contractor || ""));
    const today = new Date(new Date().toDateString()).getTime();
    const late = (sg) => sg.requiredDate && new Date(sg.requiredDate).getTime() < today;
    const togglePick = (sg) => setPickedSg((p) => (p.includes(sg.suggestionId) ? p.filter((x) => x !== sg.suggestionId) : [...p, sg.suggestionId]));
    const createFrom = (items) => {
      setFromSuggestion(items.length === 1 ? items[0] : { ...items[0], items });
      setNewFrom("suggestions");
      setView("new");
    };
    const TYPE_ICON = { "Oil Change": "ti-droplet", Sampling: "ti-flask", "Emergency Top Up": "ti-alert-triangle" };
    return (
      <div data-testid="suggestions-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button style={s.btn} onClick={() => { setPickedSg([]); setView("overview"); }}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Routines
          </button>
          <button style={s.btn} onClick={refreshSuggestions}>
            <i className="ti ti-refresh" aria-hidden="true" /> Refresh
          </button>
        </div>
        <div style={{ ...s.card, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", padding: "16px 20px" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: T.accent + "1A", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            <i className="ti ti-bulb" aria-hidden="true" />
          </span>
          <div style={{ flex: "1 1 320px" }}>
            <p style={{ ...s.sectionTitle, margin: 0 }}>Suggestions</p>
            <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "2px 0 0" }}>
              Made from submitted actions whose Agreed Action asks for an oil change, a top-up or a sample. Tick the ones to do together and create one route —
              they're then marked as converted and linked to it.
            </p>
          </div>
          {[
            { label: "Open", value: all.length, color: T.accent },
            { label: "Past required date", value: all.filter(late).length, color: T.danger },
          ].map((k) => (
            <div key={k.label} style={{ textAlign: "center", minWidth: 90 }} data-testid={`sg-kpi-${k.label}`}>
              <div style={{ fontSize: 24, fontWeight: 800, color: k.value ? k.color : T.textPrimary }}>{k.value}</div>
              <div style={{ fontSize: 12, color: T.textSecondary }}>{k.label}</div>
            </div>
          ))}
        </div>

        {suggestions === null ? (
          <p style={{ color: T.textSecondary }}>Loading…</p>
        ) : all.length === 0 ? (
          <div style={{ ...s.card, textAlign: "center", color: T.textSecondary, padding: 30 }}>
            <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 28, color: T.success }} />
            <p style={{ margin: "6px 0 0" }}>No open suggestions.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "4px 0 12px" }}>
              {["All", ...types].map((t) => {
                const n = t === "All" ? all.length : all.filter((sg) => (sg.routeType || sg.workType) === t).length;
                const on = sgType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSgType(t)}
                    style={{ ...s.btn, padding: "6px 12px", fontSize: 12.5, borderRadius: 999, borderColor: on ? T.accent : T.border, color: on ? T.accent : T.textSecondary, fontWeight: on ? 700 : 500 }}
                  >
                    {t !== "All" && <i className={`ti ${TYPE_ICON[t] || "ti-route"}`} aria-hidden="true" />} {t === "All" ? "All" : t} <span style={{ fontWeight: 500 }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12, paddingBottom: picked.length ? 80 : 0 }}>
              {list.map((sg) => {
                const on = pickedSg.includes(sg.suggestionId);
                const ok = on || fits(sg);
                const reg = regByCode[sg.lpId];
                return (
                  <div
                    key={sg.suggestionId}
                    data-testid={`sg-card-${sg.suggestionId}`}
                    style={{
                      ...s.card,
                      marginBottom: 0,
                      padding: "12px 14px",
                      border: `1.5px solid ${on ? T.accent : T.border}`,
                      background: on ? T.accent + "0D" : T.cardBg,
                      opacity: ok ? 1 : 0.5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: canCreateRoutines && ok ? "pointer" : "default" }}>
                      {canCreateRoutines && (
                        <input type="checkbox" checked={on} disabled={!ok} onChange={() => togglePick(sg)} aria-label={`Pick ${sg.lpId}`} style={{ marginTop: 3 }} />
                      )}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent, fontSize: 13 }}>{sg.lpId}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: T.accent + "14", color: T.accent, whiteSpace: "nowrap" }}>
                            <i className={`ti ${TYPE_ICON[sg.routeType] || "ti-route"}`} aria-hidden="true" /> {sg.workType}
                          </span>
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>{reg?.lubricationPoint || reg?.description || ""}</span>
                      </span>
                    </label>
                    <div style={{ fontSize: 12.5, color: T.textPrimary }}>{sg.reason}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, color: T.textSecondary, flexWrap: "wrap" }}>
                      <span>
                        Action {sg.sourceAcNo || "—"} · {sg.contractor || "—"}
                      </span>
                      <span style={{ color: late(sg) ? T.danger : T.textSecondary, fontWeight: late(sg) ? 700 : 500 }}>
                        <i className="ti ti-calendar" aria-hidden="true" /> by {formatDateShort(sg.requiredDate)}
                      </span>
                    </div>
                    {canCreateRoutines && (
                      <button style={{ ...s.btn, alignSelf: "flex-start", padding: "5px 12px", fontSize: 12.5 }} onClick={() => createFrom([sg])}>
                        Create route
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {picked.length > 0 && (
              <div
                data-testid="sg-pick-bar"
                style={{
                  position: "sticky",
                  bottom: 12,
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  background: T.cardBg,
                  border: `1.5px solid ${T.accent}`,
                  borderRadius: 12,
                  padding: "10px 14px",
                  boxShadow: "0 8px 24px rgba(8,15,28,0.18)",
                }}
              >
                <strong style={{ fontSize: 13.5 }}>
                  {picked.length} picked
                </strong>
                <span style={{ fontSize: 12.5, color: T.textSecondary, flex: 1 }}>
                  {first.routeType || first.workType} · {first.contractor || "—"} · {picked.map((x) => x.lpId).join(", ")}
                </span>
                <button style={s.btn} onClick={() => setPickedSg([])}>
                  Clear
                </button>
                <button style={s.btnPrimary} onClick={() => createFrom(picked)} data-testid="sg-create-route">
                  <i className="ti ti-route" aria-hidden="true" /> Create route with {picked.length} point{picked.length === 1 ? "" : "s"}
                </button>
              </div>
            )}
          </>
        )}
        {newRouteModal}
      </div>
    );
  }

  if (baseView === "templateDetail" && selectedTemplate) {
    const overdueCount = templateInstances.filter((r) => isOverdue(r, now)).length;
    const unassignedCount = templateInstances.filter((r) => r.status === ROUTE_STATUS.DRAFT).length;
    return (
      <div>
        {newRouteModal}
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
            { label: "Draft (no technician)", value: unassignedCount, color: "danger" },
            { label: "Overdue", value: overdueCount, color: "warning" },
            { label: "Next Due", value: formatDateShort(selectedTemplate.nextDueDate), color: "textPrimary", isText: true },
          ].map((m) => (
            <div key={m.label} style={s.metricCard}>
              <div style={{ fontSize: m.isText ? 14 : 20, fontWeight: 800, color: T[m.color] }}>{m.value}</div>
              <div style={{ fontSize: 12, color: T.textSecondary }}>{m.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={instanceStatusFilter === st}
              style={{
                ...s.btn,
                padding: "6px 14px",
                fontSize: 12.5,
                borderRadius: 999,
                background: instanceStatusFilter === st ? T.accent : T.cardBg,
                color: instanceStatusFilter === st ? T.accentText : T.textSecondary,
                borderColor: instanceStatusFilter === st ? T.accent : T.border,
                fontWeight: instanceStatusFilter === st ? 700 : 500,
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
                        <td style={s.td}>{r.assignedTo || <span style={{ color: T.danger, fontWeight: 700 }}>Not assigned</span>}</td>
                        <td style={s.td}>
                          <span style={s.badge(r.status)}>{r.status}</span>
                          {isRouteReturned(r) && <span style={{ ...s.badge("Returned"), marginLeft: 4 }}>Returned</span>}
                        </td>
                        <td style={s.td}>
                          <ProgressBar done={r.itemsDone} total={r.itemsTotal} />
                        </td>
                        <td style={s.td}>{r.dueDate || "—"}</td>
                        <td style={s.td}>
                          {r.createdDate || "—"}
                          {aging && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{aging}</div>}
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
                          {isRouteReturned(r) && <span style={{ ...s.badge("Returned"), marginLeft: 4 }}>Returned</span>}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                      {r.assignedTo || <span style={{ color: T.danger, fontWeight: 700 }}>Not assigned</span>}
                    </div>
                    <div style={{ margin: "8px 0" }}>
                      <ProgressBar done={r.itemsDone} total={r.itemsTotal} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted }}>
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
      {newRouteModal}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Routines</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!scopedContractor && (
            <ContractorChips value={contractorFilter} onChange={setContractorFilter} options={CONTRACTOR_OPTIONS} testid="routes-contractor" />
          )}
          {canCreateRoutines && (
            <button style={s.btnPrimary} onClick={() => { setFromSuggestion(null); setNewFrom("overview"); setView("new"); }}>
              <i className="ti ti-plus" aria-hidden="true" /> Create Route
            </button>
          )}
        </div>
      </div>

      {/* route types + Suggestions: underlined sub-tabs, the same as Oil Inventory's */}
      <div role="group" aria-label="Route type" style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
        {[...ROUTE_TYPE_TABS.map((t) => ({ ...t, n: routeTypeCounts[t.key] ?? 0, on: routeTypeTab === t.key, go: () => setRouteTypeTab(t.key) })),
          { key: "suggestions", label: "Suggestions", icon: "ti-bulb", n: (suggestions || []).length, on: false, go: () => { refreshSuggestions(); setView("suggestions"); } }].map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.on}
            onClick={t.go}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", border: 0, borderBottom: `3px solid ${t.on ? T.accent : "transparent"}`, marginBottom: -1, background: "none", color: t.on ? T.accent : T.textSecondary, fontWeight: t.on ? 700 : 600, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" style={{ fontSize: 16 }} /> {t.label}
            <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: T.cardSubBg, color: T.textSecondary }}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* Phone: the four numbers become one row of chips that filter the
          list; search on top and the area in a Filters sheet. */}
      {isMobile ? (
        <>
          <input
            style={{ ...s.input, width: "100%", boxSizing: "border-box", minHeight: 44, fontSize: 15, marginBottom: 10 }}
            type="search"
            aria-label="Search routes"
            placeholder="Search by route name or id…"
            value={overviewSearch}
            onChange={(e) => setOverviewSearch(e.target.value)}
          />
          <ChipRow label="Due status">
            {[
              { key: "All", label: "All", value: overviewKpis.total, color: "accent" },
              { key: "Overdue", label: "◆ Overdue", value: overviewKpis.overdue, color: "danger" },
              { key: "Due Soon", label: "▲ Due soon", value: overviewKpis.dueSoon, color: "warning" },
              { key: "On Schedule", label: "● On schedule", value: overviewKpis.onSchedule, color: "success" },
            ].map((m) => (
              <CountChip key={m.key} on={dueStatusFilter === m.key} onClick={() => setDueStatusFilter(m.key)} count={m.value} color={m.color} testid={`routes-due-${m.key}`}>
                {m.label}
              </CountChip>
            ))}
            <FiltersPill count={(areaFilter !== "All" ? 1 : 0) + (["All", "Overdue", "Due Soon", "On Schedule"].includes(dueStatusFilter) ? 0 : 1)} onClick={() => setSheetOpen(true)} testid="routes-filters" />
          </ChipRow>
          <BottomSheet
            open={sheetOpen}
            title="Filters"
            onClose={() => setSheetOpen(false)}
            testid="routes-filter-sheet"
            footer={
              <>
                <SheetButton onClick={() => { setAreaFilter("All"); setDueStatusFilter("All"); }}>Reset</SheetButton>
                <SheetButton primary grow={2} onClick={() => setSheetOpen(false)}>Show {visibleOverviewItems.length} routes</SheetButton>
              </>
            }
          >
            <SheetGroup label="Area">
              <select style={{ ...s.select, width: "100%", minHeight: 44 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Area">
                {areaOptions.map((a) => (
                  <option key={a} value={a}>{a === "All" ? "All Areas" : a}</option>
                ))}
              </select>
            </SheetGroup>
            <SheetGroup label="Status">
              <select style={{ ...s.select, width: "100%", minHeight: 44 }} value={dueStatusFilter} onChange={(e) => setDueStatusFilter(e.target.value)} aria-label="Status">
                {DUE_STATUS_FILTERS.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </SheetGroup>
          </BottomSheet>
        </>
      ) : (
        <>
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
                <div style={{ fontSize: 12, color: T.textSecondary }}>{m.label}</div>
              </div>
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
                type="button"
                aria-pressed={dueStatusFilter === st}
                style={{
                  ...s.btn,
                  padding: "6px 14px",
                  fontSize: 12.5,
                  borderRadius: 999,
                  background: dueStatusFilter === st ? T.accent : T.cardBg,
                  color: dueStatusFilter === st ? T.accentText : T.textSecondary,
                  borderColor: dueStatusFilter === st ? T.accent : T.border,
                  fontWeight: dueStatusFilter === st ? 700 : 500,
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
        </>
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
                        <tr key={item.id} style={{ cursor: "pointer" }} onClick={() => openOverviewItem(item)}>
                          <td style={{ ...s.td, borderLeft: `4px solid ${compColor || "transparent"}` }}>
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
                            <DueStatusBadge T={T} status={item.dueStatus} returned={item.returned} />
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
                    style={{ ...s.card, cursor: "pointer", borderLeft: `4px solid ${compColor || "transparent"}` }}
                    onClick={() => openOverviewItem(item)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {item.kind === "template" && <i className="ti ti-repeat" style={{ marginRight: 6, color: T.textMuted }} aria-hidden="true" title="Recurring" />}
                        {item.routeName || item.id}
                      </span>
                      <DueStatusBadge T={T} status={item.dueStatus} returned={item.returned} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>
                      <RouteTypeBadge T={T} routeType={item.routeType} /> · {item.equipmentCount} equipment{item.frequency ? ` · ${item.frequency}` : ""}
                    </div>
                    {item.completionPct !== null && item.completionPct !== undefined && (
                      <div style={{ marginTop: 6 }}>
                        <ProgressBar done={item.itemsDone} total={item.equipmentCount} width={120} />
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted, marginTop: 8 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <p style={{ fontWeight: 700, margin: 0 }}>Due in the next</p>
              <select
                style={{ ...s.select, fontSize: 12.5, minWidth: 120 }}
                value={dueWindow}
                onChange={(e) => setDueWindow(Number(e.target.value))}
                aria-label="Due window"
                data-testid="due-window"
              >
                <option value={7}>7 days</option>
                <option value={15}>15 days</option>
                <option value={30}>1 month</option>
                <option value={90}>3 months</option>
              </select>
            </div>
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 10px" }} data-testid="due-window-count">
              {nextDueItems.length} route{nextDueItems.length === 1 ? "" : "s"}
              {nextDueItems.some((i) => i.dueStatus === "Overdue") ? ` · ${nextDueItems.filter((i) => i.dueStatus === "Overdue").length} overdue` : ""}
            </p>
            {nextDueItems.length === 0 ? (
              <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Nothing overdue or due in this window.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }} data-testid="due-window-list">
                {nextDueItems.map((item) => (
                  <div
                    key={item.id}
                    style={{ cursor: "pointer", paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}
                    onClick={() => openOverviewItem(item)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{item.routeName || item.id}</span>
                      <DueStatusBadge T={T} status={item.dueStatus} returned={item.returned} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
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
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: T.textSecondary }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Overdue" stackId="s" fill={T.danger} />
                <Bar dataKey="Due Soon" stackId="s" fill={T.warning} />
                <Bar dataKey="On Schedule" stackId="s" fill={T.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card} data-testid="busy-days">
          <p style={{ fontWeight: 700, margin: "0 0 4px" }}>Busy days ahead</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "0 0 10px" }}>
            Lubrication points due per day, next 5 weeks
            {busyDays.overdue > 0 && <span style={{ color: T.danger, fontWeight: 700 }}> · {busyDays.overdue} route{busyDays.overdue === 1 ? "" : "s"} already overdue</span>}
          </p>
          <CalendarHeat T={T} days={busyDays.map} weeks={5} unit="points" />
        </div>

        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontWeight: 700, margin: 0 }}>Completion Rate Trend (Last 6 Months)</p>
            <span style={{ fontSize: 12, color: T.danger, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed ${T.danger}` }} /> Target {onTimeTarget}%
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
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: T.textSecondary }} axisLine={false} tickLine={false} width={32} unit="%" />
                <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
                <ReferenceLine y={onTimeTarget} stroke={T.danger} strokeDasharray="4 4" />
                <Bar dataKey="rate" name="Completion Rate" fill={T.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p style={{ fontSize: 12, color: T.textMuted, margin: "8px 0 0" }}>
            Item-weighted: LP items completed on time ÷ total LP items, across routines due that month.
          </p>
          {onTimeByContractor && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }} data-testid="routes-ontime-contractor">
              <p style={{ fontWeight: 700, margin: "0 0 8px", fontSize: 13.5 }}>Routes done on time · last 3 months</p>
              {["RHI", "ASEC"].filter((ct) => contractorFilter === "All" || ct === contractorFilter).map((ct) => {
                const b = onTimeByContractor[ct];
                return (
                  <div key={ct} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <b style={{ width: 42, fontSize: 13 }}>{ct}</b>
                      <TargetBar T={T} pct={b.pct} target={onTimeTarget} color={b.pct != null && b.pct < onTimeTarget ? T.warning : T.accent} height={10} />
                      <b style={{ width: 42, textAlign: "right", fontSize: 13 }}>{b.pct == null ? "—" : `${b.pct}%`}</b>
                    </div>
                    <p style={{ margin: "2px 0 0 52px", fontSize: 12, color: T.textSecondary }}>
                      {b.due ? `${b.onTime} of ${b.due} on time` : "No routes due in this period"}
                      {b.overdueNow > 0 && <span style={{ color: T.danger, fontWeight: 700 }}> · {b.overdueNow} overdue now</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

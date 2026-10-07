import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useIsAccEngineer, useIsRouteEngineerFor, useSessionContractor } from "../SessionContext";
import EquipmentList from "../components/EquipmentList";
import { HEALTH_COLOR, healthForLp, indexByLp, pointHealth, worstHealth } from "../equipmentHealth";
import { formatDate, intervalMonths, isActionOverdue, actionDaysOverdue, ROUTE_STATUS } from "../parsers";
import { statusColor } from "../theme";
import * as api from "../api";
import EditSampleModal from "../components/EditSampleModal";
import EditActionModal from "../components/EditActionModal";
import EditOilChangeModal from "../components/EditOilChangeModal";
import PointHistory from "../components/PointHistory";
import useIsMobile from "../hooks/useIsMobile";

const STATUS_ACTION_COLOR = { Draft: "warning", Open: "danger", "Waiting Stoppage": "accent", "Closure Requested": "info", Closed: "success" };
const CRITICALITY_RANK = { Normal: 0, Medium: 1, High: 2 };

// Severity ranking for picking the "worst" status across several
// lubrication points' latest samples — higher wins.
const STATUS_SEVERITY = { Alert: 3, Caution: 2, Warning: 2, Normal: 1 };

// Single lubrication point ("equipment view") tabs — the profile layout
// originally built as a separate "Equipment Viewer" page/tab, folded back
// into Equipment's own single-LP view since it's the same concept (one
// profile per LP_ID) and didn't need its own nav entry.
const LP_TABS = [
  { key: "overview", label: "Overview", icon: "ti-layout-dashboard" },
  { key: "samples", label: "Oil Samples", icon: "ti-flask" },
  { key: "changes", label: "Oil Changes", icon: "ti-droplet" },
  { key: "topups", label: "Top Ups", icon: "ti-droplet-plus" },
  { key: "actions", label: "Actions", icon: "ti-checklist" },
  { key: "routes", label: "Routes", icon: "ti-route" },
  { key: "info", label: "Equipment Info", icon: "ti-info-circle" },
];

function statusColorKey(status) {
  if (status === "Alert") return "danger";
  if (status === "Caution" || status === "Warning") return "warning";
  if (status === "Normal") return "success";
  return "textMuted";
}

// Criticality is computed, not stored — confirmed directly by the user
// ("criticality depend on oil analysis or oil change over due"): High if
// the latest oil sample is in Alert, or the oil change is overdue; Medium
// for Caution/Warning; Normal otherwise.
function criticalityFor(latestSample, oilChangeOverdue) {
  if (latestSample?.reportStatus === "Alert" || oilChangeOverdue) return "High";
  if (latestSample?.reportStatus === "Caution" || latestSample?.reportStatus === "Warning") return "Medium";
  return "Normal";
}

// Overview-tab summary cards (Last Oil Sample/Change/Top Up, and each row
// inside Equipment Health Status) jump to the tab that actually has the
// detail — a real <button> when clickable (not a div+onClick) for
// keyboard/focus accessibility, matching Dashboard.jsx's own KpiCard.
function ClickableCard({ s, onClick, style, children }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{ ...s.card, textAlign: "left", width: "100%", font: "inherit", color: "inherit", cursor: onClick ? "pointer" : "default", ...style }}
    >
      {children}
    </Tag>
  );
}

// Point overview cards — one look for all five: a coloured top edge and
// icon for the card's state (always with the state in words too), larger
// text, and explicit text colours so nothing goes missing on light themes.
function StatusCard({ T, s, color, icon, title, onClick, testid, children }) {
  const c = T[color] || T.textSecondary;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testid}
      style={{
        ...s.card,
        marginBottom: 0,
        padding: "16px 18px",
        minHeight: 190,
        borderTop: `4px solid ${c}`,
        textAlign: "left",
        width: "100%",
        font: "inherit",
        color: T.textPrimary,
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: `${c}22`, color: c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
          <i className={`ti ${icon}`} aria-hidden="true" />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{title}</span>
        {onClick && <i className="ti ti-chevron-right" aria-hidden="true" style={{ marginLeft: "auto", color: T.textSecondary }} />}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </Tag>
  );
}
function BigValue({ T, color, children }) {
  return <div style={{ fontSize: 22, fontWeight: 800, color: color ? T[color] : T.textPrimary, lineHeight: 1.25, marginBottom: 6 }}>{children}</div>;
}
function StatusPill({ T, color, children }) {
  const c = T[color] || T.textSecondary;
  return (
    <span style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 700, color: c, background: `${c}22`, borderRadius: 999, padding: "3px 12px", marginBottom: 6 }}>{children}</span>
  );
}
function Detail({ T, children, testid }) {
  return (
    <div data-testid={testid} style={{ fontSize: 13, color: T.textSecondary, marginTop: 4, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}
function Empty({ T, children }) {
  return <div style={{ fontSize: 13.5, color: T.textSecondary, margin: "auto 0" }}>{children}</div>;
}

function SmallBadge({ T, color, children }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: T[color] || color,
        background: (T[color] || color) + "22",
        borderRadius: 4,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function RecentTable({ T, s, title, rows, columns, headers }) {
  return (
    <div style={s.card}>
      <p style={{ fontWeight: 700, margin: "0 0 10px" }}>{title}</p>
      {rows.length === 0 ? (
        <p style={{ color: T.textSecondary, fontSize: 12, margin: 0 }}>None yet.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", color: T.textSecondary, fontWeight: 600, padding: "4px 6px 6px 0" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                {columns.map((c) => (
                  <td key={c} style={{ padding: "6px 6px 6px 0" }}>
                    {r[c] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// `renderActions(row)` is optional — lets a tab keep its existing
// View Report/Edit/Delete row buttons (Oil Samples, Actions) while the
// read-only tabs (Oil Changes, Top Ups) pass nothing.
function HistoryTable({ T, s, rows, empty, columns, renderActions }) {
  const isMobile = useIsMobile();
  if (rows.length === 0) {
    return (
      <div style={s.card}>
        <p style={{ color: T.textSecondary, margin: 0 }}>{empty}</p>
      </div>
    );
  }
  const cell = (c, r) => (c.render ? c.render(r) : c.badge ? <SmallBadge T={T} color={c.badge(r[c.key])}>{r[c.key] ?? "—"}</SmallBadge> : r[c.key] ?? "—");
  // Phones: one card per row (label beside value) instead of a squeezed table.
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="history-cards">
        {rows.map((r, i) => (
          <div key={r._id || i} style={{ ...s.card, padding: 14, marginBottom: 0 }}>
            {columns.map((c) => (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 13 }}>
                <span style={{ color: T.textSecondary, flexShrink: 0 }}>{c.label}</span>
                <span style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{cell(c, r)}</span>
              </div>
            ))}
            {renderActions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 8 }}>{renderActions(r)}</div>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
      <table style={s.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={s.th}>
                {c.label}
              </th>
            ))}
            {renderActions && <th style={s.th} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id || i}>
              {columns.map((c) => (
                <td key={c.key} style={s.td}>
                  {cell(c, r)}
                </td>
              ))}
              {renderActions && (
                <td style={{ ...s.td, textAlign: "right", whiteSpace: "nowrap" }}>{renderActions(r)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Search finds either an EQUIPMENT (one Equipment_ID, e.g. "111.HC100" —
// lands on a combined dashboard covering every lubrication point under it)
// or a specific LUBRICATION POINT (one LP_ID, e.g. "LP-111.HC100-HY" —
// lands on the single-point view, same as before Step 1's LP_ID-per-row
// registry). One equipment can have several LP_IDs, each with its own mix
// of oil analysis / oil-change / action history — the combined view is
// what lets you see all of it in one place instead of hunting down each
// point separately.
export default function Equipment({
  samples,
  equipmentRegistry,
  actions,
  oilChanges,
  oilChangeEvents,
  actionRegistry,
  webhookUrl,
  pushToast,
  onSelectSample,
  onEditSample,
  onDeleteSample,
  onOpenReport,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
  onSaveOilChange,
  onCreateRoute,
  onOpenRoute,
  initialCode,
  onCodeChange,
}) {
  const { T, s } = useTheme();
  const isAccEngineer = useIsAccEngineer();
  const scopedContractor = useSessionContractor();
  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  // Every top-up, once — the leak rule in the health score needs them for
  // every point, not just the one open.
  const [allTopUps, setAllTopUps] = useState([]);
  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    api.getAllTopUps(webhookUrl).then((t) => { if (!cancelled) setAllTopUps(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [webhookUrl]);
  const lpIndex = useMemo(() => indexByLp({ samples, actions, oilChanges, topUps: allTopUps }), [samples, actions, oilChanges, allTopUps]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // { mode: "equipment", id: Equipment_ID } | { mode: "lp", id: LP_ID } | null
  const [selection, setSelection] = useState(initialCode || null);

  function setSelectionSynced(sel) {
    setSelection(sel);
    if (onCodeChange) onCodeChange(sel);
  }

  const [editingSample, setEditingSample] = useState(null);
  const [editingAction, setEditingAction] = useState(null); // { action, isNew }
  const [editingOilChange, setEditingOilChange] = useState(null);

  // ── single lubrication point ("equipment view") tab state ──────────────
  const [lpTab, setLpTab] = useState("overview");
  const [changeHistory, setChangeHistory] = useState([]);
  const [topUps, setTopUps] = useState([]);
  const [routesForLp, setRoutesForLp] = useState([]);
  const [suggestionsForLp, setSuggestionsForLp] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isLpViewSelected = selection?.mode === "lp";
  const lpCode = isLpViewSelected ? selection.id : null;

  useEffect(() => {
    if (!lpCode || !webhookUrl) return;
    let cancelled = false;
    setLoadingHistory(true);
    Promise.all([api.getOilChangesForLp(webhookUrl, lpCode), api.getTopUpsForLp(webhookUrl, lpCode)])
      .then(([changes, tops]) => {
        if (cancelled) return;
        setChangeHistory(changes);
        setTopUps(tops);
      })
      .then(() => api.getRoutesForLp(webhookUrl, lpCode))
      .then((routes) => { if (!cancelled) setRoutesForLp(routes || []); })
      .then(() => api.getSuggestions(webhookUrl))
      .then((list) => { if (!cancelled) setSuggestionsForLp((list || []).filter((sg) => sg.lpId === lpCode)); })
      .catch((err) => pushToast?.(err.message, "error"))
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [lpCode, webhookUrl, pushToast]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of equipmentRegistry || []) {
      const key = r.equipmentId || r.code;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }, [equipmentRegistry]);

  function latestSampleForLp(lpCode) {
    return (samples || []).filter((sm) => sm.unitId === lpCode).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))[0] || null;
  }
  function oilChangeEntryFor(lpCode) {
    return (oilChanges || []).find((o) => o.equipmentCode === lpCode) || null;
  }

  const q = query.trim().toLowerCase();
  const equipmentResults = !q
    ? Array.from(groups.entries())
    : Array.from(groups.entries()).filter(
        ([eid, rows]) =>
          eid.toLowerCase().includes(q) ||
          rows.some((r) => (r.description || "").toLowerCase().includes(q) || (r.area || "").toLowerCase().includes(q))
      );
  const lpResults = !q ? [] : registry.filter((r) => r.code.toLowerCase().includes(q));

  function selectEquipmentGroup(eid) {
    setSelectionSynced({ mode: "equipment", id: eid });
    setQuery("");
    setOpen(false);
  }
  function selectLp(code) {
    setSelectionSynced({ mode: "lp", id: code });
    setQuery("");
    setOpen(false);
    setLpTab("overview");
  }

  const isEquipmentView = selection?.mode === "equipment";
  const isLpView = selection?.mode === "lp";
  const groupRows = useMemo(() => (isEquipmentView ? groups.get(selection.id) || [] : []), [isEquipmentView, groups, selection?.id]);

  // ── single lubrication point (unchanged from before the redesign) ──────
  const reg = isLpView ? registry.find((r) => r.code === selection.id) : null;
  const samplesForEquip = useMemo(
    () => (isLpView ? (samples || []).filter((sm) => sm.unitId === selection.id).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate)) : []),
    [isLpView, samples, selection?.id]
  );
  const latest = samplesForEquip[0] || null;
  const oilChangesForEquip = isLpView ? (oilChanges || []).filter((o) => o.equipmentCode === selection.id) : [];
  const actionsForEquip = isLpView
    ? (actions || [])
        .filter((a) => (a.equipmentCode || a.unitId) === selection.id)
        .sort((a, b) => new Date(b.revisionDate || b.sampleDate || 0) - new Date(a.revisionDate || a.sampleDate || 0))
    : [];
  const nextDue = [...oilChangesForEquip].filter((o) => o.nextDueDate).sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))[0];

  // health/criticality/timeline — the "Equipment Viewer" profile design,
  // folded into this single-LP view rather than living on its own tab.
  const lpOilChangeState = oilChangesForEquip[0] || null;
  const oilChangeOverdue = lpOilChangeState?.status === "Overdue";
  const openActions = actionsForEquip.filter((a) => a.status !== "Closed");
  const latestChange = changeHistory[0] || null;
  const latestTopUp = topUps[0] || null;
  const criticality = isLpView ? criticalityFor(latest, oilChangeOverdue) : "Normal";
  const criticalityColor = criticality === "High" ? "danger" : criticality === "Medium" ? "warning" : "success";
  const lpHealth = isLpView && reg
    ? pointHealth({ reg, samples: samplesForEquip, oilChange: lpOilChangeState, actions: actionsForEquip, topUps: topUps.length ? topUps : lpIndex.topUps.get(reg.code) || [] })
    : null;
  const health = lpHealth?.health || "Good";
  // Oil changes are logged from confirmed routes; by hand only by engineers.
  const isContractorEngineerHere = useIsRouteEngineerFor(reg?.contractor || "");
  const canLogByHand = isAccEngineer || isContractorEngineerHere;
  // "What's next" for this point.
  const sampleMonths = reg?.oilAnalysisRequired === "Yes" ? intervalMonths(reg.interval || "") : 0;
  const nextSampleDue = useMemo(() => {
    if (!sampleMonths || !latest?.sampledDate) return null;
    const d = new Date(latest.sampledDate);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth() + sampleMonths, d.getDate());
  }, [sampleMonths, latest?.sampledDate]);
  const openRoutesForLp = routesForLp.filter((r) => [ROUTE_STATUS.DRAFT, ROUTE_STATUS.ASSIGNED, ROUTE_STATUS.IN_PROGRESS, ROUTE_STATUS.WAITING].includes(r.status));
  const labWaiting = samplesForEquip.filter((sm) => sm.validationStatus === "Pending Validation" || sm.validationStatus === "Returned");
  // Top-up rate over the last 90 days.
  const topUpRate = useMemo(() => {
    const since = Date.now() - 90 * 86400000;
    const recent = topUps.filter((t) => new Date(t.eventDate).getTime() >= since);
    const litres = recent.reduce((n, t) => n + (parseFloat(t.quantity) || 0), 0);
    return { count: recent.length, litres: Math.round(litres * 10) / 10, perMonth: Math.round((litres / 3) * 10) / 10 };
  }, [topUps]);

  function createRouteFor(lpId, routeType) {
    const r = registry.find((x) => x.code === lpId);
    onCreateRoute?.({
      lpId,
      routeType,
      workType: routeType === "Emergency Top Up" ? "Top Up" : routeType,
      contractor: r?.contractor || "",
      reason: "From Oil Equipment",
    });
  }
  function newActionFor(lpId) {
    const r = registry.find((x) => x.code === lpId);
    const last = (samples || []).filter((sm) => sm.unitId === lpId).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))[0];
    setEditingAction({
      action: {
        equipmentCode: lpId,
        contractor: r?.contractor || "",
        reportEquipmentId: r?.reportEquipmentId || "",
        description: r?.description || "",
        oilType: r?.lubricant || "",
        sampleDate: last?.sampledDate || "",
        sampleResult: last?.reportStatus || "",
        sampleAnalysis: (last?.recommendations || []).join("; "),
      },
      isNew: true,
    });
  }
  // E4 — the point's whole history as a PDF (same rules as the page).
  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadHistoryPdf() {
    if (!reg) return;
    setPdfBusy(true);
    try {
      const { generatePointHistoryPdf } = await import("../reportGenerators");
      await generatePointHistoryPdf({
        reg,
        samples: samplesForEquip,
        sameOilSamples,
        changes: changeHistory,
        topUps,
        actions: actionsForEquip,
        health: lpHealth,
        nextChangeDue: lpOilChangeState?.nextDueDate || "",
        nextSampleDue,
      });
    } catch (err) {
      pushToast?.(`Could not make the PDF: ${err.message}`, "error");
    } finally {
      setPdfBusy(false);
    }
  }
  const whatsNextColor =
    oilChangeOverdue || lpHealth?.sampleState?.label === "MISSING" || lpHealth?.sampleState?.label === "OVERDUE"
      ? "danger"
      : suggestionsForLp.length || labWaiting.length
        ? "warning"
        : "accent";
  const healthColor = HEALTH_COLOR[health];
  const siblingCount = isLpView ? (groups.get(reg?.equipmentId)?.length || 0) : 0;

  // Same-oil reports from other points — the fallback for limit lines
  // when the lab never marked a value on this point's own reports.
  const sameOilSamples = useMemo(() => {
    if (!isLpView || !reg?.lubricant) return [];
    const codes = new Set(registry.filter((r) => r.code !== reg.code && r.lubricant === reg.lubricant).map((r) => r.code));
    return (samples || []).filter((sm) => codes.has(sm.unitId));
  }, [isLpView, reg?.code, reg?.lubricant, registry, samples]);

  // ── combined equipment view (new) ───────────────────────────────────────
  const pointSummaries = useMemo(() => {
    if (!isEquipmentView) return [];
    return groupRows.map((r) => {
      const pointSamples = (samples || [])
        .filter((sm) => sm.unitId === r.code)
        .sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate));
      const pointOilChange = oilChangeEntryFor(r.code);
      const pointActions = (actions || [])
        .filter((a) => (a.equipmentCode || a.unitId) === r.code)
        .sort((a, b) => new Date(b.revisionDate || b.sampleDate || 0) - new Date(a.revisionDate || a.sampleDate || 0));
      const latest = pointSamples[0] || null;
      return {
        reg: r,
        samples: pointSamples,
        latest,
        oilChange: pointOilChange,
        actions: pointActions,
        openActions: pointActions.filter((a) => a.status !== "Closed").length,
        criticality: criticalityFor(latest, pointOilChange?.status === "Overdue"),
        h: healthForLp(r, lpIndex),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEquipmentView, groupRows, samples, oilChanges, actions, lpIndex]);

  const totalSamples = pointSummaries.reduce((sum, p) => sum + p.samples.length, 0);
  const totalOpenActions = pointSummaries.reduce((sum, p) => sum + p.openActions, 0);
  const worst = pointSummaries.reduce((acc, p) => {
    if (!p.latest) return acc;
    const sev = STATUS_SEVERITY[p.latest.reportStatus] || 1;
    return !acc || sev > acc.sev ? { status: p.latest.reportStatus, sev } : acc;
  }, null);
  const machineHealth = worstHealth(pointSummaries.map((p) => p.h));
  const machineAttention = pointSummaries.filter((p) => p.h.health !== "Good").length;
  const machineOverdueActions = pointSummaries.reduce((n, p) => n + p.h.overdueActions, 0);
  const oilUsedThisYear = useMemo(() => {
    if (!isEquipmentView) return 0;
    const codes = new Set(groupRows.map((r) => r.code));
    const year = new Date().getFullYear();
    const inYear = (d) => new Date(d).getFullYear() === year;
    const changes = (oilChangeEvents || []).filter((e) => codes.has(e.lpId) && inYear(e.eventDate)).reduce((n, e) => n + (parseFloat(e.quantityUsed) || 0), 0);
    const tops = allTopUps.filter((t) => codes.has(t.lpId) && inYear(t.eventDate)).reduce((n, t) => n + (parseFloat(t.quantity) || 0), 0);
    return Math.round((changes + tops) * 10) / 10;
  }, [isEquipmentView, groupRows, oilChangeEvents, allTopUps]);
  const soonestNextDue = pointSummaries
    .map((p) => p.oilChange)
    .filter((o) => o?.nextDueDate)
    .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))[0];

  function handleLogOilChange() {
    if (oilChangesForEquip.length === 0) return;
    setEditingOilChange(nextDue || oilChangesForEquip[0]);
  }

  // PERFORMANCE: these handlers (onSaveOilChange/onAddAction/onUpdateAction/
  // onDeleteAction, all from App.jsx) already apply the change to local
  // state immediately and only verify/roll back in the background — see
  // their own comments. Not awaiting them here, and closing the modal right
  // away, is what makes this feel instant instead of sitting on "Saving…"
  // for the network round trip.
  function handleSaveOilChange(updated) {
    onSaveOilChange(updated).catch(() => {});
    setEditingOilChange(null);
  }

  function handleSaveAction(payload) {
    if (editingAction.isNew) onAddAction(payload).catch(() => {});
    else onUpdateAction(payload).catch(() => {});
    setEditingAction(null);
  }
  function handleDeleteAction() {
    onDeleteAction(editingAction.action).catch(() => {});
    setEditingAction(null);
  }

  const tag = (text) => (
    <span
      key={text}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 5,
        background: T.cardSubBg,
        color: T.textSecondary,
        border: `1px solid ${T.border2}`,
      }}
    >
      {text}
    </span>
  );

  const sectionLabel = (icon, label, count) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: T.textSecondary,
        }}
      >
        <i className={`ti ${icon}`} style={{ color: T.accent, fontSize: 14 }} aria-hidden="true" />
        {label}
      </span>
      {count != null && <span style={{ fontSize: 11, color: T.textMuted }}>{count}</span>}
    </div>
  );

  const cardSection = (children, extraStyle) => (
    <div style={{ padding: "20px 24px", borderTop: `1px solid ${T.border}`, ...extraStyle }}>{children}</div>
  );

  // "Log Oil Change" / "New Action" at the top of the combined view: a
  // direct button when the equipment has exactly one lubrication point
  // (nothing to pick), a "for…" select when it has several.
  function pointActionControl(label, icon, onPick, disabledFor) {
    if (groupRows.length === 1) {
      const only = groupRows[0];
      return (
        <button style={s.btn} onClick={() => onPick(only.code)} disabled={disabledFor ? disabledFor(only.code) : false}>
          <i className={`ti ${icon}`} aria-hidden="true" /> {label}
        </button>
      );
    }
    return (
      <select
        style={{ ...s.select, maxWidth: 220 }}
        value=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
          e.target.value = "";
        }}
      >
        <option value="">
          {label} for…
        </option>
        {groupRows.map((r) => (
          <option key={r.code} value={r.code}>
            {r.lubricationPoint || r.code}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      {/* ── search ─────────────────────────────────────────────────────── */}
      <div
        style={{
          textAlign: selection ? "left" : "center",
          padding: selection ? "0 0 20px" : "8px 0 18px",
          transition: "padding 0.15s",
        }}
      >
        {!selection && (
          <>
            <div
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.textMuted, marginBottom: 8 }}
            >
              Equipment Lookup
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: T.textPrimary }}>Oil Equipment</p>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 auto 14px", maxWidth: 520 }}>
              Every machine and lubrication point, worst first. Search for one, or filter the list below.
            </p>
          </>
        )}
        <div style={{ position: "relative", width: "100%", maxWidth: selection ? 420 : 520, margin: selection ? 0 : "0 auto" }}>
          <div style={{ position: "relative" }}>
            <i
              className="ti ti-search"
              style={{
                position: "absolute",
                left: selection ? 12 : 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: T.textMuted,
                fontSize: selection ? 14 : 16,
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <input
              style={{
                ...s.input,
                padding: selection ? "9px 32px 9px 34px" : "13px 40px 13px 44px",
                fontSize: selection ? 13 : 15,
                borderRadius: selection ? 8 : 10,
              }}
              value={
                open
                  ? query
                  : isLpView
                  ? `${selection.id}${reg ? " — " + reg.description : ""}`
                  : isEquipmentView
                  ? `${selection.id} — ${groupRows.length} point${groupRows.length !== 1 ? "s" : ""}`
                  : query
              }
              placeholder="Search equipment code or LP_ID…"
              onFocus={() => {
                setOpen(true);
                setQuery("");
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {selection && !open && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectionSynced(null);
                }}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: T.textMuted,
                  cursor: "pointer",
                  fontSize: 16,
                }}
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
          {open && (
            <div
              style={{
                position: "absolute",
                zIndex: 99,
                top: "100%",
                left: 0,
                right: 0,
                background: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                marginTop: 4,
                maxHeight: 360,
                overflowY: "auto",
                textAlign: "left",
                boxShadow: `0 8px 24px ${T.appBg}aa`,
              }}
            >
              {equipmentResults.length === 0 && lpResults.length === 0 && (
                <div style={{ padding: 16, color: T.textMuted, fontSize: 12.5, textAlign: "center" }}>No matches</div>
              )}
              {equipmentResults.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "8px 16px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: T.textMuted,
                    }}
                  >
                    Equipment
                  </div>
                  {equipmentResults.slice(0, 30).map(([eid, rows]) => {
                    const worstOfGroup = rows.reduce((acc, r) => {
                      const ls = latestSampleForLp(r.code);
                      if (!ls) return acc;
                      const sev = STATUS_SEVERITY[ls.reportStatus] || 1;
                      return !acc || sev > acc.sev ? { status: ls.reportStatus, sev } : acc;
                    }, null);
                    const color = worstOfGroup ? statusColor(T, worstOfGroup.status) : T.textMuted;
                    return (
                      <div
                        key={eid}
                        onMouseDown={() => selectEquipmentGroup(eid)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 16px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${T.border2}`,
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: T.accent }}>{eid}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: T.textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {rows[0]?.area || ""}
                        </span>
                        <span style={{ fontSize: 10.5, color: T.textMuted, background: T.cardSubBg, borderRadius: 4, padding: "2px 7px" }}>
                          {rows.length} point{rows.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              {lpResults.length > 0 && (
                <>
                  <div
                    style={{
                      padding: "8px 16px 4px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: T.textMuted,
                    }}
                  >
                    Lubrication Points
                  </div>
                  {lpResults.slice(0, 30).map((r) => {
                    const ls = latestSampleForLp(r.code);
                    const color = ls ? statusColor(T, ls.reportStatus) : T.textMuted;
                    return (
                      <div
                        key={r.code}
                        onMouseDown={() => selectLp(r.code)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 16px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${T.border2}`,
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: T.accent }}>{r.code}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: T.textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {r.lubricationPoint || r.description}
                        </span>
                        {r.area && (
                          <span style={{ fontSize: 10.5, color: T.textMuted, background: T.cardSubBg, borderRadius: 4, padding: "2px 7px" }}>
                            {r.area}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!selection && (
        <EquipmentList
          registry={registry}
          idx={lpIndex}
          scopedContractor={scopedContractor}
          onOpenEquipment={selectEquipmentGroup}
          onOpenLp={selectLp}
        />
      )}

      {/* ── combined equipment dashboard ──────────────────────────────── */}
      {isEquipmentView && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.textHighlight }}>{selection.id}</span>
                  <span style={{ ...s.badge(), background: T.cardSubBg, color: T.textMuted }}>
                    {groupRows.length} lubrication point{groupRows.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{[groupRows[0]?.area, groupRows[0]?.contractor].filter(Boolean).map(tag)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {onCreateRoute && pointActionControl("Create Route", "ti-route", (lpCode) => createRouteFor(lpCode, "Oil Change"))}
                {pointActionControl("New Action", "ti-clipboard-plus", newActionFor)}
                {onOpenReport && pointActionControl("Full Report", "ti-file-analytics", onOpenReport)}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 18 }} data-testid="machine-summary">
              {[
                ["Health", machineHealth, T[HEALTH_COLOR[machineHealth]], machineAttention ? `${machineAttention} of ${groupRows.length} points need attention` : "All points good"],
                ["Worst Result", worst ? worst.status : "—", worst ? statusColor(T, worst.status) : null, `${totalSamples} sample${totalSamples === 1 ? "" : "s"}`],
                ["Open Actions", totalOpenActions, totalOpenActions > 0 ? T.danger : T.success, machineOverdueActions ? `${machineOverdueActions} overdue` : null],
                [
                  "Next Oil Change",
                  soonestNextDue ? formatDate(soonestNextDue.nextDueDate) : "—",
                  soonestNextDue?.status === "Overdue" ? T.danger : null,
                  soonestNextDue?.lubricationPoint,
                ],
                ["Oil Used This Year", `${oilUsedThisYear} L`, null, "oil changes + top-ups"],
              ].map(([label, val, color, sub]) => (
                <div key={label} style={{ background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "11px 13px" }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: T.textMuted,
                      marginBottom: 5,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: color || T.textHighlight }}>{val}</div>
                  {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {cardSection(
            <>
              {sectionLabel("ti-list-details", "Lubrication Points", groupRows.length)}
              <div style={{ overflowX: "auto" }}>
                <table style={s.table} data-testid="points-compare">
                  <thead>
                    <tr>
                      <th style={s.th}>Point</th>
                      <th style={s.th}>Oil</th>
                      <th style={s.th}>Health</th>
                      <th style={s.th}>Latest result</th>
                      <th style={s.th}>Oil change</th>
                      <th style={s.th}>Actions</th>
                      <th style={s.th}>Top-ups (30 d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pointSummaries]
                      .sort((a, b) => b.h.score - a.h.score)
                      .map((p) => (
                        <tr key={p.reg.code} style={{ cursor: "pointer" }} onClick={() => selectLp(p.reg.code)}>
                          <td style={s.td}>
                            <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{p.reg.code}</div>
                            <div style={{ fontSize: 11.5, color: T.textSecondary }}>{p.reg.lubricationPoint || p.reg.description}</div>
                          </td>
                          <td style={s.td}>
                            {p.reg.lubricant || "—"}
                            <div style={{ fontSize: 11, color: T.textSecondary }}>{p.reg.oilAnalysisRequired === "Yes" ? "sampled" : "time-based, not sampled"}</div>
                          </td>
                          <td style={s.td}>
                            <SmallBadge T={T} color={HEALTH_COLOR[p.h.health]}>{p.h.health}</SmallBadge>
                            {p.h.reasons.length > 0 && (
                              <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 3 }}>{p.h.reasons.map((x) => x.text).join(" · ")}</div>
                            )}
                          </td>
                          <td style={s.td}>
                            {p.latest ? (
                              <>
                                <span style={s.badge(p.latest.reportStatus)}>{p.latest.reportStatus}</span>
                                <div style={{ fontSize: 11, color: T.textSecondary }}>{formatDate(p.latest.sampledDate)}</div>
                              </>
                            ) : (
                              <span style={{ color: T.textMuted }}>{p.reg.oilAnalysisRequired === "Yes" ? "none yet" : "—"}</span>
                            )}
                          </td>
                          <td style={s.td}>
                            {p.oilChange?.changeDate ? (
                              <>
                                <div>last {formatDate(p.oilChange.changeDate)}</div>
                                {p.oilChange.nextDueDate && (
                                  <div style={{ fontSize: 11, color: p.oilChange.status === "Overdue" ? T.danger : T.textSecondary, fontWeight: p.oilChange.status === "Overdue" ? 700 : 400 }}>
                                    next {formatDate(p.oilChange.nextDueDate)}
                                    {p.oilChange.status === "Overdue" ? " (overdue)" : ""}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: T.textMuted }}>no history yet</span>
                            )}
                          </td>
                          <td style={s.td}>
                            {p.openActions ? `${p.openActions} open` : "—"}
                            {p.h.overdueActions > 0 && <div style={{ fontSize: 11, color: T.danger }}>{p.h.overdueActions} overdue</div>}
                          </td>
                          <td style={{ ...s.td, color: p.h.recentTopUps >= 3 ? T.danger : undefined, fontWeight: p.h.recentTopUps >= 3 ? 700 : undefined }}>
                            {p.h.recentTopUps || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── single lubrication point ("equipment view" profile) ─────────── */}
      {isLpView && (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.textHighlight }}>{selection.id}</span>
                <SmallBadge T={T} color={healthColor}>{health}</SmallBadge>
              </div>
              <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>{reg?.lubricationPoint || reg?.description || "—"}</div>
              {lpHealth?.reasons.length > 0 && (
                <div style={{ fontSize: 12, color: T[healthColor], marginTop: 4 }} data-testid="health-reasons">
                  {health}: {lpHealth.reasons.map((x) => x.text).join(" · ")}
                </div>
              )}
              {reg?.equipmentId && (
                <button
                  style={{ ...s.btn, padding: "3px 8px", fontSize: 11, marginTop: 8 }}
                  onClick={() => selectEquipmentGroup(reg.equipmentId)}
                >
                  <i className="ti ti-arrow-left" aria-hidden="true" /> View all of {reg.equipmentId}
                </button>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {[reg?.area, reg?.contractor].filter(Boolean).map(tag)}
                <SmallBadge T={T} color={criticalityColor}>Criticality: {criticality}</SmallBadge>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {siblingCount > 1 && (
                <div style={{ ...s.metricCard, textAlign: "center", minWidth: 110 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{siblingCount}</div>
                  <div style={{ fontSize: 10, color: T.textSecondary }}>LP Points on this equipment</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onCreateRoute && (
                  <select
                    style={{ ...s.select, width: "auto" }}
                    aria-label="Create route"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) createRouteFor(selection.id, e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Create Route…</option>
                    <option value="Oil Change">Oil Change route</option>
                    {reg?.oilAnalysisRequired === "Yes" && <option value="Sampling">Sampling route</option>}
                    <option value="Emergency Top Up">Emergency Top Up</option>
                  </select>
                )}
                <button style={s.btn} onClick={() => newActionFor(selection.id)}>
                  <i className="ti ti-clipboard-plus" aria-hidden="true" /> New Action
                </button>
                {canLogByHand && (
                  <button style={s.btn} onClick={handleLogOilChange} disabled={oilChangesForEquip.length === 0} title="Engineers only — with a reason and the oil used">
                    <i className="ti ti-droplet-plus" aria-hidden="true" /> Log by Hand
                  </button>
                )}
                <button style={s.btn} onClick={downloadHistoryPdf} disabled={pdfBusy} data-testid="history-pdf">
                  <i className="ti ti-file-download" aria-hidden="true" /> {pdfBusy ? "Preparing…" : "History PDF"}
                </button>
                {onOpenReport && (
                  <button style={s.btnPrimary} onClick={() => onOpenReport(selection.id)}>
                    <i className="ti ti-file-analytics" aria-hidden="true" /> Full Report
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 14 }}>
            {LP_TABS.map((t) => (
              <button
                key={t.key}
                style={{
                  ...s.btn,
                  background: lpTab === t.key ? T.accent : "transparent",
                  color: lpTab === t.key ? T.accentText : T.textSecondary,
                  borderColor: lpTab === t.key ? T.accent : T.border,
                }}
                onClick={() => setLpTab(t.key)}
              >
                <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
              </button>
            ))}
          </div>

          {lpTab === "overview" && (
            <div>
              <div className="eq-status-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
                <StatusCard T={T} s={s} color={HEALTH_COLOR[health]} icon="ti-heart-rate-monitor" title="Equipment Health" testid="card-health">
                  <BigValue T={T} color={HEALTH_COLOR[health]}>{health}</BigValue>
                  {[
                    { label: "Oil analysis", value: latest?.reportStatus || "No data", color: latest ? statusColorKey(latest.reportStatus) : "textSecondary", tab: "samples" },
                    { label: "Oil change", value: lpOilChangeState?.status || "No data", color: oilChangeOverdue ? "danger" : lpOilChangeState?.status ? "success" : "textSecondary", tab: "changes" },
                    { label: "Top up", value: latestTopUp ? "Logged" : "None", color: "textSecondary", tab: "topups" },
                    { label: "Open actions", value: String(openActions.length), color: openActions.length ? "warning" : "success", tab: "actions" },
                  ].map((row) => (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() => setLpTab(row.tab)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "7px 0",
                        background: "none",
                        border: "none",
                        borderTop: `1px solid ${T.border}`,
                        font: "inherit",
                        fontSize: 13.5,
                        cursor: "pointer",
                        textAlign: "left",
                        color: T.textPrimary,
                      }}
                    >
                      <span style={{ color: T.textSecondary }}>{row.label}</span>
                      <span style={{ color: T[row.color], fontWeight: 700 }}>{row.value}</span>
                    </button>
                  ))}
                </StatusCard>

                <StatusCard T={T} s={s} color={whatsNextColor} icon="ti-calendar-event" title="What's Next" testid="whats-next">
                  {[
                    {
                      label: "Next oil change",
                      value: lpOilChangeState?.nextDueDate ? formatDate(lpOilChangeState.nextDueDate) : reg?.oilChangeInterval ? "no change logged yet" : "as needed",
                      color: oilChangeOverdue ? "danger" : null,
                      extra: oilChangeOverdue ? "overdue" : "",
                    },
                    reg?.oilAnalysisRequired === "Yes" && {
                      label: "Next sample",
                      value: nextSampleDue ? formatDate(nextSampleDue) : latest ? "—" : "never sampled",
                      color: lpHealth?.sampleState?.label === "MISSING" || lpHealth?.sampleState?.label === "OVERDUE" ? "danger" : null,
                      extra: lpHealth?.sampleState?.label === "OVERDUE" ? "overdue" : lpHealth?.sampleState?.label === "MISSING" ? "missing" : "",
                    },
                    {
                      label: "Open route",
                      value: openRoutesForLp.length ? openRoutesForLp.map((r) => `${r.routeName} (${r.status})`).join(", ") : "none",
                      color: null,
                      tab: openRoutesForLp.length ? "routes" : null,
                    },
                    suggestionsForLp.length > 0 && {
                      label: "Suggestion",
                      value: suggestionsForLp.map((sg) => sg.workType).join(", ") + " — needs a route",
                      color: "warning",
                    },
                    labWaiting.length > 0 && {
                      label: "Lab report",
                      value: labWaiting.map((sm) => `${sm.sampleId}: ${sm.validationStatus}`).join(", "),
                      color: "warning",
                      tab: "samples",
                    },
                  ]
                    .filter(Boolean)
                    .map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                        <span style={{ color: T.textSecondary, flexShrink: 0 }}>{row.label}</span>
                        <span
                          style={{ color: row.color ? T[row.color] : T.textPrimary, fontWeight: 700, textAlign: "right", cursor: row.tab ? "pointer" : undefined }}
                          onClick={row.tab ? () => setLpTab(row.tab) : undefined}
                        >
                          {row.value}
                          {row.extra ? ` (${row.extra})` : ""}
                        </span>
                      </div>
                    ))}
                </StatusCard>

                <StatusCard T={T} s={s} color={latest ? statusColorKey(latest.reportStatus) : "textSecondary"} icon="ti-flask" title="Last Oil Sample" onClick={() => setLpTab("samples")} testid="card-sample">
                  {latest ? (
                    <>
                      <BigValue T={T}>{formatDate(latest.sampledDate)}</BigValue>
                      <StatusPill T={T} color={statusColorKey(latest.reportStatus)}>{latest.reportStatus || "No result"}</StatusPill>
                      <Detail T={T}>Sample {latest.sampleId}</Detail>
                    </>
                  ) : (
                    <Empty T={T}>No samples logged{reg?.oilAnalysisRequired === "Yes" ? "" : " — this point is not sampled"}.</Empty>
                  )}
                </StatusCard>

                <StatusCard
                  T={T}
                  s={s}
                  color={oilChangeOverdue ? "danger" : latestChange || lpOilChangeState?.status ? "success" : "textSecondary"}
                  icon="ti-droplet"
                  title="Last Oil Change"
                  onClick={() => setLpTab("changes")}
                  testid="card-change"
                >
                  {latestChange ? (
                    <>
                      <BigValue T={T}>{formatDate(latestChange.eventDate)}</BigValue>
                      <StatusPill T={T} color={oilChangeOverdue ? "danger" : "success"}>{lpOilChangeState?.status || "—"}</StatusPill>
                      <Detail T={T}>
                        {latestChange.quantityUsed} L · {latestChange.oilBrandType}
                      </Detail>
                      {lpOilChangeState?.nextDueDate && <Detail T={T}>Next due {formatDate(lpOilChangeState.nextDueDate)}</Detail>}
                    </>
                  ) : loadingHistory ? (
                    <Empty T={T}>Loading…</Empty>
                  ) : (
                    <Empty T={T}>No oil changes logged.</Empty>
                  )}
                </StatusCard>

                <StatusCard
                  T={T}
                  s={s}
                  color={lpHealth?.recentTopUps >= 3 ? "danger" : latestTopUp ? "info" : "textSecondary"}
                  icon="ti-droplet-plus"
                  title="Last Top Up"
                  onClick={() => setLpTab("topups")}
                  testid="card-topup"
                >
                  {latestTopUp ? (
                    <>
                      <BigValue T={T}>{formatDate(latestTopUp.eventDate)}</BigValue>
                      <Detail T={T}>
                        {latestTopUp.quantity} L · {latestTopUp.reason}
                      </Detail>
                      <Detail T={T} testid="topup-rate">
                        Last 90 days: <strong style={{ color: T.textPrimary }}>{topUpRate.count}</strong> top-up{topUpRate.count === 1 ? "" : "s"},{" "}
                        <strong style={{ color: T.textPrimary }}>{topUpRate.litres} L</strong> ({topUpRate.perMonth} L/month)
                      </Detail>
                      {lpHealth?.recentTopUps >= 3 && (
                        <div style={{ fontSize: 13, color: T.danger, fontWeight: 700, marginTop: 6 }}>
                          <i className="ti ti-alert-triangle" aria-hidden="true" /> {lpHealth.recentTopUps} top-ups in 30 days — possible leak
                        </div>
                      )}
                    </>
                  ) : loadingHistory ? (
                    <Empty T={T}>Loading…</Empty>
                  ) : (
                    <Empty T={T}>No top-ups logged.</Empty>
                  )}
                </StatusCard>
              </div>

              <PointHistory
                reg={reg}
                samples={samplesForEquip}
                sameOilSamples={sameOilSamples}
                changes={changeHistory}
                topUps={topUps}
                nextChangeDue={lpOilChangeState?.nextDueDate || ""}
                nextSampleDue={nextSampleDue}
                onOpenSample={onSelectSample}
                onOpenChanges={() => setLpTab("changes")}
                onOpenTopUps={() => setLpTab("topups")}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
                <RecentTable T={T} s={s} title="Recent Oil Samples" rows={samplesForEquip.slice(0, 5)} columns={["sampledDate", "sampleId", "reportStatus"]} headers={["Date", "Sample ID", "Status"]} />
                <RecentTable T={T} s={s} title="Recent Oil Changes" rows={changeHistory.slice(0, 5)} columns={["eventDate", "quantityUsed", "oilBrandType"]} headers={["Date", "Qty (L)", "Oil"]} />
                <RecentTable T={T} s={s} title="Recent Top Ups" rows={topUps.slice(0, 5)} columns={["eventDate", "quantity", "reason"]} headers={["Date", "Qty (L)", "Reason"]} />
                <RecentTable T={T} s={s} title="Recent Actions" rows={actionsForEquip.slice(0, 5)} columns={["revisionDate", "status", "agreedAction"]} headers={["Date", "Status", "Action"]} />
              </div>
            </div>
          )}

          {lpTab === "samples" && (
            <HistoryTable
              T={T} s={s}
              rows={samplesForEquip}
              empty="No oil samples logged for this lubrication point."
              columns={[
                { key: "sampledDate", label: "Date" },
                { key: "sampleId", label: "Sample ID" },
                { key: "reportStatus", label: "Status", badge: statusColorKey },
              ]}
              renderActions={(sm) => (
                <>
                  {onSelectSample && (
                    <button style={{ ...s.btn, padding: "4px 9px", fontSize: 12 }} onClick={() => onSelectSample(sm)} title="View report">
                      <i className="ti ti-file-analytics" aria-hidden="true" /> Report
                    </button>
                  )}
                  {onEditSample &&
                    // a validated report: ACC Engineers only (it then goes back to Pending Validation)
                    (isAccEngineer || (sm.validationStatus && sm.validationStatus !== "Validated") ? (
                      <button style={{ ...s.btn, padding: "4px 9px", fontSize: 12, marginLeft: 4 }} onClick={() => setEditingSample(sm)} title="Edit sample" aria-label="Edit sample">
                        <i className="ti ti-edit" aria-hidden="true" /> Edit
                      </button>
                    ) : (
                      <span
                        style={{ ...s.btn, padding: "4px 9px", fontSize: 12, marginLeft: 4, opacity: 0.45, cursor: "not-allowed" }}
                        title="Validated — only an ACC Engineer can change it"
                        aria-label="Validated — only an ACC Engineer can change it"
                      >
                        <i className="ti ti-lock" aria-hidden="true" /> Locked
                      </span>
                    ))}
                  {onDeleteSample && (
                    <button
                      style={{ ...s.btn, padding: "4px 9px", fontSize: 12, marginLeft: 4, color: T.danger, borderColor: T.danger }}
                      onClick={() => window.confirm("Delete this sample?") && onDeleteSample(sm)}
                      title="Delete sample"
                    >
                      <i className="ti ti-trash" aria-hidden="true" /> Delete
                    </button>
                  )}
                </>
              )}
            />
          )}

          {lpTab === "changes" &&
            (loadingHistory ? (
              <p style={{ color: T.textSecondary }}>Loading…</p>
            ) : (
              <HistoryTable
                T={T} s={s}
                rows={changeHistory}
                empty="No oil changes logged for this lubrication point."
                columns={[
                  { key: "eventDate", label: "Date" },
                  { key: "quantityUsed", label: "Quantity (L)" },
                  { key: "oilBrandType", label: "Oil" },
                  { key: "doneBy", label: "Done By" },
                  { key: "nextDueDate", label: "Next Due" },
                ]}
              />
            ))}

          {lpTab === "topups" &&
            (loadingHistory ? (
              <p style={{ color: T.textSecondary }}>Loading…</p>
            ) : (
              <HistoryTable
                T={T} s={s}
                rows={topUps}
                empty="No top-ups logged for this lubrication point."
                columns={[
                  { key: "eventDate", label: "Date" },
                  { key: "quantity", label: "Quantity (L)" },
                  { key: "reason", label: "Reason" },
                  { key: "doneBy", label: "Done By" },
                ]}
              />
            ))}

          {lpTab === "actions" && (
            <HistoryTable
              T={T} s={s}
              rows={actionsForEquip}
              empty="No actions logged for this lubrication point."
              columns={[
                { key: "acNo", label: "Ac. No." },
                { key: "status", label: "Status", badge: (st) => STATUS_ACTION_COLOR[st] || "textSecondary" },
                { key: "agreedAction", label: "Agreed Action", render: (a) => a.agreedAction || <span style={{ color: T.textMuted }}>—</span> },
                {
                  key: "dueDate",
                  label: "Due",
                  render: (a) =>
                    a.dueDate ? (
                      <span>
                        {formatDate(a.dueDate)}
                        {isActionOverdue(a) && (
                          <span style={{ marginLeft: 6 }}>
                            <SmallBadge T={T} color="danger">Overdue {actionDaysOverdue(a)}d</SmallBadge>
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    ),
                },
                { key: "assignedTo", label: "Assigned To", render: (a) => a.assignedTo || <span style={{ color: T.textMuted }}>—</span> },
                { key: "contractor", label: "Contractor" },
              ]}
              renderActions={(a) => (
                <button style={{ ...s.btn, padding: "4px 9px", fontSize: 12 }} onClick={() => setEditingAction({ action: a, isNew: false })} title="Edit">
                  <i className="ti ti-edit" aria-hidden="true" /> Edit
                </button>
              )}
            />
          )}

          {lpTab === "routes" &&
            (loadingHistory ? (
              <p style={{ color: T.textSecondary }}>Loading…</p>
            ) : (
              <HistoryTable
                T={T} s={s}
                rows={routesForLp}
                empty="This lubrication point hasn't been on a route yet."
                columns={[
                  { key: "routeName", label: "Route", render: (r) => <span style={{ fontWeight: 600 }}>{r.routeName}</span> },
                  { key: "routeType", label: "Type" },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => (
                      <span>
                        <span style={s.badge(r.status)}>{r.status}</span>
                        {r.returned && <span style={{ marginLeft: 6 }}><SmallBadge T={T} color="danger">Returned</SmallBadge></span>}
                        {r.overdue && <span style={{ marginLeft: 6 }}><SmallBadge T={T} color="danger">Overdue</SmallBadge></span>}
                      </span>
                    ),
                  },
                  { key: "dueDate", label: "Due", render: (r) => (r.dueDate ? formatDate(r.dueDate) : "—") },
                  { key: "assignedTo", label: "Technician", render: (r) => r.assignedTo || <span style={{ color: T.textMuted }}>—</span> },
                  {
                    key: "item",
                    label: "This point",
                    render: (r) =>
                      r.item.implemented === "Yes" ? (
                        <span>
                          Done{r.item.actualQuantity ? ` · ${r.item.actualQuantity} L` : ""}
                          {r.item.oilUsed && <div style={{ fontSize: 11, color: T.textSecondary }}>{r.item.oilUsed}</div>}
                        </span>
                      ) : r.item.implemented === "No" ? (
                        <span style={{ color: T.warning }}>Not done{r.item.notImplementedReason ? ` — ${r.item.notImplementedReason}` : ""}</span>
                      ) : (
                        <span style={{ color: T.textMuted }}>Not reported yet</span>
                      ),
                  },
                ]}
                renderActions={
                  onOpenRoute
                    ? (r) => (
                        <button style={{ ...s.btn, padding: "3px 8px" }} onClick={() => onOpenRoute(r.routineId)} aria-label={`Open route ${r.routeName}`}>
                          Open <i className="ti ti-arrow-right" aria-hidden="true" />
                        </button>
                      )
                    : undefined
                }
              />
            ))}

          {lpTab === "info" && (
            <div style={{ ...s.card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
              {[
                ["Report Equipment ID", reg?.reportEquipmentId],
                ["Lubrication Location", reg?.lubricationLocation],
                ["Point Code", reg?.pointCode],
                ["Type / Position", reg?.position],
                ["Manufacturer", reg?.manufacturer],
                ["Model", reg?.model],
                ["Operating Temp (°C)", reg?.operatingTempC],
                ["Lubricant", reg?.lubricant],
                ["Lubricant Brand", reg?.lubricantBrand],
                ["Quantity (L)", reg?.lubricantQuantityL],
                ["Oil Analysis Required", reg?.oilAnalysisRequired],
                ["Sampling Interval", reg?.interval],
                ["Oil Change Interval", reg?.oilChangeInterval],
                ["Area", reg?.area],
                ["Contractor", reg?.contractor],
                ["Status", reg?.status],
                ["Created Date", reg?.createdDate],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10.5, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{value || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingSample && onEditSample && (
        <EditSampleModal
          sample={editingSample}
          onClose={() => setEditingSample(null)}
          onSave={(updated) => {
            onEditSample(editingSample, updated);
            setEditingSample(null);
          }}
        />
      )}

      {editingAction && (
        <EditActionModal
          action={editingAction.action}
          isNew={editingAction.isNew}
          allActions={actions}
          samples={samples}
          oilChanges={oilChanges}
          equipmentRegistry={registry}
          actionRegistry={actionRegistry}
          onClose={() => setEditingAction(null)}
          onSave={handleSaveAction}
          onDelete={editingAction.isNew ? null : handleDeleteAction}
        />
      )}

      {editingOilChange && (
        <EditOilChangeModal webhookUrl={webhookUrl} oilChange={editingOilChange} onClose={() => setEditingOilChange(null)} onSave={handleSaveOilChange} />
      )}
    </div>
  );
}

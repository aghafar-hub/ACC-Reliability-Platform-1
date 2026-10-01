import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import { statusColor } from "../theme";
import * as api from "../api";
import EditSampleModal from "../components/EditSampleModal";
import EditActionModal from "../components/EditActionModal";
import EditOilChangeModal from "../components/EditOilChangeModal";

const STATUS_ACTION_COLOR = { Open: "danger", "In Progress": "warning", "Waiting Stoppage": "accent", Closed: "success" };

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
  { key: "info", label: "Equipment Info", icon: "ti-info-circle" },
];
const TIMELINE_COLOR = { Change: "accent", Sample: "info", TopUp: "danger" };

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
  if (rows.length === 0) {
    return (
      <div style={s.card}>
        <p style={{ color: T.textSecondary, margin: 0 }}>{empty}</p>
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
                  {c.badge ? <SmallBadge T={T} color={c.badge(r[c.key])}>{r[c.key] ?? "—"}</SmallBadge> : r[c.key] ?? "—"}
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
  initialCode,
  onCodeChange,
}) {
  const { T, s } = useTheme();
  const registry = equipmentRegistry || [];
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
  const groupRows = isEquipmentView ? groups.get(selection.id) || [] : [];

  // ── single lubrication point (unchanged from before the redesign) ──────
  const reg = isLpView ? registry.find((r) => r.code === selection.id) : null;
  const samplesForEquip = isLpView
    ? (samples || []).filter((sm) => sm.unitId === selection.id).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))
    : [];
  const latest = samplesForEquip[0] || null;
  const oilChangesForEquip = isLpView ? (oilChanges || []).filter((o) => o.equipmentCode === selection.id) : [];
  const actionsForEquip = isLpView
    ? (actions || [])
        .filter((a) => (a.equipmentCode || a.unitId) === selection.id)
        .sort((a, b) => new Date(b.revisionDate || b.sampleDate || 0) - new Date(a.revisionDate || a.sampleDate || 0))
    : [];
  const openActionsCount = actionsForEquip.filter((a) => a.status !== "Closed").length;
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
  const healthScore =
    (latest?.reportStatus === "Alert" ? 2 : latest?.reportStatus === "Caution" || latest?.reportStatus === "Warning" ? 1 : 0) +
    (oilChangeOverdue ? 2 : 0) +
    (openActions.length > 0 ? 1 : 0);
  const health = healthScore >= 3 ? "Poor" : healthScore >= 1 ? "Fair" : "Good";
  const healthColor = health === "Poor" ? "danger" : health === "Fair" ? "warning" : "success";
  const siblingCount = isLpView ? (groups.get(reg?.equipmentId)?.length || 0) : 0;

  const lpTimeline = useMemo(() => {
    if (!isLpView) return [];
    const events = [];
    changeHistory.forEach((c) => events.push({ type: "Change", date: c.eventDate, label: `${c.quantityUsed || "—"} L`, detail: c.oilBrandType }));
    samplesForEquip.forEach((sm) => events.push({ type: "Sample", date: sm.sampledDate, label: sm.reportStatus || "—", detail: sm.sampleId }));
    topUps.forEach((t) => events.push({ type: "TopUp", date: t.eventDate, label: `${t.quantity || "—"} L`, detail: t.reason }));
    return events.filter((e) => e.date).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLpView, changeHistory, samplesForEquip, topUps]);

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
      return {
        reg: r,
        samples: pointSamples,
        latest: pointSamples[0] || null,
        oilChange: pointOilChange,
        actions: pointActions,
        openActions: pointActions.filter((a) => a.status !== "Closed").length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEquipmentView, groupRows, samples, oilChanges, actions]);

  const totalSamples = pointSummaries.reduce((sum, p) => sum + p.samples.length, 0);
  const totalOpenActions = pointSummaries.reduce((sum, p) => sum + p.openActions, 0);
  const worst = pointSummaries.reduce((acc, p) => {
    if (!p.latest) return acc;
    const sev = STATUS_SEVERITY[p.latest.reportStatus] || 1;
    return !acc || sev > acc.sev ? { status: p.latest.reportStatus, sev } : acc;
  }, null);
  const soonestNextDue = pointSummaries
    .map((p) => p.oilChange)
    .filter((o) => o?.nextDueDate)
    .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))[0];

  function handleLogOilChange() {
    if (oilChangesForEquip.length === 0) return;
    setEditingOilChange(nextDue || oilChangesForEquip[0]);
  }
  function handleLogOilChangeFor(lpCode) {
    const entry = oilChangeEntryFor(lpCode);
    if (entry) setEditingOilChange(entry);
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
          padding: selection ? "0 0 20px" : "40px 20px 30px",
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
            <p style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: T.textPrimary }}>Find any piece of equipment</p>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 auto 22px", maxWidth: 440 }}>
              Search by equipment code for the full combined picture, or by a specific LP_ID for just that lubrication point.
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
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, maxWidth: 760, margin: "0 auto" }}
        >
          {[
            ["ti-timeline", "Sample timeline", "Every reading for every lubrication point, newest first, with severity at a glance."],
            ["ti-droplet", "Oil change history", "Every lubrication point — last change, next due, and how overdue it is."],
            ["ti-clipboard-check", "Actions taken", "Every action ever raised for this equipment, with status and outcome."],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ ...s.card, marginBottom: 0 }}>
              <i className={`ti ${icon}`} style={{ color: T.accent, fontSize: 18, marginBottom: 8, display: "block" }} aria-hidden="true" />
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{title}</div>
              <div style={{ fontSize: 11.5, color: T.textSecondary, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
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
                {pointActionControl("Log Oil Change", "ti-droplet-plus", handleLogOilChangeFor)}
                {pointActionControl("New Action", "ti-clipboard-plus", (lpCode) =>
                  setEditingAction({ action: { equipmentCode: lpCode }, isNew: true })
                )}
                {onOpenReport && pointActionControl("Full Report", "ti-file-analytics", onOpenReport)}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 18 }}>
              {[
                ["Total Samples", totalSamples, null],
                ["Worst Result", worst ? worst.status : "—", worst ? statusColor(T, worst.status) : null],
                ["Open Actions", totalOpenActions, totalOpenActions > 0 ? T.danger : T.success],
                [
                  "Next Oil Change",
                  soonestNextDue ? formatDate(soonestNextDue.nextDueDate) : "—",
                  soonestNextDue?.status === "Overdue" ? T.danger : null,
                  soonestNextDue?.lubricationPoint,
                ],
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
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pointSummaries.map((p) => (
                  <div
                    key={p.reg.code}
                    style={{
                      background: T.cardSubBg,
                      border: `1px solid ${T.border2}`,
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: T.accent }}>{p.reg.code}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.reg.lubricationPoint || p.reg.description}</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 3 }}>
                          {p.reg.lubricant || "—"}
                          {p.reg.oilAnalysisRequired === "Yes" ? " · oil analysis tracked" : " · oil change / actions only"}
                        </div>
                      </div>
                      <button style={{ ...s.btn, padding: "4px 10px", fontSize: 11.5 }} onClick={() => selectLp(p.reg.code)}>
                        Open point <i className="ti ti-arrow-right" aria-hidden="true" />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ color: T.textMuted }}>Latest sample: </span>
                        {p.latest ? (
                          <span style={s.badge(p.latest.reportStatus)}>
                            {p.latest.reportStatus} · {formatDate(p.latest.sampledDate)}
                          </span>
                        ) : (
                          <span style={{ color: T.textMuted }}>{p.reg.oilAnalysisRequired === "Yes" ? "none yet" : "not tracked"}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ color: T.textMuted }}>Oil change: </span>
                        {p.oilChange?.changeDate ? (
                          <span style={{ color: p.oilChange.status === "Overdue" ? T.danger : T.textPrimary, fontWeight: 600 }}>
                            last {formatDate(p.oilChange.changeDate)}
                            {p.oilChange.nextDueDate ? `, next due ${formatDate(p.oilChange.nextDueDate)}` : ""}
                          </span>
                        ) : (
                          <span style={{ color: T.textMuted }}>no history yet</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5 }}>
                        <span style={{ color: T.textMuted }}>Actions: </span>
                        <span style={{ color: p.openActions > 0 ? T.danger : T.textPrimary, fontWeight: 600 }}>
                          {p.openActions > 0 ? `${p.openActions} open` : p.actions.length > 0 ? "none open" : "none"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
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
                <button style={s.btn} onClick={handleLogOilChange} disabled={oilChangesForEquip.length === 0}>
                  <i className="ti ti-droplet-plus" aria-hidden="true" /> Log Oil Change
                </button>
                <button style={s.btn} onClick={() => setEditingAction({ action: { equipmentCode: selection.id }, isNew: true })}>
                  <i className="ti ti-clipboard-plus" aria-hidden="true" /> New Action
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 20 }}>
                <div style={s.card}>
                  <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Equipment Health Status</p>
                  {[
                    { label: "Oil Analysis", value: latest?.reportStatus || "No data", color: latest ? statusColorKey(latest.reportStatus) : "textMuted" },
                    { label: "Oil Change", value: lpOilChangeState?.status || "No data", color: oilChangeOverdue ? "danger" : "success" },
                    { label: "Top Up", value: latestTopUp ? "Logged" : "None", color: "textSecondary" },
                    { label: "Open Actions", value: String(openActions.length), color: openActions.length ? "warning" : "success" },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ color: T.textSecondary }}>{row.label}</span>
                      <span style={{ color: T[row.color], fontWeight: 700 }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div style={s.card}>
                  <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-flask" aria-hidden="true" /> Last Oil Sample</p>
                  {latest ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatDate(latest.sampledDate)}</div>
                      <SmallBadge T={T} color={statusColorKey(latest.reportStatus)}>{latest.reportStatus}</SmallBadge>
                      <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>Sample {latest.sampleId}</div>
                    </>
                  ) : (
                    <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No samples logged.</p>
                  )}
                </div>

                <div style={s.card}>
                  <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-droplet" aria-hidden="true" /> Last Oil Change</p>
                  {latestChange ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatDate(latestChange.eventDate)}</div>
                      <SmallBadge T={T} color={oilChangeOverdue ? "danger" : "success"}>{lpOilChangeState?.status || "—"}</SmallBadge>
                      <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>{latestChange.quantityUsed} L · {latestChange.oilBrandType}</div>
                    </>
                  ) : loadingHistory ? (
                    <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
                  ) : (
                    <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No oil changes logged.</p>
                  )}
                </div>

                <div style={s.card}>
                  <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-droplet-plus" aria-hidden="true" /> Last Top Up</p>
                  {latestTopUp ? (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatDate(latestTopUp.eventDate)}</div>
                      <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>{latestTopUp.quantity} L · {latestTopUp.reason}</div>
                    </>
                  ) : loadingHistory ? (
                    <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
                  ) : (
                    <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No top-ups logged.</p>
                  )}
                </div>
              </div>

              <div style={{ ...s.card, marginBottom: 20 }}>
                <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Lubrication Timeline</p>
                {lpTimeline.length === 0 ? (
                  <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No lubrication activity logged yet.</p>
                ) : (
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                    {lpTimeline.map((e, i) => (
                      <div
                        key={i}
                        style={{
                          flex: "0 0 auto",
                          minWidth: 110,
                          border: `1px solid ${T[TIMELINE_COLOR[e.type]]}`,
                          borderRadius: 8,
                          padding: "8px 10px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: T[TIMELINE_COLOR[e.type]] }}>{e.type}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, margin: "4px 0" }}>{formatDate(e.date)}</div>
                        <div style={{ fontSize: 10.5, color: T.textSecondary }}>{e.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                    <button style={{ ...s.btn, padding: "3px 7px" }} onClick={() => onSelectSample(sm)} title="View report">
                      <i className="ti ti-file-analytics" aria-hidden="true" />
                    </button>
                  )}
                  {onEditSample && (
                    <button style={{ ...s.btn, padding: "3px 7px", marginLeft: 4 }} onClick={() => setEditingSample(sm)} title="Edit sample">
                      <i className="ti ti-edit" aria-hidden="true" />
                    </button>
                  )}
                  {onDeleteSample && (
                    <button
                      style={{ ...s.btn, padding: "3px 7px", marginLeft: 4, color: T.danger, borderColor: T.danger }}
                      onClick={() => window.confirm("Delete this sample?") && onDeleteSample(sm)}
                      title="Delete sample"
                    >
                      <i className="ti ti-trash" aria-hidden="true" />
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
                { key: "revisionDate", label: "Date" },
                { key: "status", label: "Status", badge: () => "textSecondary" },
                { key: "agreedAction", label: "Action" },
                { key: "contractor", label: "Contractor" },
              ]}
              renderActions={(a) => (
                <button style={{ ...s.btn, padding: "3px 7px" }} onClick={() => setEditingAction({ action: a, isNew: false })} title="Edit">
                  <i className="ti ti-edit" aria-hidden="true" />
                </button>
              )}
            />
          )}

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
        <EditOilChangeModal oilChange={editingOilChange} onClose={() => setEditingOilChange(null)} onSave={handleSaveOilChange} />
      )}
    </div>
  );
}

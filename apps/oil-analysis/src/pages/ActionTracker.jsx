import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import EquipmentSearch from "../components/EquipmentSearch";
import EditActionModal from "../components/EditActionModal";
import GenerateMonthlyActionsModal from "../components/GenerateMonthlyActionsModal";

const STATUS_COLOR_KEY = { Open: "danger", "In Progress": "warning", "Waiting Stoppage": "accent", Closed: "success" };
const COLUMNS = ["Open", "In Progress", "Waiting Stoppage", "Closed"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// SVG donut-slice path — same math Dashboard.jsx's own status donut uses.
function arcPath(startFrac, fracLen, radius, cx, cy) {
  if (fracLen <= 0) return "";
  const start = startFrac * 2 * Math.PI - Math.PI / 2;
  const end = (startFrac + fracLen) * 2 * Math.PI - Math.PI / 2;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const largeArc = fracLen > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function ageDays(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}
function ageColor(T, days) {
  if (days == null) return T.textMuted;
  if (days > 14) return T.danger;
  if (days >= 7) return T.warning;
  return T.success;
}

// This page renders a Kanban board grouped by status rather than
// EQUIPMENT — Equipment's own tab already shows one equipment's full
// action history in context, so this page's job is cross-equipment triage:
// what's open, what's aging, what needs a decision today. It is wired to
// the exact same `actions` array and the exact same
// onAddAction/onUpdateAction/onDeleteAction callbacks the Oil Analysis
// Report page uses (both passed down from App's lifted state) — that
// shared wiring, plus the verified writes in api.js, is what actually
// fixes the original sync bug.
export default function ActionTracker({
  actions,
  samples,
  oilChanges,
  equipmentRegistry,
  actionRegistry,
  onAddAction,
  onUpdateAction,
  onDeleteAction,
}) {
  const { T, s } = useTheme();
  const [equipCode, setEquipCode] = useState("");
  const [month, setMonth] = useState("All");
  const [year, setYear] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const registry = equipmentRegistry || [];
  const registryByCode = useMemo(() => {
    const map = {};
    registry.forEach((r) => (map[r.code] = r));
    return map;
  }, [registry]);
  const areas = ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean)))];
  const contractors = ["All", ...Array.from(new Set(registry.map((r) => r.contractor).filter(Boolean)))];
  const years = [
    "All",
    ...Array.from(
      new Set(actions.map((a) => (a.revisionDate ? new Date(a.revisionDate).getFullYear().toString() : null)).filter(Boolean))
    ).sort((a, b) => b - a),
  ];

  function matchesFilters(a) {
    const code = a.equipmentCode || a.unitId || "";
    if (equipCode && code !== equipCode) return false;
    const reg = registryByCode[code];
    if (areaFilter !== "All" && reg?.area !== areaFilter) return false;
    if (contractorFilter !== "All" && reg?.contractor !== contractorFilter) return false;
    const d = a.revisionDate ? new Date(a.revisionDate) : null;
    if (month !== "All" && (!d || d.getMonth() !== parseInt(month, 10))) return false;
    if (year !== "All" && (!d || d.getFullYear().toString() !== year)) return false;
    return true;
  }

  const hasFilters = equipCode || areaFilter !== "All" || contractorFilter !== "All" || month !== "All" || year !== "All";
  const visible = actions.filter(matchesFilters);

  const statusCounts = COLUMNS.reduce((acc, st) => ({ ...acc, [st]: actions.filter((a) => a.status === st).length }), {});
  const totalActions = actions.length || 1;
  let acc = 0;
  const donutArcs = COLUMNS.map((st) => {
    const frac = statusCounts[st] / totalActions;
    const path = arcPath(acc, frac, 44, 50, 50);
    acc += frac;
    return { st, path };
  });

  function columnItems(status) {
    const list = visible.filter((a) => a.status === status);
    if (status === "Closed") {
      return list.sort((x, y) => new Date(y.completedDate || y.revisionDate || 0) - new Date(x.completedDate || x.revisionDate || 0));
    }
    return list.sort((x, y) => (ageDays(y.revisionDate) ?? -1) - (ageDays(x.revisionDate) ?? -1));
  }

  async function handleSave(updated) {
    setSaving(true);
    try {
      if (editing.isNew) await onAddAction(updated);
      else await onUpdateAction(updated);
      setEditing(null);
    } catch {
      // toast already shown by App
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await onDeleteAction(editing.action);
      setEditing(null);
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  }

  async function handleDrop(newStatus) {
    setDragOverCol(null);
    const action = actions.find((a) => a._id === draggedId);
    setDraggedId(null);
    if (!action || action.status === newStatus) return;
    const equipCodeVal = action.equipmentCode || action.unitId || "";
    const payload = {
      ...action,
      status: newStatus,
      equipmentCode: equipCodeVal,
      // Mirrors EditActionModal's own save rule: a Closing Comment only
      // makes sense once the action is actually Closed.
      closingComment: newStatus === "Closed" ? action.closingComment || "" : "",
      _matchCols: action._matchCols || [0, 1],
      _matchValues: action._matchValues || [action.acNo, equipCodeVal],
    };
    try {
      await onUpdateAction(payload);
    } catch {
      // toast already shown by App
    }
  }

  return (
    <div>
      <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", padding: "16px 20px" }}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          {donutArcs.map(({ st, path }) => path && <path key={st} d={path} fill={T[STATUS_COLOR_KEY[st]]} opacity="0.92" />)}
          <circle cx="50" cy="50" r="29" fill={T.cardBg} />
          <text x="50" y="47" textAnchor="middle" fontSize="17" fontWeight="800" fill={T.textPrimary}>
            {actions.length}
          </text>
          <text x="50" y="61" textAnchor="middle" fontSize="8" fill={T.textSecondary}>
            actions
          </text>
        </svg>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>Status Breakdown</div>
          {COLUMNS.map((st) => (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: T[STATUS_COLOR_KEY[st]], flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.textSecondary, width: 108, flexShrink: 0 }}>{st}</span>
              <div style={{ flex: 1, height: 7, borderRadius: 4, background: T.border, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(statusCounts[st] / totalActions) * 100}%`,
                    height: "100%",
                    background: T[STATUS_COLOR_KEY[st]],
                    borderRadius: 4,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: T[STATUS_COLOR_KEY[st]], minWidth: 18, textAlign: "right" }}>
                {statusCounts[st]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
        <EquipmentSearch
          options={registry}
          value={equipCode || "All"}
          onChange={(v) => setEquipCode(v === "All" ? "" : v)}
          allowAll
          width={220}
          placeholder="All Equipment"
        />
        <select style={{ ...s.select, minWidth: 110, fontSize: 12 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="All">All Months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <select style={{ ...s.select, minWidth: 90, fontSize: 12 }} value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        {areas.length > 1 &&
          areas.map((a) => (
            <button
              key={a}
              style={{
                ...s.btn,
                fontSize: 12,
                background: areaFilter === a ? T.accent : "transparent",
                color: areaFilter === a ? T.accentText : T.textSecondary,
                borderColor: areaFilter === a ? T.accent : T.border,
              }}
              onClick={() => setAreaFilter(a)}
            >
              {a}
            </button>
          ))}
        {contractors.length > 1 &&
          contractors.map((c) => (
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
        {hasFilters && (
          <button
            style={{ ...s.btn, fontSize: 12, color: T.danger, borderColor: T.danger }}
            onClick={() => {
              setEquipCode("");
              setMonth("All");
              setYear("All");
              setAreaFilter("All");
              setContractorFilter("All");
            }}
          >
            <i className="ti ti-x" aria-hidden="true" /> Clear
          </button>
        )}
        <button style={{ ...s.btn, marginLeft: "auto" }} onClick={() => setGenerating(true)}>
          <i className="ti ti-calendar-plus" aria-hidden="true" /> Generate Monthly Actions
        </button>
        <button style={s.btnPrimary} onClick={() => setEditing({ action: { equipmentCode: "" }, isNew: true })}>
          <i className="ti ti-plus" aria-hidden="true" /> Add Action
        </button>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
        {hasFilters
          ? `Showing ${visible.length} of ${actions.length} actions`
          : `${actions.length} actions · drag a card to change its status`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(230px,1fr))", gap: 14, overflowX: "auto" }}>
        {COLUMNS.map((status) => {
          const items = columnItems(status);
          const isDragOver = dragOverCol === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(status);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              style={{
                borderRadius: 10,
                background: isDragOver ? T.navActive : "transparent",
                minHeight: 60,
                transition: "background 0.12s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 4px 10px",
                  borderBottom: `2px solid ${T[STATUS_COLOR_KEY[status]]}`,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: T[STATUS_COLOR_KEY[status]],
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {status}
                </span>
                <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{items.length}</span>
              </div>

              {items.length === 0 && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: T.textMuted,
                    textAlign: "center",
                    padding: "16px 6px",
                    border: `1px dashed ${T.border}`,
                    borderRadius: 8,
                  }}
                >
                  No actions here
                </div>
              )}

              {items.map((a) => {
                const code = a.equipmentCode || a.unitId || "";
                const reg = registryByCode[code];
                const days = ageDays(a.revisionDate);
                return (
                  <div
                    key={a._id}
                    draggable
                    onDragStart={() => setDraggedId(a._id)}
                    onDragEnd={() => setDraggedId(null)}
                    onClick={() => setEditing({ action: a, isNew: false })}
                    style={{
                      ...s.card,
                      marginBottom: 10,
                      padding: "12px 13px",
                      borderLeft: `3px solid ${T[STATUS_COLOR_KEY[status]]}`,
                      cursor: "grab",
                      opacity: draggedId === a._id ? 0.4 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12.5, color: T.accent }}>{code}</span>
                      {reg?.area && (
                        <span
                          style={{ fontSize: 9.5, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}
                        >
                          {reg.area}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{a.description || "—"}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: T.textPrimary,
                        marginTop: 8,
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {a.agreedAction || "—"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      {status === "Closed" ? (
                        <span style={{ fontSize: 10.5, color: T.textMuted }}>Completed {formatDate(a.completedDate) || "—"}</span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: ageColor(T, days) + "22",
                            color: ageColor(T, days),
                          }}
                        >
                          {days == null ? "—" : `${days}d open`}
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, fontFamily: "monospace", color: T.textMuted }}>{a.acNo}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {editing && (
        <EditActionModal
          action={editing.action}
          isNew={editing.isNew}
          allActions={actions}
          samples={samples}
          oilChanges={oilChanges}
          equipmentRegistry={registry}
          actionRegistry={actionRegistry}
          saving={saving}
          onClose={() => !saving && setEditing(null)}
          onSave={handleSave}
          onDelete={editing.isNew ? null : handleDelete}
        />
      )}

      {generating && (
        <GenerateMonthlyActionsModal
          samples={samples}
          actions={actions}
          equipmentRegistry={registry}
          oilChanges={oilChanges}
          onAddAction={onAddAction}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  );
}

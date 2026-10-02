import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import EquipmentSearch from "../components/EquipmentSearch";
import EditActionModal from "../components/EditActionModal";
import GenerateMonthlyActionsModal from "../components/GenerateMonthlyActionsModal";
import MobileFilterToggle from "../components/MobileFilterToggle";
import useIsMobile from "../hooks/useIsMobile";

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
  const isMobile = useIsMobile();
  // Collapsed by default on mobile only — equipment search + month/year
  // dropdowns + area chips + contractor chips stacked several rows above
  // the kanban on a phone (the Patch 35 mobile audit's own finding).
  const [filtersOpen, setFiltersOpen] = useState(!isMobile);
  const [equipCode, setEquipCode] = useState("");
  const [month, setMonth] = useState("All");
  const [year, setYear] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  // Mobile only (<=860px, see the .dash-table-desktop/.dash-table-mobile
  // toggle below) — the 4-column kanban grid only ever showed ~1.5 columns
  // on a phone screen with no hint the rest could be reached by swiping
  // (the Patch 35 mobile audit's own finding), and drag-and-drop between
  // columns that are mostly off-screen isn't practical on touch anyway. A
  // status is still changed on mobile the same way editing any other field
  // is — tap the card, change Status in the modal, Save — so this tab just
  // picks which one column's cards to list, full width, one at a time.
  const [mobileStatusTab, setMobileStatusTab] = useState("Open");

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

  // Shared by the desktop 4-column grid and the mobile single-column list
  // below, so both stay in sync by construction instead of two near-copies
  // of the same card markup drifting apart over time.
  function renderActionCard(a, status) {
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
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>
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
        {status !== "Closed" && (
          <div style={{ marginTop: 6 }}>
            {a.assignedTo ? (
              <span style={{ fontSize: 10.5, color: T.textSecondary }}>
                <i className="ti ti-user" aria-hidden="true" style={{ marginRight: 3 }} /> {a.assignedTo}
              </span>
            ) : (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.danger }}>
                <i className="ti ti-alert-triangle" aria-hidden="true" style={{ marginRight: 3 }} /> No owner assigned
              </span>
            )}
          </div>
        )}
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
              {days != null && days > 14 ? `⚠ ${days}d overdue` : days == null ? "—" : `${days}d open`}
            </span>
          )}
          <span style={{ fontSize: 10.5, fontFamily: "monospace", color: T.textMuted }}>{a.acNo}</span>
        </div>
      </div>
    );
  }

  // PERFORMANCE: onAddAction/onUpdateAction/onDeleteAction (App.jsx) already
  // apply the change to local state immediately and only verify/roll back
  // in the background — see those functions' own comments. Not awaiting
  // them here, and closing the modal right away, is what makes this feel
  // instant instead of sitting on "Saving…" for the network round trip. A
  // failure surfaces a moment later via the toast those handlers already
  // show, with the optimistic change rolled back the same way.
  function handleSave(updated) {
    if (editing.isNew) onAddAction(updated).catch(() => {});
    else onUpdateAction(updated).catch(() => {});
    setEditing(null);
  }

  function handleDelete() {
    onDeleteAction(editing.action).catch(() => {});
    setEditing(null);
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

      {/* Single row, unchanged in structure/order from before this patch —
          isMobile is false on desktop so filtersOpen defaults true there
          and this renders exactly as it always has. Only on a phone does
          the toggle appear and the filter controls become collapsible;
          the two action buttons stay in their original position/order
          either way, just with the filters between them collapsed away. */}
      <div style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap", alignItems: "center" }}>
        {isMobile && (
          <MobileFilterToggle
            open={filtersOpen}
            onToggle={() => setFiltersOpen((o) => !o)}
            activeCount={
              (equipCode ? 1 : 0) + (month !== "All" ? 1 : 0) + (year !== "All" ? 1 : 0) + (areaFilter !== "All" ? 1 : 0) + (contractorFilter !== "All" ? 1 : 0)
            }
          />
        )}
        {filtersOpen && (
          <>
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
          </>
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

      {/* Desktop: the 4-column drag-and-drop kanban, unchanged. Mobile
          (<=860px, see App.jsx's .dash-table-desktop/.dash-table-mobile
          toggle): only ~1.5 columns ever fit a phone screen with nothing
          hinting the rest were a swipe away, and cross-column drag isn't
          practical when most columns are off-screen (the Patch 35 mobile
          audit's own finding) — a status tab row plus one full-width
          column at a time instead; status still changes the same way any
          other field does, by tapping a card into the edit modal. */}
      <div className="dash-table-desktop" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(230px,1fr))", gap: 14, overflowX: "auto" }}>
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

              {items.map((a) => renderActionCard(a, status))}
            </div>
          );
        })}
      </div>

      <div className="dash-table-mobile" style={{ flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {COLUMNS.map((status) => (
            <button
              key={status}
              style={{
                ...s.btn,
                fontSize: 12,
                background: mobileStatusTab === status ? T[STATUS_COLOR_KEY[status]] : "transparent",
                color: mobileStatusTab === status ? "#fff" : T.textSecondary,
                borderColor: mobileStatusTab === status ? T[STATUS_COLOR_KEY[status]] : T.border,
              }}
              onClick={() => setMobileStatusTab(status)}
            >
              {status} ({columnItems(status).length})
            </button>
          ))}
        </div>
        {columnItems(mobileStatusTab).length === 0 ? (
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
        ) : (
          columnItems(mobileStatusTab).map((a) => renderActionCard(a, mobileStatusTab))
        )}
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
          onClose={() => setEditing(null)}
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

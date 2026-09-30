import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate, sampleTriggerReadings } from "../parsers";
import { statusColor } from "../theme";
import EditSampleModal from "../components/EditSampleModal";
import EditActionModal from "../components/EditActionModal";
import EditOilChangeModal from "../components/EditOilChangeModal";

const STATUS_ACTION_COLOR = { Open: "danger", "In Progress": "warning", "Waiting Stoppage": "accent", Closed: "success" };

// Severity ranking for picking the "worst" status across several
// lubrication points' latest samples — higher wins.
const STATUS_SEVERITY = { Alert: 3, Caution: 2, Warning: 2, Normal: 1 };

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

      {/* ── single lubrication point ──────────────────────────────────── */}
      {isLpView && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.textHighlight }}>{selection.id}</span>
                  {latest ? (
                    <span style={s.badge(latest.reportStatus)}>
                      {latest.reportStatus === "Alert" && <span style={{ ...s.alertPulse, marginRight: 5 }} />}
                      {latest.reportStatus} · {formatDate(latest.sampledDate)}
                    </span>
                  ) : (
                    <span style={{ ...s.badge(), background: T.cardSubBg, color: T.textMuted }}>No samples yet</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>{reg?.description || "—"}</div>
                {reg?.equipmentId && (
                  <button
                    style={{ ...s.btn, padding: "3px 8px", fontSize: 11, marginTop: 8 }}
                    onClick={() => selectEquipmentGroup(reg.equipmentId)}
                  >
                    <i className="ti ti-arrow-left" aria-hidden="true" /> View all of {reg.equipmentId}
                  </button>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{[reg?.area, reg?.contractor].filter(Boolean).map(tag)}</div>
              </div>
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 18 }}>
              {[
                ["Total Samples", samplesForEquip.length, null],
                ["Latest Result", latest ? latest.reportStatus : "—", latest ? statusColor(T, latest.reportStatus) : null],
                ["Open Actions", openActionsCount, openActionsCount > 0 ? T.danger : T.success],
                [
                  "Next Oil Change",
                  nextDue ? formatDate(nextDue.nextDueDate) : "—",
                  nextDue?.status === "Overdue" ? T.danger : null,
                  nextDue?.lubricationPoint,
                ],
              ].map(([label, val, color, sub]) => (
                <div
                  key={label}
                  style={{ background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "11px 13px" }}
                >
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
              {sectionLabel("ti-info-square-rounded", "Registry Details")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "14px 20px" }}>
                {[
                  ["Report Equipment ID", reg?.reportEquipmentId],
                  ["Position", reg?.position],
                  ["Manufacturer", reg?.manufacturer],
                  ["Model", reg?.model],
                  ["Lubricant", reg?.lubricant],
                  ["Change Interval", reg?.oilChangeInterval],
                  ["Area", reg?.area],
                  ["Contractor", reg?.contractor],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12.5, color: T.textPrimary, fontWeight: 500 }}>{v || "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {cardSection(
            <>
              {sectionLabel("ti-timeline", "Sample Timeline", samplesForEquip.length)}
              {samplesForEquip.length === 0 ? (
                <div style={{ color: T.textMuted, fontSize: 12.5 }}>No samples recorded for this equipment.</div>
              ) : (
                samplesForEquip.map((sm, i) => {
                  const color = statusColor(T, sm.reportStatus);
                  const isFlagged = sm.reportStatus === "Alert" || sm.reportStatus === "Caution" || sm.reportStatus === "Warning";
                  const triggers = isFlagged ? sampleTriggerReadings(sm) : [];
                  return (
                    <div
                      key={sm._id || i}
                      style={{
                        display: "flex",
                        gap: 11,
                        padding: i === 0 ? "0 0 10px" : "10px 0",
                        borderBottom: i < samplesForEquip.length - 1 ? `1px solid ${T.border2}` : "none",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        {i < samplesForEquip.length - 1 && <span style={{ width: 1.5, flex: 1, background: T.border, marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 12.5 }}>{formatDate(sm.sampledDate)}</span>
                          <span style={s.badge(sm.reportStatus)}>{sm.reportStatus}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 5, display: "flex", flexWrap: "wrap", gap: 12 }}>
                          <span>
                            ID: <span style={{ fontFamily: "monospace", color: T.accent }}>{sm.sampleId || "—"}</span>
                          </span>
                          {triggers.length > 0
                            ? triggers.map((t) => (
                                <span key={t.label}>
                                  {t.label}:{" "}
                                  <span style={{ color: T.danger, fontWeight: 700 }}>
                                    {t.value}
                                    {t.unit ? ` ${t.unit}` : ""}
                                  </span>
                                </span>
                              ))
                            : [
                                <span key="visc">Visc: {sm.visc40C ?? "—"} cSt</span>,
                                <span key="fe">Fe: {sm.wear?.Fe ?? "—"} ppm</span>,
                                <span key="si">Si: {sm.contaminants?.Si ?? "—"} ppm</span>,
                                <span key="water">Water: {sm.water ?? "—"}</span>,
                              ]}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        {onSelectSample && (
                          <button style={{ ...s.btn, padding: "3px 7px" }} onClick={() => onSelectSample(sm)} title="View report">
                            <i className="ti ti-file-analytics" aria-hidden="true" />
                          </button>
                        )}
                        {onEditSample && (
                          <button style={{ ...s.btn, padding: "3px 7px" }} onClick={() => setEditingSample(sm)} title="Edit sample">
                            <i className="ti ti-edit" aria-hidden="true" />
                          </button>
                        )}
                        {onDeleteSample && (
                          <button
                            style={{ ...s.btn, padding: "3px 7px", color: T.danger, borderColor: T.danger }}
                            onClick={() => window.confirm("Delete this sample?") && onDeleteSample(sm)}
                            title="Delete sample"
                          >
                            <i className="ti ti-trash" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {cardSection(
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
              <div>
                {sectionLabel("ti-droplet", "Oil Change History", oilChangesForEquip.length)}
                {oilChangesForEquip.length === 0 ? (
                  <div style={{ color: T.textMuted, fontSize: 12.5 }}>No oil change history for this equipment.</div>
                ) : (
                  oilChangesForEquip.map((oc, i) => (
                    <div
                      key={oc._id || i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: i === 0 ? "0 0 10px" : "10px 0",
                        borderBottom: i < oilChangesForEquip.length - 1 ? `1px solid ${T.border2}` : "none",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{oc.lubricationPoint}</div>
                        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>
                          {oc.oilType} · last changed {formatDate(oc.changeDate) || "—"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: oc.status === "Overdue" ? T.danger : T.textPrimary }}>
                          {formatDate(oc.nextDueDate) || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: T.textMuted }}>next due</div>
                      </div>
                      <button style={{ ...s.btn, padding: "3px 7px" }} onClick={() => setEditingOilChange(oc)} title="Edit">
                        <i className="ti ti-edit" aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div>
                {sectionLabel("ti-clipboard-check", "Actions Taken", actionsForEquip.length)}
                {actionsForEquip.length === 0 ? (
                  <div style={{ color: T.textMuted, fontSize: 12.5 }}>No actions recorded for this equipment.</div>
                ) : (
                  actionsForEquip.map((a, i) => (
                    <div
                      key={a._id || i}
                      style={{
                        padding: i === 0 ? "0 0 10px" : "10px 0",
                        borderBottom: i < actionsForEquip.length - 1 ? `1px solid ${T.border2}` : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: T.textMuted }}>{a.acNo}</span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: T[STATUS_ACTION_COLOR[a.status]] + "22",
                            color: T[STATUS_ACTION_COLOR[a.status]] || T.textSecondary,
                          }}
                        >
                          {a.status}
                        </span>
                        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>{formatDate(a.revisionDate)}</span>
                        <button
                          style={{ ...s.btn, padding: "2px 6px" }}
                          onClick={() => setEditingAction({ action: a, isNew: false })}
                          title="Edit"
                        >
                          <i className="ti ti-edit" aria-hidden="true" />
                        </button>
                      </div>
                      <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>{a.agreedAction || "—"}</div>
                    </div>
                  ))
                )}
              </div>
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

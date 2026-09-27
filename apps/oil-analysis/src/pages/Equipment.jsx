import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate, sampleTriggerReadings } from "../parsers";
import { statusColor } from "../theme";
import EditSampleModal from "../components/EditSampleModal";
import EditActionModal from "../components/EditActionModal";
import EditOilChangeModal from "../components/EditOilChangeModal";

const STATUS_ACTION_COLOR = { Open: "danger", "In Progress": "warning", "Waiting Stoppage": "accent", Closed: "success" };

// Single search box up top, then everything about the selected equipment —
// registry details, sample timeline, oil change history, actions taken —
// in one continuous card below it. Replaces the old two-tab
// (Registry / Sample History) accordion-list layout; approved design at
// https://claude.ai/code/artifact/718df601-b12d-4a89-a159-dcf0090b9bf7.
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
  const [code, setCode] = useState(initialCode || "");

  // Keep the parent in sync so Back-from-report can restore this same
  // equipment view instead of re-mounting to a blank search box.
  function setCodeSynced(c) {
    setCode(c);
    if (onCodeChange) onCodeChange(c);
  }
  const [editingSample, setEditingSample] = useState(null);
  const [editingAction, setEditingAction] = useState(null); // { action, isNew }
  const [savingAction, setSavingAction] = useState(false);
  const [editingOilChange, setEditingOilChange] = useState(null);
  const [savingOilChange, setSavingOilChange] = useState(false);

  function latestSampleFor(c) {
    return (samples || []).filter((sm) => sm.unitId === c).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))[0] || null;
  }

  const q = query.trim().toLowerCase();
  const results = !q
    ? registry
    : registry.filter(
        (r) =>
          r.code.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q) || (r.area || "").toLowerCase().includes(q)
      );

  function selectCode(c) {
    setCodeSynced(c);
    setQuery("");
    setOpen(false);
  }

  const reg = code ? registry.find((r) => r.code === code) : null;
  const samplesForEquip = code
    ? (samples || []).filter((sm) => sm.unitId === code).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))
    : [];
  const latest = samplesForEquip[0] || null;
  const oilChangesForEquip = code ? (oilChanges || []).filter((o) => o.equipmentCode === code) : [];
  const actionsForEquip = code
    ? (actions || [])
        .filter((a) => (a.equipmentCode || a.unitId) === code)
        .sort((a, b) => new Date(b.revisionDate || b.sampleDate || 0) - new Date(a.revisionDate || a.sampleDate || 0))
    : [];
  const openActionsCount = actionsForEquip.filter((a) => a.status !== "Closed").length;
  const nextDue = [...oilChangesForEquip].filter((o) => o.nextDueDate).sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))[0];

  function handleLogOilChange() {
    if (oilChangesForEquip.length === 0) return;
    setEditingOilChange(nextDue || oilChangesForEquip[0]);
  }

  async function handleSaveOilChange(updated) {
    setSavingOilChange(true);
    try {
      await onSaveOilChange(updated);
      setEditingOilChange(null);
    } catch {
      // toast already shown
    } finally {
      setSavingOilChange(false);
    }
  }

  async function handleSaveAction(payload) {
    setSavingAction(true);
    try {
      if (editingAction.isNew) await onAddAction(payload);
      else await onUpdateAction(payload);
      setEditingAction(null);
    } catch {
      // toast already shown
    } finally {
      setSavingAction(false);
    }
  }
  async function handleDeleteAction() {
    setSavingAction(true);
    try {
      await onDeleteAction(editingAction.action);
      setEditingAction(null);
    } catch {
      // toast already shown
    } finally {
      setSavingAction(false);
    }
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

  return (
    <div>
      {/* ── search ─────────────────────────────────────────────────────── */}
      <div style={{ textAlign: code ? "left" : "center", padding: code ? "0 0 20px" : "40px 20px 30px", transition: "padding 0.15s" }}>
        {!code && (
          <>
            <div
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.textMuted, marginBottom: 8 }}
            >
              Equipment Lookup
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: T.textPrimary }}>Find any piece of equipment</p>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 auto 22px", maxWidth: 440 }}>
              Search by code or description to see its full record — samples, oil changes, and actions in one place.
            </p>
          </>
        )}
        <div style={{ position: "relative", width: "100%", maxWidth: code ? 420 : 520, margin: code ? 0 : "0 auto" }}>
          <div style={{ position: "relative" }}>
            <i
              className="ti ti-search"
              style={{
                position: "absolute",
                left: code ? 12 : 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: T.textMuted,
                fontSize: code ? 14 : 16,
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <input
              style={{
                ...s.input,
                padding: code ? "9px 32px 9px 34px" : "13px 40px 13px 44px",
                fontSize: code ? 13 : 15,
                borderRadius: code ? 8 : 10,
              }}
              value={open ? query : code ? `${code}${reg ? " — " + reg.description : ""}` : query}
              placeholder="Search equipment code or description…"
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
            {code && !open && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCodeSynced("");
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
                maxHeight: 320,
                overflowY: "auto",
                textAlign: "left",
                boxShadow: `0 8px 24px ${T.appBg}aa`,
              }}
            >
              {results.length === 0 && (
                <div style={{ padding: 16, color: T.textMuted, fontSize: 12.5, textAlign: "center" }}>No matches</div>
              )}
              {results.map((r) => {
                const ls = latestSampleFor(r.code);
                const color = ls ? statusColor(T, ls.reportStatus) : T.textMuted;
                return (
                  <div
                    key={r.code}
                    onMouseDown={() => selectCode(r.code)}
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
                      {r.description}
                    </span>
                    {r.area && (
                      <span style={{ fontSize: 10.5, color: T.textMuted, background: T.cardSubBg, borderRadius: 4, padding: "2px 7px" }}>
                        {r.area}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!code && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, maxWidth: 760, margin: "0 auto" }}
        >
          {[
            ["ti-timeline", "Sample timeline", "Every reading for this equipment, newest first, with severity at a glance."],
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

      {/* ── equipment card ─────────────────────────────────────────────── */}
      {code && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: T.textHighlight }}>{code}</span>
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
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {[reg?.assetClass, reg?.area, reg?.contractor].filter(Boolean).map(tag)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={s.btn} onClick={handleLogOilChange} disabled={oilChangesForEquip.length === 0}>
                  <i className="ti ti-droplet-plus" aria-hidden="true" /> Log Oil Change
                </button>
                <button style={s.btn} onClick={() => setEditingAction({ action: { equipmentCode: code }, isNew: true })}>
                  <i className="ti ti-clipboard-plus" aria-hidden="true" /> New Action
                </button>
                {onOpenReport && (
                  <button style={s.btnPrimary} onClick={() => onOpenReport(code)}>
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
                  ["Asset ID", reg?.assetId],
                  ["Asset Class", reg?.assetClass],
                  ["Manufacturer", reg?.manufacturer],
                  ["Model", reg?.model],
                  ["Lubricant", reg?.lubricant],
                  ["Change Interval", reg?.interval],
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
          saving={savingAction}
          onClose={() => !savingAction && setEditingAction(null)}
          onSave={handleSaveAction}
          onDelete={editingAction.isNew ? null : handleDeleteAction}
        />
      )}

      {editingOilChange && (
        <EditOilChangeModal
          oilChange={editingOilChange}
          saving={savingOilChange}
          onClose={() => setEditingOilChange(null)}
          onSave={handleSaveOilChange}
        />
      )}
    </div>
  );
}

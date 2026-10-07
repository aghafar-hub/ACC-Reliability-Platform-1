import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import TechnicianPicker from "./TechnicianPicker";
import ModalShell, { FormSection } from "./ModalShell";

// Routines tab improvement pass: the one field-edit path a routine never
// had before (see backend/oil-lubrication/src/Routines.js's updateRoutine
// comment). Deliberately NOT a RouteType or equipment-list editor — those
// stay fixed once a routine's checklist items exist. Same overlay/card
// shell as NewRoutine.jsx (forked, not reinvented — see that file's own
// comment on why), but follows EditActionModal.jsx's convention of never
// calling the API itself: it just hands the parent a payload via onSave.
//
// Bug-hunt-adjacent: the first version of this modal only surfaced the
// handful of actually-editable fields, with nothing else about the
// routine visible at all — confirmed directly by the user as too little
// context to edit against ("too little data not all routine"). Now shows
// the full picture — Route Type/Contractor/Status up top, every
// equipment/LP point the routine actually covers at the bottom — even
// though the equipment list itself still isn't editable here.
export default function EditRoutineModal({ routine, items, equipmentRegistry, onClose, onSave }) {
  const { T, s } = useTheme();
  const isEmergencyTopUp = routine.routeType === "Emergency Top Up";
  const registryByLp = useMemo(() => {
    const map = {};
    (equipmentRegistry || []).forEach((r) => (map[r.code] = r));
    return map;
  }, [equipmentRegistry]);
  const [routeName, setRouteName] = useState(routine.routeName || "");
  const [assignedTo, setAssignedTo] = useState(routine.assignedTo || "");
  const [duration, setDuration] = useState(routine.duration || "");
  const [area, setArea] = useState(routine.area || "All");
  const [reason, setReason] = useState(routine.reason || "");
  const [saving, setSaving] = useState(false);

  const areaOptions = useMemo(
    () => ["All", ...Array.from(new Set((equipmentRegistry || []).map((r) => r.area).filter(Boolean))).sort()],
    [equipmentRegistry]
  );

  async function handleSave() {
    if (!routeName.trim()) return;
    if (!assignedTo.trim() && routine.status !== "Draft") return;
    if (isEmergencyTopUp && !reason.trim()) return;
    setSaving(true);
    try {
      await onSave({
        routeName: routeName.trim(),
        assignedTo: assignedTo.trim(),
        duration: duration ? Number(duration) : 0,
        area: area === "All" ? "" : area,
        reason: isEmergencyTopUp ? reason.trim() : "",
      });
    } finally {
      setSaving(false);
    }
  }

  const label = (text) => <label style={{ ...s.label, fontSize: 12, fontWeight: 600 }}>{text}</label>;
  const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 14 });
  const facts = [
    ["Route type", routine.routeType || "—"],
    ["Contractor", routine.contractor || "—"],
    ["Status", routine.status || "—"],
    ["Created", routine.createdDate ? `${routine.createdDate} · ${routine.createdBy || "—"}` : "—"],
  ];

  return (
    <ModalShell
      icon="route"
      title="Edit Route"
      subtitle={routine.routineId || routine.routeName}
      onClose={saving ? () => {} : onClose}
      width={640}
      testid="edit-route-modal"
      footer={
        <>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 10, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600 }}>{k}</div>
            <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 2, overflowWrap: "anywhere" }}>{v}</div>
          </div>
        ))}
      </div>

      <FormSection icon="clipboard-text" title="Details">
        <div style={{ marginBottom: 14 }}>
          {label("Route Name")}
          <input style={s.input} type="text" aria-label="Route Name" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
        </div>
        <div style={grid(170)}>
          <div>
            {label("Due Date")}
            {/* Phase 1: the date is changed with Reschedule, which records the reason. */}
            <div style={{ ...s.input, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>{routine.dueDate || "—"}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>Use Reschedule to change it.</div>
          </div>
          <div>
            {label("Area")}
            <select style={s.select} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              {areaOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            {label("Grace Period (days)")}
            <input style={s.input} type="number" min="0" placeholder="0" value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Grace Period (days)" />
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>Days after the due date before it counts as overdue.</div>
          </div>
        </div>
      </FormSection>

      <FormSection icon="user-check" title="Technician">
        {label("Assign Technician")}
        <TechnicianPicker contractor={routine.contractor} value={assignedTo} onChange={setAssignedTo} roleFilter={null} />
        {isEmergencyTopUp && (
          <div style={{ marginTop: 14 }}>
            {label("Reason")}
            <input style={s.input} type="text" aria-label="Reason" placeholder="e.g. Leakage, low level, seal issue…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </FormSection>

      {items && items.length > 0 && (
        <FormSection icon="map-pin" title={`Lubrication points (${items.length})`} hint="not editable here" style={{ marginBottom: 0 }}>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, maxHeight: 200, overflowY: "auto" }}>
            {items.map((item) => {
              const reg = registryByLp[item.lpId];
              return (
                <div key={item.routineItemId} style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border2}`, fontSize: 12.5 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent }}>{item.lpId}</span>
                  <span style={{ color: T.textSecondary }}> — {reg?.lubricationPoint || reg?.description || ""}</span>
                </div>
              );
            })}
          </div>
        </FormSection>
      )}
    </ModalShell>
  );
}

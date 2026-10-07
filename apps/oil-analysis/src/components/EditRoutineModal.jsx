import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import TechnicianPicker from "./TechnicianPicker";

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 210,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, width: "100%", maxWidth: 540, boxShadow: `0 12px 40px ${T.appBg}cc` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          <p style={{ ...s.sectionTitle, margin: 0 }}>Edit Route</p>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: T.textSecondary, marginBottom: 16 }}>
            <span>
              <strong style={{ color: T.textPrimary }}>{routine.routeType || "—"}</strong>
            </span>
            <span>Contractor: {routine.contractor || "—"}</span>
            <span>Status: {routine.status || "—"}</span>
            <span>{(items || []).length} equipment</span>
            {routine.createdDate && <span>Created {routine.createdDate} by {routine.createdBy || "—"}</span>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Route Name</label>
            <input style={s.input} type="text" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Due Date</label>
              {/* Phase 1: the date is changed with Reschedule, which records the reason. */}
              <div style={{ ...s.input, background: "transparent", color: s.input?.color }}>{routine.dueDate || "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Use Reschedule to change it.</div>
            </div>
            <div>
              <label style={s.label}>Area</label>
              <select style={s.select} value={area} onChange={(e) => setArea(e.target.value)}>
                {areaOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Grace Period (days)</label>
            <input style={s.input} type="number" min="0" placeholder="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "4px 0 0" }}>
              Still counts as On Schedule for this many days past the Due Date before flipping to Overdue.
            </p>
          </div>

          <div style={{ marginBottom: isEmergencyTopUp ? 14 : 0 }}>
            <label style={s.label}>Assign Technician</label>
            <TechnicianPicker contractor={routine.contractor} value={assignedTo} onChange={setAssignedTo} roleFilter={null} />
          </div>

          {isEmergencyTopUp && (
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Reason</label>
              <input style={s.input} type="text" placeholder="e.g. Leakage, low level, seal issue…" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {items && items.length > 0 && (
            <div>
              <label style={s.label}>Equipment / Lubrication Points ({items.length}) — not editable here</label>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
                {items.map((item) => {
                  const reg = registryByLp[item.lpId];
                  return (
                    <div key={item.routineItemId} style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border2}`, fontSize: 12 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent }}>{item.lpId}</span>
                      {"  "}
                      {reg?.lubricationPoint || reg?.description || ""}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: `1px solid ${T.border}` }}>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

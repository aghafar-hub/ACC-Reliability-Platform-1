import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { resolveThresholds, rmsStatus, rmsColorKey } from "../domain";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";

// Add/Edit single RMS or SPM reading modal, used from Equipment Readings —
// ported from the original's `Mm`.
export default function ReadingModal({ type, initial, rmsRegMap, spmRegMap, thresholdsMap, registryList, onCancel, onSave }) {
  const { T, s } = useTheme();
  const [form, setForm] = useState({ ...initial });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const thresholds = resolveThresholds(thresholdsMap, form.equipmentId, rmsRegMap, spmRegMap);
  const rmsReg = rmsRegMap[form.equipmentId];
  const spmReg = spmRegMap[form.equipmentId];
  const points = type === "RMS" ? rmsReg?.points || [] : spmReg?.points || [];

  const maxVel = useMemo(() => {
    const values = [form.axial, form.gear, form.horizontal, form.vertical].map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    return values.length ? Math.max(...values) : null;
  }, [form.axial, form.gear, form.horizontal, form.vertical]);

  return (
    <Modal title={`${form._id ? "Edit" : "Add"} ${type} Reading`} onClose={onCancel} width={480}>
      <div style={{ marginBottom: 10 }}>
        <label style={s.label}>Equipment</label>
        <select style={s.input} value={form.equipmentId || ""} onChange={(e) => set("equipmentId", e.target.value)} disabled={!!form._id}>
          <option value="">Select…</option>
          {registryList.map((eq) => (
            <option key={eq.equipmentId} value={eq.equipmentId}>
              {eq.equipmentId} — {eq.equipment}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={s.label}>Measurement Point</label>
        <select style={s.input} value={form.point || ""} onChange={(e) => set("point", e.target.value)}>
          <option value="">Select…</option>
          {points.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={s.label}>Date</label>
        <input type="date" style={s.input} value={form.date || ""} onChange={(e) => set("date", e.target.value)} />
      </div>
      {type === "RMS" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              ["axial", "Axial (mm/s)"],
              ["gear", "Gear (mm/s)"],
              ["horizontal", "Horizontal (mm/s)"],
              ["vertical", "Vertical (mm/s)"],
            ].map(([key, label]) => (
              <div key={key}>
                <label style={s.label}>{label}</label>
                <input type="number" step="0.01" style={s.input} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
          </div>
          {maxVel !== null && (
            <div style={{ ...s.cardSub, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: T.textSecondary }}>Max Velocity: </span>
              <span style={{ fontWeight: 800, color: T.textHighlight }}>{maxVel.toFixed(2)} mm/s</span>
              <span style={{ marginLeft: 10 }}>
                <StatusBadge status={rmsStatus(maxVel, thresholds)} colorKey={rmsColorKey(rmsStatus(maxVel, thresholds))} />
              </span>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            ["hdm", "HDm (dBsv)"],
            ["hdc", "HDc (dBsv)"],
            ["gs", "Gs"],
          ].map(([key, label]) => (
            <div key={key}>
              <label style={s.label}>{label}</label>
              <input type="number" step="0.1" style={s.input} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <button style={s.btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          style={s.btn}
          onClick={() => {
            const eq = registryList.find((r) => r.equipmentId === form.equipmentId);
            onSave({ ...form, equipmentName: eq?.equipment || form.equipmentName || "", maxVel });
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

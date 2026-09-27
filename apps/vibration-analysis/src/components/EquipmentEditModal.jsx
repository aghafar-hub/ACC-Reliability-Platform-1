import { useState } from "react";
import { useTheme } from "../ThemeContext";
import Modal from "./Modal";

// Equipment Register's "Edit" modal — name plate/type/line plus RMS
// limits+points and/or SPM limits, depending on which register(s) this
// equipment appears in. Ported from the original's `Am`.
export default function EquipmentEditModal({ row, lines, onClose, onSave }) {
  const { T, s } = useTheme();
  const [form, setForm] = useState({
    eid: row.eid,
    namePlate: row.rms?.namePlate || row.namePlate || "",
    eqType: row.rms?.eqType || row.eqType || "",
    line: row.rms?.line || row.line || "",
    rmsGood: row.rms?.rmsGood || "",
    rmsAcceptable: row.rms?.rmsAcceptable || "",
    rmsAlarm: row.rms?.rmsAlarm || "",
    rmsPoints: row.rms?.points?.join(", ") || "",
    spmNormal: row.spm?.spmNormal || "",
    spmCaution: row.spm?.spmCaution || "",
    spmAlarm: row.spm?.spmAlarm || "",
    rms: row.rms,
    spm: row.spm,
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal title={`Edit: ${row.eid}`} onClose={onClose} width={560}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={s.label}>Name Plate</label>
          <input style={s.input} value={form.namePlate} onChange={(e) => set("namePlate", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Eq Type</label>
          <input style={s.input} value={form.eqType} onChange={(e) => set("eqType", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Line</label>
          <select style={s.input} value={form.line} onChange={(e) => set("line", e.target.value)}>
            <option value="">— Select —</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {form.rms && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>
            RMS Limits & Points
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={s.label}>Good (mm/s)</label>
              <input type="number" step="0.1" style={s.input} value={form.rmsGood} onChange={(e) => set("rmsGood", e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Acceptable (mm/s)</label>
              <input
                type="number"
                step="0.1"
                style={s.input}
                value={form.rmsAcceptable}
                onChange={(e) => set("rmsAcceptable", e.target.value)}
              />
            </div>
            <div>
              <label style={s.label}>Alarm (mm/s)</label>
              <input type="number" step="0.1" style={s.input} value={form.rmsAlarm} onChange={(e) => set("rmsAlarm", e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>RMS Points (comma-separated)</label>
            <input
              style={s.input}
              value={form.rmsPoints}
              onChange={(e) => set("rmsPoints", e.target.value)}
              placeholder="e.g. Motor DE, Motor NDE, Fan DE"
            />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
              Edit points list. Changes update the sheet Points column (col G).
            </div>
          </div>
        </>
      )}
      {form.spm && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>SPM Limits</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Normal (dBsv)</label>
              <input type="number" step="0.1" style={s.input} value={form.spmNormal} onChange={(e) => set("spmNormal", e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Caution (dBsv)</label>
              <input type="number" step="0.1" style={s.input} value={form.spmCaution} onChange={(e) => set("spmCaution", e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Alarm (dBsv)</label>
              <input type="number" step="0.1" style={s.input} value={form.spmAlarm} onChange={(e) => set("spmAlarm", e.target.value)} />
            </div>
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <button style={s.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button style={s.btn} onClick={() => onSave(form)}>
          Save Changes
        </button>
      </div>
    </Modal>
  );
}

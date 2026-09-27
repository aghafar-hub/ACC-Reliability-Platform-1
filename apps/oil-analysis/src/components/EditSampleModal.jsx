import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { RATING_OPTIONS } from "../theme";

export default function EditSampleModal({ sample, onClose, onSave, saving }) {
  const { T, s } = useTheme();
  const [form, setForm] = useState(() => ({
    ...sample,
    wear: { ...sample.wear },
    contaminants: { ...sample.contaminants },
    additives: { ...sample.additives },
  }));

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setWear = (k, v) => setForm((f) => ({ ...f, wear: { ...f.wear, [k]: Number(v) || 0 } }));

  const field = (label, key, type = "text") => (
    <div>
      <label style={{ ...s.label, fontSize: 11 }}>{label}</label>
      <input style={{ ...s.input, fontSize: 13 }} type={type} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 700,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Edit Sample — {sample.unitId}</p>
          <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
          {field("Sample Date", "sampledDate", "date")}
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Report Status</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.reportStatus || "Normal"}
              onChange={(e) => set("reportStatus", e.target.value)}
            >
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Equipment Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.equipmentRating || "Normal"}
              onChange={(e) => set("equipmentRating", e.target.value)}
            >
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Lubricant Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.lubricantRating || "Normal"}
              onChange={(e) => set("lubricantRating", e.target.value)}
            >
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Contamination Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.contaminationRating || "Normal"}
              onChange={(e) => set("contaminationRating", e.target.value)}
            >
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Lubricant Properties</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 16 }}>
          {field("Visc@40°C (cSt)", "visc40C", "number")}
          {field("TAN (mg KOH/g)", "tan", "number")}
          {field("Oxidation (Ab/cm)", "oxidation", "number")}
          {field("Water (Vol%)", "water", "number")}
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Wear Metals (ppm)</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 10, marginBottom: 16 }}>
          {Object.keys(form.wear || {}).map((k) => (
            <div key={k}>
              <label style={{ ...s.label, fontSize: 11 }}>{k}</label>
              <input
                style={{ ...s.input, fontSize: 13 }}
                type="number"
                value={form.wear[k] ?? 0}
                onChange={(e) => setWear(k, e.target.value)}
              />
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Alert Type / Sample Analysis</p>
        <div style={{ marginBottom: 20 }}>
          {field("Alert Type", "alertType")}
          <div style={{ marginTop: 10 }}>
            <label style={{ ...s.label, fontSize: 11 }}>Recommendations</label>
            <textarea
              style={{ ...s.input, fontSize: 13, minHeight: 70, resize: "vertical" }}
              value={(form.recommendations || []).join("\n")}
              onChange={(e) => set("recommendations", e.target.value.split("\n").filter(Boolean))}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

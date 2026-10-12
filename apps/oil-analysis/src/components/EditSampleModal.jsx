import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { RATING_OPTIONS } from "../theme";
import FlagPicker from "./FlagPicker";
import { useIsAppOwner } from "../SessionContext";

// The date input needs "YYYY-MM-DD"; samples carry the display form
// ("01 Oct 2026"), which left the field looking empty.
function toInputDate(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Every value of the lab report can be corrected here (an imported value the
// lab report shows differently, a typing mistake). An empty box stays empty —
// it is not a reading of 0.
const NUM_GROUPS = [
  { title: "Particle Count & PQ", keys: [["particleCount4um", "PC >4µm"], ["particleCount6um", "PC >6µm"], ["particleCount14um", "PC >14µm"], ["pqIndex", "PQ Index"]] },
  { title: "Lubricant Properties", keys: [["visc40C", "Viscosity (cSt)"], ["tan", "TAN (mg KOH/g)"], ["oxidation", "Oxidation (Ab/cm)"], ["water", "Water (Vol%)"]] },
  { title: "Wear Metals (ppm)", group: "wear", keys: ["Ag", "Al", "Cr", "Cu", "Fe", "Mo", "Ni", "Pb", "Sn"].map((k) => [k, k]) },
  { title: "Contaminants (ppm)", group: "contaminants", keys: ["K", "Na", "Si"].map((k) => [k, k]) },
  { title: "Additives (ppm)", group: "additives", keys: ["B", "Ba", "Ca", "Mg", "P", "Zn"].map((k) => [k, k]) },
];
const toNum = (v) => (v === "" || v === null || v === undefined ? "" : isNaN(Number(v)) ? v : Number(v));

export default function EditSampleModal({ sample, onClose, onSave, saving }) {
  const { T, s } = useTheme();
  const isOwner = useIsAppOwner();
  const [form, setForm] = useState(() => ({
    ...sample,
    sampledDate: toInputDate(sample.sampledDate) || sample.sampledDate,
    isoCode: String(sample.isoCode || "").replace(/^'/, ""),
    wear: { ...sample.wear },
    contaminants: { ...sample.contaminants },
    additives: { ...sample.additives },
  }));

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setIn = (group, k, v) => setForm((f) => (group ? { ...f, [group]: { ...f[group], [k]: v } } : { ...f, [k]: v }));
  function save() {
    const out = { ...form, wear: { ...form.wear }, contaminants: { ...form.contaminants }, additives: { ...form.additives } };
    NUM_GROUPS.forEach((g) =>
      g.keys.forEach(([k]) => {
        if (g.group) out[g.group][k] = toNum(out[g.group][k]);
        else out[k] = toNum(out[k]);
      })
    );
    onSave(out);
  }

  const field = (label, key, type = "text") => (
    <div>
      <label style={{ ...s.label, fontSize: 12 }}>{label}</label>
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

        {(sample.validationStatus === "Validated" || !sample.validationStatus) && (
          <div style={{ ...s.infoBar, borderColor: T.warning, marginBottom: 14, fontSize: 12.5 }} data-testid="reopen-warning">
            <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.warning, marginRight: 6 }} />
            {isOwner ? (
              <>
                This report is validated. As App Owner your correction keeps it <strong>Validated</strong>; every changed value is recorded in
                Activity.
              </>
            ) : (
              <>
                This report is validated. Saving a change sends it back to <strong>Pending Validation</strong> — an ACC Engineer validates it
                again.
              </>
            )}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
          {field("Sample Date", "sampledDate", "date")}
          <div>
            <label style={{ ...s.label, fontSize: 12 }}>Report Status</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.reportStatus || ""}
              onChange={(e) => set("reportStatus", e.target.value)}
            >
              <option value="">—</option>
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 12 }}>Equipment Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.equipmentRating || ""}
              onChange={(e) => set("equipmentRating", e.target.value)}
            >
              <option value="">—</option>
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 12 }}>Lubricant Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.lubricantRating || ""}
              onChange={(e) => set("lubricantRating", e.target.value)}
            >
              <option value="">—</option>
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 12 }}>Contamination Rating</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.contaminationRating || ""}
              onChange={(e) => set("contaminationRating", e.target.value)}
            >
              <option value="">—</option>
              {RATING_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 12 }}>ISO Code (4/6/14)</label>
            <input style={{ ...s.input, fontSize: 13 }} placeholder="e.g. 22/21/19" aria-label="Edit ISO code" value={form.isoCode || ""} onChange={(e) => set("isoCode", e.target.value)} />
          </div>
        </div>

        {NUM_GROUPS.map((g) => (
          <div key={g.title}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>{g.title}</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${g.group ? 80 : 120}px,1fr))`, gap: 10, marginBottom: 16 }}>
              {g.keys.map(([k, label]) => (
                <div key={k}>
                  <label style={{ ...s.label, fontSize: 12 }}>{k === "visc40C" && sample.viscTemp ? `Visc@${sample.viscTemp}°C (cSt)` : label}</label>
                  <input
                    style={{ ...s.input, fontSize: 13 }}
                    type="number"
                    step="any"
                    aria-label={`Edit ${label}`}
                    value={(g.group ? form[g.group]?.[k] : form[k]) ?? ""}
                    onChange={(e) => setIn(g.group, k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Lab Marks (yellow / red cells)</p>
        <div style={{ marginBottom: 16 }}>
          <FlagPicker value={form.flaggedReadings} onChange={(v) => set("flaggedReadings", v)} />
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Alert Type / Sample Analysis</p>
        <div style={{ marginBottom: 20 }}>
          {field("Alert Type", "alertType")}
          <div style={{ marginTop: 10 }}>
            <label style={{ ...s.label, fontSize: 12 }}>Recommendations</label>
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
          <button style={s.btnPrimary} onClick={save} disabled={saving} data-testid="edit-sample-save">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

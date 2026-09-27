import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { RATING_OPTIONS } from "../theme";
import BulkImportPanel from "../components/BulkImportPanel";

const EMPTY = {
  unitId: "",
  description: "",
  sampleId: "",
  sampledDate: "",
  reportStatus: "Normal",
  contaminationRating: "Normal",
  equipmentRating: "Normal",
  lubricantRating: "Normal",
  visc40C: "",
  tan: "",
  oxidation: "",
  water: "",
  wear: { Ag: "", Al: "", Cr: "", Cu: "", Fe: "", Mo: "", Ni: "", Pb: "", Sn: "" },
  contaminants: { K: "", Na: "", Si: "" },
  additives: { B: "", Ba: "", Ca: "", Mg: "", P: "", Zn: "" },
  alertType: "",
};

function SectionHeader({ label, icon }) {
  const { T } = useTheme();
  return (
    <div
      style={{
        padding: "8px 14px",
        background: T.infoBarBg,
        borderRadius: "6px 6px 0 0",
        borderBottom: `1px solid ${T.border2}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 20,
      }}
    >
      <i className={`ti ${icon}`} style={{ color: T.accent, fontSize: 15 }} aria-hidden="true" />
      <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{label}</span>
    </div>
  );
}
function SectionBody({ children }) {
  const { T } = useTheme();
  return (
    <div
      style={{ background: T.cardBg, border: `1px solid ${T.border2}`, borderRadius: "0 0 6px 6px", padding: "14px 16px", marginBottom: 4 }}
    >
      {children}
    </div>
  );
}

export default function AddSample({ equipmentOptions, equipmentRegistry, existingSamples, onAdd, onBulkAdd }) {
  const { T, s } = useTheme();
  const [mode, setMode] = useState("manual"); // "manual" | "bulk"
  const [form, setForm] = useState(EMPTY);
  const [recommendationsText, setRecommendationsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const usedSampleIds = new Set((existingSamples || []).map((s2) => s2.sampleId).filter(Boolean));

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function setNested(group, key, value) {
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: Number(value) || 0 } }));
  }
  function selectEquipment(code) {
    const reg = (equipmentRegistry || []).find((r) => r.code === code);
    setForm((f) => ({
      ...f,
      unitId: code,
      description: reg?.description || f.description,
      lubricant: reg?.lubricant || f.lubricant,
    }));
  }

  function resetForm() {
    setForm(EMPTY);
    setRecommendationsText("");
    setConfirmDuplicate(false);
  }

  function handleSubmitClick() {
    if (!form.unitId) return alert("Equipment ID is required.");
    if (!form.sampledDate) return alert("Sample Date is required.");
    if (form.sampleId && usedSampleIds.has(form.sampleId) && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    doSave();
  }

  async function doSave() {
    setSaving(true);
    try {
      const recommendations = recommendationsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await onAdd({ ...form, recommendations });
      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // toast already shown by App
    } finally {
      setSaving(false);
    }
  }

  const numField = (label, key) => (
    <div>
      <label style={s.label}>{label}</label>
      <input
        style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
        type="number"
        step="any"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Add New Sample</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "manual" && saved && (
            <span style={{ fontSize: 12, color: T.success, display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-circle-check" aria-hidden="true" /> Sample saved to sheet
            </span>
          )}
          {mode === "manual" && (
            <>
              <button style={{ ...s.btn, fontSize: 12 }} onClick={resetForm}>
                <i className="ti ti-refresh" aria-hidden="true" /> Reset Form
              </button>
              <button style={{ ...s.btnPrimary, fontSize: 13 }} onClick={handleSubmitClick} disabled={saving}>
                <i className="ti ti-database-plus" aria-hidden="true" /> {saving ? "Saving…" : "Save Sample"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button
          style={{
            ...s.btn,
            fontSize: 12,
            background: mode === "manual" ? T.accent : "transparent",
            color: mode === "manual" ? T.accentText : T.textSecondary,
          }}
          onClick={() => setMode("manual")}
        >
          <i className="ti ti-edit" aria-hidden="true" /> Manual Entry
        </button>
        <button
          style={{
            ...s.btn,
            fontSize: 12,
            background: mode === "bulk" ? T.accent : "transparent",
            color: mode === "bulk" ? T.accentText : T.textSecondary,
          }}
          onClick={() => setMode("bulk")}
        >
          <i className="ti ti-file-upload" aria-hidden="true" /> Import Lab Reports (PDF)
        </button>
      </div>

      {mode === "bulk" && <BulkImportPanel equipmentRegistry={equipmentRegistry} existingSamples={existingSamples} onBulkAdd={onBulkAdd} />}

      {mode === "manual" && confirmDuplicate && (
        <div
          style={{
            ...s.infoBar,
            borderColor: T.danger,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: T.danger }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> Sample ID "{form.sampleId}" already exists. Save anyway?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...s.btn, fontSize: 12 }} onClick={() => setConfirmDuplicate(false)}>
              Cancel
            </button>
            <button style={{ ...s.btnPrimary, fontSize: 12 }} onClick={doSave} disabled={saving}>
              Save Anyway
            </button>
          </div>
        </div>
      )}

      {mode === "manual" && (
        <>
          <SectionHeader label="Equipment & Sample Information" icon="ti-settings-automation" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              <div>
                <label style={s.label}>Equipment Code *</label>
                <input
                  list="equip-list"
                  style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                  value={form.unitId}
                  onChange={(e) => selectEquipment(e.target.value)}
                />
                <datalist id="equip-list">
                  {(equipmentOptions || []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={s.label}>Description</label>
                <input
                  style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>Sample ID *</label>
                <input
                  style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                  value={form.sampleId}
                  onChange={(e) => set("sampleId", e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>Sampled Date *</label>
                <input
                  style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                  type="date"
                  value={form.sampledDate}
                  onChange={(e) => set("sampledDate", e.target.value)}
                />
              </div>
            </div>
          </SectionBody>

          <SectionHeader label="Overall Ratings" icon="ti-gauge" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {["reportStatus", "contaminationRating", "equipmentRating", "lubricantRating"].map((key) => (
                <div key={key}>
                  <label style={s.label}>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</label>
                  <select
                    style={{ ...s.input, fontSize: 12, cursor: "pointer" }}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                  >
                    {RATING_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label style={s.label}>Alert Type</label>
                <input
                  style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                  value={form.alertType}
                  onChange={(e) => set("alertType", e.target.value)}
                  placeholder="e.g. Caution – Elevated Fe"
                />
              </div>
            </div>
          </SectionBody>

          <SectionHeader label="Lubricant Properties" icon="ti-droplet" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 }}>
              {numField("Visc@40°C (cSt)", "visc40C")}
              {numField("TAN (mg KOH/g)", "tan")}
              {numField("Oxidation (Ab/cm)", "oxidation")}
              {numField("Water (Vol%)", "water")}
            </div>
          </SectionBody>

          <SectionHeader label="Wear Metals (ppm)" icon="ti-atom-2" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 10 }}>
              {Object.keys(EMPTY.wear).map((metal) => (
                <div key={metal}>
                  <label style={s.label}>{metal}</label>
                  <input
                    style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                    type="number"
                    step="any"
                    value={form.wear[metal]}
                    onChange={(e) => setNested("wear", metal, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </SectionBody>

          <SectionHeader label="Contaminants (ppm)" icon="ti-alert-circle" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 10 }}>
              {Object.keys(EMPTY.contaminants).map((k) => (
                <div key={k}>
                  <label style={s.label}>{k}</label>
                  <input
                    style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                    type="number"
                    step="any"
                    value={form.contaminants[k]}
                    onChange={(e) => setNested("contaminants", k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </SectionBody>

          <SectionHeader label="Additives (ppm)" icon="ti-flask" />
          <SectionBody>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: 10 }}>
              {Object.keys(EMPTY.additives).map((k) => (
                <div key={k}>
                  <label style={s.label}>{k}</label>
                  <input
                    style={{ ...s.input, fontSize: 12, padding: "6px 10px" }}
                    type="number"
                    step="any"
                    value={form.additives[k]}
                    onChange={(e) => setNested("additives", k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </SectionBody>

          <SectionHeader label="Recommendations / Comments" icon="ti-notes" />
          <SectionBody>
            <textarea
              style={{ ...s.input, fontSize: 12, minHeight: 80, resize: "vertical" }}
              value={recommendationsText}
              onChange={(e) => setRecommendationsText(e.target.value)}
              placeholder="One recommendation per line"
            />
          </SectionBody>
        </>
      )}
    </div>
  );
}

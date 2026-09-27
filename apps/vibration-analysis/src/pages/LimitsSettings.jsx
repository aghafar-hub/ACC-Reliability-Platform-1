import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { updateRegisterLimits } from "../api";
import { resolveThresholds } from "../domain";

// Per-equipment RMS/SPM threshold editor. Only has a visible effect for
// equipment that ISN'T in the RMS/SPM Equipment Register sheet — see
// resolveThresholds()'s comment in domain.js for why registered equipment's
// bands are controlled by Equipment Register's own Edit modal instead.
// Ported from the original's `$m`.
export default function LimitsSettings({ registryList, thresholdsMap, setThresholds, rmsRegMap, spmRegMap, webhookUrl }) {
  const { T, s } = useTheme();
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);

  const equipment = registryList.find((r) => r.equipmentId === equipmentId) || {};
  const lines = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.line)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const eqTypes = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.eqType)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const equipmentOptions = useMemo(
    () =>
      registryList
        .filter((r) => (!line || r.line === line) && (!eqType || r.eqType === eqType))
        .map((r) => r.equipmentId)
        .sort(),
    [registryList, line, eqType]
  );

  useEffect(() => {
    if (!equipmentId) {
      setDraft(null);
      return;
    }
    const t = resolveThresholds(thresholdsMap, equipmentId, rmsRegMap, spmRegMap);
    setDraft({ rms: { ...t.rms }, spm: { ...t.spm } });
  }, [equipmentId, thresholdsMap, rmsRegMap, spmRegMap]);

  const save = () => {
    setThresholds(equipmentId, draft);
    if (webhookUrl) {
      updateRegisterLimits(webhookUrl, {
        type: "RMS",
        equipmentId,
        rmsGood: draft.rms.good,
        rmsAcceptable: draft.rms.acceptable,
        rmsAlarm: draft.rms.alarm,
      });
      // NOTE: reproduced exactly as found — the original sends
      // draft.spm.caution as BOTH spmCaution and spmAlarm here (this form
      // has no "Alarm" field for SPM at all, only Normal/Caution), so the
      // register's SPM Alarm limit is overwritten with the Caution value on
      // every save from this page. See docs/API_CONTRACT.md's "Known gaps".
      updateRegisterLimits(webhookUrl, {
        type: "SPM",
        equipmentId,
        spmNormal: draft.spm.normal,
        spmCaution: draft.spm.caution,
        spmAlarm: draft.spm.caution,
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    const t = resolveThresholds({}, equipmentId, rmsRegMap, spmRegMap);
    setDraft({ rms: { ...t.rms }, spm: { ...t.spm } });
  };

  return (
    <div style={{ padding: 20, maxWidth: 700 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={s.label}>Line</label>
          <select
            style={{ ...s.input, width: 130 }}
            value={line}
            onChange={(e) => {
              setLine(e.target.value);
              setEqType("");
              setEquipmentId("");
            }}
          >
            <option value="">All Lines</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Eq Type</label>
          <select
            style={{ ...s.input, width: 140 }}
            value={eqType}
            onChange={(e) => {
              setEqType(e.target.value);
              setEquipmentId("");
            }}
          >
            <option value="">All Eq Types</option>
            {eqTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={s.label}>Equipment</label>
          <select style={s.input} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">Select equipment…</option>
            {equipmentOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!equipmentId && (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 50 }}>Select equipment to configure alarm limits.</div>
      )}

      {equipmentId && draft && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 4 }}>
            {equipmentId} — {equipment.equipment}
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 16 }}>{equipment.line}</div>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>
            RMS Thresholds (mm/s)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              ["good", "Good (Green) below", T.success],
              ["acceptable", "Acceptable (Amber) below", T.warning],
              ["alarm", "Alarm (Red) below", T.danger],
            ].map(([key, label, color]) => (
              <div key={key}>
                <label style={{ ...s.label, color }}>{label}</label>
                <input
                  type="number"
                  step="0.1"
                  style={s.input}
                  value={draft.rms[key] || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, rms: { ...d.rms, [key]: parseFloat(e.target.value) || 0 } }))}
                />
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 8, textTransform: "uppercase" }}>
            SPM Thresholds (dBsv)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              ["normal", "Normal (Green) below", T.success],
              ["caution", "Caution (Amber) below", T.warning],
            ].map(([key, label, color]) => (
              <div key={key}>
                <label style={{ ...s.label, color }}>{label}</label>
                <input
                  type="number"
                  step="0.1"
                  style={s.input}
                  value={draft.spm[key] || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, spm: { ...d.spm, [key]: parseFloat(e.target.value) || 0 } }))}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 14,
              borderTop: `1px solid ${T.border}`,
            }}
          >
            <button style={s.btnSecondary} onClick={reset}>
              Reset to Default
            </button>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {saved && <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>✓ Saved</span>}
              <button style={s.btn} onClick={save}>
                Save Limits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

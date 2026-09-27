import { useCallback, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { updateCompliance } from "../api";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { ICONS } from "../components/icons";
import { resolveThresholds, rmsColorKey, rmsStatus, spmColorKey, spmStatus, vibPointKey, worseStatus } from "../domain";
import { monthKey, parseNumber } from "../parsers";

const RMS_FIELDS = ["axial", "gear", "horizontal", "vertical"];

// Bulk "enter today's readings for one equipment" form: one card per RMS
// measurement point (Axial/Gear/Horizontal/Vertical inputs) and one per SPM
// point (HDm/HDc/Gs), saved together with "Save All Readings". Also pushes
// an updateCompliance write and locally updates the Compliance Tracker's
// current month to "YES" for this equipment, using whichever reading came
// back most severe. Ported from the original's `Em`.
//
// `vibIdMap` (equipmentId|point|family -> VIB_ID, from App.jsx) is a
// sandbox-only addition — see apps-script/vib-id-merge/README.md. It's
// shown as a small badge next to each point when a match exists; empty on
// production, where no card shows a badge at all.
export default function NewReading({ registryList, rmsRegMap, spmRegMap, thresholdsMap, mutations, webhookUrl, setCompliance, vibIdMap }) {
  const { T, s } = useTheme();
  const [equipmentId, setEquipmentId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rmsForm, setRmsForm] = useState({});
  const [spmForm, setSpmForm] = useState({});
  const [showMissingWarning, setShowMissingWarning] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const equipment = registryList.find((r) => r.equipmentId === equipmentId) || {};
  const rmsReg = rmsRegMap[equipmentId];
  const spmReg = spmRegMap[equipmentId];
  const thresholds = resolveThresholds(thresholdsMap, equipmentId, rmsRegMap, spmRegMap);
  const rmsPoints = useMemo(() => (rmsReg ? rmsReg.points : []), [rmsReg]);
  const spmPoints = useMemo(() => (spmReg ? spmReg.points : []), [spmReg]);

  const findMissing = useCallback(() => {
    const missing = [];
    rmsPoints.forEach((point) => {
      const values = rmsForm[point] || {};
      if (!values.axial && !values.gear && !values.horizontal && !values.vertical) missing.push(`RMS: ${point}`);
    });
    spmPoints.forEach((point) => {
      if (!(spmForm[point] || {}).hdm) missing.push(`SPM: ${point}`);
    });
    return missing;
  }, [rmsPoints, spmPoints, rmsForm, spmForm]);

  const trySave = () => {
    if (findMissing().length > 0) {
      setShowMissingWarning(true);
      return;
    }
    save();
  };

  const save = () => {
    setShowMissingWarning(false);
    let savedCount = 0;
    rmsPoints.forEach((point) => {
      const values = rmsForm[point] || {};
      if (!values.axial && !values.gear && !values.horizontal && !values.vertical) return;
      const axial = parseNumber(values.axial);
      const gear = parseNumber(values.gear);
      const horizontal = parseNumber(values.horizontal);
      const vertical = parseNumber(values.vertical);
      const nums = [axial, gear, horizontal, vertical].filter((v) => v !== null);
      const maxVel = nums.length ? Math.max(...nums) : null;
      mutations.addRMS({ equipmentId, equipmentName: equipment.equipment || "", point, date, axial, gear, horizontal, vertical, maxVel });
      savedCount++;
    });
    spmPoints.forEach((point) => {
      const values = spmForm[point] || {};
      if (!values.hdm) return;
      mutations.addSPM({
        equipmentId,
        equipmentName: equipment.equipment || "",
        point,
        type: "SPM",
        date,
        hdm: parseNumber(values.hdm),
        hdc: parseNumber(values.hdc),
        gs: parseNumber(values.gs),
      });
      savedCount++;
    });

    if (savedCount > 0 && webhookUrl) {
      const month = monthKey(date);
      const statuses = [
        ...rmsPoints.map((point) => {
          const values = rmsForm[point] || {};
          const nums = [
            parseNumber(values.axial),
            parseNumber(values.gear),
            parseNumber(values.horizontal),
            parseNumber(values.vertical),
          ].filter((v) => v !== null);
          const maxVel = nums.length ? Math.max(...nums) : null;
          return rmsStatus(maxVel, thresholds);
        }),
        ...spmPoints.map((point) => spmStatus(parseNumber((spmForm[point] || {}).hdm), thresholds)),
      ].filter(Boolean);
      const worst = statuses.reduce((acc, cur) => worseStatus(acc, cur), "Normal");
      updateCompliance(webhookUrl, equipmentId, month, worst);
      setCompliance((prev) =>
        prev.map((row) => {
          if (row.equipmentId !== equipmentId) return row;
          const months = row.months.filter((m) => m.month !== month);
          months.push({ month, status: "YES" });
          months.sort((a, b) => a.month.localeCompare(b.month));
          return { ...row, months, last: "YES" };
        })
      );
    }

    setRmsForm({});
    setSpmForm({});
    setSavedMessage(`✓ ${savedCount} reading(s) saved for ${equipmentId} on ${date}`);
    setTimeout(() => setSavedMessage(""), 4000);
  };

  const hasAnyValue =
    rmsPoints.some((p) => {
      const v = rmsForm[p] || {};
      return v.axial || v.gear || v.horizontal || v.vertical;
    }) || spmPoints.some((p) => (spmForm[p] || {}).hdm);

  return (
    <div style={{ padding: 20, maxWidth: 700 }}>
      {showMissingWarning && (
        <Modal title="Missing Values" onClose={() => setShowMissingWarning(false)} width={460}>
          <div style={{ fontSize: 13, color: T.textPrimary, marginBottom: 16, lineHeight: 1.7 }}>
            The following points have no values entered:
            <ul style={{ marginTop: 8, paddingLeft: 20, color: T.warning }}>
              {findMissing().map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={s.btnSecondary} onClick={() => setShowMissingWarning(false)}>
              Go Back
            </button>
            <button style={s.btn} onClick={save}>
              Save Anyway
            </button>
          </div>
        </Modal>
      )}

      <div style={s.card}>
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Equipment</label>
          <select
            style={s.input}
            value={equipmentId}
            onChange={(e) => {
              setEquipmentId(e.target.value);
              setRmsForm({});
              setSpmForm({});
            }}
          >
            <option value="">Select equipment…</option>
            {registryList.map((eq) => (
              <option key={eq.equipmentId} value={eq.equipmentId}>
                {eq.equipmentId} — {eq.equipment} ({eq.line})
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Reading Date</label>
          <input type="date" style={{ ...s.input, maxWidth: 200 }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {equipmentId && rmsPoints.length === 0 && spmPoints.length === 0 && (
          <div style={{ ...s.cardSub, color: T.textMuted, textAlign: "center", padding: 30 }}>
            No measurement points configured for this equipment.
          </div>
        )}

        {rmsPoints.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              RMS Readings (mm/s)
            </div>
            {rmsPoints.map((point) => {
              const values = rmsForm[point] || {};
              const nums = [
                parseNumber(values.axial),
                parseNumber(values.gear),
                parseNumber(values.horizontal),
                parseNumber(values.vertical),
              ].filter((v) => v !== null);
              const maxVel = nums.length ? Math.max(...nums) : null;
              const status = rmsStatus(maxVel, thresholds);
              const vibId = vibIdMap?.[vibPointKey(equipmentId, point, "RMS")];
              return (
                <div key={point} style={{ ...s.cardSub, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: T.textHighlight, fontSize: 13 }}>{point}</span>
                      {vibId && <span style={{ fontSize: 10.5, color: T.textMuted, fontFamily: "monospace" }}>{vibId}</span>}
                    </div>
                    {maxVel !== null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: T.textHighlight }}>{maxVel.toFixed(2)} mm/s</span>
                        <StatusBadge status={status} colorKey={rmsColorKey(status)} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {RMS_FIELDS.map((field) => (
                      <div key={field}>
                        <label style={s.label}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                        <input
                          type="number"
                          step="0.01"
                          style={s.input}
                          value={values[field] || ""}
                          onChange={(e) =>
                            setRmsForm((prev) => ({ ...prev, [point]: { ...(prev[point] || {}), [field]: e.target.value } }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {spmPoints.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              SPM Readings (dBsv)
            </div>
            {spmPoints.map((point) => {
              const values = spmForm[point] || {};
              const status = spmStatus(parseNumber(values.hdm), thresholds);
              const vibId = vibIdMap?.[vibPointKey(equipmentId, point, "SPM")];
              return (
                <div key={point} style={{ ...s.cardSub, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: T.textHighlight, fontSize: 13 }}>{point}</span>
                      {vibId && <span style={{ fontSize: 10.5, color: T.textMuted, fontFamily: "monospace" }}>{vibId}</span>}
                    </div>
                    {values.hdm && <StatusBadge status={status} colorKey={spmColorKey(status)} />}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      ["hdm", "HDm (dBsv)"],
                      ["hdc", "HDc (dBsv)"],
                      ["gs", "Gs"],
                    ].map(([field, label]) => (
                      <div key={field}>
                        <label style={s.label}>{label}</label>
                        <input
                          type="number"
                          step="0.1"
                          style={s.input}
                          value={values[field] || ""}
                          onChange={(e) =>
                            setSpmForm((prev) => ({ ...prev, [point]: { ...(prev[point] || {}), [field]: e.target.value } }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {equipmentId && (rmsPoints.length > 0 || spmPoints.length > 0) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 14,
              borderTop: `1px solid ${T.border}`,
            }}
          >
            <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>{savedMessage}</span>
            <button style={{ ...s.btn, opacity: hasAnyValue ? 1 : 0.5 }} disabled={!hasAnyValue} onClick={trySave}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon d={ICONS.plus} size={14} /> Save All Readings
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

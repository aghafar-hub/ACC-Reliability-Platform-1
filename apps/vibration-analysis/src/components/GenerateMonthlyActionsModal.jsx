import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { combinedColorKey } from "../domain";
import { monthKey } from "../parsers";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";

// Previews and generates one Action per equipment whose most recent RMS or
// SPM reading in the selected month was Alarm/Danger — ported from the
// original's `Lm`. The actual write (assigning V-### numbers, calling
// appendAction) happens in ActionTracker.jsx's onGenerate handler; this
// component only builds the preview list.
export default function GenerateMonthlyActionsModal({ onClose, onGenerate, lastRms, lastSpm, registryMap }) {
  const { T, s } = useTheme();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [preview, setPreview] = useState(null);

  const buildPreview = () => {
    const byEquipment = {};
    [...lastRms, ...lastSpm].forEach((reading) => {
      if (!reading.date || monthKey(reading.date) !== month) return;
      const status = reading.machineStatus || reading.readingStatus;
      if (status !== "Alarm" && status !== "Danger") return;
      const equipmentId = reading.equipmentId;
      const existing = byEquipment[equipmentId];
      // worseStatus semantics inline: keep whichever reading's status ranks higher
      const rank = { Alarm: 3, Danger: 4 };
      if (!existing || rank[status] > rank[existing.status]) {
        const reg = registryMap[equipmentId] || {};
        const trigger =
          reading.maxVel !== undefined
            ? { type: "RMS", point: reading.point, value: reading.maxVel }
            : { type: "SPM", point: reading.point, value: reading.hdm };
        byEquipment[equipmentId] = {
          equipmentId,
          equipmentName: reg.equipment || reading.equipment || "",
          line: reg.line || reading.line || "",
          status,
          trig: trigger,
          date: reading.date,
          contractor: "",
        };
      }
    });
    setPreview(Object.values(byEquipment));
  };

  return (
    <Modal title="Generate Monthly Actions" onClose={onClose} width={560}>
      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Select Month</label>
        <input type="month" style={{ ...s.input, maxWidth: 200 }} value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={s.btn} onClick={buildPreview}>
          Preview
        </button>
      </div>
      {preview && (
        <>
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 10 }}>
            {preview.length === 0 ? "No Alarm or Danger equipment found for this month." : `${preview.length} action(s) will be created:`}
          </div>
          {preview.length > 0 && (
            <>
              <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 14, border: `1px solid ${T.border2}`, borderRadius: 8 }}>
                {preview.map((item, i) => (
                  <div
                    key={item.equipmentId}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: i < preview.length - 1 ? `1px solid ${T.border2}` : "none",
                      background: i % 2 ? T.tableRowAlt : T.tableRow,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, color: T.textHighlight }}>{item.equipmentId}</span>
                      <span style={{ color: T.textMuted, fontSize: 11, marginLeft: 6 }}>{item.equipmentName}</span>
                    </div>
                    <StatusBadge status={item.status} colorKey={combinedColorKey(item.status)} />
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                      {item.trig.type}·{item.trig.point}
                    </span>
                    <span style={{ fontSize: 11, color: T.textSecondary }}>{item.line}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <button style={s.btnSecondary} onClick={onClose}>
                  Cancel
                </button>
                <button style={s.btn} onClick={() => onGenerate(preview, month)}>
                  Generate {preview.length} Action(s)
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { computeOilChangeNextDue, computeOilChangeStatus } from "../parsers";

// Shared by the Oil Change Log page and the Equipment tab's "Log Oil
// Change" flow — only Last Change Date and Next Due Date are ever editable
// here; everything else on the row is managed directly in the sheet.
export default function EditOilChangeModal({ oilChange, onClose, onSave, saving }) {
  const { T, s } = useTheme();
  const [form, setForm] = useState({ changeDate: oilChange.changeDate || "", nextDueDate: oilChange.nextDueDate || "" });

  async function handleSave() {
    const nextDueDate = form.nextDueDate || computeOilChangeNextDue(form.changeDate, oilChange.frequency);
    await onSave({ ...oilChange, changeDate: form.changeDate, nextDueDate, status: computeOilChangeStatus(nextDueDate) });
  }

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
      }}
      onClick={() => !saving && onClose()}
    >
      <div
        style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 700, marginBottom: 16 }}>
          Update Oil Change — {oilChange.equipmentCode} / {oilChange.lubricationPoint}
        </p>
        <label style={s.label}>Last Change Date</label>
        <input
          style={{ ...s.input, marginBottom: 14 }}
          type="date"
          value={form.changeDate || ""}
          onChange={(e) => setForm((x) => ({ ...x, changeDate: e.target.value }))}
        />
        <label style={s.label}>Next Due Date</label>
        <input
          style={{ ...s.input, marginBottom: 20 }}
          type="date"
          value={form.nextDueDate || ""}
          onChange={(e) => setForm((x) => ({ ...x, nextDueDate: e.target.value }))}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

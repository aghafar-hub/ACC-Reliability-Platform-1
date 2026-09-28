import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail } from "../SessionContext";
import { computeOilChangeNextDue } from "../parsers";
import { toISODate } from "../actionAutofill";

// Shared by the Oil Change Log page and the Equipment tab's "Log Oil
// Change" flow. Logs a NEW event to the Oil Change LOG sheet — it never
// edits an existing row, since a change event is a historical fact.
// Quantity/oil type/contractor are auto-filled server-side from the
// point's own Equipment Registry entry; Next Due Date is computed
// server-side too (shown below as a live preview only). Done By and
// Notes are the two fields this form actually asks for beyond the date.
export default function EditOilChangeModal({ oilChange, onClose, onSave, saving }) {
  const { T, s } = useTheme();
  const sessionEmail = useSessionEmail();
  // A fresh modal mount each time it opens, and the session (if any) is
  // already available synchronously via context by then — safe to read it
  // directly in the initial state instead of an effect-driven prefill.
  const [form, setForm] = useState({
    changeDate: toISODate(oilChange.changeDate) || toISODate(new Date()),
    doneBy: sessionEmail,
    conditionNotes: "",
  });

  const nextDuePreview = computeOilChangeNextDue(form.changeDate, oilChange.frequency);

  async function handleSave() {
    await onSave({
      lpId: oilChange.lpId,
      eventDate: form.changeDate,
      doneBy: form.doneBy.trim(),
      conditionNotes: form.conditionNotes.trim(),
      contractor: oilChange.contractor,
    });
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
          Log Oil Change — {oilChange.equipmentCode} / {oilChange.lubricationPoint}
        </p>
        <label style={s.label}>Change Date</label>
        <input
          style={{ ...s.input, marginBottom: 14 }}
          type="date"
          value={form.changeDate || ""}
          onChange={(e) => setForm((x) => ({ ...x, changeDate: e.target.value }))}
        />
        <label style={s.label}>Done By</label>
        <input
          style={{ ...s.input, marginBottom: 14 }}
          type="text"
          placeholder="Technician or team"
          value={form.doneBy}
          onChange={(e) => setForm((x) => ({ ...x, doneBy: e.target.value }))}
        />
        <label style={s.label}>Notes</label>
        <textarea
          style={{ ...s.input, marginBottom: 14, minHeight: 60, resize: "vertical" }}
          placeholder="Condition notes (optional)"
          value={form.conditionNotes}
          onChange={(e) => setForm((x) => ({ ...x, conditionNotes: e.target.value }))}
        />
        <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 20 }}>
          Next due: {nextDuePreview ? nextDuePreview : "no fixed interval for this point"}
        </p>
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

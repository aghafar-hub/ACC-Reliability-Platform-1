import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail, useIsAccEngineer, useIsRouteEngineerFor } from "../SessionContext";
import * as api from "../api";
import { computeOilChangeNextDue } from "../parsers";
import { toISODate } from "../actionAutofill";

// Shared by the Oil Change Log page and the Equipment tab's "Log Oil
// Change" flow. Logs a NEW event to the Oil Change LOG sheet — it never
// edits an existing row, since a change event is a historical fact.
// Quantity/oil type/contractor are auto-filled server-side from the
// point's own Equipment Registry entry; Next Due Date is computed
// server-side too (shown below as a live preview only). Done By and
// Notes are the two fields this form actually asks for beyond the date.
// Oil changes normally come from a confirmed route (the technician's work,
// approved by the contractor's engineer). Logging one by hand is for
// engineers only, with a reason and the oil actually used (main oil or an
// approved equivalent) — the server enforces the same.
export default function EditOilChangeModal({ oilChange, onClose, onSave, webhookUrl }) {
  const { T, s } = useTheme();
  const sessionEmail = useSessionEmail();
  const isAcc = useIsAccEngineer();
  const isContractorEngineer = useIsRouteEngineerFor(oilChange.contractor || "");
  const isEngineer = isAcc || isContractorEngineer;
  const [reason, setReason] = useState("");
  const [productId, setProductId] = useState("");
  const [oils, setOils] = useState(null);
  const [error, setError] = useState("");
  const lpId = oilChange.lpId || oilChange.equipmentCode;
  useEffect(() => {
    if (!webhookUrl || !lpId) return;
    let alive = true;
    api
      .getOilPlan(webhookUrl, [lpId], "Change")
      .then((plans) => {
        if (!alive) return;
        const plan = plans[lpId];
        setOils(plan?.allowed || []);
        if (plan?.use) setProductId(plan.use.productId);
      })
      .catch(() => alive && setOils([]));
    return () => { alive = false; };
  }, [webhookUrl, lpId]);
  // A fresh modal mount each time it opens, and the session (if any) is
  // already available synchronously via context by then — safe to read it
  // directly in the initial state instead of an effect-driven prefill.
  const [form, setForm] = useState({
    changeDate: toISODate(oilChange.changeDate) || toISODate(new Date()),
    doneBy: sessionEmail,
    conditionNotes: "",
  });

  const nextDuePreview = computeOilChangeNextDue(form.changeDate, oilChange.frequency);

  function handleSave() {
    if (!reason.trim()) return setError("Enter why this oil change is logged by hand.");
    if (oils && oils.length > 0 && !productId) return setError("Choose the oil used.");
    onSave({
      reason: reason.trim(),
      productId,
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
      onClick={onClose}
    >
      <div
        style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 700, marginBottom: 16 }}>
          Log Oil Change by Hand — {oilChange.equipmentCode} / {oilChange.lubricationPoint}
        </p>
        {!isEngineer ? (
          <>
            <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 18px" }} data-testid="manual-log-blocked">
              Oil changes are logged from a confirmed route. Only an engineer can log one by hand — create a route instead.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={s.btn} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
        <>
        <p style={{ fontSize: 12, color: T.warning, margin: "0 0 14px" }}>
          Logged by hand — normally an oil change comes from a confirmed route.
        </p>
        <label style={s.label}>Reason *</label>
        <input
          style={{ ...s.input, marginBottom: 14 }}
          type="text"
          aria-label="Reason for logging by hand"
          placeholder="e.g. changed during a stoppage, not on a route"
          value={reason}
          onChange={(e) => { setReason(e.target.value); setError(""); }}
        />
        {oils && oils.length > 0 && (
          <>
            <label style={s.label}>Oil used *</label>
            <select
              style={{ ...s.select, marginBottom: 14 }}
              aria-label="Oil used"
              value={productId}
              onChange={(e) => { setProductId(e.target.value); setError(""); }}
            >
              <option value="">Choose…</option>
              {oils.map((o) => (
                <option key={o.productId} value={o.productId}>
                  {o.label}
                  {o.isEquivalent ? " (approved equivalent)" : ""}
                </option>
              ))}
            </select>
          </>
        )}
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
          <button style={s.btn} onClick={onClose}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave}>
            Save
          </button>
        </div>
        {error && <p style={{ color: T.danger, fontSize: 12, margin: "10px 0 0" }}>{error}</p>}
        </>
        )}
      </div>
    </div>
  );
}

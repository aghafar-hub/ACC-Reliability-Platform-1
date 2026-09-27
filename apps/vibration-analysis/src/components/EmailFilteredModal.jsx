import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { sendActionEmail } from "../api";
import { formatDisplayDate } from "../parsers";
import Icon from "./Icon";
import Modal from "./Modal";
import { ICONS } from "./icons";

// Action Tracker's "Email Filtered" — sends every currently-filtered action
// as one report email. Warns first if no filters are active (so a stray
// click doesn't email the entire, unfiltered Action Tracker). Ported from
// the original's `qm`. Defaults the first recipient to the same
// hardcoded address the original ships with.
export default function EmailFilteredModal({ filteredActions, hasFilters, onClose, webhookUrl }) {
  const { T, s } = useTheme();
  const [recipients, setRecipients] = useState(["aghafar@arabiancementcompany.com"]);
  const [confirmed, setConfirmed] = useState(hasFilters);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const addRecipient = () => setRecipients((r) => [...r, ""]);
  const updateRecipient = (i, value) => setRecipients((r) => r.map((v, idx) => (idx === i ? value : v)));
  const removeRecipient = (i) => setRecipients((r) => r.filter((_, idx) => idx !== i));

  const send = async () => {
    if (!webhookUrl) {
      setStatus("No webhook URL configured");
      return;
    }
    const valid = recipients.filter((r) => r.trim().includes("@"));
    if (!valid.length) {
      setStatus("Enter at least one valid email");
      return;
    }
    setSending(true);
    setStatus(`Sending ${filteredActions.length} action(s) to ${valid.length} recipient(s)…`);
    try {
      const actions = filteredActions.map((a) => ({
        actionNo: a.actionNo,
        equipmentId: a.equipmentId,
        equipmentName: a.equipmentName,
        line: a.line,
        readingDate: formatDisplayDate(a.readingDate),
        triggerType: a.triggerType,
        triggerPoint: a.triggerPoint,
        triggerValue: a.triggerValue,
        machineStatus: a.machineStatus,
        revisionDate: formatDisplayDate(a.revisionDate),
        actionStatus: a.actionStatus,
        contractor: a.contractor,
        agreedAction: a.agreedAction,
        accAction: a.accAction,
      }));
      const result = await sendActionEmail(webhookUrl, {
        recipients: JSON.stringify(valid),
        actions: JSON.stringify(actions),
        filterDesc: `${filteredActions.length} action(s)`,
      });
      setStatus(
        result && result.status === "ok"
          ? `✓ Sent ${result.count} action(s) to ${result.sent} recipient(s)`
          : "Error: " + (result?.error || "unknown")
      );
    } catch (err) {
      setStatus("Error: " + String(err.message || err));
    }
    setSending(false);
  };

  if (!confirmed) {
    return (
      <Modal title="No Filters Active" onClose={onClose} width={420}>
        <div style={{ fontSize: 13.5, color: T.textPrimary, marginBottom: 20, lineHeight: 1.6 }}>
          <span style={{ fontSize: 24, display: "block", marginBottom: 10 }}>⚠️</span>
          No filters are currently active. This will email <b style={{ color: T.warning }}>all {filteredActions.length} actions</b> to the
          selected recipients.
          <br />
          Do you want to proceed or go back and filter first?
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={s.btnSecondary} onClick={onClose}>
            Go Back & Filter
          </button>
          <button style={{ ...s.btn, background: T.warning, color: "#000" }} onClick={() => setConfirmed(true)}>
            Proceed Anyway
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Email ${filteredActions.length} Action(s)`} onClose={onClose} width={500}>
      <div style={{ ...s.cardSub, marginBottom: 14, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.6 }}>
        Sending <b style={{ color: T.textHighlight }}>{filteredActions.length} action(s)</b> matching current filters as a single email
        report.
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 8 }}>Recipients</div>
        {recipients.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              type="email"
              placeholder="email@company.com"
              value={r}
              onChange={(e) => updateRecipient(i, e.target.value)}
            />
            {recipients.length > 1 && (
              <button style={{ ...s.btnDanger, padding: "8px 10px" }} onClick={() => removeRecipient(i)}>
                ×
              </button>
            )}
          </div>
        ))}
        <button style={{ ...s.btnSecondary, fontSize: 12, marginTop: 4 }} onClick={addRecipient}>
          + Add Email
        </button>
      </div>
      {status && (
        <div style={{ fontSize: 12, fontWeight: 700, color: status.startsWith("✓") ? T.success : T.danger, marginBottom: 10 }}>
          {status}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <button style={s.btnSecondary} onClick={onClose}>
          Close
        </button>
        <button style={{ ...s.btn, display: "flex", alignItems: "center", gap: 6 }} disabled={sending} onClick={send}>
          <Icon d={ICONS.email} size={13} />{" "}
          {sending ? "Sending…" : `Send to ${recipients.filter((r) => r.includes("@")).length} Recipient(s)`}
        </button>
      </div>
    </Modal>
  );
}

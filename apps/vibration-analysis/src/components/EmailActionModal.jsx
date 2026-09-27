import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { sendActionEmail } from "../api";
import Icon from "./Icon";
import Modal from "./Modal";
import { ICONS } from "./icons";

// Emails one action to one or more recipients via the backend's
// sendActionEmail (GmailApp on the Apps Script side) — ported from the
// original's `Rm`. Defaults the first recipient field to
// "<contractor-lowercased>@arabiancementcompany.com" when the action has a
// contractor set, exactly as the original does.
export default function EmailActionModal({ action, onClose, webhookUrl }) {
  const { T, s } = useTheme();
  const [recipients, setRecipients] = useState([action.contractor ? `${action.contractor.toLowerCase()}@arabiancementcompany.com` : ""]);
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
    const valid = recipients.filter((r) => r.includes("@"));
    if (!valid.length) {
      setStatus("Enter at least one valid email");
      return;
    }
    setSending(true);
    setStatus("Sending…");
    try {
      const result = await sendActionEmail(webhookUrl, {
        recipients: JSON.stringify(valid),
        "Action No": action.actionNo,
        "Equipment ID": action.equipmentId,
        "Equipment Name": action.equipmentName,
        Line: action.line,
        Contractor: action.contractor,
        "Revision Date": action.revisionDate,
        "Machine Status": action.machineStatus,
        "Trigger Type": action.triggerType,
        "Trigger Point": action.triggerPoint,
        "Trigger Value": action.triggerValue,
        "Agreed Action": action.agreedAction,
        "ACC Action": action.accAction,
        "Reading Date": action.readingDate,
      });
      setStatus(result && result.status === "ok" ? `✓ Sent to ${result.sent} recipient(s)` : "Error: " + (result?.error || "unknown"));
    } catch (err) {
      setStatus("Error: " + String(err.message || err));
    }
    setSending(false);
  };

  return (
    <Modal title={`Email Action ${action.actionNo}`} onClose={onClose} width={480}>
      <div style={{ ...s.cardSub, marginBottom: 14, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.6 }}>
        Sending email for <b style={{ color: T.textHighlight }}>{action.equipmentName}</b> · {action.machineStatus} · Contractor:{" "}
        <b style={{ color: T.textHighlight }}>{action.contractor || "—"}</b>
      </div>
      <div style={{ marginBottom: 12 }}>
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
          <Icon d={ICONS.email} size={13} /> {sending ? "Sending…" : "Send Email"}
        </button>
      </div>
    </Modal>
  );
}

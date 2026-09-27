import { useTheme } from "../ThemeContext";
import Modal from "./Modal";

// Generic "are you sure?" dialog — ported from the original's `wd`.
export default function ConfirmModal({ label, message, onConfirm, onCancel, danger = true }) {
  const { T, s } = useTheme();
  return (
    <Modal title="Confirm" onClose={onCancel} width={420}>
      <div style={{ fontSize: 13.5, color: T.textPrimary, marginBottom: 20, lineHeight: 1.6 }}>{message || `Delete: ${label}?`}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={s.btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button style={danger ? s.btnDanger : s.btn} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </Modal>
  );
}

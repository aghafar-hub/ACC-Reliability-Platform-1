import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { combinedColorKey } from "../domain";
import { formatDisplayDate } from "../parsers";
import { pillStyle } from "../theme";
import Icon from "./Icon";
import { ICONS } from "./icons";

const ACTION_STATUS_COLOR_KEY = { Open: "danger", "In Progress": "warning", Closed: "success" };

const DETAIL_FIELDS = [
  ["Line", "line"],
  ["Trigger Type", "triggerType"],
  ["Trigger Point", "triggerPoint"],
  ["Trigger Value", "triggerValue"],
  ["Reading Date", "readingDate", true],
  ["Revision Date", "revisionDate", true],
  ["Completion Date", "completionDate", true],
  ["Contractor", "contractor"],
];

const TEXT_FIELDS = [
  ["Contractor Action", "contractorAction"],
  ["ACC Action", "accAction"],
  ["Agreed Action", "agreedAction"],
];

// One collapsible row on the Action Tracker page — ported from the
// original's `zm`.
export default function ActionRow({ action, onEdit, onDelete, onEmail }) {
  const { T, s } = useTheme();
  const [open, setOpen] = useState(false);
  const statusColor = T[combinedColorKey(action.machineStatus)] || T.info;
  const actionStatusColor = T[ACTION_STATUS_COLOR_KEY[action.actionStatus]] || T.info;

  return (
    <div style={{ ...s.card, marginBottom: 8, padding: 0, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
      >
        <span style={{ fontWeight: 800, color: T.accent, fontSize: 13, minWidth: 60 }}>{action.actionNo}</span>
        <span style={{ fontWeight: 700, color: T.textHighlight, flex: 1, minWidth: 120 }}>
          {action.equipmentName} <span style={{ fontWeight: 400, color: T.textMuted, fontSize: 11 }}>({action.equipmentId})</span>
        </span>
        <span style={pillStyle(statusColor)}>{action.machineStatus || "—"}</span>
        <span style={pillStyle(actionStatusColor)}>{action.actionStatus || "Open"}</span>
        {action.revisionDate && <span style={{ fontSize: 11, color: T.textMuted }}>{formatDisplayDate(action.revisionDate)}</span>}
        <span style={{ color: T.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "0.15s", marginLeft: "auto" }}>
          <Icon d={ICONS.chevDown} size={15} />
        </span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border2}`, padding: "12px 14px", background: T.cardSubBg }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginBottom: 12, fontSize: 12 }}
          >
            {DETAIL_FIELDS.map(([label, key, isDate]) => (
              <div key={key}>
                <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 2 }}>{label.toUpperCase()}</div>
                <div style={{ color: T.textPrimary, fontWeight: 600 }}>
                  {(isDate ? formatDisplayDate(action[key]) : action[key]) || "—"}
                </div>
              </div>
            ))}
          </div>
          {TEXT_FIELDS.map(([label, key]) =>
            action[key] ? (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 2 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 12.5, color: T.textPrimary, lineHeight: 1.5 }}>{action[key]}</div>
              </div>
            ) : null
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...s.btnSm, display: "flex", alignItems: "center", gap: 5 }} onClick={() => onEdit(action)}>
              <Icon d={ICONS.edit} size={12} /> Edit
            </button>
            <button
              style={{ ...s.btnDanger, padding: "5px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
              onClick={() => onDelete(action)}
            >
              <Icon d={ICONS.trash} size={12} /> Delete
            </button>
            <button
              style={{ ...s.btnSecondary, padding: "5px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
              onClick={() => onEmail(action)}
            >
              <Icon d={ICONS.email} size={12} /> Email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

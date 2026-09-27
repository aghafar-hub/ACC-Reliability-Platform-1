import { useTheme } from "../ThemeContext";
import { complianceColor } from "../domain";
import { pillStyle } from "../theme";
import Icon from "./Icon";
import ComplianceDot from "./ComplianceDot";
import ComplianceTimeline from "./ComplianceTimeline";
import { ICONS } from "./icons";

const LEGEND = [
  ["Y", "Normal/Yes", "success"],
  ["A", "Alarm", "danger"],
  ["D", "Danger", "purple"],
  ["C", "Caution", "warning"],
  ["M", "Missing", "#8B0000"],
  ["N", "No", "danger"],
  ["O", "Other", "warning"],
];

// One collapsible equipment row on the Compliance Tracker page — a
// 6-month preview strip that expands to the full timeline — ported from the
// original's `Bm`.
export default function ComplianceRow({ row, lastStatus, expanded, onToggle, monthFilter }) {
  const { T } = useTheme();
  const color = complianceColor(T, lastStatus);
  const preview = row.months.slice(-6);
  const hiddenCount = Math.max(0, row.months.length - 6);
  const filteredMonth = monthFilter ? row.months.find((m) => m.month === monthFilter) : null;

  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${expanded ? color : T.border}`,
        borderRadius: 10,
        marginBottom: 10,
        padding: 0,
        overflow: "hidden",
        boxShadow: expanded ? `0 0 0 2px ${color}33` : "none",
        transition: "border-color 0.15s,box-shadow 0.15s",
      }}
    >
      <div
        onClick={onToggle}
        style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, color: T.accent, fontSize: 13 }}>{row.equipmentId}</span>
            <span
              style={{
                fontSize: 11,
                color: T.textSecondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 200,
              }}
              title={row.equipment}
            >
              {row.equipment}
            </span>
            {row.line && (
              <span style={{ fontSize: 10, color: T.textMuted, background: T.border + "88", padding: "1px 6px", borderRadius: 999 }}>
                {row.line}
              </span>
            )}
          </div>
        </div>
        <div style={{ ...pillStyle(color), fontSize: 12 }}>{lastStatus || "Missing"}</div>
        {filteredMonth && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: T.textMuted }}>{monthFilter}:</span>
            <ComplianceDot status={filteredMonth.status} size={22} />
          </div>
        )}
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {preview.map((m) => (
            <ComplianceDot key={m.month} status={m.status} size={24} />
          ))}
          {hiddenCount > 0 && <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 2, fontWeight: 700 }}>+{hiddenCount}</span>}
        </div>
        <span style={{ color: T.textMuted, transform: expanded ? "rotate(180deg)" : "none", transition: "0.15s", flexShrink: 0 }}>
          <Icon d={ICONS.chevDown} size={15} />
        </span>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border2}`, padding: "12px 14px 16px", background: T.cardSubBg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Full Timeline — {row.months.length} months
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
              {LEGEND.map(([letter, label, colorKey]) => {
                const legendColor = colorKey.startsWith("#") ? colorKey : T[colorKey];
                return (
                  <span key={letter} style={{ display: "flex", alignItems: "center", gap: 4, color: T.textMuted }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: legendColor + "28",
                        border: `1.5px solid ${legendColor}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8,
                        fontWeight: 800,
                        color: legendColor,
                      }}
                    >
                      {letter}
                    </span>
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
          <ComplianceTimeline months={row.months} />
        </div>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { formatDisplayDate } from "../parsers";
import Icon from "./Icon";
import StatusBadge from "./StatusBadge";
import { ICONS } from "./icons";

// One equipment tile on the Dashboard — collapsed shows overall status +
// "driven by" chips, expanded shows the single latest RMS/SPM reading and a
// link into Graphs Dashboard — ported from the original's `km`.
export default function DashboardEquipmentCard({ eq, expanded, onToggle, setPage, setGraphAsset }) {
  const { T, s } = useTheme();
  const color = T[eq.colorKey] || T.info;
  const latestRms = useMemo(() => eq.rmsPoints.slice(0, 1), [eq.rmsPoints]);
  const latestSpm = useMemo(() => eq.spmPoints.slice(0, 1), [eq.spmPoints]);

  return (
    <div style={{ gridColumn: expanded ? "1 / -1" : "auto" }}>
      <div
        onClick={onToggle}
        style={{
          ...s.card,
          cursor: "pointer",
          padding: "12px 14px",
          borderColor: expanded ? color : T.border,
          boxShadow: expanded ? `0 0 0 2px ${color}33` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.textHighlight }}>{eq.equipmentId}</div>
            <div
              style={{
                fontSize: 11,
                color: T.textSecondary,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={eq.equipment}
            >
              {eq.equipment}
            </div>
            {eq.eqType && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{eq.eqType}</div>}
          </div>
          <StatusBadge status={eq.status || "—"} colorKey={eq.colorKey} />
        </div>
        {eq.drivenBy.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
            {eq.drivenBy.map((chip, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: T[chip.colorKey] + "22",
                  color: T[chip.colorKey],
                  border: `1px solid ${T[chip.colorKey]}44`,
                }}
              >
                {chip.type} · {chip.point}
              </span>
            ))}
          </div>
        )}
      </div>
      {expanded && (
        <div style={{ ...s.cardSub, marginTop: 6, padding: 14 }}>
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight }}>
              {eq.equipmentId} — {eq.equipment}
            </div>
            <button
              style={{ ...s.btn, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
              onClick={() => {
                setGraphAsset(eq.equipmentId);
                setPage("graphs");
              }}
            >
              <Icon d={ICONS.graphs} size={13} /> View Graphs
            </button>
          </div>
          {latestRms.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, marginBottom: 6, textTransform: "uppercase" }}>
                Latest RMS
              </div>
              {latestRms.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: T.textHighlight }}>{p.point}</span>
                  <span style={{ color: T.textSecondary }}>{formatDisplayDate(p.date)}</span>
                  <span style={{ color: T.textPrimary }}>{p.value?.toFixed(2)} mm/s</span>
                  <StatusBadge status={p.status} colorKey={p.colorKey} />
                </div>
              ))}
            </div>
          )}
          {latestSpm.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, marginBottom: 6, textTransform: "uppercase" }}>
                Latest SPM
              </div>
              {latestSpm.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: T.textHighlight }}>{p.point}</span>
                  <span style={{ color: T.textSecondary }}>{formatDisplayDate(p.date)}</span>
                  <span style={{ color: T.textPrimary }}>{p.hdm?.toFixed(1)} dBsv</span>
                  <StatusBadge status={p.status} colorKey={p.colorKey} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

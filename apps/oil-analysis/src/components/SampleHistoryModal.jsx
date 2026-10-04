import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { trackerStatusChip as statusChip } from "../theme";
import DotTimeline from "./DotTimeline";

// Opened from a chip on the Oil Sampling Log's Overdue/Missing/On Track
// board — the full monthly history for one piece of equipment, which
// DotTimeline is already a good fit for (one real dot per month, unlike
// Oil Change Log's old single-forecast-dot problem). Moved here out of
// the always-expanded inline list so the board itself stays scannable.
export default function SampleHistoryModal({ eq, status, history, oilChangedMonths, onClose }) {
  const { T, s } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const statusColors = { OK: T.success, OVERDUE: T.warning, MISSING: T.danger };
  const color = statusColors[status.label] || T.textSecondary;
  const months = Array.from(new Set([...history.map((h) => h.monthLabel), ...oilChangedMonths]));
  const shown = showAll ? months : months.slice(0, 12);

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
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 640,
          maxHeight: "86vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, color: T.accent }}>{eq.code}</span>
            <span
              style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: color + "22", color }}
            >
              {status.label}
            </span>
          </div>
          <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: T.textSecondary }}>
          {eq.description}
          {eq.area ? ` · ${eq.area}` : ""}
          {eq.contractor ? ` · ${eq.contractor}` : ""}
        </p>
        <p style={{ margin: "2px 0 16px", fontSize: 12, color: T.textMuted }}>
          Every {eq.interval || "—"} · {status.daysInfo || "—"}
        </p>

        <div style={{ height: 1, background: T.border2, marginBottom: 14 }} />

        <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 700, color: T.textHighlight }}>Sample History</p>

        {months.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.textMuted, textAlign: "center", padding: "16px 0" }}>No samples logged for this LP yet.</p>
        ) : (
          <>
            <DotTimeline
              height={44}
              dotSize={26}
              dots={[...shown].reverse().map((label, i, arr) => {
                const entry = history.find((h) => h.monthLabel === label);
                const oc = oilChangedMonths.has(label);
                const chip = entry ? statusChip(entry.status) : null;
                return {
                  key: label,
                  pct: arr.length > 1 ? (i / (arr.length - 1)) * 100 : 50,
                  letter: chip ? chip.label : "—",
                  color: chip ? chip.color : T.textMuted,
                  tooltip: `${label}: ${entry ? entry.status : "No entry"}${
                    entry?.date && entry.date !== label ? " (" + entry.date + ")" : ""
                  }${oc ? " · Oil changed" : ""}`,
                  accent: oc,
                  accentTooltip: oc ? `Oil changed — ${label}` : undefined,
                };
              })}
            />
            {months.length > 12 && (
              <button style={{ ...s.btn, fontSize: 11.5, marginTop: 10 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show recent 12 months" : `Show all ${months.length} months`}
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 16 }}>
              {[...history].slice(0, showAll ? history.length : 12).map((h) => {
                const chip = statusChip(h.status);
                const oc = oilChangedMonths.has(h.monthLabel);
                return (
                  <div
                    key={h.monthLabel}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: `1px solid ${T.border2}` }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, width: 90, flexShrink: 0 }}>{h.monthLabel}</span>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: chip.color,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {chip.label}
                    </span>
                    <span style={{ fontSize: 12, color: T.textSecondary }}>{h.status}</span>
                    {oc && (
                      <span style={{ fontSize: 10, color: "#7C3AED", marginLeft: "auto", fontWeight: 700 }}>
                        <i className="ti ti-droplet-filled-2" aria-hidden="true" /> Oil changed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

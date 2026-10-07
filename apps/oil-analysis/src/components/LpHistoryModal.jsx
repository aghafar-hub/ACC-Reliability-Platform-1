import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";

const EVENT_TYPE_COLOR = { Change: "accent", "Top Up": "warning", "Emergency Top Up": "danger" };

// Opened from a chip on the redesigned Oil Change Log board (see
// OilChangeLog.jsx) — the real event history for one LP_ID, newest first,
// pulled straight from the Oil Change LOG event log (oilChangeEvents),
// already scoped server-side to the caller's own contractor same as
// everything else this app reads (see Rbac.js's getContractorScope_ /
// filterRowsByLpContractor_ — Oil Change LOG is explicitly one of the
// sheets that join goes through), so there's nothing extra to gate here.
// This is a genuinely more useful timeline than the single forecasted dot
// the old per-row layout drew: every real past event, not one guess at
// the next one.
export default function LpHistoryModal({ oilChange, events, onClose, onLogChange }) {
  const { T, s } = useTheme();
  const history = [...(events || [])].sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  const isOverdue = oilChange.status === "Overdue";

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
          maxWidth: 560,
          maxHeight: "86vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 800, fontSize: 16, color: T.accent }}>{oilChange.equipmentCode}</span>
            {isOverdue && (
              <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: T.dangerBg, color: T.danger }}>
                OVERDUE
              </span>
            )}
          </div>
          <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: T.textSecondary }}>
          {oilChange.lubricationPoint} · {oilChange.oilType}
          {oilChange.area ? ` · ${oilChange.area}` : ""}
          {oilChange.contractor ? ` · ${oilChange.contractor}` : ""}
        </p>
        <p style={{ margin: "2px 0 16px", fontSize: 12, color: T.textMuted }}>
          {oilChange.changeDate ? `Last changed ${formatDate(oilChange.changeDate)}` : "No change logged yet"}
          {oilChange.nextDueDate ? ` · next due ${formatDate(oilChange.nextDueDate)}` : ""}
        </p>

        <div style={{ height: 1, background: T.border2, marginBottom: 14 }} />

        <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 700, color: T.textHighlight }}>Change History</p>

        {history.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.textMuted, textAlign: "center", padding: "16px 0" }}>No events logged for this LP yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {history.map((ev, i) => {
              const colorKey = EVENT_TYPE_COLOR[ev.eventType] || "accent";
              const color = T[colorKey];
              const bg = T[`${colorKey}Bg`] || T.infoBarBg;
              return (
                <div key={ev.eventId || i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {i < history.length - 1 && <span style={{ width: 2, flex: 1, background: T.border2, minHeight: 24 }} />}
                  </div>
                  <div style={{ paddingBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary }}>{formatDate(ev.eventDate)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: bg, color }}>
                        {ev.eventType}
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textSecondary }}>
                      {ev.quantityUsed ? `${ev.quantityUsed}L ` : ""}
                      {ev.oilBrandType || oilChange.brand}
                      {ev.doneBy ? ` · Done by ${ev.doneBy}` : ""}
                      {ev.contractor ? ` (${ev.contractor})` : ""}
                    </p>
                    {ev.conditionNotes && <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textMuted }}>{ev.conditionNotes}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button style={s.btnPrimary} onClick={() => onLogChange(oilChange)}>
            <i className="ti ti-plus" aria-hidden="true" /> Log Oil Change
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import EquipmentSearch from "../components/EquipmentSearch";
import EditOilChangeModal from "../components/EditOilChangeModal";
import GenerateOilChangeActionsModal from "../components/GenerateOilChangeActionsModal";
import DotTimeline from "../components/DotTimeline";

const WINDOW_BACK = 30;
const WINDOW_FWD = 90;
const WINDOW_TOTAL = WINDOW_BACK + WINDOW_FWD;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function urgencyColor(T, days) {
  if (days == null) return T.textMuted;
  if (days < 0) return T.danger;
  if (days <= 7) return T.warning;
  if (days <= 30) return T.accent;
  return T.success;
}

// Single-letter code for a due-date dot, mirroring the same four buckets
// as the page's own summary cards (Overdue / Due this week / Due this
// month / On track) so the dot's letter and the counts above it always
// agree.
function urgencyLetter(days) {
  if (days == null) return "?";
  if (days < 0) return "O";
  if (days <= 7) return "W";
  if (days <= 30) return "M";
  return "T";
}

// Every lubrication point plotted by its own next due date instead of an
// equipment-grouped accordion of status badges — the point of a due-date
// forecast is seeing what's overdue and what's about to cluster before it
// does, not browsing equipment one card at a time.
export default function OilChangeLog({ oilChanges, actions, equipmentRegistry, onSave, onAddAction }) {
  const { T, s } = useTheme();
  const [equipCode, setEquipCode] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [groupBy, setGroupBy] = useState("equipment");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  const registryByCode = useMemo(() => {
    const map = {};
    registry.forEach((r) => (map[r.code] = r));
    return map;
  }, [registry]);
  const areas = ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean)))];
  const contractors = ["All", ...Array.from(new Set(registry.map((r) => r.contractor).filter(Boolean)))];

  const points = useMemo(
    () =>
      (oilChanges || []).map((o) => {
        const reg = registryByCode[o.equipmentCode];
        return { oilChange: o, area: reg?.area || "", contractor: reg?.contractor || "", days: daysUntil(o.nextDueDate) };
      }),
    [oilChanges, registryByCode]
  );

  function matchesFilters(p) {
    const q = equipCode;
    if (q && p.oilChange.equipmentCode !== q) return false;
    if (areaFilter !== "All" && p.area !== areaFilter) return false;
    if (contractorFilter !== "All" && p.contractor !== contractorFilter) return false;
    return true;
  }

  const hasFilters = equipCode || areaFilter !== "All" || contractorFilter !== "All";
  const visible = points.filter(matchesFilters).sort((a, b) => (a.days ?? 9e9) - (b.days ?? 9e9));

  const counts = {
    Overdue: points.filter((p) => p.days != null && p.days < 0).length,
    "Due this week": points.filter((p) => p.days != null && p.days >= 0 && p.days <= 7).length,
    "Due this month": points.filter((p) => p.days != null && p.days > 7 && p.days <= 30).length,
    "On track": points.filter((p) => p.days != null && p.days > 30).length,
  };
  const countColorKey = { Overdue: "danger", "Due this week": "warning", "Due this month": "accent", "On track": "success" };

  async function handleSave(updated) {
    setSaving(true);
    try {
      await onSave(updated);
      setEditing(null);
    } catch {
      // toast already shown
    } finally {
      setSaving(false);
    }
  }

  function rowLabel(p) {
    const o = p.oilChange;
    return (
      <div style={{ width: 244, flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12.5, color: T.accent }}>{o.equipmentCode}</div>
        <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 1 }}>
          {o.lubricationPoint} · {o.oilType}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {p.area && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
                background: T.cardSubBg,
                color: T.textMuted,
                border: `1px solid ${T.border2}`,
              }}
            >
              {p.area}
            </span>
          )}
          {p.contractor && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 999,
                background: T.cardSubBg,
                color: T.textMuted,
                border: `1px solid ${T.border2}`,
              }}
            >
              {p.contractor}
            </span>
          )}
        </div>
      </div>
    );
  }

  function rowTrack(p) {
    const days = p.days;
    const clamped = days == null ? WINDOW_FWD : Math.max(-WINDOW_BACK, Math.min(WINDOW_FWD, days));
    const pct = ((clamped + WINDOW_BACK) / WINDOW_TOTAL) * 100;
    const todayPct = (WINDOW_BACK / WINDOW_TOTAL) * 100;
    const label = days == null ? "no due date" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `in ${days}d`;
    return (
      <DotTimeline
        todayPct={todayPct}
        ticks={[0, 25, 50, 75, 100]}
        dots={[
          {
            key: p.oilChange._id,
            pct,
            letter: urgencyLetter(days),
            color: urgencyColor(T, days),
            tooltip: days == null ? "No due date scheduled" : `${formatDate(p.oilChange.nextDueDate)} — ${label}`,
          },
        ]}
      />
    );
  }

  function row(p) {
    return (
      <div
        key={p.oilChange._id}
        style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${T.border2}`, padding: "11px 16px" }}
      >
        {rowLabel(p)}
        {rowTrack(p)}
        <button style={{ ...s.btn, padding: "5px 9px", flexShrink: 0 }} onClick={() => setEditing(p.oilChange)}>
          <i className="ti ti-edit" aria-hidden="true" />
        </button>
      </div>
    );
  }

  let bodyContent;
  if (visible.length === 0) {
    bodyContent = (
      <div style={{ padding: "30px 16px", textAlign: "center", color: T.textMuted, fontSize: 13 }}>
        No oil change records match the filter.
      </div>
    );
  } else if (groupBy === "equipment") {
    bodyContent = visible.map(row);
  } else {
    const byContractor = {};
    visible.forEach((p) => (byContractor[p.contractor || "Unassigned"] ||= []).push(p));
    bodyContent = Object.entries(byContractor).map(([c, list]) => (
      <div key={c}>
        <div
          style={{
            padding: "10px 16px",
            background: T.cardSubBg,
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: T.textSecondary,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {c} · {list.length} point{list.length !== 1 ? "s" : ""}
        </div>
        {list.map(row)}
      </div>
    ));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>Oil Change Forecast</p>
          <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>
            Every lubrication point plotted by its next due date — see what's overdue and what's clustering before it happens.
          </p>
        </div>
        <button style={{ ...s.btn, color: T.danger, borderColor: T.danger }} onClick={() => setGenerating(true)}>
          <i className="ti ti-clipboard-plus" aria-hidden="true" /> Generate Oil Change Actions
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {Object.entries(counts).map(([label, count]) => (
          <div
            key={label}
            style={{ ...s.card, marginBottom: 0, padding: "9px 16px", borderLeft: `3px solid ${T[countColorKey[label]]}`, minWidth: 110 }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: T[countColorKey[label]] }}>{count}</div>
            <div style={{ fontSize: 10.5, color: T.textSecondary, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <EquipmentSearch
          options={registry}
          value={equipCode || "All"}
          onChange={(v) => setEquipCode(v === "All" ? "" : v)}
          allowAll
          width={220}
          placeholder="All Assets"
        />
        {areas.length > 1 &&
          areas.map((a) => (
            <button
              key={a}
              style={{
                ...s.btn,
                fontSize: 12,
                background: areaFilter === a ? T.accent : "transparent",
                color: areaFilter === a ? T.accentText : T.textSecondary,
                borderColor: areaFilter === a ? T.accent : T.border,
              }}
              onClick={() => setAreaFilter(a)}
            >
              {a}
            </button>
          ))}
        {contractors.length > 1 &&
          contractors.map((c) => (
            <button
              key={c}
              style={{
                ...s.btn,
                fontSize: 12,
                background: contractorFilter === c ? T.accent : "transparent",
                color: contractorFilter === c ? T.accentText : T.textSecondary,
                borderColor: contractorFilter === c ? T.accent : T.border,
              }}
              onClick={() => setContractorFilter(c)}
            >
              {c}
            </button>
          ))}
        {hasFilters && (
          <button
            style={{ ...s.btn, fontSize: 12, color: T.danger, borderColor: T.danger }}
            onClick={() => {
              setEquipCode("");
              setAreaFilter("All");
              setContractorFilter("All");
            }}
          >
            <i className="ti ti-x" aria-hidden="true" /> Clear
          </button>
        )}
        <div
          style={{
            display: "inline-flex",
            background: T.cardBg,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            padding: 3,
            marginLeft: "auto",
          }}
        >
          {[
            ["equipment", "Group by Equipment"],
            ["contractor", "Group by Contractor"],
          ].map(([key, label]) => (
            <button
              key={key}
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                background: groupBy === key ? T.accent : "transparent",
                color: groupBy === key ? T.accentText : T.textSecondary,
                cursor: "pointer",
              }}
              onClick={() => setGroupBy(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ display: "flex", padding: "10px 16px 8px 260px", borderBottom: `1px solid ${T.border}`, background: T.cardSubBg }}>
          {[-WINDOW_BACK, -15, 0, 15, 30, 45, 60, 75, 90].map((d) => {
            const dt = new Date();
            dt.setDate(dt.getDate() + d);
            return (
              <span
                key={d}
                style={{
                  flex: 1,
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.textMuted,
                  textAlign: d < 0 ? "left" : d === 0 ? "center" : "right",
                }}
              >
                {d === 0 ? "Today" : formatDate(dt)}
              </span>
            );
          })}
        </div>
        {bodyContent}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          background: T.cardSubBg,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "8px 14px",
        }}
      >
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginRight: 2 }}>Legend:</span>
        {[
          ["O", T.danger, "Overdue"],
          ["W", T.warning, "Due within 7 days"],
          ["M", T.accent, "Due within 30 days"],
          ["T", T.success, "On track"],
        ].map(([letter, color, desc]) => (
          <div key={letter} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 9,
                boxShadow: `0 0 0 1px ${color}55`,
              }}
            >
              {letter}
            </div>
            <span style={{ fontSize: 11, color: T.textSecondary }}>{desc}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>Hover a dot for its exact due date.</span>
      </div>

      {editing && <EditOilChangeModal oilChange={editing} saving={saving} onClose={() => setEditing(null)} onSave={handleSave} />}

      {generating && (
        <GenerateOilChangeActionsModal
          oilChanges={oilChanges}
          actions={actions}
          equipmentRegistry={registry}
          onAddAction={onAddAction}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  );
}

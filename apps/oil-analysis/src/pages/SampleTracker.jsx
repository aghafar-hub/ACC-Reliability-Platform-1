import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { sampleTrackerStatus } from "../parsers";
import { trackerStatusChip as statusChip } from "../theme";
import EquipmentSearch from "../components/EquipmentSearch";
import DotTimeline from "../components/DotTimeline";

// The real "Oil Sample Tracker" monthly grid — parsed from the sheet tab of
// the same name, with live Data_Entry samples overlaid on top (see
// overlaySamplesOnTracker in parsers.js) so it reflects the current state
// even when a sample was added straight to the sheet. Each equipment gets a
// card showing its recent months as colored chips (N/C/A/M letter codes)
// plus a droplet badge for months an oil change happened.
export default function SampleTracker({ trackerByEquip, oilChanges, equipmentRegistry }) {
  const { T, s } = useTheme();
  const [equipCode, setEquipCode] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [expanded, setExpanded] = useState(null);

  const registry = equipmentRegistry || [];

  const oilChangedMonthsByEquip = useMemo(() => {
    const map = {};
    (oilChanges || []).forEach((o) => {
      const code = o.equipmentCode || "";
      if (!code || !o.changeDate) return;
      const d = new Date(o.changeDate);
      if (isNaN(d)) return;
      const label = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      (map[code] ||= new Set()).add(label);
    });
    return map;
  }, [oilChanges]);

  const rows = useMemo(
    () =>
      registry.map((eq) => {
        const history = trackerByEquip[eq.code] || [];
        const lastDate = history[0]?.date || "";
        const status = sampleTrackerStatus(lastDate, eq.interval);
        return { eq, history, status, oilChangedMonths: oilChangedMonthsByEquip[eq.code] || new Set() };
      }),
    [registry, trackerByEquip, oilChangedMonthsByEquip]
  );

  const counts = {
    OK: rows.filter((r) => r.status.label === "OK").length,
    OVERDUE: rows.filter((r) => r.status.label === "OVERDUE").length,
    MISSING: rows.filter((r) => r.status.label === "MISSING").length,
  };

  const areas = ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean)))];
  const classes = ["All", ...Array.from(new Set(registry.map((r) => r.assetClass).filter(Boolean)))];

  const filtered = rows.filter(
    ({ eq, status }) =>
      !(
        (equipCode && equipCode !== "All" && eq.code !== equipCode) ||
        (classFilter !== "All" && eq.assetClass !== classFilter) ||
        (areaFilter !== "All" && eq.area !== areaFilter) ||
        (statusFilter !== "All" && status.label !== statusFilter)
      )
  );

  const statusColors = { OK: T.success, OVERDUE: T.warning, MISSING: T.danger };

  return (
    <div>
      <p style={{ ...s.sectionTitle, margin: "0 0 8px" }}>Oil Sample Tracker</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "OK", count: counts.OK, color: T.success },
          { label: "OVERDUE", count: counts.OVERDUE, color: T.warning },
          { label: "MISSING", count: counts.MISSING, color: T.danger },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              ...s.card,
              textAlign: "center",
              padding: "10px 8px",
              cursor: "pointer",
              border: `2px solid ${statusFilter === c.label ? c.color : "transparent"}`,
              marginBottom: 0,
            }}
            onClick={() => setStatusFilter((f) => (f === c.label ? "All" : c.label))}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{c.count}</div>
            <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
        <div style={{ ...s.card, textAlign: "center", padding: "10px 8px", marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.textSecondary }}>{registry.length}</div>
          <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>Total</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
          background: T.cardSubBg,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "8px 14px",
        }}
      >
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginRight: 4 }}>Legend:</span>
        {[
          { label: "N", color: "#2DC653", desc: "Normal" },
          { label: "C", color: "#F4A261", desc: "Caution" },
          { label: "A", color: "#E63946", desc: "Alert" },
          { label: "M", color: "#6B8CAE", desc: "Missing sample" },
        ].map(({ label, color, desc }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 10,
                boxShadow: `0 0 0 1px ${color}55`,
              }}
            >
              {label}
            </div>
            <span style={{ fontSize: 11, color: T.textSecondary }}>{desc}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#7C3AED",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
            }}
          >
            <i className="ti ti-droplet-filled-2" aria-hidden="true" />
          </div>
          <span style={{ fontSize: 11, color: T.textSecondary }}>Oil Changed</span>
        </div>
        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>Hover a dot for its exact date.</span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Equipment
          </span>
          <EquipmentSearch
            options={registry}
            value={equipCode || "All"}
            onChange={(v) => setEquipCode(v === "All" ? "" : v)}
            allowAll
            width={220}
            placeholder="All Equipment"
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>Area</span>
          <select style={{ ...s.select, fontSize: 12, minWidth: 130 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Asset Class
          </span>
          <select style={{ ...s.select, fontSize: 12, minWidth: 130 }} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            {classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {(equipCode || classFilter !== "All" || areaFilter !== "All" || statusFilter !== "All") && (
          <button
            style={{ ...s.btn, fontSize: 12, color: T.danger, borderColor: T.danger }}
            onClick={() => {
              setEquipCode("");
              setClassFilter("All");
              setAreaFilter("All");
              setStatusFilter("All");
            }}
          >
            <i className="ti ti-x" aria-hidden="true" /> Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: T.textMuted, marginLeft: "auto" }}>
          {filtered.length} of {registry.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(({ eq, history, status, oilChangedMonths }) => {
          const color = statusColors[status.label] || T.textSecondary;
          const isMissing = status.label === "MISSING";
          const isOpen = expanded === eq.code;
          const months = Array.from(new Set([...history.map((h) => h.monthLabel), ...oilChangedMonths]));
          const shown = isOpen ? months : months.slice(0, 6);
          return (
            <div
              key={eq.code}
              style={{
                background: T.cardBg,
                border: `2px solid ${isMissing ? T.danger + "88" : isOpen ? color + "66" : T.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : eq.code)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {isMissing && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: T.danger,
                        animation: "pulse 1.2s ease-in-out infinite",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 140, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: T.accent }}>{eq.code}</span>
                      {eq.area && (
                        <span style={{ fontSize: 10, background: T.infoBarBg, color: T.accent, borderRadius: 4, padding: "1px 6px" }}>
                          {eq.area}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: T.textSecondary,
                        marginTop: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 260,
                      }}
                    >
                      {eq.description}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        background: color + "22",
                        color,
                        borderRadius: 6,
                        padding: "3px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {status.label}
                    </span>
                    <span style={{ fontSize: 10, color, whiteSpace: "nowrap" }}>{status.daysInfo}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>Every {eq.interval || "—"}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <DotTimeline
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
                  {!isOpen && months.length > 6 && (
                    <span
                      style={{
                        flexShrink: 0,
                        background: T.cardSubBg,
                        color: T.textMuted,
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      +{months.length - 6}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ ...s.card, textAlign: "center", padding: 30, color: T.textMuted, fontSize: 13 }}>
            No equipment match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

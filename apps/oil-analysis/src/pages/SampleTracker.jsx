import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import { sampleTrackerStatus, computeOilChangeNextDue } from "../parsers";
import EquipmentSearch from "../components/EquipmentSearch";
import SampleHistoryModal from "../components/SampleHistoryModal";

const WEEKS_AHEAD = 8;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function shortLabel(d) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// OVERDUE -> "Overdue", MISSING -> "Missing" map straight across from
// sampleTrackerStatus's own two bad states. OK splits into two columns
// instead of one: "Due Soon" (an OK item whose computed due date falls
// inside the window picked at the top of that column) and "On Track"
// (every other OK item — no due date at all, e.g. "If Needed", or one
// further out than the window). Every OK item lands in exactly one of
// the two — never both — so the four columns always add up to the
// filtered total. Colors mirror the original tiles: MISSING stays the
// more severe red (it's past OVERDUE's own grace period too) while
// OVERDUE keeps warning, matching every other MISSING/OVERDUE chip
// already in this app (SampleOverdue.js's digest included); Due Soon
// gets the same accent blue Oil Change Log uses for its own "coming up"
// states.
const BUCKETS = ["Overdue", "Missing", "Due Soon", "On Track"];
const BUCKET_COLOR_KEY = { Overdue: "warning", Missing: "danger", "Due Soon": "accent", "On Track": "success" };

function bucketFor(r, dueSoonCodes) {
  if (r.status.label === "OVERDUE") return "Overdue";
  if (r.status.label === "MISSING") return "Missing";
  return dueSoonCodes.has(r.eq.code) ? "Due Soon" : "On Track";
}

// Classifies a tracker/sample cell's status text into one of three real
// lab-result grades for the Condition Trend chart — "Missing"/"Pending"
// aren't lab results (nothing was analyzed yet), so they're excluded
// here rather than forced into Normal or Alert; the Overdue/Missing
// board already covers that distinction. Same prefix matching as
// theme.js's trackerStatusChip, collapsed to 3 buckets.
function conditionBucket(status) {
  const d = String(status || "").trim().toUpperCase();
  if (d.startsWith("NORM") || d === "N" || d.startsWith("SATIS") || d === "S") return "Normal";
  if (d.startsWith("CAUTI") || d.startsWith("WARN") || d === "C" || d === "W") return "Caution";
  if (d.startsWith("ALERT") || d === "A" || d.startsWith("UNSAT") || d === "U") return "Alert";
  return null;
}

function monthlyConditionTrend(entries) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString("en-GB", { month: "short" }), Normal: 0, Caution: 0, Alert: 0 });
  }
  const byKey = {};
  months.forEach((m) => (byKey[m.key] = m));
  entries.forEach((e) => {
    const bucket = conditionBucket(e.status);
    if (!bucket) return;
    const d = new Date(e.sortDate);
    if (isNaN(d)) return;
    const month = byKey[`${d.getFullYear()}-${d.getMonth()}`];
    if (!month) return;
    month[bucket]++;
  });
  return months;
}

function ChartTooltip({ T, active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      {label && <div style={{ color: T.textSecondary, marginBottom: 2 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ color: T.textPrimary, fontWeight: 700 }}>
          <span style={{ color: p.color || p.payload?.fill }}>●</span> {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

function ChipCard({ r, color, onClick }) {
  const { T } = useTheme();
  const { eq, status } = r;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: T.cardBg,
        border: `1px solid ${T.border2}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: T.accent }}>{eq.code}</div>
      <div
        style={{
          fontSize: 11,
          color: T.textSecondary,
          margin: "1px 0 5px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {eq.description}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
        {eq.area && (
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
            {eq.area}
          </span>
        )}
        {eq.contractor && (
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
            {eq.contractor}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color }}>{status.daysInfo || "—"}</div>
    </button>
  );
}

// The real "Oil Sampling Log" board — parsed from the "Oil Sample Tracker"
// sheet tab, with live Data_Entry samples overlaid on top (see
// overlaySamplesOnTracker in parsers.js) so it reflects the current state
// even when a sample was added straight to the sheet. Grouped into
// Overdue/Missing/On Track columns instead of one row per equipment (the
// old layout, like Oil Change Log's own, didn't scale past the fleet's
// own size) — clicking a chip opens its real monthly history
// (SampleHistoryModal), where DotTimeline is still a good fit since it
// already plots one real dot per month, not a single forecast.
export default function SampleTracker({ trackerByEquip, oilChanges, equipmentRegistry }) {
  const { T, s } = useTheme();
  const [equipCode, setEquipCode] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [groupBy, setGroupBy] = useState("equipment");
  const [viewingHistory, setViewingHistory] = useState(null);
  const [dueWindowMonths, setDueWindowMonths] = useState(1);

  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);

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

  const areas = ["All", ...Array.from(new Set(registry.map((r) => r.area).filter(Boolean)))];
  const classes = ["All", ...Array.from(new Set(registry.map((r) => r.assetClass).filter(Boolean)))];
  const contractors = ["All", ...Array.from(new Set(registry.map((r) => r.contractor).filter(Boolean)))];

  const hasFilters = equipCode || areaFilter !== "All" || classFilter !== "All" || contractorFilter !== "All";
  // Every chart below, and the three columns, all read off this ONE
  // filtered set — Equipment/Area/Asset Class/Contractor all narrow the
  // graphs exactly the way they narrow the board, never just one filter
  // or just the other.
  const filtered = useMemo(
    () =>
      rows.filter(
        ({ eq }) =>
          !(
            (equipCode && equipCode !== "All" && eq.code !== equipCode) ||
            (classFilter !== "All" && eq.assetClass !== classFilter) ||
            (areaFilter !== "All" && eq.area !== areaFilter) ||
            (contractorFilter !== "All" && eq.contractor !== contractorFilter)
          )
      ),
    [rows, equipCode, classFilter, areaFilter, contractorFilter]
  );

  // Every OK item's computed due date (reuses computeOilChangeNextDue —
  // same day-of-month-overflow-clamped addMonths as the Oil Change Log,
  // applied to the sampling interval instead of the change interval). An
  // item with no fixed interval ("If Needed") never gets a due date here,
  // so it can only ever land in "On Track", never "Due Soon" — there's
  // nothing to be "soon" against.
  const dueSoon = useMemo(() => {
    return filtered
      .map(({ eq, history, status }) => {
        if (status.label !== "OK") return null;
        const lastDate = history[0]?.date || "";
        if (!lastDate) return null;
        const dueDate = computeOilChangeNextDue(lastDate, eq.interval);
        if (!dueDate) return null;
        return { eq, dueDate };
      })
      .filter(Boolean)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [filtered]);

  const dueWindowCutoff = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + dueWindowMonths);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, [dueWindowMonths]);

  // Which codes fall inside the Due Soon window right now — carved OUT
  // of "On Track" below, never duplicated into both columns, so the four
  // columns always add up to exactly the filtered total.
  const dueDateByCode = useMemo(() => {
    const map = new Map();
    dueSoon.forEach(({ eq, dueDate }) => map.set(eq.code, dueDate));
    return map;
  }, [dueSoon]);
  const dueSoonCodes = useMemo(() => {
    const codes = new Set();
    dueDateByCode.forEach((dueDate, code) => {
      if (dueDate <= dueWindowCutoff) codes.add(code);
    });
    return codes;
  }, [dueDateByCode, dueWindowCutoff]);

  const byBucket = useMemo(() => {
    const map = { Overdue: [], Missing: [], "Due Soon": [], "On Track": [] };
    filtered.forEach((r) => map[bucketFor(r, dueSoonCodes)].push(r));
    map["Due Soon"].sort((a, b) => (dueDateByCode.get(a.eq.code) || "").localeCompare(dueDateByCode.get(b.eq.code) || ""));
    map["Overdue"].sort((a, b) => a.eq.code.localeCompare(b.eq.code));
    map["Missing"].sort((a, b) => a.eq.code.localeCompare(b.eq.code));
    map["On Track"].sort((a, b) => a.eq.code.localeCompare(b.eq.code));
    return map;
  }, [filtered, dueSoonCodes, dueDateByCode]);

  // ── Chart 1: Samples Due by Week ────────────────────────────────────
  const weeklyData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => {
      const start = new Date(today);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { label: `${shortLabel(start)}–${shortLabel(end)}`, Due: 0 };
    });
    dueSoon.forEach(({ dueDate }) => {
      const days = daysUntil(dueDate);
      if (days == null || days < 0) return;
      const idx = Math.min(WEEKS_AHEAD - 1, Math.floor(days / 7));
      weeks[idx].Due++;
    });
    return weeks;
  }, [dueSoon]);

  // ── Chart 2: Status by Contractor ───────────────────────────────────
  const contractorData = useMemo(() => {
    const byContractor = {};
    filtered.forEach((r) => {
      const c = r.eq.contractor || "Unassigned";
      (byContractor[c] ||= { contractor: c, Overdue: 0, Missing: 0, "Due Soon": 0, "On Track": 0 });
      byContractor[c][bucketFor(r, dueSoonCodes)]++;
    });
    return Object.values(byContractor);
  }, [filtered, dueSoonCodes]);

  // ── Chart 3: Oil condition trend, from real lab-result history ─────
  const trendData = useMemo(() => {
    const entries = [];
    filtered.forEach((r) => entries.push(...(trackerByEquip[r.eq.code] || [])));
    return monthlyConditionTrend(entries);
  }, [filtered, trackerByEquip]);

  return (
    <div>
      <p style={{ ...s.sectionTitle, margin: "0 0 8px" }}>Oil Sampling Log</p>

      {/* ====== GRAPHS ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ ...s.card, marginBottom: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: T.textHighlight }}>
            Samples Due — Next {WEEKS_AHEAD} Weeks
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.textMuted }}>LPs due per week — see clustering before it happens.</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: T.textMuted }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
              <Bar dataKey="Due" fill={T.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...s.card, marginBottom: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: T.textHighlight }}>Status by Contractor</p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.textMuted }}>Where each contractor stands right now.</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={contractorData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="contractor" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
              <Bar dataKey="Overdue" fill={T.warning} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Missing" fill={T.danger} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Due Soon" fill={T.accent} radius={[3, 3, 0, 0]} />
              <Bar dataKey="On Track" fill={T.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...s.card, marginBottom: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: T.textHighlight }}>Oil Condition Trend</p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.textMuted }}>Last 6 months of real lab results — Normal / Caution / Alert.</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
              <Bar dataKey="Normal" stackId="s" fill={T.success} />
              <Bar dataKey="Caution" stackId="s" fill={T.warning} />
              <Bar dataKey="Alert" stackId="s" fill={T.danger} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ====== FILTERS (Area/Asset Class/Contractor now real dropdowns) ====== */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Contractor
          </span>
          <select
            style={{ ...s.select, fontSize: 12, minWidth: 130 }}
            value={contractorFilter}
            onChange={(e) => setContractorFilter(e.target.value)}
          >
            {contractors.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            style={{ ...s.btn, fontSize: 12 }}
            onClick={() => {
              setEquipCode("");
              setClassFilter("All");
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

      {/* ====== FOUR-COLUMN BOARD (Due Soon's own window picker sits in its column header) ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginBottom: 16 }}>
        {BUCKETS.map((bucket) => {
          const colorKey = BUCKET_COLOR_KEY[bucket];
          const color = T[colorKey];
          const bg = T[`${colorKey}Bg`] || T.infoBarBg;
          const list = byBucket[bucket];
          const groups =
            groupBy === "contractor"
              ? Object.entries(
                  list.reduce((acc, r) => {
                    (acc[r.eq.contractor || "Unassigned"] ||= []).push(r);
                    return acc;
                  }, {})
                )
              : [[null, list]];
          return (
            <div key={bucket}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  background: bg,
                  borderRadius: "8px 8px 0 0",
                  border: `1px solid ${T.border}`,
                  borderBottom: "none",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase" }}>{bucket}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color }}>{list.length}</span>
              </div>
              {bucket === "Due Soon" && (
                <div
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${T.border}`,
                    borderTop: "none",
                    borderBottom: "none",
                    background: T.cardBg,
                  }}
                >
                  <select
                    style={{ ...s.select, fontSize: 11.5, width: "100%" }}
                    value={dueWindowMonths}
                    onChange={(e) => setDueWindowMonths(Number(e.target.value))}
                  >
                    <option value={1}>Within 1 month</option>
                    <option value={2}>Within 2 months</option>
                    <option value={3}>Within 3 months</option>
                  </select>
                </div>
              )}
              <div
                style={{
                  border: `1px solid ${T.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  padding: 10,
                  maxHeight: 460,
                  overflowY: "auto",
                  background: T.cardSubBg,
                }}
              >
                {list.length === 0 && <div style={{ textAlign: "center", color: T.textMuted, fontSize: 12, padding: "16px 0" }}>None</div>}
                {groups.map(([groupName, groupList]) => (
                  <div key={groupName || "all"}>
                    {groupName && (
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", margin: "4px 0 6px" }}>
                        {groupName} · {groupList.length}
                      </div>
                    )}
                    {groupList.map((r) => (
                      <ChipCard key={r.eq.code} r={r} color={color} onClick={() => setViewingHistory(r)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", padding: 30, color: T.textMuted, fontSize: 13 }}>
          No equipment match the current filters.
        </div>
      )}

      {viewingHistory && (
        <SampleHistoryModal
          eq={viewingHistory.eq}
          status={viewingHistory.status}
          history={viewingHistory.history}
          oilChangedMonths={viewingHistory.oilChangedMonths}
          onClose={() => setViewingHistory(null)}
        />
      )}

    </div>
  );
}

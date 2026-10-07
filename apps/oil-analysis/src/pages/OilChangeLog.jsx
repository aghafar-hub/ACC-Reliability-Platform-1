import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "../ThemeContext";
import EquipmentSearch from "../components/EquipmentSearch";
import EditOilChangeModal from "../components/EditOilChangeModal";
import GenerateOilChangeActionsModal from "../components/GenerateOilChangeActionsModal";
import LpHistoryModal from "../components/LpHistoryModal";
import MobileFilterToggle from "../components/MobileFilterToggle";
import useIsMobile from "../hooks/useIsMobile";

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

// Same four buckets everywhere on this page — the column headers, the
// Status by Contractor chart, and each chip's own urgency text all read
// off this one function so they can never disagree with each other.
function statusBucket(days) {
  if (days == null) return "On track"; // no fixed interval ("If Needed") — never urgent, matches sampleTrackerStatus's own convention
  if (days < 0) return "Overdue";
  if (days <= 7) return "Due this week";
  if (days <= 30) return "Due this month";
  return "On track";
}
const BUCKET_COLOR_KEY = { Overdue: "danger", "Due this week": "warning", "Due this month": "accent", "On track": "success" };
const BUCKETS = ["Overdue", "Due this week", "Due this month", "On track"];

function dueText(days) {
  if (days == null) return "no fixed interval";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

function shortLabel(d) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// "Change" events only — a Top Up is reactive, not a scheduled interval,
// so it has no due date of its own to be late against. Sorted per LP,
// each change after the first is "late" if it landed after the PREVIOUS
// change's own nextDueDate (the due date that event was actually
// supposed to meet) — the first change for an LP has no prior due date
// to compare against, so it's left unclassified rather than guessed.
function classifyChangeHistory(events) {
  const byLp = {};
  (events || []).forEach((ev) => {
    if (ev.eventType !== "Change") return;
    (byLp[ev.lpId] ||= []).push(ev);
  });
  const classified = [];
  Object.values(byLp).forEach((list) => {
    const sorted = [...list].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    for (let i = 1; i < sorted.length; i++) {
      const prevDue = new Date(sorted[i - 1].nextDueDate);
      const thisDate = new Date(sorted[i].eventDate);
      if (isNaN(prevDue) || isNaN(thisDate)) continue;
      classified.push({ eventDate: sorted[i].eventDate, late: thisDate > prevDue });
    }
  });
  return classified;
}

function monthlyOnTimeTrend(classified) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleDateString("en-GB", { month: "short" }), "On time": 0, Late: 0 });
  }
  const byKey = {};
  months.forEach((m) => (byKey[m.key] = m));
  classified.forEach((c) => {
    const d = new Date(c.eventDate);
    if (isNaN(d)) return;
    const bucket = byKey[`${d.getFullYear()}-${d.getMonth()}`];
    if (!bucket) return;
    bucket[c.late ? "Late" : "On time"]++;
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

function ChipCard({ p, color, onClick }) {
  const { T } = useTheme();
  const o = p.oilChange;
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
      <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: T.accent }}>{o.equipmentCode}</div>
      <div style={{ fontSize: 11, color: T.textSecondary, margin: "1px 0 5px" }}>
        {o.lubricationPoint} · {o.oilType}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
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
      <div style={{ fontSize: 10.5, fontWeight: 700, color }}>{dueText(p.days)}</div>
    </button>
  );
}

// Every lubrication point grouped into one of four status columns instead
// of a one-dot-per-row timeline — the old layout only ever plotted a
// single forecasted dot per row, which doesn't scale past ~20-30 points
// and gives up exactly the clustering view it was meant to show. That's
// now the job of the "Upcoming Changes by Week" chart above; clicking any
// chip opens its REAL event history instead (LpHistoryModal).
export default function OilChangeLog({ webhookUrl, oilChanges, oilChangeEvents, actions, equipmentRegistry, onSave, onAddAction }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(!isMobile);
  const [equipCode, setEquipCode] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [contractorFilter, setContractorFilter] = useState("All");
  const [groupBy, setGroupBy] = useState("equipment");
  const [editing, setEditing] = useState(null);
  const [viewingHistory, setViewingHistory] = useState(null);
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

  const hasFilters = equipCode || areaFilter !== "All" || contractorFilter !== "All";
  // Every chart on this page, and the four columns below, all read off
  // this ONE filtered set — selecting a contractor (or area, or a single
  // asset) narrows the graphs exactly the same way it narrows the board,
  // never just one or the other.
  const visible = useMemo(
    () =>
      points.filter((p) => {
        if (equipCode && p.oilChange.equipmentCode !== equipCode) return false;
        if (areaFilter !== "All" && p.area !== areaFilter) return false;
        if (contractorFilter !== "All" && p.contractor !== contractorFilter) return false;
        return true;
      }),
    [points, equipCode, areaFilter, contractorFilter]
  );

  const byBucket = useMemo(() => {
    const map = { Overdue: [], "Due this week": [], "Due this month": [], "On track": [] };
    visible.forEach((p) => map[statusBucket(p.days)].push(p));
    BUCKETS.forEach((b) => map[b].sort((a, b2) => (a.days ?? 9e9) - (b2.days ?? 9e9)));
    return map;
  }, [visible]);

  // ── Chart 1: Upcoming Changes by Week ───────────────────────────────
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
    visible.forEach((p) => {
      if (p.days == null || p.days < 0) return;
      const idx = Math.min(WEEKS_AHEAD - 1, Math.floor(p.days / 7));
      weeks[idx].Due++;
    });
    return weeks;
  }, [visible]);

  // ── Chart 2: Status by Contractor ───────────────────────────────────
  const contractorData = useMemo(() => {
    const byContractor = {};
    visible.forEach((p) => {
      const c = p.contractor || "Unassigned";
      (byContractor[c] ||= { contractor: c, Overdue: 0, "Due this week": 0, "Due this month": 0, "On track": 0 });
      byContractor[c][statusBucket(p.days)]++;
    });
    return Object.values(byContractor);
  }, [visible]);

  // ── Chart 3: Changes done on time vs late, from real history ───────
  const trendData = useMemo(() => {
    const visibleCodes = new Set(visible.map((p) => p.oilChange.equipmentCode));
    const relevant = (oilChangeEvents || []).filter((ev) => visibleCodes.has(ev.lpId));
    return monthlyOnTimeTrend(classifyChangeHistory(relevant));
  }, [visible, oilChangeEvents]);

  function historyForLp(lpId) {
    return (oilChangeEvents || []).filter((ev) => ev.lpId === lpId);
  }

  // PERFORMANCE: onSave (App.jsx's onSaveOilChange) already applies this
  // event to local state immediately and only verifies/rolls back in the
  // background — see that function's own comment. Not awaiting it here,
  // and closing the modal right away, is what makes this feel instant
  // instead of sitting on "Saving…" for the network round trip.
  function handleSave(updated) {
    onSave(updated).catch(() => {});
    setEditing(null);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>Oil Change Forecast</p>
          <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>
            Every lubrication point tracked by its next due date — see what's overdue and what's clustering before it happens.
          </p>
        </div>
        <button style={{ ...s.btn, color: T.danger, borderColor: T.danger }} onClick={() => setGenerating(true)}>
          <i className="ti ti-clipboard-plus" aria-hidden="true" /> Generate Oil Change Actions
        </button>
      </div>

      {/* ====== GRAPHS ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ ...s.card, marginBottom: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: T.textHighlight }}>
            Upcoming Changes — Next {WEEKS_AHEAD} Weeks
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
              <Bar dataKey="Overdue" fill={T.danger} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Due this week" fill={T.warning} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Due this month" fill={T.accent} radius={[3, 3, 0, 0]} />
              <Bar dataKey="On track" fill={T.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...s.card, marginBottom: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: T.textHighlight }}>Changes Done: On Time vs Late</p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: T.textMuted }}>Last 6 months, from real change history.</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: T.textSecondary }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<ChartTooltip T={T} />} cursor={{ fill: T.accent + "10" }} />
              <Bar dataKey="On time" stackId="s" fill={T.success} />
              <Bar dataKey="Late" stackId="s" fill={T.danger} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ====== FILTERS (Area/Contractor now real dropdowns) ====== */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        {isMobile && (
          <MobileFilterToggle
            open={filtersOpen}
            onToggle={() => setFiltersOpen((o) => !o)}
            activeCount={(equipCode ? 1 : 0) + (areaFilter !== "All" ? 1 : 0) + (contractorFilter !== "All" ? 1 : 0)}
          />
        )}
        {filtersOpen && (
          <>
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
                placeholder="All Assets"
              />
            </div>
            {areas.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Area
                </span>
                <select style={{ ...s.select, fontSize: 12, minWidth: 140 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                  {areas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}
            {contractors.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Contractor
                </span>
                <select
                  style={{ ...s.select, fontSize: 12, minWidth: 140 }}
                  value={contractorFilter}
                  onChange={(e) => setContractorFilter(e.target.value)}
                >
                  {contractors.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            {hasFilters && (
              <button
                style={{ ...s.btn, fontSize: 12 }}
                onClick={() => {
                  setEquipCode("");
                  setAreaFilter("All");
                  setContractorFilter("All");
                }}
              >
                <i className="ti ti-x" aria-hidden="true" /> Clear
              </button>
            )}
          </>
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

      {/* ====== FOUR-COLUMN BOARD ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginBottom: 16 }}>
        {BUCKETS.map((bucket) => {
          const colorKey = BUCKET_COLOR_KEY[bucket];
          const color = T[colorKey];
          const bg = T[`${colorKey}Bg`] || T.infoBarBg;
          const list = byBucket[bucket];
          const groups =
            groupBy === "contractor"
              ? Object.entries(
                  list.reduce((acc, p) => {
                    (acc[p.contractor || "Unassigned"] ||= []).push(p);
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
                    {groupList.map((p) => (
                      <ChipCard key={p.oilChange._id} p={p} color={color} onClick={() => setViewingHistory(p.oilChange)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", padding: 30, color: T.textMuted, fontSize: 13 }}>No oil change records match the filter.</div>
      )}

      {editing && <EditOilChangeModal webhookUrl={webhookUrl} oilChange={editing} onClose={() => setEditing(null)} onSave={handleSave} />}

      {viewingHistory && (
        <LpHistoryModal
          oilChange={viewingHistory}
          events={historyForLp(viewingHistory.equipmentCode)}
          onClose={() => setViewingHistory(null)}
          onLogChange={(oc) => {
            setViewingHistory(null);
            setEditing(oc);
          }}
        />
      )}

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

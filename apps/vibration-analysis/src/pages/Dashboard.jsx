import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import DashboardEquipmentCard from "../components/DashboardEquipmentCard";
import StatusDonut from "../components/StatusDonut";
import Icon from "../components/Icon";
import { ICONS } from "../components/icons";
import { buildDashboardEntries } from "../domain";

const STATUS_TILES = [
  { key: "Good", label: "Good", colorKey: "success" },
  { key: "Acceptable", label: "Acceptable", colorKey: "warning" },
  { key: "Alarm", label: "Alarm", colorKey: "danger" },
  { key: "Danger", label: "Danger", colorKey: "purple" },
];

// Landing page: equipment-count donut, 4 status tiles, quick filters, and a
// grid of per-equipment status cards — ported from the original's `Cm`.
export default function Dashboard({ lastRms, lastSpm, registryMap, rmsRegMap, spmRegMap, thresholdsMap, setPage, setGraphAsset }) {
  const { T, s } = useTheme();
  const [activeSlice, setActiveSlice] = useState(null);
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const entriesMap = useMemo(
    () => buildDashboardEntries(lastRms, lastSpm, registryMap, rmsRegMap, spmRegMap, thresholdsMap),
    [lastRms, lastSpm, registryMap, rmsRegMap, spmRegMap, thresholdsMap]
  );
  const entries = useMemo(() => Array.from(entriesMap.values()).sort((a, b) => a.equipmentId.localeCompare(b.equipmentId)), [entriesMap]);

  const lines = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.line)))
        .filter(Boolean)
        .sort(),
    [entries]
  );
  const eqTypes = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.eqType)))
        .filter(Boolean)
        .sort(),
    [entries]
  );
  const equipmentOptions = useMemo(
    () =>
      entries
        .filter((e) => (!line || e.line === line) && (!eqType || e.eqType === eqType))
        .map((e) => e.equipmentId)
        .sort(),
    [entries, line, eqType]
  );

  const statusCounts = useMemo(() => {
    const counts = { Good: 0, Acceptable: 0, Alarm: 0, Danger: 0 };
    entries.forEach((e) => {
      if (e.status && counts[e.status] !== undefined) counts[e.status]++;
    });
    return counts;
  }, [entries]);
  const total = entries.length;

  const filtered = useMemo(() => {
    let list = entries;
    if (activeSlice) list = list.filter((e) => e.status === activeSlice);
    if (line) list = list.filter((e) => e.line === line);
    if (eqType) list = list.filter((e) => e.eqType === eqType);
    if (equipmentId) list = list.filter((e) => e.equipmentId === equipmentId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.equipmentId.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q));
    }
    return list;
  }, [entries, activeSlice, line, eqType, equipmentId, search]);

  const donutSlices = [
    { key: "Good", label: "Good", count: statusCounts.Good, color: T.success },
    { key: "Acceptable", label: "Acceptable", count: statusCounts.Acceptable, color: T.warning },
    { key: "Alarm", label: "Alarm", count: statusCounts.Alarm, color: T.danger },
    { key: "Danger", label: "Danger", count: statusCounts.Danger, color: T.purple || T.accent },
  ].filter((slice) => slice.count > 0);

  const hasActiveFilter = activeSlice || line || eqType || equipmentId || search;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <div style={s.card}>
          <StatusDonut
            slices={donutSlices}
            total={total}
            onClick={(key) => setActiveSlice(activeSlice === key ? null : key)}
            activeSlice={activeSlice}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...s.card, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {STATUS_TILES.map((tile) => (
              <div
                key={tile.key}
                onClick={() => setActiveSlice(activeSlice === tile.key ? null : tile.key)}
                style={{
                  ...s.metric,
                  cursor: "pointer",
                  borderColor: activeSlice === tile.key ? T[tile.colorKey] : T.border,
                  boxShadow: activeSlice === tile.key ? `0 0 0 2px ${T[tile.colorKey]}33` : "none",
                  minWidth: 100,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: T[tile.colorKey], marginBottom: 4, letterSpacing: 0.5 }}>
                  {tile.label.toUpperCase()}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: T.textHighlight }}>{statusCounts[tile.key]}</div>
              </div>
            ))}
          </div>
          <div style={s.card}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.textSecondary,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Quick Filters
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...s.input, width: 140 }} value={line} onChange={(e) => setLine(e.target.value)}>
                <option value="">All Lines</option>
                {lines.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                style={{ ...s.input, width: 140 }}
                value={eqType}
                onChange={(e) => {
                  setEqType(e.target.value);
                  setEquipmentId("");
                }}
              >
                <option value="">All Eq Types</option>
                {eqTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select style={{ ...s.input, width: 160 }} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                <option value="">All Equipment</option>
                {equipmentOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                <span style={{ position: "absolute", left: 9, top: 8, color: T.textMuted }}>
                  <Icon d={ICONS.search} size={14} />
                </span>
                <input
                  style={{ ...s.input, paddingLeft: 30 }}
                  placeholder="Search equipment…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {hasActiveFilter && (
                <button
                  style={s.btnSecondary}
                  onClick={() => {
                    setActiveSlice(null);
                    setLine("");
                    setEqType("");
                    setEquipmentId("");
                    setSearch("");
                  }}
                >
                  Clear
                </button>
              )}
              <span style={{ fontSize: 12, color: T.textMuted }}>
                {filtered.length}/{total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 50 }}>
          No data yet — sync the app, then run <b>Backfill Last Readings</b> in Settings → System.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
          {filtered.map((eq) => (
            <DashboardEquipmentCard
              key={eq.equipmentId}
              eq={eq}
              expanded={expanded === eq.equipmentId}
              onToggle={() => setExpanded(expanded === eq.equipmentId ? null : eq.equipmentId)}
              setPage={setPage}
              setGraphAsset={setGraphAsset}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", color: T.textMuted, padding: 40 }}>
              No equipment matches current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

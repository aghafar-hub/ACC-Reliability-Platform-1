import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import ComplianceRow from "../components/ComplianceRow";
import Icon from "../components/Icon";
import { ICONS } from "../components/icons";
import { worseStatus } from "../domain";

const TILES = [
  { key: "Normal", label: "Normal", colorKey: "success" },
  { key: "Caution", label: "Caution", colorKey: "warning" },
  { key: "Alarm", label: "Alarm / Danger", colorKey: "danger" },
  { key: "Missing", label: "No Reading", colorKey: "textMuted" },
];

// Reads the Compliance Tracker sheet: per-equipment month-by-month
// compliance dots, plus each equipment's rolled-up "last" machine status
// combined from its Last RMS and Last SPM rows. Ported from the original's
// `Im`.
export default function ComplianceTracker({ compliance, lastRms, lastSpm, registryMap }) {
  const { T, s } = useTheme();
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const lines = useMemo(
    () =>
      Array.from(new Set(compliance.map((c) => c.line)))
        .filter(Boolean)
        .sort(),
    [compliance]
  );
  const eqTypes = useMemo(() => {
    const set = new Set();
    compliance.forEach((c) => {
      const t = registryMap[c.equipmentId]?.eqType;
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [compliance, registryMap]);
  const equipmentOptions = useMemo(
    () =>
      compliance
        .filter((c) => (!line || c.line === line) && (!eqType || (registryMap[c.equipmentId]?.eqType || "") === eqType))
        .map((c) => c.equipmentId)
        .sort(),
    [compliance, line, eqType, registryMap]
  );
  const months = useMemo(() => {
    const set = new Set();
    compliance.forEach((c) => c.months.forEach((m) => m.month && set.add(m.month)));
    return Array.from(set).sort().reverse();
  }, [compliance]);

  const lastStatusByEquipment = useMemo(() => {
    const map = {};
    lastRms.forEach((r) => {
      if (r.machineStatus) map[r.equipmentId] = map[r.equipmentId] ? worseStatus(map[r.equipmentId], r.machineStatus) : r.machineStatus;
    });
    lastSpm.forEach((r) => {
      if (r.machineStatus) map[r.equipmentId] = map[r.equipmentId] ? worseStatus(map[r.equipmentId], r.machineStatus) : r.machineStatus;
    });
    return map;
  }, [lastRms, lastSpm]);

  const tileCounts = useMemo(() => {
    const counts = { Normal: 0, Caution: 0, Alarm: 0, Missing: 0 };
    compliance.forEach((c) => {
      const status = lastStatusByEquipment[c.equipmentId] || "";
      if (!status) counts.Missing++;
      else if (status === "Good" || status === "Normal" || status === "Acceptable") counts.Normal++;
      else if (status === "Caution") counts.Caution++;
      else counts.Alarm++;
    });
    return counts;
  }, [compliance, lastStatusByEquipment]);

  let filtered = compliance;
  if (line) filtered = filtered.filter((c) => c.line === line);
  if (eqType) filtered = filtered.filter((c) => (registryMap[c.equipmentId]?.eqType || "") === eqType);
  if (equipmentId) filtered = filtered.filter((c) => c.equipmentId === equipmentId);
  if (statusFilter) {
    filtered = filtered.filter((c) => {
      const status = lastStatusByEquipment[c.equipmentId] || "";
      if (statusFilter === "Normal") return status === "Good" || status === "Normal" || status === "Acceptable";
      if (statusFilter === "Caution") return status === "Caution";
      if (statusFilter === "Alarm") return status === "Alarm" || status === "Danger";
      if (statusFilter === "Missing") return !status;
      return true;
    });
  }
  if (monthFilter)
    filtered = filtered.filter((c) =>
      c.months.some((m) => m.month === monthFilter && m.status && m.status !== "Missing" && m.status !== "")
    );
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((c) => c.equipmentId.toLowerCase().includes(q) || c.equipment.toLowerCase().includes(q));
  }

  const hasActiveFilter = line || eqType || equipmentId || statusFilter || monthFilter || search;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 16 }}>
        {TILES.map((tile) => (
          <div
            key={tile.key}
            onClick={() => setStatusFilter(statusFilter === tile.key ? "" : tile.key)}
            style={{
              ...s.card,
              cursor: "pointer",
              textAlign: "center",
              padding: "14px 10px",
              borderColor: statusFilter === tile.key ? T[tile.colorKey] : T.border,
              boxShadow: statusFilter === tile.key ? `0 0 0 2px ${T[tile.colorKey]}33` : "none",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T[tile.colorKey],
                marginBottom: 4,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {tile.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.textHighlight }}>{tileCounts[tile.key]}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select
          style={{ ...s.input, width: 130 }}
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            setEqType("");
            setEquipmentId("");
          }}
        >
          <option value="">All Lines</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          style={{ ...s.input, width: 130 }}
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
        <select style={{ ...s.input, width: 150 }} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">All Equipment</option>
          {equipmentOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 150 }} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">All Months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <span style={{ position: "absolute", left: 9, top: 8, color: T.textMuted }}>
            <Icon d={ICONS.search} size={14} />
          </span>
          <input style={{ ...s.input, paddingLeft: 30 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {hasActiveFilter && (
          <button
            style={s.btnSecondary}
            onClick={() => {
              setLine("");
              setEqType("");
              setEquipmentId("");
              setStatusFilter("");
              setMonthFilter("");
              setSearch("");
            }}
          >
            Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {filtered.length}/{compliance.length}
        </span>
      </div>

      {compliance.length === 0 ? (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 50 }}>
          No compliance data — sync the app to load from the Compliance Tracker sheet.
        </div>
      ) : (
        <div>
          {filtered.map((row) => (
            <ComplianceRow
              key={row.equipmentId}
              row={row}
              lastStatus={lastStatusByEquipment[row.equipmentId] || ""}
              expanded={expanded === row.equipmentId}
              onToggle={() => setExpanded(expanded === row.equipmentId ? null : row.equipmentId)}
              monthFilter={monthFilter}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 40 }}>No equipment matches current filters.</div>
          )}
        </div>
      )}
    </div>
  );
}

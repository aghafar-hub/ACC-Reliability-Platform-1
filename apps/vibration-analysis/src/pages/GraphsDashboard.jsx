import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import LineChart from "../components/LineChart";
import { resolveThresholds } from "../domain";

// Per-equipment trend charts: one chart per RMS measurement point (Axial /
// Horiz / Vert / Max, with dashed Good/Acceptable/Alarm threshold lines)
// and one per SPM point (HDm / HDc, with dashed Normal/Caution lines), over
// a selectable time range. Ported from the original's `Dm`.
export default function GraphsDashboard({ registryList, rms, spm, graphAsset, setGraphAsset, thresholdsMap, rmsRegMap, spmRegMap }) {
  const { T, s } = useTheme();
  const [equipmentId, setEquipmentId] = useState(graphAsset || "");
  const [range, setRange] = useState("12");
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");

  useEffect(() => {
    if (graphAsset) setEquipmentId(graphAsset);
  }, [graphAsset]);

  const equipment = registryList.find((r) => r.equipmentId === equipmentId) || {};
  const thresholds = resolveThresholds(thresholdsMap, equipmentId, rmsRegMap, spmRegMap);
  const cutoff = range === "all" ? null : new Date(Date.now() - parseInt(range) * 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const rmsRows = rms
    .filter((r) => r.equipmentId === equipmentId && (!cutoff || r.date >= cutoff))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const spmRows = spm
    .filter((r) => r.equipmentId === equipmentId && (!cutoff || r.date >= cutoff))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const rmsPointsWithData = Array.from(new Set(rmsRows.map((r) => r.point)));
  const spmPointsWithData = Array.from(new Set(spmRows.map((r) => r.point)));

  const rmsThresholdLines = [
    { value: thresholds.rms.good, color: T.success, label: "Good" },
    { value: thresholds.rms.acceptable, color: T.warning, label: "Acceptable" },
    { value: thresholds.rms.alarm, color: T.danger, label: "Alarm" },
  ];
  const spmThresholdLines = [
    { value: thresholds.spm.normal, color: T.success, label: "Normal" },
    { value: thresholds.spm.caution, color: T.warning, label: "Caution" },
  ];

  const lines = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.line)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const eqTypes = useMemo(
    () =>
      Array.from(new Set(registryList.map((r) => r.eqType)))
        .filter(Boolean)
        .sort(),
    [registryList]
  );
  const equipmentOptions = useMemo(
    () =>
      registryList
        .filter((r) => (!line || r.line === line) && (!eqType || r.eqType === eqType))
        .map((r) => r.equipmentId)
        .sort(),
    [registryList, line, eqType]
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          style={{ ...s.input, width: 130 }}
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            setEqType("");
            setEquipmentId("");
            setGraphAsset("");
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
          style={{ ...s.input, width: 140 }}
          value={eqType}
          onChange={(e) => {
            setEqType(e.target.value);
            setEquipmentId("");
            setGraphAsset("");
          }}
        >
          <option value="">All Eq Types</option>
          {eqTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          style={{ ...s.input, width: 240 }}
          value={equipmentId}
          onChange={(e) => {
            setEquipmentId(e.target.value);
            setGraphAsset(e.target.value);
          }}
        >
          <option value="">Select equipment…</option>
          {equipmentOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select style={{ ...s.input, width: 160 }} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="3">Last 3 months</option>
          <option value="6">Last 6 months</option>
          <option value="12">Last 12 months</option>
          <option value="all">All time</option>
        </select>
      </div>

      {equipmentId && (
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textHighlight, marginBottom: 14 }}>
          {equipment.equipment} · {equipment.line}
        </div>
      )}

      {rmsPointsWithData.map((point) => {
        const pointRows = rmsRows.filter((r) => r.point === point);
        return (
          <div key={point} style={{ marginBottom: 16 }}>
            <LineChart
              title={`RMS — ${point}`}
              unit="mm/s"
              series={[
                { name: "Axial", color: T.accent, data: pointRows.map((r) => ({ x: r.date, y: r.axial })) },
                { name: "Horiz", color: T.success, data: pointRows.map((r) => ({ x: r.date, y: r.horizontal })) },
                { name: "Vert", color: T.warning, data: pointRows.map((r) => ({ x: r.date, y: r.vertical })) },
                { name: "Max", color: T.danger, data: pointRows.map((r) => ({ x: r.date, y: r.maxVel })) },
              ]}
              thresholds={rmsThresholdLines}
            />
          </div>
        );
      })}

      {spmPointsWithData.map((point) => {
        const pointRows = spmRows.filter((r) => r.point === point);
        return (
          <div key={point} style={{ marginBottom: 16 }}>
            <LineChart
              title={`SPM — ${point}`}
              unit="dBsv"
              series={[
                { name: "HDm", color: T.accent, data: pointRows.map((r) => ({ x: r.date, y: r.hdm })) },
                { name: "HDc", color: T.info, data: pointRows.map((r) => ({ x: r.date, y: r.hdc })) },
              ]}
              thresholds={spmThresholdLines}
            />
          </div>
        );
      })}

      {!equipmentId && (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 60 }}>Select equipment to view trend charts.</div>
      )}
      {equipmentId && rmsPointsWithData.length === 0 && spmPointsWithData.length === 0 && (
        <div style={{ ...s.card, textAlign: "center", color: T.textMuted, padding: 60 }}>
          No readings found for this equipment in the selected range.
        </div>
      )}
    </div>
  );
}

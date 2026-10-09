import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import Tile, { PageHeader } from "../components/Tile";
import useIsMobile from "../hooks/useIsMobile";
import { updateRegisterLimits } from "../api";
import EquipmentEditModal from "../components/EquipmentEditModal";
import Icon from "../components/Icon";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import { ICONS } from "../components/icons";
import { vibPointKey } from "../domain";
import { normalizePoint } from "../parsers";

// Equipment master list: totals, filters, and a table of every registered
// equipment's name plate/type/line/limits/points, with an Edit modal that
// writes back to both the RMS and SPM Equipment Register sheets via
// updateRegisterLimits. Ported from the original's `Fm`.
//
// `vibIdMap` (equipmentId|point|family -> VIB_ID) is a sandbox-only
// addition (apps-script/vib-id-merge/README.md) — shown as a "VIB IDs"
// coverage count per row, empty/all-dashes on production.
export default function EquipmentRegister({
  rmsRegister,
  spmRegister,
  registryList,
  webhookUrl,
  setRmsRegister,
  setSpmRegister,
  vibIdMap,
}) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [editing, setEditing] = useState(null);
  const [savedMessage, setSavedMessage] = useState("");

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

  const rows = useMemo(() => {
    const rmsByEq = Object.fromEntries(rmsRegister.map((r) => [r.equipmentId, r]));
    const spmByEq = Object.fromEntries(spmRegister.map((r) => [r.equipmentId, r]));
    const ids = new Set([...rmsRegister.map((r) => r.equipmentId), ...spmRegister.map((r) => r.equipmentId)]);
    return Array.from(ids)
      .map((eid) => {
        const rms = rmsByEq[eid];
        const spm = spmByEq[eid];
        const base = rms || spm || {};
        const allPoints = [...(rms?.points || []).map((p) => [p, "RMS"]), ...(spm?.points || []).map((p) => [p, "SPM"])];
        const vibMatched = allPoints.filter(([p, family]) => vibIdMap?.[vibPointKey(eid, p, family)]).length;
        return {
          eid,
          name: base.equipment || "",
          namePlate: base.namePlate || "",
          eqType: base.eqType || "",
          line: base.line || "",
          rms,
          spm,
          vibMatched,
          vibTotal: allPoints.length,
        };
      })
      .sort((a, b) => (a.line === b.line ? a.eid.localeCompare(b.eid) : a.line.localeCompare(b.line)));
  }, [rmsRegister, spmRegister, vibIdMap]);

  const equipmentOptions = useMemo(
    () =>
      rows
        .filter((r) => (!line || r.line === line) && (!eqType || r.eqType === eqType))
        .map((r) => ({ code: r.eid, description: r.name }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [rows, line, eqType]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (line) list = list.filter((r) => r.line === line);
    if (eqType) list = list.filter((r) => r.eqType === eqType);
    if (search.trim()) {
      const match = idTextMatch(search, rows.map((r) => r.eid));
      list = list.filter((r) => match(r.eid, r.name));
    }
    return list;
  }, [rows, line, eqType, search]);

  // same as every list table (theme th / td, 15px like Oil's lists)
  const thStyle = { ...s.th };
  const tdStyle = { ...s.td };
  const hasVibData = Object.keys(vibIdMap || {}).length > 0;

  const save = (form) => {
    if (!webhookUrl) {
      setSavedMessage("No webhook URL");
      return;
    }
    if (form.rms) {
      updateRegisterLimits(webhookUrl, {
        type: "RMS",
        equipmentId: form.eid,
        namePlate: form.namePlate,
        eqType: form.eqType,
        line: form.line,
        rmsGood: form.rmsGood,
        rmsAcceptable: form.rmsAcceptable,
        rmsAlarm: form.rmsAlarm,
        points: form.rmsPoints,
      });
      setRmsRegister((prev) =>
        prev.map((r) =>
          r.equipmentId === form.eid
            ? {
                ...r,
                namePlate: form.namePlate,
                eqType: form.eqType,
                line: form.line,
                rmsGood: parseFloat(form.rmsGood) || r.rmsGood,
                rmsAcceptable: parseFloat(form.rmsAcceptable) || r.rmsAcceptable,
                rmsAlarm: parseFloat(form.rmsAlarm) || r.rmsAlarm,
                points: form.rmsPoints
                  .split(",")
                  .map((p) => normalizePoint(p))
                  .filter(Boolean),
              }
            : r
        )
      );
    }
    if (form.spm) {
      updateRegisterLimits(webhookUrl, {
        type: "SPM",
        equipmentId: form.eid,
        spmNormal: form.spmNormal,
        spmCaution: form.spmCaution,
        spmAlarm: form.spmAlarm,
      });
      setSpmRegister((prev) =>
        prev.map((r) =>
          r.equipmentId === form.eid
            ? {
                ...r,
                spmNormal: parseFloat(form.spmNormal) || r.spmNormal,
                spmCaution: parseFloat(form.spmCaution) || r.spmCaution,
                spmAlarm: parseFloat(form.spmAlarm) || r.spmAlarm,
              }
            : r
        )
      );
    }
    setSavedMessage("✓ Saved");
    setTimeout(() => setSavedMessage(""), 2500);
    setEditing(null);
  };

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }}>
      <PageHeader title="Equipment Register" subtitle={`${rows.length} machines · ${rmsRegister.length} RMS · ${spmRegister.length} SPM · ${lines.length} lines`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <Tile icon="ti-list-details" value={rows.length} label="Total Equipment" />
        <Tile icon="ti-wave-sine" value={rmsRegister.length} label="RMS Registered" />
        <Tile icon="ti-gauge" value={spmRegister.length} label="SPM Registered" />
        <Tile icon="ti-building-factory-2" value={lines.length} label="Lines" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
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
          }}
        >
          <option value="">All Eq Types</option>
          {eqTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <EquipmentSearch freeText options={equipmentOptions} value={search} onChange={setSearch} placeholder="Equipment ID or name…" width={280} testid="er-find" />
        {savedMessage && <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>{savedMessage}</span>}
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {filtered.length}/{rows.length}
        </span>
      </div>

      <div style={{ ...s.card, overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={thStyle}>Equipment ID</th>
              <th style={thStyle}>Name Plate</th>
              <th style={thStyle}>Equipment Name</th>
              <th style={thStyle}>Eq Type</th>
              <th style={thStyle}>Line</th>
              <th style={thStyle}>RMS Limits (G/A/Al)</th>
              <th style={thStyle}>RMS Points</th>
              <th style={thStyle}>SPM Limits (N/C/Al)</th>
              {hasVibData && <th style={thStyle}>VIB IDs</th>}
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={row.eid} style={{ background: i % 2 ? T.tableRowAlt : T.tableRow }}>
                <td style={{ ...tdStyle, fontWeight: 800, color: T.textHighlight }}>{row.eid}</td>
                <td style={{ ...tdStyle, color: T.textPrimary }}>{row.namePlate || "—"}</td>
                <td
                  style={{
                    ...tdStyle,
                    color: T.textPrimary,
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.name}
                >
                  {row.name || "—"}
                </td>
                <td style={{ ...tdStyle, color: T.textSecondary }}>{row.eqType || "—"}</td>
                <td style={{ ...tdStyle, color: T.textSecondary }}>{row.line || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {row.rms ? (
                    <span>
                      <span style={{ color: T.success, fontWeight: 700 }}>{row.rms.rmsGood}</span>/
                      <span style={{ color: T.warning, fontWeight: 700 }}>{row.rms.rmsAcceptable}</span>/
                      <span style={{ color: T.danger, fontWeight: 700 }}>{row.rms.rmsAlarm}</span>
                    </span>
                  ) : (
                    <span style={{ color: T.textMuted }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color: T.textPrimary,
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.rms?.points?.join(", ")}
                >
                  {row.rms ? row.rms.points.join(", ") : <span style={{ color: T.textMuted }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {row.spm ? (
                    <span>
                      <span style={{ color: T.success, fontWeight: 700 }}>{row.spm.spmNormal}</span>/
                      <span style={{ color: T.warning, fontWeight: 700 }}>{row.spm.spmCaution}</span>/
                      <span style={{ color: T.danger, fontWeight: 700 }}>{row.spm.spmAlarm}</span>
                    </span>
                  ) : (
                    <span style={{ color: T.textMuted }}>—</span>
                  )}
                </td>
                {hasVibData && (
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {row.vibTotal > 0 ? (
                      <span style={{ color: row.vibMatched === row.vibTotal ? T.success : T.warning, fontWeight: 700 }}>
                        {row.vibMatched}/{row.vibTotal}
                      </span>
                    ) : (
                      <span style={{ color: T.textMuted }}>—</span>
                    )}
                  </td>
                )}
                <td style={tdStyle}>
                  <button style={{ ...s.btnSm, fontSize: 12 }} onClick={() => setEditing({ row })}>
                    <Icon d={ICONS.edit} size={12} /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={hasVibData ? 10 : 9} style={{ padding: 30, textAlign: "center", color: T.textMuted }}>
                  No equipment found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <EquipmentEditModal row={editing.row} lines={lines} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

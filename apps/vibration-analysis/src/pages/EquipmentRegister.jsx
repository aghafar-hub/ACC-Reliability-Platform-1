import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { updateRegisterLimits } from "../api";
import EquipmentEditModal from "../components/EquipmentEditModal";
import Icon from "../components/Icon";
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
  const [search, setSearch] = useState("");
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
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
        .map((r) => r.eid)
        .sort(),
    [rows, line, eqType]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (line) list = list.filter((r) => r.line === line);
    if (eqType) list = list.filter((r) => r.eqType === eqType);
    if (equipmentId) list = list.filter((r) => r.eid === equipmentId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.eid.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    }
    return list;
  }, [rows, line, eqType, equipmentId, search]);

  const thStyle = {
    padding: "8px 10px",
    color: T.textSecondary,
    fontWeight: 700,
    fontSize: 12,
    borderBottom: `1px solid ${T.border}`,
    background: T.tableHead,
    textAlign: "left",
  };
  const tdStyle = { padding: "7px 10px", borderBottom: `1px solid ${T.border2}`, fontSize: 12.5 };
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
    <div style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 16 }}>
        <div style={s.metric}>
          <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 3 }}>Total Equipment</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.textHighlight }}>{rows.length}</div>
        </div>
        <div style={s.metric}>
          <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 3 }}>RMS Registered</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.accent }}>{rmsRegister.length}</div>
        </div>
        <div style={s.metric}>
          <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 3 }}>SPM Registered</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.info }}>{spmRegister.length}</div>
        </div>
        <div style={s.metric}>
          <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 3 }}>Lines</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.textHighlight }}>{lines.length}</div>
        </div>
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
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
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
        {savedMessage && <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>{savedMessage}</span>}
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {filtered.length}/{rows.length}
        </span>
      </div>

      <div style={{ ...s.card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
                  <button style={{ ...s.btnSm, fontSize: 11 }} onClick={() => setEditing({ row })}>
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

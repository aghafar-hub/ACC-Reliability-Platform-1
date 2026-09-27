import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import ConfirmModal from "../components/ConfirmModal";
import Icon from "../components/Icon";
import ReadingModal from "../components/ReadingModal";
import ReadingTable from "../components/ReadingTable";
import StatusBadge from "../components/StatusBadge";
import { ICONS } from "../components/icons";
import { resolveThresholds, rmsColorKey, rmsStatus, spmColorKey, spmStatus } from "../domain";
import { formatDisplayDate } from "../parsers";

// Per-equipment log of every RMS/SPM reading ever recorded, grouped by
// line, with inline Add/Edit/Delete — ported from the original's `Nm`.
export default function EquipmentReadings({ registryList, rms, spm, rmsRegMap, spmRegMap, thresholdsMap, mutations }) {
  const { T, s } = useTheme();
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [line, setLine] = useState("");
  const [eqType, setEqType] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [readingModal, setReadingModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  const grouped = useMemo(() => {
    const groups = {};
    registryList.forEach((eq) => {
      if (line && eq.line !== line) return;
      if (eqType && eq.eqType !== eqType) return;
      if (equipmentId && eq.equipmentId !== equipmentId) return;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!(eq.equipmentId.toLowerCase().includes(q) || eq.equipment.toLowerCase().includes(q))) return;
      }
      const key = eq.line || "Other";
      (groups[key] = groups[key] || []).push(eq);
    });
    return groups;
  }, [registryList, line, eqType, equipmentId, search]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select
          style={{ ...s.input, width: 140 }}
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
          <input style={{ ...s.input, paddingLeft: 30 }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {Object.keys(grouped)
        .sort()
        .map((lineName) => (
          <div key={lineName} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 8, letterSpacing: 0.5 }}>
              {lineName.toUpperCase()} ({grouped[lineName].length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
              {grouped[lineName].map((eq) => {
                const isOpen = expanded === eq.equipmentId;
                const rmsRows = rms.filter((r) => r.equipmentId === eq.equipmentId).sort((a, b) => (b.date > a.date ? 1 : -1));
                const spmRows = spm.filter((r) => r.equipmentId === eq.equipmentId).sort((a, b) => (b.date > a.date ? 1 : -1));
                return (
                  <div key={eq.equipmentId} style={{ ...s.card, gridColumn: isOpen ? "1 / -1" : "auto" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => setExpanded(isOpen ? null : eq.equipmentId)}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.textHighlight }}>{eq.equipmentId}</div>
                        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }} title={eq.equipment}>
                          {eq.equipment}
                        </div>
                      </div>
                      <span style={{ color: T.textMuted, transform: isOpen ? "rotate(180deg)" : "none", transition: "0.15s" }}>
                        <Icon d={ICONS.chevDown} size={15} />
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>
                      {rmsRows.length} RMS · {spmRows.length} SPM readings
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <button
                            style={{ ...s.btn, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                            onClick={() =>
                              setReadingModal({ type: "RMS", initial: { equipmentId: eq.equipmentId, equipmentName: eq.equipment } })
                            }
                          >
                            <Icon d={ICONS.plus} size={12} /> Add RMS
                          </button>
                          <button
                            style={{ ...s.btnSecondary, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                            onClick={() =>
                              setReadingModal({ type: "SPM", initial: { equipmentId: eq.equipmentId, equipmentName: eq.equipment } })
                            }
                          >
                            <Icon d={ICONS.plus} size={12} /> Add SPM
                          </button>
                        </div>
                        <ReadingTable
                          title="RMS"
                          rows={rmsRows}
                          columns={[
                            { key: "point", label: "Point" },
                            { key: "date", label: "Date", render: (r) => formatDisplayDate(r.date) },
                            { key: "axial", label: "Axial" },
                            { key: "horizontal", label: "Horiz" },
                            { key: "vertical", label: "Vert" },
                            {
                              key: "maxVel",
                              label: "Max",
                              render: (r) => {
                                const t = resolveThresholds(thresholdsMap, r.equipmentId, rmsRegMap, spmRegMap);
                                const status = rmsStatus(r.maxVel, t);
                                return (
                                  <span>
                                    {r.maxVel} <StatusBadge status={status} colorKey={rmsColorKey(status)} />
                                  </span>
                                );
                              },
                            },
                          ]}
                          onEdit={(row) => setReadingModal({ type: "RMS", initial: row })}
                          onDelete={(row) => setConfirmDelete({ type: "RMS", row })}
                        />
                        <ReadingTable
                          title="SPM"
                          rows={spmRows}
                          columns={[
                            { key: "point", label: "Point" },
                            { key: "date", label: "Date", render: (r) => formatDisplayDate(r.date) },
                            {
                              key: "hdm",
                              label: "HDm",
                              render: (r) => {
                                const t = resolveThresholds(thresholdsMap, r.equipmentId, rmsRegMap, spmRegMap);
                                const status = spmStatus(r.hdm, t);
                                return (
                                  <span>
                                    {r.hdm} <StatusBadge status={status} colorKey={spmColorKey(status)} />
                                  </span>
                                );
                              },
                            },
                            { key: "hdc", label: "HDc" },
                            { key: "gs", label: "Gs" },
                          ]}
                          onEdit={(row) => setReadingModal({ type: "SPM", initial: row })}
                          onDelete={(row) => setConfirmDelete({ type: "SPM", row })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {readingModal && (
        <ReadingModal
          type={readingModal.type}
          initial={readingModal.initial}
          rmsRegMap={rmsRegMap}
          spmRegMap={spmRegMap}
          thresholdsMap={thresholdsMap}
          registryList={registryList}
          onCancel={() => setReadingModal(null)}
          onSave={(reading) => {
            if (readingModal.type === "RMS") {
              reading._id ? mutations.updateRMS(reading) : mutations.addRMS(reading);
            } else {
              reading._id ? mutations.updateSPM(reading) : mutations.addSPM(reading);
            }
            setReadingModal(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          label={`${confirmDelete.row.equipmentId}·${confirmDelete.row.point}·${formatDisplayDate(confirmDelete.row.date)}`}
          message="Delete this reading permanently?"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            confirmDelete.type === "RMS" ? mutations.deleteRMS(confirmDelete.row) : mutations.deleteSPM(confirmDelete.row);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}

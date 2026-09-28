import { useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { newId } from "../parsers";

const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];
const ITEM_TYPES = ["Change", "Top-up", "Sample"];

export default function NewRoutine({ webhookUrl, equipmentRegistry, pushToast, onCreated, onCancel }) {
  const { T, s } = useTheme();
  const [contractor, setContractor] = useState(CONTRACTOR_OPTIONS[0]);
  const [assignedTo, setAssignedTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{ lpId, label, itemType }]
  const [submitting, setSubmitting] = useState(false);

  const registry = equipmentRegistry || [];
  const q = search.trim().toLowerCase();
  const candidates = registry.filter((r) => {
    if (r.contractor && r.contractor !== contractor) return false;
    if (selected.some((s2) => s2.lpId === r.code)) return false;
    if (!q) return true;
    return [r.code, r.equipmentId, r.lubricationPoint, r.area].filter(Boolean).some((f) => f.toLowerCase().includes(q));
  });

  function addPoint(r) {
    setSelected((prev) => [
      ...prev,
      { lpId: r.code, label: `${r.code} — ${r.lubricationPoint || r.description}`, itemType: r.oilAnalysisRequired === "Yes" ? "Sample" : "Change" },
    ]);
  }
  function removePoint(lpId) {
    setSelected((prev) => prev.filter((s2) => s2.lpId !== lpId));
  }
  function setItemType(lpId, itemType) {
    setSelected((prev) => prev.map((s2) => (s2.lpId === lpId ? { ...s2, itemType } : s2)));
  }

  async function handleCreate() {
    if (!assignedTo.trim()) {
      pushToast("Enter who this routine is assigned to.", "error");
      return;
    }
    if (selected.length === 0) {
      pushToast("Add at least one lubrication point.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const routineId = newId("RT");
      const items = selected.map((s2) => ({
        routineItemId: newId("RI"),
        lpId: s2.lpId,
        itemType: s2.itemType,
      }));
      const saved = await api.createRoutine(webhookUrl, { routineId, assignedTo: assignedTo.trim(), contractor, items });
      pushToast("Routine created.", "success");
      onCreated(saved.routineId);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>New Routine</p>
        <button style={s.btn} onClick={onCancel} disabled={submitting}>
          <i className="ti ti-x" aria-hidden="true" /> Cancel
        </button>
      </div>

      <div style={{ ...s.card, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <label style={s.label}>Contractor</label>
          <select style={s.select} value={contractor} onChange={(e) => setContractor(e.target.value)}>
            {CONTRACTOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={s.label}>Assigned To</label>
          <input
            style={s.input}
            type="text"
            placeholder="Technician or team name"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        </div>
      </div>

      <div style={s.card}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Selected points ({selected.length})</p>
        {selected.length === 0 ? (
          <p style={{ color: T.textSecondary, fontSize: 13 }}>None yet — search below and add points.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Point</th>
                <th style={s.th}>Item Type</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((s2) => (
                <tr key={s2.lpId}>
                  <td style={s.td}>{s2.label}</td>
                  <td style={s.td}>
                    <select style={s.select} value={s2.itemType} onChange={(e) => setItemType(s2.lpId, e.target.value)}>
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={s.td}>
                    <button style={s.btn} onClick={() => removePoint(s2.lpId)}>
                      <i className="ti ti-trash" aria-hidden="true" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={s.card}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Add points</p>
        <input
          style={{ ...s.input, marginBottom: 12 }}
          type="search"
          placeholder="Search by LP_ID, equipment, point, or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>LP_ID</th>
              <th style={s.th}>Point</th>
              <th style={s.th}>Area</th>
              <th style={s.th}>Analysis?</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 50).map((r) => (
              <tr key={r.code}>
                <td style={s.td}>{r.code}</td>
                <td style={s.td}>{r.lubricationPoint || r.description}</td>
                <td style={s.td}>{r.area}</td>
                <td style={s.td}>{r.oilAnalysisRequired}</td>
                <td style={s.td}>
                  <button style={s.btn} onClick={() => addPoint(r)}>
                    <i className="ti ti-plus" aria-hidden="true" /> Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length > 50 && (
          <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 8 }}>Showing 50 of {candidates.length} — narrow your search.</p>
        )}
      </div>

      <button style={s.btnPrimary} onClick={handleCreate} disabled={submitting}>
        {submitting ? "Creating…" : "Create Routine"}
      </button>
    </div>
  );
}

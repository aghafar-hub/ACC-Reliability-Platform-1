import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail } from "../SessionContext";
import * as api from "../api";
import { newId, suggestedRoutinePoints } from "../parsers";

const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];
const ITEM_TYPES = ["Change", "Top-up", "Sample"];

const REASON_COLOR = { resample: "danger", overdue: "warning", missing: "danger", due: "accent" };

function ReasonBadge({ T, reason }) {
  if (!reason) return null;
  const color = T[REASON_COLOR[reason.kind]] || T.accent;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: color + "1c",
        borderRadius: 4,
        padding: "2px 6px",
        marginLeft: 6,
        whiteSpace: "nowrap",
      }}
    >
      {reason.label}
    </span>
  );
}

export default function NewRoutine({ webhookUrl, equipmentRegistry, samples, actions, pushToast, onCreated, onCancel }) {
  const { T, s } = useTheme();
  const createdBy = useSessionEmail();
  const [contractor, setContractor] = useState(CONTRACTOR_OPTIONS[0]);
  const [assignedTo, setAssignedTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{ lpId, label, itemType, suggestionReason? }]
  const [submitting, setSubmitting] = useState(false);

  const registry = equipmentRegistry || [];

  // Pre-fill with this month's suggested points for the chosen contractor —
  // overdue/missing oil-analysis samples and any LP with an open "Resample
  // Oil" action. Re-runs when the contractor changes since a routine is
  // built for one contractor at a time; still fully editable afterward.
  useEffect(() => {
    const suggested = suggestedRoutinePoints(equipmentRegistry, samples, actions).filter((r) => r.contractor === contractor);
    setSelected(
      suggested.map((r) => ({
        lpId: r.code,
        label: `${r.code} — ${r.lubricationPoint || r.description}`,
        itemType: r.oilAnalysisRequired === "Yes" ? "Sample" : "Change",
        suggestionReason: r.suggestionReason,
      }))
    );
  }, [contractor, equipmentRegistry, samples, actions]);

  const q = search.trim().toLowerCase();
  const candidates = registry.filter((r) => {
    if (r.contractor && r.contractor !== contractor) return false;
    if (selected.some((s2) => s2.lpId === r.code)) return false;
    if (!q) return true;
    return [r.code, r.equipmentId, r.lubricationPoint, r.area].filter(Boolean).some((f) => f.toLowerCase().includes(q));
  });

  // Grouped by Area so a technician/reviewer can work through one part of
  // the plant at a time instead of scanning a flat list of ~900 points.
  const candidatesByArea = useMemo(() => {
    const groups = new Map();
    for (const r of candidates) {
      const area = r.area || "(No area)";
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(r);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [candidates]);

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
      const saved = await api.createRoutine(webhookUrl, { routineId, assignedTo: assignedTo.trim(), contractor, createdBy, items });
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
        <p style={{ fontWeight: 700, marginBottom: 4 }}>Selected points ({selected.length})</p>
        <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>
          Pre-filled with this {contractor}'s overdue/due samples and any open resample requests — remove or add points as needed.
        </p>
        {selected.length === 0 ? (
          <p style={{ color: T.textSecondary, fontSize: 13 }}>
            Nothing due for {contractor} right now — search below to add points manually.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                    <td style={s.td}>
                      {s2.label}
                      <ReasonBadge T={T} reason={s2.suggestionReason} />
                    </td>
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
          </div>
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
        {candidatesByArea.length === 0 ? (
          <p style={{ color: T.textSecondary, fontSize: 13 }}>No matching points.</p>
        ) : (
          candidatesByArea.map(([area, rows]) => (
            <div key={area} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>
                {area} <span style={{ fontWeight: 400, textTransform: "none" }}>({rows.length})</span>
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>LP_ID</th>
                      <th style={s.th}>Point</th>
                      <th style={s.th}>Analysis?</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code}>
                        <td style={s.td}>{r.code}</td>
                        <td style={s.td}>{r.lubricationPoint || r.description}</td>
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
              </div>
            </div>
          ))
        )}
      </div>

      <button style={s.btnPrimary} onClick={handleCreate} disabled={submitting}>
        {submitting ? "Creating…" : "Create Routine"}
      </button>
    </div>
  );
}

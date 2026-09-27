import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { toISODate, autofillFromEquipment } from "../actionAutofill";

// Every oil change point that's currently Overdue and whose equipment has
// no open (non-Closed) action yet — one candidate per lubrication point,
// not per equipment, since two different points on the same equipment can
// both be overdue independently.
function computeCandidates(oilChanges, actions, equipmentRegistry) {
  return (oilChanges || [])
    .filter((o) => o.status === "Overdue")
    .filter((o) => !(actions || []).some((a) => (a.equipmentCode || a.unitId) === o.equipmentCode && a.status !== "Closed"))
    .map((o) => {
      const filled = autofillFromEquipment(o.equipmentCode, { equipmentRegistry, oilChanges, allActions: actions, excludeId: null });
      return {
        oilChange: o,
        equipmentCode: o.equipmentCode,
        description: filled.description,
        oilType: o.oilType || filled.oilType,
        contractor: filled.contractor,
        lastChange: o.changeDate || "",
        prevMonthAgreedAction: filled.prevMonthAgreedAction,
        revisionDate: toISODate(new Date()),
        agreedAction: `Change oil — ${o.lubricationPoint || "lubrication point"} overdue since ${o.nextDueDate || "unknown date"}.`,
      };
    })
    .sort((a, b) => new Date(a.oilChange.nextDueDate || 0) - new Date(b.oilChange.nextDueDate || 0));
}

export default function GenerateOilChangeActionsModal({ oilChanges, actions, equipmentRegistry, onAddAction, onClose }) {
  const { T, s } = useTheme();
  const candidates = useMemo(() => computeCandidates(oilChanges, actions, equipmentRegistry), [oilChanges, actions, equipmentRegistry]);
  const [checked, setChecked] = useState(() => new Set(candidates.map((c) => c.oilChange._id)));
  const [rowStatus, setRowStatus] = useState({}); // oilChange._id -> "pending" | "done" | "error"
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const selected = candidates.filter((c) => checked.has(c.oilChange._id));

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setRunning(true);
    let maxNum = 0;
    (actions || []).forEach((a) => {
      const groups = String(a.acNo || "").match(/\d+/g);
      if (groups) maxNum = Math.max(maxNum, parseInt(groups[groups.length - 1], 10));
    });

    for (const c of selected) {
      const id = c.oilChange._id;
      setRowStatus((prev) => ({ ...prev, [id]: "pending" }));
      maxNum += 1;
      const payload = {
        acNo: `0-${maxNum}`,
        equipmentCode: c.equipmentCode,
        description: c.description,
        oilType: c.oilType,
        revisionDate: c.revisionDate,
        sampleDate: "",
        sampleResult: "",
        sampleAnalysis: "",
        lastChange: c.lastChange,
        status: "Open",
        contractorAction: "Change Oil",
        contractor: c.contractor,
        completedDate: "",
        prevMonthAgreedAction: c.prevMonthAgreedAction,
        accAction: "",
        agreedAction: c.agreedAction,
        closingComment: "",
      };
      try {
        await onAddAction(payload);
        setRowStatus((prev) => ({ ...prev, [id]: "done" }));
      } catch {
        setRowStatus((prev) => ({ ...prev, [id]: "error" }));
      }
    }
    setRunning(false);
    setDone(true);
  }

  const createdCount = Object.values(rowStatus).filter((v) => v === "done").length;
  const errorCount = Object.values(rowStatus).filter((v) => v === "error").length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => !running && onClose()}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 820,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Generate Oil Change Actions</p>
          {!running && (
            <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 18px" }}>
          Every lubrication point that's overdue right now, whose equipment has no open action yet. Uncheck any you don't want, then create.
        </p>

        {candidates.length === 0 && (
          <div style={{ ...s.card, textAlign: "center", padding: 30, color: T.textMuted, fontSize: 13 }}>
            No qualifying points — every overdue oil change already has an open action for its equipment.
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
              {selected.length} of {candidates.length} selected
            </div>
            <div style={{ overflowX: "auto", marginBottom: 18 }}>
              <table style={{ ...s.table, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={s.th}>
                      <input
                        type="checkbox"
                        checked={checked.size === candidates.length}
                        onChange={(e) => setChecked(e.target.checked ? new Set(candidates.map((c) => c.oilChange._id)) : new Set())}
                        disabled={running || done}
                      />
                    </th>
                    {["Equipment", "Point", "Overdue Since", "Contractor", "Last Change", ""].map((h) => (
                      <th key={h} style={s.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.oilChange._id}>
                      <td style={s.td}>
                        <input
                          type="checkbox"
                          checked={checked.has(c.oilChange._id)}
                          onChange={() => toggle(c.oilChange._id)}
                          disabled={running || done}
                        />
                      </td>
                      <td style={{ ...s.td, fontFamily: "monospace" }}>{c.equipmentCode}</td>
                      <td style={s.td}>{c.oilChange.lubricationPoint || "—"}</td>
                      <td style={{ ...s.td, color: T.danger, fontWeight: 700 }}>{c.oilChange.nextDueDate || "—"}</td>
                      <td style={s.td}>{c.contractor || "—"}</td>
                      <td style={s.td}>{c.lastChange || "—"}</td>
                      <td style={s.td}>
                        {rowStatus[c.oilChange._id] === "pending" && <span style={{ color: T.textMuted }}>Saving…</span>}
                        {rowStatus[c.oilChange._id] === "done" && (
                          <i className="ti ti-check" style={{ color: T.success }} aria-hidden="true" />
                        )}
                        {rowStatus[c.oilChange._id] === "error" && <i className="ti ti-x" style={{ color: T.danger }} aria-hidden="true" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {done && (
          <div style={{ fontSize: 13, color: errorCount ? T.danger : T.success, marginBottom: 14 }}>
            {createdCount} action{createdCount === 1 ? "" : "s"} created.
            {errorCount > 0 && ` ${errorCount} failed — see the ✕ rows above.`}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={s.btn} onClick={onClose} disabled={running}>
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button style={s.btnPrimary} onClick={handleCreate} disabled={running || selected.length === 0}>
              {running ? "Creating…" : `Create ${selected.length} Action${selected.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

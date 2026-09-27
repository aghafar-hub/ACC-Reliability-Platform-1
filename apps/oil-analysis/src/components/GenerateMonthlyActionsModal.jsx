import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate } from "../parsers";
import { toISODate, latestOilChangeFor, autofillFromEquipment } from "../actionAutofill";

// "Caution" and "Warning" are the same bucket everywhere else in the app
// (Dashboard's own statusColor groups them) — Warning is just an older
// label for the same severity, so it qualifies here too.
const QUALIFYING_STATUSES = new Set(["Caution", "Warning", "Alert"]);

// For each equipment code, its single latest-dated sample — then keep only
// the ones whose status is Caution/Warning/Alert AND whose equipment has no
// action recorded at all yet (open or closed). Deliberately NOT scoped to
// "an action matching this exact sample date" — this tool exists to catch
// equipment that has never been actioned, so once any action exists for an
// equipment it's assumed to already be tracked and won't be re-offered here
// even if a newer Caution/Alert sample comes in later.
function computeCandidates(samples, actions, equipmentRegistry, oilChanges) {
  const latestByEquip = {};
  (samples || []).forEach((sm) => {
    const code = sm.unitId;
    if (!code || !sm.sampledDate) return;
    const cur = latestByEquip[code];
    if (!cur || new Date(sm.sampledDate) > new Date(cur.sampledDate)) latestByEquip[code] = sm;
  });

  return Object.values(latestByEquip)
    .filter((sm) => QUALIFYING_STATUSES.has(sm.reportStatus))
    .filter((sm) => !(actions || []).some((a) => a.equipmentCode === sm.unitId))
    .map((sm) => {
      const filled = autofillFromEquipment(sm.unitId, { equipmentRegistry, oilChanges, allActions: actions, excludeId: null });
      const latestOil = latestOilChangeFor(oilChanges, sm.unitId);
      return {
        sample: sm,
        equipmentCode: sm.unitId,
        description: filled.description,
        oilType: filled.oilType,
        contractor: filled.contractor,
        lastChange: latestOil ? formatDate(latestOil.changeDate) : "",
        prevMonthAgreedAction: filled.prevMonthAgreedAction,
        revisionDate: toISODate(new Date()),
        sampleDate: sm.sampledDate,
        sampleResult: (sm.reportStatus || "").toUpperCase(),
        status: "Open",
      };
    })
    .sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode));
}

export default function GenerateMonthlyActionsModal({ samples, actions, equipmentRegistry, oilChanges, onAddAction, onClose }) {
  const { T, s } = useTheme();
  const candidates = useMemo(
    () => computeCandidates(samples, actions, equipmentRegistry, oilChanges),
    [samples, actions, equipmentRegistry, oilChanges]
  );
  const [checked, setChecked] = useState(() => new Set(candidates.map((c) => c.equipmentCode)));
  const [rowStatus, setRowStatus] = useState({}); // equipmentCode -> "pending" | "done" | "error"
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const selected = candidates.filter((c) => checked.has(c.equipmentCode));

  function toggle(code) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleCreate() {
    setRunning(true);
    // Ac. No. values look like "0-101" — number sequentially within this
    // batch the same way nextAcNo() does, so two rows created back-to-back
    // here don't both land on the same Ac. No.
    let maxNum = 0;
    (actions || []).forEach((a) => {
      const groups = String(a.acNo || "").match(/\d+/g);
      if (groups) maxNum = Math.max(maxNum, parseInt(groups[groups.length - 1], 10));
    });

    for (const c of selected) {
      setRowStatus((prev) => ({ ...prev, [c.equipmentCode]: "pending" }));
      maxNum += 1;
      const payload = {
        acNo: `0-${maxNum}`,
        equipmentCode: c.equipmentCode,
        description: c.description,
        oilType: c.oilType,
        revisionDate: c.revisionDate,
        sampleDate: c.sampleDate,
        sampleResult: c.sampleResult,
        sampleAnalysis: "",
        lastChange: c.lastChange,
        status: c.status,
        contractorAction: "",
        contractor: c.contractor,
        completedDate: "",
        prevMonthAgreedAction: c.prevMonthAgreedAction,
        accAction: "",
        agreedAction: "",
        closingComment: "",
      };
      try {
        await onAddAction(payload);
        setRowStatus((prev) => ({ ...prev, [c.equipmentCode]: "done" }));
      } catch {
        setRowStatus((prev) => ({ ...prev, [c.equipmentCode]: "error" }));
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
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Generate Monthly Actions</p>
          {!running && (
            <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: T.textSecondary, margin: "0 0 18px" }}>
          Equipment whose most recent sample is Caution or Alert and that has no action at all yet — open or closed. Equipment already
          tracked by an existing action won't be re-offered here, even on a newer Caution/Alert sample.
        </p>

        {candidates.length === 0 && (
          <div style={{ ...s.card, textAlign: "center", padding: 30, color: T.textMuted, fontSize: 13 }}>
            No qualifying equipment — every Caution/Alert equipment already has at least one action on record.
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
                        onChange={(e) => setChecked(e.target.checked ? new Set(candidates.map((c) => c.equipmentCode)) : new Set())}
                        disabled={running || done}
                      />
                    </th>
                    {["Equipment", "Description", "Sample Date", "Result", "Contractor", "Last Change", ""].map((h) => (
                      <th key={h} style={s.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.equipmentCode}>
                      <td style={s.td}>
                        <input
                          type="checkbox"
                          checked={checked.has(c.equipmentCode)}
                          onChange={() => toggle(c.equipmentCode)}
                          disabled={running || done}
                        />
                      </td>
                      <td style={{ ...s.td, fontFamily: "monospace" }}>{c.equipmentCode}</td>
                      <td style={s.td}>{c.description || "—"}</td>
                      <td style={s.td}>{c.sampleDate}</td>
                      <td style={s.td}>
                        <span style={s.badge(c.sampleResult === "ALERT" ? "Alert" : "Caution")}>{c.sample.reportStatus}</span>
                      </td>
                      <td style={s.td}>{c.contractor || "—"}</td>
                      <td style={s.td}>{c.lastChange || "—"}</td>
                      <td style={s.td}>
                        {rowStatus[c.equipmentCode] === "pending" && <span style={{ color: T.textMuted }}>Saving…</span>}
                        {rowStatus[c.equipmentCode] === "done" && (
                          <i className="ti ti-check" style={{ color: T.success }} aria-hidden="true" />
                        )}
                        {rowStatus[c.equipmentCode] === "error" && <i className="ti ti-x" style={{ color: T.danger }} aria-hidden="true" />}
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

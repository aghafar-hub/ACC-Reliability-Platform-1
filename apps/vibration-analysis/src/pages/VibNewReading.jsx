import { useEffect, useMemo, useState } from "react";
import { saveVibReadings } from "../api";
import { useTheme } from "../ThemeContext";
import ModalShell, { FormSection, ReadValue } from "../components/ModalShell";
import { LevelPill } from "../components/Level";
import { LEVELS } from "../levels";
import { fieldsFor, systemStatus } from "../vibModel";

// New Reading (workflow "New Reading & Reading History"): one machine, one
// measurement date, the numbers for each of its VIB IDs. The reading goes
// into that month's report for the machine's contractor scope (a Draft is
// started when there is none). Checks: date not in the future, numbers
// only, a VIB ID already read on that date needs "Replace" — every change
// is in the report's history.

const LABEL = { h: "H", v: "V", a: "A", hdm: "HDm", hdc: "HDc", g: "G's" };

export default function NewReadingModal({ webhookUrl, machines, me, presetEquipmentId, onClose, onSaved }) {
  const { T, s } = useTheme();
  const list = useMemo(() => machines.filter((m) => m.points.length && (!me?.contractor || m.contractor === me.contractor)).sort((a, b) => a.id.localeCompare(b.id)), [machines, me]);
  const [eqId, setEqId] = useState(presetEquipmentId || "");
  const [find, setFind] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dupe, setDupe] = useState(false);
  const m = list.find((x) => x.id === eqId);
  useEffect(() => {
    setVals({});
    setDupe(false);
    setError("");
  }, [eqId]);
  const set = (vib, k, v) => {
    setDupe(false);
    setVals((p) => ({ ...p, [vib]: { ...(p[vib] || {}), [k]: v } }));
  };
  const filled = Object.entries(vals).filter(([, r]) => ["h", "v", "a", "hdm", "hdc", "g"].some((k) => r[k] !== "" && r[k] != null));
  const shownMachines = list.filter((x) => !find || (x.id + " " + x.name).toLowerCase().includes(find.toLowerCase())).slice(0, 200);

  const save = async (replace = false) => {
    setError("");
    if (!m) return setError("Pick the equipment.");
    if (!date) return setError("Pick the measurement date.");
    if (!filled.length) return setError("Enter at least one value.");
    setBusy(true);
    try {
      const r = await saveVibReadings(webhookUrl, { equipmentId: m.id, date, replace, readings: filled.map(([vibId, r]) => ({ vibId, ...r })) });
      onSaved(r, m);
    } catch (e) {
      const msg = String(e.message || e);
      setError(msg);
      setDupe(/Replace them\?/.test(msg));
      setBusy(false);
    }
  };

  const cell = { ...s.input, padding: "6px 7px", width: 78 };
  return (
    <ModalShell
      icon="plus"
      title="New reading"
      subtitle={m ? `${m.id} · ${m.name} · ${m.contractor} ${m.scope}` : "One machine, one measurement date"}
      onClose={onClose}
      width={940}
      testid="vnr-modal"
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: 12.5, color: T.textSecondary }}>{filled.length} VIB IDs filled</span>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          {dupe ? (
            <button type="button" style={{ ...s.btnPrimary, background: T.warning }} onClick={() => save(true)} disabled={busy} data-testid="vnr-replace">
              Replace them
            </button>
          ) : (
            <button type="button" style={s.btnPrimary} onClick={() => save(false)} disabled={busy} data-testid="vnr-save">
              {busy ? "Saving…" : "Save reading"}
            </button>
          )}
        </>
      }
    >
      <FormSection icon="engine" title="Equipment and date">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
          {presetEquipmentId && m ? (
            <ReadValue label="Equipment">
              {m.id} · {m.name}
            </ReadValue>
          ) : (
            <label>
              <span style={s.label}>Equipment</span>
              <input style={{ ...s.input, marginBottom: 6 }} placeholder="Find by ID or name" value={find} onChange={(e) => setFind(e.target.value)} data-testid="vnr-find" />
              <select style={{ ...s.select, width: "100%" }} value={eqId} onChange={(e) => setEqId(e.target.value)} data-testid="vnr-eq">
                <option value="">Pick equipment…</option>
                {shownMachines.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.id} · {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span style={s.label}>Measurement date</span>
            <input type="date" style={s.input} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} data-testid="vnr-date" />
          </label>
          <ReadValue label="Goes into report" hint="Started as a draft when the month has no report yet.">
            {m && date ? `${m.contractor} · ${m.scope} · ${date.slice(0, 7)}` : "—"}
          </ReadValue>
        </div>
      </FormSection>
      {m && (
        <FormSection icon="wave-sine" title="Readings" hint="numbers only — leave a VIB ID empty if it wasn't measured">
          <div className="phone-cards-box" style={{ overflowX: "auto" }}>
            <table data-phone-cards="" style={s.table}>
              <thead>
                <tr>
                  {["VIB ID", "Point", "Values", "System", "Report status", "Note"].map((h) => (
                    <th key={h} style={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.points.map((p) => {
                  const r = vals[p.vibId] || {};
                  const sys = systemStatus(p, m, r);
                  return (
                    <tr key={p.vibId}>
                      <td style={{ ...s.td, fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap" }}>{p.vibId}</td>
                      <td style={{ ...s.td, fontSize: 12.5 }}>
                        {String(p.description).split(";")[0]}
                        <div style={{ fontSize: 12, color: T.textMuted }}>{p.family === "Gs" ? "G's (g)" : p.family === "SPM" ? "SPM (dBsv)" : "RMS (mm/s)"}</div>
                      </td>
                      <td style={s.td}>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {fieldsFor(p).map((k) => (
                            <label key={k} style={{ display: "flex", flexDirection: "column", fontSize: 12, color: T.textSecondary }}>
                              {LABEL[k]}
                              <input
                                type="number"
                                inputMode="decimal"
                                step={k === "hdm" || k === "hdc" ? "1" : "0.01"}
                                style={cell}
                                value={r[k] ?? ""}
                                onChange={(e) => set(p.vibId, k, e.target.value)}
                                data-testid={`vnr-${p.vibId}-${k}`}
                              />
                            </label>
                          ))}
                        </span>
                      </td>
                      <td style={s.td}>{sys === "No limits" ? <span style={{ fontSize: 12, color: T.textSecondary }}>No limits</span> : <LevelPill level={sys} />}</td>
                      <td style={s.td}>
                        <select style={{ ...s.select, padding: "6px" }} value={r.reportStatus || ""} onChange={(e) => set(p.vibId, "reportStatus", e.target.value)} aria-label={`${p.vibId} report status`}>
                          <option value="">—</option>
                          {LEVELS.map((l) => (
                            <option key={l}>{l}</option>
                          ))}
                        </select>
                      </td>
                      <td style={s.td}>
                        <input style={{ ...cell, width: 150 }} value={r.notes || ""} onChange={(e) => set(p.vibId, "notes", e.target.value)} aria-label={`${p.vibId} note`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FormSection>
      )}
      {error && (
        <div role="alert" style={{ color: dupe ? T.warning : T.danger, fontSize: 13, whiteSpace: "pre-wrap" }} data-testid="vnr-error">
          {error}
        </div>
      )}
    </ModalShell>
  );
}

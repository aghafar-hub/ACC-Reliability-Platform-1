import { useMemo, useState } from "react";
import { getVibEntriesFor, saveVibEntries } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import EquipmentSearch from "../components/EquipmentSearch";
import { FormSection } from "../components/ModalShell";
import Tile from "../components/Tile";
import { LevelPill, StatePill } from "../components/Level";
import { LEVELS } from "../levels";
import { monthLabel } from "../vibModel";
import { readReportFile } from "../import/readReportFile";
import { matchImport, mergeParsed, refreshMachine, rowsToSave, counts, setMachine, checkRow } from "../import/matchReport";

// Import a contractor report (PDF) into this report: read → check → save.
// The check screen lists every machine of the file(s): the machine and VIB
// ID each reading goes to, the values (editable), system status, the
// report's condition (goes on the machine's worst point) and its
// recommendation (editable; saved with the report and put on the action
// when ACC approves). Rows with a problem are not saved until fixed or
// skipped. ASEC may send one month in one or two files: pick both.

const FIELDS = { RMS: ["h", "v", "a"], SPM: ["hdm", "hdc"], Gs: ["g"], "RMS?": ["h", "v", "a"] };
const LABEL = { h: "H", v: "V", a: "A", hdm: "HDm", hdc: "HDc", g: "G's" };
const ACTION = { add: ["New", "info"], replace: ["Replaces", "warning"], same: ["Already in the app", "muted"], other: ["Other value saved", "warning"] };

export default function VibImportReport({ webhookUrl, rep, entries, scopeEquipment, onCancel, onSaved }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [stage, setStage] = useState("pick");
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [machines, setMachines] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState([]);
  const month = String(rep.Month || "").slice(0, 7);

  const read = async () => {
    setError("");
    setBusy("Reading…");
    const out = [];
    for (const f of files) {
      setBusy(`Reading ${f.name}…`);
      try {
        out.push({ ok: true, ...(await readReportFile(f, rep.Contractor)) });
      } catch (e) {
        out.push({ ok: false, file: f.name, error: String(e.message || e) });
      }
    }
    // file checks: contractor must match; month / scope are warnings
    out.forEach((r) => {
      if (!r.ok) return;
      r.notes = [];
      if (r.contractor !== rep.Contractor) {
        r.ok = false;
        r.error = `This is ${r.contractor === "ASEC" ? "an ASEC" : "an RHI"} report — this is the ${rep.Contractor} report. Open the ${r.contractor} report of ${monthLabel(month)} to import it.`;
        return;
      }
      if (r.month && r.month !== month) r.notes.push(`The file says ${monthLabel(r.month)}; this report is ${monthLabel(month)}.`);
      if (r.scope && r.scope !== rep["Report scope"]) r.notes.push(`The file is ${r.scope}; this report is ${rep["Report scope"]} — its machines will be skipped.`);
    });
    setResults(out);
    const good = out.filter((r) => r.ok);
    if (!good.length) return setBusy("");
    const merged = mergeParsed(good);
    setWarnings(merged.warnings);
    let ms = matchImport(merged, rep, scopeEquipment || {}, entries);
    // the same readings may already be in another report (a report repeats
    // the last reading of a machine not measured this month)
    const ids = [...new Set(ms.map((m) => m.eqId).filter(Boolean))];
    if (ids.length) {
      setBusy("Checking against the readings in the app…");
      try {
        const all = await getVibEntriesFor(webhookUrl, ids);
        ms = matchImport(merged, rep, scopeEquipment || {}, [...entries, ...all.filter((e) => e["Report ID"] !== rep["Report ID"])]);
        setChecked(ids);
      } catch (e) {
        setError(`Couldn't check the other reports (${e.message}) — readings already saved in another month may be added again.`);
      }
    }
    setBusy("");
    setMachines(order(ms));
    setStage("check");
  };

  const edit = (key, fn) =>
    setMachines((ms) =>
      ms.map((m) => {
        if (m.key !== key) return m;
        const c = { ...m, rows: m.rows.map((r) => ({ ...r, vals: { ...r.vals } })) };
        fn(c);
        return refreshMachine(c, scopeEquipment);
      })
    );

  // a machine picked by hand: its readings from the other reports too
  const pickMachine = async (key, eqId) => {
    edit(key, (c) => setMachine(c, eqId, scopeEquipment, rep));
    if (!eqId || checked.includes(eqId)) return;
    try {
      const more = (await getVibEntriesFor(webhookUrl, [eqId])).filter((e) => e["Report ID"] !== rep["Report ID"]);
      setChecked((x) => [...x, eqId]);
      edit(key, (c) => c.rows.forEach((r) => (r.existing = [...(r.existing || []), ...more])));
    } catch {
      /* the save still works; only the duplicate check is weaker */
    }
  };

  const c = useMemo(() => counts(machines), [machines]);
  const toSave = useMemo(() => rowsToSave(machines), [machines]);
  const usable = (m) => !m.skipMachine && m.eqId && scopeEquipment?.[m.eqId]?.points.length;
  const recs = machines.filter((m) => usable(m) && (m.recommendation.trim() || m.condition));
  const needsFix = (m) => !m.skipMachine && (!usable(m) || m.rows.some((r) => !r.skip && r.problem));
  const fits = (m, f) => (f === "fix" ? needsFix(m) : f === "skipped" ? m.skipMachine || m.rows.some((r) => r.skip) : f === "recs" ? !!m.recommendation.trim() : true);
  // the list is fixed when a filter is picked, so a machine stays on screen while it is being fixed
  const [pinned, setPinned] = useState(null);
  const pickFilter = (f) => {
    setFilter(f);
    setPinned(f === "all" ? null : new Set(machines.filter((m) => fits(m, f)).map((m) => m.key)));
  };
  const shown = pinned ? machines.filter((m) => pinned.has(m.key)) : machines;

  const save = async () => {
    setError("");
    setBusy("Saving…");
    const source = results.filter((r) => r.ok).map((r) => r.file).join(", ");
    try {
      // merge: only the new and corrected readings go; the report keeps its others
      await saveVibEntries(webhookUrl, rep["Report ID"], toSave, {
        merge: true,
        recommendations: recs.map((m) => ({ equipmentId: m.eqId, condition: m.condition, recommendation: m.recommendation.trim(), source })),
      });
      onSaved(`Imported ${toSave.length} readings${recs.length ? ` and ${recs.length} recommendations` : ""} from ${source}.`);
    } catch (e) {
      setError(String(e.message || e) + (e.problems?.length > 8 ? "\n" + e.problems.slice(8).join("\n") : ""));
      setBusy("");
    }
  };

  if (stage === "pick") {
    return (
      <div data-testid="vimp" style={{ maxWidth: 900 }}>
        <FormSection icon="file-import" title="Import report file" hint={`${rep.Contractor} · ${rep["Report scope"]} · ${monthLabel(month)}`}>
          <label
            style={{ display: "block", border: `2px dashed ${T.border}`, borderRadius: 10, textAlign: "center", padding: isMobile ? 20 : 30, cursor: "pointer", background: T.cardSubBg }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFiles(Array.from(e.dataTransfer.files || []));
            }}
            data-testid="vimp-drop"
          >
            <i className="ti ti-file-upload" style={{ fontSize: 32, color: T.accent }} aria-hidden="true" />
            <div style={{ fontWeight: 700, marginTop: 8 }}>Drop the report PDF here, or click to choose</div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 4 }}>
              {rep.Contractor === "ASEC" ? "ASEC may send the month in one or two files — pick all of them." : "One file per line (save the Word report as PDF)."} Read here in your browser; nothing is saved until you check it.
            </div>
            <input type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} onChange={(e) => { setFiles(Array.from(e.target.files || [])); e.target.value = ""; }} data-testid="vimp-file" />
          </label>
          {files.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              {files.map((f) => (
                <span key={f.name} style={{ fontSize: 12.5, background: T.cardSubBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px" }}>
                  <i className="ti ti-file-type-pdf" aria-hidden="true" /> {f.name}
                </span>
              ))}
            </div>
          )}
          {results.filter((r) => !r.ok).map((r) => (
            <div key={r.file} role="alert" style={{ marginTop: 12, color: T.danger, fontSize: 13 }}>
              <b>{r.file}:</b> {r.error}
            </div>
          ))}
        </FormSection>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" style={s.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={read} disabled={!files.length || !!busy} data-testid="vimp-read">
            <i className="ti ti-scan" aria-hidden="true" /> {busy || `Read ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  const picks = Object.values(scopeEquipment || {})
    .filter((x) => x.points.length && x.contractor === rep.Contractor)
    .map((x) => ({ code: x.id, description: x.name }));

  return (
    <div data-testid="vimp-check">
      <FormSection
        icon="list-check"
        title="Check the report before saving"
        hint={isMobile ? "" : results.filter((r) => r.ok).map((r) => `${r.file} · ${r.pages} pages`).join(" + ")}
        right={
          <button type="button" style={{ ...s.btnGhost, padding: "5px 10px", fontSize: 12.5 }} onClick={() => exportIssues(machines, rep, results)} data-testid="vimp-issues-xlsx">
            <i className="ti ti-file-spreadsheet" aria-hidden="true" /> Issues (Excel)
          </button>
        }
      >
        {isMobile && (
          <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8, overflowWrap: "anywhere" }}>
            {results.filter((r) => r.ok).map((r) => `${r.file} · ${r.pages} pages`).join(" + ")}
          </div>
        )}
        {results.flatMap((r) => (r.ok ? r.notes : [])).concat(results.filter((r) => !r.ok).map((r) => `${r.file}: ${r.error}`)).map((n) => (
          <div key={n} role="status" style={{ fontSize: 13, color: T.warning, marginBottom: 6 }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> {n}
          </div>
        ))}
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
          <Tile icon="ti-circle-plus" value={c.add} label="New readings" sub={c.replace ? `${c.replace} replace readings in the report` : "to add to the report"} testid="vimp-n-add" />
          <Tile icon="ti-copy" value={c.same} label="Already in the app" sub="same VIB ID, date and values — not added again" testid="vimp-n-same" />
          {c.other > 0 && <Tile icon="ti-arrows-diff" value={c.other} label="Saved with another value" sub="in another report — not changed; see Issues (Excel)" tone={T.warning} testid="vimp-n-other" />}
          <Tile icon="ti-alert-triangle" value={c.problems} label="Need a fix" sub="not saved until fixed or skipped" tone={c.problems ? T.warning : undefined} onClick={c.problems ? () => pickFilter("fix") : undefined} testid="vimp-n-fix" />
          <Tile icon="ti-player-skip-forward" value={c.skipped} label="Skipped" sub="other contractor / scope, no direction…" onClick={c.skipped ? () => pickFilter("skipped") : undefined} testid="vimp-n-skip" />
          <Tile icon="ti-message-report" value={recs.filter((m) => m.recommendation.trim()).length} label="Recommendations" sub="saved with the report" onClick={() => pickFilter("recs")} testid="vimp-n-recs" />
        </div>
        {warnings.length > 0 && (
          <details style={{ marginTop: 10, fontSize: 12.5, color: T.textSecondary }}>
            <summary style={{ cursor: "pointer" }}>{warnings.length} note(s) from reading the file</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </FormSection>

      <div role="group" aria-label="Show" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }} data-testid="vimp-filter">
        {[
          ["all", `All machines ${machines.length}`],
          ["fix", `Need a fix ${machines.filter(needsFix).length}`],
          ["recs", "With recommendation"],
          ["skipped", "Skipped"],
        ].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => pickFilter(k)} style={{ ...s.btn, padding: "5px 12px", borderRadius: 999, fontSize: 12.5, background: filter === k ? T.accent : T.cardBg, color: filter === k ? "#fff" : T.textSecondary, borderColor: filter === k ? T.accent : T.border }} data-testid={`vimp-f-${k}`}>
            {l}
          </button>
        ))}
      </div>

      {shown.map((m) => (
        <MachineCard key={m.key} m={m} T={T} s={s} month={month} picks={picks} equipment={scopeEquipment} edit={edit} onPick={pickMachine} isMobile={isMobile} />
      ))}
      {!shown.length && <div style={{ ...s.card, color: T.textSecondary }}>Nothing here.</div>}

      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger, whiteSpace: "pre-wrap", marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", padding: "12px 0", background: T.appBg, zIndex: 2 }}>
        {c.problems > 0 && <span style={{ fontSize: 12.5, color: T.warning, marginRight: "auto" }}>{c.problems} row(s) need a fix — they are left out if you save now.</span>}
        <button type="button" style={s.btnGhost} onClick={() => setStage("pick")} disabled={!!busy}>
          Back
        </button>
        <button type="button" style={s.btnGhost} onClick={onCancel} disabled={!!busy}>
          Cancel
        </button>
        <button type="button" style={s.btnPrimary} onClick={save} disabled={!!busy || (!toSave.length && !recs.length)} data-testid="vimp-save">
          <i className="ti ti-device-floppy" aria-hidden="true" /> {busy || `Save ${toSave.length} readings${recs.length ? ` + ${recs.length} conditions / recommendations` : ""}`}
        </button>
      </div>
    </div>
  );
}

// machines needing a fix first, then by worst condition
function order(ms) {
  const rank = (m) => (m.skipMachine ? 3 : !m.eqId || m.rows.some((r) => r.problem && !r.skip) ? 0 : m.condition ? 1 : 2);
  return ms.sort((a, b) => rank(a) - rank(b) || LEVELS.indexOf(b.condition) - LEVELS.indexOf(a.condition) || String(a.eqIn).localeCompare(String(b.eqIn)));
}

function MachineCard({ m, T, s, month, picks, equipment, edit, onPick, isMobile }) {
  const machine = equipment?.[m.eqId];
  const fix = !m.skipMachine && (!m.eqId || m.rows.some((r) => !r.skip && r.problem));
  const cell = { ...s.input, padding: "4px 6px", width: 70, fontSize: 13 };
  return (
    <section
      style={{ ...s.card, padding: "12px 14px", marginBottom: 12, borderLeft: `4px solid ${m.skipMachine ? T.border : fix ? T.warning : T.success}`, opacity: m.skipMachine ? 0.75 : 1 }}
      data-testid={`vimp-m-${m.eqIn || m.nameIn}`}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: T.textSecondary }}>
          Report: <b style={{ color: T.textPrimary }}>{m.eqIn || "—"}</b> {m.nameIn}
        </span>
        <i className="ti ti-arrow-right" aria-hidden="true" style={{ color: T.textMuted }} />
        {m.eqId && m.matchedBy !== "picked" ? (
          <span style={{ fontSize: 13 }}>
            <b>{m.eqId}</b> {m.eqName}
            {m.matchedBy === "name" && <span style={{ color: T.textSecondary }}> (by name)</span>}
          </span>
        ) : (
          <EquipmentSearch options={picks} value={m.eqId} onChange={(v) => onPick(m.key, v)} placeholder="Pick the machine…" width={260} ariaLabel={`Machine for ${m.eqIn}`} testid={`vimp-pick-${m.eqIn || m.nameIn}`} />
        )}
        {m.machineProblem && <span style={{ fontSize: 12.5, color: m.skipMachine ? T.textSecondary : T.warning }}>{m.machineProblem}</span>}
        <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: T.textSecondary }}>
          <input type="checkbox" checked={m.skipMachine} onChange={(e) => { const v = e.target.checked; edit(m.key, (c) => (c.skipMachine = v)); }} data-testid={`vimp-skipm-${m.eqIn}`} /> Skip machine
        </label>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "minmax(160px, 220px) 1fr", alignItems: "start", marginBottom: m.rows.length ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>
            Condition {m.conditionRaw && <span style={{ fontWeight: 400 }}>(report: “{m.conditionRaw}”)</span>}
          </div>
          <select style={{ ...s.select, width: "100%" }} value={m.condition} onChange={(e) => { const v = e.target.value; edit(m.key, (c) => (c.condition = v)); }} aria-label={`Condition of ${m.eqIn}`} data-testid={`vimp-cond-${m.eqIn}`}>
            <option value="">— none —</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 3 }}>Goes on the machine&apos;s worst point.</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 4 }}>Recommendation</div>
          <textarea
            style={{ ...s.input, minHeight: 54, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
            value={m.recommendation}
            onChange={(e) => {
              const v = e.target.value;
              edit(m.key, (c) => (c.recommendation = v));
            }}
            placeholder="No recommendation in the report"
            aria-label={`Recommendation for ${m.eqIn}`}
            data-testid={`vimp-rec-${m.eqIn}`}
          />
        </div>
      </div>

      {m.rows.length > 0 && isMobile && (
        <div style={{ display: "grid", gap: 8 }}>
          {m.rows.map((r) => {
            const x = rowParts(r, m, machine, month, edit, T, s, cell, true);
            return (
              <div key={r.key} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", opacity: r.skip ? 0.55 : 1, background: r.problem && !r.skip ? T.warningBg : undefined }} data-testid={`vimp-r-${r.key}`}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  {x.point}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    {x.system}
                    {x.report}
                  </span>
                </div>
                <div style={{ marginBottom: 6 }}>{x.vib}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                  {x.date}
                  {x.values}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  {x.state}
                  {x.skip}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {m.rows.length > 0 && !isMobile && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...s.table, fontSize: 13 }}>
            <thead>
              <tr>
                {["Point in report", "VIB ID", "Date", "Values", "System", "Report status", "", ""].map((h, i) => (
                  <th key={i} style={{ ...s.th, padding: "6px 8px", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => {
                const x = rowParts(r, m, machine, month, edit, T, s, cell);
                const td = { ...s.td, padding: "6px 8px" };
                return (
                  <tr key={r.key} style={{ opacity: r.skip ? 0.5 : 1, background: r.problem && !r.skip ? T.warningBg : undefined }} data-testid={`vimp-r-${r.key}`}>
                    <td style={td}>{x.point}</td>
                    <td style={td}>{x.vib}</td>
                    <td style={td}>{x.date}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{x.values}</td>
                    <td style={td}>{x.system}</td>
                    <td style={td}>{x.report}</td>
                    <td style={{ ...td, minWidth: 150 }}>{x.state}</td>
                    <td style={td}>{x.skip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// The pieces of one reading row (table cells on desktop, a card on the phone).
function rowParts(r, m, machine, month, edit, T, s, cell, phone) {
  const fam = r.family === "RMS?" ? "RMS" : r.family;
  const opts = (machine?.points || []).filter((p) => p.family === fam);
  const p = opts.find((x) => x.vibId === r.vibId);
  const fields = p ? (fam === "RMS" ? ["h", "v", "a"] : FIELDS[fam]) : FIELDS[r.family];
  const set = (fn) =>
    edit(m.key, (c) => {
      const x = c.rows.find((y) => y.key === r.key);
      fn(x);
      checkRow(x, month);
    });
  return {
    point: (
      <span>
        {r.pointIn}{" "}
        <span style={{ color: T.textSecondary, fontSize: 12 }}>
          {r.family === "Gs" ? "G's" : r.family === "RMS?" ? "velocity" : r.family}
          {r.sub ? ` ${r.sub}` : ""}
        </span>
        {r.note && <div style={{ fontSize: 11.5, color: T.textMuted }}>{r.note}</div>}
      </span>
    ),
    vib: m.eqId ? (
      <select
        style={{ ...s.select, padding: "4px 6px", fontSize: 12.5, ...(phone ? { width: "100%" } : { width: 230 }) }}
        value={r.vibId}
        onChange={(e) => {
          const v = e.target.value;
          set((x) => {
            x.vibId = v;
            x.manual = true;
          });
        }}
        aria-label={`VIB ID for ${r.pointIn}`}
        data-testid={`vimp-vib-${r.key}`}
      >
        <option value="">— pick —</option>
        {opts.map((o) => (
          <option key={o.vibId} value={o.vibId}>
            {o.vibId} · {String(o.description).split(";")[0]}
          </option>
        ))}
      </select>
    ) : (
      <span style={{ color: T.textMuted, fontSize: 12.5 }}>pick the machine</span>
    ),
    date: (
      <input
        type="date"
        style={{ ...cell, width: 136 }}
        value={r.date}
        onChange={(e) => {
          const v = e.target.value;
          set((x) => (x.date = v));
        }}
        aria-label={`Date for ${r.pointIn}`}
      />
    ),
    values: (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {r.family === "RMS?" && <span style={{ fontSize: 12, color: T.textSecondary, marginRight: 4 }}>report: {r.raw?.X}</span>}
        {fields.map((k) => (
          <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 3, marginRight: 4, fontSize: 12, color: T.textSecondary }}>
            {LABEL[k]}
            <input
              type="number"
              step="any"
              inputMode="decimal"
              style={cell}
              value={r.vals[k] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set((x) => {
                  if (v === "") delete x.vals[k];
                  else x.vals[k] = parseFloat(v);
                });
              }}
              aria-label={`${r.pointIn} ${LABEL[k]}`}
              data-testid={`vimp-val-${r.key}-${k}`}
            />
          </label>
        ))}
      </span>
    ),
    system: r.systemStatus === "No limits" ? <span style={{ fontSize: 12, color: T.textSecondary }}>No limits</span> : r.systemStatus ? <LevelPill level={r.systemStatus} /> : null,
    report: r.reportStatus ? (
      <span title="Report status (the machine's condition)">
        <LevelPill level={r.reportStatus} />
      </span>
    ) : null,
    state: r.skip ? (
      <span style={{ fontSize: 12, color: T.textSecondary }}>Skipped{r.problem ? ` — ${r.problem}` : ""}</span>
    ) : r.problem ? (
      <span style={{ fontSize: 12, color: T.warning }} data-testid={`vimp-prob-${r.key}`}>
        {r.problem}
      </span>
    ) : r.action ? (
      <span title={r.otherReport ? `In ${r.otherReport}` : undefined}>
        <StatePill tone={T[ACTION[r.action][1]] || T.textMuted}>{ACTION[r.action][0]}</StatePill>
        {r.otherReport && <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>{r.otherReport}</div>}
      </span>
    ) : (
      <span />
    ),
    skip: (
      <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: T.textSecondary }}>
        <input
          type="checkbox"
          checked={r.skip}
          onChange={(e) => {
            const v = e.target.checked;
            set((x) => (x.skip = v));
          }}
          aria-label={`Skip ${r.pointIn}`}
          data-testid={`vimp-skip-${r.key}`}
        />{" "}
        Skip
      </label>
    ),
  };
}

// Everything not saved as it is (problems, skipped rows and machines) as an
// Excel sheet to sort out later.
async function exportIssues(machines, rep, results) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import issues");
  ws.columns = [
    { header: "Machine in report", key: "eqIn", width: 16 },
    { header: "Name in report", key: "name", width: 26 },
    { header: "Machine in app", key: "eqId", width: 14 },
    { header: "Point", key: "point", width: 24 },
    { header: "Family", key: "family", width: 8 },
    { header: "Date", key: "date", width: 12 },
    { header: "Values", key: "vals", width: 26 },
    { header: "What", key: "what", width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  machines.forEach((m) => {
    const base = { eqIn: m.eqIn, name: m.nameIn, eqId: m.eqId };
    if (m.machineProblem) ws.addRow({ ...base, what: m.machineProblem });
    if (m.skipMachine) return;
    m.rows.forEach((r) => {
      if (!r.problem && !r.skip && r.action !== "other") return;
      ws.addRow({
        ...base,
        point: r.pointIn + (r.sub ? ` ${r.sub}` : ""),
        family: r.family,
        date: r.date,
        vals: Object.entries(r.raw || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} ${v}`).join(", "),
        what: r.action === "other" && !r.problem && !r.skip ? `Different value already saved in ${r.otherReport} — not changed` : (r.skip ? "Skipped" : "") + (r.problem ? (r.skip ? " — " : "") + r.problem : ""),
      });
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Import issues ${rep["Report ID"]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return results;
}

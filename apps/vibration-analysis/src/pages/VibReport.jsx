import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibReport, saveVibEntries, vibReportTransition } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ModalShell, { FormSection, StepTrail } from "../components/ModalShell";
import { Donut } from "../components/DashCharts";
import Tile, { PageHeader, TabBar } from "../components/Tile";
import { LevelPill, StatePill } from "../components/Level";
import { LEVELS, levelColor, toLevel } from "../levels";
import { fieldsFor, monthLabel, shortDate, systemStatus } from "../vibModel";
import { reportTone, workflowTone } from "../tones";

// One vibration report: its readings per VIB ID (system status from the
// limits, report status from the contractor — the report status wins, both
// kept, "≠" where they differ), coverage of the scope's machines, and the
// history. Workflow: Draft → ACC review → Approved (or Returned).

const STEPS = ["Draft", "ACC review", "Approved"];
const NUM = { h: "Horizontal (mm/s)", v: "Vertical (mm/s)", a: "Axial (mm/s)", hdm: "HDm (dBsv)", hdc: "HDc (dBsv)", g: "G's (g)" };

export default function VibReport({ webhookUrl, reportId, onBack, scopeEquipment }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("readings");
  const [filter, setFilter] = useState("All");
  const [family, setFamily] = useState("All");
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getVibReport(webhookUrl, reportId));
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl, reportId]);
  useEffect(() => {
    load();
  }, [load]);

  const rep = data?.report;
  const me = data?.me || {};
  const entries = useMemo(() => data?.entries || [], [data]);
  const wf = rep?.["Workflow status"] || "";
  const isOwnContractor = me.acc || me.contractor === rep?.Contractor;
  const canEdit = rep && ((["Draft", "Returned"].includes(wf) && isOwnContractor) || (wf === "ACC review" && me.acc));

  // Equipment groups with their worst final status.
  const groups = useMemo(() => {
    const g = {};
    entries.forEach((e) => {
      const k = e["Equipment ID"];
      (g[k] ||= { id: k, name: e["Equipment name"], rows: [], worst: "", report: "", differs: false }).rows.push(e);
    });
    Object.values(g).forEach((x) => {
      x.rows.sort((a, b) => String(a["VIB ID"]).localeCompare(String(b["VIB ID"])) || (a["Measurement date"] < b["Measurement date"] ? -1 : 1));
      x.rows.forEach((e) => {
        if (e["Reading kind"] !== "Report reading") return;
        const f = e["Final status"];
        if (LEVELS.indexOf(f) > LEVELS.indexOf(x.worst)) x.worst = f;
        if (e["Report differs"] === "Yes") x.differs = true;
      });
    });
    return Object.values(g).sort((a, b) => LEVELS.indexOf(b.worst) - LEVELS.indexOf(a.worst) || a.id.localeCompare(b.id));
  }, [entries]);

  const needsLook = (e) => e["Report differs"] === "Yes" || ["Caution", "Alert", "Danger"].includes(e["Final status"]);
  const shown = groups
    .map((g) => ({ ...g, rows: g.rows.filter((e) => (family === "All" || e.Family === family) && (filter === "All" || (filter === "Needs a look" ? needsLook(e) : e["Report differs"] === "Yes"))) }))
    .filter((g) => g.rows.length);

  const machineCounts = LEVELS.map((l) => [l, groups.filter((g) => g.worst === l).length]);
  const differs = entries.filter((e) => e["Report differs"] === "Yes").length;
  const coverage = data?.coverage || [];
  const notMeasured = coverage.filter((c) => !(+c["Readings in app"] > 0) && c.Outcome !== "Report not imported");
  const title = rep ? `${rep.Contractor} · ${rep["Report scope"]} · ${monthLabel(rep.Month)}` : reportId;

  const buttons = rep && (
    <>
      {rep["Report file"] && (
        <a href={rep["Report file"]} target="_blank" rel="noreferrer" style={{ ...s.btnGhost, textDecoration: "none" }}>
          <i className="ti ti-file-type-pdf" aria-hidden="true" /> Report file
        </a>
      )}
      {canEdit && !editing && (
        <button type="button" style={s.btnGhost} onClick={() => setEditing(true)} data-testid="vrep-edit">
          <i className="ti ti-pencil" aria-hidden="true" /> {entries.length ? "Edit readings" : "Add readings"}
        </button>
      )}
      {["Draft", "Returned"].includes(wf) && isOwnContractor && !editing && (
        <button type="button" style={s.btnPrimary} onClick={() => setStep("submit")} disabled={!entries.length} data-testid="vrep-submit">
          <i className="ti ti-send" aria-hidden="true" /> Send to ACC
        </button>
      )}
      {wf === "ACC review" && me.canApprove && !editing && (
        <>
          <button type="button" style={s.btnGhost} onClick={() => setStep("return")} data-testid="vrep-return">
            <i className="ti ti-arrow-back-up" aria-hidden="true" /> Return to {rep.Contractor}
          </button>
          <button type="button" style={s.btnPrimary} onClick={() => setStep("approve")} data-testid="vrep-approve">
            <i className="ti ti-check" aria-hidden="true" /> Approve report
          </button>
        </>
      )}
      {wf === "Approved" && me.canApprove && (
        <button type="button" style={s.btnGhost} onClick={() => setStep("reopen")} data-testid="vrep-reopen">
          Reopen
        </button>
      )}
    </>
  );

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-report">
      <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 8 }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, font: "inherit" }} data-testid="vrep-back">
          Vibration Log
        </button>{" "}
        › {rep ? monthLabel(rep.Month) : ""} › <b style={{ color: T.textPrimary }}>{rep ? `${rep.Contractor} · ${rep["Report scope"]}` : reportId}</b>
      </div>
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          {error}
        </div>
      )}
      {!rep && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading report…</div>}
      {rep && (
        <>
          <PageHeader
            title={
              <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {title}
                <StatePill tone={workflowTone(T, wf)} testid="vrep-wf">
                  {wf}
                </StatePill>
                <StatePill tone={reportTone(T, rep["Report status"])} testid="vrep-status">
                  {rep["Report status"] || "—"}
                </StatePill>
              </span>
            }
            subtitle={[
              rep["Report ID"],
              rep["First reading"] ? `measured ${shortDate(rep["First reading"])}${rep["Last reading"] && rep["Last reading"] !== rep["First reading"] ? ` – ${shortDate(rep["Last reading"])}` : ""}` : "no readings yet",
              `${groups.length} machines · ${entries.length} readings`,
              wf !== "Historic" && rep["Due date"] ? `due ${shortDate(rep["Due date"])}${rep["Received date"] ? ` · received ${shortDate(rep["Received date"])}` : ""}` : "",
              rep["Contractor report no"] ? `report no. ${rep["Contractor report no"]}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            right={buttons}
          />
          {wf !== "Historic" && wf !== "Closed" && <StepTrail steps={STEPS} current={wf === "Returned" ? "Draft" : wf} testid="vrep-steps" />}
          {notice && (
            <div role="status" data-testid="vrep-notice" style={{ ...s.card, marginBottom: 14, borderLeft: `4px solid ${T.info}`, color: T.textPrimary }}>
              {notice}
            </div>
          )}
          {wf === "Returned" && (
            <div role="status" style={{ ...s.card, marginBottom: 14, borderLeft: `4px solid ${T.danger}`, background: T.dangerBg, color: T.textPrimary }}>
              <b>Returned by ACC:</b> {rep["Return reason"]}
            </div>
          )}

          {editing ? (
            <ReadingsEditor
              webhookUrl={webhookUrl}
              rep={rep}
              entries={entries}
              scopeEquipment={scopeEquipment}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                load();
              }}
            />
          ) : (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", marginBottom: 14 }}>
                <div style={{ ...s.card, marginBottom: 0, display: "flex", gap: 14, alignItems: "center" }} data-testid="vrep-donut">
                  <Donut
                    T={T}
                    size={112}
                    thickness={16}
                    segments={machineCounts.map(([l, n]) => ({ label: l, value: n, color: levelColor(T, l) }))}
                    center={groups.length}
                    sub="machines"
                    ariaLabel="Machines by final status"
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                    {machineCounts.map(([l, n]) => (
                      <span key={l} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <LevelPill level={l} />
                        <b style={{ marginLeft: "auto" }}>{n}</b>
                      </span>
                    ))}
                  </div>
                </div>
                <Tile icon="ti-equal-not" value={differs} label="Report status differs from limits" sub="The report status wins · check these first" tone={differs ? T.alert : undefined} onClick={differs ? () => setFilter("Differs") : undefined} testid="vrep-tile-differs" />
                <Tile
                  icon="ti-route-off"
                  value={notMeasured.length}
                  label="Machines not measured"
                  sub={notMeasured.slice(0, 3).map((c) => c["Equipment ID"]).join(" · ") || "All machines in the scope measured"}
                  tone={notMeasured.length ? T.warning : undefined}
                  onClick={notMeasured.length ? () => setTab("coverage") : undefined}
                  testid="vrep-tile-notmeasured"
                />
                <Tile
                  icon="ti-calendar-due"
                  value={rep["Report status"] || "—"}
                  label="45-day report rule"
                  sub={wf === "Historic" ? "Merged from the old records" : rep["Due date"] ? `Due ${shortDate(rep["Due date"])}` : "Due date set by the first reading"}
                  tone={reportTone(T, rep["Report status"])}
                />
              </div>

              <TabBar
                value={tab}
                onChange={setTab}
                testid="vrep-tabs"
                tabs={[
                  { id: "readings", label: "Readings", count: entries.length },
                  { id: "coverage", label: "Coverage", count: coverage.length ? `${coverage.length - notMeasured.length} / ${coverage.length}` : 0 },
                  { id: "history", label: "History", count: (data.history || []).length },
                ]}
              />
              {tab === "readings" && (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    <div role="group" aria-label="Show" style={{ display: "flex", gap: 6 }}>
                      {[
                        ["All", entries.length],
                        ["Needs a look", entries.filter(needsLook).length],
                        ["Differs", differs],
                      ].map(([k, n]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={filter === k}
                          onClick={() => setFilter(k)}
                          style={{ ...s.btn, padding: "5px 12px", borderRadius: 999, fontSize: 12.5, background: filter === k ? T.accent : T.cardBg, color: filter === k ? "#fff" : T.textSecondary, border: `1px solid ${filter === k ? T.accent : T.border}` }}
                        >
                          {k} {n}
                        </button>
                      ))}
                    </div>
                    <select style={s.select} value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Family">
                      {["All", "RMS", "SPM", "Gs"].map((f) => (
                        <option key={f} value={f}>
                          {f === "All" ? "All families" : f === "Gs" ? "G's" : f}
                        </option>
                      ))}
                    </select>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>RMS mm/s · SPM dBsv · G&apos;s g</span>
                  </div>
                  <ReadingsTable T={T} s={s} groups={shown} empty={!entries.length ? (canEdit ? "No readings yet — use Add readings." : "No readings in this report.") : "No readings match this filter."} />
                </>
              )}
              {tab === "coverage" && <CoverageTable T={T} s={s} rows={coverage} />}
              {tab === "history" && <HistoryList T={T} s={s} rows={data.history || []} rep={rep} />}
            </>
          )}
        </>
      )}
      {step && rep && (
        <StepModal
          webhookUrl={webhookUrl}
          step={step}
          rep={rep}
          onClose={() => setStep(null)}
          onDone={(r) => {
            setStep(null);
            const f = r?.findings;
            if (f && (f.created.length || f.added.length)) setNotice(`Checked against the limits: ${f.created.length} new draft action(s), ${f.added.length} finding(s) added to open actions. See the Actions tab.`);
            else if (f) setNotice("Checked against the limits: no machine needs an action.");
            load();
          }}
        />
      )}
    </div>
  );
}

function fmt(v, d = 2) {
  if (v === "" || v === null || v === undefined) return "–";
  const n = parseFloat(v);
  return isNaN(n) ? String(v) : n.toFixed(d);
}

function ReadingsTable({ T, s, groups, empty }) {
  if (!groups.length) return <div style={{ ...s.card, color: T.textSecondary }}>{empty}</div>;
  const muted = { color: T.textMuted };
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vrep-readings">
      <table style={s.table}>
        <thead>
          <tr>
            {["VIB ID", "Point", "Date", "H", "V", "A", "HDm", "HDc", "G's", "System (limits)", "Report", "Final"].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.id} T={T} s={s} g={g} muted={muted} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ T, s, g, muted }) {
  return (
    <>
      <tr style={{ background: T.cardSubBg }} data-testid={`vrep-eq-${g.id}`}>
        <td colSpan={12} style={{ ...s.td, padding: "9px 10px" }}>
          <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b>{g.id}</b>
            <span>{g.name}</span>
            <LevelPill level={g.worst} />
            {g.differs && <StatePill tone={T.alert}>≠ differs</StatePill>}
          </span>
        </td>
      </tr>
      {g.rows.map((e) => {
        const fam = e.Family;
        const rms = fam === "RMS";
        const spm = fam === "SPM";
        const earlier = e["Reading kind"] !== "Report reading";
        return (
          <tr key={e["Entry ID"] || e["VIB ID"] + e["Measurement date"]} style={earlier ? { opacity: 0.7 } : undefined}>
            <td style={{ ...s.td, color: T.textSecondary, whiteSpace: "nowrap" }}>{e["VIB ID"]}</td>
            <td style={s.td}>
              {e["Point description"]}
              {earlier && <div style={{ fontSize: 12, color: T.textMuted }}>earlier reading this month</div>}
            </td>
            <td style={{ ...s.td, whiteSpace: "nowrap" }}>{shortDate(e["Measurement date"])}</td>
            <td style={{ ...s.td, ...(rms ? {} : muted) }}>{rms ? fmt(e[NUM.h]) : "–"}</td>
            <td style={{ ...s.td, ...(rms ? {} : muted) }}>{rms ? fmt(e[NUM.v]) : "–"}</td>
            <td style={{ ...s.td, ...(rms ? {} : muted) }}>{rms ? fmt(e[NUM.a]) : "–"}</td>
            <td style={{ ...s.td, ...(spm ? {} : muted) }}>{spm ? fmt(e[NUM.hdm], 0) : "–"}</td>
            <td style={{ ...s.td, ...(spm ? {} : muted) }}>{spm ? fmt(e[NUM.hdc], 0) : "–"}</td>
            <td style={{ ...s.td, ...(fam === "Gs" ? {} : muted) }}>{fam === "Gs" ? fmt(e[NUM.g], 3) : "–"}</td>
            <td style={s.td}>{e["System status"] === "No limits" ? <span style={{ fontSize: 12, color: T.textSecondary }}>No limits</span> : <LevelPill level={e["System status"]} />}</td>
            <td style={s.td}>
              <LevelPill level={toLevel(e["Report status"])} />
            </td>
            <td style={{ ...s.td, whiteSpace: "nowrap" }}>
              <LevelPill level={e["Final status"]} />
              {e["Report differs"] === "Yes" && (
                <b title="Report status differs from the limits" style={{ color: T.alert, marginLeft: 6 }}>
                  ≠
                </b>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function CoverageTable({ T, s, rows }) {
  if (!rows.length) return <div style={{ ...s.card, color: T.textSecondary }}>No coverage recorded for this report yet — it is worked out when the readings are saved.</div>;
  const tone = (o) => ({ Received: T.success, "Report not imported": T.accent, "Not measured": T.warning, Missing: T.danger, "Readings without compliance mark": T.warning }[o] || T.textSecondary);
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vrep-coverage">
      <table style={s.table}>
        <thead>
          <tr>
            {["Equipment", "Name", "Line", "Readings", "Old mark", "Outcome"].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c["Equipment ID"]}>
              <td style={{ ...s.td, fontWeight: 600 }}>{c["Equipment ID"]}</td>
              <td style={s.td}>{c["Equipment name"]}</td>
              <td style={s.td}>{c.Line}</td>
              <td style={s.td}>{c["Readings in app"] || 0}</td>
              <td style={{ ...s.td, color: T.textSecondary }}>{c["Compliance mark (old)"] || "—"}</td>
              <td style={s.td}>
                <StatePill tone={tone(c.Outcome)}>{c.Outcome}</StatePill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryList({ T, s, rows, rep }) {
  const items = rows.length ? rows : rep["Workflow status"] === "Historic" ? [{ when: "", who: "", action: "Merged from the old RMS / SPM data and Compliance Tracker", details: rep.Source }] : [];
  if (!items.length) return <div style={{ ...s.card, color: T.textSecondary }}>No history yet.</div>;
  return (
    <ol style={{ ...s.card, listStyle: "none", margin: 0, padding: 16 }} data-testid="vrep-history">
      {items.map((h, i) => (
        <li key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < items.length - 1 ? `1px solid ${T.border2}` : "none" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: T.accent, marginTop: 5, flexShrink: 0 }} />
          <span>
            <b style={{ color: T.textPrimary }}>{h.action}</b>
            {h.details && <span style={{ color: T.textSecondary }}> — {h.details}</span>}
            <div style={{ fontSize: 12, color: T.textMuted }}>
              {[h.who, h.when ? new Date(h.when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""].filter(Boolean).join(" · ")}
            </div>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepModal({ webhookUrl, step, rep, onClose, onDone }) {
  const { T, s } = useTheme();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cfg = {
    submit: { icon: "send", title: "Send report to ACC", btn: "Send to ACC", text: "ACC will review the readings. You can't change them while ACC reviews, unless ACC returns the report.", reason: false },
    approve: { icon: "check", title: "Approve report", btn: "Approve", text: "The readings become part of the vibration history and the report is closed.", reason: false },
    return: { icon: "arrow-back-up", title: `Return to ${rep.Contractor}`, btn: "Return report", text: "Say what needs fixing. The contractor engineer gets an email.", reason: true },
    reopen: { icon: "lock-open", title: "Reopen report", btn: "Reopen", text: "Moves the report back to ACC review so readings can be corrected.", reason: true },
  }[step];
  const go = async () => {
    if (cfg.reason && !reason.trim()) return setError("Please give the reason.");
    setBusy(true);
    try {
      const r = await vibReportTransition(webhookUrl, { reportId: rep["Report ID"], to: step, reason });
      onDone(r);
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  return (
    <ModalShell
      icon={cfg.icon}
      title={cfg.title}
      subtitle={`${rep["Report ID"]} · ${rep.Contractor} ${rep["Report scope"]} · ${monthLabel(rep.Month)}`}
      onClose={onClose}
      width={520}
      testid="vrep-step-modal"
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={go} disabled={busy} data-testid="vrep-step-go">
            {busy ? "Saving…" : cfg.btn}
          </button>
        </>
      }
    >
      <FormSection icon="info-circle" title={cfg.text}>
        {cfg.reason && <textarea style={{ ...s.input, minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" data-testid="vrep-step-reason" />}
      </FormSection>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13 }}>
          {error}
        </div>
      )}
    </ModalShell>
  );
}

// Entering the readings of a report: every VIB ID of the report's scope,
// grouped by machine, with only the fields that VIB ID takes. Rows left
// empty are not saved. The system status shows as you type; the server
// works it out again on save.
function ReadingsEditor({ webhookUrl, rep, entries, scopeEquipment, onCancel, onSaved }) {
  const { T, s } = useTheme();
  const machines = useMemo(
    () =>
      Object.values(scopeEquipment || {})
        .filter((x) => x.contractor === rep.Contractor && x.scope === rep["Report scope"] && x.points.length)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [scopeEquipment, rep]
  );
  const initial = useMemo(() => {
    const m = {};
    entries
      .filter((e) => e["Reading kind"] === "Report reading" || !e["Reading kind"])
      .forEach((e) => {
        m[e["VIB ID"]] = { date: e["Measurement date"], h: e[NUM.h] ?? "", v: e[NUM.v] ?? "", a: e[NUM.a] ?? "", hdm: e[NUM.hdm] ?? "", hdc: e[NUM.hdc] ?? "", g: e[NUM.g] ?? "", reportStatus: toLevel(e["Report status"]), notes: e.Notes || "" };
      });
    return m;
  }, [entries]);
  const [vals, setVals] = useState(initial);
  const [defDate, setDefDate] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState("");
  const earlier = entries.filter((e) => e["Reading kind"] === "Earlier reading in month");

  const set = (vib, k, v) => setVals((p) => ({ ...p, [vib]: { ...(p[vib] || {}), [k]: v } }));
  const filled = (r) => r && ["h", "v", "a", "hdm", "hdc", "g"].some((k) => r[k] !== "" && r[k] != null);
  const count = Object.values(vals).filter(filled).length;
  const list = machines.filter((m) => !search || (m.id + " " + m.name).toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    setError("");
    setProblems([]);
    const out = [];
    Object.entries(vals).forEach(([vibId, r]) => {
      if (!filled(r)) return;
      out.push({ vibId, date: r.date || defDate, h: r.h, v: r.v, a: r.a, hdm: r.hdm, hdc: r.hdc, g: r.g, reportStatus: r.reportStatus, notes: r.notes });
    });
    earlier.forEach((e) => out.push({ vibId: e["VIB ID"], date: e["Measurement date"], h: e[NUM.h], v: e[NUM.v], a: e[NUM.a], hdm: e[NUM.hdm], hdc: e[NUM.hdc], g: e[NUM.g], reportStatus: toLevel(e["Report status"]), notes: e.Notes }));
    const noDate = out.filter((x) => !x.date);
    if (noDate.length) return setError(`${noDate.length} reading(s) have no measurement date — set "Date for all" or a date on each row.`);
    setBusy(true);
    try {
      await saveVibEntries(webhookUrl, rep["Report ID"], out);
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setProblems(e.problems || []);
      setBusy(false);
    }
  };

  const cell = { ...s.input, padding: "5px 6px", width: 74, fontSize: 13 };
  return (
    <div data-testid="vrep-editor">
      <div style={{ ...s.card, marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <b>Enter readings</b>
        <span style={{ fontSize: 12.5, color: T.textSecondary }}>
          {machines.length} machines in {rep.Contractor} {rep["Report scope"]} · {count} VIB IDs filled · numbers only, empty rows are skipped
        </span>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: T.textSecondary, marginLeft: "auto" }}>
          Date for all
          <input type="date" style={{ ...s.input, width: 150 }} value={defDate} onChange={(e) => setDefDate(e.target.value)} data-testid="vrep-defdate" />
        </label>
        <input style={{ ...s.input, width: 200 }} placeholder="Find machine" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div style={{ ...s.card, padding: 0, overflowX: "auto", marginBottom: 12 }}>
        <table style={s.table}>
          <thead>
            <tr>
              {["VIB ID", "Point", "Date", "H", "V", "A", "HDm", "HDc", "G's", "System", "Report status", "Note"].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <EditorMachine key={m.id} T={T} s={s} m={m} vals={vals} set={set} cell={cell} defDate={defDate} />
            ))}
            {!list.length && (
              <tr>
                <td colSpan={12} style={{ ...s.td, color: T.textSecondary }}>
                  No machines found for this scope. Check the VIB ID Registry and the RMS / SPM Registers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {earlier.length > 0 && <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>{earlier.length} earlier reading(s) in the month are kept as they are.</div>}
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger, whiteSpace: "pre-wrap", marginBottom: 12 }}>
          {error}
          {problems.length > 8 && <div style={{ marginTop: 6, fontSize: 12 }}>{problems.slice(8).join("\n")}</div>}
        </div>
      )}
      <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 10, justifyContent: "flex-end", padding: "12px 0", background: T.appBg }}>
        <button type="button" style={s.btnGhost} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vrep-save-readings">
          {busy ? "Saving…" : `Save ${count} readings`}
        </button>
      </div>
    </div>
  );
}

function EditorMachine({ T, s, m, vals, set, cell, defDate }) {
  return (
    <>
      <tr style={{ background: T.cardSubBg }}>
        <td colSpan={12} style={{ ...s.td, padding: "8px 10px" }}>
          <b>{m.id}</b> <span style={{ color: T.textSecondary }}>{m.name}</span>
        </td>
      </tr>
      {m.points.map((p) => {
        const r = vals[p.vibId] || {};
        const fields = fieldsFor(p);
        const sys = systemStatus(p, m, r);
        const input = (k, step = "0.01") =>
          fields.includes(k) ? (
            <input type="number" step={step} inputMode="decimal" style={cell} value={r[k] ?? ""} onChange={(e) => set(p.vibId, k, e.target.value)} aria-label={`${p.vibId} ${k}`} data-testid={`ed-${p.vibId}-${k}`} />
          ) : (
            <span style={{ color: T.textMuted }}>–</span>
          );
        return (
          <tr key={p.vibId}>
            <td style={{ ...s.td, color: T.textSecondary, fontSize: 12, whiteSpace: "nowrap" }}>{p.vibId}</td>
            <td style={{ ...s.td, fontSize: 12.5 }}>{String(p.description).split(";")[0]}</td>
            <td style={s.td}>
              <input type="date" style={{ ...cell, width: 138 }} value={r.date || ""} placeholder={defDate} onChange={(e) => set(p.vibId, "date", e.target.value)} aria-label={`${p.vibId} date`} />
            </td>
            <td style={s.td}>{input("h")}</td>
            <td style={s.td}>{input("v")}</td>
            <td style={s.td}>{input("a")}</td>
            <td style={s.td}>{input("hdm", "1")}</td>
            <td style={s.td}>{input("hdc", "1")}</td>
            <td style={s.td}>{input("g", "0.001")}</td>
            <td style={s.td}>{sys === "No limits" ? <span style={{ fontSize: 12, color: T.textSecondary }}>No limits</span> : <LevelPill level={sys} />}</td>
            <td style={s.td}>
              <select style={{ ...s.select, padding: "5px 6px" }} value={r.reportStatus || ""} onChange={(e) => set(p.vibId, "reportStatus", e.target.value)} aria-label={`${p.vibId} report status`}>
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </td>
            <td style={s.td}>
              <input style={{ ...cell, width: 140 }} value={r.notes || ""} onChange={(e) => set(p.vibId, "notes", e.target.value)} aria-label={`${p.vibId} note`} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

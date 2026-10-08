import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibActions, getVibLog, getVibReport, saveVibReport, vibReportTransition } from "../api";
import { generateVibReportPdf } from "../vibPdf";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import ModalShell, { FormSection, ReadValue } from "../components/ModalShell";
import Tile, { PageHeader } from "../components/Tile";
import { LevelSymbol, StatePill } from "../components/Level";
import { levelColor } from "../levels";
import { addDays, monthEnd, monthLabel, reportId, SCOPES, shortDate } from "../vibModel";
import VibReport from "./VibReport";
import { reportTone, workflowTone } from "../tones";

// Vibration Log: the timeline of contractor reports (one card per
// contractor scope per month, newest first). Opens a report on the same
// tab (VibReport). Workflow and the 45-day rule live in the backend
// (VibrationLog.js); months with no report row yet are shown here as
// "Not due yet" / "Overdue" from the same rule (month end + 45 days).

const CONTRACTOR_ORDER = ["RHI", "ASEC"];

export default function VibrationLog({ webhookUrl, openReportId, setOpenReportId, scopeEquipment }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [contractor, setContractor] = useState("All");
  const [year, setYear] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [view, setView] = useState("Timeline");
  const [adding, setAdding] = useState(null);
  const [skipping, setSkipping] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await getVibLog(webhookUrl);
      setData(d);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl]);
  useEffect(() => {
    load();
  }, [load]);

  const me = data?.me || { contractor: "", acc: true, canApprove: false };
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const scopes = useMemo(
    () =>
      (data?.scopes || [])
        .filter((sc) => contractor === "All" || sc.contractor === contractor)
        .sort((a, b) => CONTRACTOR_ORDER.indexOf(a.contractor) - CONTRACTOR_ORDER.indexOf(b.contractor) || SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope)),
    [data, contractor]
  );
  const reports = useMemo(() => (data?.reports || []).filter((r) => contractor === "All" || r.Contractor === contractor), [data, contractor]);
  const byKey = useMemo(() => Object.fromEntries(reports.map((r) => [`${r.Month}|${r.Contractor}|${r["Report scope"]}`, r])), [reports]);

  const years = useMemo(() => {
    const ys = new Set(reports.map((r) => r.Month.slice(0, 4)));
    ys.add(thisMonth.slice(0, 4));
    return [...ys].sort().reverse();
  }, [reports, thisMonth]);
  const yr = year || thisMonth.slice(0, 4);

  // Every month of the chosen year up to now (and the current month, which
  // is "not due yet"), each with one cell per scope.
  const months = useMemo(() => {
    const first = reports.length ? reports.map((r) => r.Month).sort()[0] : thisMonth;
    const out = [];
    for (let m = 12; m >= 1; m--) {
      const month = `${yr}-${String(m).padStart(2, "0")}`;
      if (month > thisMonth || month < first) continue;
      const cells = scopes.map((sc) => {
        const r = byKey[`${month}|${sc.contractor}|${sc.scope}`];
        if (r) return { ...sc, month, report: r, status: r["Report status"] };
        const due = addDays(monthEnd(month), 45);
        return { ...sc, month, report: null, due, status: today > due ? "Overdue" : "Not due yet" };
      });
      out.push({ month, cells });
    }
    return out;
  }, [yr, thisMonth, reports, scopes, byKey, today]);

  const visibleMonths = useMemo(
    () => (statusFilter === "All" ? months : months.map((m) => ({ ...m, cells: m.cells.filter((c) => c.status === statusFilter || c.report?.["Workflow status"] === statusFilter) })).filter((m) => m.cells.length)),
    [months, statusFilter]
  );

  const allCells = months.flatMap((m) => m.cells);
  const yearReports = reports.filter((r) => r.Month.startsWith(yr));
  const waiting = reports.filter((r) => r["Workflow status"] === "ACC review");
  const drafts = reports.filter((r) => ["Draft", "Returned"].includes(r["Workflow status"]));
  const dueCells = allCells.filter((c) => c.status !== "Not due yet");
  const received = dueCells.filter((c) => ["Received", "Received late"].includes(c.status));
  const onTime = dueCells.filter((c) => c.status === "Received");
  const late = allCells.filter((c) => ["Overdue", "Missing"].includes(c.status));
  const notImported = reports.filter((r) => r["Report status"] === "Report not imported");

  if (openReportId) {
    return (
      <VibReport
        webhookUrl={webhookUrl}
        reportId={openReportId}
        onBack={() => {
          setOpenReportId(null);
          load();
        }}
        scopeEquipment={scopeEquipment}
      />
    );
  }

  const statusOptions = ["All", "Received", "Received late", "Awaiting report", "Overdue", "Missing", "Report not imported", "Skipped", "Draft", "ACC review", "Returned", "Approved"];
  const contractors = me.contractor ? [me.contractor] : CONTRACTOR_ORDER;

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-log">
      <PageHeader
        title="Vibration Log"
        subtitle={
          data
            ? `${reports.length} reports · ${waiting.length} waiting ACC review · ${drafts.length} draft or returned · ${late.length} overdue or missing in ${yr}`
            : "Loading reports…"
        }
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={contractors} testid="vlog-contractor" />
            <button type="button" style={s.btnGhost} onClick={() => setPdfOpen(true)} disabled={!reports.length} data-testid="vlog-pdf">
              <i className="ti ti-download" aria-hidden="true" /> Month PDF
            </button>
            {(me.acc || me.contractor) && (
              <button type="button" style={s.btnPrimary} onClick={() => setAdding({})} data-testid="vlog-add">
                <i className="ti ti-plus" aria-hidden="true" /> Add report
              </button>
            )}
          </>
        }
      />
      {error && (
        <div style={{ ...s.card, borderColor: T.danger, color: T.danger, marginBottom: 14 }} role="alert">
          Couldn't load the Vibration Log: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px", marginLeft: 8 }} onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {data && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", marginBottom: 14 }}>
            <Tile
              icon="ti-hourglass"
              value={waiting.length}
              label={me.acc ? "Waiting ACC review" : "With ACC for review"}
              sub={waiting.slice(0, 2).map((r) => `${r.Contractor} ${r["Report scope"]} · ${monthLabel(r.Month)}`).join(" · ") || "Nothing to review"}
              tone={waiting.length ? T.info : undefined}
              onClick={waiting.length ? () => setStatusFilter("ACC review") : undefined}
              testid="vlog-tile-review"
            />
            <Tile
              icon="ti-circle-check"
              value={`${received.length} / ${dueCells.length}`}
              label={`Reports received in ${yr}`}
              sub={dueCells.length ? `${Math.round((onTime.length / dueCells.length) * 100)}% on time (45 days) · target 95%` : "None due yet"}
              testid="vlog-tile-received"
            />
            <Tile
              icon="ti-alert-triangle"
              value={late.length}
              label={`Overdue or missing in ${yr}`}
              sub={late.slice(0, 3).map((c) => `${c.contractor} ${c.scope} ${c.month.slice(5)}`).join(" · ") || "All in"}
              tone={late.length ? T.danger : undefined}
              onClick={late.length ? () => setStatusFilter("Overdue") : undefined}
              testid="vlog-tile-late"
            />
            <Tile
              icon="ti-file-import"
              value={notImported.length}
              label="Reports not imported"
              sub="Received at ACC before the app; readings not in it"
              tone={notImported.length ? T.accent : undefined}
              testid="vlog-tile-notimported"
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.textSecondary }}>
              Year
              <select style={s.select} value={yr} onChange={(e) => setYear(e.target.value)} data-testid="vlog-year">
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.textSecondary }}>
              Status
              <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="vlog-status">
                {statusOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <ContractorChips value={view} onChange={setView} options={["Timeline", "Table"]} allLabel={null} label="View" size="sm" testid="vlog-view" />
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>Due 45 days after measurement · newest first</span>
          </div>

          {view === "Timeline" ? (
            <Timeline T={T} s={s} months={visibleMonths} scopesCount={Math.max(1, scopes.length)} me={me} isMobile={isMobile} onOpen={setOpenReportId} onAdd={setAdding} onSkip={setSkipping} />
          ) : (
            <LogTable T={T} s={s} rows={yearReports.filter((r) => statusFilter === "All" || r["Report status"] === statusFilter || r["Workflow status"] === statusFilter)} onOpen={setOpenReportId} />
          )}
        </>
      )}
      {adding && (
        <AddReportModal
          webhookUrl={webhookUrl}
          me={me}
          scopes={data?.scopes || []}
          preset={adding}
          thisMonth={thisMonth}
          onClose={() => setAdding(null)}
          onSaved={(id) => {
            setAdding(null);
            setOpenReportId(id);
          }}
        />
      )}
      {pdfOpen && <MonthPdfModal webhookUrl={webhookUrl} reports={reports} onClose={() => setPdfOpen(false)} />}
      {skipping && (
        <SkipModal
          webhookUrl={webhookUrl}
          cell={skipping}
          onClose={() => setSkipping(null)}
          onSaved={() => {
            setSkipping(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Timeline({ T, s, months, scopesCount, me, isMobile, onOpen, onAdd, onSkip }) {
  if (!months.length) return <div style={{ ...s.card, color: T.textSecondary }}>No reports match these filters.</div>;
  return (
    <div style={{ position: "relative", paddingLeft: 26 }} data-testid="vlog-timeline">
      <div style={{ position: "absolute", left: 7, top: 6, bottom: 0, width: 2, background: T.border }} />
      {months.map(({ month, cells }, i) => (
        <section key={month} style={{ position: "relative", marginBottom: 18 }} data-testid={`vlog-month-${month}`}>
          <span style={{ position: "absolute", left: -25, top: 3, width: 14, height: 14, borderRadius: "50%", background: T.cardBg, border: `3px solid ${i === 0 ? T.border : T.accent}` }} />
          <div style={{ fontWeight: 700, fontSize: 14.5, color: T.textPrimary, marginBottom: 8 }}>{monthLabel(month)}</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(scopesCount, 3)}, minmax(0, 1fr))` }}>
            {cells.map((c) => (
              <ReportCard key={c.contractor + c.scope} T={T} s={s} cell={c} me={me} onOpen={onOpen} onAdd={onAdd} onSkip={onSkip} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScopeHead({ T, cell, right }) {
  const dot = cell.contractor === "ASEC" ? "#2a78d6" : "#eb6834";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} aria-hidden="true" />
      <b style={{ color: T.textPrimary }}>{cell.contractor}</b>
      <span style={{ color: T.textSecondary }}>· {cell.scope}</span>
      <span style={{ marginLeft: "auto" }}>{right}</span>
    </div>
  );
}

function ReportCard({ T, s, cell, me, onOpen, onAdd, onSkip }) {
  const r = cell.report;
  const tone = reportTone(T, cell.status);
  const canAddHere = me.acc || me.contractor === cell.contractor;
  const testid = `vlog-card-${cell.month}-${cell.contractor}-${cell.scope.replace(/\s+/g, "")}`;
  const base = { ...s.card, marginBottom: 0, padding: 14, fontSize: 13 };

  if (!r || (r["Workflow status"] === "Historic" && cell.status === "Missing")) {
    const overdue = cell.status === "Overdue" || cell.status === "Missing";
    return (
      <div data-testid={testid} style={{ ...base, border: `2px dashed ${overdue ? T.danger : T.border}`, background: overdue ? T.dangerBg : "transparent" }}>
        <ScopeHead T={T} cell={cell} right={<StatePill tone={tone}>{cell.status}</StatePill>} />
        <div style={{ color: T.textSecondary, marginTop: 10 }}>
          {overdue ? (r ? "No report received (history)" : `No report · was due ${shortDate(cell.due)}`) : `Expected by ${shortDate(cell.due)} · ${cell.equipment} machines`}
        </div>
        {overdue && (canAddHere || me.canApprove) && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {canAddHere && (
              <button type="button" style={{ ...s.btnGhost, padding: "5px 10px" }} onClick={() => onAdd({ month: cell.month, contractor: cell.contractor, scope: cell.scope })}>
                Add report
              </button>
            )}
            {me.canApprove && (
              <button type="button" style={{ ...s.btnGhost, padding: "5px 10px" }} onClick={() => onSkip(cell)}>
                Mark skipped…
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const wf = r["Workflow status"];
  if (cell.status === "Report not imported" || cell.status === "Skipped") {
    return (
      <div data-testid={testid} style={{ ...base, background: T.cardSubBg }}>
        <ScopeHead T={T} cell={cell} right={<StatePill tone={tone}>{cell.status}</StatePill>} />
        <div style={{ color: T.textSecondary, marginTop: 10 }}>{cell.status === "Skipped" ? r.Notes || "Skipped by ACC" : "Received at ACC (Compliance Tracker) · readings not in the app"}</div>
      </div>
    );
  }
  const counts = [
    ["Normal", +r.Normal || 0],
    ["Caution", +r.Caution || 0],
    ["Alert", +r.Alert || 0],
    ["Danger", +r.Danger || 0],
  ];
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const diff = +r["Report vs limits differ"] || 0;
  const action = wf === "ACC review" && me.canApprove ? "Review" : ["Draft", "Returned"].includes(wf) && canAddHere ? "Continue" : "Open";
  return (
    <div data-testid={testid} style={{ ...base, borderLeft: wf === "ACC review" ? `4px solid ${T.info}` : wf === "Returned" ? `4px solid ${T.danger}` : base.border }}>
      <ScopeHead
        T={T}
        cell={cell}
        right={
          <span style={{ display: "inline-flex", gap: 5 }}>
            {wf !== "Historic" && wf !== "Approved" && <StatePill tone={workflowTone(T, wf)}>{wf}</StatePill>}
            <StatePill tone={tone}>{cell.status}</StatePill>
          </span>
        }
      />
      <div style={{ color: T.textSecondary, marginTop: 5, fontSize: 12.5 }}>
        {r["First reading"] ? `Measured ${shortDate(r["First reading"])}` : "No readings yet"} · {+r.Entries || 0} readings{wf === "Historic" ? " · history" : wf === "Approved" ? " · approved" : ""}
        {diff > 0 && <b style={{ color: T.alert || T.danger }}> · {diff} differ from limits</b>}
      </div>
      {total > 0 && (
        <>
          <div style={{ display: "flex", gap: 2, height: 8, margin: "10px 0 6px" }} aria-hidden="true">
            {counts.map(([lvl, n]) => (n ? <span key={lvl} style={{ flex: n, background: levelColor(T, lvl), borderRadius: 2 }} /> : null))}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, alignItems: "center" }}>
            {counts.map(([lvl, n]) => (
              <span key={lvl} title={lvl} style={{ display: "inline-flex", gap: 4, alignItems: "center", color: T.textPrimary }}>
                <LevelSymbol level={lvl} /> {n}
              </span>
            ))}
            <span style={{ marginLeft: "auto", color: T.textSecondary }}>machines</span>
          </div>
        </>
      )}
      {wf === "Returned" && r["Return reason"] && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.danger }}>
          <i className="ti ti-arrow-back-up" aria-hidden="true" /> {r["Return reason"]}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.textSecondary }}>{r["Due date"] && wf !== "Historic" ? `Due ${shortDate(r["Due date"])}` : ""}</span>
        <button
          type="button"
          onClick={() => onOpen(r["Report ID"])}
          style={action === "Open" ? { ...s.btnGhost, marginLeft: "auto", padding: "5px 12px" } : { ...s.btnPrimary, marginLeft: "auto", padding: "5px 12px" }}
          data-testid={`${testid}-open`}
        >
          {action}
          {action === "Open" && <i className="ti ti-chevron-right" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function LogTable({ T, s, rows, onOpen }) {
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vlog-table">
      <table style={s.table}>
        <thead>
          <tr>
            {["Report", "Month", "Contractor", "Scope", "Report status", "Workflow", "Measured", "Due", "Readings", "Normal", "Caution", "Alert", "Danger", ""].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            .slice()
            .sort((a, b) => (a.Month < b.Month ? 1 : -1))
            .map((r) => (
              <tr key={r["Report ID"]} style={{ cursor: "pointer" }} onClick={() => onOpen(r["Report ID"])}>
                <td style={{ ...s.td, fontWeight: 600 }}>{r["Report ID"]}</td>
                <td style={s.td}>{r.Month}</td>
                <td style={s.td}>{r.Contractor}</td>
                <td style={s.td}>{r["Report scope"]}</td>
                <td style={s.td}>
                  <StatePill tone={reportTone(T, r["Report status"])}>{r["Report status"] || "—"}</StatePill>
                </td>
                <td style={s.td}>
                  <StatePill tone={workflowTone(T, r["Workflow status"])}>{r["Workflow status"]}</StatePill>
                </td>
                <td style={s.td}>{shortDate(r["First reading"])}</td>
                <td style={s.td}>{r["Workflow status"] === "Historic" ? "" : shortDate(r["Due date"])}</td>
                <td style={s.td}>{r.Entries || 0}</td>
                {["Normal", "Caution", "Alert", "Danger"].map((l) => (
                  <td key={l} style={{ ...s.td, color: +r[l] ? levelColor(T, l) : T.textMuted, fontWeight: +r[l] ? 700 : 400 }}>
                    {r[l] || 0}
                  </td>
                ))}
                <td style={{ ...s.td, color: T.textSecondary }}>›</td>
              </tr>
            ))}
          {!rows.length && (
            <tr>
              <td style={{ ...s.td, color: T.textSecondary }} colSpan={14}>
                No reports match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AddReportModal({ webhookUrl, me, scopes, preset, thisMonth, onClose, onSaved }) {
  const { T, s } = useTheme();
  const [contractor, setContractor] = useState(me.contractor || preset.contractor || "RHI");
  const [scope, setScope] = useState(preset.scope || "");
  const [month, setMonth] = useState(preset.month || thisMonth);
  const [no, setNo] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [file, setFile] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scopeOptions = scopes.filter((sc) => sc.contractor === contractor).map((sc) => sc.scope);
  useEffect(() => {
    if (scopeOptions.length && !scopeOptions.includes(scope)) setScope(scopeOptions[0]);
  }, [contractor]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setError("");
    if (!scope) return setError("Pick the report scope.");
    if (!month) return setError("Pick the report month.");
    setBusy(true);
    try {
      const r = await saveVibReport(webhookUrl, { contractor, scope, month, contractorReportNo: no, analyst, issueDate, reportFile: file, notes });
      onSaved(r.reportId);
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  const label = { ...s.label, fontSize: 12 };
  return (
    <ModalShell
      icon="file-plus"
      title="Add vibration report"
      subtitle="Creates a draft. Add the readings next, then send it to ACC."
      onClose={onClose}
      width={640}
      testid="vlog-add-modal"
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vlog-add-save">
            {busy ? "Creating…" : "Create draft"}
          </button>
        </>
      }
    >
      <FormSection icon="building-factory-2" title="Which report">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          {me.contractor ? (
            <ReadValue label="Contractor">{me.contractor}</ReadValue>
          ) : (
            <div>
              <span style={label}>Contractor</span>
              <ContractorChips value={contractor} onChange={setContractor} allLabel={null} testid="vlog-add-contractor" />
            </div>
          )}
          <div>
            <span style={label}>Report scope</span>
            <ContractorChips value={scope} onChange={setScope} options={scopeOptions} allLabel={null} label="Scope" testid="vlog-add-scope" />
            {scopeOptions.length === 1 && <div style={{ fontSize: 13.5, fontWeight: 600, color: T.textPrimary }}>{scopeOptions[0]}</div>}
          </div>
          <label>
            <span style={label}>Report month</span>
            <input type="month" style={s.input} value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} data-testid="vlog-add-month" />
          </label>
          <ReadValue label="Report ID" hint="One report per contractor, scope and month.">
            {scope && month ? reportId(month, contractor, scope) : "—"}
          </ReadValue>
        </div>
      </FormSection>
      <FormSection icon="file-description" title="Report details" hint="optional">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          <label>
            <span style={label}>Contractor report no.</span>
            <input style={s.input} value={no} onChange={(e) => setNo(e.target.value)} />
          </label>
          <label>
            <span style={label}>Analyst</span>
            <input style={s.input} value={analyst} onChange={(e) => setAnalyst(e.target.value)} />
          </label>
          <label>
            <span style={label}>Issue date</span>
            <input type="date" style={s.input} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <label>
            <span style={label}>Report file link (PDF)</span>
            <input style={s.input} value={file} placeholder="https://drive.google.com/…" onChange={(e) => setFile(e.target.value)} />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <span style={label}>Notes</span>
          <textarea style={{ ...s.input, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </FormSection>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13, whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
    </ModalShell>
  );
}

function SkipModal({ webhookUrl, cell, onClose, onSaved }) {
  const { T, s } = useTheme();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!reason.trim()) return setError("Give the reason for skipping.");
    setBusy(true);
    try {
      await vibReportTransition(webhookUrl, { to: "skip", month: cell.month, contractor: cell.contractor, scope: cell.scope, reason });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  return (
    <ModalShell
      icon="calendar-off"
      title="Mark report as skipped"
      subtitle={`${cell.contractor} · ${cell.scope} · ${monthLabel(cell.month)}`}
      onClose={onClose}
      width={520}
      testid="vlog-skip-modal"
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vlog-skip-save">
            {busy ? "Saving…" : "Mark skipped"}
          </button>
        </>
      }
    >
      <FormSection icon="message" title="Why is there no report?">
        <textarea style={{ ...s.input, minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. plant shutdown, no measurement this month" data-testid="vlog-skip-reason" />
        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>The month stops counting as overdue. This is kept in the report history.</div>
      </FormSection>
      {error && <div role="alert" style={{ color: T.danger, fontSize: 13 }}>{error}</div>}
    </ModalShell>
  );
}

// Combined PDF for one month: every report of that month (one scope or all
// scopes the person can see), each with its machines, findings and readings.
function MonthPdfModal({ webhookUrl, reports, onClose }) {
  const { T, s } = useTheme();
  const withData = reports.filter((r) => +r.Entries > 0 || ["Draft", "ACC review", "Returned", "Approved"].includes(r["Workflow status"]));
  const months = [...new Set(withData.map((r) => r.Month))].sort().reverse();
  const [month, setMonth] = useState(months[0] || "");
  const inMonth = withData.filter((r) => r.Month === month);
  const [picked, setPicked] = useState(null); // null = all of the month
  const chosen = inMonth.filter((r) => !picked || picked.includes(r["Report ID"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const list = [];
      for (const r of chosen) {
        const d = await getVibReport(webhookUrl, r["Report ID"]);
        list.push({ report: d.report, entries: d.entries || [] });
      }
      let acts = { actions: [], findings: [] };
      try {
        acts = await getVibActions(webhookUrl);
      } catch {
        /* no access to actions */
      }
      await generateVibReportPdf({ reports: list, actions: acts.actions, findings: acts.findings });
      onClose();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id) => {
    const cur = picked || inMonth.map((r) => r["Report ID"]);
    setPicked(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  return (
    <ModalShell
      icon="file-download"
      title="Month PDF"
      subtitle="One PDF with the chosen reports of a month: machines, findings and actions, every reading."
      onClose={onClose}
      width={560}
      testid="vlog-pdf-modal"
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={make} disabled={busy || !chosen.length} data-testid="vlog-pdf-make">
            {busy ? "Making PDF…" : `Make PDF (${chosen.length})`}
          </button>
        </>
      }
    >
      <FormSection icon="calendar" title="Month and reports">
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ ...s.label, fontSize: 12 }}>Month</span>
          <select
            style={{ ...s.select, width: "100%" }}
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPicked(null);
            }}
            data-testid="vlog-pdf-month"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {inMonth.map((r) => (
          <label key={r["Report ID"]} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13, color: T.textPrimary }}>
            <input type="checkbox" checked={!picked || picked.includes(r["Report ID"])} onChange={() => toggle(r["Report ID"])} />
            {r.Contractor} · {r["Report scope"]}
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>
              {r["Workflow status"]} · {r.Entries || 0} readings
            </span>
          </label>
        ))}
      </FormSection>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13 }}>
          {error}
        </div>
      )}
    </ModalShell>
  );
}

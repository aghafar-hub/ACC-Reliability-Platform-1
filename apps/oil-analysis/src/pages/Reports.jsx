import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { sampleTrackerStatus } from "../parsers";
import NewReport from "./NewReport";
import {
  generateContractorActionReport,
  generateOilChangeContractorReport,
  generateSampleOverdueReport,
  generateMonthlyActivitySummary,
  exportMonthlyActivityCsv,
  monthlyActivityPreview,
} from "../reportGenerators";

const FOCUS_STATUSES = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];
const ALL = "All";

// One stacked bar (parts of a whole) with its legend underneath, so a
// report card shows what the PDF will be about before you download it.
function SplitBar({ T, parts, total, testid }) {
  const sum = total ?? parts.reduce((n, p) => n + p.value, 0);
  return (
    <div data-testid={testid}>
      <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 6, overflow: "hidden", background: `${T.textMuted || T.textSecondary}33` }}>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / Math.max(1, sum)) * 100}%`, background: p.color }} /> : null
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
        {parts.map((p) => (
          <span key={p.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.textSecondary }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color }} />
            <b style={{ color: T.textPrimary, fontSize: 15 }}>{p.value}</b> {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReportCard({ T, s, icon, iconColor, title, description, contents, children, busy, onGenerate, extraControls, secondaryLabel, onSecondaryAction, testid }) {
  const c = T[iconColor] || T.accent;
  return (
    <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0, borderTop: `3px solid ${c}` }} data-testid={testid}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: c + "1F", color: c, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{title}</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary }}>{description}</div>
        </div>
      </div>
      {extraControls}
      <div style={{ background: T.appBg, borderRadius: 10, padding: "12px 14px" }}>{children}</div>
      {contents && (
        <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>
          <i className="ti ti-file-text" aria-hidden="true" /> In the PDF: {contents}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
        <button style={s.btnPrimary} onClick={onGenerate} disabled={busy}>
          <i className={`ti ${busy ? "ti-loader" : "ti-download"}`} aria-hidden="true" /> {busy ? "Generating…" : "Download PDF"}
        </button>
        {onSecondaryAction && (
          <button style={s.btn} onClick={onSecondaryAction} disabled={busy}>
            <i className="ti ti-table-export" aria-hidden="true" /> {secondaryLabel || "Export"}
          </button>
        )}
      </div>
    </div>
  );
}

// "New Report" — the build-your-own report, as a wide banner above the
// ready-made ones.
function NewReportCard({ T, s, onClick }) {
  const steps = [
    { icon: "ti-list-check", text: "Pick topics — condition / time based oil, inventory, forecast" },
    { icon: "ti-building-factory-2", text: "Choose a contractor or both" },
    { icon: "ti-file-download", text: "One PDF with charts, or a data-only Excel workbook" },
  ];
  return (
    <div
      style={{ ...s.card, marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", background: `linear-gradient(120deg, ${T.accent}14, ${T.cardBg} 60%)`, border: `1px solid ${T.accent}44` }}
      data-testid="report-new"
    >
      <div style={{ width: 48, height: 48, borderRadius: 13, background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
      </div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>New Report</div>
        <div style={{ fontSize: 12.5, color: T.textSecondary }}>Combine any topics into one PDF or Excel workbook</div>
      </div>
      <ol style={{ display: "flex", gap: 14, flexWrap: "wrap", listStyle: "none", padding: 0, margin: 0, flex: "2 1 420px" }}>
        {steps.map((st, i) => (
          <li key={st.text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.textSecondary, flex: "1 1 180px" }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${T.accent}`, color: T.accent, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            {st.text}
          </li>
        ))}
      </ol>
      <button style={s.btnPrimary} onClick={onClick}>
        <i className="ti ti-arrow-right" aria-hidden="true" /> Build Report
      </button>
    </div>
  );
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Oil Reports (renamed from "Reports" per the user's own request, since
// this is scoped to Oil Lubrication only). Two ways to get a report:
// the "+ New Report" checklist below (NewReport.jsx — Condition Based
// Oil / Time Based Oil / Inventory Status / Forecast, pick any
// combination, one PDF or Excel out) for anything cross-cutting, and
// these four standalone cards for the single-topic reports this page
// always had — confirmed directly by the user ("keep your design for
// separated reports, only delete [Combined]"): the old Combined Report
// card is gone (selecting all four of its own sections in New Report
// does the same job now), everything else stayed.
export default function Reports({ webhookUrl, actions, oilChanges, oilChangeEvents, samples, equipmentRegistry, trackerByEquip }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("landing"); // "landing" | "new"
  const [generating, setGenerating] = useState(null); // "action" | "oilchange" | "sample" | "monthly" | null
  // One contractor choice for every ready-made report on the page.
  const [contractor, setContractor] = useState(ALL);
  const actionContractor = contractor;
  const oilChangeContractor = contractor;
  const sampleContractor = contractor;
  const monthlyContractor = contractor;
  const [month, setMonth] = useState(() => currentMonth());

  const registryByCode = useMemo(() => {
    const map = {};
    (equipmentRegistry || []).forEach((r) => (map[r.code] = r));
    return map;
  }, [equipmentRegistry]);

  const contractorList = useMemo(
    () => [ALL, ...Array.from(new Set((equipmentRegistry || []).map((r) => r.contractor).filter(Boolean))).sort()],
    [equipmentRegistry]
  );

  function actionCounts(contractor) {
    let active = (actions || []).filter((a) => FOCUS_STATUSES.includes(a.status));
    const contractorOf = (a) => a.contractor || registryByCode[a.equipmentCode]?.contractor || "Unassigned";
    if (contractor !== ALL) active = active.filter((a) => contractorOf(a) === contractor);
    return {
      open: active.filter((a) => a.status === "Open").length,
      draft: active.filter((a) => a.status === "Draft").length,
      waiting: active.filter((a) => a.status === "Waiting Stoppage").length,
      closure: active.filter((a) => a.status === "Closure Requested").length,
    };
  }
  function oilChangeCounts(contractor) {
    const codes =
      contractor === ALL ? null : new Set((equipmentRegistry || []).filter((r) => r.contractor === contractor).map((r) => r.code));
    const points = codes ? (oilChanges || []).filter((o) => codes.has(o.equipmentCode)) : oilChanges || [];
    return { overdue: points.filter((o) => o.status === "Overdue").length, totalPoints: points.length };
  }
  function sampleCounts(contractor) {
    const registry = contractor === ALL ? equipmentRegistry || [] : (equipmentRegistry || []).filter((r) => r.contractor === contractor);
    let missing = 0;
    let overdue = 0;
    registry.forEach((eq) => {
      const history = (trackerByEquip || {})[eq.code] || [];
      const status = sampleTrackerStatus(history[0]?.date || "", eq.interval);
      if (status.label === "MISSING") missing++;
      else if (status.label === "OVERDUE") overdue++;
    });
    return { missing, overdue, total: registry.length };
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actionPreview = useMemo(() => actionCounts(actionContractor), [actions, registryByCode, actionContractor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const oilChangePreview = useMemo(() => oilChangeCounts(oilChangeContractor), [oilChanges, equipmentRegistry, oilChangeContractor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const samplePreview = useMemo(() => sampleCounts(sampleContractor), [trackerByEquip, equipmentRegistry, sampleContractor]);
  const monthlyPreview = useMemo(
    () => monthlyActivityPreview({ samples, oilChangeEvents, actions, equipmentRegistry, contractor: monthlyContractor, month }),
    [samples, oilChangeEvents, actions, equipmentRegistry, monthlyContractor, month]
  );

  async function handleGenerate(kind) {
    setGenerating(kind);
    try {
      if (kind === "action") await generateContractorActionReport({ actions, equipmentRegistry, contractor: actionContractor });
      else if (kind === "oilchange")
        await generateOilChangeContractorReport({ oilChanges, equipmentRegistry, actions, contractor: oilChangeContractor });
      else if (kind === "sample") await generateSampleOverdueReport({ trackerByEquip, equipmentRegistry, contractor: sampleContractor });
      else if (kind === "monthly")
        await generateMonthlyActivitySummary({ samples, oilChangeEvents, actions, equipmentRegistry, contractor: monthlyContractor, month });
    } finally {
      setGenerating(null);
    }
  }
  function handleExportMonthlyCsv() {
    exportMonthlyActivityCsv({ samples, oilChangeEvents, actions, equipmentRegistry, contractor: monthlyContractor, month });
  }

  if (view === "new") {
    return (
      <NewReport
        webhookUrl={webhookUrl}
        actions={actions}
        oilChanges={oilChanges}
        samples={samples}
        equipmentRegistry={equipmentRegistry}
        trackerByEquip={trackerByEquip}
        onCancel={() => setView("landing")}
      />
    );
  }

  const sampleOk = Math.max(0, samplePreview.total - samplePreview.missing - samplePreview.overdue);
  const ocOk = Math.max(0, oilChangePreview.totalPoints - oilChangePreview.overdue);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 360px" }}>
          <p style={{ ...s.sectionTitle, margin: 0 }}>Oil Reports</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "4px 0 0" }}>
            Clean, printable PDFs straight from the current data — nothing is saved or sent anywhere.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Contractor" data-testid="reports-contractor">
          <span style={{ fontSize: 12.5, color: T.textSecondary, fontWeight: 600 }}>Reports for</span>
          {contractorList.map((c) => {
            const on = contractor === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => setContractor(c)}
                style={{ ...s.btn, padding: "6px 14px", fontSize: 12.5, borderRadius: 999, borderColor: on ? T.accent : T.border, background: on ? T.accent : T.cardBg, color: on ? "#fff" : T.textSecondary, fontWeight: on ? 700 : 500 }}
              >
                {c === ALL ? "All contractors" : c}
              </button>
            );
          })}
        </div>
      </div>

      <NewReportCard T={T} s={s} onClick={() => setView("new")} />

      <p style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, margin: "0 0 10px" }}>Ready-made reports</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
        <ReportCard
          T={T} s={s} icon="ti-clipboard-list" iconColor="danger" title="Contractor Action Status"
          description="Every action not yet closed, by stage"
          contents="actions grouped by stage, with age and owner"
          busy={generating === "action"}
          onGenerate={() => handleGenerate("action")}
          testid="report-card-action"
        >
          <SplitBar
            T={T}
            testid="report-action-bar"
            parts={[
              { label: "Draft", value: actionPreview.draft, color: T.warning },
              { label: "Open", value: actionPreview.open, color: T.danger },
              { label: "Waiting stoppage", value: actionPreview.waiting, color: T.accent },
              { label: "Closure requested", value: actionPreview.closure, color: T.info },
            ]}
          />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-droplet" iconColor="warning" title="Oil Change Contractor Performance"
          description="On-time % and closure rate, plus overdue equipment"
          contents="on-time share per contractor and the list of overdue points"
          busy={generating === "oilchange"}
          onGenerate={() => handleGenerate("oilchange")}
          testid="report-card-oilchange"
        >
          <SplitBar
            T={T}
            testid="report-oilchange-bar"
            parts={[
              { label: "Overdue points", value: oilChangePreview.overdue, color: T.danger },
              { label: "On schedule", value: ocOk, color: T.success },
            ]}
          />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-flask" iconColor="accent" title="Oil Sample Missing / Overdue"
          description="Equipment overdue or missing against its sampling interval"
          contents="each missing or overdue point with its interval and last sample"
          busy={generating === "sample"}
          onGenerate={() => handleGenerate("sample")}
          testid="report-card-sample"
        >
          <SplitBar
            T={T}
            testid="report-sample-bar"
            parts={[
              { label: "Missing", value: samplePreview.missing, color: T.danger },
              { label: "Overdue", value: samplePreview.overdue, color: T.warning },
              { label: "Up to date", value: sampleOk, color: T.success },
            ]}
          />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-calendar-stats" iconColor="success" title="Monthly Activity Summary"
          description="What actually got done in a month — not a snapshot of today"
          contents="samples taken, oil changes done and actions closed, item by item"
          extraControls={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary }} htmlFor="report-month">
                Month
              </label>
              <input id="report-month" type="month" style={{ ...s.input, maxWidth: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          }
          busy={generating === "monthly"}
          onGenerate={() => handleGenerate("monthly")}
          secondaryLabel="Export CSV"
          onSecondaryAction={handleExportMonthlyCsv}
          testid="report-card-monthly"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { icon: "ti-flask", label: "Samples taken", value: monthlyPreview.samplesTaken, color: T.accent },
              { icon: "ti-droplet", label: "Oil changes done", value: monthlyPreview.oilChangesDone, color: T.warning },
              { icon: "ti-circle-check", label: "Actions closed", value: monthlyPreview.actionsClosed, color: T.success },
            ].map((k) => (
              <div key={k.label} style={{ textAlign: "center" }}>
                <i className={`ti ${k.icon}`} aria-hidden="true" style={{ color: k.color, fontSize: 18 }} />
                <div style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary }}>{k.value}</div>
                <div style={{ fontSize: 12, color: T.textSecondary }}>{k.label}</div>
              </div>
            ))}
          </div>
        </ReportCard>
      </div>
    </div>
  );
}

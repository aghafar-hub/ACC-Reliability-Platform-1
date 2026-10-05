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

const FOCUS_STATUSES = ["Open", "In Progress", "Waiting Stoppage"];
const ALL = "All";

function ReportCard({
  T, s, icon, iconColor, title, description, contractor, onContractorChange, contractorList,
  stats, busy, onGenerate, extraControls, secondaryLabel, onSecondaryAction,
}) {
  return (
    <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 10, background: T[iconColor] + "22", color: T[iconColor],
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <i className={`ti ${icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{title}</div>
          <div style={{ fontSize: 11.5, color: T.textSecondary }}>{description}</div>
        </div>
      </div>

      <div>
        <label style={s.label}>Contractor</label>
        <select style={s.select} value={contractor} onChange={(e) => onContractorChange(e.target.value)}>
          {contractorList.map((c) => (
            <option key={c} value={c}>
              {c === ALL ? "All Contractors" : c}
            </option>
          ))}
        </select>
      </div>

      {extraControls}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length},1fr)`, gap: 8 }}>
        {stats.map((st) => (
          <div key={st.label} style={{ background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: st.color ? T[st.color] : T.textPrimary }}>{st.value}</div>
            <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{st.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
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
  const [actionContractor, setActionContractor] = useState(ALL);
  const [oilChangeContractor, setOilChangeContractor] = useState(ALL);
  const [sampleContractor, setSampleContractor] = useState(ALL);
  const [monthlyContractor, setMonthlyContractor] = useState(ALL);
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
      inProgress: active.filter((a) => a.status === "In Progress").length,
      waiting: active.filter((a) => a.status === "Waiting Stoppage").length,
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Oil Reports</p>
        <button style={s.btnPrimary} onClick={() => setView("new")}>
          <i className="ti ti-plus" aria-hidden="true" /> New Report
        </button>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 20px" }}>
        Generate a clean, printable PDF straight from current data — nothing is saved or sent anywhere. Choose one contractor or all of
        them before generating, or use "New Report" to combine any topics across Condition Based Oil, Time Based Oil, Inventory, and
        Forecast into one PDF or Excel workbook.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        <ReportCard
          T={T} s={s} icon="ti-clipboard-list" iconColor="danger" title="Contractor Action Status"
          description="Open · In Progress · Waiting Stoppage"
          contractor={actionContractor} onContractorChange={setActionContractor} contractorList={contractorList}
          stats={[
            { value: actionPreview.open, label: "Open", color: "danger" },
            { value: actionPreview.inProgress, label: "In Progress", color: "warning" },
            { value: actionPreview.waiting, label: "Waiting Stoppage", color: "accent" },
          ]}
          busy={generating === "action"}
          onGenerate={() => handleGenerate("action")}
        />

        <ReportCard
          T={T} s={s} icon="ti-droplet" iconColor="warning" title="Oil Change Contractor Performance"
          description="On-time % and closure rate, plus overdue equipment"
          contractor={oilChangeContractor} onContractorChange={setOilChangeContractor} contractorList={contractorList}
          stats={[
            { value: oilChangePreview.overdue, label: "Overdue Points", color: "danger" },
            { value: oilChangePreview.totalPoints, label: "Total Points" },
          ]}
          busy={generating === "oilchange"}
          onGenerate={() => handleGenerate("oilchange")}
        />

        <ReportCard
          T={T} s={s} icon="ti-flask" iconColor="accent" title="Oil Sample Missing / Overdue"
          description="Equipment overdue or missing against its sampling interval"
          contractor={sampleContractor} onContractorChange={setSampleContractor} contractorList={contractorList}
          stats={[
            { value: samplePreview.missing, label: "Missing", color: "danger" },
            { value: samplePreview.overdue, label: "Overdue", color: "warning" },
          ]}
          busy={generating === "sample"}
          onGenerate={() => handleGenerate("sample")}
        />

        <ReportCard
          T={T} s={s} icon="ti-calendar-stats" iconColor="success" title="Monthly Activity Summary"
          description="What actually got done this month — not a snapshot of today"
          contractor={monthlyContractor} onContractorChange={setMonthlyContractor} contractorList={contractorList}
          extraControls={
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Month</div>
              <input type="month" style={{ ...s.input, maxWidth: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          }
          stats={[
            { value: monthlyPreview.samplesTaken, label: "Samples Taken", color: "accent" },
            { value: monthlyPreview.oilChangesDone, label: "Oil Changes Done", color: "warning" },
            { value: monthlyPreview.actionsClosed, label: "Actions Closed", color: "success" },
          ]}
          busy={generating === "monthly"}
          onGenerate={() => handleGenerate("monthly")}
          secondaryLabel="Export CSV"
          onSecondaryAction={handleExportMonthlyCsv}
        />
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import NewReport from "./NewReport";
import {
  generateMonthlyActivitySummary,
  exportMonthlyActivityCsv,
  monthlyActivityPreview,
} from "../reportGenerators";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CONTRACTOR_OPTIONS = ["All", "RHI", "ASEC"];

// Oil Reports (user request: rename from "Reports", and rebuild around a
// single "+ New Report" selection screen instead of a grid of one-card-
// per-report — see NewReport.jsx for the actual checklist/generate flow,
// built from the user's own Condition Based Oil / Time Based Oil /
// Inventory Status / Forecast grouping). Monthly Activity Summary stays
// as its own standalone card: it's a THROUGHPUT report for one calendar
// month (what actually got done), a genuinely different kind of question
// than every current-state section in the new checklist answers — see
// reportGenerators.js's own comment on it. The other four cards this
// page used to have (Contractor Action Status, Oil Change Contractor
// Performance, Sample Missing/Overdue, Combined) are superseded by the
// new checklist's own sections, which cover the same ground plus the
// Condition/Time split, Inventory, and Forecast it didn't have.
export default function Reports({ webhookUrl, actions, oilChanges, oilChangeEvents, samples, equipmentRegistry, trackerByEquip }) {
  const { T, s } = useTheme();
  const [view, setView] = useState("landing"); // "landing" | "new"
  const [generating, setGenerating] = useState(false);
  const [monthlyContractor, setMonthlyContractor] = useState("All");
  const [month, setMonth] = useState(() => currentMonth());

  const monthlyPreview = useMemo(
    () => monthlyActivityPreview({ samples, oilChangeEvents, actions, equipmentRegistry, contractor: monthlyContractor, month }),
    [samples, oilChangeEvents, actions, equipmentRegistry, monthlyContractor, month]
  );

  async function handleGenerateMonthly() {
    setGenerating(true);
    try {
      await generateMonthlyActivitySummary({ samples, oilChangeEvents, actions, equipmentRegistry, contractor: monthlyContractor, month });
    } finally {
      setGenerating(false);
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
        Pick exactly what to include — Condition Based Oil, Time Based Oil, Inventory Status, Forecast — scope it to one contractor or
        both, and generate a PDF or an Excel workbook straight from current data.
      </p>

      <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 10, background: T.accent + "22", color: T.accent,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <i className="ti ti-calendar-stats" style={{ fontSize: 19 }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Monthly Activity Summary</div>
            <div style={{ fontSize: 11.5, color: T.textSecondary }}>What actually got done this month — not a snapshot of today</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Contractor</label>
            <select style={s.select} value={monthlyContractor} onChange={(e) => setMonthlyContractor(e.target.value)}>
              {CONTRACTOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === "All" ? "All Contractors" : c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label}>Month</label>
            <input type="month" style={{ ...s.input, maxWidth: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { value: monthlyPreview.samplesTaken, label: "Samples Taken", color: "accent" },
            { value: monthlyPreview.oilChangesDone, label: "Oil Changes Done", color: "warning" },
            { value: monthlyPreview.actionsClosed, label: "Actions Closed", color: "success" },
          ].map((st) => (
            <div key={st.label} style={{ background: T.cardSubBg, border: `1px solid ${T.border2}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: T[st.color] }}>{st.value}</div>
              <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{st.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.btnPrimary} onClick={handleGenerateMonthly} disabled={generating}>
            <i className={`ti ${generating ? "ti-loader" : "ti-download"}`} aria-hidden="true" /> {generating ? "Generating…" : "Download PDF"}
          </button>
          <button style={s.btn} onClick={handleExportMonthlyCsv} disabled={generating}>
            <i className="ti ti-table-export" aria-hidden="true" /> Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

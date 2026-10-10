import { useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { PERIODS, REPORT_GROUPS, REPORT_SECTIONS, periodLabel, periodMonths } from "../vibReportData";

// Vibration "New Report" — the same builder as Oil's NewReport.jsx: pick a
// contractor, the period and any sections (grouped by topic), then one PDF
// (a page per section, with charts) or one Excel workbook (a sheet per
// section). The sections and their rows live in vibReportData.js, so the
// two formats never drift apart. Opened from VibReports.jsx, which already
// holds the data.

const CONTRACTORS = ["All", "RHI", "ASEC"];
const gen = () => import("../vibReports");

export default function VibNewReport({ data, lockedContractor, today, loading, failed, onCancel }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [contractor, setContractor] = useState(lockedContractor || "All");
  const [period, setPeriod] = useState(6);
  const [sectionIds, setSectionIds] = useState([]);
  const [generating, setGenerating] = useState(null);
  const months = useMemo(() => periodMonths(today, period), [today, period]);

  const toggle = (id) => setSectionIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  function toggleGroup(g) {
    const ids = REPORT_SECTIONS.filter((x) => x.group === g).map((x) => x.id);
    const all = ids.every((id) => sectionIds.includes(id));
    setSectionIds((p) => (all ? p.filter((id) => !ids.includes(id)) : [...new Set([...p, ...ids])]));
  }

  async function make(format) {
    if (!sectionIds.length) return;
    setGenerating(format);
    try {
      const g = await gen();
      // keep the checklist's order, not the order things were ticked
      const ids = REPORT_SECTIONS.map((x) => x.id).filter((id) => sectionIds.includes(id));
      const args = { title: "Vibration Report", sectionIds: ids, data, ctx: { contractor, months, today }, fileName: "Vibration-Report" };
      if (format === "pdf") await g.generateVibReportsPdf(args);
      else await g.generateVibReportsExcel(args);
    } finally {
      setGenerating(null);
    }
  }

  const step = (n, title, hint) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: T.textPrimary }}>{title}</span>
      {hint && <span style={{ fontSize: 12, color: T.textSecondary }}>{hint}</span>}
    </div>
  );
  const chip = (on) => ({ ...s.btn, padding: "7px 16px", borderRadius: 999, borderColor: on ? T.accent : T.border, background: on ? T.accent : T.cardBg, color: on ? "#fff" : T.textSecondary, fontWeight: on ? 700 : 500 });
  const busy = !sectionIds.length || !!generating;
  const whoLabel = contractor === "All" ? "Both / all contractors" : contractor;

  return (
    <div data-testid="vib-new-report">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: 0 }}>New Report</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "2px 0 0" }}>
            One PDF (with charts) or one Excel workbook (data only, a sheet per section) — nothing is saved or sent anywhere.
          </p>
        </div>
        <button style={s.btn} onClick={onCancel} data-testid="vib-new-report-back">
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Vibration Reports
        </button>
      </div>

      {failed?.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: T.danger + "12", border: `1px solid ${T.danger}55`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", fontSize: 12.5 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger }} />
          Couldn't load: {failed.join(", ")}. Those sections will be empty; the rest are fine.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 340px", gap: 20, alignItems: "start", marginTop: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...s.card, marginBottom: 16, display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div>
              {step(1, "Contractor")}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Contractor" data-testid="vib-new-report-contractor">
                {(lockedContractor ? [lockedContractor] : CONTRACTORS).map((c) => (
                  <button key={c} type="button" aria-pressed={contractor === c} onClick={() => setContractor(c)} style={chip(contractor === c)}>
                    {c === "All" ? "Both / all contractors" : c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {step(2, "Period", periodLabel(months))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Period" data-testid="vib-new-report-period">
                {PERIODS.map((p) => (
                  <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} style={chip(period === p)}>
                    Last {p} months
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              {step(3, "Sections", sectionIds.length ? `${sectionIds.length} of ${REPORT_SECTIONS.length} picked` : "pick at least one")}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={{ ...s.btn, fontSize: 12.5, padding: "5px 10px" }} onClick={() => setSectionIds(REPORT_SECTIONS.map((x) => x.id))} data-testid="vib-new-report-all">
                  Select All
                </button>
                <button style={{ ...s.btn, fontSize: 12.5, padding: "5px 10px" }} onClick={() => setSectionIds([])} disabled={!sectionIds.length}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 12 }}>
              {REPORT_GROUPS.map((group) => {
                const secs = REPORT_SECTIONS.filter((x) => x.group === group.id);
                const n = secs.filter((x) => sectionIds.includes(x.id)).length;
                const c = T[group.iconColor] || T.accent;
                return (
                  <div key={group.id} style={{ border: `1.5px solid ${n ? c : T.border}`, borderRadius: 12, overflow: "hidden" }} data-testid={`vib-report-group-${group.id}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: n ? c + "12" : T.cardSubBg }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: c + "22", color: c, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <i className={`ti ${group.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.textPrimary }}>{group.label}</span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>{n} of {secs.length} selected</span>
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>
                        <input type="checkbox" checked={n === secs.length} onChange={() => toggleGroup(group.id)} />
                        All
                      </label>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", padding: 6 }}>
                      {secs.map((sec) => {
                        const on = sectionIds.includes(sec.id);
                        return (
                          <label key={sec.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textPrimary, cursor: "pointer", padding: "7px 8px", borderRadius: 8, background: on ? c + "14" : "transparent", fontWeight: on ? 600 : 400 }}>
                            <input type="checkbox" checked={on} onChange={() => toggle(sec.id)} data-testid={`vib-section-${sec.id}`} />
                            {sec.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ ...s.card, marginBottom: 0, position: isMobile ? "static" : "sticky", top: 12 }} data-testid="vib-new-report-summary">
          {step(4, "Your report")}
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 6 }}>Contractor</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>{whoLabel}</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 6 }}>Period</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>{periodLabel(months)}</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 6 }}>Sections ({sectionIds.length})</div>
          {sectionIds.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.textMuted, margin: "0 0 14px" }}>Nothing picked yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 300, overflowY: "auto" }}>
              {REPORT_GROUPS.map((g) => {
                const picked = REPORT_SECTIONS.filter((x) => x.group === g.id && sectionIds.includes(x.id));
                if (!picked.length) return null;
                return (
                  <div key={g.id}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T[g.iconColor] || T.accent }}>{g.label}</div>
                    {picked.map((sec) => (
                      <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.textPrimary, padding: "2px 0" }}>
                        <i className="ti ti-check" aria-hidden="true" style={{ color: T.success }} />
                        <span style={{ flex: 1 }}>{sec.label}</span>
                        <button type="button" aria-label={`Remove ${sec.label}`} onClick={() => toggle(sec.id)} style={{ border: 0, background: "none", color: T.textMuted, cursor: "pointer", fontSize: 14 }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button style={{ ...s.btnPrimary, padding: "10px 12px", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => make("pdf")} data-testid="vib-new-report-pdf">
              <i className={`ti ${generating === "pdf" ? "ti-loader" : "ti-file-type-pdf"}`} aria-hidden="true" /> {generating === "pdf" ? "Generating…" : "Generate PDF"}
            </button>
            <button style={{ ...s.btn, padding: "10px 12px" }} disabled={busy} onClick={() => make("excel")} data-testid="vib-new-report-excel">
              <i className={`ti ${generating === "excel" ? "ti-loader" : "ti-file-spreadsheet"}`} aria-hidden="true" /> {generating === "excel" ? "Generating…" : "Generate Excel"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: T.textMuted, margin: "10px 0 0" }}>
            {loading ? "Updating the data…" : "PDF: charts and tables, A4, a page per section. Excel: one sheet per section."}
          </p>
        </div>
      </div>
    </div>
  );
}

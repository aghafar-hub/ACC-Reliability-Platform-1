import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import useIsMobile from "../hooks/useIsMobile";
import { REPORT_GROUPS, REPORT_SECTIONS, generateOilReportPdf, generateOilReportExcel } from "../reportGenerators";

// Mirrors Routines.jsx's own "Create Route" -> NewRoutine.jsx pattern
// (internal `view` state swap in the parent, not a new App.jsx `page`) —
// Oil Reports' own "+ New Report" button opens this the same way. One
// checklist (REPORT_SECTIONS, grouped by REPORT_GROUPS) drives BOTH output
// formats so a section never drifts between what the PDF and the Excel
// workbook show — see reportGenerators.js's own comment on why.
//
// Routines Overview / Oil Inventory / Top Ups aren't in App.jsx's already-
// loaded state (Routines.jsx and OilInventory.jsx each fetch their own via
// webhookUrl — see those files) — this page does the same on mount rather
// than waiting on a prop that doesn't exist yet.
const CONTRACTOR_OPTIONS = ["All", "RHI", "ASEC"];

export default function NewReport({ webhookUrl, actions, oilChanges, samples, equipmentRegistry, trackerByEquip, onCancel }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [contractor, setContractor] = useState("All");
  const [sectionIds, setSectionIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [routinesOverview, setRoutinesOverview] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [inventoryForecast, setInventoryForecast] = useState(null);
  const [topUps, setTopUps] = useState([]);
  const [generating, setGenerating] = useState(null); // "pdf" | "excel" | null

  useEffect(() => {
    let cancelled = false;
    if (!webhookUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    Promise.all([
      api.getRoutinesOverview(webhookUrl),
      api.getOilInventory(webhookUrl),
      api.getOilInventoryForecast(webhookUrl, 1),
      api.getAllTopUps(webhookUrl),
    ])
      .then(([routines, products, forecast, topUpEvents]) => {
        if (cancelled) return;
        setRoutinesOverview(routines || []);
        setInventoryProducts(products || []);
        setInventoryForecast(forecast || null);
        setTopUps(topUpEvents || []);
      })
      .catch((err) => !cancelled && setLoadError(String(err.message || err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [webhookUrl]);

  const data = useMemo(
    () => ({ actions, oilChanges, samples, equipmentRegistry, trackerByEquip, routinesOverview, inventoryProducts, inventoryForecast, topUps }),
    [actions, oilChanges, samples, equipmentRegistry, trackerByEquip, routinesOverview, inventoryProducts, inventoryForecast, topUps]
  );

  function toggleSection(id) {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleGroup(groupId) {
    const ids = REPORT_SECTIONS.filter((sec) => sec.group === groupId).map((sec) => sec.id);
    const allChecked = ids.every((id) => sectionIds.includes(id));
    setSectionIds((prev) => (allChecked ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  }
  function selectAll() {
    setSectionIds(REPORT_SECTIONS.map((sec) => sec.id));
  }
  function clearAll() {
    setSectionIds([]);
  }

  async function handleGenerate(format) {
    if (sectionIds.length === 0) return;
    setGenerating(format);
    try {
      if (format === "pdf") await generateOilReportPdf({ sectionIds, contractor, data });
      else await generateOilReportExcel({ sectionIds, contractor, data });
    } finally {
      setGenerating(null);
    }
  }

  const step = (n, title, hint) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: T.textPrimary }}>{title}</span>
      {hint && <span style={{ fontSize: 12, color: T.textSecondary }}>{hint}</span>}
    </div>
  );
  const busy = sectionIds.length === 0 || loading || !!generating;

  return (
    <div data-testid="new-report">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: 0 }}>New Report</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "2px 0 0" }}>
            One PDF (with charts) or one Excel workbook (data only, a sheet per section) — nothing is saved or sent anywhere.
          </p>
        </div>
        <button style={s.btn} onClick={onCancel}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Oil Reports
        </button>
      </div>

      {loadError && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: T.danger + "12", border: `1px solid ${T.danger}55`, borderRadius: 10, padding: "10px 14px", margin: "12px 0", fontSize: 12.5 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger }} />
          Some sections (Routines, Inventory, Top Ups) couldn't load: {loadError}. You can still generate with what did load.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 340px", gap: 20, alignItems: "start", marginTop: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...s.card, marginBottom: 16 }}>
            {step(1, "Contractor")}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Contractor">
              {CONTRACTOR_OPTIONS.map((c) => {
                const on = contractor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setContractor(c)}
                    style={{ ...s.btn, padding: "7px 16px", borderRadius: 999, borderColor: on ? T.accent : T.border, background: on ? T.accent : T.cardBg, color: on ? "#fff" : T.textSecondary, fontWeight: on ? 700 : 500 }}
                  >
                    {c === "All" ? "Both / all contractors" : c}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              {step(2, "Sections", sectionIds.length ? `${sectionIds.length} of ${REPORT_SECTIONS.length} picked` : "pick at least one")}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={{ ...s.btn, fontSize: 12.5, padding: "5px 10px" }} onClick={selectAll}>
                  Select All
                </button>
                <button style={{ ...s.btn, fontSize: 12.5, padding: "5px 10px" }} onClick={clearAll} disabled={!sectionIds.length}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 12 }}>
              {REPORT_GROUPS.map((group) => {
                const sections = REPORT_SECTIONS.filter((sec) => sec.group === group.id);
                const checkedCount = sections.filter((sec) => sectionIds.includes(sec.id)).length;
                const allChecked = checkedCount === sections.length;
                const c = T[group.iconColor] || T.accent;
                return (
                  <div key={group.id} style={{ border: `1.5px solid ${checkedCount ? c : T.border}`, borderRadius: 12, overflow: "hidden" }} data-testid={`report-group-${group.id}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: checkedCount ? c + "12" : T.cardSubBg }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: c + "22", color: c, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <i className={`ti ${group.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.textPrimary }}>{group.label}</span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>
                          {checkedCount} of {sections.length} selected
                        </span>
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>
                        <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(group.id)} />
                        All
                      </label>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", padding: 6 }}>
                      {sections.map((sec) => {
                        const on = sectionIds.includes(sec.id);
                        return (
                          <label
                            key={sec.id}
                            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.textPrimary, cursor: "pointer", padding: "7px 8px", borderRadius: 8, background: on ? c + "14" : "transparent", fontWeight: on ? 600 : 400 }}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggleSection(sec.id)} />
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

        <div style={{ ...s.card, marginBottom: 0, position: isMobile ? "static" : "sticky", top: 12 }} data-testid="new-report-summary">
          {step(3, "Your report")}
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 6 }}>Contractor</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>{contractor === "All" ? "Both / all contractors" : contractor}</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 6 }}>Sections ({sectionIds.length})</div>
          {sectionIds.length === 0 ? (
            <p style={{ fontSize: 12.5, color: T.textMuted, margin: "0 0 14px" }}>Nothing picked yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 300, overflowY: "auto" }}>
              {REPORT_GROUPS.map((g) => {
                const picked = REPORT_SECTIONS.filter((sec) => sec.group === g.id && sectionIds.includes(sec.id));
                if (!picked.length) return null;
                return (
                  <div key={g.id}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T[g.iconColor] || T.accent }}>{g.label}</div>
                    {picked.map((sec) => (
                      <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.textPrimary, padding: "2px 0" }}>
                        <i className="ti ti-check" aria-hidden="true" style={{ color: T.success }} />
                        <span style={{ flex: 1 }}>{sec.label}</span>
                        <button type="button" aria-label={`Remove ${sec.label}`} onClick={() => toggleSection(sec.id)} style={{ border: 0, background: "none", color: T.textMuted, cursor: "pointer", fontSize: 14 }}>
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
            <button style={{ ...s.btnPrimary, padding: "10px 12px", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleGenerate("pdf")}>
              <i className={`ti ${generating === "pdf" ? "ti-loader" : "ti-file-type-pdf"}`} aria-hidden="true" /> {generating === "pdf" ? "Generating…" : "Generate PDF"}
            </button>
            <button style={{ ...s.btn, padding: "10px 12px" }} disabled={busy} onClick={() => handleGenerate("excel")}>
              <i className={`ti ${generating === "excel" ? "ti-loader" : "ti-file-spreadsheet"}`} aria-hidden="true" /> {generating === "excel" ? "Generating…" : "Generate Excel"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: T.textMuted, margin: "10px 0 0" }}>
            {loading ? "Loading Routines / Inventory / Top Up data…" : "PDF: charts and tables, A4. Excel: one sheet per section."}
          </p>
        </div>
      </div>
    </div>
  );
}

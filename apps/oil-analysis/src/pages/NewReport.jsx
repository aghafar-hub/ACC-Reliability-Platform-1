import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
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

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>New Report</p>
        <button style={s.btn} onClick={onCancel}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Oil Reports
        </button>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: "0 0 20px" }}>
        Pick what to include, pick a contractor (or both), then generate one PDF (with charts) or one Excel workbook (data only, one sheet
        per section) — nothing is saved or sent anywhere.
      </p>

      <div style={{ ...s.card, marginBottom: 20 }}>
        <label style={s.label}>Contractor</label>
        <select style={{ ...s.select, maxWidth: 220 }} value={contractor} onChange={(e) => setContractor(e.target.value)}>
          {CONTRACTOR_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "Both / All Contractors" : c}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <div style={{ ...s.card, borderColor: T.danger, marginBottom: 16 }}>
          <p style={{ margin: 0, color: T.danger, fontSize: 12.5 }}>
            Some sections (Routines, Inventory, Top Ups) couldn't load: {loadError}. You can still generate with what did load.
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>Sections {sectionIds.length > 0 ? `(${sectionIds.length} selected)` : ""}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...s.btn, fontSize: 11.5, padding: "5px 10px" }} onClick={selectAll}>
            Select All
          </button>
          <button style={{ ...s.btn, fontSize: 11.5, padding: "5px 10px" }} onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        {REPORT_GROUPS.map((group) => {
          const sections = REPORT_SECTIONS.filter((sec) => sec.group === group.id);
          const checkedCount = sections.filter((sec) => sectionIds.includes(sec.id)).length;
          const allChecked = checkedCount === sections.length;
          return (
            <div key={group.id} style={{ ...s.card, display: "flex", flexDirection: "column", gap: 12, marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: 10, background: T[group.iconColor] + "22", color: T[group.iconColor],
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    <i className={`ti ${group.icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{group.label}</div>
                    <div style={{ fontSize: 11, color: T.textSecondary }}>
                      {checkedCount} of {sections.length} selected
                    </div>
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.textSecondary, cursor: "pointer" }}>
                  <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(group.id)} />
                  All
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sections.map((sec) => (
                  <label
                    key={sec.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      color: T.textPrimary,
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: sectionIds.includes(sec.id) ? T.navActive : "transparent",
                    }}
                  >
                    <input type="checkbox" checked={sectionIds.includes(sec.id)} onChange={() => toggleSection(sec.id)} />
                    {sec.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button style={s.btnPrimary} disabled={sectionIds.length === 0 || loading || generating} onClick={() => handleGenerate("pdf")}>
          <i className={`ti ${generating === "pdf" ? "ti-loader" : "ti-file-type-pdf"}`} aria-hidden="true" />{" "}
          {generating === "pdf" ? "Generating…" : "Generate PDF"}
        </button>
        <button style={s.btn} disabled={sectionIds.length === 0 || loading || generating} onClick={() => handleGenerate("excel")}>
          <i className={`ti ${generating === "excel" ? "ti-loader" : "ti-file-spreadsheet"}`} aria-hidden="true" />{" "}
          {generating === "excel" ? "Generating…" : "Generate Excel"}
        </button>
        {loading && <span style={{ fontSize: 11.5, color: T.textMuted, alignSelf: "center" }}>Loading Routines/Inventory/Top Up data…</span>}
      </div>
    </div>
  );
}

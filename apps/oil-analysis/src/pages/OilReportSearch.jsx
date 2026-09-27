import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { formatDate, sampleTriggerReadings, sampleTrackerStatus } from "../parsers";
import { trackerStatusChip } from "../theme";
import LastActionsPanel from "../components/LastActionsPanel";
import LineChart from "../components/LineChart";

const WEAR_METALS = ["Ag", "Al", "Cr", "Cu", "Fe", "Mo", "Ni", "Pb", "Sn"];
const WEAR_NAMES = {
  Ag: "Silver",
  Al: "Aluminum",
  Cr: "Chromium",
  Cu: "Copper",
  Fe: "Iron",
  Mo: "Molybdenum",
  Ni: "Nickel",
  Pb: "Lead",
  Sn: "Tin",
};
const CONTAMINANTS = ["K", "Na", "Si"];
const CONTAMINANT_NAMES = { K: "Potassium", Na: "Sodium", Si: "Silicon" };
const ADDITIVES = ["B", "Ba", "Ca", "Mg", "P", "Zn"];
const ADDITIVE_NAMES = { B: "Boron", Ba: "Barium", Ca: "Calcium", Mg: "Magnesium", P: "Phosphorus", Zn: "Zinc" };

function statusColor(T, status) {
  const t = (status || "").toUpperCase();
  return t === "ALERT" ? T.danger : t === "CAUTION" ? T.warning : t === "NORMAL" ? T.success : t === "WARNING" ? T.warning : "#444";
}

function StatusCell({ T, val }) {
  if (!val)
    return <td style={{ padding: "6px 8px", border: "1px solid #1E2A3A", fontSize: 11, color: T.textMuted, textAlign: "center" }}>—</td>;
  return (
    <td style={{ padding: "6px 8px", border: "1px solid #1E2A3A", textAlign: "center" }}>
      <span
        style={{
          background: statusColor(T, val),
          color: "#fff",
          borderRadius: 4,
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {val}
      </span>
    </td>
  );
}
function NumCell({ T, val, highlight }) {
  return (
    <td
      style={{
        padding: "6px 8px",
        border: "1px solid #1E2A3A",
        textAlign: "center",
        fontSize: 12,
        fontFamily: "monospace",
        fontWeight: highlight ? 700 : 400,
        color: highlight ? T.danger : T.textHighlight,
        background: highlight ? "rgba(230,57,70,0.12)" : "transparent",
      }}
    >
      {val ?? "—"}
    </td>
  );
}

// The `oilreport` sidebar destination — reached from the sidebar's "Oil
// Analysis Report" link (not the same as the contextual per-sample "report"
// page opened from Dashboard/Equipment). Shows every sample for one
// equipment as columns (newest on the right) plus trend charts, matching
// the original app's `qh` component field-for-field.
export default function OilReportSearch({
  samples,
  oilChanges,
  actions,
  equipmentRegistry,
  actionRegistry,
  trackerByEquip,
  onAddAction,
  onUpdateAction,
  initialCode,
}) {
  const { T, s } = useTheme();
  const registry = equipmentRegistry || [];
  const [equipCode, setEquipCode] = useState(initialCode || "All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const allCodes = Array.from(new Set((samples || []).map((d) => d.unitId))).sort();
  const filteredCodes = allCodes.filter((code) => {
    const reg = registry.find((r) => r.code === code);
    const desc = reg ? reg.description : "";
    const q = query.toLowerCase();
    return code.toLowerCase().includes(q) || (desc || "").toLowerCase().includes(q);
  });

  function selectCode(code) {
    setEquipCode(code);
    setQuery("");
    setOpen(false);
  }

  const history = (equipCode === "All" ? [] : (samples || []).filter((d) => d.unitId === equipCode)).sort(
    (a, b) => new Date(a.sampledDate) - new Date(b.sampledDate)
  );
  const latest = history[history.length - 1];
  const labels = history.map((d) => d.sampledDate);
  const reg = equipCode !== "All" ? registry.find((r) => r.code === equipCode) : null;
  const lastChange = (oilChanges || [])
    .filter((o) => o.equipmentCode === equipCode && o.changeDate)
    .sort((a, b) => new Date(b.changeDate) - new Date(a.changeDate))[0];

  // Condensed, single-equipment slice of the same "Oil Sample Tracker"
  // monthly grid the dedicated Sample Tracker page shows for everyone —
  // the tracker sheet's history with live samples overlaid on top (see
  // overlaySamplesOnTracker in parsers.js), so it stays current even for a
  // sample entered straight into the sheet, while a month with no sample
  // at all still shows as a gap (which the Sample Timeline above, built
  // purely from Data_Entry, can't).
  const trackerHistory = equipCode !== "All" ? (trackerByEquip || {})[equipCode] || [] : [];
  const trackerOilChangedMonths = new Set(
    (oilChanges || [])
      .filter((o) => o.equipmentCode === equipCode && o.changeDate)
      .map((o) => {
        const d = new Date(o.changeDate);
        return isNaN(d) ? null : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      })
      .filter(Boolean)
  );
  const trackerStatus = equipCode !== "All" ? sampleTrackerStatus(trackerHistory[0]?.date || "", reg?.interval) : null;

  return (
    <div>
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: T.textSecondary }}>Search or select equipment</p>
            <div style={{ position: "relative" }}>
              <i
                className="ti ti-search"
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: T.textMuted,
                  fontSize: 14,
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              />
              <input
                style={{ ...s.input, paddingLeft: 32, fontSize: 13, minWidth: 320 }}
                value={equipCode !== "All" && !open ? `${equipCode}${reg ? " — " + reg.description : ""}` : query}
                placeholder="Type code or description…"
                onFocus={() => {
                  setOpen(true);
                  setQuery("");
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
              />
              {equipCode !== "All" && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectCode("All");
                  }}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: T.textMuted,
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {open && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 99,
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: T.cardBg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 260,
                  overflowY: "auto",
                  boxShadow: `0 4px 20px ${T.appBg}88`,
                }}
              >
                {filteredCodes.length === 0 && (
                  <div style={{ padding: "12px 14px", color: T.textMuted, fontSize: 12 }}>No equipment found</div>
                )}
                {filteredCodes.map((code) => {
                  const r = registry.find((x) => x.code === code);
                  const last = (samples || [])
                    .filter((d) => d.unitId === code)
                    .sort((a, b) => new Date(b.sampledDate || 0) - new Date(a.sampledDate || 0))[0];
                  const color = last?.reportStatus === "Alert" ? T.danger : last?.reportStatus === "Caution" ? T.warning : T.success;
                  return (
                    <div
                      key={code}
                      onMouseDown={() => selectCode(code)}
                      style={{
                        padding: "9px 14px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${T.border2}`,
                        background: equipCode === code ? T.navActive : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>{code}</div>
                        <div style={{ fontSize: 11, color: T.textSecondary }}>{r?.description || ""}</div>
                      </div>
                      {last && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color,
                            background: color + "18",
                            borderRadius: 4,
                            padding: "2px 7px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {last.reportStatus}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {latest && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.textSecondary }}>Latest:</span>
              <span
                style={{
                  background: statusColor(T, latest.reportStatus),
                  color: "#fff",
                  borderRadius: 4,
                  padding: "4px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {latest.reportStatus}
              </span>
              <span style={{ fontSize: 12, color: T.textSecondary }}>
                {history.length} sample{history.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {equipCode !== "All" && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: T.infoBarBg,
              borderRadius: 8,
              border: `1px solid ${lastChange ? T.success + "44" : T.border}`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-oil" style={{ color: lastChange ? T.success : T.textMuted, fontSize: 18 }} aria-hidden="true" />
              <div>
                <div style={{ fontSize: 10, color: T.textSecondary }}>Last Oil Change</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: lastChange ? T.success : T.danger }}>
                  {lastChange ? formatDate(lastChange.changeDate) : "No record"}
                </div>
              </div>
            </div>
            {lastChange && (
              <>
                <div>
                  <div style={{ fontSize: 10, color: T.textSecondary }}>Oil Type</div>
                  <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500 }}>{lastChange.oilType || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textSecondary }}>Brand</div>
                  <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500 }}>{lastChange.brand || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textSecondary }}>Next Due</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: lastChange.nextDueDate && new Date(lastChange.nextDueDate) < new Date() ? T.danger : T.textPrimary,
                    }}
                  >
                    {formatDate(lastChange.nextDueDate)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textSecondary }}>Performed By</div>
                  <div style={{ fontSize: 12, color: T.textPrimary }}>{lastChange.performedBy || "—"}</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {equipCode === "All" && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: T.textMuted }}>
          <i className="ti ti-file-analytics" style={{ fontSize: 64, display: "block", marginBottom: 16 }} aria-hidden="true" />
          <p style={{ fontSize: 16, margin: 0 }}>Select an equipment to view its full oil analysis report</p>
          <p style={{ fontSize: 13, marginTop: 8, color: T.textMuted }}>{allCodes.length} equipment with samples available</p>
        </div>
      )}
      {equipCode !== "All" && history.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.textMuted, fontSize: 14 }}>No samples found for this equipment.</div>
      )}

      {equipCode !== "All" && history.length > 0 && latest && (
        <div>
          <div style={{ background: T.cardBg, border: "1px solid #1E3A5F", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <div
              style={{
                background: statusColor(T, latest.reportStatus),
                padding: "8px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: 1 }}>{latest.reportStatus?.toUpperCase()}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>Asset ID: {latest.assetId || reg?.assetId || "—"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid #1E3A5F" }}>
              {[
                {
                  title: "Account Information",
                  rows: [
                    ["ID", "208948"],
                    ["Name", "Arabian Cement Company"],
                    ["Address", "Kattameya-Sokhna Road, Suez, EG"],
                  ],
                },
                {
                  title: "Sample Information",
                  rows: [
                    ["Sample ID", latest.sampleId],
                    ["Service Level", latest.serviceLevel || "Enhanced"],
                    ["Bottle ID", latest.bottleId || "—"],
                    ["Tested Lubricant", latest.lubricant],
                  ],
                },
                {
                  title: "Equipment Information",
                  rows: [
                    ["Asset Class", latest.assetClass || reg?.assetClass],
                    ["Manufacturer", latest.manufacturer || reg?.manufacturer],
                    ["Model", latest.model || reg?.model || "N/A"],
                    ["Lubricant", latest.lubricant],
                  ],
                },
              ].map((col) => (
                <div key={col.title} style={{ padding: "12px 16px", borderRight: "1px solid #1E3A5F" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 8, letterSpacing: 0.5 }}>{col.title}</div>
                  {col.rows.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: T.textSecondary, minWidth: 90 }}>{k}:</span>
                      <span style={{ fontSize: 11, color: T.textHighlight, fontWeight: 500 }}>{v || "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 20px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>
                Unit ID: <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent, fontSize: 13 }}>{latest.unitId}</span>
              </span>
              <span style={{ fontSize: 11, color: T.textSecondary }}>
                Description: <span style={{ color: T.textHighlight }}>{latest.description}</span>
              </span>
              {reg && (
                <span style={{ fontSize: 11, color: T.textSecondary }}>
                  Interval: <span style={{ color: T.textHighlight }}>{reg.interval}</span>
                </span>
              )}
            </div>
          </div>

          <div style={{ background: T.cardBg, border: "1px solid #1E3A5F", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "10px 16px", background: T.infoBarBg, borderBottom: "1px solid #1E3A5F" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Sample Data & Trends</span>
            </div>
            <div className="report-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ overflowX: "auto", borderRight: "1px solid #1E3A5F" }}>
                <ParamTable T={T} history={history} latest={latest} />
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: T.appBg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>Viscosity</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 2, background: T.success, display: "inline-block" }} />
                      <span style={{ fontSize: 10, color: T.textSecondary }}>Visc@40°C (cSt)</span>
                    </div>
                  </div>
                  <LineChart datasets={[{ data: history.map((d) => d.visc40C), label: "Visc@40C" }]} labels={labels} height={90} />
                </div>
                <div style={{ background: T.appBg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>Wear</div>
                  <LineChart
                    datasets={WEAR_METALS.filter((m) => history.some((d) => (d.wear || {})[m] > 0)).map((m) => ({
                      data: history.map((d) => (d.wear || {})[m] ?? 0),
                      label: m,
                    }))}
                    labels={labels}
                    height={100}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
                    {[T.success, T.accent, T.danger, T.warning, "#9B59B6", "#E67E22", "#1ABC9C", "#E74C3C", "#3498DB"].map((c, i) => {
                      const m = WEAR_METALS[i];
                      if (!m || !history.some((d) => (d.wear || {})[m] > 0)) return null;
                      return (
                        <span key={m} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: T.textSecondary }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                          {m} ({WEAR_NAMES[m]})
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ background: T.appBg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>Contaminants</div>
                  <LineChart
                    datasets={CONTAMINANTS.map((c) => ({ data: history.map((d) => (d.contaminants || {})[c] ?? 0), label: c }))}
                    labels={labels}
                    height={90}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    {[T.success, T.accent, T.danger].map((c, i) => (
                      <span
                        key={CONTAMINANTS[i]}
                        style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: T.textSecondary }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                        {CONTAMINANTS[i]} ({CONTAMINANT_NAMES[CONTAMINANTS[i]]})
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ background: T.appBg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>Physical Properties</div>
                  <LineChart
                    datasets={[
                      { data: history.map((d) => (d.water ? parseFloat(d.water) : 0)), label: "Water" },
                      { data: history.map((d) => d.oxidation ?? 0), label: "Oxidation" },
                      ...(history.some((d) => d.tan !== null && d.tan !== undefined && d.tan !== "")
                        ? [
                            {
                              data: history.map((d) => (d.tan !== null && d.tan !== undefined && d.tan !== "" ? parseFloat(d.tan) : null)),
                              label: "TAN",
                            },
                          ]
                        : []),
                    ]}
                    labels={labels}
                    height={90}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    {[
                      [T.success, "Water (Vol%)"],
                      [T.accent, "Oxidation (Ab/cm)"],
                      [T.warning, "TAN (mg KOH/g)"],
                    ].map(([c, label]) => (
                      <span key={label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: T.textSecondary }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {latest.recommendations?.length > 0 && (
            <div style={{ background: T.cardBg, border: "1px solid #1E3A5F", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
              <div
                style={{
                  padding: "10px 16px",
                  background: T.infoBarBg,
                  borderBottom: "1px solid #1E3A5F",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <i className="ti ti-alert-triangle" style={{ color: T.danger, fontSize: 16 }} aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Recommendations / Comments</span>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {latest.recommendations.map((r, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingLeft: 14, borderLeft: "3px solid #E63946" }}>
                    <p style={{ margin: 0, fontSize: 13, color: T.textHighlight, lineHeight: 1.7 }}>{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: T.cardBg, border: "1px solid #1E3A5F", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "10px 16px", background: T.infoBarBg, borderBottom: "1px solid #1E3A5F" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Sample Timeline</span>
            </div>
            <div style={{ padding: "16px 20px" }}>
              {[...history].reverse().map((d, i) => {
                const isFlagged = d.reportStatus === "Alert" || d.reportStatus === "Caution" || d.reportStatus === "Warning";
                const triggers = isFlagged ? sampleTriggerReadings(d) : [];
                return (
                  <div
                    key={d._id || i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
                      marginBottom: 14,
                      paddingBottom: 14,
                      borderBottom: i < history.length - 1 ? "1px solid #1E3A5F" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        flexShrink: 0,
                        marginTop: 3,
                        background: statusColor(T, d.reportStatus),
                      }}
                    />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.textHighlight }}>{formatDate(d.sampledDate)}</span>
                        <span
                          style={{
                            background: statusColor(T, d.reportStatus),
                            color: "#fff",
                            borderRadius: 4,
                            padding: "1px 8px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {d.reportStatus}
                        </span>
                        {d.sampledBy && <span style={{ fontSize: 11, color: T.textSecondary }}>by {d.sampledBy}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: T.textSecondary }}>
                          Sample ID: <span style={{ color: T.textSubtle, fontFamily: "monospace" }}>{d.sampleId || "—"}</span>
                        </span>
                        {triggers.length > 0
                          ? triggers.map((t) => (
                              <span key={t.label} style={{ fontSize: 11, color: T.textSecondary }}>
                                {t.label}:{" "}
                                <span style={{ color: T.danger, fontFamily: "monospace", fontWeight: 700 }}>
                                  {t.value}
                                  {t.unit ? ` ${t.unit}` : ""}
                                </span>
                              </span>
                            ))
                          : [
                              <span key="visc" style={{ fontSize: 11, color: T.textSecondary }}>
                                Visc: <span style={{ color: T.accent, fontFamily: "monospace", fontWeight: 700 }}>{d.visc40C} cSt</span>
                              </span>,
                              <span key="fe" style={{ fontSize: 11, color: T.textSecondary }}>
                                Fe: <span style={{ color: T.textHighlight, fontFamily: "monospace" }}>{d.wear?.Fe ?? 0} ppm</span>
                              </span>,
                              <span key="si" style={{ fontSize: 11, color: T.textSecondary }}>
                                Si: <span style={{ color: T.textHighlight, fontFamily: "monospace" }}>{d.contaminants?.Si ?? 0} ppm</span>
                              </span>,
                              <span key="water" style={{ fontSize: 11, color: T.textSecondary }}>
                                Water: <span style={{ color: T.textHighlight, fontFamily: "monospace" }}>{d.water}</span>
                              </span>,
                            ]}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {trackerHistory.length > 0 && (
            <div style={{ background: T.cardBg, border: "1px solid #1E3A5F", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
              <div
                style={{
                  padding: "10px 16px",
                  background: T.infoBarBg,
                  borderBottom: "1px solid #1E3A5F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Sample Tracker</span>
                {trackerStatus && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: { OK: T.success, OVERDUE: T.warning, MISSING: T.danger }[trackerStatus.label] || T.textSecondary,
                    }}
                  >
                    {trackerStatus.label}
                    {trackerStatus.daysInfo ? ` · ${trackerStatus.daysInfo}` : ""}
                  </span>
                )}
              </div>
              <div style={{ padding: "14px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {trackerHistory.slice(0, 12).map((h) => {
                  const chip = trackerStatusChip(h.status);
                  const oc = trackerOilChangedMonths.has(h.monthLabel);
                  return (
                    <div key={h.monthLabel} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div
                        title={`${h.monthLabel}: ${h.status}${h.date && h.date !== h.monthLabel ? " (" + h.date + ")" : ""}`}
                        style={{
                          background: chip.color + "33",
                          color: chip.color,
                          border: `1px solid ${chip.color}66`,
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 11,
                          fontWeight: 800,
                          minWidth: 26,
                          textAlign: "center",
                        }}
                      >
                        {chip.label}
                      </div>
                      <span style={{ fontSize: 9, color: T.textMuted, whiteSpace: "nowrap" }}>{h.monthLabel}</span>
                      {oc && (
                        <i
                          className="ti ti-droplet-filled-2"
                          title={`Oil changed — ${h.monthLabel}`}
                          style={{ fontSize: 10, color: "#7C3AED" }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: 8 }}>
            Results and comments of this analysis are advisory only. The validity of the data may be impaired by a non-representative sample
            or incorrect data. © 2016–2024 ExxonMobil.
          </p>
        </div>
      )}

      {equipCode !== "All" && (
        <div style={{ marginTop: 16 }}>
          <LastActionsPanel
            equipmentCode={equipCode}
            actions={actions}
            samples={samples}
            oilChanges={oilChanges}
            onAdd={onAddAction}
            onUpdate={onUpdateAction}
            title="Last 5 Actions"
            limit={5}
            equipmentRegistry={registry}
            actionRegistry={actionRegistry}
          />
        </div>
      )}
    </div>
  );
}

function ParamTable({ T, history, latest }) {
  const cellStyle = {
    padding: "6px 10px",
    border: `1px solid ${T.border}`,
    fontSize: 12,
    color: T.textSubtle,
    background: T.cardBg,
    whiteSpace: "nowrap",
    position: "sticky",
    left: 0,
    zIndex: 2,
  };
  const headStyle = {
    padding: "6px 8px",
    background: T.appBg,
    color: T.textSecondary,
    fontSize: 11,
    fontWeight: 700,
    textAlign: "center",
    border: `1px solid ${T.border}`,
    whiteSpace: "nowrap",
  };
  const groupStyle = {
    padding: "8px 10px",
    background: T.infoBarBg,
    color: T.accent,
    fontSize: 12,
    fontWeight: 700,
    border: `1px solid ${T.border}`,
    letterSpacing: 0.5,
  };
  const plainCell = (v, key) => (
    <td key={key} style={{ padding: "5px 8px", border: "1px solid #1E2A3A", fontSize: 11, textAlign: "center", color: T.textSubtle }}>
      {v || "—"}
    </td>
  );
  const hasTan = history.some((d) => d.tan !== null && d.tan !== undefined && d.tan !== "");

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          <th style={{ ...headStyle, textAlign: "left", minWidth: 140 }}>Parameter</th>
          {history.map((d, i) => (
            <th key={i} style={{ ...headStyle, minWidth: 90 }}>
              {formatDate(d.sampledDate)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colSpan={history.length + 1} style={groupStyle}>
            Sample Info
          </td>
        </tr>
        <tr>
          <td style={cellStyle}>Report Status</td>
          {history.map((d, i) => (
            <StatusCell key={i} T={T} val={d.reportStatus} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Sample ID</td>
          {history.map((d, i) => (
            <td
              key={i}
              style={{
                padding: "5px 8px",
                border: "1px solid #1E2A3A",
                fontSize: 10,
                fontFamily: "monospace",
                color: T.textSecondary,
                textAlign: "center",
              }}
            >
              {d.sampleId || "—"}
            </td>
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Sampled</td>
          {history.map((d, i) => (
            <td
              key={i}
              style={{
                padding: "5px 8px",
                border: "1px solid #1E2A3A",
                fontSize: 11,
                textAlign: "center",
                color: T.textHighlight,
                fontWeight: 600,
              }}
            >
              {d.sampledDate || "—"}
            </td>
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Reported</td>
          {history.map((d, i) => plainCell(d.reportedDate, i))}
        </tr>
        <tr>
          <td colSpan={history.length + 1} style={groupStyle}>
            Lubricant
          </td>
        </tr>
        <tr>
          <td style={cellStyle}>Contamination Rating</td>
          {history.map((d, i) => (
            <StatusCell key={i} T={T} val={d.contaminationRating} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Equipment Rating</td>
          {history.map((d, i) => (
            <StatusCell key={i} T={T} val={d.equipmentRating} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Lubricant Rating</td>
          {history.map((d, i) => (
            <StatusCell key={i} T={T} val={d.lubricantRating} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>ISO Code (4/6/14)</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.isoCode} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Particle Count &gt;4µm</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.particleCount4um} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Particle Count &gt;6µm</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.particleCount6um} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Particle Count &gt;14µm</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.particleCount14um} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>PQ Index</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.pqIndex} highlight={d.pqIndex > 15} />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Visc@40°C (cSt)</td>
          {history.map((d, i) => (
            <NumCell
              key={i}
              T={T}
              val={d.visc40C}
              highlight={d.visc40C && (d.visc40C < latest.visc40C * 0.9 || d.visc40C > latest.visc40C * 1.1)}
            />
          ))}
        </tr>
        <tr>
          <td style={cellStyle}>Oxidation (Ab/cm)</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.oxidation} highlight={d.oxidation > 3} />
          ))}
        </tr>
        {hasTan && (
          <tr>
            <td style={cellStyle}>TAN (mg KOH/g)</td>
            {history.map((d, i) => (
              <NumCell key={i} T={T} val={d.tan} highlight={parseFloat(d.tan) > 1} />
            ))}
          </tr>
        )}
        <tr>
          <td style={cellStyle}>Water (Vol%)</td>
          {history.map((d, i) => (
            <NumCell key={i} T={T} val={d.water} highlight={d.water && parseFloat(d.water) > 0.1} />
          ))}
        </tr>
        <tr>
          <td colSpan={history.length + 1} style={groupStyle}>
            Wear (ppm)
          </td>
        </tr>
        {WEAR_METALS.map((m) => (
          <tr key={m}>
            <td style={cellStyle}>
              {m} ({WEAR_NAMES[m]})
            </td>
            {history.map((d, i) => {
              const v = (d.wear || {})[m];
              return (
                <NumCell key={i} T={T} val={v ?? 0} highlight={(m === "Fe" && v > 20) || (m === "Cu" && v > 10) || (m === "Cr" && v > 5)} />
              );
            })}
          </tr>
        ))}
        <tr>
          <td colSpan={history.length + 1} style={groupStyle}>
            Contaminants (ppm)
          </td>
        </tr>
        {CONTAMINANTS.map((c) => (
          <tr key={c}>
            <td style={cellStyle}>
              {c} ({CONTAMINANT_NAMES[c]})
            </td>
            {history.map((d, i) => {
              const v = (d.contaminants || {})[c];
              return <NumCell key={i} T={T} val={v ?? 0} highlight={c === "Si" && v > 20} />;
            })}
          </tr>
        ))}
        <tr>
          <td colSpan={history.length + 1} style={groupStyle}>
            Additives (ppm)
          </td>
        </tr>
        {ADDITIVES.map((a) => (
          <tr key={a}>
            <td style={cellStyle}>
              {a} ({ADDITIVE_NAMES[a]})
            </td>
            {history.map((d, i) => (
              <NumCell key={i} T={T} val={(d.additives || {})[a] ?? 0} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

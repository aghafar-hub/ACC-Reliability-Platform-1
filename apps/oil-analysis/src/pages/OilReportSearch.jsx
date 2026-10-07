import { useEffect, useMemo, useRef, useState } from "react";
import LabReviewPanel from "../components/LabReviewPanel";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { formatDate, intervalMonths, sampleTrackerStatus } from "../parsers";
import LastActionsPanel from "../components/LastActionsPanel";
import LabTrendCharts, { Chip, LabCountControls } from "../components/LabTrendCharts";
import { toTime } from "../pointHistory";
import { actionsForSample, cellMark, changeLabel, pickSamples, reportColumns, reviewOf, viscCellTemp, visibleGroups } from "../labReport";
import { Donut, Ring } from "../components/DashCharts";

const STATUS_RANK = { Alert: 3, Caution: 2, Warning: 2, Normal: 1 };
const SEV_KEY = { Alert: "danger", Caution: "warning" };

function statusKey(status) {
  const t = (status || "").toUpperCase();
  return t === "ALERT" ? "danger" : t === "CAUTION" || t === "WARNING" ? "warning" : t === "NORMAL" ? "success" : "textSecondary";
}

// A status as a tinted pill — readable on light and dark themes alike.
function Pill({ T, status, children, size = 11 }) {
  const c = T[statusKey(status)] || T.textSecondary;
  return (
    <span style={{ background: `${c}22`, color: c, borderRadius: 4, padding: "2px 9px", fontSize: size, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children ?? status}
    </span>
  );
}


// The `oilreport` sidebar destination: every sample of one lubrication point
// as columns (newest on the right), trend charts beside them. With no point
// picked, a list of every sampled point by its latest result.
export default function OilReportSearch({
  samples,
  oilChanges,
  oilChangeEvents,
  actions,
  equipmentRegistry,
  actionRegistry,
  trackerByEquip,
  onAddAction,
  onUpdateAction,
  initialCode,
  focus,
}) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  const [equipCode, setEquipCode] = useState(initialCode || "All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("10");
  const [sinceChange, setSinceChange] = useState(false);
  const [focusKey, setFocusKey] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Opened from elsewhere (an Oil Equipment chart dot, Full Report): show
  // that point, and that sample's column outlined.
  useEffect(() => {
    if (!focus?.code) return;
    setEquipCode(focus.code);
    setFocusKey(focus.sampleKey || null);
    setSinceChange(false);
  }, [focus]);

  // Scoped to real LP_IDs that have (or are registered for) oil analysis.
  const allCodes = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(samples || []).map((d) => d.unitId).filter((code) => code && registry.some((r) => r.code === code)),
            ...registry.filter((r) => r.oilAnalysisRequired === "Yes").map((r) => r.code),
          ].filter(Boolean)
        )
      ).sort(),
    [samples, registry]
  );
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
    setFocusKey(null);
  }

  const historyAll = useMemo(
    () => (equipCode === "All" ? [] : (samples || []).filter((d) => d.unitId === equipCode)).sort((a, b) => new Date(a.sampledDate) - new Date(b.sampledDate)),
    [samples, equipCode]
  );
  const reg = equipCode !== "All" ? registry.find((r) => r.code === equipCode) : null;
  const changeEvents = useMemo(
    () => (oilChangeEvents || []).filter((e) => e.lpId === equipCode && e.eventDate).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate)),
    [oilChangeEvents, equipCode]
  );
  const currentChange = (oilChanges || []).find((o) => o.equipmentCode === equipCode) || null;
  const lastEvent = changeEvents[changeEvents.length - 1] || currentChange?.lastEvent || null;
  const lastChangeTime = toTime(lastEvent?.eventDate || currentChange?.changeDate);

  // A sample opened from elsewhere must be in view: widen to all if needed.
  useEffect(() => {
    if (!focusKey) return;
    const idx = historyAll.findIndex((d) => d._id === focusKey);
    if (idx >= 0 && count !== "all" && historyAll.length - idx > Number(count)) setCount("all");
  }, [focusKey, historyAll, count]);

  const history = pickSamples(historyAll, { count, sinceChange, lastChangeTime });
  const latest = historyAll[historyAll.length - 1];
  const columns = reportColumns(history, changeEvents, { sinceChange, lastChangeTime });

  // Sampling status and next sample due.
  const trackerHistory = equipCode !== "All" ? (trackerByEquip || {})[equipCode] || [] : [];
  const lastSampleDate = latest?.sampledDate || trackerHistory[0]?.date || "";
  const samplingStatus = equipCode !== "All" && reg?.interval ? sampleTrackerStatus(lastSampleDate, reg.interval) : null;
  const sampleMonths = intervalMonths(reg?.interval || "");
  const nextSampleDue = (() => {
    const t = toTime(latest?.sampledDate);
    if (!sampleMonths || t === null) return null;
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth() + sampleMonths, d.getDate());
  })();

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { generateLabReportPdf } = await import("../reportGenerators");
      await generateLabReportPdf({
        reg,
        code: equipCode,
        shown: history,
        columns,
        actions,
        lastEvent,
        nextChangeDue: currentChange?.nextDueDate || lastEvent?.nextDueDate || "",
        samplingStatus,
        nextSampleDue,
        allSamples: samples,
        registry,
      });
    } finally {
      setPdfBusy(false);
    }
  }

  // Account details as printed on the lab's report: this point's latest
  // report, else the newest report of another point of the same contractor
  // (each contractor has its own lab account — RHI's and ASEC's differ).
  const account = useMemo(() => {
    if (latest?.accountId || latest?.accountName) return latest;
    if (!reg?.contractor) return null;
    const sameContractor = new Set(registry.filter((r) => r.contractor === reg.contractor).map((r) => r.code));
    return (
      [...(samples || [])]
        .filter((sm) => (sm.accountId || sm.accountName) && sameContractor.has(sm.unitId))
        .sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate))[0] || null
    );
  }, [latest, samples, registry, reg?.contractor]);
  const card = { background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 };
  const cardHead = { padding: "10px 16px", background: T.infoBarBg, borderBottom: `1px solid ${T.border}` };
  const headerColor = T[statusKey(latest?.reportStatus)] || T.textSecondary;

  return (
    <div>
      <LabReviewPanel samples={samples} equipmentRegistry={equipmentRegistry} />
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 280, position: "relative" }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: T.textSecondary }}>Search or select LP-ID</p>
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
                        <div style={{ fontSize: 12, color: T.textSecondary }}>{r?.description || ""}</div>
                      </div>
                      {last && (
                        <span
                          style={{
                            fontSize: 12,
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
              <Pill T={T} status={latest.reportStatus} size={13} />
              <span style={{ fontSize: 12, color: T.textSecondary }}>
                {historyAll.length} sample{historyAll.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {equipCode !== "All" && (
          <div
            data-testid="report-infobar"
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: T.infoBarBg,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <Info T={T} label="Last oil change" value={lastEvent ? formatDate(lastEvent.eventDate) : currentChange?.changeDate ? formatDate(currentChange.changeDate) : "No record"} strong />
            {lastEvent && (
              <>
                <Info T={T} label="Oil used" value={lastEvent.oilBrandType || "—"} />
                <Info T={T} label="Quantity" value={lastEvent.quantityUsed ? `${lastEvent.quantityUsed} L` : "—"} />
                <Info T={T} label="Done by" value={lastEvent.doneBy || "—"} />
              </>
            )}
            {(currentChange?.nextDueDate || lastEvent?.nextDueDate) && (
              <Info
                T={T}
                label="Next change due"
                value={formatDate(currentChange?.nextDueDate || lastEvent?.nextDueDate)}
                color={currentChange?.status === "Overdue" ? "danger" : null}
              />
            )}
            {samplingStatus && (
              <Info
                T={T}
                label="Sampling"
                value={`${samplingStatus.label}${samplingStatus.daysInfo ? ` · ${samplingStatus.daysInfo}` : ""}`}
                color={{ OK: "success", OVERDUE: "warning", MISSING: "danger" }[samplingStatus.label]}
              />
            )}
            {nextSampleDue && <Info T={T} label="Next sample due" value={formatDate(nextSampleDue)} />}
          </div>
        )}
      </div>

      {equipCode === "All" && (
        <PointsList T={T} s={s} isMobile={isMobile} codes={allCodes} samples={samples} registry={registry} trackerByEquip={trackerByEquip} onPick={selectCode} />
      )}
      {equipCode !== "All" && historyAll.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.textMuted, fontSize: 14 }}>No samples found for this equipment.</div>
      )}

      {equipCode !== "All" && historyAll.length > 0 && latest && (
        <div>
          <div style={card}>
            <div
              style={{
                background: headerColor,
                padding: "8px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15, color: statusKey(latest.reportStatus) === "warning" ? "#1a1a1a" : "#fff", letterSpacing: 1 }}>
                {latest.reportStatus?.toUpperCase() || "NO RESULT"}
              </span>
              <span style={{ fontSize: 12, color: statusKey(latest.reportStatus) === "warning" ? "#1a1a1a" : "rgba(255,255,255,0.85)" }}>
                Asset ID: {latest.assetId || reg?.assetId || "—"}
              </span>
            </div>
            <div className="report-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${T.border}` }}>
              {[
                {
                  title: "Account Information",
                  rows: [
                    ["ID", account?.accountId],
                    ["Name", account?.accountName],
                    ["Address", account?.accountAddress],
                  ],
                },
                {
                  title: "Sample Information",
                  rows: [
                    ["Sample ID", latest.sampleId],
                    ["Service Level", latest.serviceLevel],
                    ["Bottle ID", latest.bottleId],
                    ["Tested Lubricant", latest.testedLubricant || lastEvent?.oilBrandType || reg?.lubricant],
                  ],
                },
                {
                  title: "Equipment Information",
                  rows: [
                    ["Asset Class", latest.assetClass || reg?.assetClass],
                    ["Manufacturer", latest.manufacturer || reg?.manufacturer],
                    ["Model", latest.model || reg?.model || "N/A"],
                    ["Lubricant", lastEvent?.oilBrandType || reg?.lubricant],
                  ],
                },
              ].map((col) => (
                <div key={col.title} style={{ padding: "12px 16px", borderRight: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 8, letterSpacing: 0.5 }}>{col.title}</div>
                  {col.rows.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: T.textSecondary, minWidth: 90 }}>{k}:</span>
                      <span style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500 }}>{v || "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {!latest.accountId && !latest.assetId && !latest.bottleId && !latest.serviceLevel && (
              <div data-testid="report-details-hint" style={{ padding: "8px 20px", fontSize: 12, color: T.textSecondary, borderBottom: `1px solid ${T.border}` }}>
                <i className="ti ti-info-circle" aria-hidden="true" /> This sample was saved without the lab report's header details. Import its PDF again (Add Report →
                Import) — it won't be added twice, and the missing details are filled in.
              </div>
            )}
            <div style={{ padding: "10px 20px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.textSecondary }}>
                Unit ID: <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent, fontSize: 13 }}>{latest.unitId}</span>
              </span>
              <span style={{ fontSize: 12, color: T.textSecondary }}>
                Description: <span style={{ color: T.textPrimary }}>{latest.description || reg?.description}</span>
              </span>
              {reg && (
                <span style={{ fontSize: 12, color: T.textSecondary }}>
                  Interval: <span style={{ color: T.textPrimary }}>{reg.interval}</span>
                </span>
              )}
            </div>
          </div>

          {latest.recommendations?.length > 0 && (
            <div style={card}>
              <div style={{ ...cardHead, display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-alert-triangle" style={{ color: T.danger, fontSize: 16 }} aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Recommendations / Comments</span>
                <span style={{ fontSize: 12, color: T.textSecondary }}>— latest sample, {formatDate(latest.sampledDate)}</span>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {latest.recommendations.map((r, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingLeft: 14, borderLeft: `3px solid ${T.danger}` }}>
                    <p style={{ margin: 0, fontSize: 13, color: T.textPrimary, lineHeight: 1.7 }}>{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={card}>
            <div style={{ ...cardHead, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Sample Data &amp; Trends</span>
              <LabCountControls
                T={T}
                s={s}
                count={count}
                setCount={setCount}
                sinceChange={sinceChange}
                setSinceChange={setSinceChange}
                lastChangeTime={lastChangeTime}
                shown={history.length}
                total={historyAll.length}
              >
                <button type="button" style={{ ...s.btn, padding: "5px 11px", fontSize: 12 }} onClick={downloadPdf} disabled={pdfBusy} data-testid="report-pdf">
                  <i className="ti ti-file-download" aria-hidden="true" /> {pdfBusy ? "Preparing…" : "PDF"}
                </button>
              </LabCountControls>
            </div>
            {history.length === 0 ? (
              <p style={{ padding: 20, margin: 0, color: T.textSecondary, fontSize: 13 }}>
                No samples since the last oil change ({formatDate(lastChangeTime)}).
              </p>
            ) : (
              <div className="report-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                <div style={{ overflowX: "auto", borderRight: `1px solid ${T.border}`, minWidth: 0 }}>
                  <ParamTable T={T} columns={columns} shown={history} actions={actions} code={equipCode} focusKey={focusKey} />
                </div>
                <div style={{ padding: 16, minWidth: 0 }}>
                  <LabTrendCharts T={T} history={history} changes={changeEvents} layout="column" testPrefix="report" />
                </div>
              </div>
            )}
          </div>
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

function Info({ T, label, value, color, strong }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: T.textSecondary }}>{label}</div>
      <div style={{ fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 600, color: color ? T[color] : T.textPrimary }}>{value}</div>
    </div>
  );
}



// With no point picked: every sampled point by its latest result, worst
// first, with what the lab marked and whether a sample is due.
function PointsList({ T, s, isMobile, codes, samples, registry, trackerByEquip, onPick }) {
  const [filter, setFilter] = useState("all");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(50);
  const rows = useMemo(() => {
    const byCode = new Map();
    (samples || []).forEach((sm) => {
      const cur = byCode.get(sm.unitId);
      if (!cur || new Date(sm.sampledDate) > new Date(cur.latest.sampledDate)) byCode.set(sm.unitId, { latest: sm, n: (cur?.n || 0) + 1 });
      else cur.n += 1;
    });
    return codes.map((code) => {
      const reg = registry.find((r) => r.code === code);
      const info = byCode.get(code);
      const latest = info?.latest || null;
      const tracker = (trackerByEquip || {})[code] || [];
      const sampling = reg?.interval ? sampleTrackerStatus(latest?.sampledDate || tracker[0]?.date || "", reg.interval) : null;
      return { code, reg, latest, n: info?.n || 0, sampling, marks: latest?.flaggedReadings || [] };
    });
  }, [codes, samples, registry, trackerByEquip]);
  const counts = {
    Alert: rows.filter((r) => r.latest?.reportStatus === "Alert").length,
    Caution: rows.filter((r) => ["Caution", "Warning"].includes(r.latest?.reportStatus)).length,
    Normal: rows.filter((r) => r.latest?.reportStatus === "Normal").length,
    due: rows.filter((r) => r.sampling && r.sampling.label !== "OK").length,
  };
  const q = text.trim().toLowerCase();
  const shown = rows
    .filter((r) => {
      if (filter === "Alert") return r.latest?.reportStatus === "Alert";
      if (filter === "Caution") return ["Caution", "Warning"].includes(r.latest?.reportStatus);
      if (filter === "Normal") return r.latest?.reportStatus === "Normal";
      if (filter === "due") return r.sampling && r.sampling.label !== "OK";
      return true;
    })
    .filter((r) => !q || r.code.toLowerCase().includes(q) || (r.reg?.description || "").toLowerCase().includes(q) || (r.reg?.area || "").toLowerCase().includes(q))
    .sort(
      (a, b) =>
        (STATUS_RANK[b.latest?.reportStatus] || 0) - (STATUS_RANK[a.latest?.reportStatus] || 0) ||
        new Date(b.latest?.sampledDate || 0) - new Date(a.latest?.sampledDate || 0) ||
        a.code.localeCompare(b.code)
    );
  const samplingColor = { OK: "success", OVERDUE: "warning", MISSING: "danger" };
  const chip = (key, label, n, color) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        setFilter(filter === key ? "all" : key);
        setLimit(50);
      }}
      aria-pressed={filter === key}
      data-testid={`points-filter-${key}`}
      style={{ ...s.btn, padding: "6px 12px", fontSize: 12.5, borderColor: filter === key ? T[color] || T.accent : T.border, color: filter === key ? T[color] || T.accent : T.textSecondary, fontWeight: filter === key ? 700 : 500 }}
    >
      {label} <strong style={{ color: T[color] || T.textPrimary }}>{n}</strong>
    </button>
  );
  const marksText = (r) => r.marks.map((m) => `${m.param} ${m.severity}`).join(", ");
  return (
    <div style={{ ...s.card }} data-testid="points-list">
      {(() => {
        // D5 — the latest result across the points, as a donut (tap a part to
        // filter), next to how many are sampled on time.
        const withResult = counts.Normal + counts.Caution + counts.Alert;
        const segs = [
          { label: "Normal", key: "Normal", value: counts.Normal, color: T.success },
          { label: "Caution", key: "Caution", value: counts.Caution, color: T.warning },
          { label: "Alert", key: "Alert", value: counts.Alert, color: T.danger },
        ];
        const dueSet = rows.filter((r) => r.sampling).length;
        const onTimePct = dueSet ? Math.round(((dueSet - counts.due) / dueSet) * 100) : null;
        return (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }} data-testid="report-overview">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Donut T={T} segments={segs} size={isMobile ? 104 : 116} thickness={16} center={withResult} sub="points" ariaLabel={`Latest results: ${counts.Normal} Normal, ${counts.Caution} Caution, ${counts.Alert} Alert`} />
              <div>
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: T.textPrimary }}>Latest result per point</p>
                {segs.map((x) => (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => { setFilter(filter === x.key ? "all" : x.key); setLimit(50); }}
                    style={{ display: "flex", alignItems: "center", gap: 7, border: 0, background: filter === x.key ? x.color + "1A" : "none", borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: T.textPrimary }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color }} />
                    <b>{x.value}</b> {x.label}
                    {withResult ? <span style={{ color: T.textSecondary }}> · {Math.round((x.value / withResult) * 100)}%</span> : null}
                  </button>
                ))}
                {rows.length > withResult && <p style={{ margin: "4px 0 0 6px", fontSize: 12, color: T.textSecondary }}>{rows.length - withResult} with no result yet</p>}
              </div>
            </div>
            {dueSet > 0 && (
              <button
                type="button"
                onClick={() => { setFilter(filter === "due" ? "all" : "due"); setLimit(50); }}
                style={{ display: "flex", alignItems: "center", gap: 12, border: 0, background: "none", cursor: "pointer", fontFamily: "inherit", color: T.textPrimary, textAlign: "left" }}
              >
                <Ring T={T} pct={onTimePct} size={isMobile ? 72 : 84} color={T.accent} label={`${onTimePct} % sampled on time`} />
                <span>
                  <b style={{ fontSize: 14 }}>Sampled on time</b>
                  <br />
                  <span style={{ fontSize: 13, color: T.textSecondary }}>
                    {counts.due} of {dueSet} overdue or missing
                  </span>
                </span>
              </button>
            )}
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {chip("all", "All", rows.length, null)}
        {chip("Alert", "Alert", counts.Alert, "danger")}
        {chip("Caution", "Caution", counts.Caution, "warning")}
        {chip("Normal", "Normal", counts.Normal, "success")}
        {chip("due", "Sample overdue / missing", counts.due, "warning")}
        <input
          style={{ ...s.input, width: isMobile ? "100%" : 240, marginLeft: isMobile ? 0 : "auto", fontSize: 13 }}
          placeholder="Filter by point, description, area…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Filter points"
        />
      </div>
      {shown.length === 0 ? (
        <p style={{ color: T.textSecondary, margin: 0 }}>No points match.</p>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.slice(0, limit).map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => onPick(r.code)}
              data-testid={`points-row-${r.code}`}
              style={{ ...s.card, marginBottom: 0, padding: 12, textAlign: "left", font: "inherit", color: T.textPrimary, cursor: "pointer", width: "100%" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: T.accent }}>{r.code}</strong>
                {r.latest ? <Pill T={T} status={r.latest.reportStatus} /> : <span style={{ fontSize: 12, color: T.textSecondary }}>Never sampled</span>}
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>{r.reg?.description}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                {r.latest ? formatDate(r.latest.sampledDate) : ""}
                {r.sampling && <span style={{ color: T[samplingColor[r.sampling.label]], fontWeight: 700, marginLeft: 8 }}>{r.sampling.label}</span>}
              </div>
              {r.marks.length > 0 && <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>Lab marks: {marksText(r)}</div>}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...s.table, fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Point", "Description", "Latest result", "Sampled", "Lab marks", "Sampling", "Samples"].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.code} onClick={() => onPick(r.code)} style={{ cursor: "pointer" }} data-testid={`points-row-${r.code}`}>
                  <td style={{ ...s.td, fontWeight: 700, color: T.accent, whiteSpace: "nowrap" }}>{r.code}</td>
                  <td style={{ ...s.td, color: T.textSecondary }}>{r.reg?.description || "—"}</td>
                  <td style={s.td}>{r.latest ? <Pill T={T} status={r.latest.reportStatus} /> : <span style={{ color: T.textSecondary }}>Never sampled</span>}</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>{r.latest ? formatDate(r.latest.sampledDate) : "—"}</td>
                  <td style={{ ...s.td, color: T.textSecondary }}>{marksText(r) || "—"}</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                    {r.sampling ? (
                      <span style={{ color: T[samplingColor[r.sampling.label]], fontWeight: 700 }} title={r.sampling.daysInfo}>
                        {r.sampling.label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={s.td}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 50)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: "10px 0", fontSize: 13 }}>
          Show {Math.min(50, shown.length - limit)} more of {shown.length - limit}
        </button>
      )}
    </div>
  );
}

// Parameters down the side, one column per sample (newest on the right),
// with a narrow column wherever the oil was changed. A cell the lab marked
// yellow / red on its report is tinted the same way.
function ParamTable({ T, columns, shown, actions, code, focusKey }) {
  const focusRef = useRef(null);
  useEffect(() => {
    if (focusRef.current) focusRef.current.scrollIntoView({ block: "nearest", inline: "center" });
  }, [focusKey, columns.length]);
  const groups = visibleGroups(shown);
  const span = columns.length + 1;
  const border = `1px solid ${T.border}`;
  const nameCell = {
    padding: "6px 10px",
    border,
    fontSize: 12,
    color: T.textPrimary,
    background: T.cardBg,
    whiteSpace: "nowrap",
    position: "sticky",
    left: 0,
    zIndex: 2,
  };
  const headStyle = { padding: "6px 8px", background: T.appBg, color: T.textSecondary, fontSize: 12, fontWeight: 700, textAlign: "center", border, whiteSpace: "nowrap" };
  const groupStyle = { padding: "8px 10px", background: T.infoBarBg, color: T.accent, fontSize: 12, fontWeight: 700, border, letterSpacing: 0.5 };
  const focusShadow = `inset 2px 0 0 ${T.accent}, inset -2px 0 0 ${T.accent}`;
  const changeCell = { border, background: `${T.accent}14`, minWidth: 18, padding: 0 };

  function cell(row, col, i) {
    if (col.type === "change") return <td key={i} style={changeCell} />;
    const d = col.sample;
    const isFocus = focusKey && d._id === focusKey;
    const base = { padding: "5px 8px", border, textAlign: "center", fontSize: 12, color: T.textPrimary, boxShadow: isFocus ? focusShadow : undefined };
    if (row.kind === "status") {
      const v = row.get(d);
      return <td key={i} style={base}>{v ? <Pill T={T} status={v} /> : <span style={{ color: T.textMuted }}>—</span>}</td>;
    }
    if (row.kind === "review") {
      const r = reviewOf(d);
      return (
        <td key={i} style={{ ...base, fontSize: 12, color: T[r.color] || T.textSecondary, fontWeight: r.color === "textSecondary" ? 500 : 700 }} title={r.detail}>
          {r.label}
        </td>
      );
    }
    if (row.kind === "action") {
      const list = actionsForSample(actions, code, d);
      return (
        <td key={i} style={{ ...base, fontSize: 12 }}>
          {list.length ? list.map((a) => `${a.acNo || "—"} · ${a.status}`).join(", ") : <span style={{ color: T.textMuted }}>—</span>}
        </td>
      );
    }
    const v = row.get(d);
    if (row.kind === "date") return <td key={i} style={{ ...base, fontWeight: 600 }}>{v ? formatDate(v) : "—"}</td>;
    if (row.kind === "mono") return <td key={i} style={{ ...base, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: T.textSecondary }}>{v || "—"}</td>;
    const mark = row.kind === "num" ? cellMark(d, row) : "";
    const c = mark ? T[SEV_KEY[mark]] : null;
    return (
      <td
        key={i}
        title={mark ? `Lab marked ${mark}` : undefined}
        data-mark={mark || undefined}
        style={{ ...base, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: mark ? 700 : 400, color: c || T.textPrimary, background: c ? `${c}26` : "transparent" }}
      >
        {v ?? "—"}
        {row.visc && v !== null && v !== undefined && viscCellTemp(shown, d) && <span style={{ fontSize: 12, color: T.textSecondary }}> {viscCellTemp(shown, d)}</span>}
      </td>
    );
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }} data-testid="report-table">
      <thead>
        <tr>
          <th style={{ ...headStyle, textAlign: "left", minWidth: 140, position: "sticky", left: 0, zIndex: 3 }}>Parameter</th>
          {columns.map((col, i) =>
            col.type === "change" ? (
              <th
                key={i}
                title={changeLabel(col.change)}
                data-testid="report-change-col"
                style={{ ...headStyle, background: `${T.accent}22`, color: T.textPrimary, minWidth: 18, maxWidth: 26, padding: "4px 2px", whiteSpace: "normal" }}
              >
                <i className="ti ti-droplet" aria-hidden="true" style={{ color: T.accent }} />
                <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 12, fontWeight: 600, margin: "4px auto 0", maxHeight: 120 }}>
                  Oil change {formatDate(col.change.eventDate)}
                </div>
              </th>
            ) : (
              <th
                key={i}
                ref={focusKey && col.sample._id === focusKey ? focusRef : undefined}
                data-testid={focusKey && col.sample._id === focusKey ? "report-focus-col" : undefined}
                style={{ ...headStyle, minWidth: 90, boxShadow: focusKey && col.sample._id === focusKey ? `${focusShadow}, inset 0 2px 0 ${T.accent}` : undefined }}
              >
                {formatDate(col.sample.sampledDate)}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => [
          <tr key={g.title}>
            <td colSpan={span} style={groupStyle}>
              {g.title}
            </td>
          </tr>,
          ...g.rows.map((row) => (
            <tr key={row.key}>
              <td style={nameCell}>{row.label}</td>
              {columns.map((col, i) => cell(row, col, i))}
            </tr>
          )),
        ])}
      </tbody>
    </table>
  );
}

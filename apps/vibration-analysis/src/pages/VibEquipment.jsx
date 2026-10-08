import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibEquipmentHistory, getVibEquipmentSummary } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import { Donut, StackedBars } from "../components/DashCharts";
import Tile, { PageHeader, TabBar } from "../components/Tile";
import { LevelPill, LevelSymbol, StatePill } from "../components/Level";
import TrendChart from "../components/TrendChart";
import { LEVEL_RANK, LEVELS, levelColor, worstLevel } from "../levels";
import { RMS_DEFAULT, SCOPES, SPM_DEFAULT, monthLabel, shortDate } from "../vibModel";
import { seriesColors } from "../tones";
import NewReadingModal from "./VibNewReading";

// Equipment: every machine with its latest vibration condition (list), and
// one machine's page — point cards, trend with the limit bands, the report
// timeline (one line with symbols), all readings and its reports.

const STALE_DAYS = 90;
const UNIT = { RMS: "mm/s", SPM: "dBsv", Gs: "g" };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export default function VibEquipment({ webhookUrl, scopeEquipment, selectedEq, setSelectedEq, onOpenReport, startAdding, onAddClosed }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(startAdding ? {} : null);
  // bumped after a save so the open machine page reloads its readings
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getVibEquipmentSummary(webhookUrl));
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl]);
  useEffect(() => {
    load();
  }, [load]);
  const machines = useMemo(() => Object.values(scopeEquipment || {}), [scopeEquipment]);
  const modal = adding && (
    <NewReadingModal
      webhookUrl={webhookUrl}
      machines={machines}
      me={data?.me}
      presetEquipmentId={adding.equipmentId}
      onClose={() => {
        setAdding(null);
        onAddClosed?.();
      }}
      onSaved={() => {
        setAdding(null);
        onAddClosed?.();
        setVersion((v) => v + 1);
        load();
      }}
    />
  );
  if (selectedEq) {
    const row = data?.equipment.find((e) => e.equipmentId === selectedEq);
    return (
      <>
        <MachinePage webhookUrl={webhookUrl} version={version} eqId={selectedEq} row={row} info={scopeEquipment?.[selectedEq]} onBack={() => setSelectedEq(null)} onAdd={() => setAdding({ equipmentId: selectedEq })} onOpenReport={onOpenReport} today={data?.today} />
        {modal}
      </>
    );
  }
  return (
    <>
      <EquipmentList data={data} error={error} reload={load} onOpen={setSelectedEq} onAdd={() => setAdding({})} />
      {modal}
    </>
  );
}

function EquipmentList({ data, error, reload, onOpen, onAdd }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [contractor, setContractor] = useState("All");
  const [scope, setScope] = useState("All");
  const [show, setShow] = useState("All");
  const [q, setQ] = useState("");
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const me = data?.me || {};
  const isStale = (e) => !e.lastDate || daysBetween(e.lastDate, today) > STALE_DAYS;
  const base = (data?.equipment || []).filter((e) => (contractor === "All" || e.contractor === contractor) && (scope === "All" || e.scope === scope));
  const worse = (e) => e.prevStatus && (LEVEL_RANK[e.status] || 0) > (LEVEL_RANK[e.prevStatus] || 0);
  const rows = base
    .filter((e) => !q || (e.equipmentId + " " + e.name).toLowerCase().includes(q.toLowerCase()))
    .filter((e) => (show === "All" ? true : show === "Needs attention" ? ["Alert", "Danger"].includes(e.status) : show === "Not measured 90 d" ? isStale(e) : show === "Got worse" ? worse(e) : e.status === show))
    .sort((a, b) => (LEVEL_RANK[b.status] || 0) - (LEVEL_RANK[a.status] || 0) || a.equipmentId.localeCompare(b.equipmentId));
  const count = (l) => base.filter((e) => e.status === l).length;
  const stale = base.filter(isStale);
  const scopes = SCOPES.filter((sc) => base.some((e) => e.scope === sc) || scope === sc);

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-equipment">
      <PageHeader
        title="Vibration Equipment"
        subtitle={data ? `${base.length} machines · ${count("Danger")} Danger · ${count("Alert")} Alert · ${stale.length} not measured in ${STALE_DAYS} days` : "Loading equipment…"}
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={me.contractor ? [me.contractor] : ["RHI", "ASEC"]} testid="veq-contractor" />
            <button type="button" style={s.btnPrimary} onClick={onAdd} data-testid="veq-new-reading">
              <i className="ti ti-plus" aria-hidden="true" /> New reading
            </button>
          </>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          Couldn't load equipment: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {data && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.3fr) minmax(0,1fr)", marginBottom: 14 }}>
            <div style={{ ...s.card, marginBottom: 0, display: "flex", gap: 14, alignItems: "center" }} data-testid="veq-donut">
              <Donut
                T={T}
                size={124}
                segments={[...LEVELS.map((l) => ({ label: l, value: count(l), color: levelColor(T, l) })), { label: "No readings", value: base.filter((e) => !e.status).length, color: T.border }]}
                center={base.length}
                sub="machines"
                ariaLabel="Machines by latest status"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, flex: 1 }}>
                {LEVELS.map((l) => (
                  <button key={l} type="button" onClick={() => setShow(show === l ? "All" : l)} style={{ display: "flex", gap: 8, alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: T.textPrimary, fontFamily: "inherit" }}>
                    <LevelPill level={l} />
                    <b style={{ marginLeft: "auto" }}>{count(l)}</b>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...s.card, marginBottom: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, color: T.textPrimary }}>
                Condition by scope <span style={{ fontWeight: 400, fontSize: 12, color: T.textSecondary }}>tap a row to filter</span>
              </div>
              <StackedBars
                T={T}
                labelWidth={120}
                activeLabel={scope === "All" ? null : scope}
                onRow={(r) => setScope(scope === r.label ? "All" : r.label)}
                rows={SCOPES.filter((sc) => (data.equipment || []).some((e) => e.scope === sc && (contractor === "All" || e.contractor === contractor))).map((sc) => {
                  const list = (data.equipment || []).filter((e) => e.scope === sc && (contractor === "All" || e.contractor === contractor));
                  return { label: sc, parts: LEVELS.map((l) => ({ label: l, value: list.filter((e) => e.status === l).length, color: levelColor(T, l) })) };
                })}
              />
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <Tile icon="ti-trending-up" value={base.filter(worse).length} label="Got worse since last report" tone={base.filter(worse).length ? T.alert : undefined} onClick={() => setShow("Got worse")} testid="veq-tile-worse" />
              <Tile icon="ti-clock-exclamation" value={stale.length} label={`Not measured in ${STALE_DAYS} days`} tone={stale.length ? T.warning : undefined} onClick={() => setShow("Not measured 90 d")} testid="veq-tile-stale" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...s.input, width: 220 }} placeholder="Find by ID or name" value={q} onChange={(e) => setQ(e.target.value)} data-testid="veq-find" />
            <select style={s.select} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
              <option value="All">All scopes</option>
              {scopes.map((sc) => (
                <option key={sc}>{sc}</option>
              ))}
            </select>
            <select style={s.select} value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show" data-testid="veq-show">
              {["All", "Needs attention", "Got worse", "Not measured 90 d", ...LEVELS].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>
              {rows.length} of {base.length} shown
            </span>
          </div>
          <div style={{ ...s.card, padding: 0, overflowX: "auto" }}>
            <table style={s.table} data-testid="veq-table">
              <thead>
                <tr>
                  {["Equipment", "Name", "Scope", "Status", "Change", "Last measured", "Worst point", "VIB IDs", ""].map((h) => (
                    <th key={h} style={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const wp = e.points.filter((p) => p.final === e.status && p.date && p.date.slice(0, 7) === e.lastMonth)[0];
                  const up = worse(e);
                  const down = e.prevStatus && (LEVEL_RANK[e.status] || 0) < (LEVEL_RANK[e.prevStatus] || 0);
                  return (
                    <tr key={e.equipmentId} style={{ cursor: "pointer" }} onClick={() => onOpen(e.equipmentId)} data-testid={`veq-row-${e.equipmentId}`}>
                      <td style={{ ...s.td, fontWeight: 700 }}>{e.equipmentId}</td>
                      <td style={s.td}>{e.name}</td>
                      <td style={s.td}>
                        {e.contractor} · {e.scope || "—"}
                      </td>
                      <td style={s.td}>{e.status ? <LevelPill level={e.status} /> : <span style={{ color: T.textMuted }}>No readings</span>}</td>
                      <td style={{ ...s.td, fontSize: 12.5, color: up ? T.alert : down ? T.success : T.textSecondary, whiteSpace: "nowrap" }}>
                        {up ? "▲ worse" : down ? "▼ better" : e.prevStatus ? "same" : "—"}
                        {e.prevStatus && <span style={{ color: T.textMuted }}> (was {e.prevStatus})</span>}
                      </td>
                      <td style={{ ...s.td, whiteSpace: "nowrap", color: e.lastDate && daysBetween(e.lastDate, today) > STALE_DAYS ? T.warning : T.textPrimary }}>{e.lastDate ? shortDate(e.lastDate) : "—"}</td>
                      <td style={{ ...s.td, fontSize: 12.5 }}>{wp ? `${wp.point} · ${wp.value ?? "–"} ${UNIT[wp.family] || ""}` : "—"}</td>
                      <td style={s.td}>{e.vibIds}</td>
                      <td style={{ ...s.td, color: T.textSecondary }}>›</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} style={{ ...s.td, color: T.textSecondary }}>
                      No machines match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MachinePage({ webhookUrl, version, eqId, row, info, onBack, onAdd, onOpenReport, today }) {
  const { T, s, themeName } = useTheme();
  const isMobile = useIsMobile();
  const [hist, setHist] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("trend");
  const [metric, setMetric] = useState("RMS");
  useEffect(() => {
    let live = true;
    getVibEquipmentHistory(webhookUrl, eqId)
      .then((d) => live && setHist(d.entries || []))
      .catch((e) => live && setError(String(e.message || e)));
    return () => {
      live = false;
    };
  }, [webhookUrl, eqId, version]);

  const entries = useMemo(() => (hist || []).slice().sort((a, b) => (a["Measurement date"] < b["Measurement date"] ? 1 : -1)), [hist]);
  const name = row?.name || info?.name || "";
  const colors = seriesColors(themeName);

  // Latest value per VIB ID, grouped by position for the point cards.
  const positions = useMemo(() => {
    const latest = {};
    entries.forEach((e) => {
      if (e["Reading kind"] && e["Reading kind"] !== "Report reading") return;
      if (!latest[e["VIB ID"]]) latest[e["VIB ID"]] = e;
    });
    const byPos = {};
    (info?.points || []).forEach((p) => {
      const b = (byPos[p.positionCode] ||= { pos: p.positionCode, name: String(p.description).split(";")[0].replace(/\s*\(.*\)$/, ""), fam: {} });
      b.fam[p.family] = latest[p.vibId] || null;
    });
    return Object.values(byPos);
  }, [entries, info]);

  // One line per position for the chosen family.
  const series = useMemo(() => {
    const field = { RMS: "Max velocity (mm/s)", SPM: "HDm (dBsv)", Gs: "G's (g)" }[metric];
    const byPos = {};
    entries.forEach((e) => {
      if (e.Family !== metric) return;
      const v = parseFloat(e[field]);
      if (isNaN(v)) return;
      (byPos[e.Position] ||= { label: String(e["Point description"]).replace(/\s*\(.*\)$/, "") || e.Position, points: [] }).points.push({ date: e["Measurement date"], value: v });
    });
    return Object.values(byPos).map((sr, i) => ({ ...sr, color: colors[i % colors.length] }));
  }, [entries, metric, colors]);
  const limits = metric === "RMS" ? info?.rms || RMS_DEFAULT : metric === "SPM" ? info?.spm || SPM_DEFAULT : null;

  // Report timeline: worst final status per month.
  const months = useMemo(() => {
    const m = {};
    entries.forEach((e) => {
      if (e["Reading kind"] && e["Reading kind"] !== "Report reading") return;
      const k = String(e.Month || e["Measurement date"]).slice(0, 7);
      const x = (m[k] ||= { month: k, worst: "", reportId: e["Report ID"], differs: false });
      x.worst = worstLevel([x.worst, e["Final status"]]);
      if (e["Report differs"] === "Yes") x.differs = true;
    });
    return Object.values(m).sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [entries]);
  const reports = useMemo(() => {
    const r = {};
    entries.forEach((e) => {
      const x = (r[e["Report ID"]] ||= { id: e["Report ID"], month: e.Month, n: 0, worst: "" });
      x.n++;
      if (!e["Reading kind"] || e["Reading kind"] === "Report reading") x.worst = worstLevel([x.worst, e["Final status"]]);
    });
    return Object.values(r).sort((a, b) => (a.id < b.id ? 1 : -1));
  }, [entries]);
  const families = ["RMS", "SPM", "Gs"].filter((f) => (info?.points || []).some((p) => p.family === f));

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-machine">
      <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 8 }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, font: "inherit" }} data-testid="vm-back">
          Equipment
        </button>{" "}
        › {info?.scope || "—"} › <b style={{ color: T.textPrimary }}>{eqId}</b>
      </div>
      <PageHeader
        title={
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {eqId} · {name} {row?.status && <LevelPill level={row.status} testid="vm-status" />}
          </span>
        }
        subtitle={[info?.line, info?.contractor, `${positions.length} points · ${(info?.points || []).length} VIB IDs`, row?.lastDate ? `last measured ${shortDate(row.lastDate)}` : "not measured yet", row?.prevStatus ? `before: ${row.prevStatus}` : ""].filter(Boolean).join(" · ")}
        right={
          <button type="button" style={s.btnPrimary} onClick={onAdd} data-testid="vm-new-reading">
            <i className="ti ti-plus" aria-hidden="true" /> New reading
          </button>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, color: T.danger }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", marginBottom: 14 }} data-testid="vm-points">
        {positions.map((p) => {
          const lv = worstLevel(Object.values(p.fam).map((e) => e?.["Final status"] || ""));
          return (
            <div key={p.pos} style={{ ...s.card, marginBottom: 0, padding: "12px 14px", borderTop: `4px solid ${lv ? levelColor(T, lv) : T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b style={{ color: T.textPrimary }}>{p.name}</b>
                <span style={{ fontSize: 12, color: T.textSecondary }}>{p.pos}</span>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                {["RMS", "SPM", "Gs"].map((f) =>
                  f in p.fam ? (
                    <div key={f}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: T.textMuted }}>{f === "RMS" ? "RMS MAX" : f === "SPM" ? "SPM HDm" : "G's"}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: T.textPrimary }}>{p.fam[f] ? (f === "RMS" ? p.fam[f]["Max velocity (mm/s)"] : f === "SPM" ? p.fam[f]["HDm (dBsv)"] : p.fam[f]["G's (g)"]) ?? "–" : "–"}</div>
                      <div style={{ fontSize: 12, color: T.textSecondary }}>{UNIT[f]}</div>
                      {p.fam[f]?.["Final status"] && <LevelPill level={p.fam[f]["Final status"]} />}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
        {!positions.length && <div style={{ ...s.card, color: T.textSecondary }}>No VIB IDs registered for this machine.</div>}
      </div>
      <TabBar
        value={tab}
        onChange={setTab}
        testid="vm-tabs"
        tabs={[
          { id: "trend", label: "Trend" },
          { id: "readings", label: "Readings", count: entries.length },
          { id: "reports", label: "Reports", count: reports.length },
        ]}
      />
      {!hist && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading readings…</div>}
      {hist && tab === "trend" && (
        <div style={{ ...s.card }} data-testid="vm-trend">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <b style={{ color: T.textPrimary }}>{metric === "RMS" ? "RMS velocity (highest of H / V / A)" : metric === "SPM" ? "SPM HDm" : "G's (PeakVue)"}</b>
            <ContractorChips value={metric} onChange={setMetric} options={families} allLabel={null} label="Measure" size="sm" testid="vm-metric" />
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>{limits ? `Limits ${limits.join(" / ")} ${UNIT[metric]}` : "No limits for G's"}</span>
          </div>
          <TrendChart T={T} series={series} limits={limits} unit={UNIT[metric]} testid="vm-chart" />
          <div style={{ borderTop: `1px solid ${T.border2}`, marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: T.textMuted, marginBottom: 8 }}>REPORT TIMELINE (FINAL STATUS)</div>
            <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 4 }} data-testid="vm-timeline">
              {months.map((m, i) => (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => onOpenReport(m.reportId)}
                  title={`${monthLabel(m.month)}: ${m.worst || "no status"}${m.differs ? " (report differs from limits)" : ""}`}
                  style={{ position: "relative", minWidth: 64, background: "none", border: "none", cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}
                >
                  <span style={{ position: "absolute", top: 12, left: i === 0 ? "50%" : 0, right: i === months.length - 1 ? "50%" : 0, height: 2, background: T.border }} />
                  <span style={{ position: "relative", display: "inline-flex", background: T.cardBg, padding: "0 3px" }}>{m.worst ? <LevelSymbol level={m.worst} size={15} /> : <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${T.textMuted}` }} />}</span>
                  <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>{new Date(m.month + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {hist && tab === "readings" && (
        <div style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vm-readings">
          <table style={s.table}>
            <thead>
              <tr>
                {["Date", "VIB ID", "Point", "H", "V", "A", "HDm", "HDc", "G's", "System", "Report", "Final", "Report"].map((h, i) => (
                  <th key={i} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 400).map((e) => (
                <tr key={(e["Entry ID"] || "") + e["VIB ID"] + e["Measurement date"]}>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>{shortDate(e["Measurement date"])}</td>
                  <td style={{ ...s.td, fontSize: 12, color: T.textSecondary }}>{e["VIB ID"]}</td>
                  <td style={s.td}>{e["Point description"]}</td>
                  {["Horizontal (mm/s)", "Vertical (mm/s)", "Axial (mm/s)", "HDm (dBsv)", "HDc (dBsv)", "G's (g)"].map((k) => (
                    <td key={k} style={{ ...s.td, color: e[k] === "" ? T.textMuted : T.textPrimary }}>
                      {e[k] === "" ? "–" : e[k]}
                    </td>
                  ))}
                  <td style={s.td}>{e["System status"] === "No limits" ? <span style={{ fontSize: 12, color: T.textSecondary }}>No limits</span> : <LevelPill level={e["System status"]} />}</td>
                  <td style={s.td}>
                    <LevelPill level={e["Report status"]} />
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                    <LevelPill level={e["Final status"]} />
                    {e["Report differs"] === "Yes" && <b style={{ color: T.alert, marginLeft: 5 }}>≠</b>}
                  </td>
                  <td style={s.td}>
                    <button type="button" onClick={() => onOpenReport(e["Report ID"])} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 12.5 }}>
                      {e.Month || "open"}
                    </button>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td colSpan={13} style={{ ...s.td, color: T.textSecondary }}>
                    No readings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {hist && tab === "reports" && (
        <div style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vm-reports">
          <table style={s.table}>
            <thead>
              <tr>
                {["Report", "Month", "Readings", "Machine status", ""].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => onOpenReport(r.id)}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{r.id}</td>
                  <td style={s.td}>{monthLabel(r.month)}</td>
                  <td style={s.td}>{r.n}</td>
                  <td style={s.td}>
                    <LevelPill level={r.worst} />
                  </td>
                  <td style={{ ...s.td, color: T.textSecondary }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {today && row?.lastDate && daysBetween(row.lastDate, today) > STALE_DAYS && (
        <div style={{ marginTop: 12 }}>
          <StatePill tone={T.warning}>Not measured for {daysBetween(row.lastDate, today)} days</StatePill>
        </div>
      )}
    </div>
  );
}

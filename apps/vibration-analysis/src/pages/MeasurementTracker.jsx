import { useCallback, useEffect, useMemo, useState } from "react";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import { getVibTracker, peekCached } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import Tile, { PageHeader } from "../components/Tile";
import { StatePill } from "../components/Level";
import { ChipRow, CountChip, PAGE_SIZE, PhoneSummary, ShowMore } from "../components/PhoneParts";
import MeasureCell, { MeasureLegend, STATE_TONE } from "../components/MeasureCell";
import { monthLabel, shortDate } from "../vibModel";

// Measurement Tracker: was every machine measured on time? One row per
// machine, one square per month (backend MeasurementTracker.js): the old
// months from "Equipment Measurement History", later months from the
// readings with each machine's interval + 7 days' grace. Tracked per
// machine, not per report. Tap a machine to open its page.

const AREAS = ["Line 1", "Line 2", "CM#1", "CM#2"];
const STATES = ["Overdue", "Due now", "On time", "Never measured", "Not running"];
const PERIODS = [
  ["12", "Last 12 months", "last 12 months"],
  ["24", "Last 24 months", "last 24 months"],
  ["all", "Since Jan 2023", "since Jan 2023"],
];

function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function rangeOf(period) {
  const to = new Date().toISOString().slice(0, 7);
  return { from: period === "all" ? "2023-01" : addMonths(to, -(+period - 1)), to };
}
const short = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

export default function MeasurementTracker({ webhookUrl, onOpenEquipment }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState("12");
  const [data, setData] = useState(() => peekCached("getVibTracker", rangeOf("12")));
  const [error, setError] = useState("");
  const [contractor, setContractor] = useState("All");
  const [area, setArea] = useState("All");
  const [state, setState] = useState("All");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [chartsOpen, setChartsOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getVibTracker(webhookUrl, rangeOf(period)));
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl, period]);
  useEffect(() => {
    load();
  }, [load]);

  const me = data?.me || {};
  const months = data?.months || [];
  const all = useMemo(() => (data?.machines || []).filter((m) => contractor === "All" || m.contractor === contractor), [data, contractor]);
  const inArea = useMemo(() => all.filter((m) => area === "All" || m.area === area), [all, area]);
  const match = idTextMatch(q, all.map((m) => m.equipmentId));
  const rows = useMemo(
    () =>
      inArea
        .filter((m) => state === "All" || m.state === state)
        .filter((m) => match(m.equipmentId, m.name))
        .sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.equipmentId.localeCompare(b.equipmentId)),
    [inArea, state, q, all]
  );
  const count = (st) => inArea.filter((m) => m.state === st).length;
  const measured = inArea.reduce((n, m) => n + m.measured, 0);
  const missed = inArea.reduce((n, m) => n + m.missed, 0);
  const pct = measured + missed ? Math.round((100 * measured) / (measured + missed)) : null;
  const tone = STATE_TONE(T);
  const contractors = me.contractor ? [me.contractor] : ["RHI", "ASEC"];
  const periodLabel = PERIODS.find((p) => p[0] === period)?.[2];

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-tracker">
      <PageHeader
        title="Measurement Tracker"
        subtitle={
          data
            ? `${inArea.length} machines · ${count("Overdue")} overdue · ${count("Due now")} due now · ${pct != null ? `${pct}% of months measured` : "no months yet"} (${periodLabel})`
            : "Loading…"
        }
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={contractors} testid="vt-contractor" />
            <select style={s.select} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period" data-testid="vt-period">
              {PERIODS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          Couldn't load the tracker: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {data && (
        <>
          {isMobile && (
            <PhoneSummary open={chartsOpen} onToggle={() => setChartsOpen((v) => !v)} testid="vt-summary">
              <span style={{ color: count("Overdue") ? T.danger : T.textPrimary, fontWeight: 700 }}>{count("Overdue")} overdue</span>
              <span style={{ color: T.textSecondary }}>{count("Due now")} due now</span>
              {pct != null && <span style={{ color: T.textSecondary }}>{pct}% measured</span>}
            </PhoneSummary>
          )}
          {(!isMobile || chartsOpen) && (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", marginBottom: 14 }}>
              <Tile icon="ti-alert-triangle" value={count("Overdue")} label="Overdue machines" sub={`Past interval + ${data.graceDays} days`} tone={count("Overdue") ? T.danger : undefined} onClick={() => setState("Overdue")} testid="vt-tile-overdue" />
              <Tile icon="ti-clock" value={count("Due now")} label="Due now" sub={`Within ${data.graceDays} days of the due date`} tone={count("Due now") ? T.warning : undefined} onClick={() => setState("Due now")} testid="vt-tile-due" />
              <Tile icon="ti-circle-check" value={pct != null ? `${pct}%` : "—"} label="Months measured" sub={`${measured} of ${measured + missed} · ${periodLabel}`} testid="vt-tile-pct" />
              <Tile icon="ti-player-pause" value={count("Never measured") + count("Not running")} label="Never measured / not running" sub={`${count("Never measured")} never · ${count("Not running")} not running`} onClick={() => setState("Never measured")} testid="vt-tile-other" />
            </div>
          )}

          <ChipRow label="Area">
            {["All", ...AREAS].map((a) => (
              <CountChip key={a} on={area === a} onClick={() => { setArea(a); setLimit(PAGE_SIZE); }} count={a === "All" ? all.length : all.filter((m) => m.area === a).length} testid={`vt-area-${a}`}>
                {a === "All" ? "All areas" : a}
              </CountChip>
            ))}
          </ChipRow>
          <ChipRow label="Where each machine stands">
            {["All", ...STATES].map((st) => (
              <CountChip key={st} on={state === st} onClick={() => { setState(st); setLimit(PAGE_SIZE); }} count={st === "All" ? inArea.length : count(st)} color={st === "All" ? undefined : tone[st]} testid={`vt-state-${st}`}>
                {st === "All" ? "All" : st}
              </CountChip>
            ))}
          </ChipRow>
          <div style={{ marginBottom: 12 }}>
            <EquipmentSearch freeText options={inArea.map((m) => ({ code: m.equipmentId, description: m.name }))} value={q} onChange={(v) => { setQ(v); setLimit(PAGE_SIZE); }} placeholder="Equipment ID or name…" ariaLabel="Search machines" width={isMobile ? "100%" : 320} testid="vt-search" />
          </div>

          {isMobile ? (
            <div data-testid="vt-cards">
              {rows.slice(0, limit).map((m) => (
                <button key={m.equipmentId} type="button" onClick={() => onOpenEquipment(m.equipmentId)} data-testid="vt-row" style={{ ...s.card, display: "block", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer", padding: 12, marginBottom: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b style={{ color: T.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}>{m.equipmentId}</b>
                    <span style={{ color: T.textSecondary, fontSize: 12.5 }}>{m.area}</span>
                    <span style={{ marginLeft: "auto" }}>
                      <StatePill tone={tone[m.state]}>{m.state}</StatePill>
                    </span>
                  </span>
                  <span style={{ display: "block", color: T.textSecondary, fontSize: 12.5, margin: "3px 0 8px" }}>
                    {[m.name, `last ${m.lastMeasured ? shortDate(m.lastMeasured) : "never"}`, m.nextDue ? `due ${shortDate(m.nextDue)}` : ""].filter(Boolean).join(" · ")}
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    {months.slice(-6).map((mo) => (
                      <span key={mo} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10.5, color: T.textSecondary }}>
                        <MeasureCell c={m.cells[mo]} month={mo} size={24} />
                        {short(mo).split(" ")[0]}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
              <ShowMore shown={limit} total={rows.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} testid="vt-more" />
            </div>
          ) : (
            <div style={{ ...s.card, padding: 0, overflow: "auto", maxHeight: "70vh" }} data-testid="vt-grid">
              <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
                <thead>
                  <tr>
                    {["Machine", "Area", "Where it stands", "Last measured", "Next due", "Months measured"].map((h, i) => (
                      <th key={h} style={{ ...s.th, position: "sticky", top: 0, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 3 : 2, background: T.cardBg, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                    {months.map((mo) => (
                      <th key={mo} style={{ ...s.th, position: "sticky", top: 0, zIndex: 2, background: T.cardBg, padding: "8px 2px", fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }}>
                        {short(mo)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((m) => (
                    <tr key={m.equipmentId} data-testid="vt-row" onClick={() => onOpenEquipment(m.equipmentId)} style={{ cursor: "pointer" }}>
                      <td style={{ ...s.td, position: "sticky", left: 0, background: T.cardBg, zIndex: 1, whiteSpace: "nowrap" }}>
                        <b style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.textPrimary }}>{m.equipmentId}</b>
                        <span style={{ display: "block", fontSize: 11.5, color: T.textSecondary, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                      </td>
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{m.area || "—"}</td>
                      <td style={s.td}>
                        <StatePill tone={tone[m.state]}>{m.state}</StatePill>
                      </td>
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{m.lastMeasured ? shortDate(m.lastMeasured) : "—"}</td>
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>{m.nextDue ? shortDate(m.nextDue) : "—"}</td>
                      <td style={{ ...s.td, whiteSpace: "nowrap", color: T.textSecondary }}>{m.onTimePct != null ? `${m.onTimePct}%` : "—"}</td>
                      {months.map((mo) => (
                        <td key={mo} style={{ ...s.td, padding: "6px 2px", textAlign: "center" }}>
                          <MeasureCell c={m.cells[mo]} month={mo} size={period === "all" ? 16 : 22} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td style={{ ...s.td, color: T.textSecondary }} colSpan={6 + months.length}>
                        No machines match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ padding: "0 12px" }}>
                <ShowMore shown={limit} total={rows.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} testid="vt-more" />
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <MeasureLegend />
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "8px 0 0" }}>
              Each machine is due its interval (Limits page, default {data.defaultInterval} days) after its last measurement, with {data.graceDays} days' grace.
              {data.histEnd ? ` Up to ${monthLabel(data.histEnd)} the months come from the old Compliance Tracker and the old readings.` : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

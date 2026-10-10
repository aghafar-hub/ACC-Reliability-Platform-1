import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibActions, getVibDashboard, getVibLog, getVibRoutes, getVibTracker, peekCached } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import { PageHeader } from "../components/Tile";
import { LEVELS, levelColor } from "../levels";
import { ACTIVITY_SECTION, OPEN_ACTIONS, READY_MADE, actionCounts, conditionCounts, measuringCounts, monthActivity, notReadMonths, periodMonths } from "../vibReportData";
import VibNewReport from "./VibNewReport";

// Vibration Reports — the Oil Reports page for this module (same parts,
// same colour rules): "New Report" builds any mix of sections into one
// PDF or Excel workbook (VibNewReport.jsx), and four ready-made reports
// show a live preview of what they'll contain. Everything is made in the
// browser from the answers the other pages use — nothing is saved or sent.
// The PDF / Excel code (vibReports.js) loads only when someone downloads.

const gen = () => import("../vibReports");
const READY_MONTHS = 12;
const thisMonth = () => new Date().toISOString().slice(0, 7);

function SplitBar({ T, parts, testid }) {
  const sum = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div data-testid={testid}>
      <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 6, overflow: "hidden", background: `${T.textMuted || T.textSecondary}33` }}>
        {parts.map((p) => (p.value > 0 ? <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / Math.max(1, sum)) * 100}%`, background: p.color }} /> : null))}
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

function ReportCard({ T, s, icon, iconColor, title, description, contents, children, busy, disabled, onGenerate, extraControls, secondaryLabel, secondaryIcon, onSecondaryAction, testid }) {
  const c = T[iconColor] || T.accent;
  return (
    <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 14, marginBottom: 0, borderTop: `3px solid ${c}`, minWidth: 0 }} data-testid={testid}>
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
        <button style={{ ...s.btnPrimary, opacity: disabled ? 0.6 : 1 }} onClick={onGenerate} disabled={busy || disabled} data-testid={testid ? `${testid}-pdf` : undefined}>
          <i className={`ti ${busy ? "ti-loader" : "ti-download"}`} aria-hidden="true" /> {busy ? "Generating…" : "Download PDF"}
        </button>
        {onSecondaryAction && (
          <button style={s.btn} onClick={onSecondaryAction} disabled={busy || disabled} data-testid={testid ? `${testid}-secondary` : undefined}>
            <i className={`ti ${secondaryIcon || "ti-file-spreadsheet"}`} aria-hidden="true" /> {secondaryLabel || "Excel"}
          </button>
        )}
      </div>
    </div>
  );
}

function NewReportCard({ T, s, onClick, disabled }) {
  const steps = ["Pick topics — condition, measuring, survey reports, actions, routes", "Choose a contractor or both, and the period", "One PDF with charts, or a data-only Excel workbook"];
  return (
    <div style={{ ...s.card, marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", background: `linear-gradient(120deg, ${T.accent}14, ${T.cardBg} 60%)`, border: `1px solid ${T.accent}44` }} data-testid="vib-report-new">
      <div style={{ width: 48, height: 48, borderRadius: 13, background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
      </div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>New Report</div>
        <div style={{ fontSize: 12.5, color: T.textSecondary }}>Combine any topics into one PDF or Excel workbook</div>
      </div>
      <ol style={{ display: "flex", gap: 14, flexWrap: "wrap", listStyle: "none", padding: 0, margin: 0, flex: "2 1 420px" }}>
        {steps.map((text, i) => (
          <li key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.textSecondary, flex: "1 1 180px" }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${T.accent}`, color: T.accent, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      <button style={{ ...s.btnPrimary, opacity: disabled ? 0.6 : 1 }} onClick={onClick} disabled={disabled} data-testid="vib-report-build">
        <i className="ti ti-arrow-right" aria-hidden="true" /> Build Report
      </button>
    </div>
  );
}

// the answers every report reads; each starts from the copy kept on this device
const SOURCES = [
  { key: "dashboard", label: "Dashboard", cached: () => peekCached("getVibDashboard"), load: (u) => getVibDashboard(u) },
  { key: "tracker", label: "Measurement Tracker", cached: () => peekCached("getVibTracker", {}), load: (u) => getVibTracker(u, {}) },
  { key: "actions", label: "Actions", cached: () => peekCached("getVibActions"), load: (u) => getVibActions(u) },
  { key: "log", label: "Vibration Log", cached: () => peekCached("getVibLog"), load: (u) => getVibLog(u) },
  { key: "routes", label: "Routes", cached: () => peekCached("getVibRoutes", { days: "30" }), load: (u) => getVibRoutes(u, 30) },
];

export default function VibReports({ webhookUrl }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [view, setView] = useState("landing");
  const [data, setData] = useState(() => Object.fromEntries(SOURCES.map((x) => [x.key, x.cached() || null])));
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contractor, setContractor] = useState("All");
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await Promise.allSettled(SOURCES.map((x) => x.load(webhookUrl)));
    const next = {};
    const bad = [];
    res.forEach((r, i) => {
      const ok = r.status === "fulfilled" && r.value && r.value.status !== "error";
      if (ok) next[SOURCES[i].key] = r.value;
      else bad.push(SOURCES[i].label);
    });
    setData((d) => ({ ...d, ...next }));
    setFailed(bad);
    setLoading(false);
  }, [webhookUrl]);
  useEffect(() => {
    load();
  }, [load]);

  // a contractor account only ever sees its own
  const mine = data.dashboard?.me?.contractor || data.tracker?.me?.contractor || data.log?.me?.contractor || "";
  const who = mine || contractor;
  const today = data.dashboard?.today || data.actions?.today || new Date().toISOString().slice(0, 10);
  const ready = !!(data.dashboard || data.tracker || data.actions || data.log);

  const acts = useMemo(() => actionCounts(data.actions, who), [data.actions, who]);
  const meas = useMemo(() => measuringCounts(data.tracker, who), [data.tracker, who]);
  const cond = useMemo(() => conditionCounts(data.dashboard, who), [data.dashboard, who]);
  const activity = useMemo(() => monthActivity(data, who, month), [data, who, month]);

  const ctx = (extra) => ({ contractor: who, months: periodMonths(today, READY_MONTHS), today, ...extra });
  async function readyMade(kind, format = "pdf") {
    setBusy(kind + format);
    try {
      const g = await gen();
      if (kind === "activity") {
        if (format === "csv") g.exportActivityCsv({ data, ctx: ctx({ month }) });
        else await g.generateVibReportsPdf({ title: "Vibration — Monthly Activity Summary", extra: [ACTIVITY_SECTION], data, ctx: ctx({ month }), fileName: `Vibration-Activity-${month}` });
        return;
      }
      const r = READY_MADE[kind];
      const args = { title: `Vibration — ${r.title}`, sectionIds: r.sectionIds, data, ctx: ctx({ snapshot: !!r.snapshot }), fileName: `Vibration-${r.title.replace(/[^A-Za-z]+/g, "-").replace(/-$/, "")}` };
      if (format === "excel") await g.generateVibReportsExcel(args);
      else await g.generateVibReportsPdf(args);
    } finally {
      setBusy(null);
    }
  }

  const wrap = { padding: isMobile ? "14px 12px" : "20px 24px" };
  if (view === "new") {
    return (
      <div style={wrap}>
        <VibNewReport data={data} lockedContractor={mine} today={today} loading={loading} failed={failed} onCancel={() => setView("landing")} />
      </div>
    );
  }

  const stageColor = { Draft: T.warning, Open: T.danger, "Waiting Stoppage": T.accent, "Closure Requested": T.info };
  return (
    <div style={wrap} data-testid="vib-reports">
      <PageHeader
        big
        title="Vibration Reports"
        subtitle="Clean, printable PDFs and Excel workbooks straight from the current data — nothing is saved or sent anywhere."
        right={!mine && <ContractorChips value={contractor} onChange={setContractor} testid="vib-reports-contractor" />}
      />

      {failed.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: T.danger + "12", border: `1px solid ${T.danger}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: T.textPrimary }} data-testid="vib-reports-failed">
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger }} />
          <span style={{ flex: 1 }}>Couldn't load: {failed.join(", ")}. Reports use what did load.</span>
          <button style={s.btn} onClick={load}>Retry</button>
        </div>
      )}

      <NewReportCard T={T} s={s} onClick={() => setView("new")} disabled={!ready} />

      <p style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, margin: "0 0 10px" }}>
        Ready-made reports {loading && <span style={{ fontWeight: 400, color: T.textSecondary }}>· updating…</span>}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
        <ReportCard
          T={T} s={s} icon="ti-clipboard-list" iconColor="danger" title="Contractor Action Status"
          description="Every vibration action not yet closed, by stage"
          contents="open actions by stage with severity, owner and age; then the ones past due or without an owner"
          busy={busy?.startsWith("action")} disabled={!data.actions}
          onGenerate={() => readyMade("action")} onSecondaryAction={() => readyMade("action", "excel")}
          testid="vib-report-action"
        >
          <SplitBar T={T} testid="vib-report-action-bar" parts={OPEN_ACTIONS.map((st) => ({ label: st === "Waiting Stoppage" ? "Waiting stoppage" : st === "Closure Requested" ? "Closure requested" : st, value: acts[st] || 0, color: stageColor[st] }))} />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-calendar-exclamation" iconColor="warning" title="Measurement Overdue / Missed"
          description="Machines past their reading interval, and on-time % per contractor"
          contents="each overdue or never-measured machine with its interval, last reading and days late; on-time % for the last 12 months"
          busy={busy?.startsWith("measuring")} disabled={!data.tracker}
          onGenerate={() => readyMade("measuring")} onSecondaryAction={() => readyMade("measuring", "excel")}
          testid="vib-report-measuring"
        >
          <SplitBar
            T={T}
            testid="vib-report-measuring-bar"
            parts={[
              { label: "Overdue", value: meas.Overdue, color: T.danger },
              { label: "Never measured", value: meas["Never measured"], color: T.purple },
              { label: "Due now", value: meas["Due now"], color: T.warning },
              { label: "On time", value: meas["On time"], color: T.success },
            ]}
          />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-activity-heartbeat" iconColor="accent" title="Machines in Alert / Danger"
          description="Condition by area, and the machines that need attention"
          contents="condition per area; every Alert / Danger machine with its worst point, previous status and open action"
          busy={busy?.startsWith("condition")} disabled={!data.dashboard}
          onGenerate={() => readyMade("condition")} onSecondaryAction={() => readyMade("condition", "excel")}
          testid="vib-report-condition"
        >
          <SplitBar
            T={T}
            testid="vib-report-condition-bar"
            parts={[...LEVELS.map((lv) => ({ label: lv, value: cond[lv] || 0, color: levelColor(T, lv) })), { label: `Not read ${notReadMonths(data.dashboard)} m`, value: cond["Not read"] || 0, color: `${T.textMuted || T.textSecondary}66` }]}
          />
        </ReportCard>

        <ReportCard
          T={T} s={s} icon="ti-calendar-stats" iconColor="success" title="Monthly Activity Summary"
          description="What actually got done in a month — not a snapshot of today"
          contents="machines measured, survey reports approved, actions opened and closed, item by item"
          extraControls={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary }} htmlFor="vib-report-month">Month</label>
              <input id="vib-report-month" type="month" style={{ ...s.input, maxWidth: 180 }} value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} data-testid="vib-report-month" />
            </div>
          }
          busy={busy?.startsWith("activity")} disabled={!ready}
          onGenerate={() => readyMade("activity")} secondaryLabel="Export CSV" secondaryIcon="ti-table-export" onSecondaryAction={() => readyMade("activity", "csv")}
          testid="vib-report-activity"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }} data-testid="vib-report-activity-kpis">
            {[
              { icon: "ti-wave-sine", label: "Machines measured", value: activity.machinesMeasured.length, color: T.accent },
              { icon: "ti-file-check", label: "Reports approved", value: activity.approved.length, color: T.info },
              { icon: "ti-alert-circle", label: "Actions opened", value: activity.opened.length, color: T.warning },
              { icon: "ti-circle-check", label: "Actions closed", value: activity.closed.length, color: T.success },
            ].map((k) => (
              <div key={k.label} style={{ textAlign: "center", minWidth: 0 }}>
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

import { LEVEL_RANK, LEVELS } from "./levels";
import { monthLabel, shortDate } from "./vibModel";

// Vibration Reports — what every report section shows, worked out from the
// answers the pages already load (getVibDashboard, getVibTracker,
// getVibActions, getVibLog, getVibRoutes). No PDF / Excel code here, so the
// Reports page can draw its previews without loading those libraries;
// vibReports.js turns the same sections into a PDF or an Excel workbook
// (the Oil module's reportGenerators.js pattern: one list drives both).

export const NOT_READ_MONTHS = 3; // same as the Dashboard
export const OPEN_ACTIONS = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];
export const OPEN_ROUTES = ["Unassigned", "Assigned", "In Progress", "Submitted", "Returned"];
export const PERIODS = [3, 6, 12];

const day = (v) => String(v || "").slice(0, 10);
const daysBetween = (a, b) => (a && b ? Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000) : null);
const unitOf = (f) => (f === "RMS" ? "mm/s" : f === "SPM" ? "dBsv" : "g");
export const addMonths = (m, n) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// the last n months up to and including this one
export function periodMonths(today, n) {
  const end = String(today || new Date().toISOString()).slice(0, 7);
  return Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
}
export const periodLabel = (months) => (months.length ? `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}` : "");

// ── shared filters ─────────────────────────────────────────────────────────
const inC = (contractor) => (x) => contractor === "All" || x === contractor;

// Machines with their condition ("Not read" when no report in the last 3 months).
export function conditionMachines(d, contractor) {
  if (!d?.machines) return [];
  const cutoff = d.months?.length >= NOT_READ_MONTHS ? d.months[d.months.length - NOT_READ_MONTHS] : "";
  return d.machines
    .filter((m) => inC(contractor)(m.contractor))
    .map((m) => ({ ...m, cond: !m.lastMonth || m.lastMonth < cutoff ? "Not read" : m.status || "Not read" }));
}
export function conditionCounts(d, contractor) {
  const ms = conditionMachines(d, contractor);
  const out = { total: ms.length, "Not read": 0 };
  LEVELS.forEach((lv) => (out[lv] = 0));
  ms.forEach((m) => (out[m.cond] = (out[m.cond] || 0) + 1));
  return out;
}

export function trackerMachines(t, contractor) {
  return (t?.machines || []).filter((m) => !m.inactive && inC(contractor)(m.contractor));
}
export function measuringCounts(t, contractor) {
  const out = { Overdue: 0, "Due now": 0, "Never measured": 0, "On time": 0 };
  trackerMachines(t, contractor).forEach((m) => (out[m.state] = (out[m.state] || 0) + 1));
  return out;
}

export function contractorActions(a, contractor) {
  return (a?.actions || []).filter((x) => inC(contractor)(x.Contractor));
}
export function actionCounts(a, contractor) {
  const open = contractorActions(a, contractor).filter((x) => OPEN_ACTIONS.includes(x.Status));
  const out = {};
  OPEN_ACTIONS.forEach((st) => (out[st] = open.filter((x) => x.Status === st).length));
  return out;
}

// What got done in one month ("YYYY-MM").
export function monthActivity(data, contractor, month) {
  const t = data.tracker;
  const machinesMeasured = trackerMachines(t, contractor).filter((m) => m.cells?.[month]?.r === "Measured");
  const reports = (data.log?.reports || []).filter((r) => inC(contractor)(r.Contractor) && r.Month === month);
  const acts = contractorActions(data.actions, contractor);
  const opened = acts.filter((x) => day(x["Created at"]).slice(0, 7) === month);
  const closed = acts.filter((x) => x.Status === "Closed" && day(x["Closed at"]).slice(0, 7) === month);
  return { machinesMeasured, reports, opened, closed, approved: reports.filter((r) => r["Workflow status"] === "Approved") };
}

// ── sections: id, group, label, and the table each one makes ──────────────
// table(data, ctx) → { header, rows, levelCols?, note?, stats?, chart? }
//   ctx: { contractor, months (the period), month (one month), today }

export const REPORT_GROUPS = [
  { id: "condition", label: "Machine Condition", icon: "ti-activity-heartbeat", iconColor: "accent" },
  { id: "measuring", label: "Measurement Coverage", icon: "ti-calendar-check", iconColor: "success" },
  { id: "reports", label: "Survey Reports", icon: "ti-file-analytics", iconColor: "warning" },
  { id: "actions", label: "Actions", icon: "ti-checklist", iconColor: "danger" },
  { id: "routes", label: "Routes & Follow-ups", icon: "ti-route", iconColor: "info" },
];

function condSummary(data, { contractor }) {
  const ms = conditionMachines(data.dashboard, contractor);
  const areas = [...new Set(ms.map((m) => m.area || "Other"))].sort();
  const cols = [...LEVELS, "Not read"];
  const rows = areas.map((a) => {
    const in_ = ms.filter((m) => (m.area || "Other") === a);
    return [a, in_.length, ...cols.map((c) => in_.filter((m) => m.cond === c).length)];
  });
  const c = conditionCounts(data.dashboard, contractor);
  rows.push(["Total", c.total, ...cols.map((x) => c[x] || 0)]);
  return {
    header: ["Area", "Machines", ...cols],
    rows,
    stats: [{ label: "Machines", value: c.total }, ...cols.map((x) => ({ label: x, value: c[x] || 0, level: x }))],
    chart: { kind: "stack", parts: cols.map((x) => ({ label: x, value: c[x] || 0, level: x })) },
    note: `Condition = the worst final status of each machine's latest report. "Not read" = no report in the last ${NOT_READ_MONTHS} months.`,
  };
}

function openActionFor(data) {
  const by = {};
  (data.actions?.actions || []).forEach((a) => {
    if (OPEN_ACTIONS.includes(a.Status) && !by[a["Equipment ID"]]) by[a["Equipment ID"]] = a;
  });
  return by;
}

function condAttention(data, { contractor }) {
  const act = openActionFor(data);
  const ms = conditionMachines(data.dashboard, contractor)
    .filter((m) => (LEVEL_RANK[m.cond] || 0) >= 3)
    .sort((a, b) => (LEVEL_RANK[b.cond] || 0) - (LEVEL_RANK[a.cond] || 0) || (b.worstPoint?.ratio || 0) - (a.worstPoint?.ratio || 0));
  return {
    header: ["Machine", "Name", "Area", "Contractor", "Status", "Previous", "Worst point", "Value", "Last read", "Open action"],
    rows: ms.map((m) => [
      m.equipmentId,
      m.name,
      m.area,
      m.contractor,
      m.cond,
      m.prevStatus || "—",
      m.worstPoint?.point || "",
      m.worstPoint?.value != null ? `${m.worstPoint.value} ${unitOf(m.worstPoint.family)}` : "",
      shortDate(m.lastDate),
      act[m.equipmentId] ? `${act[m.equipmentId]["Action ID"]} (${act[m.equipmentId].Status})` : "None",
    ]),
    levelCols: [4, 5],
    empty: "No machine at Alert or Danger.",
  };
}

function condChanges(data, { contractor }) {
  const ms = conditionMachines(data.dashboard, contractor).filter((m) => m.cond !== "Not read" && m.prevStatus && m.prevStatus !== m.status);
  const rows = ms
    .map((m) => ({ m, diff: (LEVEL_RANK[m.status] || 0) - (LEVEL_RANK[m.prevStatus] || 0) }))
    .sort((a, b) => b.diff - a.diff || a.m.equipmentId.localeCompare(b.m.equipmentId))
    .map(({ m, diff }) => [m.equipmentId, m.name, m.area, m.contractor, m.prevStatus, m.status, diff > 0 ? "Worse" : "Better", monthLabel(m.lastMonth)]);
  return {
    header: ["Machine", "Name", "Area", "Contractor", "Before", "Now", "Change", "Latest report"],
    rows,
    levelCols: [4, 5],
    empty: "No machine changed status in its latest report.",
  };
}

function measOverdue(data, { contractor, today }) {
  const order = { Overdue: 0, "Never measured": 1, "Due now": 2 };
  const ms = trackerMachines(data.tracker, contractor)
    .filter((m) => m.state in order)
    .sort((a, b) => order[a.state] - order[b.state] || String(a.nextDue).localeCompare(String(b.nextDue)));
  return {
    header: ["Machine", "Name", "Area", "Contractor", "State", "Every (days)", "Last measured", "Next due", "Days late"],
    rows: ms.map((m) => {
      const late = m.nextDue ? daysBetween(m.nextDue, today) : null;
      return [m.equipmentId, m.name, m.area, m.contractor, m.state, m.interval, m.lastMeasured ? shortDate(m.lastMeasured) : "Never", m.nextDue ? shortDate(m.nextDue) : "—", late > 0 ? late : ""];
    }),
    stateCol: 4,
    empty: "Every machine is measured on time.",
    note: `Due now = within the ${data.tracker?.graceDays ?? 7}-day grace either side of the due date; Overdue = past it.`,
  };
}

function cover(cells, months) {
  let measured = 0;
  let missed = 0;
  months.forEach((mo) => {
    const r = cells?.[mo]?.r;
    if (r === "Measured") measured++;
    else if (r === "Missed") missed++;
  });
  return { measured, missed };
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

function measCoverage(data, { contractor, months }) {
  const ms = trackerMachines(data.tracker, contractor);
  const areas = [...new Set(ms.map((m) => m.area || "Other"))].sort();
  const rows = areas.map((a) => {
    const in_ = ms.filter((m) => (m.area || "Other") === a);
    return [
      a,
      ...months.map((mo) => {
        const c = in_.reduce((acc, m) => { const x = cover(m.cells, [mo]); return { measured: acc.measured + x.measured, missed: acc.missed + x.missed }; }, { measured: 0, missed: 0 });
        const p = pct(c.measured, c.measured + c.missed);
        return p == null ? "–" : `${p} %`;
      }),
    ];
  });
  return {
    header: ["Area", ...months.map((m) => monthLabel(m).replace(/ 20(\d\d)$/, " $1"))],
    rows,
    pctCells: true,
    empty: "No machines measured in the period.",
    note: "Share of the machines that were due that month and got measured (90 % or more green, 70–89 % amber, under 70 % red).",
  };
}

function measOnTime(data, { contractor, months }) {
  const ms = trackerMachines(data.tracker, contractor);
  const cs = [...new Set(ms.map((m) => m.contractor))].sort();
  const rows = cs.map((c) => {
    const x = ms.filter((m) => m.contractor === c).reduce((acc, m) => { const y = cover(m.cells, months); return { measured: acc.measured + y.measured, missed: acc.missed + y.missed }; }, { measured: 0, missed: 0 });
    const p = pct(x.measured, x.measured + x.missed);
    return [c, ms.filter((m) => m.contractor === c).length, x.measured, x.missed, p == null ? "–" : `${p} %`];
  });
  return {
    header: ["Contractor", "Machines", "Machine-months measured", "Missed", "On time"],
    rows,
    chart: { kind: "bars", parts: rows.map((r) => ({ label: r[0], value: parseInt(r[4], 10) || 0, suffix: " %" })) },
    empty: "No machines in the period.",
  };
}

function repList(data, { contractor, months }) {
  const reps = (data.log?.reports || [])
    .filter((r) => inC(contractor)(r.Contractor) && months.includes(r.Month))
    .sort((a, b) => String(b.Month).localeCompare(String(a.Month)) || String(a.Contractor).localeCompare(String(b.Contractor)));
  return {
    header: ["Report", "Month", "Contractor", "Scope", "Workflow", "Received", "Machines read", ...LEVELS],
    rows: reps.map((r) => [
      r["Report ID"],
      monthLabel(r.Month),
      r.Contractor,
      r["Report scope"],
      r["Workflow status"],
      r["Received date"] ? shortDate(r["Received date"]) : r["Report status"] || "",
      `${r["Equipment with readings"] || 0} / ${r["Equipment in scope"] || 0}`,
      ...LEVELS.map((lv) => r[lv] || 0),
    ]),
    empty: "No survey reports in the period.",
  };
}

function repPending(data, { contractor, today }) {
  const reps = (data.log?.reports || []).filter(
    (r) => inC(contractor)(r.Contractor) && !["Approved", "Historic"].includes(r["Workflow status"]) && r["Report status"] !== "Skipped"
  );
  return {
    header: ["Report", "Month", "Contractor", "Scope", "Workflow", "Report status", "Due", "Days past due"],
    rows: reps
      .sort((a, b) => String(a["Due date"]).localeCompare(String(b["Due date"])))
      .map((r) => {
        const late = r["Due date"] && !r["Received date"] ? daysBetween(r["Due date"], today) : null;
        return [r["Report ID"], monthLabel(r.Month), r.Contractor, r["Report scope"], r["Workflow status"], r["Report status"], r["Due date"] ? shortDate(r["Due date"]) : "", late > 0 ? late : ""];
      }),
    empty: "Every survey report is approved.",
  };
}

function actOpen(data, { contractor, today }) {
  const acts = contractorActions(data.actions, contractor)
    .filter((x) => OPEN_ACTIONS.includes(x.Status))
    .sort((a, b) => OPEN_ACTIONS.indexOf(a.Status) - OPEN_ACTIONS.indexOf(b.Status) || (LEVEL_RANK[b.Severity] || 0) - (LEVEL_RANK[a.Severity] || 0));
  const c = actionCounts(data.actions, contractor);
  return {
    header: ["Action", "Machine", "Contractor", "Stage", "Severity", "Priority", "Owner", "Due", "Age (days)", "Agreed action"],
    rows: acts.map((a) => [
      a["Action ID"],
      `${a["Equipment ID"]}${a["Equipment name"] ? ` — ${a["Equipment name"]}` : ""}`,
      a.Contractor,
      a.Status,
      a.Severity,
      a.Priority,
      a.Owner || "No owner",
      a["Due date"] ? shortDate(a["Due date"]) : "",
      daysBetween(day(a["Created at"]), today) ?? "",
      a["Agreed action"] || a["Contractor recommendation"] || "",
    ]),
    levelCols: [4],
    stats: OPEN_ACTIONS.map((st) => ({ label: st, value: c[st] })),
    chart: { kind: "stack", parts: OPEN_ACTIONS.map((st, i) => ({ label: st, value: c[st], tone: ["warning", "danger", "accent", "info"][i] })) },
    empty: "No open actions.",
  };
}

function actLate(data, { contractor, today }) {
  const acts = contractorActions(data.actions, contractor).filter(
    (a) => OPEN_ACTIONS.includes(a.Status) && ((["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today) || !a.Owner)
  );
  return {
    header: ["Action", "Machine", "Contractor", "Stage", "Severity", "Owner", "Due", "Days past due"],
    rows: acts.map((a) => {
      const late = a["Due date"] ? daysBetween(a["Due date"], today) : null;
      return [a["Action ID"], a["Equipment ID"], a.Contractor, a.Status, a.Severity, a.Owner || "No owner", a["Due date"] ? shortDate(a["Due date"]) : "", late > 0 ? late : ""];
    }),
    levelCols: [4],
    empty: "No action is past due or without an owner.",
  };
}

function actClosed(data, { contractor, months }) {
  const acts = contractorActions(data.actions, contractor).filter((a) => a.Status === "Closed" && months.includes(day(a["Closed at"]).slice(0, 7)));
  return {
    header: ["Action", "Machine", "Contractor", "Severity", "Opened", "Closed", "Days open", "Closed by", "Closure comment"],
    rows: acts
      .sort((a, b) => day(b["Closed at"]).localeCompare(day(a["Closed at"])))
      .map((a) => [a["Action ID"], a["Equipment ID"], a.Contractor, a.Severity, shortDate(day(a["Created at"])), shortDate(day(a["Closed at"])), daysBetween(day(a["Created at"]), day(a["Closed at"])) ?? "", a["Closed by"], a["Closure comment"]]),
    levelCols: [3],
    empty: "No actions closed in the period.",
  };
}

function routesOpen(data, { contractor }) {
  const rs = (data.routes?.routes || []).filter((r) => inC(contractor)(r.Contractor) && OPEN_ROUTES.includes(r.Status));
  return {
    header: ["Route", "Name", "Contractor", "Type", "Status", "Planned", "Technician", "Points done"],
    rows: rs
      .sort((a, b) => String(a["Planned date"]).localeCompare(String(b["Planned date"])))
      .map((r) => [r["Route ID"], r.Name, r.Contractor, r.Type, r.Status, r["Planned date"] ? shortDate(day(r["Planned date"])) : "", r.Technician || "Not assigned", `${r["Points done"] || 0} / ${r.Points || 0}`]),
    empty: "No open routes.",
  };
}

function routesFollowUps(data, { contractor }) {
  const ss = (data.routes?.suggestions || []).filter((x) => x.type === "Follow-up" && inC(contractor)(x.contractor));
  return {
    header: ["Machine", "Name", "Contractor", "Reason", "Due", "Priority", "Overdue"],
    rows: ss
      .sort((a, b) => String(a.due).localeCompare(String(b.due)))
      .map((x) => [x.equipmentId, x.name, x.contractor, x.reason, shortDate(x.due), x.priority, x.overdue ? "Yes" : ""]),
    empty: "No follow-up readings due in the next 30 days.",
  };
}

// one month's work: used by the Monthly Activity Summary card
function activityMonth(data, { contractor, month }) {
  const x = monthActivity(data, contractor, month);
  const rows = [
    ...x.machinesMeasured.map((m) => ["Machine measured", m.equipmentId, m.name, m.contractor, shortDate(m.cells[month].last || m.cells[month].first || "")]),
    ...x.approved.map((r) => ["Survey report approved", r["Report ID"], `${r["Report scope"]} · ${monthLabel(r.Month)}`, r.Contractor, r["Reviewed at"] ? shortDate(day(r["Reviewed at"])) : ""]),
    ...x.opened.map((a) => ["Action opened", a["Action ID"], a["Equipment ID"], a.Contractor, shortDate(day(a["Created at"]))]),
    ...x.closed.map((a) => ["Action closed", a["Action ID"], a["Equipment ID"], a.Contractor, shortDate(day(a["Closed at"]))]),
  ];
  return {
    header: ["What", "ID", "Details", "Contractor", "Date"],
    rows,
    stats: [
      { label: "Machines measured", value: x.machinesMeasured.length },
      { label: "Reports approved", value: x.approved.length },
      { label: "Actions opened", value: x.opened.length },
      { label: "Actions closed", value: x.closed.length },
    ],
    empty: "Nothing recorded in this month.",
  };
}

export const REPORT_SECTIONS = [
  { id: "cond-summary", group: "condition", label: "Condition by Area", pdfTitle: "Machine Condition by Area", table: condSummary },
  { id: "cond-attention", group: "condition", label: "Machines in Alert / Danger", pdfTitle: "Machines in Alert / Danger", table: condAttention },
  { id: "cond-changes", group: "condition", label: "Status Changes", pdfTitle: "Status Changes in the Latest Report", table: condChanges },

  { id: "meas-overdue", group: "measuring", label: "Overdue / Never Measured", pdfTitle: "Machines Overdue or Never Measured", table: measOverdue },
  { id: "meas-coverage", group: "measuring", label: "Coverage by Area", pdfTitle: "Machines Measured per Area per Month", table: measCoverage, landscape: true },
  { id: "meas-ontime", group: "measuring", label: "Contractor On-time %", pdfTitle: "Measured on Time per Contractor", table: measOnTime },

  { id: "rep-list", group: "reports", label: "Reports in the Period", pdfTitle: "Survey Reports in the Period", table: repList },
  { id: "rep-pending", group: "reports", label: "Not Yet Approved", pdfTitle: "Survey Reports Not Yet Approved", table: repPending },

  { id: "act-open", group: "actions", label: "Open Actions by Stage", pdfTitle: "Open Actions by Stage", table: actOpen },
  { id: "act-late", group: "actions", label: "Past Due / No Owner", pdfTitle: "Actions Past Due or Without an Owner", table: actLate },
  { id: "act-closed", group: "actions", label: "Closed in the Period", pdfTitle: "Actions Closed in the Period", table: actClosed },

  { id: "routes-open", group: "routes", label: "Open Routes", pdfTitle: "Open Routes", table: routesOpen },
  { id: "routes-followups", group: "routes", label: "Follow-up Readings Due", pdfTitle: "Follow-up Readings Due (next 30 days)", table: routesFollowUps },
];

// not in the builder's checklist: the Monthly Activity Summary card's own section
export const ACTIVITY_SECTION = { id: "activity-month", label: "Monthly Activity", pdfTitle: "Monthly Activity", table: activityMonth };

export const READY_MADE = {
  action: { title: "Contractor Action Status", sectionIds: ["act-open", "act-late"], snapshot: true },
  measuring: { title: "Measurement Overdue / Missed", sectionIds: ["meas-overdue", "meas-ontime"] },
  condition: { title: "Machines in Alert / Danger", sectionIds: ["cond-summary", "cond-attention"], snapshot: true },
};

export const contractorLabel = (c) => (c === "All" ? "All contractors" : `Contractor: ${c}`);

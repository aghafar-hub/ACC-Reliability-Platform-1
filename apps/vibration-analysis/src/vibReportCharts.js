import { LEVEL_RANK, LEVELS } from "./levels";
import { CAT, LV, pctColor } from "./vibPdfCharts";
import { OPEN_ACTIONS, OPEN_ROUTES, actionCounts, conditionMachines, contractorActions, measuringCounts, monthActivity, trackerMachines } from "./vibReportData";

// The graphs each Vibration report section prints above its table (PDF
// only; the Excel workbook keeps the table). charts(data, ctx) → rows of
// chart specs; vibReports.js draws them with vibPdfCharts.js.
//   { kind: "donut" | "hbars" | "stackRows" | "columns" | "heat" | "trends", ... }

const COND = [...LEVELS, "Not read"];
const STAGE_COLOR = { Draft: CAT[3], Open: CAT[0], "Waiting Stoppage": CAT[2], "Closure Requested": CAT[1] };
const ROUTE_COLOR = { Unassigned: CAT[3], Assigned: CAT[0], "In Progress": CAT[1], Submitted: CAT[2], Returned: LV.Alert };
const MEAS_COLOR = { Overdue: LV.Alert, "Never measured": LV.Danger, "Due now": LV.Caution, "On time": LV.Normal };
// "Aug 26": short enough for a chart axis
export const short = (m) => {
  const [y, mo] = String(m || "").split("-").map(Number);
  return y && mo ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${String(y).slice(2)}` : String(m || "");
};
const day = (v) => String(v || "").slice(0, 10);
const daysBetween = (a, b) => (a && b ? Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000) : null);
const inC = (contractor) => (x) => contractor === "All" || x === contractor;
const countBy = (list, key) => list.reduce((o, x) => ((o[key(x)] = (o[key(x)] || 0) + 1), o), {});
const top = (rows, n = 12) => rows.slice(0, n);
const unitOf = (f) => (f === "RMS" ? "mm/s" : f === "SPM" ? "dBsv" : "g");
const contractorsOf = (list, key) => [...new Set(list.map(key).filter(Boolean))].sort();
const catOf = (names) => Object.fromEntries(names.map((n, i) => [n, CAT[i % CAT.length]]));

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

// The machines' six-month trend of the worst point (dashboard series), with
// the alarm limit worked back from the latest reading's ratio.
export function machineTrends(machines, n = 9) {
  return machines.slice(0, n).map((m) => {
    const wp = m.worstPoint || {};
    const alarm = wp.ratio > 0 && wp.value != null && wp.family === m.family ? wp.value / wp.ratio : null;
    const pts = (m.series || []).map((p) => ({ label: short(p.month), value: p.value }));
    if (pts.length) pts[pts.length - 1].color = LV[m.cond || m.status] || undefined;
    return { title: m.equipmentId, sub: `${m.cond || m.status || ""} · ${m.family || ""}`, points: pts, alarm, unit: unitOf(m.family) };
  });
}

const CHARTS = {
  "cond-summary"(data, { contractor }) {
    const ms = conditionMachines(data.dashboard, contractor);
    const areas = [...new Set(ms.map((m) => m.area || "Other"))].sort();
    const byC = contractorsOf(ms, (m) => m.contractor);
    return [
      [
        { kind: "donut", title: "Machine condition", parts: COND.map((c) => ({ label: c, value: ms.filter((m) => m.cond === c).length, color: LV[c] })), centerSub: "machines" },
        {
          kind: "stackRows",
          title: "Condition per contractor",
          rows: byC.map((c) => ({ label: c, parts: COND.map((lv) => ({ value: ms.filter((m) => m.contractor === c && m.cond === lv).length, color: LV[lv] })) })),
        },
      ],
      [
        {
          kind: "stackRows",
          title: "Condition per area",
          legend: COND.map((c) => ({ label: c, color: LV[c] })),
          rows: areas.map((a) => ({ label: a, parts: COND.map((lv) => ({ value: ms.filter((m) => (m.area || "Other") === a && m.cond === lv).length, color: LV[lv] })) })),
        },
      ],
    ];
  },

  "cond-attention"(data, { contractor }) {
    const ms = conditionMachines(data.dashboard, contractor)
      .filter((m) => (LEVEL_RANK[m.cond] || 0) >= 3)
      .sort((a, b) => (b.worstPoint?.ratio || 0) - (a.worstPoint?.ratio || 0));
    if (!ms.length) return [];
    return [
      [
        {
          kind: "hbars",
          title: "Worst point vs its alarm limit",
          sub: "worst point, 100 % = alarm",
          rows: top(ms, 14).map((m) => ({ label: m.equipmentId, value: Math.round((m.worstPoint?.ratio || 0) * 100), text: `${Math.round((m.worstPoint?.ratio || 0) * 100)} %`, color: LV[m.cond] })),
          line: { value: 100, label: "alarm" },
        },
        {
          kind: "donut",
          title: "Per area",
          parts: Object.entries(countBy(ms, (m) => m.area || "Other")).map(([a, n], i) => ({ label: a, value: n, color: CAT[i % CAT.length] })),
          centerSub: "machines",
        },
      ],
      [{ kind: "trends", title: "Six-month trend of the worst point", items: machineTrends(ms) }],
    ];
  },

  "cond-changes"(data, { contractor }) {
    const ms = conditionMachines(data.dashboard, contractor).filter((m) => m.cond !== "Not read" && m.prevStatus && m.prevStatus !== m.status);
    const worse = ms.filter((m) => (LEVEL_RANK[m.status] || 0) > (LEVEL_RANK[m.prevStatus] || 0));
    const better = ms.filter((m) => !worse.includes(m));
    const areas = [...new Set(ms.map((m) => m.area || "Other"))].sort();
    return [
      [
        { kind: "donut", title: "Changes in the latest report", parts: [{ label: "Worse", value: worse.length, color: LV.Alert }, { label: "Better", value: better.length, color: LV.Normal }], centerSub: "machines" },
        {
          kind: "stackRows",
          title: "Per area",
          legend: [{ label: "Worse", color: LV.Alert }, { label: "Better", color: LV.Normal }],
          rows: areas.map((a) => ({ label: a, parts: [{ value: worse.filter((m) => (m.area || "Other") === a).length, color: LV.Alert }, { value: better.filter((m) => (m.area || "Other") === a).length, color: LV.Normal }] })),
        },
      ],
      ...(worse.length ? [[{ kind: "trends", title: "Machines that got worse — six-month trend", items: machineTrends(worse.map((m) => ({ ...m, cond: m.status }))) }]] : []),
    ];
  },

  "meas-overdue"(data, { contractor, today }) {
    const c = measuringCounts(data.tracker, contractor);
    const late = trackerMachines(data.tracker, contractor).filter((m) => ["Overdue", "Never measured", "Due now"].includes(m.state));
    const areas = [...new Set(late.map((m) => m.area || "Other"))].sort();
    const overdue = late
      .filter((m) => m.state === "Overdue" && m.nextDue)
      .map((m) => ({ m, d: daysBetween(m.nextDue, today) || 0 }))
      .sort((a, b) => b.d - a.d);
    return [
      [
        { kind: "donut", title: "Measuring state", parts: ["Overdue", "Never measured", "Due now", "On time"].map((s) => ({ label: s, value: c[s] || 0, color: MEAS_COLOR[s] })), centerSub: "machines" },
        {
          kind: "stackRows",
          title: "Not on time, per area",
          legend: ["Overdue", "Never measured", "Due now"].map((s) => ({ label: s, color: MEAS_COLOR[s] })),
          rows: areas.map((a) => ({ label: a, parts: ["Overdue", "Never measured", "Due now"].map((s) => ({ value: late.filter((m) => (m.area || "Other") === a && m.state === s).length, color: MEAS_COLOR[s] })) })),
        },
      ],
      ...(overdue.length ? [[{ kind: "hbars", title: "Most overdue", sub: "days past the due date", rows: top(overdue, 12).map(({ m, d }) => ({ label: `${m.equipmentId}`, value: d, text: `${d} d`, color: LV.Alert })) }]] : []),
    ];
  },

  "meas-coverage"(data, { contractor, months }) {
    const ms = trackerMachines(data.tracker, contractor);
    const areas = [...new Set(ms.map((m) => m.area || "Other"))].sort();
    const val = (list, mo) => {
      const x = list.reduce((acc, m) => { const y = cover(m.cells, [mo]); return { a: acc.a + y.measured, b: acc.b + y.missed }; }, { a: 0, b: 0 });
      return pct(x.a, x.a + x.b);
    };
    return [
      [{ kind: "columns", title: "Whole plant, per month", sub: "% of due machines measured", labels: months.map(short), series: [{ label: "Measured", values: months.map((mo) => val(ms, mo)), colorOf: pctColor }], maxY: 100, unit: " %", target: 90 }],
      [{ kind: "heat", title: "Per area, per month", sub: "% measured", rowLabels: areas, colLabels: months.map(short), values: areas.map((a) => months.map((mo) => val(ms.filter((m) => (m.area || "Other") === a), mo))) }],
    ];
  },

  "meas-ontime"(data, { contractor, months }) {
    const ms = trackerMachines(data.tracker, contractor);
    const cs = contractorsOf(ms, (m) => m.contractor);
    const col = catOf(cs);
    const val = (list, mos) => {
      const x = list.reduce((acc, m) => { const y = cover(m.cells, mos); return { a: acc.a + y.measured, b: acc.b + y.missed }; }, { a: 0, b: 0 });
      return pct(x.a, x.a + x.b);
    };
    return [
      [
        { kind: "hbars", title: "On time over the period", rows: cs.map((c) => { const p = val(ms.filter((m) => m.contractor === c), months); return { label: c, value: p ?? 0, text: p == null ? "–" : `${p} %`, color: pctColor(p) }; }), max: 100, line: { value: 90, label: "target 90 %" } },
        {
          kind: "columns",
          title: "Per month",
          labels: months.map(short),
          series: cs.map((c) => ({ label: c, color: col[c], values: months.map((mo) => val(ms.filter((m) => m.contractor === c), [mo])) })),
          maxY: 100,
          unit: " %",
          target: 90,
          valueLabels: false,
        },
      ],
    ];
  },

  "rep-list"(data, { contractor, months }) {
    const reps = (data.log?.reports || []).filter((r) => inC(contractor)(r.Contractor) && months.includes(r.Month));
    const cs = contractorsOf(reps, (r) => r.Contractor);
    const col = catOf(cs);
    return [
      [
        { kind: "columns", title: "Reports per month", labels: months.map(short), series: cs.map((c) => ({ label: c, color: col[c], values: months.map((mo) => reps.filter((r) => r.Month === mo && r.Contractor === c).length) })), stacked: true },
        {
          kind: "columns",
          title: "Machines found, per month",
          sub: "by status",
          labels: months.map(short),
          series: LEVELS.map((lv) => ({ label: lv, color: LV[lv], values: months.map((mo) => reps.filter((r) => r.Month === mo).reduce((n, r) => n + (Number(r[lv]) || 0), 0)) })),
          stacked: true,
        },
      ],
      [{ kind: "donut", title: "Workflow", parts: Object.entries(countBy(reps, (r) => r["Workflow status"] || "—")).map(([k, n], i) => ({ label: k, value: n, color: k === "Approved" ? LV.Normal : CAT[i % CAT.length] })), centerSub: "reports" }, null],
    ];
  },

  "rep-pending"(data, { contractor, today }) {
    const reps = (data.log?.reports || []).filter((r) => inC(contractor)(r.Contractor) && !["Approved", "Historic"].includes(r["Workflow status"]) && r["Report status"] !== "Skipped");
    if (!reps.length) return [];
    const late = reps
      .map((r) => ({ r, d: r["Due date"] && !r["Received date"] ? daysBetween(r["Due date"], today) : 0 }))
      .filter((x) => x.d > 0)
      .sort((a, b) => b.d - a.d);
    return [
      [
        { kind: "donut", title: "Waiting at", parts: Object.entries(countBy(reps, (r) => r["Workflow status"] || "—")).map(([k, n], i) => ({ label: k, value: n, color: CAT[i % CAT.length] })), centerSub: "reports" },
        { kind: "hbars", title: "Past due, not received", sub: "days", rows: top(late, 10).map(({ r, d }) => ({ label: `${r.Contractor} ${r["Report scope"]} ${short(r.Month)}`, value: d, text: `${d} d`, color: LV.Alert })), empty: "No report past due." },
      ],
    ];
  },

  "act-open"(data, { contractor, today }) {
    const c = actionCounts(data.actions, contractor);
    const open = contractorActions(data.actions, contractor).filter((x) => OPEN_ACTIONS.includes(x.Status));
    const cs = contractorsOf(open, (a) => a.Contractor);
    const sev = ["Danger", "Alert", "Caution", "Normal"].filter((lv) => open.some((a) => a.Severity === lv));
    const ages = [
      ["0–30 d", 0, 30],
      ["31–60 d", 31, 60],
      ["61–90 d", 61, 90],
      ["over 90 d", 91, 1e9],
    ];
    return [
      [
        { kind: "donut", title: "Open actions by stage", parts: OPEN_ACTIONS.map((st) => ({ label: st, value: c[st] || 0, color: STAGE_COLOR[st] })), centerSub: "open" },
        { kind: "stackRows", title: "Per contractor", legend: OPEN_ACTIONS.map((st) => ({ label: st, color: STAGE_COLOR[st] })), rows: cs.map((ct) => ({ label: ct, parts: OPEN_ACTIONS.map((st) => ({ value: open.filter((a) => a.Contractor === ct && a.Status === st).length, color: STAGE_COLOR[st] })) })) },
      ],
      [
        { kind: "hbars", title: "By severity", rows: sev.map((lv) => ({ label: lv, value: open.filter((a) => a.Severity === lv).length, color: LV[lv] })) },
        { kind: "hbars", title: "How long open", rows: ages.map(([l, lo, hi]) => ({ label: l, value: open.filter((a) => { const d = daysBetween(day(a["Created at"]), today); return d != null && d >= lo && d <= hi; }).length, color: hi > 90 ? LV.Alert : hi > 60 ? LV.Caution : CAT[0] })) },
      ],
    ];
  },

  "act-late"(data, { contractor, today }) {
    const acts = contractorActions(data.actions, contractor).filter((a) => OPEN_ACTIONS.includes(a.Status));
    const pastDue = acts.filter((a) => ["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today);
    const noOwner = acts.filter((a) => !a.Owner);
    if (!pastDue.length && !noOwner.length) return [];
    const cs = contractorsOf([...pastDue, ...noOwner], (a) => a.Contractor);
    return [
      [
        {
          kind: "stackRows",
          title: "Per contractor",
          legend: [{ label: "Past due", color: LV.Alert }, { label: "No owner", color: CAT[3] }],
          rows: cs.map((c) => ({ label: c, parts: [{ value: pastDue.filter((a) => a.Contractor === c).length, color: LV.Alert }, { value: noOwner.filter((a) => a.Contractor === c).length, color: CAT[3] }] })),
        },
        {
          kind: "hbars",
          title: "Most days past due",
          rows: top(pastDue.map((a) => ({ a, d: daysBetween(a["Due date"], today) || 0 })).sort((x, y) => y.d - x.d), 10).map(({ a, d }) => ({ label: `${a["Action ID"]} ${a["Equipment ID"]}`, value: d, text: `${d} d`, color: LV[a.Severity] || LV.Alert })),
          empty: "None past due.",
        },
      ],
    ];
  },

  "act-closed"(data, { contractor, months }) {
    const all = contractorActions(data.actions, contractor);
    const closed = all.filter((a) => a.Status === "Closed" && months.includes(day(a["Closed at"]).slice(0, 7)));
    const cs = contractorsOf(all, (a) => a.Contractor);
    const col = catOf(cs);
    const avg = (list) => (list.length ? Math.round(list.reduce((n, a) => n + (daysBetween(day(a["Created at"]), day(a["Closed at"])) || 0), 0) / list.length) : null);
    return [
      [
        {
          kind: "columns",
          title: "Opened and closed per month",
          labels: months.map(short),
          series: [
            { label: "Opened", color: CAT[2], values: months.map((mo) => all.filter((a) => day(a["Created at"]).slice(0, 7) === mo).length) },
            { label: "Closed", color: LV.Normal, values: months.map((mo) => closed.filter((a) => day(a["Closed at"]).slice(0, 7) === mo).length) },
          ],
          valueLabels: false,
        },
        { kind: "hbars", title: "Average days open before closing", rows: cs.map((c) => { const v = avg(closed.filter((a) => a.Contractor === c)); return { label: c, value: v ?? 0, text: v == null ? "–" : `${v} d`, color: col[c] }; }) },
      ],
    ];
  },

  "routes-open"(data, { contractor }) {
    const rs = (data.routes?.routes || []).filter((r) => inC(contractor)(r.Contractor) && OPEN_ROUTES.includes(r.Status));
    if (!rs.length) return [];
    return [
      [
        { kind: "donut", title: "Open routes by status", parts: OPEN_ROUTES.map((st) => ({ label: st, value: rs.filter((r) => r.Status === st).length, color: ROUTE_COLOR[st] })), centerSub: "routes" },
        {
          kind: "hbars",
          title: "Points done",
          rows: top(rs, 12).map((r) => { const p = r.Points ? Math.round((100 * (Number(r["Points done"]) || 0)) / Number(r.Points)) : 0; return { label: r["Route ID"], value: p, text: `${r["Points done"] || 0}/${r.Points || 0}`, color: p >= 100 ? LV.Normal : CAT[0] }; }),
          max: 100,
        },
      ],
    ];
  },

  "routes-followups"(data, { contractor }) {
    const ss = (data.routes?.suggestions || []).filter((x) => x.type === "Follow-up" && inC(contractor)(x.contractor));
    if (!ss.length) return [];
    const cs = contractorsOf(ss, (x) => x.contractor);
    return [
      [
        { kind: "donut", title: "Follow-up readings", parts: [{ label: "Overdue", value: ss.filter((x) => x.overdue).length, color: LV.Alert }, { label: "Due soon", value: ss.filter((x) => !x.overdue).length, color: LV.Caution }], centerSub: "due" },
        { kind: "stackRows", title: "Per contractor", legend: [{ label: "Overdue", color: LV.Alert }, { label: "Due soon", color: LV.Caution }], rows: cs.map((c) => ({ label: c, parts: [{ value: ss.filter((x) => x.contractor === c && x.overdue).length, color: LV.Alert }, { value: ss.filter((x) => x.contractor === c && !x.overdue).length, color: LV.Caution }] })) },
      ],
    ];
  },

  "activity-month"(data, { contractor, month }) {
    const x = monthActivity(data, contractor, month);
    const cs = contractorsOf([...x.machinesMeasured.map((m) => m.contractor), ...x.reports.map((r) => r.Contractor), ...x.opened.map((a) => a.Contractor), ...x.closed.map((a) => a.Contractor)], (c) => c);
    const col = catOf(cs);
    const what = [
      ["Machines measured", (c) => x.machinesMeasured.filter((m) => m.contractor === c).length],
      ["Reports approved", (c) => x.approved.filter((r) => r.Contractor === c).length],
      ["Actions opened", (c) => x.opened.filter((a) => a.Contractor === c).length],
      ["Actions closed", (c) => x.closed.filter((a) => a.Contractor === c).length],
    ];
    return [[{ kind: "stackRows", title: "The month's work, per contractor", legend: cs.map((c) => ({ label: c, color: col[c] })), rows: what.map(([l, f]) => ({ label: l, parts: cs.map((c) => ({ value: f(c), color: col[c] })) })) }]];
  },
};

export function sectionCharts(id, data, ctx) {
  try {
    return CHARTS[id] ? CHARTS[id](data, ctx) : [];
  } catch {
    return []; // a chart never stops the report
  }
}

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import logoUrl from "./assets/arabian-cement-logo.png";
import { LEVEL_RANK, LEVELS } from "./levels";
import { monthLabel, shortDate } from "./vibModel";

// Printable vibration reports, made in the browser from the same answers
// the pages already load (no template file to keep in sync):
//   generateVibReportPdf — one or more contractor reports (a month, one
//     scope or all of them): summary, machines with their worst point,
//     every reading, and the actions the findings went to.
//   generateVibDashboardPdf — the dashboard numbers for managers.
// Colours follow the four levels (design reference §5); every coloured cell
// also carries the word, so print in black and white still reads.

const C = {
  navy: [11, 37, 69],
  teal: [0, 180, 216],
  muted: [110, 125, 145],
  border: [220, 226, 234],
  headBg: [230, 236, 242],
  text: [20, 26, 33],
  Normal: [24, 115, 74],
  // Normal green, Caution amber, Alert red, Danger purple (as on screen)
  Caution: [154, 105, 0],
  Alert: [196, 43, 43],
  Danger: [109, 40, 217],
};
const LOGO_ASPECT = 602 / 316;

let logoPromise = null;
function logoData() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          cv.getContext("2d").drawImage(img, 0, 0);
          resolve(cv.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }
  return logoPromise;
}

async function newDoc(title, sub, orientation = "portrait") {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, w, 72, "F");
  const logo = await logoData();
  const lw = 30 * LOGO_ASPECT;
  const left = logo ? Math.round(36 + lw + 14) : 36;
  if (logo) doc.addImage(logo, "PNG", 36, 21, lw, 30);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Arabian Cement Company", left, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(title, left, 46);
  doc.setFontSize(9);
  doc.setTextColor(120, 220, 235);
  doc.text(sub, left, 60);
  doc.setFontSize(8.5);
  doc.setTextColor(190, 202, 215);
  doc.text(`Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, w - 36, 30, { align: "right" });
  doc.text("Vibration Analysis", w - 36, 46, { align: "right" });
  doc.setTextColor(...C.text);
  return doc;
}

function footer(doc) {
  const n = doc.internal.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.75);
    doc.line(36, h - 34, w - 36, h - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text("Arabian Cement — Vibration Analysis", 36, h - 20);
    doc.text(`Page ${i} of ${n}`, w - 36, h - 20, { align: "right" });
  }
}

function section(doc, text, y) {
  const up = text.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.navy);
  doc.text(up, 36, y);
  doc.setDrawColor(...C.teal);
  doc.setLineWidth(1.6);
  doc.line(36, y + 4, 36 + doc.getTextWidth(up), y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  return y + 20;
}

function bigHeader(doc, text, y) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.headBg);
  doc.rect(30, y - 15, w - 60, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.navy);
  doc.text(text, 36, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.text);
  return y + 30;
}

function para(doc, text, y) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 72, 88);
  const lines = doc.splitTextToSize(text, w - 72);
  doc.text(lines, 36, y);
  doc.setTextColor(...C.text);
  return y + lines.length * 12 + 10;
}

function stats(doc, list, y) {
  const w = doc.internal.pageSize.getWidth() - 72;
  const bw = w / list.length;
  list.forEach((st, i) => {
    const x = 36 + i * bw;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, bw - 8, 40, 3, 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...(st.color || C.navy));
    doc.text(String(st.value), x + 10, y + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(st.label, x + 10, y + 33);
  });
  doc.setTextColor(...C.text);
  return y + 64;
}

function room(doc, y, need = 110) {
  if (y <= doc.internal.pageSize.getHeight() - need) return y;
  doc.addPage();
  return 40;
}

const tableBase = {
  theme: "striped",
  headStyles: { fillColor: C.headBg, textColor: C.navy, fontSize: 8 },
  styles: { fontSize: 8, cellPadding: 4, lineColor: C.border, lineWidth: 0.4 },
  margin: { left: 36, right: 36 },
};
// colour the cells of the given columns by their level word
const levelCells = (cols) => (data) => {
  if (data.section !== "body" || !cols.includes(data.column.index)) return;
  const word = String(data.cell.raw || "").split(" ")[0];
  if (C[word] && LEVEL_RANK[word]) {
    data.cell.styles.textColor = C[word];
    data.cell.styles.fontStyle = "bold";
  }
};

const num = (v) => (v === "" || v == null ? "" : String(v));
const valueOf = (e) =>
  e.Family === "RMS"
    ? [e["Horizontal (mm/s)"], e["Vertical (mm/s)"], e["Axial (mm/s)"]].map(num).join(" / ")
    : e.Family === "SPM"
      ? `${num(e["HDm (dBsv)"])} / ${num(e["HDc (dBsv)"])}`
      : num(e["G's (g)"]);
const mainValue = (e) => (e.Family === "RMS" ? e["Max velocity (mm/s)"] : e.Family === "SPM" ? e["HDm (dBsv)"] : e["G's (g)"]);
const unitOf = (f) => (f === "RMS" ? "mm/s" : f === "SPM" ? "dBsv" : "g");

// Machines in a report: worst final status, the point that gave it.
export function machinesOf(entries) {
  const by = {};
  entries.forEach((e) => {
    if (e["Reading kind"] && e["Reading kind"] !== "Report reading") return;
    const id = e["Equipment ID"];
    const m = by[id] || (by[id] = { id, name: e["Equipment name"], worst: "", point: null, differ: 0, count: 0 });
    m.count++;
    if (e["Report differs"] === "Yes") m.differ++;
    if (!m.point || (LEVEL_RANK[e["Final status"]] || 0) > (LEVEL_RANK[m.worst] || 0)) {
      m.worst = e["Final status"] || m.worst;
      m.point = e;
    }
  });
  return Object.values(by).sort((a, b) => (LEVEL_RANK[b.worst] || 0) - (LEVEL_RANK[a.worst] || 0) || a.id.localeCompare(b.id));
}

function reportSection(doc, y, { report, entries, actions, findings }, single) {
  const r = report;
  const title = `${r.Contractor} · ${r["Report scope"]} · ${monthLabel(r.Month)}`;
  if (!single) y = bigHeader(doc, title, room(doc, y, 160));
  const machines = machinesOf(entries);
  const count = (lv) => machines.filter((m) => m.worst === lv).length;
  y = para(
    doc,
    [
      `Report ${r["Report ID"]} — ${r["Workflow status"]}, ${r["Report status"] || "no status"}.`,
      r["First reading"] ? `Measured ${shortDate(r["First reading"])}${r["Last reading"] && r["Last reading"] !== r["First reading"] ? ` to ${shortDate(r["Last reading"])}` : ""}.` : "No readings entered.",
      r["Due date"] && r["Workflow status"] !== "Historic" ? `Due ${shortDate(r["Due date"])}${r["Received date"] ? `, received ${shortDate(r["Received date"])}` : ""}.` : "",
      r["Contractor report no"] ? `Contractor report no. ${r["Contractor report no"]}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    y
  );
  y = stats(
    doc,
    [
      { label: "Machines read", value: machines.length },
      ...LEVELS.map((lv) => ({ label: lv, value: count(lv), color: C[lv] })),
      { label: "Report vs limits differ", value: machines.reduce((n, m) => n + m.differ, 0) },
    ],
    y
  );

  y = room(doc, y, 120);
  y = section(doc, "Machines", y);
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["Machine", "Name", "Status", "Worst point", "Value", "Readings"]],
    body: machines.length
      ? machines.map((m) => [m.id, m.name, m.worst || "—", m.point ? `${String(m.point["Point description"] || "").replace(/\s*\(.*\)$/, "")} (${m.point.Family})` : "", m.point ? `${num(mainValue(m.point))} ${unitOf(m.point.Family)}` : "", m.count])
      : [["No readings in this report", "", "", "", "", ""]],
    didParseCell: levelCells([2]),
  });
  y = doc.lastAutoTable.finalY + 22;

  const rel = (findings || []).filter((f) => f["Report ID"] === r["Report ID"]);
  if (rel.length) {
    y = room(doc, y, 120);
    y = section(doc, "Findings and actions", y);
    const byId = Object.fromEntries((actions || []).map((a) => [a["Action ID"], a]));
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Action", "Machine", "Severity", "Status", "Points", "Agreed action", "Owner", "Due"]],
      body: rel.map((f) => {
        const a = byId[f["Action ID"]] || {};
        return [f["Action ID"], f["Equipment ID"], f.Severity, a.Status || "", f.Points || "", a["Agreed action"] || a["Contractor recommendation"] || "—", a.Owner || "", a["Due date"] ? shortDate(a["Due date"]) : ""];
      }),
      columnStyles: { 4: { cellWidth: 90 }, 5: { cellWidth: 110 } },
      didParseCell: levelCells([2]),
    });
    y = doc.lastAutoTable.finalY + 22;
  }

  if (entries.length) {
    y = room(doc, y, 120);
    y = section(doc, "All readings", y);
    const rows = [...entries].sort((a, b) => String(a["Equipment ID"]).localeCompare(String(b["Equipment ID"])) || String(a["VIB ID"]).localeCompare(String(b["VIB ID"])));
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Machine", "Point", "Family", "Date", "Value (H/V/A · HDm/HDc · g)", "Limits", "System", "Report", "Final"]],
      body: rows.map((e) => [
        e["Equipment ID"],
        String(e["Point description"] || "").replace(/\s*\(.*\)$/, ""),
        e.Family,
        shortDate(e["Measurement date"]),
        valueOf(e),
        e["Limits used (N/C/A)"] || "",
        e["System status"] || "",
        e["Report status"] || "",
        `${e["Final status"] || ""}${e["Reading kind"] && e["Reading kind"] !== "Report reading" ? " (earlier)" : ""}`,
      ]),
      styles: { ...tableBase.styles, fontSize: 7.5, cellPadding: 3 },
      didParseCell: levelCells([6, 7, 8]),
    });
    y = doc.lastAutoTable.finalY + 26;
  }
  return y;
}

// reports: [{ report, entries }]; actions / findings from getVibActions
// (optional — left out when the person can't read actions).
export async function generateVibReportPdf({ reports, actions = [], findings = [] }) {
  if (!reports.length) return;
  const single = reports.length === 1;
  const r0 = reports[0].report;
  const months = [...new Set(reports.map((x) => x.report.Month))];
  const title = single ? `Vibration report — ${r0.Contractor} · ${r0["Report scope"]}` : "Vibration reports — combined";
  const sub = single ? `${monthLabel(r0.Month)} · ${r0["Report ID"]}` : `${months.map(monthLabel).join(", ")} · ${reports.map((x) => `${x.report.Contractor} ${x.report["Report scope"]}`).join(" · ")}`;
  const doc = await newDoc(title, sub, "landscape");
  let y = 96;
  reports.forEach((x, i) => {
    if (i > 0) {
      doc.addPage();
      y = 50;
    }
    y = reportSection(doc, y, { ...x, actions, findings }, single);
  });
  footer(doc);
  const name = single ? r0["Report ID"] : `Vibration-Reports-${months.join("_")}`;
  doc.save(`${name}.pdf`);
}

// d: getVibDashboard answer, already filtered by the page (contractor).
export async function generateVibDashboardPdf({ d, contractor, machines, grid, months }) {
  const doc = await newDoc("Vibration Dashboard", contractor === "All" ? "All contractors" : `Contractor: ${contractor}`);
  let y = 96;
  const count = (lv) => machines.filter((m) => m.status === lv).length;
  y = stats(
    doc,
    [
      { label: "Machines", value: machines.length },
      ...LEVELS.map((lv) => ({ label: lv, value: count(lv), color: C[lv] })),
      { label: "Open actions", value: d.actions.open },
    ],
    y
  );
  y = para(doc, `Machines measured in ${d.onTime.year}: ${d.onTime.onTime} of ${d.onTime.due} machine-months${d.onTime.due ? ` (${Math.round((d.onTime.onTime / d.onTime.due) * 100)} %)` : ""}. Overdue for measuring now: ${d.measuring.overdue} (${d.measuring.dueNow} due now). Follow-up readings due in 14 days: ${d.followUps.due} (${d.followUps.overdue} overdue). Actions past due: ${d.actions.pastDue}, with no owner: ${d.actions.noOwner}.`, y);

  y = section(doc, "Machines measured (% of the area's machines, per month)", y);
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["Area", ...months.map((m) => monthLabel(m).replace(/ 20(\d\d)$/, " $1"))]],
    body: grid.map((g) => [g.area, ...g.cells.filter((c) => months.includes(c.month)).map((c) => (c.pct == null ? "–" : `${c.pct} %`))]),
    styles: { ...tableBase.styles, fontSize: 7, cellPadding: 3 },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index === 0) return;
      const v = data.cell.raw;
      const n = parseInt(v, 10);
      data.cell.styles.textColor = isNaN(n) ? C.muted : n >= 90 ? C.Normal : n >= 70 ? C.Caution : C.Danger;
    },
  });
  y = doc.lastAutoTable.finalY + 22;

  y = room(doc, y, 120);
  y = section(doc, "Machines needing attention", y);
  const worst = machines.filter((m) => (LEVEL_RANK[m.status] || 0) >= 2).sort((a, b) => (LEVEL_RANK[b.status] || 0) - (LEVEL_RANK[a.status] || 0) || (b.worstPoint?.ratio || 0) - (a.worstPoint?.ratio || 0));
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["Machine", "Name", "Scope", "Status", "Worst point", "Value", "Last report"]],
    body: worst.length
      ? worst.map((m) => [m.equipmentId, m.name, `${m.contractor} · ${m.scope}`, m.status, m.worstPoint?.point || "", m.worstPoint?.value != null ? `${m.worstPoint.value} ${unitOf(m.worstPoint.family)}` : "", m.lastMonth ? monthLabel(m.lastMonth) : ""])
      : [["No machine at Caution or above", "", "", "", "", "", ""]],
    didParseCell: levelCells([3]),
  });
  footer(doc);
  doc.save(`Vibration-Dashboard-${d.today}.pdf`);
}

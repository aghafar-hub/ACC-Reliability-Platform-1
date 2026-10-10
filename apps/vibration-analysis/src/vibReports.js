import { autoTable } from "jspdf-autotable";
import ExcelJS from "exceljs";
import { PDF_COLORS as C, bigHeader, footer, levelCells, newDoc, para, room, stats, tableBase } from "./vibPdf";
import { ACTIVITY_SECTION, REPORT_SECTIONS, contractorLabel, periodLabel } from "./vibReportData";
import { monthLabel, shortDate } from "./vibModel";

// Vibration Reports → PDF / Excel (loaded only when someone downloads, so
// the page itself stays light). Every section comes from vibReportData.js,
// so the PDF and the workbook always show the same rows.

const TONE = { warning: [200, 130, 20], danger: C.Alert, accent: [30, 91, 184], info: [14, 116, 144], success: C.Normal };
const NOT_READ = [170, 180, 192];
const STATE = { Overdue: C.Alert, "Never measured": C.Danger, "Due now": C.Caution };
const colorOf = (p) => (p.level ? C[p.level] || NOT_READ : TONE[p.tone] || C.navy);

function sectionsFor(ids, extra) {
  return [...REPORT_SECTIONS.filter((s) => ids.includes(s.id)), ...(extra || [])];
}
const fileDate = () => new Date().toISOString().slice(0, 10);
const fileSuffix = (c) => (c === "All" ? "" : `-${c}`);

// a bar split into its parts, with the legend under it
function stackChart(doc, parts, y) {
  const w = doc.internal.pageSize.getWidth() - 72;
  const sum = parts.reduce((n, p) => n + p.value, 0);
  let x = 36;
  doc.setFillColor(236, 240, 244);
  doc.roundedRect(36, y, w, 12, 3, 3, "F");
  parts.forEach((p) => {
    if (!p.value || !sum) return;
    const pw = (p.value / sum) * w;
    doc.setFillColor(...colorOf(p));
    doc.rect(x, y, Math.max(pw - 1.5, 0.5), 12, "F");
    x += pw;
  });
  let lx = 36;
  const ly = y + 26;
  doc.setFontSize(8);
  parts.forEach((p) => {
    const label = `${p.label}: ${p.value}`;
    doc.setFillColor(...colorOf(p));
    doc.rect(lx, ly - 7, 7, 7, "F");
    doc.setTextColor(...C.text);
    doc.text(label, lx + 10, ly);
    lx += doc.getTextWidth(label) + 26;
  });
  return y + 42;
}

// one horizontal bar per item (e.g. on-time % per contractor), 0–100
function barChart(doc, parts, y) {
  const w = doc.internal.pageSize.getWidth() - 72 - 90 - 40;
  doc.setFontSize(8.5);
  parts.forEach((p, i) => {
    const yy = y + i * 18;
    doc.setTextColor(...C.text);
    doc.text(String(p.label), 36, yy + 8);
    doc.setFillColor(236, 240, 244);
    doc.rect(126, yy, w, 10, "F");
    const v = Math.max(0, Math.min(100, p.value));
    doc.setFillColor(...(v >= 90 ? C.Normal : v >= 70 ? C.Caution : C.Alert));
    doc.rect(126, yy, (v / 100) * w, 10, "F");
    doc.text(`${p.value}${p.suffix || ""}`, 126 + w + 8, yy + 8);
  });
  return y + parts.length * 18 + 14;
}

function drawSection(doc, sec, data, ctx, y) {
  const t = sec.table(data, ctx);
  y = bigHeader(doc, sec.pdfTitle, y);
  if (t.stats) y = stats(doc, t.stats.map((s) => ({ label: s.label, value: s.value, color: s.level ? C[s.level] || NOT_READ : undefined })), y);
  if (t.chart?.kind === "stack" && t.chart.parts.some((p) => p.value)) y = stackChart(doc, t.chart.parts, room(doc, y, 60));
  if (t.chart?.kind === "bars" && t.chart.parts.length) y = barChart(doc, t.chart.parts, room(doc, y, 40 + t.chart.parts.length * 18));
  if (t.note) y = para(doc, t.note, y);
  y = room(doc, y, 80);
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [t.header],
    body: t.rows.length ? t.rows.map((r) => r.map((v) => (v == null ? "" : String(v)))) : [[t.empty || "Nothing to show.", ...t.header.slice(1).map(() => "")]],
    styles: { ...tableBase.styles, fontSize: t.header.length > 8 ? 7 : 8, cellPadding: t.header.length > 8 ? 3 : 4 },
    didParseCell: (cell) => {
      if (cell.section !== "body" || !t.rows.length) return;
      if (t.levelCols) levelCells(t.levelCols)(cell);
      if (t.stateCol === cell.column.index && STATE[cell.cell.raw]) {
        cell.cell.styles.textColor = STATE[cell.cell.raw];
        cell.cell.styles.fontStyle = "bold";
      }
      if (t.pctCells && cell.column.index > 0) {
        const n = parseInt(cell.cell.raw, 10);
        cell.cell.styles.textColor = isNaN(n) ? C.muted : n >= 90 ? C.Normal : n >= 70 ? C.Caution : C.Alert;
      }
      if (cell.row.raw?.[0] === "Total") cell.cell.styles.fontStyle = "bold";
    },
  });
  return doc.lastAutoTable.finalY + 26;
}

// One PDF: the picked sections, a page each.
// ctx: { contractor, months, month, today }
export async function generateVibReportsPdf({ title, sectionIds = [], extra, data, ctx, fileName }) {
  const list = sectionsFor(sectionIds, extra);
  if (!list.length) return;
  // a snapshot report (today's status) names the day, others their month / period
  const when = ctx.snapshot ? `Status on ${shortDate(ctx.today)}` : ctx.month ? monthLabel(ctx.month) : periodLabel(ctx.months);
  const sub = [contractorLabel(ctx.contractor), when].join(" · ");
  const doc = await newDoc(title, sub, list[0].landscape ? "landscape" : "portrait");
  let y = 98;
  list.forEach((sec, i) => {
    if (i > 0) {
      doc.addPage("a4", sec.landscape ? "landscape" : "portrait");
      y = 50;
    }
    y = drawSection(doc, sec, data, ctx, y);
  });
  footer(doc);
  doc.save(`${fileName || "Vibration-Report"}${fileSuffix(ctx.contractor)}-${fileDate()}.pdf`);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// One workbook: a sheet per section, data only.
export async function generateVibReportsExcel({ sectionIds = [], extra, data, ctx, fileName }) {
  const list = sectionsFor(sectionIds, extra);
  if (!list.length) return;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arabian Cement — Vibration Analysis";
  wb.created = new Date();
  list.forEach((sec) => {
    const t = sec.table(data, ctx);
    const sheet = wb.addWorksheet(sec.label.replace(/[*?:\\/[\]]/g, "").slice(0, 31));
    sheet.addRow(t.header);
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    t.rows.forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => (max = Math.max(max, String(cell.value ?? "").length)));
      col.width = Math.min(max + 2, 45);
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileName || "Vibration-Report"}${fileSuffix(ctx.contractor)}-${fileDate()}.xlsx`);
}

// Monthly Activity Summary as CSV (one line per item)
export function exportActivityCsv({ data, ctx }) {
  const t = ACTIVITY_SECTION.table(data, ctx);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [t.header, ...t.rows].map((r) => r.map(esc).join(",")).join("\r\n");
  download(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `Vibration-Activity-${ctx.month}${fileSuffix(ctx.contractor)}.csv`);
}

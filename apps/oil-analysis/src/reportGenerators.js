import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import ExcelJS from "exceljs";
import { formatDate, sampleTrackerStatus, intervalMonths, todayISO, conditionBucket } from "./parsers";
import logoUrl from "./assets/arabian-cement-logo.png";
import { LAB_PARAMS, buildCycles, cycleSummary, everyText, flagFor, leakWindows, limitsFor, paramValue, toTime, trendWarning } from "./pointHistory";

// Four printable-to-PDF reports, generated entirely client-side from the
// same live data the rest of the app already has in memory — no server
// round trip, no template file to keep in sync. Each can be scoped to a
// single contractor or run across all of them. The combined report reuses
// the same three section-builders as the three standalone reports, so
// there's exactly one place that computes each report's numbers.

const BRAND = {
  navy: [11, 37, 69],
  teal: [0, 180, 216],
  danger: [200, 40, 40],
  warning: [200, 130, 20],
  accent: [123, 60, 176],
  success: [30, 150, 80],
  muted: [110, 125, 145],
  border: [220, 226, 234],
  headBg: [230, 236, 242],
};

const ACTION_STATUS_COLOR = {
  Draft: BRAND.warning,
  Open: BRAND.danger,
  "Closure Requested": BRAND.navy,
  "Waiting Stoppage": BRAND.accent,
  Closed: BRAND.success,
};

const LOGO_ASPECT = 602 / 316;

function toFileDate() {
  return todayISO();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

// Same "how many days past the interval" math as sampleTrackerStatus's own
// internal calculation — kept separate since that function only returns a
// formatted string, and sorting worst-first needs the raw number.
function sampleOverdueDays(lastDateStr, intervalText) {
  const months = intervalMonths(intervalText);
  if (!months || !lastDateStr) return null;
  const last = new Date(lastDateStr);
  if (isNaN(last)) return null;
  const intervalDays = months * 30.44;
  const ageDays = (Date.now() - last.getTime()) / 86400000;
  return Math.round(ageDays - intervalDays);
}

function scopeLineFor(contractor) {
  return contractor === "All" ? "All Contractors" : `Contractor: ${contractor}`;
}
function fileSuffixFor(contractor) {
  return contractor === "All" ? "" : `-${contractor.replace(/[^a-z0-9]+/gi, "")}`;
}

// Vite serves the logo as a URL; jsPDF needs actual pixel data, so it's
// drawn to a canvas once and cached as a data URL for every report after
// the first.
let logoDataUrlPromise = null;
function loadLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }
  return logoDataUrlPromise;
}

async function newDoc(title, scopeLine) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageWidth, 72, "F");

  const logoData = await loadLogoDataUrl();
  const logoH = 30;
  const logoW = logoH * LOGO_ASPECT;
  const textLeft = logoData ? Math.round(36 + logoW + 14) : 36;
  if (logoData) {
    doc.addImage(logoData, "PNG", 36, (72 - logoH) / 2, logoW, logoH);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Arabian Cement Company", textLeft, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(title, textLeft, 46);
  doc.setFontSize(9);
  doc.setTextColor(120, 220, 235);
  doc.text(scopeLine, textLeft, 60);

  doc.setFontSize(8.5);
  doc.setTextColor(190, 202, 215);
  const generated = `Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
  doc.text(generated, pageWidth - 36, 30, { align: "right" });
  doc.text("Oil Analysis Management", pageWidth - 36, 46, { align: "right" });

  doc.setTextColor(20, 26, 33);
  return doc;
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.75);
    doc.line(36, pageHeight - 34, pageWidth - 36, pageHeight - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text("Arabian Cement — Oil Analysis Management", 36, pageHeight - 20);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 36, pageHeight - 20, { align: "right" });
  }
}

function sectionTitle(doc, text, y) {
  const upper = text.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.navy);
  doc.text(upper, 36, y);
  doc.setDrawColor(...BRAND.teal);
  doc.setLineWidth(1.6);
  doc.line(36, y + 4, 36 + doc.getTextWidth(upper), y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20, 26, 33);
  return y + 20;
}

// Bold divider between reports inside the combined PDF — bigger and more
// visually separated than a normal sectionTitle so it reads as "a new
// report starts here", not just another subsection.
function bigSectionHeader(doc, text, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.headBg);
  doc.rect(30, y - 15, pageWidth - 60, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...BRAND.navy);
  doc.text(text.toUpperCase(), 36, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 26, 33);
  return y + 30;
}

// Wrapped narrative paragraph giving the report a lead-in sentence instead
// of dropping straight into tables.
function summaryParagraph(doc, text, y) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 72, 88);
  const pageWidth = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(text, pageWidth - 72);
  doc.text(lines, 36, y);
  doc.setTextColor(20, 26, 33);
  return y + lines.length * 12 + 12;
}

function statStrip(doc, stats, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - 72;
  const boxW = usable / stats.length;
  stats.forEach((st, i) => {
    const x = 36 + i * boxW;
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, boxW - 8, 40, 3, 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...(st.color || BRAND.navy));
    doc.text(String(st.value), x + 10, y + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(st.label, x + 10, y + 33);
  });
  doc.setTextColor(20, 26, 33);
  return y + 54;
}

function needsNewPage(doc, y, minSpace = 110) {
  if (y <= doc.internal.pageSize.getHeight() - minSpace) return y;
  doc.addPage();
  return 40;
}

function contractorsFromRegistry(equipmentRegistry) {
  return Array.from(new Set((equipmentRegistry || []).map((r) => r.contractor).filter(Boolean)));
}

// ── Simple hand-drawn charts ─────────────────────────────────────────────
// No charting library — same spirit as the app's own hand-rolled SVG donut
// math (Dashboard, Action Tracker), just emitting jsPDF drawing calls
// instead of an SVG path string.

// Converts an absolute point list into jsPDF's lines() relative-segment
// format and fills it as one closed polygon.
function fillPolygon(doc, points, style = "F") {
  if (points.length < 3) return;
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    segs.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  }
  doc.lines(segs, points[0][0], points[0][1], [1, 1], style, true);
}

// slices: [{ value, color }]. Draws each slice as a filled wedge from the
// center, then (for a donut) punches a white hole in the middle — the same
// trick the React donuts use with an overlaid background-color circle.
function drawDonut(doc, { cx, cy, radius, holeRadius = 0, slices }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) {
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(1);
    doc.circle(cx, cy, radius, "S");
    return;
  }
  let angle = -Math.PI / 2;
  slices.forEach((sl) => {
    if (sl.value <= 0) return;
    const sweep = (sl.value / total) * 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 24)));
    const points = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = angle + sweep * (i / steps);
      points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    doc.setFillColor(...sl.color);
    fillPolygon(doc, points, "F");
    angle += sweep;
  });
  if (holeRadius > 0) {
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, holeRadius, "F");
  }
}

// A donut plus a text legend to its right — color swatch, value, label.
function donutWithLegend(doc, { x, y, radius, slices, legendX }) {
  const cy = y + radius;
  drawDonut(doc, { cx: x + radius, cy, radius, holeRadius: radius * 0.55, slices });
  let ly = y + 6;
  slices.forEach((sl) => {
    doc.setFillColor(...sl.color);
    doc.roundedRect(legendX, ly - 8, 9, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...sl.color);
    doc.text(String(sl.value), legendX + 14, ly);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(sl.label, legendX + 34, ly);
    ly += 20;
  });
  doc.setTextColor(20, 26, 33);
  return y + radius * 2 + 16;
}

// One horizontal bar per row, all scaled against a shared max so rows
// (e.g. one per contractor) can be compared at a glance.
function horizontalBars(doc, { x, y, width, rows, maxValue, barHeight = 14, gap = 10, valueFormatter, labelWidth = 60 }) {
  const max = maxValue != null ? maxValue : Math.max(1, ...rows.map((r) => r.value));
  const barX = x + labelWidth;
  const barW = width - labelWidth - 40;
  rows.forEach((r, i) => {
    const ry = y + i * (barHeight + gap);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.navy);
    doc.text(r.label, x, ry + barHeight - 3, { maxWidth: labelWidth - 6 });
    doc.setFillColor(...BRAND.border);
    doc.roundedRect(barX, ry, barW, barHeight, 3, 3, "F");
    const filledW = r.value > 0 ? Math.max(barW * 0.02, (r.value / max) * barW) : 0;
    if (filledW > 0) {
      doc.setFillColor(...(r.color || BRAND.teal));
      doc.roundedRect(barX, ry, filledW, barHeight, 3, 3, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...(r.color || BRAND.teal));
    doc.text(valueFormatter ? valueFormatter(r.value) : String(r.value), barX + barW + 6, ry + barHeight - 3);
  });
  doc.setTextColor(20, 26, 33);
  return y + rows.length * (barHeight + gap);
}

// Stacked bar per row (e.g. one contractor's Open / In Progress / Waiting
// Stoppage split), each row's total bar length scaled against the largest
// row total so contractor workloads stay comparable.
function stackedBars(doc, { x, y, width, rows, barHeight = 16, gap = 12, labelWidth = 60 }) {
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((s, sg) => s + sg.value, 0)));
  const barX = x + labelWidth;
  const barW = width - labelWidth - 46;
  rows.forEach((r, i) => {
    const ry = y + i * (barHeight + gap);
    const total = r.segments.reduce((s, sg) => s + sg.value, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.navy);
    doc.text(r.label, x, ry + barHeight - 4, { maxWidth: labelWidth - 6 });
    doc.setFillColor(...BRAND.border);
    doc.roundedRect(barX, ry, barW, barHeight, 3, 3, "F");
    const scaledTotalW = (total / max) * barW;
    let segX = barX;
    if (total > 0) {
      r.segments.forEach((sg) => {
        if (sg.value <= 0) return;
        const segW = (sg.value / total) * scaledTotalW;
        doc.setFillColor(...sg.color);
        doc.rect(segX, ry, segW, barHeight, "F");
        segX += segW;
      });
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.navy);
    doc.text(String(total), barX + barW + 6, ry + barHeight - 4);
  });
  doc.setTextColor(20, 26, 33);
  return y + rows.length * (barHeight + gap);
}

// Small color-swatch + label row used above a chart to explain its colors.
function chartLegend(doc, items, x, y) {
  let lx = x;
  items.forEach((it) => {
    doc.setFillColor(...it.color);
    doc.roundedRect(lx, y - 7, 8, 8, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(it.label, lx + 12, y);
    lx += 12 + doc.getTextWidth(it.label) + 18;
  });
  doc.setTextColor(20, 26, 33);
  return y + 16;
}

// ── Section 1: Contractor Action Status ─────────────────────────────────
// Focused on the active statuses — Draft, Open, Waiting Stoppage, Closure
// Requested (Phase 2) — since Closed actions are history, not something a
// contractor needs to act on.
const FOCUS_STATUSES = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];

function buildActionSection(doc, { actions, equipmentRegistry, contractor = "All" }, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const registryByCode = {};
  (equipmentRegistry || []).forEach((r) => (registryByCode[r.code] = r));
  const contractorOf = (a) => a.contractor || registryByCode[a.equipmentCode]?.contractor || "Unassigned";

  let active = (actions || []).filter((a) => FOCUS_STATUSES.includes(a.status));
  if (contractor !== "All") active = active.filter((a) => contractorOf(a) === contractor);

  const byContractor = {};
  active.forEach((a) => (byContractor[contractorOf(a)] ||= []).push(a));
  const contractors = Object.keys(byContractor).sort((a, b) => byContractor[b].length - byContractor[a].length);

  const oldestOverall = active.reduce((m, a) => Math.max(m, daysSince(a.revisionDate) ?? 0), 0);
  const narrative =
    contractor === "All"
      ? `This report covers every Draft, Open, Waiting Stoppage and Closure Requested action across all contractors as of ${formatDate(new Date().toISOString())}. Closed actions are excluded — they no longer need contractor attention.`
      : `This report covers every Draft, Open, Waiting Stoppage and Closure Requested action assigned to ${contractor} as of ${formatDate(new Date().toISOString())}. Closed actions are excluded — they no longer need contractor attention.`;
  y = summaryParagraph(doc, narrative, y);

  y = statStrip(
    doc,
    [
      { value: active.length, label: "TOTAL ACTIONS", color: BRAND.navy },
      { value: active.filter((a) => a.status === "Open").length, label: "OPEN", color: BRAND.danger },
      { value: active.filter((a) => a.status === "Draft").length, label: "DRAFT", color: BRAND.warning },
      { value: active.filter((a) => a.status === "Waiting Stoppage").length, label: "WAITING STOPPAGE", color: BRAND.accent },
      { value: active.filter((a) => a.status === "Closure Requested").length, label: "CLOSURE REQ.", color: BRAND.navy },
      { value: `${oldestOverall}d`, label: "OLDEST OPEN", color: BRAND.navy },
    ],
    y
  );
  y += 14;

  if (contractors.length > 0) {
    const chartRows = contractors.map((c) => ({
      label: c,
      segments: [
        { value: byContractor[c].filter((a) => a.status === "Open").length, color: BRAND.danger },
        { value: byContractor[c].filter((a) => a.status === "Draft").length, color: BRAND.warning },
        { value: byContractor[c].filter((a) => a.status === "Waiting Stoppage").length, color: BRAND.accent },
        { value: byContractor[c].filter((a) => a.status === "Closure Requested").length, color: BRAND.navy },
      ],
    }));
    y = needsNewPage(doc, y, chartRows.length * 28 + 60);
    y = sectionTitle(doc, "Actions by Contractor", y);
    y = chartLegend(
      doc,
      [
        { label: "Open", color: BRAND.danger },
        { label: "Draft", color: BRAND.warning },
        { label: "Waiting Stoppage", color: BRAND.accent },
        { label: "Closure Requested", color: BRAND.navy },
      ],
      36,
      y
    );
    y += 4;
    y = stackedBars(doc, { x: 36, y, width: pageWidth - 72, rows: chartRows });
    y += 18;
  }

  if (contractor === "All") {
    y = needsNewPage(doc, y, 100);
    y = sectionTitle(doc, "Summary by Contractor", y);
    const summaryRows = contractors.map((c) => {
      const list = byContractor[c];
      const oldest = list.reduce((m, a) => Math.max(m, daysSince(a.revisionDate) ?? 0), 0);
      return [
        c,
        list.filter((a) => a.status === "Open").length,
        list.filter((a) => a.status === "Draft").length,
        list.filter((a) => a.status === "Waiting Stoppage").length,
        list.filter((a) => a.status === "Closure Requested").length,
        list.length,
        `${oldest}d`,
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [["Contractor", "Open", "Draft", "Waiting Stoppage", "Closure Requested", "Total", "Oldest Open"]],
      body: summaryRows.length ? summaryRows : [["No active actions right now", "", "", "", "", "", ""]],
      theme: "grid",
      headStyles: { fillColor: BRAND.navy, textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 5, lineColor: BRAND.border, lineWidth: 0.5 },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  const detailHead = ["Ac. No", "Equipment", "Description", "Oil Type", "Status", "Days Open", "Contractor Action", "Agreed Action"];
  contractors.forEach((c) => {
    y = needsNewPage(doc, y, 130);
    y = sectionTitle(
      doc,
      contractor === "All"
        ? `${c} — ${byContractor[c].length} action${byContractor[c].length === 1 ? "" : "s"}`
        : "Active Actions (Draft / Open / Waiting Stoppage / Closure Requested)",
      y
    );
    const rows = [...byContractor[c]]
      .sort((a, b) => (daysSince(b.revisionDate) ?? 0) - (daysSince(a.revisionDate) ?? 0))
      .map((a) => [
        a.acNo || "—",
        a.equipmentCode || "—",
        a.description || "—",
        a.oilType || "—",
        a.status,
        daysSince(a.revisionDate) == null ? "—" : `${daysSince(a.revisionDate)}d`,
        a.contractorAction || "—",
        a.agreedAction || "—",
      ]);
    autoTable(doc, {
      startY: y,
      head: [detailHead],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
      columnStyles: { 2: { cellWidth: 90 }, 6: { cellWidth: 80 }, 7: { cellWidth: 100 } },
      margin: { left: 36, right: 36 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 4) {
          data.cell.styles.textColor = ACTION_STATUS_COLOR[data.cell.raw] || BRAND.muted;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 24;
  });

  if (contractors.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text("Nothing to report — no active actions on record.", 36, y);
    doc.setTextColor(20, 26, 33);
    y += 20;
  }

  return y;
}

export async function generateContractorActionReport({ actions, equipmentRegistry, contractor = "All" }) {
  const doc = await newDoc("Contractor Action Status Report", scopeLineFor(contractor));
  buildActionSection(doc, { actions, equipmentRegistry, contractor }, 98);
  addFooter(doc);
  doc.save(`Contractor-Action-Status-Report${fileSuffixFor(contractor)}-${toFileDate()}.pdf`);
}

// ── Section 2: Oil Change Log — Contractor Performance ──────────────────
// On-time% / closure-rate% definitions matching the Dashboard's own
// Contractor Performance card, plus a dedicated overdue-equipment table
// sorted most overdue first.
function buildOilChangeSection(doc, { oilChanges, equipmentRegistry, actions, contractor = "All" }, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const registryByCode = {};
  (equipmentRegistry || []).forEach((r) => (registryByCode[r.code] = r));
  const allContractors = contractorsFromRegistry(equipmentRegistry);
  const contractorList = contractor === "All" ? allContractors : allContractors.filter((c) => c === contractor);

  const stats = contractorList.map((c) => {
    const codes = new Set((equipmentRegistry || []).filter((r) => r.contractor === c).map((r) => r.code));
    const points = (oilChanges || []).filter((o) => codes.has(o.equipmentCode));
    const overdue = points.filter((o) => o.status === "Overdue");
    const onTimePct = points.length ? Math.round(((points.length - overdue.length) / points.length) * 100) : null;
    const contractorActions = (actions || []).filter((a) => a.contractor === c);
    const closureRatePct = contractorActions.length
      ? Math.round((contractorActions.filter((a) => a.status === "Closed").length / contractorActions.length) * 100)
      : null;
    return { name: c, total: points.length, overdue: overdue.length, onTimePct, closureRatePct };
  });
  stats.sort((a, b) => b.overdue - a.overdue);

  const scopedCodes =
    contractor === "All" ? null : new Set((equipmentRegistry || []).filter((r) => r.contractor === contractor).map((r) => r.code));
  const overdueList = [...(oilChanges || [])]
    .filter((o) => o.status === "Overdue")
    .filter((o) => !scopedCodes || scopedCodes.has(o.equipmentCode))
    .sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0));

  const narrative =
    contractor === "All"
      ? `This report summarizes on-time oil change performance and action closure rate for every contractor, then lists every currently overdue lubrication point ordered from most to least overdue.`
      : `This report summarizes ${contractor}'s on-time oil change performance and action closure rate, then lists every currently overdue lubrication point assigned to ${contractor}, ordered from most to least overdue.`;
  y = summaryParagraph(doc, narrative, y);

  const overallOnTime = stats.length
    ? Math.round(
        (stats.reduce((sum, s) => sum + (s.total - s.overdue), 0) /
          Math.max(
            1,
            stats.reduce((sum, s) => sum + s.total, 0)
          )) *
          100
      )
    : null;
  y = statStrip(
    doc,
    [
      { value: stats.reduce((sum, s) => sum + s.total, 0), label: "TOTAL POINTS", color: BRAND.navy },
      { value: overdueList.length, label: "OVERDUE NOW", color: BRAND.danger },
      { value: overallOnTime == null ? "—" : `${overallOnTime}%`, label: "ON-TIME %", color: BRAND.success },
    ],
    y
  );
  y += 14;

  if (stats.length > 0) {
    y = needsNewPage(doc, y, stats.length * 24 * 2 + 100);
    y = sectionTitle(doc, "On-Time Oil Changes %", y);
    y = horizontalBars(doc, {
      x: 36,
      y,
      width: pageWidth - 72,
      rows: stats.map((s) => ({ label: s.name, value: s.onTimePct ?? 0, color: BRAND.teal })),
      maxValue: 100,
      valueFormatter: (v) => `${v}%`,
    });
    y += 18;

    y = needsNewPage(doc, y, stats.length * 24 + 60);
    y = sectionTitle(doc, "Action Closure %", y);
    y = horizontalBars(doc, {
      x: 36,
      y,
      width: pageWidth - 72,
      rows: stats.map((s) => ({ label: s.name, value: s.closureRatePct ?? 0, color: BRAND.accent })),
      maxValue: 100,
      valueFormatter: (v) => `${v}%`,
    });
    y += 18;
  }

  y = needsNewPage(doc, y, 100);
  y = sectionTitle(doc, "Contractor Performance", y);
  autoTable(doc, {
    startY: y,
    head: [["Contractor", "Total Points", "Overdue", "On-Time %", "Action Closure %"]],
    body: stats.length
      ? stats.map((s) => [
          s.name,
          s.total,
          s.overdue,
          s.onTimePct == null ? "—" : `${s.onTimePct}%`,
          s.closureRatePct == null ? "—" : `${s.closureRatePct}%`,
        ])
      : [["No contractors on record", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: BRAND.navy, textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: BRAND.border, lineWidth: 0.5 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && Number(data.cell.raw) > 0) {
        data.cell.styles.textColor = BRAND.danger;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 24;

  y = needsNewPage(doc, y, 130);
  y = sectionTitle(doc, `Overdue Equipment — ${overdueList.length} point${overdueList.length === 1 ? "" : "s"}`, y);
  const overdueRows = overdueList.map((o) => {
    const reg = registryByCode[o.equipmentCode];
    const days = daysSince(o.nextDueDate);
    return [
      o.equipmentCode,
      reg?.description || o.assetName || "—",
      reg?.area || "—",
      o.lubricationPoint || "—",
      o.oilType || reg?.lubricant || "—",
      reg?.contractor || "—",
      formatDate(o.nextDueDate) || "—",
      days == null ? "—" : `${days}d`,
    ];
  });
  autoTable(doc, {
    startY: y,
    head: [["Equipment", "Description", "Area", "Point", "Oil Type", "Contractor", "Next Due", "Days Overdue"]],
    body: overdueRows.length ? overdueRows : [["No overdue oil changes right now", "", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        data.cell.styles.textColor = BRAND.danger;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 24;

  return y;
}

export async function generateOilChangeContractorReport({ oilChanges, equipmentRegistry, actions, contractor = "All" }) {
  const doc = await newDoc("Oil Change Log — Contractor Performance Report", scopeLineFor(contractor));
  buildOilChangeSection(doc, { oilChanges, equipmentRegistry, actions, contractor }, 98);
  addFooter(doc);
  doc.save(`Oil-Change-Contractor-Performance-Report${fileSuffixFor(contractor)}-${toFileDate()}.pdf`);
}

// ── Section 3: Oil Sample Missing / Overdue ─────────────────────────────
// Same OK/OVERDUE/MISSING classification as the Sample Tracker page
// (sampleTrackerStatus, against each equipment's own sampling interval),
// listing only what's flagged — MISSING first, then OVERDUE, worst first.
function buildSampleSection(doc, { trackerByEquip, equipmentRegistry, contractor = "All" }, y) {
  let registry = equipmentRegistry || [];
  if (contractor !== "All") registry = registry.filter((r) => r.contractor === contractor);

  const rows = registry.map((eq) => {
    const history = (trackerByEquip || {})[eq.code] || [];
    const lastDate = history[0]?.date || "";
    const status = sampleTrackerStatus(lastDate, eq.interval);
    return { eq, lastDate, status, sortDays: sampleOverdueDays(lastDate, eq.interval) ?? -999999 };
  });

  const counts = {
    OK: rows.filter((r) => r.status.label === "OK").length,
    OVERDUE: rows.filter((r) => r.status.label === "OVERDUE").length,
    MISSING: rows.filter((r) => r.status.label === "MISSING").length,
  };

  const flagged = rows
    .filter((r) => r.status.label !== "OK")
    .sort((a, b) => {
      if (a.status.label !== b.status.label) return a.status.label === "MISSING" ? -1 : 1;
      return b.sortDays - a.sortDays;
    });

  const narrative =
    contractor === "All"
      ? `This report lists every piece of equipment whose oil sample is overdue or missing against its own sampling interval, across all contractors.`
      : `This report lists every piece of equipment assigned to ${contractor} whose oil sample is overdue or missing against its own sampling interval.`;
  y = summaryParagraph(doc, narrative, y);

  y = statStrip(
    doc,
    [
      { value: registry.length, label: "TOTAL EQUIPMENT", color: BRAND.navy },
      { value: counts.MISSING, label: "MISSING", color: BRAND.danger },
      { value: counts.OVERDUE, label: "OVERDUE", color: BRAND.warning },
      { value: counts.OK, label: "OK", color: BRAND.success },
    ],
    y
  );
  y += 14;

  if (registry.length > 0) {
    y = needsNewPage(doc, y, 150);
    y = sectionTitle(doc, "Sample Status Distribution", y);
    const donutY = y;
    y = donutWithLegend(doc, {
      x: 36,
      y: donutY,
      radius: 40,
      slices: [
        { value: counts.OK, label: "OK", color: BRAND.success },
        { value: counts.OVERDUE, label: "Overdue", color: BRAND.warning },
        { value: counts.MISSING, label: "Missing", color: BRAND.danger },
      ],
      legendX: 36 + 40 * 2 + 24,
    });
    y += 4;
  }

  y = needsNewPage(doc, y, 130);
  y = sectionTitle(doc, `Overdue / Missing Samples — ${flagged.length}`, y);
  const bodyRows = flagged.map(({ eq, lastDate, status }) => [
    eq.code,
    eq.description || "—",
    eq.area || "—",
    eq.contractor || "—",
    eq.interval || "—",
    lastDate ? formatDate(lastDate) : "Never sampled",
    status.label,
    status.daysInfo || "—",
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Equipment", "Description", "Area", "Contractor", "Interval", "Last Sample", "Status", "Details"]],
    body: bodyRows.length ? bodyRows : [["No overdue or missing samples right now", "", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        data.cell.styles.textColor = data.cell.raw === "MISSING" ? BRAND.danger : BRAND.warning;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 24;

  return y;
}

export async function generateSampleOverdueReport({ trackerByEquip, equipmentRegistry, contractor = "All" }) {
  const doc = await newDoc("Oil Sample Missing / Overdue Report", scopeLineFor(contractor));
  buildSampleSection(doc, { trackerByEquip, equipmentRegistry, contractor }, 98);
  addFooter(doc);
  doc.save(`Oil-Sample-Missing-Overdue-Report${fileSuffixFor(contractor)}-${toFileDate()}.pdf`);
}

// ── Combined report: all three sections in one PDF ──────────────────────
export async function generateCombinedReport({ actions, oilChanges, equipmentRegistry, trackerByEquip, contractor = "All" }) {
  const doc = await newDoc("Oil Analysis Report", scopeLineFor(contractor));
  let y = 98;

  y = bigSectionHeader(doc, "1. Contractor Action Status", y);
  y = buildActionSection(doc, { actions, equipmentRegistry, contractor }, y);

  doc.addPage();
  y = bigSectionHeader(doc, "2. Oil Change Log — Contractor Performance", 50);
  y = buildOilChangeSection(doc, { oilChanges, equipmentRegistry, actions, contractor }, y);

  doc.addPage();
  y = bigSectionHeader(doc, "3. Oil Sample Missing / Overdue", 50);
  buildSampleSection(doc, { trackerByEquip, equipmentRegistry, contractor }, y);

  addFooter(doc);
  doc.save(`Combined-Maintenance-Report${fileSuffixFor(contractor)}-${toFileDate()}.pdf`);
}

// ── Section 5: Monthly Activity Summary (Patch 13, plant-readiness pass) ──
// Distinct in KIND from the four reports above: those all show CURRENT
// state (what's open right now, what's overdue as of today) — this one
// shows THROUGHPUT for a specific period (what actually got done), which
// is what a monthly management review usually asks for and none of the
// above answers. "Period" is a calendar month ("YYYY-MM", from a native
// <input type="month">) rather than an arbitrary date range — matches how
// this gets asked for in practice ("September's numbers") without a full
// date-range picker.
//
// Every date field already in these objects (sampledDate, eventDate,
// completedDate, …) is display-formatted by its own row-parser
// (parsers.js), not raw ISO — re-parsing a formatted string with
// new Date() is the SAME thing daysSince() above already does throughout
// this file, not a new risk introduced here.
function inPeriod(dateStr, year, monthIndex) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

function monthLabel(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return month || "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Shared by both the PDF section builder and the CSV export below, so
// there's exactly one place that decides what counts as "this period"
// for each dataset — same reasoning as this file's other section
// builders being reused by the Combined report.
function collectMonthlyActivity({ samples, oilChangeEvents, actions, equipmentRegistry, contractor = "All", month }) {
  const [year, m] = String(month || "").split("-").map(Number);
  const monthIndex = (m || 1) - 1;
  const registryByCode = {};
  (equipmentRegistry || []).forEach((r) => (registryByCode[r.code] = r));
  const contractorOfSample = (sm) => registryByCode[sm.unitId]?.contractor || "Unassigned";
  const contractorOfAction = (a) => a.contractor || registryByCode[a.equipmentCode]?.contractor || "Unassigned";

  let periodSamples = (samples || []).filter((sm) => inPeriod(sm.sampledDate, year, monthIndex));
  if (contractor !== "All") periodSamples = periodSamples.filter((sm) => contractorOfSample(sm) === contractor);

  let periodOilChanges = (oilChangeEvents || []).filter((ev) => inPeriod(ev.eventDate, year, monthIndex));
  if (contractor !== "All") periodOilChanges = periodOilChanges.filter((ev) => (ev.contractor || "Unassigned") === contractor);

  // "Closed" actions only — matches buildActionSection's own definition
  // of what an action report cares about, just inverted (that one shows
  // what's still open; this shows what got resolved in the period).
  let periodClosedActions = (actions || []).filter((a) => a.status === "Closed" && inPeriod(a.completedDate, year, monthIndex));
  if (contractor !== "All") periodClosedActions = periodClosedActions.filter((a) => contractorOfAction(a) === contractor);

  // Backlog context, not period-filtered on purpose — "still open" means
  // right now, regardless of which month it was originally raised in.
  let stillOpen = (actions || []).filter((a) => a.status !== "Closed");
  if (contractor !== "All") stillOpen = stillOpen.filter((a) => contractorOfAction(a) === contractor);

  return { periodSamples, periodOilChanges, periodClosedActions, stillOpen };
}

function buildMonthlyActivitySection(doc, { samples, oilChangeEvents, actions, equipmentRegistry, contractor = "All", month }, y) {
  const { periodSamples, periodOilChanges, periodClosedActions, stillOpen } = collectMonthlyActivity({
    samples, oilChangeEvents, actions, equipmentRegistry, contractor, month,
  });

  const narrative =
    contractor === "All"
      ? `This report covers everything recorded across all contractors during ${monthLabel(month)} — samples taken, oil changes performed, and actions closed. It's a period summary, not a current-state snapshot: an action still open today but raised in an earlier month won't appear in the "closed" count below, but IS included in the ongoing backlog figure.`
      : `This report covers everything recorded for ${contractor} during ${monthLabel(month)} — samples taken, oil changes performed, and actions closed — plus ${contractor}'s ongoing backlog as of today.`;
  y = summaryParagraph(doc, narrative, y);

  y = statStrip(
    doc,
    [
      { value: periodSamples.length, label: "SAMPLES TAKEN", color: BRAND.accent },
      { value: periodOilChanges.length, label: "OIL CHANGES DONE", color: BRAND.warning },
      { value: periodClosedActions.length, label: "ACTIONS CLOSED", color: BRAND.success },
      { value: stillOpen.length, label: "STILL OPEN (BACKLOG)", color: BRAND.danger },
    ],
    y
  );
  y += 14;

  if (periodSamples.length > 0) {
    const statusCounts = { Normal: 0, Caution: 0, Alert: 0 };
    periodSamples.forEach((sm) => { statusCounts[sm.reportStatus] = (statusCounts[sm.reportStatus] || 0) + 1; });
    y = needsNewPage(doc, y, 110);
    y = sectionTitle(doc, "Samples Taken", y);
    y = donutWithLegend(doc, {
      x: 36,
      y,
      radius: 34,
      slices: [
        { value: statusCounts.Normal || 0, label: "Normal", color: BRAND.success },
        { value: statusCounts.Caution || 0, label: "Caution", color: BRAND.warning },
        { value: statusCounts.Alert || 0, label: "Alert", color: BRAND.danger },
      ],
      legendX: 130,
    });
    y += 6;
    const sampleRows = [...periodSamples]
      .sort((a, b) => new Date(a.sampledDate) - new Date(b.sampledDate))
      .map((sm) => [formatDate(sm.sampledDate), sm.unitId || "—", sm.reportStatus || "—"]);
    y = needsNewPage(doc, y, 80);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Equipment", "Result"]],
      body: sampleRows,
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  y = needsNewPage(doc, y, 90);
  y = sectionTitle(doc, "Oil Changes Performed", y);
  const ocRows = [...periodOilChanges]
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
    .map((ev) => [formatDate(ev.eventDate), ev.lpId || "—", ev.doneBy || "—", ev.contractor || "—"]);
  autoTable(doc, {
    startY: y,
    head: [["Date", "Lubrication Point", "Done By", "Contractor"]],
    body: ocRows.length ? ocRows : [["No oil changes recorded this period", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
  });
  y = doc.lastAutoTable.finalY + 24;

  y = needsNewPage(doc, y, 90);
  y = sectionTitle(doc, "Actions Closed", y);
  const closedRows = [...periodClosedActions]
    .sort((a, b) => new Date(a.completedDate) - new Date(b.completedDate))
    .map((a) => {
      const closedDays =
        a.completedDate && a.revisionDate && !isNaN(new Date(a.completedDate)) && !isNaN(new Date(a.revisionDate))
          ? Math.round((new Date(a.completedDate) - new Date(a.revisionDate)) / 86400000)
          : null;
      return [formatDate(a.completedDate), a.equipmentCode || "—", a.agreedAction || a.description || "—", closedDays == null ? "—" : `${closedDays}d`];
    });
  autoTable(doc, {
    startY: y,
    head: [["Closed", "Equipment", "Action", "Days to Close"]],
    body: closedRows.length ? closedRows : [["No actions closed this period", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    columnStyles: { 2: { cellWidth: 200 } },
    margin: { left: 36, right: 36 },
  });
  y = doc.lastAutoTable.finalY + 24;

  return y;
}

export async function generateMonthlyActivitySummary({ samples, oilChangeEvents, actions, equipmentRegistry, contractor = "All", month }) {
  const doc = await newDoc(`Monthly Activity Summary — ${monthLabel(month)}`, scopeLineFor(contractor));
  buildMonthlyActivitySection(doc, { samples, oilChangeEvents, actions, equipmentRegistry, contractor, month }, 98);
  addFooter(doc);
  doc.save(`Monthly-Activity-Summary${fileSuffixFor(contractor)}-${month}.pdf`);
}

// Live preview numbers for the Reports page's card, before generating
// anything — same data collectMonthlyActivity already computes, just
// exposed directly instead of needing a second, separate pass over the
// same arrays in Reports.jsx.
export function monthlyActivityPreview({ samples, oilChangeEvents, actions, equipmentRegistry, contractor = "All", month }) {
  const { periodSamples, periodOilChanges, periodClosedActions, stillOpen } = collectMonthlyActivity({
    samples, oilChangeEvents, actions, equipmentRegistry, contractor, month,
  });
  return {
    samplesTaken: periodSamples.length,
    oilChangesDone: periodOilChanges.length,
    actionsClosed: periodClosedActions.length,
    stillOpen: stillOpen.length,
  };
}

// ── CSV export (Patch 13) ─────────────────────────────────────────────────
// The "Excel" half of "monthly PDF/Excel summary": a plain CSV (not a true
// .xlsx) so this needs no new dependency and no bundle-size cost — CSV
// opens directly in Excel with no friction, same pragmatic choice already
// made elsewhere in this codebase (e.g. Patch 8's simple-pairing
// equivalence instead of full equivalence groups) when a lighter option
// covers the real need just as well.
function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(cells) {
  return cells.map(csvEscape).join(",");
}

export function exportMonthlyActivityCsv({ samples, oilChangeEvents, actions, equipmentRegistry, contractor = "All", month }) {
  const { periodSamples, periodOilChanges, periodClosedActions } = collectMonthlyActivity({
    samples, oilChangeEvents, actions, equipmentRegistry, contractor, month,
  });

  const lines = [];
  lines.push(csvRow([`Monthly Activity Summary - ${monthLabel(month)} - ${scopeLineFor(contractor)}`]));
  lines.push("");
  lines.push(csvRow(["SAMPLES TAKEN"]));
  lines.push(csvRow(["Date", "Equipment", "Result"]));
  periodSamples.forEach((sm) => lines.push(csvRow([sm.sampledDate, sm.unitId, sm.reportStatus])));
  lines.push("");
  lines.push(csvRow(["OIL CHANGES PERFORMED"]));
  lines.push(csvRow(["Date", "Lubrication Point", "Done By", "Contractor"]));
  periodOilChanges.forEach((ev) => lines.push(csvRow([ev.eventDate, ev.lpId, ev.doneBy, ev.contractor])));
  lines.push("");
  lines.push(csvRow(["ACTIONS CLOSED"]));
  lines.push(csvRow(["Closed Date", "Equipment", "Action", "Days to Close"]));
  periodClosedActions.forEach((a) => {
    const closedDays =
      a.completedDate && a.revisionDate && !isNaN(new Date(a.completedDate)) && !isNaN(new Date(a.revisionDate))
        ? Math.round((new Date(a.completedDate) - new Date(a.revisionDate)) / 86400000)
        : "";
    lines.push(csvRow([a.completedDate, a.equipmentCode, a.agreedAction || a.description || "", closedDays]));
  });

  // Leading BOM so Excel opens the UTF-8 file correctly instead of
  // mis-rendering any accented characters as garbled text.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Monthly-Activity-Summary${fileSuffixFor(contractor)}-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════
// Oil Reports (user-requested rebuild): a single "+ New Report" screen
// (NewReport.jsx) with one checklist, grouped exactly as the user laid
// out — Condition Based Oil / Time Based Oil / Inventory Status / Forecast
// — instead of today's one-card-per-report grid above. Generates ONE
// output (PDF with charts, or a data-only multi-sheet Excel workbook —
// confirmed directly by the user: "we can generate charts on pdf, but
// excel keep focus only on data") containing only the sections checked.
//
// "Condition Based" vs "Time Based" is NOT a new classification invented
// for this feature — it's the Equipment/LP Register's own existing
// Oil_Analysis_Required / Oil_Change_Interval fields (confirmed directly
// by the user: "we already know from equipment register which equipment
// related to oil analysis and which equipment has time base changes").
// ═══════════════════════════════════════════════════════════════════════

export const CONDITION_SCOPE = (eq) => String(eq?.oilAnalysisRequired || "").trim().toLowerCase() === "yes";
// Time Based is the COMPLEMENT of Condition Based, not "has an Oil Change
// Interval filled in" — real Equipment Register rows don't always have
// that text field populated even when they genuinely have a fixed-interval
// oil change logged against them, which was silently dropping overdue
// points out of every Time Based section. Every LP is one or the other,
// never neither, so this guarantees nothing falls through the cracks.
export const TIME_SCOPE = (eq) => !CONDITION_SCOPE(eq);

function registryByCodeMap(equipmentRegistry) {
  const map = {};
  (equipmentRegistry || []).forEach((r) => (map[r.code] = r));
  return map;
}

// Shared by every "overdue oil changes" section (condition- and time-
// scoped alike) — same contractor-performance math buildOilChangeSection
// already used, just additionally filtered by which equipment the LP
// belongs to (via `scopeFilter` over the Equipment Register).
function scopedOilChangeStats({ oilChanges, equipmentRegistry, actions, contractor = "All", scopeFilter }) {
  const regByCode = registryByCodeMap(equipmentRegistry);
  const inScope = (code) => {
    const reg = regByCode[code];
    return reg && scopeFilter(reg) && (contractor === "All" || reg.contractor === contractor);
  };
  const points = (oilChanges || []).filter((o) => inScope(o.equipmentCode));
  const overdueList = points
    .filter((o) => o.status === "Overdue")
    .sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0));

  const contractors =
    contractor === "All"
      ? Array.from(new Set((equipmentRegistry || []).filter(scopeFilter).map((r) => r.contractor).filter(Boolean)))
      : [contractor];
  const stats = contractors.map((c) => {
    const cPoints = points.filter((o) => regByCode[o.equipmentCode]?.contractor === c);
    const overdue = cPoints.filter((o) => o.status === "Overdue");
    const onTimePct = cPoints.length ? Math.round(((cPoints.length - overdue.length) / cPoints.length) * 100) : null;
    const cActions = (actions || []).filter((a) => {
      const reg = regByCode[a.equipmentCode];
      return (a.contractor || reg?.contractor) === c && reg && scopeFilter(reg);
    });
    const closureRatePct = cActions.length ? Math.round((cActions.filter((a) => a.status === "Closed").length / cActions.length) * 100) : null;
    return { name: c, total: cPoints.length, overdue: overdue.length, onTimePct, closureRatePct };
  });
  stats.sort((a, b) => b.overdue - a.overdue);

  return { points, overdueList, stats, regByCode };
}

// Horizontal bar chart of how many items in `list` belong to each Area
// (via each item's own `equipmentCode` looked up in `regByCode`), worst
// area first, capped at the top 8 so a long tail of 1-count areas
// doesn't turn into an unreadable chart.
function byAreaChart(doc, { list, regByCode, y, color, title = "By Area" }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const counts = {};
  list.forEach((item) => {
    const area = regByCode[item.equipmentCode]?.area || "Unassigned";
    counts[area] = (counts[area] || 0) + 1;
  });
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, color }));
  if (rows.length === 0) return y;
  y = needsNewPage(doc, y, rows.length * 24 + 50);
  y = sectionTitle(doc, title, y);
  y = horizontalBars(doc, { x: 36, y, width: pageWidth - 72, rows });
  return y + 18;
}

function renderOverdueChangesPdf(doc, { title, narrative, oilChanges, equipmentRegistry, contractor, scopeFilter }, y) {
  const { overdueList, regByCode } = scopedOilChangeStats({ oilChanges, equipmentRegistry, actions: [], contractor, scopeFilter });
  y = summaryParagraph(doc, narrative, y);
  y = statStrip(doc, [{ value: overdueList.length, label: "OVERDUE NOW", color: BRAND.danger }], y);
  y += 10;
  y = byAreaChart(doc, { list: overdueList, regByCode, y, color: BRAND.danger, title: "Overdue by Area" });
  y = needsNewPage(doc, y, 130);
  y = sectionTitle(doc, title, y);
  const rows = overdueList.map((o) => {
    const reg = regByCode[o.equipmentCode];
    const days = daysSince(o.nextDueDate);
    return [
      o.equipmentCode,
      reg?.description || o.assetName || "—",
      reg?.area || "—",
      o.oilType || reg?.lubricant || "—",
      reg?.contractor || "—",
      formatDate(o.nextDueDate) || "—",
      days == null ? "—" : `${days}d`,
    ];
  });
  autoTable(doc, {
    startY: y,
    head: [["Equipment", "Description", "Area", "Oil Type", "Contractor", "Next Due", "Days Overdue"]],
    body: rows.length ? rows : [["Nothing overdue in this scope right now", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        data.cell.styles.textColor = BRAND.danger;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  return doc.lastAutoTable.finalY + 24;
}

function renderPerformancePdf(doc, { title, narrative, oilChanges, equipmentRegistry, actions, contractor, scopeFilter }, y) {
  const { stats } = scopedOilChangeStats({ oilChanges, equipmentRegistry, actions, contractor, scopeFilter });
  const pageWidth = doc.internal.pageSize.getWidth();
  y = summaryParagraph(doc, narrative, y);
  if (stats.length > 0) {
    y = needsNewPage(doc, y, stats.length * 24 * 2 + 100);
    y = sectionTitle(doc, `${title} — On-Time %`, y);
    y = horizontalBars(doc, {
      x: 36, y, width: pageWidth - 72,
      rows: stats.map((s) => ({ label: s.name, value: s.onTimePct ?? 0, color: BRAND.teal })),
      maxValue: 100, valueFormatter: (v) => `${v}%`,
    });
    y += 18;

    y = needsNewPage(doc, y, stats.length * 24 + 60);
    y = sectionTitle(doc, `${title} — Action Closure %`, y);
    y = horizontalBars(doc, {
      x: 36, y, width: pageWidth - 72,
      rows: stats.map((s) => ({ label: s.name, value: s.closureRatePct ?? 0, color: BRAND.accent })),
      maxValue: 100, valueFormatter: (v) => `${v}%`,
    });
    y += 18;
  }
  y = needsNewPage(doc, y, 100);
  autoTable(doc, {
    startY: y,
    head: [["Contractor", "Total Points", "Overdue", "On-Time %", "Action Closure %"]],
    body: stats.length
      ? stats.map((s) => [s.name, s.total, s.overdue, s.onTimePct == null ? "—" : `${s.onTimePct}%`, s.closureRatePct == null ? "—" : `${s.closureRatePct}%`])
      : [["No contractors in this scope", "", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: BRAND.navy, textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: BRAND.border, lineWidth: 0.5 },
    margin: { left: 36, right: 36 },
  });
  return doc.lastAutoTable.finalY + 24;
}

// ── Condition Based Oil ──────────────────────────────────────────────────

function buildOilHealthPdf(doc, { trackerByEquip, equipmentRegistry, contractor }, y) {
  let registry = equipmentRegistry || [];
  if (contractor !== "All") registry = registry.filter((r) => r.contractor === contractor);
  const counts = { Normal: 0, Caution: 0, Alert: 0 };
  registry.forEach((eq) => {
    (trackerByEquip?.[eq.code] || []).forEach((entry) => {
      const bucket = conditionBucket(entry.status);
      if (bucket) counts[bucket]++;
    });
  });
  const total = counts.Normal + counts.Caution + counts.Alert;
  const normalPct = total > 0 ? Math.round((counts.Normal / total) * 100) : null;

  y = summaryParagraph(
    doc,
    `Share of lab results currently on record that came back Normal vs. Caution vs. Alert${contractor === "All" ? " across all contractors" : ` for ${contractor}`}, using the same classification as Oil Sampling Log's own Condition Trend.`,
    y
  );
  y = statStrip(doc, [{ value: normalPct == null ? "—" : `${normalPct}%`, label: "NORMAL", color: BRAND.success }], y);
  y += 10;
  if (total > 0) {
    y = needsNewPage(doc, y, 110);
    y = sectionTitle(doc, "Result Distribution", y);
    y = donutWithLegend(doc, {
      x: 36, y, radius: 36,
      slices: [
        { value: counts.Normal, label: "Normal", color: BRAND.success },
        { value: counts.Caution, label: "Caution", color: BRAND.warning },
        { value: counts.Alert, label: "Alert", color: BRAND.danger },
      ],
      legendX: 130,
    });
    y += 6;
  }
  return y;
}
function oilHealthRows({ trackerByEquip, equipmentRegistry, contractor }) {
  let registry = equipmentRegistry || [];
  if (contractor !== "All") registry = registry.filter((r) => r.contractor === contractor);
  const rows = [];
  registry.forEach((eq) => {
    (trackerByEquip?.[eq.code] || []).forEach((entry) => {
      const bucket = conditionBucket(entry.status);
      if (bucket) rows.push([eq.code, eq.description || "—", eq.area || "—", eq.contractor || "—", entry.date || "—", entry.status || "—"]);
    });
  });
  return rows;
}

// Condition Based "overdue oil change" is NOT the same due-date math the
// Time Based section uses — confirmed directly by the user: a condition-
// based point has no fixed calendar interval to be late against, so
// "overdue" here instead means there's a genuinely overdue OPEN ACTION
// (using Action Tracker's own >14-day aging threshold — see ageDays/
// ActionTracker.jsx) whose Agreed Action calls for an oil change.
// agreedAction/contractorAction can hold a comma-separated multi-select
// list (see MultiSelectTags.jsx), so this checks membership, not equality.
const ACTION_OVERDUE_DAYS = 14;
function hasChangeOilAction(a) {
  const inList = (text) => String(text || "").split(",").map((s) => s.trim()).includes("Change Oil");
  return inList(a.agreedAction) || inList(a.contractorAction);
}
function scopedConditionOverdueActions({ actions, equipmentRegistry, contractor = "All" }) {
  const regByCode = registryByCodeMap(equipmentRegistry);
  const inScope = (code) => {
    const reg = regByCode[code];
    return reg && CONDITION_SCOPE(reg) && (contractor === "All" || reg.contractor === contractor);
  };
  const items = (actions || [])
    .filter((a) => inScope(a.equipmentCode))
    .filter((a) => FOCUS_STATUSES.includes(a.status))
    .filter((a) => (daysSince(a.revisionDate) ?? 0) > ACTION_OVERDUE_DAYS)
    .filter(hasChangeOilAction)
    .sort((a, b) => (daysSince(b.revisionDate) ?? 0) - (daysSince(a.revisionDate) ?? 0));
  return { items, regByCode };
}

function buildConditionOverdueChangesPdf(doc, { actions, equipmentRegistry, contractor }, y) {
  const { items, regByCode } = scopedConditionOverdueActions({ actions, equipmentRegistry, contractor });
  const narrative = `Every condition-based lubrication point (Oil Analysis Required = Yes in the Equipment Register) with an open action, more than ${ACTION_OVERDUE_DAYS} days old, whose Agreed Action is Change Oil${contractor === "All" ? "" : `, scoped to ${contractor}`}.`;
  y = summaryParagraph(doc, narrative, y);
  y = statStrip(doc, [{ value: items.length, label: "OVERDUE NOW", color: BRAND.danger }], y);
  y += 10;
  y = byAreaChart(doc, { list: items.map((a) => ({ equipmentCode: a.equipmentCode })), regByCode, y, color: BRAND.danger, title: "Overdue by Area" });
  y = needsNewPage(doc, y, 130);
  y = sectionTitle(doc, "Overdue Oil Changes — Condition Based", y);
  const rows = items.map((a) => {
    const reg = regByCode[a.equipmentCode];
    return [a.equipmentCode, reg?.description || "—", reg?.area || "—", reg?.contractor || "—", `${daysSince(a.revisionDate)}d`, a.agreedAction || a.contractorAction || "—"];
  });
  autoTable(doc, {
    startY: y,
    head: [["Equipment", "Description", "Area", "Contractor", "Days Overdue", "Agreed Action"]],
    body: rows.length ? rows : [["Nothing overdue in this scope right now", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
  });
  return doc.lastAutoTable.finalY + 24;
}
function buildConditionPerformancePdf(doc, { oilChanges, equipmentRegistry, actions, contractor }, y) {
  return renderPerformancePdf(
    doc,
    {
      title: "Condition Based Contractor Performance",
      narrative: `On-time oil-change performance and action closure rate, scoped to condition-based lubrication points only${contractor === "All" ? ", by contractor" : ` for ${contractor}`}.`,
      oilChanges, equipmentRegistry, actions, contractor, scopeFilter: CONDITION_SCOPE,
    },
    y
  );
}

// ── Time Based Oil ───────────────────────────────────────────────────────

function buildTimeOverdueChangesPdf(doc, { oilChanges, equipmentRegistry, contractor }, y) {
  return renderOverdueChangesPdf(
    doc,
    {
      title: "Overdue LP Points — Time Based",
      narrative: `Every time-based lubrication point (any point not flagged Oil Analysis Required = Yes in the Equipment Register) whose oil change is currently overdue${contractor === "All" ? "" : `, scoped to ${contractor}`}.`,
      oilChanges, equipmentRegistry, contractor, scopeFilter: TIME_SCOPE,
    },
    y
  );
}

function routinesInScope(routinesOverview, contractor) {
  let items = routinesOverview || [];
  if (contractor !== "All") items = items.filter((r) => r.contractor === contractor);
  return items;
}

function buildOpenRoutinesPdf(doc, { routinesOverview, contractor }, y) {
  const items = routinesInScope(routinesOverview, contractor).filter((r) => r.dueStatus !== "Completed" && r.dueStatus !== "Cancelled");
  const counts = { Overdue: 0, "Due Soon": 0, "On Schedule": 0, Paused: 0 };
  items.forEach((r) => { if (counts[r.dueStatus] !== undefined) counts[r.dueStatus]++; });

  y = summaryParagraph(doc, `Every recurring route template and standalone routine not yet completed or cancelled${contractor === "All" ? "" : ` for ${contractor}`}, with its current due status.`, y);
  y = statStrip(
    doc,
    [
      { value: items.length, label: "OPEN ROUTINES", color: BRAND.navy },
      { value: counts.Overdue, label: "OVERDUE", color: BRAND.danger },
      { value: counts["Due Soon"], label: "DUE SOON", color: BRAND.warning },
      { value: counts["On Schedule"], label: "ON SCHEDULE", color: BRAND.success },
    ],
    y
  );
  y += 10;
  if (items.length > 0) {
    y = needsNewPage(doc, y, 110);
    y = sectionTitle(doc, "Status Distribution", y);
    y = donutWithLegend(doc, {
      x: 36, y, radius: 36,
      slices: [
        { value: counts.Overdue, label: "Overdue", color: BRAND.danger },
        { value: counts["Due Soon"], label: "Due Soon", color: BRAND.warning },
        { value: counts["On Schedule"], label: "On Schedule", color: BRAND.success },
        { value: counts.Paused, label: "Paused", color: BRAND.muted },
      ],
      legendX: 130,
    });
    y += 6;
  }
  y = needsNewPage(doc, y, 130);
  const rows = [...items]
    .sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0))
    .map((r) => [r.routeName || r.id, r.routeType || "—", r.area || "—", r.contractor || "—", r.equipmentCount ?? "—", formatDate(r.nextDueDate) || "—", r.dueStatus || "—"]);
  autoTable(doc, {
    startY: y,
    head: [["Routine", "Type", "Area", "Contractor", "Equipment", "Next Due", "Status"]],
    body: rows.length ? rows : [["No open routines in this scope", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const map = { Overdue: BRAND.danger, "Due Soon": BRAND.warning, "On Schedule": BRAND.success, Paused: BRAND.muted };
        data.cell.styles.textColor = map[data.cell.raw] || BRAND.muted;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  return doc.lastAutoTable.finalY + 24;
}

// Confirmed directly by the user: "Coming Soon Oil Change" reads from the
// Oil Change LOG's own current-state-per-LP data (same `oilChanges` +
// Equipment Register the Overdue sections above use), NOT from Routines/
// Route Templates — a first pass of this section used the latter by
// mistake. "Coming soon" = not yet overdue, next due date within the next
// month (rolling 30 days, same "Due this month" window OilChangeLog.jsx's
// own bucket uses — widened from an earlier 7-day pass per the user).
const COMING_SOON_DAYS = 30;
function scopedComingSoonChanges({ oilChanges, equipmentRegistry, contractor = "All", scopeFilter }) {
  const regByCode = registryByCodeMap(equipmentRegistry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today.getTime() + COMING_SOON_DAYS * 86400000);
  const inScope = (code) => {
    const reg = regByCode[code];
    return reg && scopeFilter(reg) && (contractor === "All" || reg.contractor === contractor);
  };
  const items = (oilChanges || [])
    .filter((o) => inScope(o.equipmentCode) && o.status !== "Overdue" && o.nextDueDate)
    .filter((o) => {
      const d = new Date(o.nextDueDate);
      return !isNaN(d) && d >= today && d <= windowEnd;
    })
    .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
  return { items, regByCode };
}

function buildComingSoonPdf(doc, { oilChanges, equipmentRegistry, contractor }, y) {
  const { items, regByCode } = scopedComingSoonChanges({ oilChanges, equipmentRegistry, contractor, scopeFilter: TIME_SCOPE });
  y = summaryParagraph(doc, `Time-based lubrication points due for an oil change in the next month, from the Oil Change Log${contractor === "All" ? "" : ` for ${contractor}`} — plan ahead for lubricant and crew availability.`, y);
  y = statStrip(doc, [{ value: items.length, label: "COMING SOON", color: BRAND.warning }], y);
  y += 10;
  y = byAreaChart(doc, { list: items, regByCode, y, color: BRAND.warning, title: "Coming Soon by Area" });
  y = needsNewPage(doc, y, 110);
  const rows = items.map((o) => {
    const reg = regByCode[o.equipmentCode];
    return [o.equipmentCode, reg?.description || "—", reg?.area || "—", reg?.contractor || "—", formatDate(o.nextDueDate) || "—"];
  });
  autoTable(doc, {
    startY: y,
    head: [["Equipment", "Description", "Area", "Contractor", "Due Date"]],
    body: rows.length ? rows : [["Nothing coming up in this scope", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
  });
  return doc.lastAutoTable.finalY + 24;
}

function lastCalendarMonthRange() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  return { year, monthIndex, label: new Date(year, monthIndex, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
}

function buildLastMonthTopUpPdf(doc, { topUps, contractor }, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const { year, monthIndex, label } = lastCalendarMonthRange();
  let items = (topUps || []).filter((t) => inPeriod(t.eventDate, year, monthIndex));
  if (contractor !== "All") items = items.filter((t) => t.contractor === contractor);
  const totalQty = items.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

  y = summaryParagraph(doc, `Every Emergency Top Up logged during ${label}${contractor === "All" ? "" : ` for ${contractor}`}.`, y);
  y = statStrip(
    doc,
    [
      { value: items.length, label: "TOP UPS LOGGED", color: BRAND.accent },
      { value: `${totalQty}L`, label: "TOTAL QUANTITY", color: BRAND.warning },
    ],
    y
  );
  y += 10;
  if (items.length > 0) {
    const byContractor = {};
    items.forEach((t) => { byContractor[t.contractor || "Unassigned"] = (byContractor[t.contractor || "Unassigned"] || 0) + (Number(t.quantity) || 0); });
    const rows = Object.entries(byContractor)
      .sort((a, b) => b[1] - a[1])
      .map(([label2, value]) => ({ label: label2, value, color: BRAND.accent }));
    y = needsNewPage(doc, y, rows.length * 24 + 50);
    y = sectionTitle(doc, "Quantity by Contractor", y);
    y = horizontalBars(doc, { x: 36, y, width: pageWidth - 72, rows, valueFormatter: (v) => `${v}L` });
    y += 18;
  }
  y = needsNewPage(doc, y, 110);
  const rows = [...items]
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
    .map((t) => [formatDate(t.eventDate), t.lpId || "—", `${t.quantity ?? "—"}L`, t.oilBrandType || "—", t.reason || "—", t.contractor || "—"]);
  autoTable(doc, {
    startY: y,
    head: [["Date", "Lubrication Point", "Qty", "Oil Type", "Reason", "Contractor"]],
    body: rows.length ? rows : [[`No top ups logged in ${label}`, "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
  });
  return doc.lastAutoTable.finalY + 24;
}

// "Completion" = % of routines/templates (among those actually due —
// Completed/Overdue/Due Soon/On Schedule, excluding Paused/Cancelled)
// that reached Completed — the same compliance-rate definition the
// Dashboard's own "Routine Compliance Rate" card already uses, just
// broken out per contractor instead of per route type.
function buildContractorCompletionPdf(doc, { routinesOverview, contractor }, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const items = routinesInScope(routinesOverview, contractor).filter((r) => ["Completed", "Overdue", "Due Soon", "On Schedule"].includes(r.dueStatus));
  const contractors = contractor === "All" ? Array.from(new Set(items.map((r) => r.contractor).filter(Boolean))) : [contractor];
  const stats = contractors.map((c) => {
    const list = items.filter((r) => r.contractor === c);
    const done = list.filter((r) => r.dueStatus === "Completed").length;
    return { name: c, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : null };
  });

  y = summaryParagraph(doc, `Share of due routines that reached Completed, per contractor${contractor === "All" ? "" : ` (${contractor} only)`}.`, y);
  if (stats.length > 0) {
    y = needsNewPage(doc, y, stats.length * 24 + 80);
    y = sectionTitle(doc, "Completion Rate by Contractor", y);
    y = horizontalBars(doc, {
      x: 36, y, width: pageWidth - 72,
      rows: stats.map((s) => ({ label: s.name, value: s.pct ?? 0, color: BRAND.success })),
      maxValue: 100, valueFormatter: (v) => `${v}%`,
    });
    y += 18;
  }
  y = needsNewPage(doc, y, 90);
  autoTable(doc, {
    startY: y,
    head: [["Contractor", "Due Routines", "Completed", "Completion %"]],
    body: stats.length ? stats.map((s) => [s.name, s.total, s.done, s.pct == null ? "—" : `${s.pct}%`]) : [["No routines in this scope", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: BRAND.navy, textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: BRAND.border, lineWidth: 0.5 },
    margin: { left: 36, right: 36 },
  });
  return doc.lastAutoTable.finalY + 24;
}

// ── Inventory Status & Forecast ──────────────────────────────────────────

function buildInventoryStatusPdf(doc, { inventoryProducts, contractor }, y) {
  let products = inventoryProducts || [];
  if (contractor !== "All") products = products.filter((p) => p.contractor === contractor);
  const lowStock = products.filter((p) => p.currentStock != null && p.recorderLevel != null && p.currentStock <= p.recorderLevel && p.currentStock > 0);
  const outOfStock = products.filter((p) => (p.currentStock || 0) <= 0);

  y = summaryParagraph(doc, `Current stock levels for every oil product${contractor === "All" ? "" : ` supplied to ${contractor}`}, flagging anything at or below its reorder level.`, y);
  y = statStrip(
    doc,
    [
      { value: products.length, label: "PRODUCTS", color: BRAND.navy },
      { value: lowStock.length, label: "LOW STOCK", color: BRAND.warning },
      { value: outOfStock.length, label: "OUT OF STOCK", color: BRAND.danger },
    ],
    y
  );
  y += 10;
  if (products.length > 0) {
    const sufficient = products.length - lowStock.length - outOfStock.length;
    y = needsNewPage(doc, y, 110);
    y = sectionTitle(doc, "Stock Status", y);
    y = donutWithLegend(doc, {
      x: 36,
      y,
      radius: 36,
      slices: [
        { value: sufficient, label: "Sufficient", color: BRAND.success },
        { value: lowStock.length, label: "Low", color: BRAND.warning },
        { value: outOfStock.length, label: "Out of Stock", color: BRAND.danger },
      ],
      legendX: 130,
    });
    y += 6;
  }
  y = needsNewPage(doc, y, 130);
  const rows = [...products]
    .sort((a, b) => (a.currentStock ?? 0) - (b.currentStock ?? 0))
    .map((p) => [
      p.lubricantType || "—", p.lubricantBrand || "—", p.contractor || "—",
      p.currentStock == null ? "—" : `${p.currentStock}${p.unit || "L"}`,
      p.recorderLevel == null ? "—" : `${p.recorderLevel}${p.unit || "L"}`,
      (p.currentStock || 0) <= 0 ? "Out of Stock" : lowStock.includes(p) ? "Low" : "Sufficient",
    ]);
  autoTable(doc, {
    startY: y,
    head: [["Oil", "Brand", "Contractor", "Current Stock", "Reorder Level", "Status"]],
    body: rows.length ? rows : [["No products in this scope", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const map = { "Out of Stock": BRAND.danger, Low: BRAND.warning, Sufficient: BRAND.success };
        data.cell.styles.textColor = map[data.cell.raw] || BRAND.muted;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  return doc.lastAutoTable.finalY + 24;
}

function buildForecastPdf(doc, { inventoryForecast, contractor }, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let rows = (inventoryForecast?.forecast || []);
  if (contractor !== "All") rows = rows.filter((f) => f.contractor === contractor);
  const totalShortfall = rows.reduce((sum, f) => sum + (Number(f.shortfall) || 0), 0);

  y = summaryParagraph(doc, `Projected lubricant need for next month against current stock${contractor === "All" ? "" : ` for ${contractor}`} — anything with a shortfall needs reordering before then.`, y);
  y = statStrip(
    doc,
    [
      { value: rows.length, label: "PRODUCTS FORECAST", color: BRAND.navy },
      { value: rows.filter((f) => (f.shortfall || 0) > 0).length, label: "SHORTFALLS", color: BRAND.danger },
      { value: `${totalShortfall}L`, label: "TOTAL SHORTFALL", color: BRAND.warning },
    ],
    y
  );
  y += 10;
  const shortfalls = rows.filter((f) => (f.shortfall || 0) > 0);
  if (shortfalls.length > 0) {
    const barRows = [...shortfalls]
      .sort((a, b) => (b.shortfall || 0) - (a.shortfall || 0))
      .map((f) => ({ label: f.lubricant || "—", value: Number(f.shortfall) || 0, color: BRAND.danger }));
    y = needsNewPage(doc, y, barRows.length * 24 + 50);
    y = sectionTitle(doc, "Shortfall by Product", y);
    y = horizontalBars(doc, { x: 36, y, width: pageWidth - 72, rows: barRows, valueFormatter: (v) => `${v}L` });
    y += 18;
  }
  y = needsNewPage(doc, y, 130);
  const body = [...rows]
    .sort((a, b) => (b.shortfall || 0) - (a.shortfall || 0))
    .map((f) => [
      f.lubricant || "—", f.lubricantBrand || "—", f.contractor || "—",
      f.currentStock == null ? "—" : `${f.currentStock}L`,
      f.quantityNeeded == null ? "—" : `${f.quantityNeeded}L`,
      (f.shortfall || 0) > 0 ? `${f.shortfall}L short` : "Covered",
    ]);
  autoTable(doc, {
    startY: y,
    head: [["Oil", "Brand", "Contractor", "Current Stock", "Projected Need", "Shortfall"]],
    body: body.length ? body : [["No forecast data in this scope", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5 && String(data.cell.raw).includes("short")) {
        data.cell.styles.textColor = BRAND.danger;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  return doc.lastAutoTable.finalY + 24;
}

// ── Excel (data-only) row builders — one per section, reusing the exact
// same scoping/filtering as that section's PDF builder above so the two
// formats never silently disagree on what counts. ──────────────────────

function excelOpenActions({ actions, equipmentRegistry, contractor }) {
  const regByCode = registryByCodeMap(equipmentRegistry);
  const contractorOf = (a) => a.contractor || regByCode[a.equipmentCode]?.contractor || "Unassigned";
  let rows = (actions || []).filter((a) => FOCUS_STATUSES.includes(a.status));
  if (contractor !== "All") rows = rows.filter((a) => contractorOf(a) === contractor);
  return {
    header: ["Ac. No", "Equipment", "Description", "Oil Type", "Status", "Days Open", "Contractor", "Agreed Action"],
    rows: rows.map((a) => [a.acNo, a.equipmentCode, a.description, a.oilType, a.status, daysSince(a.revisionDate), contractorOf(a), a.agreedAction]),
  };
}
function excelMissingOverdueSamples({ trackerByEquip, equipmentRegistry, contractor }) {
  let registry = equipmentRegistry || [];
  if (contractor !== "All") registry = registry.filter((r) => r.contractor === contractor);
  const rows = registry
    .map((eq) => {
      const history = (trackerByEquip || {})[eq.code] || [];
      const lastDate = history[0]?.date || "";
      const status = sampleTrackerStatus(lastDate, eq.interval);
      return { eq, lastDate, status };
    })
    .filter((r) => r.status.label !== "OK");
  return {
    header: ["Equipment", "Description", "Area", "Contractor", "Interval", "Last Sample", "Status", "Details"],
    rows: rows.map(({ eq, lastDate, status }) => [eq.code, eq.description, eq.area, eq.contractor, eq.interval, lastDate, status.label, status.daysInfo]),
  };
}
function excelOilHealth(data) {
  return { header: ["Equipment", "Description", "Area", "Contractor", "Sample Date", "Result"], rows: oilHealthRows(data) };
}
function excelOverdueChanges({ oilChanges, equipmentRegistry, contractor }, scopeFilter) {
  const { overdueList, regByCode } = scopedOilChangeStats({ oilChanges, equipmentRegistry, actions: [], contractor, scopeFilter });
  return {
    header: ["Equipment", "Description", "Area", "Oil Type", "Contractor", "Next Due", "Days Overdue"],
    rows: overdueList.map((o) => {
      const reg = regByCode[o.equipmentCode];
      return [o.equipmentCode, reg?.description, reg?.area, o.oilType || reg?.lubricant, reg?.contractor, o.nextDueDate, daysSince(o.nextDueDate)];
    }),
  };
}
function excelConditionOverdueChanges({ actions, equipmentRegistry, contractor }) {
  const { items, regByCode } = scopedConditionOverdueActions({ actions, equipmentRegistry, contractor });
  return {
    header: ["Equipment", "Description", "Area", "Contractor", "Days Overdue", "Agreed Action"],
    rows: items.map((a) => {
      const reg = regByCode[a.equipmentCode];
      return [a.equipmentCode, reg?.description, reg?.area, reg?.contractor, daysSince(a.revisionDate), a.agreedAction || a.contractorAction];
    }),
  };
}
function excelPerformance({ oilChanges, equipmentRegistry, actions, contractor }, scopeFilter) {
  const { stats } = scopedOilChangeStats({ oilChanges, equipmentRegistry, actions, contractor, scopeFilter });
  return {
    header: ["Contractor", "Total Points", "Overdue", "On-Time %", "Action Closure %"],
    rows: stats.map((s) => [s.name, s.total, s.overdue, s.onTimePct, s.closureRatePct]),
  };
}
function excelOpenRoutines({ routinesOverview, contractor }) {
  const items = routinesInScope(routinesOverview, contractor).filter((r) => r.dueStatus !== "Completed" && r.dueStatus !== "Cancelled");
  return {
    header: ["Routine", "Type", "Area", "Contractor", "Equipment", "Next Due", "Status"],
    rows: items.map((r) => [r.routeName || r.id, r.routeType, r.area, r.contractor, r.equipmentCount, r.nextDueDate, r.dueStatus]),
  };
}
function excelComingSoon({ oilChanges, equipmentRegistry, contractor }) {
  const { items, regByCode } = scopedComingSoonChanges({ oilChanges, equipmentRegistry, contractor, scopeFilter: TIME_SCOPE });
  return {
    header: ["Equipment", "Description", "Area", "Contractor", "Due Date"],
    rows: items.map((o) => {
      const reg = regByCode[o.equipmentCode];
      return [o.equipmentCode, reg?.description, reg?.area, reg?.contractor, o.nextDueDate];
    }),
  };
}
function excelLastMonthTopUp({ topUps, contractor }) {
  const { year, monthIndex } = lastCalendarMonthRange();
  let items = (topUps || []).filter((t) => inPeriod(t.eventDate, year, monthIndex));
  if (contractor !== "All") items = items.filter((t) => t.contractor === contractor);
  return {
    header: ["Date", "Lubrication Point", "Quantity", "Oil Type", "Reason", "Contractor"],
    rows: items.map((t) => [t.eventDate, t.lpId, t.quantity, t.oilBrandType, t.reason, t.contractor]),
  };
}
function excelContractorCompletion({ routinesOverview, contractor }) {
  const items = routinesInScope(routinesOverview, contractor).filter((r) => ["Completed", "Overdue", "Due Soon", "On Schedule"].includes(r.dueStatus));
  const contractors = contractor === "All" ? Array.from(new Set(items.map((r) => r.contractor).filter(Boolean))) : [contractor];
  return {
    header: ["Contractor", "Due Routines", "Completed", "Completion %"],
    rows: contractors.map((c) => {
      const list = items.filter((r) => r.contractor === c);
      const done = list.filter((r) => r.dueStatus === "Completed").length;
      return [c, list.length, done, list.length ? Math.round((done / list.length) * 100) : null];
    }),
  };
}
function excelInventoryStatus({ inventoryProducts, contractor }) {
  let products = inventoryProducts || [];
  if (contractor !== "All") products = products.filter((p) => p.contractor === contractor);
  return {
    header: ["Oil", "Brand", "Contractor", "Current Stock", "Reorder Level", "Status"],
    rows: products.map((p) => [
      p.lubricantType, p.lubricantBrand, p.contractor, p.currentStock, p.recorderLevel,
      (p.currentStock || 0) <= 0 ? "Out of Stock" : p.currentStock <= p.recorderLevel ? "Low" : "Sufficient",
    ]),
  };
}
function excelForecast({ inventoryForecast, contractor }) {
  let rows = inventoryForecast?.forecast || [];
  if (contractor !== "All") rows = rows.filter((f) => f.contractor === contractor);
  return {
    header: ["Oil", "Brand", "Contractor", "Current Stock", "Projected Need", "Shortfall"],
    rows: rows.map((f) => [f.lubricant, f.lubricantBrand, f.contractor, f.currentStock, f.quantityNeeded, f.shortfall]),
  };
}

// ── The single registry both NewReport.jsx's checklist and the two
// generate functions below read from — one place that knows every
// section's id, label, group, and how to render it in each format. ─────
export const REPORT_GROUPS = [
  { id: "condition", label: "Condition Based Oil", icon: "ti-flask", iconColor: "accent" },
  { id: "time", label: "Time Based Oil", icon: "ti-clock", iconColor: "warning" },
  { id: "inventory", label: "Inventory Status", icon: "ti-package", iconColor: "success" },
  { id: "forecast", label: "Forecast", icon: "ti-chart-line", iconColor: "danger" },
];

export const REPORT_SECTIONS = [
  { id: "condition-open-actions", group: "condition", label: "Open Actions", pdfTitle: "Open Actions", pdf: (doc, d, y) => buildActionSection(doc, d, y), excel: excelOpenActions },
  { id: "condition-samples", group: "condition", label: "Missing / Overdue Samples", pdfTitle: "Missing / Overdue Samples", pdf: (doc, d, y) => buildSampleSection(doc, d, y), excel: excelMissingOverdueSamples },
  { id: "condition-oil-health", group: "condition", label: "Oil Health (Lab Results)", pdfTitle: "Oil Health", pdf: buildOilHealthPdf, excel: excelOilHealth },
  { id: "condition-overdue-changes", group: "condition", label: "Oil Overdue Changes", pdfTitle: "Overdue Oil Changes — Condition Based", pdf: buildConditionOverdueChangesPdf, excel: excelConditionOverdueChanges },
  { id: "condition-performance", group: "condition", label: "Contractor Performance", pdfTitle: "Condition Based Contractor Performance", pdf: buildConditionPerformancePdf, excel: (d) => excelPerformance(d, CONDITION_SCOPE) },

  { id: "time-overdue-lp", group: "time", label: "Overdue LP Points", pdfTitle: "Overdue LP Points — Time Based", pdf: buildTimeOverdueChangesPdf, excel: (d) => excelOverdueChanges(d, TIME_SCOPE) },
  { id: "time-open-routines", group: "time", label: "Open Routines & Current Status", pdfTitle: "Open Routines & Current Status", pdf: buildOpenRoutinesPdf, excel: excelOpenRoutines },
  { id: "time-coming-soon", group: "time", label: "Coming Soon Oil Change", pdfTitle: "Coming Soon Oil Change", pdf: buildComingSoonPdf, excel: excelComingSoon },
  { id: "time-last-month-topup", group: "time", label: "Last Month Top Up", pdfTitle: "Last Month Top Up", pdf: buildLastMonthTopUpPdf, excel: excelLastMonthTopUp },
  { id: "time-completion", group: "time", label: "Contractor Completion", pdfTitle: "Contractor Completion", pdf: buildContractorCompletionPdf, excel: excelContractorCompletion },

  { id: "inventory-status", group: "inventory", label: "Inventory Status", pdfTitle: "Inventory Status", pdf: buildInventoryStatusPdf, excel: excelInventoryStatus },
  { id: "forecast-next-month", group: "forecast", label: "Forecast — Next Month", pdfTitle: "Forecast — Next Month", pdf: buildForecastPdf, excel: excelForecast },
];

export async function generateOilReportPdf({ sectionIds, contractor = "All", data }) {
  const selected = REPORT_SECTIONS.filter((s) => sectionIds.includes(s.id));
  if (selected.length === 0) return;
  const doc = await newDoc("Oil Report", scopeLineFor(contractor));
  let y = 98;
  selected.forEach((section, i) => {
    if (i > 0) doc.addPage();
    y = i === 0 ? y : 50;
    y = bigSectionHeader(doc, section.pdfTitle, y);
    y = section.pdf(doc, { ...data, contractor }, y, contractor);
  });
  addFooter(doc);
  doc.save(`Oil-Report${fileSuffixFor(contractor)}-${toFileDate()}.pdf`);
}

export async function generateOilReportExcel({ sectionIds, contractor = "All", data }) {
  const selected = REPORT_SECTIONS.filter((s) => sectionIds.includes(s.id));
  if (selected.length === 0) return;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Arabian Cement — Oil Lubrication";
  workbook.created = new Date();

  selected.forEach((section) => {
    const { header, rows } = section.excel({ ...data, contractor });
    // Sheet names are capped at 31 chars, can't repeat, and reject
    // * ? : \ / [ ] (confirmed by ExcelJS throwing on "Missing / Overdue
    // Samples" with its "/") — every section label is already short and
    // unique, so stripping just those characters before truncating is
    // enough; no need for a fancier slug.
    const safeName = section.label.replace(/[*?:\\/[\]]/g, "").slice(0, 31);
    const sheet = workbook.addWorksheet(safeName);
    sheet.addRow(header).font = { bold: true };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    (rows || []).forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 40);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Oil-Report${fileSuffixFor(contractor)}-${toFileDate()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Oil Equipment E4 — one lubrication point's history as a PDF ──────────
// The same rules as the point page (pointHistory.js): lab values with the
// lab's own marks and the limits worked out from them, rising trends, oil
// change cycles planned vs actual, top-ups and possible leaks, actions.

const PDF_SEV = { Alert: BRAND.danger, Caution: BRAND.warning };
const HEALTH_PDF = { Good: BRAND.success, Fair: BRAND.warning, Poor: BRAND.danger };
const DEFAULT_PDF_PARAMS = ["Fe", "Si", "Water", "Visc", "Cu", "TAN"];

function shortDate(v) {
  const t = toTime(v);
  return t === null ? "—" : new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function pdfNum(v) {
  if (v === null || v === undefined || v === "") return "—";
  return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
}

// A small hand-drawn line chart for one lab value over the whole history.
function labMiniChart(doc, { x, y, w, h, p, samples, changeTimes, limits, start, end }) {
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, h, 3, 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.navy);
  doc.text(`${p.label}${p.unit ? ` (${p.unit})` : ""}`, x + 8, y + 13);
  const px = x + 30;
  const pw = w - 40;
  const py = y + 22;
  const ph = h - 40;
  const pts = samples.map((s) => ({ t: s._t, v: paramValue(s, p), f: flagFor(s, p) })).filter((d) => d.v !== null);
  const vals = [...pts.map((d) => d.v), limits?.caution, limits?.alert].filter((v) => v !== null && v !== undefined);
  let lo = p.key === "Visc" ? Math.min(...vals) * 0.9 : 0;
  let hi = Math.max(...vals, 1) * 1.1;
  if (hi === lo) hi = lo + 1;
  const sx = (t) => px + ((t - start) / Math.max(1, end - start)) * pw;
  const sy = (v) => py + ph - ((v - lo) / (hi - lo)) * ph;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.muted);
  [lo, (lo + hi) / 2, hi].forEach((v) => {
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.3);
    doc.line(px, sy(v), px + pw, sy(v));
    doc.text(pdfNum(v), px - 4, sy(v) + 2, { align: "right" });
  });
  doc.text(new Date(start).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), px, y + h - 8);
  doc.text(new Date(end).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), px + pw, y + h - 8, { align: "right" });
  // Oil changes.
  doc.setDrawColor(...BRAND.muted);
  doc.setLineWidth(0.4);
  changeTimes.filter((t) => t >= start && t <= end).forEach((t) => doc.line(sx(t), py, sx(t), py + ph));
  // Limits (dashed).
  [["caution", BRAND.warning, "Caution"], ["alert", BRAND.danger, "Alert"]].forEach(([k, color, label]) => {
    const v = limits?.[k];
    if (v === null || v === undefined) return;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(px, sy(v), px + pw, sy(v));
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...BRAND.muted);
    doc.text(`${label} ${pdfNum(v)}`, px + pw - 2, sy(v) - 2, { align: "right" });
  });
  // The line, broken at each oil change, then the dots.
  doc.setDrawColor(...BRAND.teal);
  doc.setLineWidth(1.2);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (changeTimes.some((t) => t > a.t && t <= b.t)) continue;
    doc.line(sx(a.t), sy(a.v), sx(b.t), sy(b.v));
  }
  pts.forEach((d) => {
    doc.setFillColor(...(d.f ? PDF_SEV[d.f] : BRAND.teal));
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.circle(sx(d.t), sy(d.v), d.f ? 2.8 : 2.2, "FD");
  });
  doc.setTextColor(20, 26, 33);
}

export async function generatePointHistoryPdf({ reg, samples, sameOilSamples, changes, topUps, actions, health, nextChangeDue, nextSampleDue }) {
  const code = reg?.code || "";
  const doc = await newDoc("Lubrication Point History", `${code} — ${reg?.equipmentId || ""} · ${reg?.lubricationPoint || ""}`);
  const now = Date.now();
  const samplesAsc = (samples || []).map((s) => ({ ...s, _t: toTime(s.sampledDate) })).filter((s) => s._t !== null).sort((a, b) => a._t - b._t);
  const changesAsc = (changes || []).map((c) => ({ ...c, _t: toTime(c.eventDate) })).filter((c) => c._t !== null).sort((a, b) => a._t - b._t);
  const lastChangeTime = changesAsc.length ? changesAsc[changesAsc.length - 1]._t : null;
  const latest = samplesAsc[samplesAsc.length - 1] || null;
  const openActions = (actions || []).filter((a) => a.status !== "Closed");

  let y = 92;
  y = statStrip(doc, [
    { label: "Health", value: health?.health || "—", color: HEALTH_PDF[health?.health] },
    { label: "Latest lab result", value: latest?.reportStatus || "—", color: PDF_SEV[latest?.reportStatus] },
    { label: "Next oil change", value: shortDate(nextChangeDue) },
    { label: "Next sample", value: shortDate(nextSampleDue) },
    { label: "Open actions", value: openActions.length },
  ], y);
  if (health?.reasons?.length) y = summaryParagraph(doc, `Why ${health.health}: ${health.reasons.map((r) => r.text).join("; ")}.`, y);

  autoTable(doc, {
    startY: y,
    body: [
      ["Equipment", reg?.equipmentId || "—", "Area", reg?.area || "—"],
      ["Lubrication point", reg?.lubricationPoint || "—", "Contractor", reg?.contractor || "—"],
      ["Oil", reg?.lubricant || "—", "Quantity", reg?.lubricantQuantityL ? `${reg.lubricantQuantityL} L` : "—"],
      ["Oil change interval", intervalMonths(reg?.oilChangeInterval || "") ? `Every ${everyText(reg.oilChangeInterval)}` : "As needed", "Oil analysis", reg?.oilAnalysisRequired === "Yes" ? `Yes — every ${reg?.interval || "—"}` : "No"],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: BRAND.border, lineWidth: 0.4 },
    columnStyles: { 0: { fontStyle: "bold", textColor: BRAND.navy, cellWidth: 100 }, 2: { fontStyle: "bold", textColor: BRAND.navy, cellWidth: 90 } },
    margin: { left: 36, right: 36 },
  });
  y = doc.lastAutoTable.finalY + 22;

  // Lab values.
  if (samplesAsc.length) {
    const lab = LAB_PARAMS.filter((p) => samplesAsc.some((s) => paramValue(s, p) !== null)).map((p) => {
      const limits = limitsFor(p, samplesAsc, sameOilSamples || []);
      const trend = trendWarning(samplesAsc, p, limits?.direction || (p.low ? "down" : "up"), lastChangeTime);
      const flagged = samplesAsc.some((s) => flagFor(s, p));
      return { p, limits, trend, flagged };
    });
    const look = lab.filter((x) => x.trend || x.flagged);
    const picked = [...look];
    DEFAULT_PDF_PARAMS.forEach((k) => {
      const x = lab.find((l) => l.p.key === k);
      if (x && !picked.includes(x)) picked.push(x);
    });
    const chartParams = picked.slice(0, 4);
    const tableParams = picked.slice(0, 6);

    y = needsNewPage(doc, y, 200);
    y = sectionTitle(doc, "Lab values", y);
    const trends = lab.filter((x) => x.trend);
    y = summaryParagraph(
      doc,
      (trends.length
        ? trends.map((x) => `${x.p.label} ${x.trend.direction} ${x.trend.values.length} samples in a row since the last oil change (${x.trend.values.map(pdfNum).join(", ")} ${x.p.unit}).`).join(" ") + " "
        : "") +
        "Dots in red / amber are values the lab marked Alert / Caution; dashed lines are the lowest values it marked (from this point, or from other points on the same oil); grey lines are oil changes.",
      y
    );
    const start = samplesAsc[0]._t;
    const end = Math.max(now, samplesAsc[samplesAsc.length - 1]._t);
    const changeTimes = changesAsc.map((c) => c._t);
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = (pageWidth - 72 - 12) / 2;
    const chH = 120;
    chartParams.forEach((x, i) => {
      if (i % 2 === 0) y = needsNewPage(doc, y, chH + 50);
      labMiniChart(doc, { x: 36 + (i % 2) * (cw + 12), y, w: cw, h: chH, p: x.p, samples: samplesAsc, changeTimes, limits: x.limits, start, end });
      if (i % 2 === 1 || i === chartParams.length - 1) y += chH + 12;
    });
    y += 8;

    y = needsNewPage(doc, y, 120);
    const recent = [...samplesAsc].reverse().slice(0, 24);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Sample", "Result", ...tableParams.map((x) => `${x.p.key}${x.p.unit ? ` (${x.p.unit})` : ""}`), "Lab marks"]],
      body: [
        ...recent.map((s) => [
          formatDate(s.sampledDate),
          s.sampleId || "—",
          s.reportStatus || "—",
          ...tableParams.map((x) => pdfNum(paramValue(s, x.p))),
          (s.flaggedReadings || []).map((f) => `${f.param} ${f.severity}`).join(", ") || "—",
        ]),
        ["Limits (Caution / Alert)", "", "", ...tableParams.map((x) => (x.limits ? `${pdfNum(x.limits.caution)} / ${pdfNum(x.limits.alert)}` : "—")), ""],
      ],
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, lineColor: BRAND.border, lineWidth: 0.4 },
      margin: { left: 36, right: 36 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const s = recent[data.row.index];
        if (!s) {
          data.cell.styles.textColor = BRAND.muted;
          return;
        }
        if (data.column.index === 2 && PDF_SEV[s.reportStatus]) {
          data.cell.styles.textColor = PDF_SEV[s.reportStatus];
          data.cell.styles.fontStyle = "bold";
        }
        const x = tableParams[data.column.index - 3];
        if (x) {
          const f = flagFor(s, x.p);
          if (f) {
            data.cell.styles.textColor = PDF_SEV[f];
            data.cell.styles.fontStyle = "bold";
            data.cell.text = [`${data.cell.text[0]} ${f[0]}`];
          }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(`A = lab marked Alert, C = Caution.${samplesAsc.length > recent.length ? ` Latest ${recent.length} of ${samplesAsc.length} reports shown.` : ""}`, 36, y + 4);
    doc.setTextColor(20, 26, 33);
    y += 24;
  }

  // Oil change cycles.
  y = needsNewPage(doc, y, 140);
  y = sectionTitle(doc, "Oil change cycles", y);
  const asNeeded = !intervalMonths(reg?.oilChangeInterval || "");
  const cycles = buildCycles({ changes: changesAsc, topUps, interval: reg?.oilChangeInterval || "", now });
  const sum = cycleSummary(cycles);
  if (!cycles.length) {
    y = summaryParagraph(doc, "No oil changes logged.", y);
  } else {
    const parts = [];
    if (!asNeeded && sum.judged) parts.push(`${sum.onTime} of ${sum.judged} changes done on time (${sum.onTimeRate}%)`);
    if (!asNeeded && sum.avgDaysLate !== null) parts.push(`late ones averaged ${sum.avgDaysLate} days late`);
    if (sum.avgDays !== null) parts.push(`average cycle ${sum.avgDays} days`);
    if (sum.avgTopUpLitres !== null) parts.push(`${sum.avgTopUpLitres} L topped up per cycle on average`);
    y = summaryParagraph(doc, (asNeeded ? "Changed as needed — no planned dates. " : "") + (parts.length ? parts.join(", ") + "." : ""), y);
    const rows = [...cycles].reverse();
    autoTable(doc, {
      startY: y,
      head: [["Cycle", "From", "To", "Oil", "Days", "Planned", "Status", "Top-ups", "Oil used"]],
      body: rows.map((c) => [
        c.current ? "Current" : String(c.index),
        formatDate(c.start),
        c.current ? "today" : formatDate(c.end),
        c.oil || "—",
        String(c.days),
        c.planned ? `${formatDate(c.planned)} (${c.plannedDays} d)` : "—",
        c.status === "Late" || c.status === "Overdue" ? `${c.status} ${c.lateDays} d` : c.status || "—",
        `${c.topUps} · ${c.topUpLitres} L`,
        `${c.oilUsed} L`,
      ]),
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3.5, lineColor: BRAND.border, lineWidth: 0.4 },
      margin: { left: 36, right: 36 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 6) return;
        const st = rows[data.row.index]?.status;
        const color = { "On time": BRAND.success, Late: BRAND.warning, Overdue: BRAND.danger }[st];
        if (color) {
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  // Top-ups.
  y = needsNewPage(doc, y, 120);
  y = sectionTitle(doc, "Top-ups", y);
  const tops = (topUps || []).map((t) => ({ ...t, _t: toTime(t.eventDate) })).filter((t) => t._t !== null).sort((a, b) => b._t - a._t);
  const leaks = leakWindows(topUps);
  if (leaks.length) {
    y = summaryParagraph(doc, `Possible leak: ${leaks.map((w) => `${w.count} top-ups between ${formatDate(w.from)} and ${formatDate(w.to)}`).join("; ")}.`, y);
  }
  if (!tops.length) {
    y = summaryParagraph(doc, "No top-ups logged.", y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Litres", "Oil", "Reason", "Done by"]],
      body: tops.slice(0, 30).map((t) => [formatDate(t.eventDate), t.quantity || "—", t.oilBrandType || "—", t.reason || "—", t.doneBy || "—"]),
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3.5, lineColor: BRAND.border, lineWidth: 0.4 },
      margin: { left: 36, right: 36 },
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  // Actions.
  y = needsNewPage(doc, y, 120);
  y = sectionTitle(doc, "Actions", y);
  const acts = [...(actions || [])].sort((a, b) => (toTime(b.revisionDate || b.sampleDate) ?? 0) - (toTime(a.revisionDate || a.sampleDate) ?? 0));
  if (!acts.length) {
    summaryParagraph(doc, "No actions recorded.", y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Ac. No", "Date", "Status", "Due", "Action", "Assigned to"]],
      body: acts.slice(0, 40).map((a) => [a.acNo || "—", formatDate(a.revisionDate || a.sampleDate) || "—", a.status || "—", formatDate(a.dueDate) || "—", a.agreedAction || a.contractorAction || "—", a.assignedTo || "—"]),
      theme: "striped",
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.navy, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3.5, lineColor: BRAND.border, lineWidth: 0.4 },
      columnStyles: { 4: { cellWidth: 200 } },
      margin: { left: 36, right: 36 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          data.cell.styles.textColor = ACTION_STATUS_COLOR[data.cell.raw] || BRAND.muted;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  addFooter(doc);
  doc.save(`Lubrication-History-${String(code).replace(/[^a-z0-9.-]+/gi, "_")}-${toFileDate()}.pdf`);
  return doc;
}

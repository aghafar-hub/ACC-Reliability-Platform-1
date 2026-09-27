import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatDate, sampleTrackerStatus, intervalMonths } from "./parsers";
import logoUrl from "./assets/arabian-cement-logo.png";

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
  Open: BRAND.danger,
  "In Progress": BRAND.warning,
  "Waiting Stoppage": BRAND.accent,
  Closed: BRAND.success,
};

const LOGO_ASPECT = 602 / 316;

function toFileDate() {
  return new Date().toISOString().slice(0, 10);
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
// Focused on the three active statuses — Open, In Progress, Waiting
// Stoppage — since Closed actions are history, not something a contractor
// needs to act on.
const FOCUS_STATUSES = ["Open", "In Progress", "Waiting Stoppage"];

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
      ? `This report covers every Open, In Progress, and Waiting Stoppage action across all contractors as of ${formatDate(new Date().toISOString())}. Closed actions are excluded — they no longer need contractor attention.`
      : `This report covers every Open, In Progress, and Waiting Stoppage action assigned to ${contractor} as of ${formatDate(new Date().toISOString())}. Closed actions are excluded — they no longer need contractor attention.`;
  y = summaryParagraph(doc, narrative, y);

  y = statStrip(
    doc,
    [
      { value: active.length, label: "TOTAL ACTIONS", color: BRAND.navy },
      { value: active.filter((a) => a.status === "Open").length, label: "OPEN", color: BRAND.danger },
      { value: active.filter((a) => a.status === "In Progress").length, label: "IN PROGRESS", color: BRAND.warning },
      { value: active.filter((a) => a.status === "Waiting Stoppage").length, label: "WAITING STOPPAGE", color: BRAND.accent },
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
        { value: byContractor[c].filter((a) => a.status === "In Progress").length, color: BRAND.warning },
        { value: byContractor[c].filter((a) => a.status === "Waiting Stoppage").length, color: BRAND.accent },
      ],
    }));
    y = needsNewPage(doc, y, chartRows.length * 28 + 60);
    y = sectionTitle(doc, "Actions by Contractor", y);
    y = chartLegend(
      doc,
      [
        { label: "Open", color: BRAND.danger },
        { label: "In Progress", color: BRAND.warning },
        { label: "Waiting Stoppage", color: BRAND.accent },
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
        list.filter((a) => a.status === "In Progress").length,
        list.filter((a) => a.status === "Waiting Stoppage").length,
        list.length,
        `${oldest}d`,
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [["Contractor", "Open", "In Progress", "Waiting Stoppage", "Total", "Oldest Open"]],
      body: summaryRows.length ? summaryRows : [["No active actions right now", "", "", "", "", ""]],
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
        : "Open / In Progress / Waiting Stoppage Actions",
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
    doc.text("Nothing to report — no Open, In Progress, or Waiting Stoppage actions on record.", 36, y);
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

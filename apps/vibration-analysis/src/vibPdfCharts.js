// Charts for the Vibration PDFs, drawn as vector shapes with jsPDF (sharp
// when zoomed or printed, no canvas). Every chart takes a box (x, y, w) and
// returns the y below it, so two can sit side by side (chartRow).
// Colours: the four levels as on screen; categories (contractors, stages)
// use CAT in a fixed order; every chart also carries numbers or a legend,
// so it still reads in black and white.

export const LV = {
  Normal: [24, 115, 74],
  Caution: [154, 105, 0],
  Alert: [196, 43, 43],
  Danger: [109, 40, 217],
  "Not read": [170, 180, 192],
};
// categories, in this order, never cycled through the level colours
export const CAT = [
  [30, 91, 184],
  [14, 116, 144],
  [200, 130, 20],
  [96, 110, 135],
  [150, 80, 150],
  [60, 150, 110],
];
const INK = [20, 26, 33];
const MUTED = [110, 125, 145];
const GRID = [226, 231, 238];
const TRACK = [236, 240, 244];

const fmt = (v) => (v == null || Number.isNaN(v) ? "–" : Math.round(v * 10) / 10);

function fillPolygon(doc, points) {
  if (points.length < 3) return;
  const segs = [];
  for (let i = 1; i < points.length; i++) segs.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  doc.lines(segs, points[0][0], points[0][1], [1, 1], "F", true);
}

function clip(doc, text, max) {
  let t = String(text ?? "");
  if (doc.getTextWidth(t) <= max) return t;
  while (t.length > 1 && doc.getTextWidth(t + "…") > max) t = t.slice(0, -1);
  return t + "…";
}

export function chartTitle(doc, text, x, y, sub) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(11, 37, 69);
  doc.text(text, x, y);
  if (sub) {
    const tw = doc.getTextWidth(text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(sub, x + tw + 6, y);
  }
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...INK);
  return y + 12;
}

// Room for a chart: a new page when it doesn't fit.
export function fit(doc, y, need) {
  if (y + need <= doc.internal.pageSize.getHeight() - 46) return y;
  doc.addPage(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? "landscape" : "portrait");
  return 44;
}

// Two (or more) charts side by side. cells: [(x, y, w) => bottomY].
export function chartRow(doc, y, need, cells) {
  y = fit(doc, y, need);
  const W = doc.internal.pageSize.getWidth() - 72;
  const gap = 22;
  const w = (W - gap * (cells.length - 1)) / cells.length;
  const bottoms = cells.map((fn, i) => (fn ? fn(36 + i * (w + gap), y, w) : y));
  return Math.max(...bottoms) + 16;
}

// parts: [{ label, value, color }]; legend to the right with value and %
export function donut(doc, { x, y, w, title, sub, parts, center, centerSub }) {
  if (title) y = chartTitle(doc, title, x, y + 2, sub) + 2;
  const r = Math.min(46, w * 0.2);
  const cx = x + r + 2;
  const cy = y + r + 2;
  const total = parts.reduce((n, p) => n + (p.value || 0), 0);
  if (!total) {
    doc.setDrawColor(...GRID);
    doc.setLineWidth(r * 0.42);
    doc.circle(cx, cy, r * 0.78, "S");
  } else {
    let a = -Math.PI / 2;
    parts.forEach((p) => {
      if (!p.value) return;
      const sweep = (p.value / total) * Math.PI * 2;
      const steps = Math.max(3, Math.ceil(sweep / (Math.PI / 30)));
      const pts = [[cx, cy]];
      for (let i = 0; i <= steps; i++) {
        const t = a + (sweep * i) / steps;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
      doc.setFillColor(...p.color);
      fillPolygon(doc, pts);
      // thin white gap between slices
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1.2);
      doc.line(cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a));
      a += sweep;
    });
  }
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r * 0.58, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(String(center ?? total), cx, cy + 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...MUTED);
  doc.text(centerSub || "total", cx, cy + 11, { align: "center" });
  // legend
  const lx = x + r * 2 + 18;
  const lw = x + w - lx;
  let ly = y + 8;
  const step = Math.min(15, Math.max(11, (r * 2) / Math.max(parts.length, 1)));
  doc.setFontSize(8);
  parts.forEach((p) => {
    doc.setFillColor(...p.color);
    doc.roundedRect(lx, ly - 6.5, 8, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(String(p.value || 0), lx + 12, ly);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    const pct = total ? ` (${Math.round(((p.value || 0) / total) * 100)} %)` : "";
    doc.text(clip(doc, `${p.label}${pct}`, lw - 34), lx + 30, ly);
    ly += step;
  });
  doc.setTextColor(...INK);
  return Math.max(cy + r, ly - step) + 6;
}

// One bar per row. rows: [{ label, value, color, text? }]; max (default:
// largest); line: { value, label } draws a dashed reference (e.g. the alarm
// limit or a target).
export function hbars(doc, { x, y, w, title, sub, rows, max, line, labelW, rowH = 15, empty = "Nothing to show." }) {
  if (title) y = chartTitle(doc, title, x, y + 2, sub) + 2;
  if (!rows.length) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(empty, x, y + 8);
    doc.setTextColor(...INK);
    return y + 18;
  }
  doc.setFontSize(7.8);
  const lw = labelW ?? Math.min(w * 0.36, Math.max(...rows.map((r) => doc.getTextWidth(String(r.label)))) + 8);
  const bx = x + lw;
  const bw = w - lw - 46;
  const top = Math.max(max ?? 0, line?.value ?? 0, ...rows.map((r) => r.value || 0), 1e-9);
  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    doc.setTextColor(...INK);
    doc.text(clip(doc, r.label, lw - 6), x, yy + 7.5);
    doc.setFillColor(...TRACK);
    doc.rect(bx, yy, bw, 9, "F");
    const v = Math.max(0, r.value || 0);
    if (v) {
      doc.setFillColor(...(r.color || CAT[0]));
      doc.rect(bx, yy, Math.max(1, (Math.min(v, top) / top) * bw), 9, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.text(String(r.text ?? fmt(r.value)), bx + bw + 5, yy + 7.5);
    doc.setFont("helvetica", "normal");
  });
  const bottom = y + rows.length * rowH;
  if (line && line.value <= top) {
    const lx = bx + (line.value / top) * bw;
    doc.setDrawColor(...LV.Alert);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern([2.5, 2], 0);
    doc.line(lx, y - 3, lx, bottom - rowH + 12);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(6.8);
    doc.setTextColor(...LV.Alert);
    doc.text(line.label, lx, bottom + 6, { align: "center" });
    doc.setTextColor(...INK);
    return bottom + 12;
  }
  return bottom + 4;
}

// One stacked bar per row. rows: [{ label, parts: [{ value, color }] }];
// legend: [{ label, color }]. Each bar is scaled to the largest row (so a
// small area looks small) and shows its total at the end.
export function stackRows(doc, { x, y, w, title, sub, rows, legend, rowH = 15, empty = "Nothing to show." }) {
  if (title) y = chartTitle(doc, title, x, y + 2, sub) + 2;
  if (legend) y = legendLine(doc, legend, x, y + 6, w) + 4;
  if (!rows.length) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(empty, x, y + 8);
    doc.setTextColor(...INK);
    return y + 18;
  }
  doc.setFontSize(7.8);
  const lw = Math.min(w * 0.34, Math.max(...rows.map((r) => doc.getTextWidth(String(r.label)))) + 8);
  const bx = x + lw;
  const bw = w - lw - 30;
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((n, p) => n + (p.value || 0), 0)));
  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    doc.setTextColor(...INK);
    doc.text(clip(doc, r.label, lw - 6), x, yy + 7.5);
    let px = bx;
    let sum = 0;
    r.parts.forEach((p) => {
      if (!p.value) return;
      const pw = (p.value / max) * bw;
      doc.setFillColor(...p.color);
      doc.rect(px, yy, Math.max(pw - 1, 0.6), 9, "F");
      if (pw > 13) {
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(p.value), px + pw / 2 - 0.5, yy + 6.8, { align: "center" });
        doc.setFontSize(7.8);
      }
      px += pw;
      sum += p.value;
    });
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(String(sum), px + 4, yy + 7.5);
    doc.setFont("helvetica", "normal");
  });
  return y + rows.length * rowH + 4;
}

export function legendLine(doc, items, x, y, w) {
  doc.setFontSize(7.5);
  let lx = x;
  let ly = y;
  items.forEach((it) => {
    const tw = doc.getTextWidth(it.label) + 22;
    if (lx + tw > x + w) {
      lx = x;
      ly += 11;
    }
    doc.setFillColor(...it.color);
    doc.rect(lx, ly - 6, 7, 7, "F");
    doc.setTextColor(...MUTED);
    doc.text(it.label, lx + 10, ly);
    lx += tw;
  });
  doc.setTextColor(...INK);
  return ly + 4;
}

// Columns over time. labels: x labels; series: [{ label, color, values }]
// (several series sit side by side, or on top of each other when stacked);
// target: dashed line (e.g. 90 %); maxY (default: largest); unit after values.
export function columns(doc, { x, y, w, h = 110, title, sub, labels, series, stacked, target, maxY, unit = "", valueLabels = true }) {
  if (title) y = chartTitle(doc, title, x, y + 2, sub) + 2;
  if (series.length > 1) y = legendLine(doc, series.map((s) => ({ label: s.label, color: s.color })), x, y + 6, w) + 12;
  const left = x + 24;
  const plotW = w - 24;
  const plotH = h - 20;
  const totals = labels.map((_, i) => (stacked ? series.reduce((n, s) => n + (s.values[i] || 0), 0) : Math.max(0, ...series.map((s) => s.values[i] || 0))));
  const top = maxY ?? Math.max(1, ...totals, target ?? 0);
  // grid: 0, half, top
  doc.setFontSize(6.5);
  [0, 0.5, 1].forEach((f) => {
    const gy = y + plotH - f * plotH;
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(left, gy, left + plotW, gy);
    doc.setTextColor(...MUTED);
    doc.text(`${fmt(top * f)}${unit && f === 1 ? unit : ""}`, left - 3, gy + 2, { align: "right" });
  });
  const slot = plotW / Math.max(labels.length, 1);
  const groupW = Math.min(slot * 0.72, 34);
  labels.forEach((lab, i) => {
    const gx = left + i * slot + (slot - groupW) / 2;
    if (stacked) {
      let acc = 0;
      series.forEach((s) => {
        const v = s.values[i] || 0;
        if (!v) return;
        const bh = (v / top) * plotH;
        doc.setFillColor(...s.color);
        doc.rect(gx, y + plotH - ((acc + v) / top) * plotH, groupW, Math.max(bh - 0.6, 0.5), "F");
        acc += v;
      });
      if (valueLabels && acc) {
        doc.setTextColor(...INK);
        doc.text(String(fmt(acc)), gx + groupW / 2, y + plotH - (acc / top) * plotH - 2, { align: "center" });
      }
    } else {
      const bw = groupW / series.length;
      series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) return;
        const bh = (Math.min(v, top) / top) * plotH;
        doc.setFillColor(...(typeof s.colorOf === "function" ? s.colorOf(v) : s.color));
        doc.rect(gx + k * bw, y + plotH - bh, Math.max(bw - 1, 0.6), Math.max(bh, 0.5), "F");
        if (valueLabels && series.length === 1) {
          doc.setTextColor(...INK);
          doc.text(`${fmt(v)}${unit}`, gx + bw / 2, y + plotH - bh - 2, { align: "center" });
        }
      });
    }
    doc.setTextColor(...MUTED);
    doc.text(clip(doc, lab, slot - 2), left + i * slot + slot / 2, y + plotH + 9, { align: "center" });
  });
  if (target != null && target <= top) {
    const ty = y + plotH - (target / top) * plotH;
    doc.setDrawColor(...LV.Normal);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(left, ty, left + plotW, ty);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...LV.Normal);
    doc.text(`target ${target}${unit}`, left + plotW, ty - 2, { align: "right" });
  }
  doc.setTextColor(...INK);
  return y + h;
}

// Colour for a % (90 + green, 70–89 amber, under 70 red), as the tables.
export const pctColor = (p) => (p == null ? LV["Not read"] : p >= 90 ? LV.Normal : p >= 70 ? LV.Caution : LV.Alert);

// A grid of coloured cells. rowLabels × colLabels, values[r][c] = % or null.
export function heat(doc, { x, y, w, title, sub, rowLabels, colLabels, values }) {
  if (title) y = chartTitle(doc, title, x, y + 2, sub) + 2;
  doc.setFontSize(7);
  const lw = Math.min(w * 0.22, Math.max(40, ...rowLabels.map((l) => doc.getTextWidth(String(l)))) + 8);
  const cw = (w - lw) / Math.max(colLabels.length, 1);
  const ch = 13;
  doc.setTextColor(...MUTED);
  colLabels.forEach((c, j) => doc.text(clip(doc, c, cw - 2), x + lw + j * cw + cw / 2, y + 6, { align: "center" }));
  y += 10;
  rowLabels.forEach((rl, i) => {
    const yy = y + i * ch;
    doc.setTextColor(...INK);
    doc.text(clip(doc, rl, lw - 6), x, yy + 9);
    colLabels.forEach((_, j) => {
      const v = values[i]?.[j];
      const col = v == null ? [244, 246, 249] : pctColor(v);
      doc.setFillColor(...col);
      doc.rect(x + lw + j * cw + 0.6, yy + 0.6, cw - 1.2, ch - 1.2, "F");
      if (v != null) {
        doc.setTextColor(255, 255, 255);
        doc.text(String(v), x + lw + j * cw + cw / 2, yy + 9, { align: "center" });
      }
    });
  });
  const bottom = y + rowLabels.length * ch;
  legendLine(doc, [{ label: "90 % or more", color: LV.Normal }, { label: "70–89 %", color: LV.Caution }, { label: "under 70 %", color: LV.Alert }, { label: "nothing due", color: [244, 246, 249] }], x + lw, bottom + 10, w - lw);
  doc.setTextColor(...INK);
  return bottom + 16;
}

// A small line chart: points [{ label, value }], alarm limit (dashed red),
// dot colour = level of the last point.
export function trend(doc, { x, y, w, h = 66, title, sub, points, alarm, unit = "", color = CAT[0] }) {
  const last = [...(points || [])].reverse().find((p) => p.value != null);
  const fullSub = [sub, last ? `latest ${fmt(last.value)} ${unit}` : ""].filter(Boolean).join(" · ");
  if (title) y = chartTitle(doc, title, x, y + 2, fullSub) + 1;
  const vals = points.map((p) => p.value).filter((v) => v != null);
  const left = x + 20;
  const pw = w - 24;
  const ph = h - 16;
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.5);
  doc.rect(left, y, pw, ph, "S");
  if (!vals.length) {
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("No readings", left + pw / 2, y + ph / 2, { align: "center" });
    doc.setTextColor(...INK);
    return y + h;
  }
  const top = Math.max(...vals, alarm || 0) * 1.12 || 1;
  const px = (i) => left + (points.length === 1 ? pw / 2 : (i / (points.length - 1)) * pw);
  const py = (v) => y + ph - (v / top) * ph;
  doc.setFontSize(6.3);
  doc.setTextColor(...MUTED);
  doc.text(String(fmt(top)), left - 2, y + 4, { align: "right" });
  doc.text("0", left - 2, y + ph, { align: "right" });
  if (alarm) {
    doc.setDrawColor(...LV.Alert);
    doc.setLineWidth(0.7);
    doc.setLineDashPattern([2.5, 2], 0);
    doc.line(left, py(alarm), left + pw, py(alarm));
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...LV.Alert);
    doc.text(`alarm ${fmt(alarm)}`, left + pw - 1, py(alarm) - 2, { align: "right" });
  }
  doc.setDrawColor(...color);
  doc.setLineWidth(1.4);
  let prev = null;
  points.forEach((p, i) => {
    if (p.value == null) return;
    const pt = [px(i), py(p.value)];
    if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
    prev = pt;
  });
  points.forEach((p, i) => {
    if (p.value == null) return;
    doc.setFillColor(...(p.color || color));
    doc.circle(px(i), py(p.value), 2.2, "F");
  });
  doc.setTextColor(...MUTED);
  points.forEach((p, i) => doc.text(clip(doc, p.label, pw / Math.max(points.length, 1)), px(i), y + ph + 8, { align: "center" }));
  doc.setTextColor(...INK);
  return y + h;
}

// Small multiples: one trend per item, `perRow` across.
export function trendGrid(doc, y, items, perRow = 3) {
  const W = doc.internal.pageSize.getWidth() - 72;
  const gap = 18;
  const w = (W - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < items.length; i += perRow) {
    y = fit(doc, y, 92);
    const row = items.slice(i, i + perRow);
    const bottoms = row.map((it, k) => trend(doc, { ...it, x: 36 + k * (w + gap), y, w }));
    y = Math.max(...bottoms) + 12;
  }
  return y;
}

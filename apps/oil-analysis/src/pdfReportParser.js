// Parses Mobil/ExxonMobil oil-analysis lab report PDFs (the "Sample Data &
// Trends" export) straight into this app's sample schema, entirely
// client-side — this app has no backend that could do that for us.
//
// The PDF has no tagged table structure; it's just positioned text plus
// colored rectangles. The layout is consistent across every report seen so
// far: a left "attribute" column of row labels, then up to 5 sample
// columns spaced ~41-42pt apart (oldest → newest, left to right). We
// reconstruct the grid by:
//   1. Grouping text items into rows by y-position.
//   2. Taking the "Sample ID" row's item x-positions as the column anchors
//      for that page (every report has one, and IDs are always present).
//   3. For every other row, binning its items to a column by interval
//      assignment (see binToColumns() below) — not by nearest-anchor
//      distance, which mis-files real cells whose content spans nearly the
//      full column width (an 11-digit Sample ID, a "04 Jun 2024" date's
//      later tokens) into the neighboring column.
// Cell background color (which conveys more than the numbers alone — a
// single wear metal can be flagged even when the row's overall rating
// isn't) is read by rendering the page to a canvas and sampling pixels at
// each cell's position, since there's no reliable way to parse fill colors
// out of the raw content stream across however this PDF was generated.

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Row label (normalized, case-insensitive prefix match) -> schema field +
// how to coerce it. Order doesn't matter; matching is by prefix so minor
// PDF-to-PDF variance ("Particle Count>14um" vs "Particle Count >4um",
// trailing units) doesn't need an exact match.
const FIELD_ROWS = [
  { match: "report status", key: "reportStatus", type: "text" },
  { match: "sample id", key: "sampleId", type: "text" },
  { match: "sampled", key: "sampledDate", type: "date" },
  { match: "contamination rating", key: "contaminationRating", type: "text" },
  { match: "equipment rating", key: "equipmentRating", type: "text" },
  { match: "lubricant rating", key: "lubricantRating", type: "text" },
  { match: "particle count >4um", key: "particleCount4um", type: "num" },
  { match: "particle count >6um", key: "particleCount6um", type: "num" },
  { match: "particle count>14um", key: "particleCount14um", type: "num" },
  { match: "particle count >14um", key: "particleCount14um", type: "num" },
  { match: "pq index", key: "pqIndex", type: "num" },
  { match: "visc@40c", key: "visc40C", type: "num", flaggable: "Visc" },
  { match: "visc@100c", key: "visc40C", type: "num", flaggable: "Visc" }, // reported at a different bath temp, same app field
  { match: "oxidation", key: "oxidation", type: "num", flaggable: "Oxidation" },
  { match: "tan (mg koh/g)", key: "tan", type: "num", flaggable: "TAN" },
  { match: "water", key: "water", type: "num", flaggable: "Water" },
  { match: "ag (silver)", key: "wear.Ag", type: "num", flaggable: "Ag" },
  { match: "al (aluminum)", key: "wear.Al", type: "num", flaggable: "Al" },
  { match: "cr (chromium)", key: "wear.Cr", type: "num", flaggable: "Cr" },
  { match: "cu (copper)", key: "wear.Cu", type: "num", flaggable: "Cu" },
  { match: "fe (iron)", key: "wear.Fe", type: "num", flaggable: "Fe" },
  { match: "mo (molybdenum)", key: "wear.Mo", type: "num", flaggable: "Mo" },
  { match: "ni (nickel)", key: "wear.Ni", type: "num", flaggable: "Ni" },
  { match: "pb (lead)", key: "wear.Pb", type: "num", flaggable: "Pb" },
  { match: "sn (tin)", key: "wear.Sn", type: "num", flaggable: "Sn" },
  { match: "k (potassium)", key: "contaminants.K", type: "num", flaggable: "K" },
  { match: "na (sodium)", key: "contaminants.Na", type: "num", flaggable: "Na" },
  { match: "si (silicon)", key: "contaminants.Si", type: "num", flaggable: "Si" },
  { match: "b (boron)", key: "additives.B", type: "num", flaggable: "B" },
  { match: "ba (barium)", key: "additives.Ba", type: "num", flaggable: "Ba" },
  { match: "ca (calcium)", key: "additives.Ca", type: "num", flaggable: "Ca" },
  { match: "mg (magnesium)", key: "additives.Mg", type: "num", flaggable: "Mg" },
  { match: "p (phosphorus)", key: "additives.P", type: "num", flaggable: "P" },
  { match: "zn (zinc)", key: "additives.Zn", type: "num", flaggable: "Zn" },
];

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchFieldRow(label) {
  const norm = normalizeLabel(label);
  return FIELD_ROWS.find((f) => norm.startsWith(f.match));
}

// Joins consecutive text items in x-order, inserting a space only where the
// PDF itself left a real gap between them. pdf.js splits a line into
// several same-style runs even with no space in the source text (e.g. a
// Unit ID like "123.BC100" comes back as "123.", "BC", "100" with zero gap
// between them) — naively joining every item with " " would turn that into
// "123. BC 100". A genuine space in the source measures ~1.5-1.7pt here vs.
// 0pt for a tight run, so any positive gap is real.
function joinItems(items) {
  let out = "";
  let prevEnd = null;
  for (const it of items) {
    if (prevEnd !== null && it.x - prevEnd > 0.5) out += " ";
    out += it.str;
    prevEnd = it.x + (it.w || 0);
  }
  return out.trim();
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ||= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// Groups text items into rows by y (rows are ~13-14pt apart, well
// separated), then within each row bins non-blank items by x into columns.
function buildRows(items) {
  const rows = new Map(); // roundedY -> items[]
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const bucket = [...rows.keys()].find((ry) => Math.abs(ry - y) <= 2);
    const key = bucket ?? y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top to bottom (PDF y grows upward)
    .map(([y, its]) => ({ y, items: its.sort((a, b) => a.x - b.x) }));
}

// The table's left margin also carries section headers ("Sample Info",
// "Lubricant", "Wear (ppm)", "Contaminant (ppm)", "Additive (ppm)") sitting
// further left (x < 40) than the actual field labels (x ~67) — usually a
// distinct row, but they can land within the same 2pt y-bucket as a real
// field row by coincidence, which would otherwise make the section header
// look like that row's label and swallow the real one entirely.
const SECTION_HEADER_RE = /^(Sample Info|Lubricant|Wear|Contaminant|Additive)(\s*\(ppm\))?$/i;

function usableItems(row) {
  return row.items.filter((it) => !(it.x < 40 && SECTION_HEADER_RE.test(it.str.trim())));
}

// A row's label is always the leftmost of its non-section-header items —
// the label column's width itself varies (a single-sample report's table
// is narrower, shifting everything left), so anchoring on a fixed x cutoff
// isn't reliable; leftmost always is.
function rowLabel(row) {
  const items = usableItems(row);
  return items.length ? items[0].str.trim() : "";
}

function rowDataItems(row) {
  return usableItems(row).slice(1);
}

// Bins a row's data items to a column by finding the rightmost anchor at or
// left of the item (an interval assignment: column i owns [anchor_i,
// anchor_i+1)), not by nearest-anchor-by-distance. Columns are
// left-anchored, not centered, and a cell's content can span nearly the
// full column width (an 11-digit Sample ID leaves ~0.5pt to the next
// anchor; a "04 Jun 2024" date's last token can end up closer in absolute
// distance to the *next* anchor than its own) — nearest-anchor-by-distance
// misfiled both of those into the wrong column, while this interval test
// gets them right since it only asks "which column's span contains this
// x", never "which anchor is numerically closest".
// A small epsilon absorbs sub-point float rounding at an exact boundary
// (e.g. a cell's own anchor-defining item comparing against itself). The
// last column has no right boundary from the next anchor, so it keeps the
// old maxDist-from-anchor cutoff to still drop the trend charts' legend
// labels and axis ticks, which sit at roughly the same row heights as real
// table rows, to the right of the table.
function binToColumns(items, anchors, colWidth) {
  const maxDist = colWidth * 0.6;
  const epsilon = 1;
  const cells = anchors.map(() => []);
  for (const it of items) {
    let col = -1;
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (it.x >= anchors[i] - epsilon) {
        col = i;
        break;
      }
    }
    if (col === -1) continue;
    if (col === anchors.length - 1 && it.x - anchors[col] > maxDist) continue;
    cells[col].push(it);
  }
  const sorted = cells.map((its) => its.sort((a, b) => a.x - b.x));
  return {
    texts: sorted.map((its) => joinItems(its)),
    items: sorted,
  };
}

// Every label the header block can show, so a field's value can be cut off
// at the *next* one — the account/sample/equipment info panels sit side by
// side, so "Name:", "Service Level:", and "Manufacturer:" (say) can all
// land on the same row, and a value would otherwise swallow every field
// after it on that line.
const ANY_HEADER_LABEL_RE =
  /^(Unit ID|Asset ID|Description|ID|Name|Address|Sample ID|Service Level|Bottle ID|Tested Lubricant|Asset Class|Manufacturer|Model|Lubricant):$/i;

function parseHeaderFields(rows) {
  const header = {};
  const patterns = {
    unitId: /^Unit ID:$/i,
    assetId: /^Asset ID:$/i,
    description: /^Description:$/i,
    accountName: /^Name:$/i,
    assetClass: /^Asset Class:$/i,
    manufacturer: /^Manufacturer:$/i,
    model: /^Model:$/i,
  };
  for (const row of rows) {
    if (row.y < 640) break; // header block only — below this is the data table
    for (let i = 0; i < row.items.length; i++) {
      const it = row.items[i];
      for (const [key, re] of Object.entries(patterns)) {
        if (header[key] !== undefined) continue;
        if (re.test(it.str.trim())) {
          let end = i + 1;
          while (end < row.items.length && !ANY_HEADER_LABEL_RE.test(row.items[end].str.trim())) end++;
          header[key] = joinItems(row.items.slice(i + 1, end));
        }
      }
    }
  }
  return header;
}

// Classifies a sampled pixel as the lab's own Alert/Caution/none, based on
// this report family's fill colors (a warm red vs. a gold/yellow vs. white
// or very light backgrounds that carry no flag).
function classifyColor(r, g, b, a) {
  if (a < 40) return null; // transparent — treat as no fill
  if (r > 235 && g > 235 && b > 235) return null; // white/near-white
  if (r > 150 && g < 120 && b < 120) return "Alert";
  if (r > 200 && g > 150 && b < 120) return "Caution";
  return null;
}

async function renderPageCanvas(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { ctx, viewport };
}

// Samples a small cluster of points across the cell (avoiding the exact
// center, which is likelier to land on glyph ink) and returns the most
// common non-null classification.
function sampleCellSeverity(ctx, viewport, pdfX, pdfY, colWidth) {
  const offsets = [
    [-colWidth * 0.32, 3],
    [colWidth * 0.32, 3],
    [-colWidth * 0.32, -4],
    [colWidth * 0.32, -4],
  ];
  const counts = {};
  for (const [dx, dy] of offsets) {
    const [vx, vy] = viewport.convertToViewportPoint(pdfX + dx, pdfY + dy);
    const px = Math.round(vx);
    const py = Math.round(vy);
    if (px < 0 || py < 0 || px >= ctx.canvas.width || py >= ctx.canvas.height) continue;
    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    const cls = classifyColor(r, g, b, a);
    if (cls) counts[cls] = (counts[cls] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

async function extractRecommendationSections(pdf) {
  // Recommendation/Comments text is only printed for the current (latest)
  // sample, on whichever page(s) follow the data table — it can spill onto
  // an extra page when there are many recommendation paragraphs.
  let text = "";
  for (let p = 2; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => ({ str: it.str, y: Math.round(it.transform[5]) }));
    const startIdx = items.findIndex((it) => it.str.trim() === "Recommendation/Comments");
    if (startIdx === -1 && !text) continue;
    const stopIdx = items.findIndex((it, i) => i > startIdx && it.str.trim() === "Sample Timeline");
    const slice = items.slice(startIdx === -1 ? 0 : startIdx + 1, stopIdx === -1 ? items.length : stopIdx);
    const chunk = slice
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (chunk) text += (text ? "\n\n" : "") + chunk;
    if (stopIdx !== -1) break;
  }
  return text;
}

// Parses one report PDF into { header, samples } — samples are ordered
// oldest → newest, matching the PDF's own column order. Each sample has
// every field this app's schema supports; flaggedReadings is only set on
// samples where cell colors were actually sampled (i.e. every sample in
// the visible table, latest included).
export async function parsePdfReport(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page1 = await pdf.getPage(1);
  const tc = await page1.getTextContent();
  if (!tc.items.some((it) => it.str.trim())) {
    throw new Error(
      `${file.name}: this PDF has no selectable text (likely exported via "Print to PDF" rather than the browser's own "Save as PDF") — re-export it and try again.`
    );
  }
  const rows = buildRows(tc.items);

  const header = parseHeaderFields(rows);
  if (!header.unitId) {
    throw new Error(`${file.name}: couldn't find a Unit ID on this PDF — is it the same report format?`);
  }

  // Only the table itself (below the "Sample Data & Trends" heading) should
  // ever match a FIELD_ROWS label — the header block above it has its own
  // "Sample ID:" field for the current sample, which would otherwise also
  // match the "sample id" prefix and risk colliding with the table's own
  // Sample ID row.
  const tableTitleRow = rows.find((r) => rowLabel(r) === "Sample Data & Trends");
  const tableRows = tableTitleRow ? rows.filter((r) => r.y < tableTitleRow.y) : rows;

  const sampleIdRow = tableRows.find((r) => normalizeLabel(rowLabel(r)) === "sample id");
  if (!sampleIdRow) {
    throw new Error(`${file.name}: couldn't find the Sample ID row — is it the same report format?`);
  }
  const anchors = rowDataItems(sampleIdRow).map((it) => it.x);
  const colWidth = anchors.length > 1 ? anchors[1] - anchors[0] : 41;
  if (anchors.length === 0) {
    throw new Error(`${file.name}: no sample columns found.`);
  }

  const samples = anchors.map(() => ({
    unitId: header.unitId,
    description: header.description || "",
    wear: {},
    contaminants: {},
    additives: {},
    flaggedReadings: [],
  }));

  const { ctx, viewport } = await renderPageCanvas(page1, 2);

  for (const row of tableRows) {
    const field = matchFieldRow(rowLabel(row));
    if (!field) continue;
    const { texts: cellTexts, items: dataItemsByCol } = binToColumns(rowDataItems(row), anchors, colWidth);

    cellTexts.forEach((text, i) => {
      if (!text) return;
      let value = text;
      if (field.type === "num") {
        const n = parseFloat(text.replace(/[^0-9.-]/g, ""));
        value = isNaN(n) ? "" : n;
      }
      setPath(samples[i], field.key, value);

      if (field.flaggable) {
        const items = dataItemsByCol[i];
        if (items.length) {
          const midX = items[0].x + (items[items.length - 1].x + items[items.length - 1].w - items[0].x) / 2;
          const severity = sampleCellSeverity(ctx, viewport, midX, row.y, colWidth);
          if (severity) samples[i].flaggedReadings.push({ param: field.flaggable, severity });
        }
      }
    });
  }

  // Only the newest (rightmost) sample gets recommendation text — the PDF
  // doesn't print it for older history-table columns.
  const recommendationText = await extractRecommendationSections(pdf);
  if (recommendationText) {
    samples[samples.length - 1].recommendations = recommendationText.split(/\n\n+/).filter(Boolean);
  }

  return {
    fileName: file.name,
    header,
    samples: samples.filter((s) => s.sampleId), // drop any column that came up empty
  };
}

export async function parsePdfReports(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    try {
      results.push({ ok: true, ...(await parsePdfReport(files[i])) });
    } catch (err) {
      results.push({ ok: false, fileName: files[i].name, error: err.message });
    }
    onProgress?.(i + 1, files.length);
  }
  return results;
}

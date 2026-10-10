// ASEC vibration report (PDF) → machines with readings, status and
// recommendations. The text is read as one stream, so it does not matter
// how the PDF splits it into lines or pages, or whether the month comes in
// one file or two (the import merges files).
//
// What the text looks like:
//   page header on every page: "Integrated Management Systems Document
//     Number … Issue Date July 2025 … Approved by Maintenance Manager"
//   cover: "Vibration Analysis Report … July 2026"
//   "Problems description": "1. 123MD456 Example Mill Main Drive
//     Unsatisfactory  Check gear unit bearings …"
//   per machine: "123.MD456 - Example Mill Main Gearbox (12-Jul-26)" then
//     "M1H - Motor Outboard Horizontal .993 mm/Sec  M1P - Motor Outboard
//     Horz Peakvue 1.230 G-s …" then "Recommendations:" and bullets.
import { linesOf, lineText, monthIn, ddmonyy } from "./textLines.js";
import { canonId } from "./rhiReport.js";

const ID = String.raw`\d{3}\s*\.?\s*[A-Z]{2,3}\s*\.?\s*\d{3}`;
const HEAD = new RegExp(String.raw`(${ID})\s+-\s+([^\n()]{2,80}?)\s*\((\d{1,2}-[A-Za-z]{3}-\d{2,4})\)`, "g");
const LINE = /([A-Z]\d{1,2}[HVAP])\s+-\s+(.+?)\s+(-?\d*\.\d+|-?\d+)\s*(mm\/Sec|G-s)/g;
const STATUS = String.raw`Unacceptable|Unsatisfactory|Satisfactory|Acceptable|Unpermissible|Permissible|Good|Normal|Alarm|Danger|Caution`;
const BULLET = /[•▪●\uF0B7\uF0A7\uF0D8\uF076\uF0FC]/; // Word bullets come through as Symbol-font characters

// The page header repeats inside the text; drop it.
const HEADER_LINE =
  /^(Integrated Management|Systems Document Number|Systems$|Document Number|Vibration trend history|Issue Number|Issue Date|Project Name|Review Date|Reviewed by|Approved by|Maintenance (Engineer|Manager)$)/i;

function cleanStream(lines) {
  return lines
    .map((l) => l.replace(/\\([-*>#.])/g, "$1").trim()) // (markdown escapes, in text copied from Drive)
    .filter((l) => l && !HEADER_LINE.test(l))
    .join("\n");
}

function bullets(text) {
  return String(text || "")
    .split(BULLET)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b && !/^(Integrated Management|Document Number)/i.test(b));
}

export function looksLikeAsec(pages) {
  const t = pages.slice(0, 12).map((p) => linesOf(p).map(lineText).join("\n")).join("\n");
  return /Abbreviated Last Measurement|Problems? description|mm\/Sec/i.test(t);
}

export function parseAsec(pages, fileName = "") {
  const lines = [];
  pages.forEach((p) => linesOf(p).forEach((l) => lines.push(lineText(l))));
  return parseAsecText(lines.join("\n"), fileName);
}

// Same as parseAsec, from plain text (one line per text line).
export function parseAsecText(text, fileName = "") {
  const warnings = [];
  const stream = cleanStream(String(text).split(/\n/));
  const flat = stream.replace(/\n/g, " ");

  // month: the cover ("July 2026"); the page header's issue date was removed
  const month = monthIn(stream.slice(0, 600)) || monthIn(fileName);

  // ── problems description: status + recommendations per machine ──
  const status = {};
  // "Problems description" is also named on the contents page and in the
  // "Measuring data & Problems description" heading: take the mention that
  // is followed by numbered machine IDs
  const idRe = new RegExp(String.raw`\d{1,2}\.?\s+${ID}`);
  const pStart = [...flat.matchAll(/Problems? description/gi)].map((m) => m.index).find((i) => {
    const next = flat.slice(i, i + 500);
    return idRe.test(next) && !/Abbreviated Last Measurement/i.test(next.slice(0, next.search(idRe)));
  }) ?? -1;
  const after = pStart >= 0 ? flat.slice(pStart + 20).search(/Measuring data|Abbreviated Last Measurement/i) : -1;
  const pEnd = after >= 0 ? pStart + 20 + after : -1;
  if (pStart >= 0) {
    const part = flat.slice(pStart, pEnd > pStart ? pEnd : undefined);
    const re = new RegExp(String.raw`(?:^|\s)(\d{1,2})\.?\s+(${ID})\s+(.{0,80}?)\s+(${STATUS})\b`, "g");
    const hits = [...part.matchAll(re)];
    hits.forEach((h, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].index : part.length;
      const recText = part.slice(h.index + h[0].length, end);
      status[canonId(h[2])] = { name: h[3].replace(/\s+/g, " ").trim(), word: h[4], rec: bullets(recText) };
    });
  }

  // ── machine blocks ──
  const heads = [...flat.matchAll(HEAD)].filter((h) => pEnd < 0 || h.index >= pEnd);
  const machines = new Map();
  heads.forEach((h, i) => {
    const eq = canonId(h[1]);
    const block = flat.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : flat.length);
    const date = ddmonyy(h[3]);
    const m = machines.get(eq) || { eq, name: h[2].replace(/\s+/g, " ").trim(), condition: "", recommendation: "", readings: [], _rec: [] };
    machines.set(eq, m);
    const acc = {};
    for (const x of block.matchAll(LINE)) {
      const code = x[1];
      let desc = x[2].replace(/\s+/g, " ").trim().replace(/(\d)([A-Za-z])/g, "$1 $2");
      const v = parseFloat(x[3]);
      const where = `${eq} ${code}`;
      if (x[4] === "G-s") {
        const base = desc.replace(/\s*(Horz|Horizontal|Vert|Vertical|Axial)?\s*Peakvue$/i, "").trim();
        m.readings.push({ point: base, pointRaw: desc, family: "Gs", sub: "", vals: { G: v }, date, note: "", where });
        continue;
      }
      const d = desc.match(/^(.*?)\s*(Horizontal|Horiz|Horz|Vertical|Vert|Axial)$/i);
      if (!d) {
        m.readings.push({ point: desc, family: "RMS?", sub: code, vals: { X: v }, date, note: `"${desc}" — no direction`, where });
        continue;
      }
      const base = d[1].trim();
      if (!acc[base]) {
        acc[base] = { point: base, family: "RMS", sub: "", vals: {}, date, note: "", where };
        m.readings.push(acc[base]);
      }
      acc[base].vals[d[2][0].toUpperCase()] = v;
    }
    // "Recommendations:" up to the next machine / measurement summary
    const r = block.search(/Recommendations?\s*:/i);
    if (r >= 0) {
      let rec = block.slice(r).replace(/^Recommendations?\s*:/i, "");
      const stop = rec.search(/Abbreviated Last Measurement|Database:|\*{5}/);
      if (stop >= 0) rec = rec.slice(0, stop);
      m._rec.push(...bullets(rec));
    }
    if (!m.readings.length && !m._rec.length) warnings.push(`${eq}: no readings found after its heading.`);
  });

  // machines that are only in the problems table
  Object.keys(status).forEach((eq) => {
    if (!machines.has(eq)) machines.set(eq, { eq, name: status[eq].name, condition: "", recommendation: "", readings: [], _rec: [] });
  });
  machines.forEach((m) => {
    const st = status[m.eq];
    m.condition = st?.word || "";
    const rec = m._rec.length ? m._rec : st?.rec || [];
    m.recommendation = [...new Set(rec)].join("\n");
    delete m._rec;
  });
  if (!heads.length) warnings.push("No machine headings like “123.MD456 - Machine name (12-Jul-26)” were found — is this an ASEC report?");
  return { contractor: "ASEC", scope: "", month, machines: [...machines.values()], warnings };
}

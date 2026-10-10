// Positioned PDF text → lines. Pure (no pdf.js here) so the report readers
// can be tested in Node with saved pages.
//
// A page is { items: [{ x, y, w, h, s }] } in PDF points (y grows upwards):
// x / y = start of the text run, w = its width, h = font size, s = text.

// Items whose baselines are within `tol` points form one line, top first.
export function linesOf(page, tol = 2) {
  const items = page.items.filter((it) => String(it.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  items.forEach((it) => {
    const ln = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (ln) ln.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  });
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => b.y - a.y);
}

// Join runs left to right; a space only where there is a visible gap
// (some PDFs give one run per letter, others one per word).
export function joinRuns(items) {
  let out = "";
  let end = null;
  items.forEach((it) => {
    const gap = end === null ? 0 : it.x - end;
    if (end !== null && gap > Math.max(1, (it.h || 10) * 0.2) && !/\s$/.test(out) && !/^\s/.test(it.s)) out += " ";
    out += it.s;
    end = it.x + (it.w || 0);
  });
  return out.replace(/\s+/g, " ").trim();
}

export const lineText = (l) => joinRuns(l.items);

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// "July 2026" / "Jul-2026" / "July-2026" anywhere in the text → "2026-07"
export function monthIn(text) {
  const m = String(text || "").match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.-]*((?:20)?\d{2})\b/i);
  if (!m) return "";
  const y = m[2].length === 2 ? "20" + m[2] : m[2];
  return `${y}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}`;
}

// "19-05-26" / "19/05/2026" → "2026-05-19"
export function ddmmyy(s) {
  const m = String(s || "").replace(/\s/g, "").match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (!m) return "";
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  const mo = +m[2], d = +m[1];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "12-Jul-26" → "2026-07-12"
export function ddmonyy(s) {
  const m = String(s || "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (!m || !MONTHS[m[2].toLowerCase()]) return "";
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${y}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

// "- 5" → -5, "4.20" → 4.2, ".993" → 0.993; anything else → null
export function num(s) {
  const t = String(s ?? "").replace(/\s/g, "").replace(/,/g, ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return parseFloat(t);
}

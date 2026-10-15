// RHI vibration report, Word layout used from September 2026 (ADASH VA5 PRO).
//
// What the .docx holds (tables, see docxTables.js):
//  - "Production Line | Line 1" on the cover, "September 2026" as a paragraph
//  - "Measurement summary": SR | Asset | Asset ID | Recommended Actions
//    (no condition column: the app works the status out from its limits)
//  - per-machine tables and a last "Equipment overall vibration" table:
//    Equipment | Component | Point Location | Direction | Velocity RMS (mm/s)
//    | Acceleration RMS (g) | Measurement Date. Later tables win.
//    "Equipment" is the name and the asset ID in one cell ("Mill Fan
//    461.FN.400", "Bucket Elevator 341.BE.040 M01"); a few have no ID.
//  - each row is one direction of one bearing: velocity → an RMS reading
//    (H / V / A), acceleration → a G's reading (H / V / A in g).
//
// Point names are put in the words the VIB ID Registry uses:
//    "Point 1" HSS / "Point 1 - HSS" → "GB HSS 1",  "Point 3" RIM → "Rim Gear 3"
//    (no direction: the value goes to the direction the VIB ID takes)
//    "G1H" / "G1" (excess air fan gearbox) → "Shaft 1"
//    "Shaft 1 Horizontal" (direction in the component) → "Shaft 1", H
//    "Shaft" with no number → the number of the shaft before it
//    "Shaft 1" with no DE / NDE → "Shaft 1 DE" (only DE was ever measured)
//    the same component, side and direction twice → "Gearbox 2"
import { monthIn } from "./textLines.js";
import { canonId } from "./rhiReport.js";

const DIR = { horizontal: "H", vertical: "V", axial: "A", h: "H", v: "V", a: "A" };
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}
const num = (s) => {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return isNaN(n) ? null : n;
};
const low = (s) => String(s || "").trim().toLowerCase();

// header row → column index by meaning; null when not a readings table
function readingCols(head) {
  const at = (re) => head.findIndex((h) => re.test(low(h)));
  const c = {
    eq: at(/^equipment/),
    comp: at(/^component/),
    loc: at(/^point location|^location/),
    dir: at(/^direction/),
    vel: at(/^velocity/),
    acc: at(/^acceleration/),
    date: at(/date/),
  };
  return c.eq >= 0 && c.comp >= 0 && c.vel >= 0 && c.date >= 0 ? c : null;
}

export function looksLikeRhiDocx(doc) {
  return doc.tables.some((t) => t[0] && readingCols(t[0]) && t[0].some((h) => /^component/i.test(h.trim())));
}

// "Mill Fan 461.FN.400" → { name, eq, drive }
function splitEquipment(cell) {
  const t = String(cell || "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?)\s*(\d{3}\s*\.?\s*[A-Za-z]{2,3}\s*\.?\s*\d{3})\s*(?:\b[Mm]0*(\d+))?$/);
  if (!m) return { name: t, eq: "", drive: "" };
  return { name: m[1].trim(), eq: canonId(m[2]), drive: m[3] ? `M${+m[3]}` : "" };
}

// one row's component / location / direction → { point, axis }
function pointOf(comp0, loc0, dir0, st) {
  let comp = String(comp0 || "").replace(/\s+/g, " ").trim();
  let loc = String(loc0 || "").trim().toUpperCase();
  let axis = DIR[low(dir0)] || "";
  let m = comp.match(/^(.*?)\s+(Horizontal|Vertical|Axial)$/i);
  if (m) {
    comp = m[1];
    axis ||= DIR[m[2].toLowerCase()];
  }
  let note = "";
  m = comp.match(/^Point\s*(\d+)(?:\s*-\s*(HSS|Rim))?$/i);
  if (m) {
    const where = (m[2] || loc).toUpperCase();
    if (where === "HSS") return { point: `GB HSS ${m[1]}`, axis: axis || "U", note };
    if (where === "RIM") return { point: `Rim Gear ${m[1]}`, axis: axis || "U", note };
  }
  m = comp.match(/^G(\d)([HVA])?$/i);
  if (m) {
    comp = `Shaft ${m[1]}`;
    axis ||= m[2] ? m[2].toUpperCase() : "";
  }
  m = comp.match(/^Shaft\s*#?\s*(\d)?$/i);
  if (m) {
    if (m[1]) st.shaft = m[1];
    else if (st.shaft) {
      comp = `Shaft ${st.shaft}`;
      note = `"Shaft ${loc}" in the report — taken as shaft ${st.shaft} (the one before it)`;
    }
    if (!loc) {
      loc = "DE";
      note = "no DE / NDE in the report — taken as DE";
    }
  }
  return { point: `${comp} ${loc === "HSS" || loc === "RIM" ? "" : loc}`.replace(/\s+/g, " ").trim(), axis: axis || "U", note };
}

// summary table → [{ eq, name, recommendation }]
function readSummary(tables) {
  const out = [];
  tables.forEach((t) => {
    const h = (t[0] || []).map(low);
    const ci = (re) => h.findIndex((x) => re.test(x));
    const id = ci(/^asset id/);
    const act = ci(/recommend|action/);
    if (id < 0 || act < 0 || readingCols(t[0])) return;
    const name = ci(/^asset$|^equipment$/);
    t.slice(1).forEach((r) => {
      const eqTxt = String(r[id] || "").replace(/\s+/g, " ").trim();
      const s = splitEquipment(eqTxt);
      if (!s.eq && !r[name]) return;
      out.push({ eq: s.eq, drive: s.drive, name: String(r[name] || "").replace(/\s+/g, " ").trim(), recommendation: String(r[act] || "").trim() });
    });
  });
  return out;
}

// doc → same shape as parseRhi: { contractor, scope, month, machines, warnings }
export function parseRhiDocx(doc, fileName = "") {
  const warnings = [];
  const all = [...doc.paragraphs, ...doc.tables.slice(0, 4).flat(2)].join("\n");
  const lm = all.match(/\bLine\s*(\d)\b/i) || String(fileName).match(/Line[\s_-]*(\d)/i);
  const month = monthIn(doc.paragraphs.slice(0, 6).join("\n")) || monthIn(all) || monthIn(fileName);

  const machines = new Map();
  const machine = (s) => {
    const key = s.eq ? s.eq + (s.drive ? " " + s.drive : "") : `(${s.name})`;
    if (!machines.has(key)) machines.set(key, { eq: s.eq ? key : "", drive: s.drive, name: s.name, condition: "", recommendation: "", readings: new Map() });
    return machines.get(key);
  };

  doc.tables.forEach((t, ti) => {
    const c = t[0] && readingCols(t[0]);
    if (!c) return;
    const where = `table ${ti + 1}`;
    const state = new Map(); // per machine in this table: shaft number, keys seen
    // the per-machine tables are older copies: the last table's rows win
    const fresh = new Set();
    let lastEq = "";
    t.slice(1).forEach((r) => {
      if (!String(r[c.comp] || "").trim()) return;
      // a merged equipment cell is empty on its later rows
      const eqCell = String(r[c.eq] || "").trim() || lastEq;
      lastEq = eqCell;
      const s = splitEquipment(eqCell);
      const m = machine(s);
      if (!state.has(m)) state.set(m, { shaft: "", seen: {} });
      const st = state.get(m);
      const p = pointOf(r[c.comp], c.loc >= 0 ? r[c.loc] : "", c.dir >= 0 ? r[c.dir] : "", st);
      // the same point and direction again in one table: a second set
      const k = `${p.point}|${p.axis}`;
      st.seen[k] = (st.seen[k] || 0) + 1;
      if (st.seen[k] > 1) p.point = p.point.replace(/^(\S+)/, `$1 ${st.seen[k]}`);
      const date = isoDate(r[c.date]);
      const v = num(r[c.vel]);
      const g = c.acc >= 0 ? num(r[c.acc]) : null;
      [["RMS", v, ""], ["Gs", g, "g"]].forEach(([family, val, pre]) => {
        if (val === null) return;
        const key = `${p.point.toLowerCase()}|${family}`;
        if (!fresh.has(m.eq + "|" + key)) {
          // first row of this point in this table: drop what earlier tables gave
          fresh.add(m.eq + "|" + key);
          m.readings.delete(key);
        }
        if (!m.readings.has(key)) m.readings.set(key, { point: p.point, family, sub: "", vals: {}, dates: {}, date: "", note: p.note, where });
        const R = m.readings.get(key);
        R.vals[pre + p.axis] = val;
        R.dates[p.axis] = date;
        R.date = [R.date, date].filter(Boolean).sort().pop() || "";
        if (p.note && !R.note.includes(p.note)) R.note = [R.note, p.note].filter(Boolean).join("; ");
      });
    });
  });

  readSummary(doc.tables).forEach((s) => {
    let m = machines.get(s.eq + (s.drive ? " " + s.drive : ""));
    if (!m) m = [...machines.values()].find((x) => !x.eq && x.name.toLowerCase() === s.name.toLowerCase());
    if (!m) m = machine(s);
    m.recommendation = [m.recommendation, s.recommendation].filter(Boolean).join("\n");
  });

  return {
    contractor: "RHI",
    scope: lm ? `Line ${lm[1]}` : "",
    month,
    machines: [...machines.values()].map((m) => ({
      ...m,
      readings: [...m.readings.values()].map(({ dates, ...r }) => {
        const ds = [...new Set(Object.values(dates).filter(Boolean))].sort();
        const note = ds.length > 1 ? Object.entries(dates).filter(([, d]) => d !== r.date).map(([a, d]) => `${a} measured ${d}`).join(", ") : "";
        return { ...r, note: [r.note, note].filter(Boolean).join("; ") };
      }),
    })),
    warnings,
  };
}

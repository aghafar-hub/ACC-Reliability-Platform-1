// RHI vibration report (Word exported to PDF) → machines with readings,
// condition and action plan.
//
// What the PDF looks like:
//  - cover: "Line 1" and "July 2026"
//  - "MEASUREMENT SUMMARY": SR | Equipment | Asset ID | Condition | Action Plan
//  - one "Overall vibration" table per machine, and a last table with every
//    machine ("EQUIPMENT OVERALL VIBRATION"). Columns: [COMP_NAME] | Equipment
//    | Asset ID | ASSIGNMENT | Velocity rms | HDm | HDc | DATE. The header
//    words don't match their columns; what counts is the order: the column
//    left of ASSIGNMENT is the bearing ("Motor NDE"), the one before it the
//    asset ID, the one before that the machine name (not always there).
//  - one row per direction (Horizontal / Vertical / Axial) or SPM point
//    ("SPM", or a letter / number when a machine has several).
//  - bearing, asset and name are merged cells: their text sits once, centred
//    on the rows it covers (on each page the cell spans). So rows are given
//    to the label whose centre they share (see split()).
import { linesOf, joinRuns, lineText, monthIn, ddmmyy, num } from "./textLines.js";

const AXIS = { horizontal: "H", vertical: "V", axial: "A" };
const centre = (it) => it.x + (it.w || 0) / 2;

// Column centres from a header line; "Velocity rms" may be on lines just
// above / below the header (two-line header cell).
function headerColumns(line, near) {
  const words = [];
  line.items.forEach((it) => words.push({ t: it.s.trim().toLowerCase(), c: centre(it) }));
  const cols = {};
  words.forEach((w) => {
    if (w.t === "assignment") cols.assignment = w.c;
    else if (w.t.startsWith("velocity")) cols.velocity = w.c;
    else if (w.t === "hdm") cols.hdm = w.c;
    else if (w.t === "hdc") cols.hdc = w.c;
    else if (w.t === "date") cols.date = w.c;
  });
  if (cols.velocity === undefined) {
    const v = near.flatMap((l) => l.items).find((it) => /^velocity/i.test(it.s.trim()));
    if (v) cols.velocity = centre(v);
  }
  // label columns: the header words left of ASSIGNMENT, nearest first
  const left = words.filter((w) => w.c < cols.assignment - 5).sort((a, b) => b.c - a.c);
  cols.pos = left[0]?.c;
  cols.asset = left[1]?.c;
  cols.name = left[2]?.c;
  return cols;
}

// Which column an item falls in: nearest column centre.
function binOf(cols, it) {
  const c = centre(it);
  let best = null;
  let bd = Infinity;
  Object.entries(cols).forEach(([k, x]) => {
    if (x === undefined) return;
    const d = Math.abs(c - x);
    if (d < bd) { bd = d; best = k; }
  });
  return best;
}

// Cut `rows` (top → bottom) into one run per label so each label sits at
// the middle of its run. Rows above the first label may continue the
// previous page (`lead`). Dynamic programming over the cut points.
function split(rows, labels) {
  const n = rows.length;
  const k = labels.length;
  const LEAD = 30; // cost per row left to the previous page
  const cost = (i, j, L) => {
    // rows i..j-1 for label L
    const top = rows[i].top;
    const bot = rows[j - 1].bot;
    const mid = (top + bot) / 2;
    const outside = L.y > top + 8 || L.y < bot - 8 ? 1e4 : 0;
    return (mid - L.y) ** 2 + outside;
  };
  // best[a][i]: first a labels cover rows lead..i-1
  const best = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const from = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
  for (let i = 0; i <= n; i++) best[0][i] = i * LEAD;
  for (let a = 1; a <= k; a++)
    for (let j = 1; j <= n; j++)
      for (let i = a - 1; i < j; i++) {
        if (best[a - 1][i] === Infinity) continue;
        const v = best[a - 1][i] + cost(i, j, labels[a - 1]);
        if (v < best[a][j]) { best[a][j] = v; from[a][j] = i; }
      }
  if (!k) return { lead: n, runs: [], cost: n * LEAD };
  const runs = [];
  let j = n;
  for (let a = k; a >= 1; a--) {
    const i = from[a][j];
    if (i < 0) return null;
    runs.unshift({ label: labels[a - 1], from: i, to: j });
    j = i;
  }
  return { lead: j, runs, cost: best[k][n] };
}

// Labels of one column: text runs on lines within 13 pt merge (a wrapped cell).
function labelsOf(cells) {
  const out = [];
  cells.sort((a, b) => b.y - a.y).forEach((c) => {
    const last = out[out.length - 1];
    if (last && last.ys[last.ys.length - 1] - c.y <= 13) { last.parts.push(c.text); last.ys.push(c.y); }
    else out.push({ parts: [c.text], ys: [c.y] });
  });
  return out.map((l) => ({ text: l.parts.join(" ").replace(/\s+/g, " ").trim(), y: (l.ys[0] + l.ys[l.ys.length - 1]) / 2 }));
}

function readTables(pages, warn, overallFrom) {
  const groups = []; // { eq, name, pos, rows: [...], page, prio }
  let cols = null;
  let lastGroup = null;
  let lastEq = null;
  pages.forEach((page, pi) => {
    const lines = linesOf(page);
    // a page may hold several tables; each header starts one
    const heads = lines.map((l, i) => (l.items.some((it) => /^assignment$/i.test(it.s.trim())) && l.items.some((it) => /^date$/i.test(it.s.trim())) ? i : -1)).filter((i) => i >= 0);
    const segments = [];
    if (cols && (!heads.length || heads[0] > 0)) segments.push({ cols, from: 0, to: heads.length ? heads[0] : lines.length, cont: true });
    heads.forEach((h, n) => {
      const near = lines.filter((l) => Math.abs(l.y - lines[h].y) <= 10 && l !== lines[h]);
      segments.push({ cols: headerColumns(lines[h], near), from: h + 1, to: n + 1 < heads.length ? heads[n + 1] : lines.length, cont: false });
    });
    segments.forEach((seg) => {
      const rows = [];
      const cells = { pos: [], asset: [], name: [] };
      for (let li = seg.from; li < seg.to; li++) {
        const l = lines[li];
        const by = {};
        l.items.forEach((it) => (by[binOf(seg.cols, it)] ||= []).push(it));
        const asg = by.assignment ? joinRuns(by.assignment) : "";
        const date = by.date ? ddmmyy(by.date.map((x) => x.s).join("")) : "";
        if (asg && date && !/^velocity|^rms$/i.test(asg)) {
          const r = { y: l.y, top: l.y, bot: l.y, asg, date, page: pi + 1 };
          const ax = AXIS[asg.toLowerCase()];
          const v = by.velocity ? num(by.velocity.map((x) => x.s).join("")) : null;
          if (ax) {
            r.axis = ax;
            r.v = v;
          } else if (v !== null && !by.hdm && !by.hdc) {
            r.other = v; // a velocity under a code ("1", "6"…) — no direction given
          } else {
            r.hdm = by.hdm ? num(by.hdm.map((x) => x.s).join("")) : null;
            r.hdc = by.hdc ? num(by.hdc.map((x) => x.s).join("")) : null;
          }
          rows.push(r);
        }
        ["pos", "asset", "name"].forEach((k) => {
          if (by[k]) cells[k].push({ text: joinRuns(by[k]), y: l.y });
        });
      }
      if (!rows.length) {
        if (!seg.cont) cols = seg.cols;
        return;
      }
      cols = seg.cols;
      const lowest = rows[rows.length - 1].y - 12;
      const keep = (c) => c.y >= lowest;
      const posL = labelsOf(cells.pos.filter(keep));
      const assetL = labelsOf(cells.asset.filter(keep));
      const nameL = labelsOf(cells.name.filter(keep));
      // bearings
      const ps = split(rows, posL);
      if (!ps) return warn(`Page ${pi + 1}: could not line up the bearings with their rows — check this table.`);
      const pageGroups = [];
      if (ps.lead) {
        if (seg.cont && lastGroup) { lastGroup.rows.push(...rows.slice(0, ps.lead)); pageGroups.push({ cont: lastGroup, top: rows[0].top, bot: rows[ps.lead - 1].bot }); }
        else warn(`Page ${pi + 1}: ${ps.lead} reading row(s) without a bearing name were skipped.`);
      }
      ps.runs.forEach((r) => {
        const g = { pos: r.label.text, rows: rows.slice(r.from, r.to), page: pi + 1, eq: "", name: "", prio: pi >= overallFrom ? 1 : 0 };
        groups.push(g);
        pageGroups.push({ g, top: rows[r.from].top, bot: rows[r.to - 1].bot });
      });
      // machines: asset IDs (with the name on the same line when there)
      const eqL = assetL.map((a) => ({ ...a, name: (nameL.find((n) => Math.abs(n.y - a.y) <= 6) || {}).text || "" }));
      // a name with no asset ID beside it is either a machine whose ID cell
      // is empty, or one name merged over several machines of the same kind:
      // take it as a machine only when that lines the rows up better
      eqL.sort((a, b) => b.y - a.y);
      let es = split(pageGroups, eqL);
      nameL.filter((n) => !assetL.some((a) => Math.abs(n.y - a.y) <= 6)).forEach((n) => {
        const withIt = [...eqL, { text: "", y: n.y, name: n.text }].sort((a, b) => b.y - a.y);
        const t = split(pageGroups, withIt);
        if (t && es && t.cost < es.cost - 200) { eqL.splice(0, eqL.length, ...withIt); es = t; }
      });
      if (!es) return warn(`Page ${pi + 1}: could not line up the machines with their bearings — check this table.`);
      pageGroups.slice(0, es.lead).forEach((pg) => {
        if (pg.cont) return;
        if (lastEq) Object.assign(pg.g, lastEq);
        else warn(`Page ${pi + 1}: bearing "${pg.g.pos}" has no machine ID.`);
      });
      es.runs.forEach((r) => {
        const eq = { eq: canonId(r.label.text), name: r.label.name };
        pageGroups.slice(r.from, r.to).forEach((pg) => { if (pg.g) Object.assign(pg.g, eq); });
        lastEq = eq;
      });
      lastGroup = pageGroups[pageGroups.length - 1]?.g || pageGroups[pageGroups.length - 1]?.cont || lastGroup;
    });
    if (!heads.length && !segments.some((s) => s.cont)) cols = null;
  });
  return groups;
}

// "MEASUREMENT SUMMARY" table → [{ eq, name, condition, action }]
function readSummary(pages) {
  const out = [];
  let cols = null;
  pages.forEach((page) => {
    const lines = linesOf(page);
    let start = lines.findIndex((l) => /^sr$/i.test(l.items[0]?.s.trim()) && l.items.some((it) => /^condition$/i.test(it.s.trim())));
    if (start >= 0) {
      const h = lines[start];
      const at = (re) => h.items.find((it) => re.test(it.s.trim()))?.x;
      cols = { sr: at(/^sr$/i), name: at(/^equipment$/i), asset: at(/^asset/i), cond: at(/^condition$/i), action: at(/^action/i) };
      start += 1;
    } else if (cols) start = 0;
    else return;
    const colOf = (it) => {
      const order = ["action", "cond", "asset", "name", "sr"];
      return order.find((k) => cols[k] !== undefined && it.x >= cols[k] - 12) || "sr";
    };
    let cur = null;
    let any = false;
    let lastSr = out.length;
    let ended = false;
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      const by = {};
      l.items.forEach((it) => (by[colOf(it)] ||= []).push(it));
      const sr = by.sr ? joinRuns(by.sr) : "";
      if (/^\d{1,3}\.?$/.test(sr) && parseInt(sr, 10) === lastSr + 1) {
        lastSr += 1;
        cur = { eq: "", name: "", condition: "", action: [] };
        out.push(cur);
        any = true;
      } else if (!cur || (sr && !by.action && !by.cond)) {
        if (any) { ended = true; break; } // text after the table
        continue;
      }
      if (by.name) cur.name = (cur.name + " " + joinRuns(by.name)).trim();
      if (by.asset) cur.eq = (cur.eq + joinRuns(by.asset)).replace(/\s+/g, "");
      if (by.cond) cur.condition = (cur.condition + " " + joinRuns(by.cond).replace(/[•▪●]/g, " ")).trim();
      if (by.action) {
        const t = joinRuns(by.action).replace(/^[•▪●\-–]\s*/, "");
        if (t) cur.action.push(t);
      }
    }
    if (ended || (!any && start === 0)) cols = null;
  });
  return out.map((r) => ({
    eq: r.eq,
    name: r.name.replace(/\s+/g, " "),
    condition: r.condition.replace(/\s+/g, "").replace(/^(under)(observation)$/i, "$1 $2"),
    recommendation: r.action.join("\n"),
  }));
}

export function looksLikeRhi(pages) {
  const text = pages.slice(0, 8).map((p) => linesOf(p).map(lineText).join("\n")).join("\n");
  return /ASSIGNMENT/.test(text) || (/MEASUREMENT SUMMARY/i.test(text) && /Asset ID/i.test(text));
}

// pages → { contractor, scope, month, machines: [{ eq, name, condition,
// recommendation, readings: [{ point, family, sub, vals, date, where }] }], warnings }
export function parseRhi(pages, fileName = "") {
  const warnings = [];
  const warn = (w) => warnings.push(w);
  const cover = pages.slice(0, 2).map((p) => linesOf(p).map(lineText).join("\n")).join("\n");
  const lm = cover.match(/\bLine\s*(\d)\b/i) || String(fileName).match(/Line[\s_-]*(\d)/i);
  const month = monthIn(cover) || monthIn(fileName);
  // the last section lists every machine in one evenly laid-out table:
  // its numbers win over the per-machine tables
  let overallFrom = pages.findIndex((p) => linesOf(p).some((l) => /equipment overall vibration/i.test(lineText(l)) && !/\.{4}/.test(lineText(l))));
  if (overallFrom < 0) overallFrom = pages.length;
  const groups = readTables(pages, warn, overallFrom);
  const summary = readSummary(pages);

  // one reading per bearing; the per-machine tables and the last table
  // repeat the same numbers, so keep one copy (the latest date wins)
  const machines = new Map();
  const machine = (eq, name) => {
    if (!machines.has(eq)) machines.set(eq, { eq, name, condition: "", recommendation: "", readings: new Map() });
    const m = machines.get(eq);
    if (!m.name && name) m.name = name;
    return m;
  };
  groups.forEach((g) => {
    if (!g.eq && !g.name) return;
    const m = machine(g.eq || `(${g.name})`, g.name);
    const where = `page ${g.page}`;
    // a merged bearing cell can cover two sets of H / V / A (two bearings
    // under one name): each set becomes its own reading, "(set 2)"
    const sets = [];
    g.rows.filter((r) => r.axis && r.v !== null).forEach((r) => {
      let s = sets.find((x) => !x.some((y) => y.axis === r.axis));
      if (!s) sets.push((s = []));
      s.push(r);
    });
    sets.forEach((rms, si) => {
      const point = si ? `${g.pos} (set ${si + 1})` : g.pos;
      const vals = {};
      rms.forEach((r) => (vals[r.axis] = r.v));
      const dates = [...new Set(rms.map((r) => r.date))].sort();
      const note = dates.length > 1 ? rms.filter((r) => r.date !== dates[dates.length - 1]).map((r) => `${r.axis} measured ${r.date}`).join(", ") : "";
      put(m, { point, family: "RMS", sub: "", vals, date: dates[dates.length - 1], note, where, prio: g.prio }, warn);
    });
    g.rows.filter((r) => r.other !== undefined).forEach((r) => {
      put(m, { point: g.pos, family: "RMS?", sub: r.asg, vals: { X: r.other }, date: r.date, note: `velocity under "${r.asg}" — no direction in the report`, where, prio: g.prio }, warn);
    });
    const spm = g.rows.filter((r) => !r.axis && r.other === undefined && (r.hdm !== null || r.hdc !== null));
    spm.forEach((r, i) => {
      let sub = /^spm$/i.test(r.asg) ? "" : r.asg;
      // several plain "SPM" rows under one bearing: number them
      if (!sub && spm.filter((x) => /^spm$/i.test(x.asg)).length > 1) sub = String(spm.filter((x, j) => j <= i && /^spm$/i.test(x.asg)).length);
      put(m, { point: g.pos, family: "SPM", sub, vals: { HDm: r.hdm, HDc: r.hdc }, date: r.date, note: "", where, prio: g.prio }, warn);
    });
  });
  summary.forEach((s) => {
    const id = canonId(s.eq);
    // the summary sometimes repeats one ID for two machines (left and
    // right side) or has a typo in it: fall back to the name
    const same = summary.filter((x) => canonId(x.eq) === id);
    let m = machines.get(id);
    if (same.length > 1 || (!m && !/^\d{3}\.[A-Z]{2,3}\.\d{3}$/.test(id))) {
      const byName = [...machines.values()].find((x) => x.name && norm(x.name) === norm(s.name));
      if (byName) m = byName;
    }
    if (!m) m = machine(id, s.name);
    m.condition = s.condition;
    m.recommendation = s.recommendation;
    if (!m.name) m.name = s.name;
  });
  // a machine in the last "all equipment" table: only that table counts
  // (the per-machine tables are laid out less evenly)
  machines.forEach((m) => {
    if ([...m.readings.values()].some((r) => r.prio)) for (const [k, r] of m.readings) if (!r.prio) m.readings.delete(k);
  });
  return {
    contractor: "RHI",
    scope: lm ? `Line ${lm[1]}` : "",
    month,
    machines: [...machines.values()].map((m) => ({ ...m, readings: [...m.readings.values()] })),
    warnings,
  };
}

// "123.FN456" / "123.BE.456 m01" / "123MD456" → "123.FN.456" / "123.BE.456" / "123.MD.456"
export function canonId(s) {
  const t = String(s || "").replace(/\s+/g, "");
  const m = t.match(/(\d{3})\.?([A-Za-z]{2,3})\.?(\d{3})/);
  return m ? `${m[1]}.${m[2].toUpperCase()}.${m[3]}` : t;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function put(m, r, warn) {
  const key = `${norm(r.point)}|${r.family}|${r.sub}`;
  const old = m.readings.get(key);
  if (!old) return m.readings.set(key, r);
  if ((r.prio || 0) !== (old.prio || 0)) {
    if ((r.prio || 0) > (old.prio || 0)) m.readings.set(key, r);
    return;
  }
  const same = Object.keys({ ...old.vals, ...r.vals }).every((k) => old.vals[k] === r.vals[k]);
  if (same) return;
  if (r.date > old.date) m.readings.set(key, r);
  else if (r.date === old.date) warn(`${m.eq} ${r.point} ${r.family}${r.sub ? " " + r.sub : ""}: two different readings for ${r.date} (${old.where} and ${r.where}) — the first is kept.`);
}

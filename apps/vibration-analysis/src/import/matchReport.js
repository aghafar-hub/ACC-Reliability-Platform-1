// Read report(s) → rows for the validation screen: each reading matched to
// a machine and VIB ID of the app, its system status, the report status
// (machine condition) and what will happen to it (add / replace / skip).
// Pure: no React, no network — tested in Node.
import { canonId } from "./rhiReport.js";
import { band, toLevel, LEVEL_RANK } from "../levels.js";
import { limitsFor } from "../vibModel.js";

// Merge several read files of one month (ASEC may send one or two).
export function mergeParsed(list) {
  const machines = new Map();
  const warnings = [];
  list.forEach((p) => {
    p.warnings.forEach((w) => warnings.push(`${p.file ? p.file + ": " : ""}${w}`));
    p.machines.forEach((m) => {
      const key = m.eq || `name:${m.name}`;
      const old = machines.get(key);
      if (!old) return machines.set(key, { ...m, files: [p.file].filter(Boolean), readings: [...m.readings] });
      old.files.push(p.file);
      old.name ||= m.name;
      if (m.condition && (!old.condition || (LEVEL_RANK[toLevel(m.condition)] || 0) > (LEVEL_RANK[toLevel(old.condition)] || 0))) old.condition = m.condition;
      if (m.recommendation && !old.recommendation.includes(m.recommendation)) old.recommendation = [old.recommendation, m.recommendation].filter(Boolean).join("\n");
      m.readings.forEach((r) => {
        const i = old.readings.findIndex((x) => x.family === r.family && x.sub === r.sub && norm(x.point) === norm(r.point));
        if (i < 0) old.readings.push(r);
        else if (r.date > old.readings[i].date) old.readings[i] = r;
      });
    });
  });
  const first = list[0] || {};
  const months = [...new Set(list.map((p) => p.month).filter(Boolean))];
  return {
    contractor: first.contractor || "",
    scopes: [...new Set(list.map((p) => p.scope).filter(Boolean))],
    months,
    machines: [...machines.values()],
    warnings,
  };
}

// ── point → VIB ID (same rules as the database import) ──
const PART = [["be bearing spm", "BR"], ["bearing", "BR"], ["motor", "M"], ["fan", "F"], ["compressor", "C"], ["male rotor", "C"], ["bl", "BL"], ["blower", "BL"], ["pump", "P"], ["crusher", "CR"], ["rotor", "R"], ["pulley", "PL"], ["gearbox", "G"], ["gear", "G"]];

export function positionCode(name) {
  let s = String(name || "").toLowerCase().replace(/#/g, " ").replace(/outbord|ouboard/g, "outboard");
  s = s.replace(/\((spm|[0-9a-z])\)/g, " ").replace(/\(set \d\)/g, " ");
  s = s.replace(/\b(horz|horiz|horizontal|vert|vertical|axial|peakvue|spm)\b/g, " ").replace(/\s+/g, " ").trim();
  let m = s.match(/^rim gear (\d)$/);
  if (m) return "RG" + m[1];
  m = s.match(/^gb hss ?(\d)?$/);
  if (m) return "GBHSS" + (m[1] || "");
  let side = "";
  if (/\bnde\b|outboard|\bout\b/.test(s)) side = "NDE";
  else if (/\bde\b|inboard|\bin\b/.test(s)) side = "DE";
  m = s.match(/^shaft ?0?(\d)/);
  if (m) return "S" + m[1] + side;
  for (const [word, code] of PART) if (s.startsWith(word)) return side ? code + side : null;
  return null;
}

const clean = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const keysOf = (desc) =>
  new Set(
    String(desc || "")
      .split(";")
      .map((p) => clean(p.replace(/\s*\([^)]*\)\s*$/, "")))
      .filter(Boolean)
  );

export function findVib(machine, family, point, sub, raw) {
  const fam = family === "RMS?" ? "RMS" : family;
  const rows = machine.points.filter((p) => p.family === fam);
  if (!rows.length) return { problem: `This machine has no ${fam === "Gs" ? "G's" : fam} VIB IDs in the VIB ID Registry` };
  let cand = rows.filter((p) => keysOf(p.description).has(clean(raw || point)) || keysOf(p.description).has(clean(point)));
  if (!cand.length) {
    const pos = positionCode(point);
    cand = rows.filter((p) => pos && p.positionCode === pos);
  }
  if (cand.length > 1 && sub) {
    const pick = cand.filter((p) => p.vibId.toUpperCase().endsWith("-" + String(sub).toUpperCase()));
    if (pick.length === 1) return { vibId: pick[0].vibId };
  }
  if (cand.length === 1) return { vibId: cand[0].vibId };
  if (!cand.length) return { problem: `No ${fam === "Gs" ? "G's" : fam} VIB ID for "${point}" (machine has ${[...new Set(rows.map((p) => p.positionCode))].sort().join(", ")})` };
  return { problem: `"${point}" fits ${cand.length} VIB IDs (${cand.map((p) => p.vibId).join(", ")})${sub ? ` and point "${sub}" is not one of them` : ""}` };
}

// ── machine → app machine ──
function findMachine(m, equipment, rep) {
  const all = Object.values(equipment || {});
  const id = canonId(m.eq);
  let hit = equipment[m.eq] || equipment[id] || all.find((x) => canonId(x.id) === id);
  let how = "id";
  if (!hit && m.name) {
    // by name, inside the report's contractor + scope first
    const same = (x) => norm(x.name) === norm(m.name);
    const mine = all.filter((x) => same(x) && x.contractor === rep.Contractor && x.scope === rep["Report scope"]);
    const any = all.filter(same);
    hit = mine.length === 1 ? mine[0] : any.length === 1 ? any[0] : null;
    how = "name";
  }
  return { hit, how };
}

const VAL_KEYS = { H: "h", V: "v", A: "a", HDm: "hdm", HDc: "hdc", G: "g" };
const TOL = { h: 0.011, v: 0.011, a: 0.011, hdm: 0.6, hdc: 0.6, g: 0.0011 };
const NUM = { h: "Horizontal (mm/s)", v: "Vertical (mm/s)", a: "Axial (mm/s)", hdm: "HDm (dBsv)", hdc: "HDc (dBsv)", g: "G's (g)" };

export function valuesOf(r) {
  const o = {};
  Object.entries(r.vals || {}).forEach(([k, v]) => {
    if (VAL_KEYS[k] && v !== null && v !== undefined) o[VAL_KEYS[k]] = v;
  });
  return o;
}

function sameValues(entry, vals) {
  return Object.entries(vals).every(([k, v]) => {
    const old = parseFloat(entry[NUM[k]]);
    return !isNaN(old) && Math.abs(old - v) <= TOL[k];
  });
}

// Report status per row: the machine's condition goes on its worst point;
// the other points keep their own system status, never above the condition.
export function applyCondition(rows, condition) {
  const lvl = toLevel(condition);
  rows.forEach((r) => (r.reportStatus = ""));
  if (!lvl) return rows;
  const live = rows.filter((r) => r.vibId && !r.skip);
  if (!live.length) return rows;
  const rank = (r) => LEVEL_RANK[r.systemStatus] || 0;
  const worst = live.reduce((a, b) => (rank(b) > rank(a) ? b : a), live[0]);
  live.forEach((r) => {
    if (r === worst) r.reportStatus = lvl;
    else if (r.systemStatus && LEVEL_RANK[r.systemStatus]) r.reportStatus = rank(r) > LEVEL_RANK[lvl] ? lvl : r.systemStatus;
  });
  return rows;
}

export function systemOf(point, machine, vals) {
  const lim = limitsFor(point, machine);
  if (point.family === "RMS") {
    const n = ["h", "v", "a"].map((k) => vals[k]).filter((x) => x !== undefined && x !== null && !isNaN(x));
    return n.length ? band(Math.max(...n), lim) : "";
  }
  if (point.family === "SPM") return vals.hdm === undefined ? "" : band(vals.hdm, lim);
  if (vals.g === undefined) return "";
  return lim ? band(vals.g, lim) : "No limits";
}

let seq = 0;

// merged + report + app data → [{ key, eqIn, nameIn, eqId, eqName, machineProblem, skipMachine,
//   condition, conditionRaw, recommendation, rows: [...] }]
// existing: readings already in the app (this report's, and every other
// report's for these machines when known) — a reading with the same VIB ID
// and date is not added twice.
export function matchImport(merged, rep, equipment, existing = []) {
  const month = String(rep.Month || "").slice(0, 7);
  const reportRows = existing;
  return merged.machines.map((m) => {
    const { hit, how } = findMachine(m, equipment, rep);
    const out = {
      key: `m${++seq}`,
      eqIn: m.eq,
      nameIn: m.name,
      eqId: hit?.id || "",
      eqName: hit?.name || "",
      matchedBy: hit ? how : "",
      machineProblem: "",
      skipMachine: false,
      conditionRaw: m.condition || "",
      condition: toLevel(m.condition),
      recommendation: m.recommendation || "",
      files: m.files || [],
      reportId: rep["Report ID"] || "",
      rows: [],
    };
    if (!hit) out.machineProblem = "Machine not found in the app (VIB ID Registry) — pick it or skip it";
    else if (!hit.points.length) out.machineProblem = "This machine has no VIB IDs in the VIB ID Registry — add them first (or skip)";
    else if (hit.contractor && hit.contractor !== rep.Contractor) {
      out.machineProblem = `Belongs to ${hit.contractor}, not ${rep.Contractor} — skipped`;
      out.skipMachine = true;
    } else if (hit.scope && hit.scope !== rep["Report scope"]) {
      out.machineProblem = `In ${hit.scope}, not ${rep["Report scope"]} — skipped`;
      out.skipMachine = true;
    }
    if (m.condition && !out.condition) out.machineProblem ||= `Condition "${m.condition}" not understood — pick one`;
    out.rows = m.readings.map((r) => buildRow(r, hit, month, reportRows));
    // two sets of H / V / A under one bearing name in the report: the
    // person picks the VIB ID of each set
    out.rows.forEach((r) => {
      const base = r.pointIn.replace(/ \(set \d+\)$/, "");
      if (out.rows.some((x) => x !== r && x.family === r.family && x.pointIn.replace(/ \(set \d+\)$/, "") === base && x.pointIn !== r.pointIn))
        r.problem = `The report has two sets of readings under “${base}” — pick the VIB ID of each set, or skip`;
    });
    refreshMachine(out, equipment);
    return out;
  });
}

function buildRow(r, machine, month, reportRows) {
  const row = {
    key: `r${++seq}`,
    pointIn: r.point,
    pointRaw: r.pointRaw || "",
    family: r.family,
    sub: r.sub || "",
    vals: valuesOf(r),
    raw: r.vals,
    date: r.date || "",
    note: r.note || "",
    where: r.where || "",
    vibId: "",
    problem: "",
    skip: false,
  };
  if (r.family === "RMS?") {
    row.problem = "No direction (H / V / A) in the report — skipped";
    row.skip = true;
    return row;
  }
  if (machine) {
    const f = findVib(machine, r.family, r.point, r.sub, r.pointRaw);
    row.vibId = f.vibId || "";
    row.problem = f.problem || "";
  }
  if (!row.date) row.problem ||= "No measurement date";
  else if (month && row.date.slice(0, 7) > month) row.problem ||= `Measured ${row.date}, after the report month`;
  row.existing = reportRows;
  return row;
}

// Re-check one machine after an edit: statuses, duplicates, report status.
export function refreshMachine(mach, equipment) {
  const machine = equipment[mach.eqId];
  // two read rows on one VIB ID and date: the first keeps it
  const seen = {};
  mach.rows.forEach((row) => {
    if (row.problem && row.problem.startsWith("Same VIB ID as")) row.problem = "";
    if (!row.vibId || row.skip) return;
    const k = row.vibId + "|" + row.date;
    if (seen[k]) row.problem ||= `Same VIB ID as "${seen[k].pointIn}" — pick another or skip`;
    else seen[k] = row;
  });
  mach.rows.forEach((row) => {
    const p = machine?.points.find((x) => x.vibId === row.vibId);
    row.systemStatus = p ? systemOf(p, machine, row.vals) : "";
    row.action = "";
    if (!p || row.skip || row.problem || mach.skipMachine) return;
    const at = (row.existing || []).filter((e) => e["VIB ID"] === row.vibId && String(e["Measurement date"]).slice(0, 10) === row.date);
    const here = at.filter((e) => !mach.reportId || e["Report ID"] === mach.reportId);
    const other = at.filter((e) => mach.reportId && e["Report ID"] !== mach.reportId);
    row.otherReport = "";
    if (here.length) row.action = here.some((e) => sameValues(e, row.vals)) ? "same" : "replace";
    else if (other.length) {
      // already saved in another report: never added twice
      row.otherReport = other[0]["Report ID"];
      row.action = other.some((e) => sameValues(e, row.vals)) ? "same" : "other";
    } else row.action = "add";
  });
  applyCondition(mach.rows.filter((r) => r.action === "add" || r.action === "replace"), mach.condition);
  return mach;
}

// Rows that will be saved, in the shape saveVibEntries takes.
export function rowsToSave(machines) {
  const out = [];
  machines.forEach((m) => {
    if (m.skipMachine || !m.eqId) return;
    m.rows.forEach((r) => {
      if (r.skip || !r.vibId || r.problem || !["add", "replace"].includes(r.action)) return;
      out.push({ vibId: r.vibId, date: r.date, ...r.vals, reportStatus: r.reportStatus || "", notes: [r.note, "Imported from report"].filter(Boolean).join(" · ") });
    });
  });
  return out;
}

export function counts(machines) {
  const c = { machines: 0, add: 0, replace: 0, same: 0, other: 0, problems: 0, skipped: 0, recs: 0 };
  machines.forEach((m) => {
    if (m.skipMachine) { c.skipped += m.rows.length; return; }
    c.machines += 1;
    const usable = m.eqId && !m.machineProblem.startsWith("This machine has no VIB IDs");
    if (m.recommendation.trim() && usable) c.recs += 1;
    if (!usable) c.problems += 1;
    m.rows.forEach((r) => {
      if (r.skip) c.skipped += 1;
      else if (r.problem || !r.vibId) c.problems += 1;
      else if (r.action) c[r.action] += 1;
    });
  });
  return c;
}

// The user picked the app machine for a report machine: check it and match
// its rows again (rows whose VIB ID was picked by hand keep it).
export function setMachine(mach, eqId, equipment, rep) {
  const hit = equipment[eqId];
  mach.eqId = hit ? hit.id : "";
  mach.eqName = hit?.name || "";
  mach.matchedBy = hit ? "picked" : "";
  mach.skipMachine = false;
  mach.machineProblem = "";
  if (!hit) mach.machineProblem = "Machine not found in the app (VIB ID Registry) — pick it or skip it";
  else if (!hit.points.length) mach.machineProblem = "This machine has no VIB IDs in the VIB ID Registry — add them first (or skip)";
  else if (hit.contractor && hit.contractor !== rep.Contractor) {
    mach.machineProblem = `Belongs to ${hit.contractor}, not ${rep.Contractor} — skipped`;
    mach.skipMachine = true;
  } else if (hit.scope && hit.scope !== rep["Report scope"]) {
    mach.machineProblem = `In ${hit.scope}, not ${rep["Report scope"]} — skipped`;
    mach.skipMachine = true;
  }
  mach.rows.forEach((r) => {
    if (r.manual || r.family === "RMS?") return;
    const f = hit ? findVib(hit, r.family, r.pointIn, r.sub, r.pointRaw) : {};
    r.vibId = f.vibId || "";
    r.problem = f.problem || (r.date ? "" : "No measurement date");
  });
  return refreshMachine(mach, equipment);
}

// Re-check a row after the user changed its VIB ID, date or values.
export function checkRow(r, month) {
  r.problem = "";
  if (r.family === "RMS?" && !r.vibId) r.problem = "No direction (H / V / A) in the report — pick a VIB ID and type the value, or skip";
  else if (!r.vibId) r.problem = "Pick the VIB ID";
  if (!r.date) r.problem ||= "No measurement date";
  else if (month && r.date.slice(0, 7) > month) r.problem ||= `Measured ${r.date}, after the report month`;
  if (!Object.keys(r.vals).length) r.problem ||= "No value";
  return r;
}

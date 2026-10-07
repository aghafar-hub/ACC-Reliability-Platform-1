// Oil Equipment — the history of one lubrication point on a real time scale:
// lab values (with the lab's own Caution/Alert marks and limit lines worked
// out from them), oil change cycles (planned vs actual), top-ups and leaks.
// Pure functions only, so the page and the tests share one set of rules.

import { computeOilChangeNextDue, intervalMonths, ROUTE_OVERDUE_GRACE_DAYS } from "./parsers";
import { LEAK_TOP_UPS, LEAK_WINDOW_DAYS } from "./equipmentHealth";

export const DAY = 86400000;
// A change done within this many days after its due date still counts as
// on time — the same grace a route gets before it reads Overdue.
export const ON_TIME_GRACE_DAYS = ROUTE_OVERDUE_GRACE_DAYS;

// Every lab value, its group and which way is bad when the lab gives no
// hint. `flag` is the name the lab report uses in "Flagged Parameters".
export const LAB_GROUPS = ["Wear", "Contamination", "Oil condition", "Additives"];
export const LAB_PARAMS = [
  { key: "Fe", flag: "Fe", label: "Fe (Iron)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Fe },
  { key: "Cu", flag: "Cu", label: "Cu (Copper)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Cu },
  { key: "Cr", flag: "Cr", label: "Cr (Chromium)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Cr },
  { key: "Pb", flag: "Pb", label: "Pb (Lead)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Pb },
  { key: "Al", flag: "Al", label: "Al (Aluminium)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Al },
  { key: "Sn", flag: "Sn", label: "Sn (Tin)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Sn },
  { key: "Ni", flag: "Ni", label: "Ni (Nickel)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Ni },
  { key: "Ag", flag: "Ag", label: "Ag (Silver)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Ag },
  { key: "Mo", flag: "Mo", label: "Mo (Molybdenum)", unit: "ppm", group: "Wear", get: (s) => s.wear?.Mo },
  { key: "Si", flag: "Si", label: "Si (Silicon / dust)", unit: "ppm", group: "Contamination", get: (s) => s.contaminants?.Si },
  { key: "Water", flag: "Water", label: "Water", unit: "%", group: "Contamination", get: (s) => s.water },
  { key: "Na", flag: "Na", label: "Na (Sodium)", unit: "ppm", group: "Contamination", get: (s) => s.contaminants?.Na },
  { key: "K", flag: "K", label: "K (Potassium)", unit: "ppm", group: "Contamination", get: (s) => s.contaminants?.K },
  { key: "Visc", flag: "Visc", label: "Viscosity", unit: "cSt", group: "Oil condition", get: (s) => s.visc40C },
  { key: "TAN", flag: "TAN", label: "TAN", unit: "mg KOH/g", group: "Oil condition", get: (s) => s.tan },
  { key: "Oxidation", flag: "Oxidation", label: "Oxidation", unit: "", group: "Oil condition", get: (s) => s.oxidation },
  { key: "Zn", flag: "Zn", label: "Zn (Zinc)", unit: "ppm", group: "Additives", get: (s) => s.additives?.Zn, low: true },
  { key: "P", flag: "P", label: "P (Phosphorus)", unit: "ppm", group: "Additives", get: (s) => s.additives?.P, low: true },
  { key: "Ca", flag: "Ca", label: "Ca (Calcium)", unit: "ppm", group: "Additives", get: (s) => s.additives?.Ca, low: true },
  { key: "Mg", flag: "Mg", label: "Mg (Magnesium)", unit: "ppm", group: "Additives", get: (s) => s.additives?.Mg, low: true },
  { key: "Ba", flag: "Ba", label: "Ba (Barium)", unit: "ppm", group: "Additives", get: (s) => s.additives?.Ba, low: true },
  { key: "B", flag: "B", label: "B (Boron)", unit: "ppm", group: "Additives", get: (s) => s.additives?.B, low: true },
];

export function toTime(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

export function paramValue(sample, p) {
  const v = p.get(sample);
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

// "Alert" | "Caution" | "" — the lab's own mark on this value.
export function flagFor(sample, p) {
  const f = (sample.flaggedReadings || []).find((x) => String(x.param).toLowerCase() === p.flag.toLowerCase());
  if (!f) return "";
  const sev = String(f.severity).toLowerCase();
  if (sev === "alert") return "Alert";
  if (sev === "caution" || sev === "warning") return "Caution";
  return "";
}

function median(list) {
  if (!list.length) return null;
  const a = [...list].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// The limits as the lab applies them, worked out from its own marks: the
// lowest value it marked Caution / Alert (for a value that is bad when it
// is low — additives, a falling viscosity — the highest). Which way is bad
// is read from the marks themselves (marked values above or below the
// unmarked ones), falling back to the value's usual direction.
// Returns null when the lab never marked this value.
export function inferLimits(samples, p) {
  const flagged = [];
  const plain = [];
  for (const s of samples || []) {
    const v = paramValue(s, p);
    if (v === null) continue;
    const f = flagFor(s, p);
    if (f) flagged.push({ v, f });
    else plain.push(v);
  }
  if (!flagged.length) return null;
  const mid = median(plain);
  let direction = p.low ? "down" : "up";
  if (mid !== null) {
    const mean = flagged.reduce((n, x) => n + x.v, 0) / flagged.length;
    direction = mean >= mid ? "up" : "down";
  }
  const side = mid === null ? flagged : flagged.filter((x) => (direction === "up" ? x.v >= mid : x.v <= mid));
  const pick = (sev) => {
    const vals = side.filter((x) => x.f === sev).map((x) => x.v);
    if (!vals.length) return null;
    return direction === "up" ? Math.min(...vals) : Math.max(...vals);
  };
  let alert = pick("Alert");
  let caution = pick("Caution");
  if (alert !== null && caution !== null && (direction === "up" ? caution >= alert : caution <= alert)) caution = null;
  if (alert === null && caution === null) return null;
  return { direction, caution, alert };
}

// Limits for this point's value: from this point's own reports first, else
// from other points on the same oil.
export function limitsFor(p, ownSamples, sameOilSamples) {
  const own = inferLimits(ownSamples, p);
  if (own) return { ...own, source: "this point" };
  const other = inferLimits(sameOilSamples, p);
  if (other) return { ...other, source: "same oil" };
  return null;
}

// Three samples in a row moving the bad way, by at least 20% overall,
// within the current oil fill (an oil change resets wear metals).
export const RISING_SAMPLES = 3;
export function trendWarning(samplesAsc, p, direction, lastChangeTime) {
  const since = lastChangeTime ? samplesAsc.filter((s) => (toTime(s.sampledDate) ?? 0) > lastChangeTime) : samplesAsc;
  const vals = since.map((s) => paramValue(s, p)).filter((v) => v !== null);
  if (vals.length < RISING_SAMPLES) return null;
  const last = vals.slice(-RISING_SAMPLES);
  const up = direction !== "down";
  for (let i = 1; i < last.length; i++) {
    if (up ? !(last[i] > last[i - 1]) : !(last[i] < last[i - 1])) return null;
  }
  const first = last[0];
  const end = last[last.length - 1];
  const change = first === 0 ? (up ? Infinity : 0) : Math.abs(end - first) / Math.abs(first);
  if (change < 0.2) return null;
  return { param: p, direction: up ? "rising" : "falling", values: last };
}

// Oil change cycles, oldest first. A cycle runs from one change to the next
// (the last one runs to today). `planned` is the due date that change set.
export function buildCycles({ changes, topUps, interval, now = Date.now() }) {
  const list = (changes || [])
    .map((c) => ({ c, t: toTime(c.eventDate) }))
    .filter((x) => x.t !== null)
    .sort((a, b) => a.t - b.t);
  const tops = (topUps || []).map((t) => ({ t: toTime(t.eventDate), l: parseFloat(t.quantity) || 0 })).filter((x) => x.t !== null);
  return list.map(({ c, t }, i) => {
    const next = list[i + 1] || null;
    const plannedStr = c.nextDueDate || computeOilChangeNextDue(c.eventDate, interval);
    const planned = toTime(plannedStr);
    const end = next ? next.t : now;
    const inCycle = tops.filter((x) => x.t >= t && x.t < end);
    const topUpLitres = Math.round(inCycle.reduce((n, x) => n + x.l, 0) * 10) / 10;
    const fill = parseFloat(c.quantityUsed) || 0;
    const days = Math.round((end - t) / DAY);
    const plannedDays = planned !== null ? Math.round((planned - t) / DAY) : null;
    const lateDays = planned !== null ? Math.round((end - planned) / DAY) : null;
    let status = "";
    if (next) {
      if (planned !== null) status = lateDays > ON_TIME_GRACE_DAYS ? "Late" : "On time";
    } else if (planned !== null) {
      status = lateDays > 0 ? "Overdue" : "Current";
    } else {
      status = "Current";
    }
    return {
      index: i + 1,
      start: t,
      end,
      current: !next,
      planned,
      days,
      plannedDays,
      lateDays,
      status,
      oil: c.oilBrandType || "",
      fill,
      topUps: inCycle.length,
      topUpLitres,
      oilUsed: Math.round((fill + topUpLitres) * 10) / 10,
      change: c,
      nextChange: next?.c || null,
    };
  });
}

export function cycleSummary(cycles) {
  const done = cycles.filter((c) => !c.current);
  const judged = done.filter((c) => c.status === "On time" || c.status === "Late");
  const late = judged.filter((c) => c.status === "Late");
  const avg = (list, f) => (list.length ? Math.round((list.reduce((n, x) => n + f(x), 0) / list.length) * 10) / 10 : null);
  return {
    completed: done.length,
    judged: judged.length,
    onTime: judged.length - late.length,
    onTimeRate: judged.length ? Math.round(((judged.length - late.length) / judged.length) * 100) : null,
    avgDaysLate: late.length ? Math.round(avg(late, (c) => c.lateDays)) : null,
    avgDays: done.length ? Math.round(avg(done, (c) => c.days)) : null,
    avgTopUpLitres: avg(done, (c) => c.topUpLitres),
  };
}

// Stretches with LEAK_TOP_UPS or more top-ups inside LEAK_WINDOW_DAYS —
// the same rule the health score uses — merged where they overlap.
export function leakWindows(topUps) {
  const ts = (topUps || []).map((t) => toTime(t.eventDate)).filter((t) => t !== null).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + LEAK_TOP_UPS - 1 < ts.length; i++) {
    let j = i;
    while (j + 1 < ts.length && ts[j + 1] - ts[i] <= LEAK_WINDOW_DAYS * DAY) j++;
    if (j - i + 1 >= LEAK_TOP_UPS) {
      const w = { from: ts[i], to: ts[j], count: j - i + 1 };
      const prev = out[out.length - 1];
      if (prev && w.from <= prev.to) {
        prev.to = Math.max(prev.to, w.to);
        prev.count = ts.filter((t) => t >= prev.from && t <= prev.to).length;
      } else out.push(w);
    }
  }
  return out;
}

// The visible stretch of time for a period choice.
export const PERIODS = [
  { id: "1y", label: "1 year" },
  { id: "2y", label: "2 years" },
  { id: "cycle", label: "Since last change" },
  { id: "all", label: "All" },
];
export function periodRange(period, { now = Date.now(), firstTime, lastChangeTime, futureTimes = [] }) {
  let start;
  if (period === "1y") start = now - 365 * DAY;
  else if (period === "2y") start = now - 730 * DAY;
  else if (period === "cycle" && lastChangeTime) start = lastChangeTime;
  else start = firstTime ?? now - 365 * DAY;
  // Show what is due next, up to a year ahead.
  const ahead = futureTimes.filter((t) => t !== null && t > now && t <= now + 365 * DAY);
  let end = Math.max(now, ...ahead);
  if (end - start < 30 * DAY) start = end - 30 * DAY;
  const pad = (end - start) * 0.03;
  return { start: start - pad, end: end + pad };
}

// Month-aligned ticks, at most ~7 of them.
export function monthTicks(start, end) {
  const months = (end - start) / (30.44 * DAY);
  const step = [1, 2, 3, 6, 12, 24].find((s) => months / s <= 7) || 36;
  const d = new Date(start);
  let cur = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  while (cur.getMonth() % step !== 0 && step <= 12) cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  const out = [];
  while (cur.getTime() <= end) {
    out.push(cur.getTime());
    cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
  }
  return out;
}

export function tickLabel(t) {
  return new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

// "6" → "6 months", "1 Y" → "year" — for "Planned every …".
export function everyText(interval) {
  const m = intervalMonths(interval);
  if (!m) return interval;
  if (m >= 12 && m % 12 === 0) return m === 12 ? "year" : `${m / 12} years`;
  if (m < 1) return m === 0.25 ? "week" : "day";
  return m === 1 ? "month" : `${m} months`;
}

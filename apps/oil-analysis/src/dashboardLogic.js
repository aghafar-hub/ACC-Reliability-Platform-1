// The Oil Dashboard's numbers (design D4) — pure functions, no React, so
// each one can be unit-tested and the PDF uses exactly what the screen
// shows. Every function takes `now` so tests don't depend on today's date.
import {
  ACTION_STATUS,
  computeOilChangeStatus,
  conditionBucket,
  intervalMonths,
  isActionOverdue,
  isRouteOverdue,
  normActionStatus,
  ROUTE_STATUS,
  sampleTrackerStatus,
} from "./parsers";
import { daysLeft, oilLabel, shortfallBars } from "./inventoryLogic";

export const DAY = 86400000;
export const CONTRACTORS = ["RHI", "ASEC"];

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dayStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function daysSince(v, now = new Date()) {
  const d = toDate(v);
  return d ? Math.floor((dayStart(now) - dayStart(d)) / DAY) : null;
}

// The period picked on the dashboard and the one just before it, same length.
export function periodWindow(periodDays, now = new Date()) {
  const end = now;
  const start = new Date(now.getTime() - periodDays * DAY);
  const prevStart = new Date(now.getTime() - 2 * periodDays * DAY);
  return { start, end, prevStart };
}
function inWindow(d, start, end) {
  return d && d >= start && d <= end;
}

// Lubrication points in scope (contractor + area filters).
export function scopeRegistry(registry, { contractor = "All", area = "All" } = {}) {
  return (registry || []).filter((r) => (contractor === "All" || r.contractor === contractor) && (area === "All" || r.area === area));
}

// % change this period vs the one before; null when there's nothing to compare.
export function pctChange(cur, prev) {
  if (!prev) return cur > 0 ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

// Counts of dated events (oil changes, samples, top-ups) this period vs the
// previous one, with the split per contractor.
export function periodCounts(rows, codes, periodDays, now = new Date()) {
  const { start, end, prevStart } = periodWindow(periodDays, now);
  let total = 0;
  let prev = 0;
  const byContractor = { RHI: 0, ASEC: 0 };
  (rows || []).forEach((r) => {
    if (codes && !codes.has(r.code)) return;
    const d = toDate(r.date);
    if (!d) return;
    if (inWindow(d, start, end)) {
      total++;
      if (byContractor[r.contractor] != null) byContractor[r.contractor]++;
    } else if (d >= prevStart && d < start) prev++;
  });
  return { total, prev, change: pctChange(total, prev), byContractor };
}

// ── Needs attention ─────────────────────────────────────────────────────

// Oil changes past their next-due date, most overdue first.
export function overdueOilChanges(oilChanges, codes, now = new Date()) {
  return (oilChanges || [])
    .filter((oc) => (!codes || codes.has(oc.equipmentCode)) && oc.nextDueDate && computeOilChangeStatus(oc.nextDueDate) === "Overdue")
    .map((oc) => ({ code: oc.equipmentCode, contractor: oc.contractor || "", days: daysSince(oc.nextDueDate, now) ?? 0 }))
    .sort((a, b) => b.days - a.days);
}

// Latest lab result per point (by sample date).
export function latestSampleByPoint(samples, asOf = null) {
  const out = new Map();
  (samples || []).forEach((sm) => {
    const d = toDate(sm.sampledDate);
    if (!sm.unitId || !d) return;
    if (asOf && d > asOf) return;
    const cur = out.get(sm.unitId);
    if (!cur || d > cur._d) out.set(sm.unitId, { ...sm, _d: d });
  });
  return out;
}

// What the lab flagged, in a few words, for the attention card.
// The readings the lab marked Alert come first ("Fe, Water"); else the lab's
// alert headline, shortened.
export function alertReason(sm) {
  const flagged = (sm.flaggedReadings || []).filter((f) => /^a/i.test(f.severity)).map((f) => f.param);
  if (flagged.length) return flagged.slice(0, 3).join(", ");
  const t = String(sm.alertType || "")
    .replace(/^action required\s*[-–:]\s*/i, "")
    .trim();
  if (t && !/^no action/i.test(t)) {
    const nice = t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
    return nice.length > 30 ? `${nice.slice(0, 29)}…` : nice;
  }
  return "Alert";
}

// A point whose latest lab result is Alert and nobody has raised an action
// for it since that sample (an action of any status dated on or after it
// counts — a closed one means it was dealt with).
export function alertsWithoutAction(samples, actions, codes) {
  const latest = latestSampleByPoint(samples);
  const actedSince = new Map();
  (actions || []).forEach((a) => {
    const d = toDate(a.sampleDate) || toDate(a.revisionDate);
    if (!a.equipmentCode || !d) return;
    const cur = actedSince.get(a.equipmentCode);
    if (!cur || d > cur) actedSince.set(a.equipmentCode, d);
  });
  const out = [];
  latest.forEach((sm, code) => {
    if (codes && !codes.has(code)) return;
    if (conditionBucket(sm.reportStatus) !== "Alert") return;
    const acted = actedSince.get(code);
    if (acted && dayStart(acted) >= dayStart(sm._d)) return;
    out.push({ code, sampleId: sm.sampleId, date: sm.sampledDate, reason: alertReason(sm), when: sm._d.getTime() });
  });
  return out.sort((a, b) => a.when - b.when);
}

// Routes past due (same rule as the Routes page), most late first.
export function overdueRoutes(routes, contractor = "All", now = new Date()) {
  return (routes || [])
    .filter((r) => (contractor === "All" || r.contractor === contractor) && isRouteOverdue(r, now))
    .map((r) => ({ ...r, days: Math.max(1, daysSince(r.dueDate, now) - (Number(r.duration) || 0)) }))
    .sort((a, b) => b.days - a.days);
}

// Oils that won't cover the planned work in the next N days (Inventory's
// forecast), merged across contractors when none is picked.
export function stockShortages(forecastRows, contractor = "All") {
  const rows = (forecastRows || []).filter((r) => contractor === "All" || r.contractor === contractor);
  return shortfallBars(rows, { merge: contractor === "All" }).filter((b) => b.short);
}

// ── Plant health ────────────────────────────────────────────────────────

// Oil health = the latest lab result of each point in scope (not every
// sample in the period), so one bad point resampled five times counts once.
// `previous` is the same as of the start of the period, for the delta.
export function oilHealth(samples, codes, periodDays, now = new Date()) {
  const { start } = periodWindow(periodDays, now);
  const count = (latest) => {
    const c = { Normal: 0, Caution: 0, Alert: 0 };
    latest.forEach((sm, code) => {
      if (codes && !codes.has(code)) return;
      const b = conditionBucket(sm.reportStatus);
      if (b) c[b]++;
    });
    const total = c.Normal + c.Caution + c.Alert;
    return { ...c, total, normalPct: total ? Math.round((c.Normal / total) * 100) : null };
  };
  const cur = count(latestSampleByPoint(samples));
  const prev = count(latestSampleByPoint(samples, start));
  return { ...cur, deltaPts: cur.normalPct != null && prev.normalPct != null ? cur.normalPct - prev.normalPct : null };
}

// Sampling on time: of the points that need sampling on a fixed interval,
// how many are within it right now (not Overdue / Missing).
export function samplingOnTime(scopedRegistry, trackerByEquip) {
  let due = 0;
  let ok = 0;
  const byContractor = { RHI: { due: 0, ok: 0 }, ASEC: { due: 0, ok: 0 } };
  (scopedRegistry || []).forEach((eq) => {
    if (!intervalMonths(eq.interval)) return;
    const last = (trackerByEquip?.[eq.code] || [])[0]?.date || "";
    const st = sampleTrackerStatus(last, eq.interval).label;
    due++;
    const good = st === "OK";
    if (good) ok++;
    if (byContractor[eq.contractor]) {
      byContractor[eq.contractor].due++;
      if (good) byContractor[eq.contractor].ok++;
    }
  });
  return { due, ok, late: due - ok, pct: due ? Math.round((ok / due) * 100) : null, byContractor };
}

// Routes done on time: routes due in the period, per contractor. On time =
// sent for approval (or confirmed) by due date + its working days; late =
// sent after that, or still open past it. Routes still inside their window,
// paused or cancelled don't count either way yet.
const FINISHED = new Set([ROUTE_STATUS.WAITING, ROUTE_STATUS.CONFIRMED]);
export function routesOnTime(routes, periodDays, now = new Date()) {
  const { start } = periodWindow(periodDays, now);
  const blank = () => ({ due: 0, onTime: 0, overdueNow: 0 });
  const out = { RHI: blank(), ASEC: blank(), All: blank() };
  (routes || []).forEach((r) => {
    const due = toDate(r.dueDate);
    if (!due || r.status === ROUTE_STATUS.CANCELLED || r.status === ROUTE_STATUS.PAUSED) return;
    const deadline = new Date(due.getFullYear(), due.getMonth(), due.getDate() + (Number(r.duration) || 0) + 1);
    const buckets = [out.All, out[r.contractor]].filter(Boolean);
    if (isRouteOverdue(r, now)) buckets.forEach((b) => b.overdueNow++);
    if (due < start || due > now) return;
    const done = toDate(r.submittedDate) || toDate(r.approvedDate);
    let counted = false;
    let onTime = false;
    if (FINISHED.has(r.status) && done) {
      counted = true;
      onTime = done < deadline;
    } else if (now >= deadline) {
      counted = true;
    }
    if (!counted) return;
    buckets.forEach((b) => {
      b.due++;
      if (onTime) b.onTime++;
    });
  });
  Object.values(out).forEach((b) => {
    b.pct = b.due ? Math.round((b.onTime / b.due) * 100) : null;
  });
  return out;
}

// ── Activity trend ──────────────────────────────────────────────────────

// Last `months` calendar months (oldest first), the current one marked
// partial — it's only "so far".
export function monthlyCounts(rows, codes, months = 6, now = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }), value: 0, partial: i === 0 });
  }
  const idx = new Map(out.map((m, i) => [m.key, i]));
  (rows || []).forEach((r) => {
    if (codes && !codes.has(r.code)) return;
    const d = toDate(r.date);
    if (!d) return;
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) out[i].value++;
  });
  return out;
}

// How many complete months in a row the count went up (the current,
// partial month is left out). 3+ in a row for emergency top-ups means
// something is leaking or being missed.
export function risingStreak(monthly) {
  const done = monthly.filter((m) => !m.partial);
  let streak = 0;
  for (let i = done.length - 1; i > 0; i--) {
    if (done[i].value > done[i - 1].value) streak++;
    else break;
  }
  return streak;
}
export const TOP_UP_RISING_MONTHS = 3;

// ── Lists ───────────────────────────────────────────────────────────────

const ACTION_STAGE = {
  [ACTION_STATUS.DRAFT]: { label: "Draft", tone: "muted" },
  [ACTION_STATUS.OPEN]: { label: "Open", tone: "accent" },
  [ACTION_STATUS.WAITING]: { label: "Waiting stop", tone: "warning" },
  [ACTION_STATUS.CLOSURE_REQUESTED]: { label: "To approve", tone: "accent" },
};
// Open actions, oldest first, with a status pill (Past due wins).
export function openActionsOldest(actions, codes, now = new Date()) {
  return (actions || [])
    .filter((a) => normActionStatus(a.status) !== ACTION_STATUS.CLOSED && (!codes || codes.has(a.equipmentCode)))
    .map((a) => {
      const status = normActionStatus(a.status);
      const stage = isActionOverdue(a) ? { label: "Past due", tone: "danger" } : ACTION_STAGE[status] || { label: status || "Open", tone: "accent" };
      return { ...a, stage, age: daysSince(a.revisionDate, now) };
    })
    .sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
}

// Days of stock left per oil at the recent rate of use, fewest first; oils
// the forecast needs but nobody stocks come first as "No stock product".
export function stockRunway(products, forecastRows, contractor = "All") {
  const rows = (products || [])
    .filter((p) => p.status !== "Discontinued" && (contractor === "All" || p.contractor === contractor))
    .map((p) => ({ label: oilLabel(p.lubricantType, p.lubricantBrand), contractor: p.contractor, days: daysLeft(p), stock: p.currentStock, noProduct: false }))
    .filter((r) => r.days != null)
    .sort((a, b) => a.days - b.days);
  const missing = new Map();
  (forecastRows || [])
    .filter((f) => f.currentStock == null && (f.quantityNeeded || 0) > 0 && (contractor === "All" || f.contractor === contractor))
    .forEach((f) => {
      const label = oilLabel(f.lubricant, f.lubricantBrand);
      missing.set(`${label}|${f.contractor}`, { label, contractor: f.contractor, days: null, noProduct: true });
    });
  return [...missing.values(), ...rows];
}

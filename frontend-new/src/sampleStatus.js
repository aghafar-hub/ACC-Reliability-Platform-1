// Phase 1's own simplified replacement for the old app's sampleTrackerStatus
// (apps/oil-analysis/src/parsers.js) — that version reads Apps Script sheet
// fields (sheet row shape, "If Needed" interval strings) this REST API
// doesn't expose the same way. Reimplemented here directly against the new
// schema's lubrication_points.oil_analysis_interval (days, nullable) and the
// latest oil_samples.sample_date per lp_id — same four buckets, same
// Overdue > Missing > Due Soon > On Track precedence, not the exact same
// grace-period math (no access to the original's thresholds from this data
// shape) — see the report for this as a known approximation.
//
// Status-line wording ("X months overdue/remaining", "Due now", "No sample
// recorded") matches the real Oil Sampling Log board exactly (confirmed
// against docs/visual-reference/Screenshot 2026-10-06 005725.png) — this
// was fixed after the first pass used raw "Last sample: <date>" text, which
// didn't match the real app.
const DUE_SOON_WINDOW_DAYS = 30;
const DAYS_PER_MONTH = 30.44; // average Gregorian month, matches "X.X months" rounding seen in the real screenshots

export function bucketFor(lp, lastSampleDate) {
  if (!lp.oil_analysis_required) return null; // not tracked at all
  if (!lastSampleDate) return "Missing";

  const interval = lp.oil_analysis_interval; // days, may be null ("if needed")
  if (!interval) return "On Track"; // no fixed cadence — never overdue/due soon

  const last = new Date(lastSampleDate);
  const due = new Date(last);
  due.setDate(due.getDate() + interval);
  const today = new Date();
  const daysUntilDue = Math.round((due - today) / 86400000);

  if (daysUntilDue < 0) return "Overdue";
  if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) return "Due Soon";
  return "On Track";
}

function daysUntilDueFor(lp, lastSampleDate) {
  if (!lastSampleDate || !lp.oil_analysis_interval) return null;
  const due = new Date(lastSampleDate);
  due.setDate(due.getDate() + lp.oil_analysis_interval);
  return Math.round((due - new Date()) / 86400000);
}

// "1.1 months overdue" / "Due now" / "1.9 months remaining" / "No sample recorded"
export function statusLine(bucket, daysUntilDue) {
  if (bucket === "Missing") return "No sample recorded";
  if (daysUntilDue == null) return "—"; // On Track with no fixed interval ("if needed")
  const months = Math.abs(daysUntilDue) / DAYS_PER_MONTH;
  if (daysUntilDue < 0) return `${months.toFixed(1)} months overdue`;
  if (daysUntilDue === 0) return "Due now";
  if (bucket === "Due Soon" && daysUntilDue <= 1) return "Due now";
  return `${months.toFixed(1)} months remaining`;
}

// Builds { lpId -> latest sample_date } from a flat oil_samples list.
export function lastSampleDateByLp(samples) {
  const map = new Map();
  for (const s of samples) {
    if (!s.sample_date) continue;
    const prev = map.get(s.lp_id);
    if (!prev || s.sample_date > prev) map.set(s.lp_id, s.sample_date);
  }
  return map;
}

export function bucketAllLubricationPoints(lubricationPoints, samples) {
  const lastByLp = lastSampleDateByLp(samples);
  const buckets = { Overdue: [], Missing: [], "Due Soon": [], "On Track": [] };
  for (const lp of lubricationPoints) {
    const lastSampleDate = lastByLp.get(lp.lp_id) || null;
    const bucket = bucketFor(lp, lastSampleDate);
    if (!bucket) continue;
    const daysUntilDue = daysUntilDueFor(lp, lastSampleDate);
    buckets[bucket].push({ lp, lastSampleDate, daysUntilDue, statusLine: statusLine(bucket, daysUntilDue) });
  }
  return buckets;
}

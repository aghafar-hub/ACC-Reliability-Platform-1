// Oil Equipment — one health rule for every place that shows it (the
// equipment list, the machine view, the point page), with the reasons.
//
//   Latest lab result Alert ............ +3   Caution/Warning ... +1
//   Oil change overdue ................. +3
//   Sample missing ..................... +2   overdue ........... +1
//   Actions overdue .................... +2   other open ........ +1
//   3+ top-ups in the last 30 days ..... +2   (possible leak)
//
//   0 → Good, 1–2 → Fair, 3+ → Poor. "Needs attention" = not Good.
//
// Oil changed after the latest lab sample: that result was for the old oil,
// so it no longer counts — the point's oil condition is Normal until the
// next lab report comes in (`current` below; `latest` stays the real one).

import { isActionOverdue, isSampledPoint, lastSampleDate, normActionStatus, ACTION_STATUS, sampleTrackerStatus } from "./parsers";

export const HEALTH_COLOR = { Good: "success", Fair: "warning", Poor: "danger" };
export const HEALTH_RANK = { Good: 0, Fair: 1, Poor: 2 };
export const LEAK_TOP_UPS = 3;
export const LEAK_WINDOW_DAYS = 30;

function toTime(d) {
  const t = new Date(d).getTime();
  return isNaN(t) ? null : t;
}

// local calendar day, so a change and a sample on the same day compare equal
function dayOf(d) {
  const t = toTime(d);
  if (t == null) return "";
  const x = new Date(t);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

// Everything for one lubrication point, from data the app already holds.
export function pointHealth({ reg, samples, oilChange, actions, topUps, tracker, now = Date.now() }) {
  const sorted = [...(samples || [])].filter((s) => s.sampledDate).sort((a, b) => toTime(b.sampledDate) - toTime(a.sampledDate));
  const latest = sorted[0] || null;
  const reasons = []; // { text, weight, kind }
  const add = (weight, text, kind) => reasons.push({ weight, text, kind });

  // a change on the sample's own day comes after it (the sample is taken first)
  const changedOn = dayOf(oilChange?.changeDate);
  const renewed = !!latest && !!changedOn && changedOn >= dayOf(latest.sampledDate);
  const current = latest && renewed ? { ...latest, reportStatus: "Normal", renewedOn: oilChange.changeDate } : latest;
  const result = current?.reportStatus || "";
  if (result === "Alert") add(3, "Latest lab result Alert", "result");
  else if (result === "Caution" || result === "Warning") add(1, `Latest lab result ${result}`, "result");

  if (oilChange?.status === "Overdue") add(3, "Oil change overdue", "change");

  let sampleState = null;
  // same sampling rule as the Oil Dashboard and the Oil Analysis Report
  if (isSampledPoint(reg)) {
    const last = lastSampleDate(latest?.sampledDate, tracker);
    sampleState = sampleTrackerStatus(last, reg.interval || "");
    if (sampleState.label === "MISSING") add(2, last ? "Sample missing" : "Never sampled", "sample");
    else if (sampleState.label === "OVERDUE") add(1, "Sample overdue", "sample");
  }

  const open = (actions || []).filter((a) => normActionStatus(a.status) !== ACTION_STATUS.CLOSED);
  const overdue = open.filter((a) => isActionOverdue(a));
  if (overdue.length) add(2, `${overdue.length} action${overdue.length > 1 ? "s" : ""} overdue`, "action");
  else if (open.length) add(1, `${open.length} open action${open.length > 1 ? "s" : ""}`, "action");

  const since = now - LEAK_WINDOW_DAYS * 86400000;
  const recentTopUps = (topUps || []).filter((t) => (toTime(t.eventDate) ?? 0) >= since);
  if (recentTopUps.length >= LEAK_TOP_UPS) add(2, `${recentTopUps.length} top-ups in ${LEAK_WINDOW_DAYS} days — possible leak`, "leak");

  const score = reasons.reduce((s, r) => s + r.weight, 0);
  const health = score >= 3 ? "Poor" : score >= 1 ? "Fair" : "Good";
  reasons.sort((a, b) => b.weight - a.weight);
  return {
    health,
    score,
    reasons,
    latest,
    current,
    renewedOn: renewed ? oilChange.changeDate : "",
    sampleState,
    openActions: open.length,
    overdueActions: overdue.length,
    recentTopUps: recentTopUps.length,
  };
}

// Index the app's lists by lubrication point once, so a list of hundreds of
// points doesn't re-scan every list per row.
export function indexByLp({ samples, actions, oilChanges, topUps, trackerByEquip }) {
  const by = (list, key) => {
    const m = new Map();
    (list || []).forEach((x) => {
      const k = key(x);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  };
  return {
    samples: by(samples, (s) => s.unitId),
    actions: by(actions, (a) => a.equipmentCode || a.unitId),
    oilChange: new Map((oilChanges || []).map((o) => [o.equipmentCode, o])),
    topUps: by(topUps, (t) => t.lpId),
    tracker: trackerByEquip || {},
  };
}

export function healthForLp(reg, idx, now) {
  return pointHealth({
    reg,
    samples: idx.samples.get(reg.code) || [],
    oilChange: idx.oilChange.get(reg.code) || null,
    actions: idx.actions.get(reg.code) || [],
    topUps: idx.topUps.get(reg.code) || [],
    tracker: idx.tracker?.[reg.code],
    now,
  });
}

// Worst of several points (a machine).
export function worstHealth(list) {
  return list.reduce((acc, h) => (HEALTH_RANK[h.health] > HEALTH_RANK[acc] ? h.health : acc), "Good");
}

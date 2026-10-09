// Plant overview (platform Home + Equipment): this module's part, built from
// the data the app already holds and handed to the shell over the navBridge
// (navBridge.onPlant). One row per machine (Equipment ID), with the same
// health rule as the Oil Equipment pages (equipmentHealth.js), so the
// platform pages never disagree with this module.
//
// Shape (shared with the Vibration module — see frontend/src/plant.ts):
//   { moduleId, label, updatedAt,
//     machines: [{ id, name, area, contractor, condition, word, reasons,
//                  openActions, overdueActions, facts, events, nextDue }],
//     kpis: [{ label, value, sub, tone }],
//     attention: [{ key, label, count, tone, examples, page }] }
// condition is the platform word (Good / Fair / Poor); word is this
// module's own (the same here). Machines are named by Equipment ID only.

import { healthForLp, indexByLp, worstHealth } from "./equipmentHealth";
import { isActionOverdue, normActionStatus, ACTION_STATUS } from "./parsers";

const toIso = (d) => {
  if (!d) return "";
  const t = new Date(d);
  return isNaN(t) ? "" : t.toISOString().slice(0, 10);
};
const earliest = (dates) => dates.filter(Boolean).sort()[0] || "";
const latestOf = (dates) => dates.filter(Boolean).sort().slice(-1)[0] || "";

export function buildOilPlant({ registry, samples, actions, oilChanges, topUps, now = Date.now() }) {
  const idx = indexByLp({ samples, actions, oilChanges, topUps });
  const today = new Date(now).toISOString().slice(0, 10);
  const byMachine = new Map();
  (registry || []).forEach((reg) => {
    const id = reg.equipmentId || reg.code;
    if (!id) return;
    if (!byMachine.has(id)) byMachine.set(id, []);
    byMachine.get(id).push({ reg, h: healthForLp(reg, idx, now), oc: idx.oilChange.get(reg.code) || null });
  });

  let sampleDue = 0;
  let sampleOk = 0;
  const machines = [];
  byMachine.forEach((list, id) => {
    const condition = worstHealth(list.map((p) => p.h));
    // reasons without the point codes (the platform pages name machines only)
    const reasons = [];
    list
      .filter((p) => p.h.health !== "Good")
      .sort((a, b) => b.h.score - a.h.score)
      .forEach((p) => p.h.reasons.forEach((r) => !reasons.includes(r.text) && reasons.push(r.text)));
    list.forEach((p) => {
      if (p.h.sampleState) {
        sampleDue++;
        if (p.h.sampleState.label === "OK") sampleOk++;
      }
    });
    const lab = list
      .map((p) => p.h.latest)
      .filter(Boolean)
      .sort((a, b) => toIso(b.sampledDate).localeCompare(toIso(a.sampledDate)))[0];
    const nextChange = earliest(list.map((p) => toIso(p.oc?.nextDueDate)));
    const lastChange = latestOf(list.map((p) => toIso(p.oc?.changeDate)));
    const changeOverdue = list.some((p) => p.oc?.status === "Overdue");
    const openActions = list.reduce((n, p) => n + p.h.openActions, 0);
    const overdueActions = list.reduce((n, p) => n + p.h.overdueActions, 0);
    const poorPoints = list.filter((p) => p.h.health === "Poor").length;
    const events = [];
    list.forEach((p) => {
      (idx.samples.get(p.reg.code) || []).forEach((sm) => {
        const d = toIso(sm.sampledDate);
        if (d) events.push({ date: d, label: `Lab result ${sm.reportStatus || "—"}`, tone: sm.reportStatus === "Alert" ? "danger" : sm.reportStatus === "Caution" || sm.reportStatus === "Warning" ? "warning" : "success" });
      });
      const ch = toIso(p.oc?.changeDate);
      if (ch) events.push({ date: ch, label: "Oil change", tone: "info" });
    });
    events.sort((a, b) => b.date.localeCompare(a.date));
    // one line per day and kind (several points changed the same day)
    const seen = new Set();
    const dedup = events.filter((e) => {
      const k = `${e.date}|${e.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    machines.push({
      id,
      name: list[0].reg.equipmentName || list[0].reg.description || "", // the platform name when listed
      area: list[0].reg.area || "",
      contractor: list[0].reg.contractor || "",
      condition,
      word: condition,
      reasons,
      openActions,
      overdueActions,
      changeOverdue,
      nextDue: nextChange ? { date: nextChange, label: "Oil change", late: nextChange < today || changeOverdue } : null,
      facts: [
        { label: "Lubrication points", value: `${list.length}${poorPoints ? ` · ${poorPoints} Poor` : ""}`, tone: poorPoints ? "danger" : "" },
        { label: "Latest lab result", value: lab ? `${lab.reportStatus || "—"} · ${toIso(lab.sampledDate)}` : "No sample yet", tone: lab?.reportStatus === "Alert" ? "danger" : lab?.reportStatus === "Caution" ? "warning" : "" },
        { label: "Next oil change", value: nextChange ? `${nextChange}${changeOverdue ? " · overdue" : ""}` : "—", tone: changeOverdue ? "danger" : "" },
        { label: "Last oil change", value: lastChange || "—" },
        { label: "Open actions", value: `${openActions}${overdueActions ? ` · ${overdueActions} overdue` : ""}`, tone: overdueActions ? "danger" : "" },
      ],
      events: dedup.slice(0, 6),
    });
  });

  const open = (actions || []).filter((a) => normActionStatus(a.status) !== ACTION_STATUS.CLOSED);
  const pastDue = open.filter((a) => isActionOverdue(a));
  const changeLate = machines.filter((m) => m.changeOverdue);
  const alertNoAction = machines.filter((m) => m.reasons.includes("Latest lab result Alert") && !m.openActions);
  const worst = (list) => list.slice().sort((a, b) => b.overdueActions - a.overdueActions || a.id.localeCompare(b.id)).slice(0, 3).map((m) => m.id);

  return {
    moduleId: "oil-analysis",
    label: "Oil lubrication",
    updatedAt: new Date(now).toISOString(),
    machines,
    kpis: [
      { label: "Open actions", value: open.length, sub: pastDue.length ? `${pastDue.length} past due` : "none past due", tone: pastDue.length ? "danger" : "" },
      { label: "Sampled on time", value: sampleDue ? `${Math.round((sampleOk / sampleDue) * 100)}%` : "—", sub: `${sampleDue - sampleOk} of ${sampleDue} points late`, tone: sampleDue && sampleOk / sampleDue < 0.9 ? "warning" : "" },
      { label: "Oil change overdue", value: changeLate.length, sub: "machines", tone: changeLate.length ? "danger" : "" },
    ],
    attention: [
      { key: "oil-change", label: "Oil change overdue", count: changeLate.length, tone: "danger", examples: worst(changeLate), page: "oilchange" },
      { key: "oil-alert", label: "Lab result Alert, no action yet", count: alertNoAction.length, tone: "danger", examples: worst(alertNoAction), page: "oilreport" },
      { key: "oil-pastdue", label: "Oil actions past due", count: pastDue.length, tone: "warning", examples: [], page: "actions" },
    ].filter((a) => a.count > 0),
  };
}

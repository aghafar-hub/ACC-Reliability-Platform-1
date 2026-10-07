// Oil Analysis Report — the results table's rows and columns, shared by the
// page and its PDF so both always show the same thing.
//
// Lab marks (the yellow / red cells on the lab's report) are stored per
// sample in Data_Entry's "Flagged Parameters" column as text, e.g.
// "Fe:Alert,Cu:Caution,PQIndex:Caution". A PDF import fills it from the
// cell colours; a hand-entered report from the Lab Marks picker. `flag`
// below is the name each value uses there.

import { formatDate, sameCalendarDay } from "./parsers";
import { flagFor, toTime } from "./pointHistory";

const num = (v) => (v === "" || v === null || v === undefined || (typeof v === "number" && isNaN(v)) ? null : v);
const wear = (k) => (s) => num(s.wear?.[k]);
const cont = (k) => (s) => num(s.contaminants?.[k]);
const add = (k) => (s) => num(s.additives?.[k]);

export const REPORT_GROUPS = [
  {
    title: "Sample Info",
    rows: [
      { key: "status", label: "Report Status", kind: "status", get: (s) => s.reportStatus },
      { key: "sampleId", label: "Sample ID", kind: "mono", get: (s) => s.sampleId },
      { key: "sampled", label: "Sampled", kind: "date", get: (s) => s.sampledDate },
      { key: "reported", label: "Reported", kind: "date", get: (s) => s.reportedDate },
      { key: "review", label: "Review", kind: "review" },
      { key: "action", label: "Action", kind: "action" },
    ],
  },
  {
    title: "Lubricant",
    rows: [
      { key: "contRating", label: "Contamination Rating", kind: "status", get: (s) => s.contaminationRating },
      { key: "eqRating", label: "Equipment Rating", kind: "status", get: (s) => s.equipmentRating },
      { key: "lubRating", label: "Lubricant Rating", kind: "status", get: (s) => s.lubricantRating },
      { key: "iso", label: "ISO Code (4/6/14)", kind: "text", get: (s) => s.isoCode, optional: true },
      { key: "pc4", label: "Particle Count >4µm", kind: "num", flag: "PC4", get: (s) => num(s.particleCount4um) },
      { key: "pc6", label: "Particle Count >6µm", kind: "num", flag: "PC6", get: (s) => num(s.particleCount6um) },
      { key: "pc14", label: "Particle Count >14µm", kind: "num", flag: "PC14", get: (s) => num(s.particleCount14um) },
      { key: "pq", label: "PQ Index", kind: "num", flag: "PQIndex", get: (s) => num(s.pqIndex) },
      { key: "visc", label: "Visc@40°C (cSt)", kind: "num", flag: "Visc", get: (s) => num(s.visc40C) },
      { key: "ox", label: "Oxidation (Ab/cm)", kind: "num", flag: "Oxidation", get: (s) => num(s.oxidation) },
      { key: "tan", label: "TAN (mg KOH/g)", kind: "num", flag: "TAN", get: (s) => num(s.tan), optional: true },
      { key: "water", label: "Water (Vol%)", kind: "num", flag: "Water", get: (s) => num(s.water) },
    ],
  },
  {
    title: "Wear (ppm)",
    rows: [
      ["Ag", "Silver"], ["Al", "Aluminum"], ["Cr", "Chromium"], ["Cu", "Copper"], ["Fe", "Iron"],
      ["Mo", "Molybdenum"], ["Ni", "Nickel"], ["Pb", "Lead"], ["Sn", "Tin"],
    ].map(([k, n]) => ({ key: k, label: `${k} (${n})`, kind: "num", flag: k, get: wear(k) })),
  },
  {
    title: "Contaminants (ppm)",
    rows: [["K", "Potassium"], ["Na", "Sodium"], ["Si", "Silicon"]].map(([k, n]) => ({ key: k, label: `${k} (${n})`, kind: "num", flag: k, get: cont(k) })),
  },
  {
    title: "Additives (ppm)",
    rows: [["B", "Boron"], ["Ba", "Barium"], ["Ca", "Calcium"], ["Mg", "Magnesium"], ["P", "Phosphorus"], ["Zn", "Zinc"]].map(([k, n]) => ({
      key: k,
      label: `${k} (${n})`,
      kind: "num",
      flag: k,
      get: add(k),
    })),
  },
];

// Rows that only show when at least one sample has a value.
export function visibleGroups(samples) {
  return REPORT_GROUPS.map((g) => ({
    ...g,
    rows: g.rows.filter((r) => !r.optional || samples.some((s) => r.get(s) !== null && r.get(s) !== undefined && r.get(s) !== "")),
  }));
}

// "Alert" | "Caution" | "" — the lab's mark on this cell.
export function cellMark(sample, row) {
  return row.flag ? flagFor(sample, { flag: row.flag }) : "";
}

// Review state of a lab report (Phase 4). A blank status is a report from
// before review existed, counted as validated.
export function reviewOf(sample) {
  const st = sample.validationStatus || "";
  if (st === "Pending Validation") return { label: "Pending validation", color: "warning" };
  if (st === "Returned") return { label: "Returned", color: "danger", detail: sample.returnReason || "" };
  if (st === "Validated")
    return { label: "Validated", color: "success", detail: [sample.validatedBy, sample.validatedDate].filter(Boolean).join(" · ") };
  return { label: "Validated", color: "textSecondary", detail: "before review was added" };
}

// Actions raised for this sample: same point, same sample date.
export function actionsForSample(actions, code, sample) {
  return (actions || []).filter((a) => (a.equipmentCode || a.unitId) === code && a.sampleDate && sameCalendarDay(a.sampleDate, sample.sampledDate));
}

// Which samples to show: optionally only those after the last oil change,
// then the newest `count` (or all). Oldest first.
export function pickSamples(historyAsc, { count, sinceChange, lastChangeTime }) {
  let list = historyAsc;
  if (sinceChange && lastChangeTime) list = list.filter((s) => (toTime(s.sampledDate) ?? 0) > lastChangeTime);
  if (count && count !== "all") list = list.slice(-Number(count));
  return list;
}

// The table's columns, oldest first: one per sample, plus one per oil change
// that falls inside the shown stretch (from the first shown sample — or the
// last change itself when showing "since last change" — up to today).
export function reportColumns(shownAsc, changeEvents, { sinceChange, lastChangeTime }) {
  const cols = shownAsc.map((s) => ({ type: "sample", t: toTime(s.sampledDate) ?? 0, sample: s }));
  const firstT = sinceChange && lastChangeTime ? lastChangeTime : cols[0]?.t;
  if (firstT === undefined) return cols;
  (changeEvents || []).forEach((e) => {
    const t = toTime(e.eventDate);
    if (t === null || t < firstT) return;
    cols.push({ type: "change", t, change: e });
  });
  // a change on the same day as a sample goes after it (sampled, then changed)
  return cols.sort((a, b) => a.t - b.t || (a.type === "sample" ? -1 : 1));
}

export function changeLabel(e) {
  return `Oil changed ${formatDate(e.eventDate)}${e.oilBrandType ? ` — ${e.oilBrandType}` : ""}${e.quantityUsed ? ` (${e.quantityUsed} L)` : ""}`;
}

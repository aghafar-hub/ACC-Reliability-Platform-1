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
      { key: "status", field: "reportStatus", label: "Report Status", kind: "status", get: (s) => s.reportStatus },
      { key: "sampleId", field: "sampleId", label: "Sample ID", kind: "mono", get: (s) => s.sampleId },
      { key: "sampled", field: "sampledDate", label: "Sampled", kind: "date", get: (s) => s.sampledDate },
      { key: "reported", label: "Reported", kind: "date", get: (s) => s.reportedDate },
      { key: "review", label: "Review", kind: "review" },
      { key: "action", label: "Action", kind: "action" },
    ],
  },
  {
    title: "Lubricant",
    rows: [
      { key: "contRating", field: "contaminationRating", label: "Contamination Rating", kind: "status", get: (s) => s.contaminationRating },
      { key: "eqRating", field: "equipmentRating", label: "Equipment Rating", kind: "status", get: (s) => s.equipmentRating },
      { key: "lubRating", field: "lubricantRating", label: "Lubricant Rating", kind: "status", get: (s) => s.lubricantRating },
      { key: "iso", label: "ISO Code (4/6/14)", kind: "text", get: (s) => s.isoCode, optional: true },
      { key: "pc4", field: "particleCount4um", label: "Particle Count >4µm", kind: "num", flag: "PC4", get: (s) => num(s.particleCount4um) },
      { key: "pc6", field: "particleCount6um", label: "Particle Count >6µm", kind: "num", flag: "PC6", get: (s) => num(s.particleCount6um) },
      { key: "pc14", field: "particleCount14um", label: "Particle Count >14µm", kind: "num", flag: "PC14", get: (s) => num(s.particleCount14um) },
      { key: "pq", field: "pqIndex", label: "PQ Index", kind: "num", flag: "PQIndex", get: (s) => num(s.pqIndex) },
      { key: "visc", field: "visc40C", label: "Viscosity (cSt)", kind: "num", flag: "Visc", get: (s) => num(s.visc40C), visc: true },
      { key: "ox", field: "oxidation", label: "Oxidation (Ab/cm)", kind: "num", flag: "Oxidation", get: (s) => num(s.oxidation) },
      { key: "tan", field: "tan", label: "TAN (mg KOH/g)", kind: "num", flag: "TAN", get: (s) => num(s.tan), optional: true },
      { key: "water", field: "water", label: "Water (Vol%)", kind: "num", flag: "Water", get: (s) => num(s.water) },
    ],
  },
  {
    title: "Wear (ppm)",
    rows: [
      ["Ag", "Silver"], ["Al", "Aluminum"], ["Cr", "Chromium"], ["Cu", "Copper"], ["Fe", "Iron"],
      ["Mo", "Molybdenum"], ["Ni", "Nickel"], ["Pb", "Lead"], ["Sn", "Tin"],
    ].map(([k, n]) => ({ key: k, field: `wear.${k}`, label: `${k} (${n})`, kind: "num", flag: k, get: wear(k) })),
  },
  {
    title: "Contaminants (ppm)",
    rows: [["K", "Potassium"], ["Na", "Sodium"], ["Si", "Silicon"]].map(([k, n]) => ({ key: k, field: `contaminants.${k}`, label: `${k} (${n})`, kind: "num", flag: k, get: cont(k) })),
  },
  {
    title: "Additives (ppm)",
    rows: [["B", "Boron"], ["Ba", "Barium"], ["Ca", "Calcium"], ["Mg", "Magnesium"], ["P", "Phosphorus"], ["Zn", "Zinc"]].map(([k, n]) => ({
      key: k,
      field: `additives.${k}`,
      label: `${k} (${n})`,
      kind: "num",
      flag: k,
      get: add(k),
    })),
  },
];

// The viscosity test temperature the lab used: "@40°C" / "@100°C" when the
// samples agree, "" when it's mixed or not recorded (older reports).
export function viscTempLabel(samples) {
  const temps = new Set((samples || []).filter((s) => num(s.visc40C) !== null).map((s) => String(s.viscTemp || "")));
  if (temps.size !== 1) return "";
  const t = [...temps][0];
  return t ? `@${t}°C` : "";
}

// Rows that only show when at least one sample has a value. The viscosity
// row is named by its test temperature.
export function visibleGroups(samples) {
  const vt = viscTempLabel(samples);
  return REPORT_GROUPS.map((g) => ({
    ...g,
    rows: g.rows
      .filter((r) => !r.optional || samples.some((s) => r.get(s) !== null && r.get(s) !== undefined && r.get(s) !== ""))
      .map((r) => (r.visc ? { ...r, label: vt ? `Visc${vt} (cSt)` : "Viscosity (cSt)" } : r)),
  }));
}

// A viscosity cell's own temperature, shown when the row mixes them.
export function viscCellTemp(samples, sample) {
  return viscTempLabel(samples) || !sample.viscTemp ? "" : `@${sample.viscTemp}°C`;
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

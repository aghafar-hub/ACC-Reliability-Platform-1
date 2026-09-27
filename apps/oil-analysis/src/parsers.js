// Row <-> object converters for each sheet tab. These mirror the exact column
// layout the Apps Script backend (doPost/doGet) reads and writes, so this app
// stays compatible with the existing Google Sheet without changing its schema.

export function formatDate(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return typeof v === "string" ? v : "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// True if two values parse to the same calendar day, regardless of which
// string form each one is in. Google Sheets can silently coerce a
// date-looking string (e.g. the "YYYY-MM-DD" an <input type="date"> sends)
// into a real Date-typed cell — read back, that cell can come out as a
// completely different string (a Date.toString(), a re-formatted date...)
// that still names the exact same day. Anything comparing two dates that
// came from two different read/write round trips needs this instead of
// strict string equality, or a same-day value can register as a mismatch.
export function sameCalendarDay(a, b) {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  if (sa === sb) return true;
  if (!sa || !sb) return false;
  const da = new Date(sa);
  const db = new Date(sb);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// ── Oil Sample Tracker (monthly grid) ─────────────────────────────────────
// Ported from the original app's own parsing logic, not re-derived: month
// column headers like "Jul-22"/"Apr 2026", cell values as "STATUS|DATE"
// (e.g. "CAUTION|26 Apr 2026") or a bare status/date string.

// Parses a month-column header ("Jul-22" or "Apr 2026") into a real Date
// (day fixed at 15th so month/year sorting is stable) or null.
function parseMonthLabelDate(label) {
  if (!label) return null;
  const str = String(label).trim();
  let m = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const d = new Date(`${m[1]} 15, ${m[2]}`);
    return isNaN(d) ? null : d;
  }
  m = str.match(/^([A-Za-z]+)-(\d{2,4})$/);
  if (m) {
    let year = parseInt(m[2], 10);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const d = new Date(`${m[1]} 15, ${year}`);
    return isNaN(d) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Splits a tracker cell value "STATUS|DATE" into its parts; a plain value
// with no "|" is treated as the status with no date.
function splitTrackerCell(value) {
  const str = String(value || "").trim();
  const i = str.indexOf("|");
  return i === -1 ? { status: str, date: "" } : { status: str.slice(0, i).trim(), date: str.slice(i + 1).trim() };
}

// rows: raw 2D array from the "Oil Sample Tracker" sheet, header row
// included (rows[0] = ["Equipment", "Last sample", "interval Days",
// "INTERVAL", <month columns>, ...]). Month columns can be plain text
// ("Jul-22") or real Date-typed cells (Apps Script serializes those to ISO
// strings) — either way a column only counts as a month if its header
// actually parses as one, which is also what excludes the leading "Last
// sample" / "interval Days" / "INTERVAL" metadata columns without having to
// hard-code their positions. Returns { [equipmentCode]: [{ monthLabel,
// status, date, sortDate }] } sorted newest month first.
export function parseTrackerRows(rows) {
  if (!rows || rows.length < 2) return {};
  const header = rows[0];
  const result = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const code = String(row[0] || "").trim();
    if (!code) continue;
    const entries = [];
    for (let c = 1; c < header.length; c++) {
      const rawHeader = String(header[c] || "").trim();
      if (!rawHeader) continue;
      const monthDate = parseMonthLabelDate(rawHeader);
      if (!monthDate) continue;
      const monthLabel = monthDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      const cell = String(row[c] || "").trim();
      if (!cell) continue;
      const { status, date: rawDate } = splitTrackerCell(cell);
      let date = rawDate;
      if (rawDate && rawDate !== monthLabel) {
        const parsed = parseMonthLabelDate(rawDate) || new Date(rawDate);
        if (!isNaN(parsed)) date = parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      }
      entries.push({ monthLabel, status, date: date || monthLabel, sortDate: monthDate.getTime() });
    }
    entries.sort((a, b) => b.sortDate - a.sortDate);
    result[code] = entries;
  }
  return result;
}

// Overlays live Data_Entry samples on top of the tracker sheet's parsed
// history, so an equipment's status always reflects the most recent real
// sample — even one entered straight into the sheet and never routed
// through "Add Sample" (which is the only path that also writes the
// tracker sheet). A sample wins over whatever the sheet says for its own
// equipment+month; a month the sheet has (including an explicit MISSING)
// that Data_Entry has no sample for is left untouched, so a genuine gap
// still shows as a gap.
export function overlaySamplesOnTracker(trackerByEquip, samples) {
  const latestByCode = new Map(); // code -> Map("year-month" -> sample)
  for (const smp of samples || []) {
    const code = smp.unitId;
    if (!code || !smp.sampledDate) continue;
    const d = new Date(smp.sampledDate);
    if (isNaN(d)) continue;
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    let byMonth = latestByCode.get(code);
    if (!byMonth) latestByCode.set(code, (byMonth = new Map()));
    const existing = byMonth.get(monthKey);
    if (!existing || d.getTime() > new Date(existing.sampledDate).getTime()) byMonth.set(monthKey, smp);
  }

  const allCodes = new Set([...Object.keys(trackerByEquip || {}), ...latestByCode.keys()]);
  const result = {};
  for (const code of allCodes) {
    const byMonth = new Map();
    for (const entry of trackerByEquip?.[code] || []) {
      const d = new Date(entry.sortDate);
      byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, entry);
    }
    for (const [monthKey, smp] of latestByCode.get(code) || []) {
      const d = new Date(smp.sampledDate);
      byMonth.set(monthKey, {
        monthLabel: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        status: smp.reportStatus || "",
        date: smp.sampledDate,
        sortDate: d.getTime(),
      });
    }
    result[code] = [...byMonth.values()].sort((a, b) => b.sortDate - a.sortDate);
  }
  return result;
}

// Parses an equipment's sampling interval text ("6 Months", "3 Months",
// "Monthly", "Oil Analysis", "1 y", "If needed") into a number of months,
// or null if there's no fixed interval.
export function intervalMonths(freqText) {
  if (!freqText) return null;
  const t = String(freqText).trim().toLowerCase();
  if (t === "oil analysis") return 36;
  if (t === "if needed") return null;
  const yearMatch = t.match(/^([\d.]+)\s*y$/);
  if (yearMatch) return Math.round(parseFloat(yearMatch[1]) * 12);
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// Given a new change date and that lubrication point's frequency, the next
// due date ("" if the frequency has no fixed interval) — and given a next
// due date, whether that reads as Current or Overdue today. Shared by the
// Oil Change Log page and the Equipment tab's own "Log Oil Change" flow so
// both compute the exact same thing from the exact same date edit.
export function computeOilChangeNextDue(changeDate, frequency) {
  const months = intervalMonths(frequency);
  if (!months || !changeDate) return "";
  const d = new Date(changeDate);
  if (isNaN(d)) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
export function computeOilChangeStatus(nextDueDate) {
  if (!nextDueDate) return "Current";
  const d = new Date(nextDueDate);
  if (isNaN(d)) return "Current";
  return d <= new Date() ? "Overdue" : "Current";
}

// Same limits OilReportSearch.jsx's own ParamTable already uses to
// highlight a reading red — reused everywhere a sample timeline shows
// "why this sample is flagged" so that means the same thing in every one
// of those places instead of a second, possibly-different set of numbers.
export const SAMPLE_TRIGGER_CHECKS = [
  { label: "Fe", unit: "ppm", limit: 20, get: (sm) => sm.wear?.Fe },
  { label: "Cu", unit: "ppm", limit: 10, get: (sm) => sm.wear?.Cu },
  { label: "Cr", unit: "ppm", limit: 5, get: (sm) => sm.wear?.Cr },
  { label: "Si", unit: "ppm", limit: 20, get: (sm) => sm.contaminants?.Si },
  { label: "PQ Index", unit: "", limit: 15, get: (sm) => sm.pqIndex },
  { label: "Oxidation", unit: "Ab/cm", limit: 3, get: (sm) => sm.oxidation },
  { label: "Water", unit: "%", limit: 0.1, get: (sm) => (sm.water === "" ? null : parseFloat(sm.water)) },
  { label: "TAN", unit: "mg KOH/g", limit: 1, get: (sm) => (sm.tan === "" ? null : parseFloat(sm.tan)) },
];

// Value/unit lookup for every parameter a lab report can flag — covers the
// full wear/contaminant/additive breakdown, not just the curated
// SAMPLE_TRIGGER_CHECKS subset, since the lab's own flags (from an imported
// PDF) can call out any of them.
const PARAM_INFO = {
  Ag: { unit: "ppm", get: (sm) => sm.wear?.Ag },
  Al: { unit: "ppm", get: (sm) => sm.wear?.Al },
  Cr: { unit: "ppm", get: (sm) => sm.wear?.Cr },
  Cu: { unit: "ppm", get: (sm) => sm.wear?.Cu },
  Fe: { unit: "ppm", get: (sm) => sm.wear?.Fe },
  Mo: { unit: "ppm", get: (sm) => sm.wear?.Mo },
  Ni: { unit: "ppm", get: (sm) => sm.wear?.Ni },
  Pb: { unit: "ppm", get: (sm) => sm.wear?.Pb },
  Sn: { unit: "ppm", get: (sm) => sm.wear?.Sn },
  K: { unit: "ppm", get: (sm) => sm.contaminants?.K },
  Na: { unit: "ppm", get: (sm) => sm.contaminants?.Na },
  Si: { unit: "ppm", get: (sm) => sm.contaminants?.Si },
  B: { unit: "ppm", get: (sm) => sm.additives?.B },
  Ba: { unit: "ppm", get: (sm) => sm.additives?.Ba },
  Ca: { unit: "ppm", get: (sm) => sm.additives?.Ca },
  Mg: { unit: "ppm", get: (sm) => sm.additives?.Mg },
  P: { unit: "ppm", get: (sm) => sm.additives?.P },
  Zn: { unit: "ppm", get: (sm) => sm.additives?.Zn },
  Visc: { unit: "cSt", get: (sm) => sm.visc40C },
  Oxidation: { unit: "Ab/cm", get: (sm) => sm.oxidation },
  Water: { unit: "%", get: (sm) => sm.water },
  TAN: { unit: "mg KOH/g", get: (sm) => sm.tan },
  PQIndex: { unit: "", get: (sm) => sm.pqIndex },
};

// For a Caution/Alert sample, which of its own readings actually crossed a
// limit — so a timeline can show "Water: 0.15%" instead of always the same
// fixed Visc/Fe/Si/Water snapshot regardless of what was actually wrong.
// Samples imported from a lab PDF carry the lab's own real flagged
// parameters (see flaggedReadings / parseFlaggedParams) — those are used
// when present, since they're more accurate than this app's own guessed
// limits; manually-entered samples fall back to SAMPLE_TRIGGER_CHECKS.
export function sampleTriggerReadings(sm) {
  if (sm?.flaggedReadings?.length) {
    return sm.flaggedReadings.map(({ param, severity }) => {
      const info = PARAM_INFO[param];
      return { label: param, unit: info?.unit || "", value: info ? info.get(sm) : undefined, severity };
    });
  }
  return SAMPLE_TRIGGER_CHECKS.map((c) => ({ ...c, value: c.get(sm) })).filter(
    (c) => c.value !== "" && c.value != null && !isNaN(c.value) && c.value > c.limit
  );
}

// Equipment stays OK for this many months past its interval before flipping
// to OVERDUE (amber) — mirrors the old app's ~15-day grace so crossing the
// interval by a few days doesn't immediately read as an alarm. It then
// stays OVERDUE for OVERDUE_GRACE_MONTHS more before flipping to MISSING
// (red). Both are month counts, not days — the sheet only tracks samples to
// month granularity now, so freshness is judged the same way.
const OK_GRACE_MONTHS = 0.5;
const OVERDUE_GRACE_MONTHS = 1.5;

function formatMonths(months) {
  const rounded = Math.round(Math.abs(months) * 10) / 10;
  return `${rounded} ${rounded === 1 ? "month" : "months"}`;
}

// Computes { label: "OK"|"OVERDUE"|"MISSING", daysInfo } for one equipment,
// given its most recent sample/tracker date and its registry interval.
export function sampleTrackerStatus(lastDateStr, intervalText) {
  if (!intervalText || intervalText.toLowerCase() === "if needed") return { label: "OK", daysInfo: "" };
  const months = intervalMonths(intervalText);
  if (!months) return { label: "OK", daysInfo: "" };
  if (!lastDateStr) return { label: "MISSING", daysInfo: "No sample recorded" };
  const last = new Date(lastDateStr);
  if (isNaN(last)) return { label: "MISSING", daysInfo: "Invalid date" };
  const ageMonths = (Date.now() - last.getTime()) / 86400000 / 30.44;
  if (ageMonths <= months) return { label: "OK", daysInfo: `${formatMonths(months - ageMonths)} remaining` };
  if (ageMonths <= months + OK_GRACE_MONTHS) return { label: "OK", daysInfo: "Due now" };
  if (ageMonths <= months + OK_GRACE_MONTHS + OVERDUE_GRACE_MONTHS)
    return { label: "OVERDUE", daysInfo: `${formatMonths(ageMonths - months)} overdue` };
  return { label: "MISSING", daysInfo: `${formatMonths(ageMonths - months)} missing` };
}

// ── Action Tracker ───────────────────────────────────────────────────────
// Columns: 0 Ac.No, 1 Equipment Code, 2 Description, 3 Oil Type,
// 4 Revision Date, 5 Sample Date, 6 Sample Result, 7 Sample Analysis,
// 8 Last Change, 9 Status, 10 Contractor Action, 11 Contractor,
// 12 Completed Date, 13 Prev Month Agreed Action, 14 Acc Action,
// 15 Agreed Action, 16 Closing Comment, 17 Last Modified.
// Confirmed against the live sheet's own header row — Closing Comment sits
// BEFORE Last Modified, not after. Last Modified is stamped by the backend
// itself on every write regardless of what's sent, so it's only ever
// round-tripped here, never set by the client.

export const ACTION_HEADERS = [
  "Ac. No.",
  "Equipment Code",
  "Description",
  "Oil Type",
  "Revision Date",
  "Sample Date",
  "Sample Result",
  "Sample Analysis",
  "Last Change",
  "Status",
  "Contractor Action",
  "Contractor",
  "Completed Date",
  "Prev Month Agreed Action",
  "Acc Action",
  "Agreed Action",
  "Closing Comment",
  "Last Modified",
];

export function rowToAction(row) {
  const [
    acNo,
    equipmentCode,
    description,
    oilType,
    revisionDate,
    sampleDate,
    sampleResult,
    sampleAnalysis,
    lastChange,
    status,
    contractorAction,
    contractor,
    completedDate,
    prevMonthAgreedAction,
    accAction,
    agreedAction,
    closingComment,
    lastModified,
  ] = row;
  return {
    acNo,
    equipmentCode,
    unitId: equipmentCode,
    description,
    oilType,
    revisionDate: formatDate(revisionDate),
    sampleDate: formatDate(sampleDate),
    sampleResult,
    sampleAnalysis,
    lastChange: formatDate(lastChange),
    status,
    contractorAction,
    contractor,
    completedDate: formatDate(completedDate),
    prevMonthAgreedAction,
    accAction,
    agreedAction,
    closingComment,
    lastModified,
    _id: `${equipmentCode}_${acNo}_${revisionDate}`,
    _matchCols: [0, 1],
    _matchValues: [acNo, equipmentCode],
  };
}

export function actionToRow(a) {
  return [
    a.acNo || "",
    a.equipmentCode || a.unitId || "",
    a.description || "",
    a.oilType || "",
    a.revisionDate || "",
    a.sampleDate || "",
    a.sampleResult || "",
    a.sampleAnalysis || "",
    a.lastChange || "",
    a.status || "",
    a.contractorAction || "",
    a.contractor || "",
    a.completedDate || "",
    a.prevMonthAgreedAction || "",
    a.accAction || "",
    a.agreedAction || "",
    a.closingComment || "",
    a.lastModified || "",
  ];
}

export function nextAcNo(actions) {
  let max = 0;
  for (const a of actions || []) {
    // Ac. No. values look like "0-101" (app-generated) or "O-101" (the
    // sheet's own formula-generated rows, letter O not digit 0) — take the
    // LAST digit run, not the first, or "0-101" reads as just "0" and
    // nextAcNo never advances past "0-1" for anything the app itself created.
    const groups = String(a.acNo || "").match(/\d+/g);
    if (groups) max = Math.max(max, parseInt(groups[groups.length - 1], 10));
  }
  return `0-${max + 1}`;
}

// ── Oil Change Log ───────────────────────────────────────────────────────
// Columns: 0 Equipment Code, 1 Asset Name, 2 Lubrication Point, 3 Frequency,
// 4 Oil Type, 5 Brand, 6 Quantity, 7-8 (unused), 9 Last Change, 10 Next Due,
// 11 Status (sheet formula — never overwritten by updateRow)

export function rowToOilChange(row) {
  const equipmentCode = row[0];
  const lubricationPoint = row[2];
  const oilType = row[4];
  return {
    equipmentCode,
    assetName: row[1] || equipmentCode,
    lubricationPoint,
    frequency: row[3],
    oilType,
    brand: row[5],
    quantity: row[6],
    changeDate: formatDate(row[9]),
    nextDueDate: formatDate(row[10]),
    status: (row[11] || "").toString().trim() || "Current",
    _id: `${equipmentCode}_${lubricationPoint}_${oilType}`,
    _matchCols: [0, 2, 4],
    _matchValues: [equipmentCode, lubricationPoint, oilType],
    _rawRow: row,
  };
}

export function oilChangeToRow(o) {
  return [
    o.equipmentCode || "",
    o.assetName || "",
    o.lubricationPoint || "",
    o.frequency || "Oil Analysis",
    o.oilType || "",
    o.brand || "",
    o.quantity || "",
    "",
    "",
    o.changeDate || "",
    o.nextDueDate || "",
    o.status || "Current",
  ];
}

// ── Data_Entry (samples) ─────────────────────────────────────────────────
// 38 columns: the 37 data columns below, plus Last Modified at index 37.
// Column 34 ("Alert Type") is real sheet data — a short classification like
// "Caution – Elevated Fe & Si" — distinct from column 35 ("Sample Analysis",
// the longer free-text recommendation). Both the original app and an early
// version of this rebuild silently dropped Alert Type; confirmed against the
// live sheet (openpyxl inspection) and fixed here.
// Column 36 ("Flagged Parameters") holds which specific readings the lab
// itself flagged Alert/Caution for that sample — e.g. "Cu:Alert,Fe:Alert" —
// captured from cell-level color coding in imported PDF lab reports, which
// carries more detail than the four rollup ratings alone (a single wear
// metal can be flagged even when the overall Contamination Rating is only
// Caution). Manually-entered samples leave this blank.

// Parses "Cu:Alert,Fe:Alert,Al:Caution" into [{ param, severity }, ...].
export function parseFlaggedParams(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [param, severity] = entry.split(":").map((x) => (x || "").trim());
      return { param, severity };
    })
    .filter((f) => f.param && f.severity);
}

// Inverse of parseFlaggedParams — used when saving a sample.
export function formatFlaggedParams(list) {
  return (list || [])
    .filter((f) => f && f.param && f.severity)
    .map((f) => `${f.param}:${f.severity}`)
    .join(",");
}

export function rowToSample(row) {
  const [
    unitId,
    description,
    sampleId,
    sampledDate,
    reportStatus,
    contaminationRating,
    equipmentRating,
    lubricantRating,
    particleCount4um,
    particleCount6um,
    particleCount14um,
    pqIndex,
    visc40C,
    tan,
    oxidation,
    water,
    Ag,
    Al,
    Cr,
    Cu,
    Fe,
    Mo,
    Ni,
    Pb,
    Sn,
    K,
    Na,
    Si,
    B,
    Ba,
    Ca,
    Mg,
    P,
    Zn,
    alertType,
    recommendationsRaw,
    flaggedParamsRaw,
  ] = row;
  const num = (v) => (v === "" || v === null || v === undefined ? "" : parseFloat(v));
  return {
    unitId,
    description,
    sampleId,
    sampledDate: formatDate(sampledDate),
    reportStatus,
    alertType,
    contaminationRating,
    equipmentRating,
    lubricantRating,
    particleCount4um: num(particleCount4um),
    particleCount6um: num(particleCount6um),
    particleCount14um: num(particleCount14um),
    pqIndex: num(pqIndex),
    visc40C: num(visc40C),
    tan: num(tan),
    oxidation: num(oxidation),
    water: num(water),
    wear: { Ag, Al, Cr, Cu, Fe, Mo, Ni, Pb, Sn },
    contaminants: { K, Na, Si },
    additives: { B, Ba, Ca, Mg, P, Zn },
    recommendations: recommendationsRaw ? [recommendationsRaw] : [],
    flaggedReadings: parseFlaggedParams(flaggedParamsRaw),
    _id: `${unitId}_${sampleId}_${sampledDate}`,
    _matchCols: [0, 2],
    _matchValues: [unitId, sampleId],
  };
}

export function sampleToRow(s) {
  const wear = s.wear || {};
  const contaminants = s.contaminants || {};
  const additives = s.additives || {};
  return [
    s.unitId || "",
    s.description || "",
    s.sampleId || "",
    s.sampledDate || "",
    s.reportStatus || "",
    s.contaminationRating || "",
    s.equipmentRating || "",
    s.lubricantRating || "",
    s.particleCount4um || "",
    s.particleCount6um || "",
    s.particleCount14um || "",
    s.pqIndex || "",
    s.visc40C || "",
    s.tan || "",
    s.oxidation || "",
    s.water || "",
    wear.Ag || "",
    wear.Al || "",
    wear.Cr || "",
    wear.Cu || "",
    wear.Fe || "",
    wear.Mo || "",
    wear.Ni || "",
    wear.Pb || "",
    wear.Sn || "",
    contaminants.K || "",
    contaminants.Na || "",
    contaminants.Si || "",
    additives.B || "",
    additives.Ba || "",
    additives.Ca || "",
    additives.Mg || "",
    additives.P || "",
    additives.Zn || "",
    s.alertType || "",
    (s.recommendations || []).join("; "),
    formatFlaggedParams(s.flaggedReadings),
  ];
}

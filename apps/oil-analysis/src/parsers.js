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
  // Bare "Monthly"/"Weekly"/"Daily" (no leading number) is real data in the
  // registry — confirmed against the live sheet — but parseFloat() below
  // can't parse a word, so these silently fell through to NaN -> null (no
  // fixed interval, i.e. "never overdue") until this was added. That bug
  // affected every LP with interval="Monthly": Sample Tracker, the Oil
  // Analysis Report badges, and Routine suggestions all treated them as
  // permanently OK.
  if (t === "monthly") return 1;
  if (t === "weekly") return 0.25;
  if (t === "daily") return 1 / 30;
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

// How far ahead of a point's real due date it starts showing up as
// "due soon" — matches the backend's own ROUTE_GENERATION_LEAD_DAYS
// (RouteTemplates.js), so a manually-built route and a recurring
// template's auto-generated one pick up the same points for the same
// due-soon window.
export const ROUTE_SUGGESTION_LEAD_DAYS = 3;

// Why an LP_ID belongs on this month's Routine suggestion list — used both
// to build the suggested list in New Routine and to show a "why is this
// here" badge on an existing routine's items. Deliberately recomputed from
// live samples/actions/oilChanges rather than stored on the routine item
// at creation time, so the badge always reflects current state (e.g. if
// the point got sampled through some other path after the routine was
// created). routeType is "Sampling" or "Oil Change" — a whole-route
// choice (see Routines.js's header comment), so it also decides which
// due-date math applies here.
export function routineSuggestionReason(lpId, routeType, samples, actions, oilChanges, reg) {
  const openResample = (actions || []).some(
    (a) =>
      (a.equipmentCode || a.unitId) === lpId &&
      a.status !== "Closed" &&
      (a.agreedAction === "Resample Oil" || a.contractorAction === "Resample Oil")
  );
  if (openResample) return { kind: "resample", label: "Resample requested" };

  if (routeType === "Oil Change") {
    const months = intervalMonths(reg?.oilChangeInterval);
    if (!months) return null; // "As needed"/blank — no fixed schedule, never suggested
    const oc = (oilChanges || []).find((o) => o.equipmentCode === lpId);
    if (!oc || !oc.changeDate) return { kind: "missing", label: "No oil change recorded" };
    if (oc.status === "Overdue") return { kind: "overdue", label: "Oil change overdue" };
    if (oc.nextDueDate) {
      const daysUntil = (new Date(oc.nextDueDate) - Date.now()) / 86400000;
      if (daysUntil <= ROUTE_SUGGESTION_LEAD_DAYS) return { kind: "due", label: "Due soon" };
    }
    return null;
  }

  // Sampling
  if (reg?.oilAnalysisRequired === "Yes") {
    const lastSample = (samples || [])
      .filter((s) => s.unitId === lpId)
      .sort((a, b) => new Date(b.sampledDate || 0) - new Date(a.sampledDate || 0))[0];
    const st = sampleTrackerStatus(lastSample?.sampledDate || "", reg.interval);
    if (st.label === "OVERDUE") return { kind: "overdue", label: st.daysInfo };
    if (st.label === "MISSING") return { kind: "missing", label: st.daysInfo || "No sample recorded" };
    if (st.label === "OK" && st.daysInfo === "Due now") return { kind: "due", label: "Due now" };
  }
  return null;
}

// Every registry LP_ID that should be on this month's suggested Routine
// list for a given route type/contractor, each tagged with why. See
// routineSuggestionReason.
export function suggestedRoutinePoints(routeType, contractor, registry, samples, actions, oilChanges) {
  const out = [];
  for (const r of registry || []) {
    if (contractor && r.contractor !== contractor) continue;
    const reason = routineSuggestionReason(r.code, routeType, samples, actions, oilChanges, r);
    if (reason) out.push({ ...r, suggestionReason: reason });
  }
  return out;
}

// The three suggestion presets shown in New Routine's "Suggestion"
// dropdown — same underlying reasons (routineSuggestionReason), narrowed
// to different urgency tiers rather than three separately-computed lists.
export const SUGGESTION_PRESETS = [
  { id: "recommended", label: "Recommended", filter: () => true },
  { id: "highPriority", label: "High Priority", filter: (r) => r.suggestionReason.kind === "resample" || r.suggestionReason.kind === "missing" },
  { id: "overdue", label: "Overdue LPs", filter: (r) => r.suggestionReason.kind === "overdue" || r.suggestionReason.kind === "missing" },
];

// ── Action Tracker ───────────────────────────────────────────────────────
// Columns: 0 Ac.No, 1 Equipment Code (LP_ID), 2 Report Equipment ID,
// 3 Description, 4 Oil Type, 5 Revision Date, 6 Sample Date,
// 7 Sample Result, 8 Sample Analysis, 9 Last Change, 10 Status,
// 11 Contractor Action, 12 Contractor, 13 Completed Date,
// 14 Prev Month Agreed Action, 15 Acc Action, 16 Agreed Action,
// 17 Closing Comment, 18 Last Modified.
// STEP 3 (see docs/oil-lubrication-migration-notes.md): a "Report Equipment
// ID" column was inserted at index 2, shifting everything after it by +1
// (Equipment Code at index 1 is untouched — it already sat before the
// insertion point). Confirmed against the live sheet's own header row.
// Last Modified is stamped by the backend itself on every write regardless
// of what's sent, so it's only ever round-tripped here, never set by the
// client.

export const ACTION_HEADERS = [
  "Ac. No.",
  "Equipment Code",
  "Report Equipment ID",
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
  "Assigned To",
];

export function rowToAction(row) {
  const [
    acNo,
    equipmentCode,
    reportEquipmentId,
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
    assignedTo,
  ] = row;
  return {
    acNo,
    equipmentCode,
    unitId: equipmentCode,
    reportEquipmentId,
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
    assignedTo: assignedTo || "",
    _id: `${equipmentCode}_${acNo}_${revisionDate}`,
    _matchCols: [0, 1],
    _matchValues: [acNo, equipmentCode],
  };
}

export function actionToRow(a) {
  return [
    a.acNo || "",
    a.equipmentCode || a.unitId || "",
    a.reportEquipmentId || "",
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
    a.assignedTo || "",
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

// ── Oil Change LOG (event log) ───────────────────────────────────────────
// Note the sheet tab is literally named "Oil Change LOG" (all-caps LOG) —
// distinct from "Oil Last Change", a separate, formula-only tab this app
// never reads or writes (its Last Change Date / Status columns self-update
// from this sheet via MAXIFS/IF formulas already built into it). This one
// is append-only: one row per real oil-change event, never edited in place
// — a change event is a historical fact, not mutable "current state".
// Columns: 0 EventId, 1 LP_ID, 2 RoutineItemId, 3 EventType, 4 EventDate,
// 5 QuantityUsed, 6 OilBrandType, 7 DoneBy, 8 Contractor, 9 ConditionNotes,
// 10 PhotoUrl, 11 NextDueDate (computed server-side at log time from the
// point's own Oil_Change_Interval), 12 Created_Date.

export function rowToOilChangeEvent(row) {
  return {
    eventId: row[0] || "",
    lpId: row[1] || "",
    routineItemId: row[2] || "",
    eventType: row[3] || "Change",
    eventDate: formatDate(row[4]),
    quantityUsed: row[5] || "",
    oilBrandType: row[6] || "",
    doneBy: row[7] || "",
    contractor: row[8] || "",
    conditionNotes: row[9] || "",
    photoUrl: row[10] || "",
    nextDueDate: formatDate(row[11]),
    createdDate: row[12] || "",
  };
}

// Builds the "current state per lubrication point" view every existing page
// (Dashboard, Oil Change Log, Equipment, Reports, Sample Tracker, action
// autofill…) already expects — same shape the old per-LP "current row"
// sheet used to hand them directly, now derived instead from the append-
// only event log plus the Equipment Registry. One entry per registry row
// (per LP_ID), even for points with no logged events yet.
//
// `equipmentCode` is set to LP_ID, not Equipment_ID — matches `reg.code`
// (see equipmentRegistryDefault.js) and, today, the value Data_Entry/Action
// Tracker rows already yield for `.unitId`/`.equipmentCode` (their own
// column-shift fix is a separate, not-yet-done step, but LP_ID already sits
// in their first column) — so every existing cross-reference by
// equipmentCode keeps matching real rows without those pages changing.
export function deriveCurrentOilChanges(registry, events) {
  const latestByLp = new Map();
  for (const ev of events || []) {
    if (!ev.lpId) continue;
    const prev = latestByLp.get(ev.lpId);
    if (!prev || new Date(ev.eventDate) > new Date(prev.eventDate)) latestByLp.set(ev.lpId, ev);
  }
  return (registry || []).map((reg) => {
    const latest = latestByLp.get(reg.code) || null;
    const changeDate = latest?.eventDate || "";
    const nextDueDate = latest?.nextDueDate || "";
    return {
      equipmentCode: reg.code,
      lpId: reg.code,
      assetName: reg.description || reg.equipmentId || reg.code,
      lubricationPoint: reg.lubricationPoint,
      frequency: reg.oilChangeInterval,
      oilType: reg.lubricant,
      brand: reg.lubricantBrand,
      quantity: reg.lubricantQuantityL,
      contractor: latest?.contractor || reg.contractor,
      performedBy: latest?.doneBy || "",
      changeDate,
      nextDueDate,
      status: computeOilChangeStatus(nextDueDate),
      lastEvent: latest,
      _id: reg.code,
    };
  });
}

// ── Data_Entry (samples) ─────────────────────────────────────────────────
// 39 columns: the 38 data columns below, plus Last Modified at index 38.
// STEP 3 (see docs/oil-lubrication-migration-notes.md): a "Report Equipment
// ID" column was inserted at index 1, shifting everything after it (from
// Description onward) by +1. unitId at index 0 is untouched — it already
// sat before the insertion point.
// Column 35 ("Alert Type") is real sheet data — a short classification like
// "Caution – Elevated Fe & Si" — distinct from column 36 ("Sample Analysis",
// the longer free-text recommendation). Both the original app and an early
// version of this rebuild silently dropped Alert Type; confirmed against the
// live sheet (openpyxl inspection) and fixed here.
// Column 37 ("Flagged Parameters") holds which specific readings the lab
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
    reportEquipmentId,
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
    , // server-stamped Last Modified (col 39, see api.js's SAMPLE_LAST_MODIFIED_COL) — not otherwise used here
    sampleUid, // Patch 6 — see api.js's SAMPLE_UID_COL
  ] = row;
  const num = (v) => (v === "" || v === null || v === undefined ? "" : parseFloat(v));
  return {
    unitId,
    reportEquipmentId,
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
    sampleUid: sampleUid || "",
    _id: sampleUid ? `uid_${sampleUid}` : `${unitId}_${sampleId}_${sampledDate}`,
    // Patch 6: a sample created after the Sample_UID column existed gets
    // matched by that alone — always unique, no ambiguity possible. A
    // sample from before it existed (blank sampleUid) falls back to the
    // original (equipmentCode, sampleId) pair — see updateSample's own
    // comment in api.js for why that pair isn't guaranteed unique, and why
    // there's no way to retroactively fix a historical row's ambiguity.
    _matchCols: sampleUid ? [39] : [0, 3],
    _matchValues: sampleUid ? [sampleUid] : [unitId, sampleId],
  };
}

export function sampleToRow(s) {
  const wear = s.wear || {};
  const contaminants = s.contaminants || {};
  const additives = s.additives || {};
  return [
    s.unitId || "",
    s.reportEquipmentId || "",
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
    "", // Last Modified (col 39) — always blank here; the backend stamps the real value itself on every write (see api.js's SAMPLE_LAST_MODIFIED_COL)
    s.sampleUid || "", // Patch 6 — see api.js's SAMPLE_UID_COL
  ];
}

// ── Routines (ROUTINES + OA_ROUTINE_ITEMS) ────────────────────────────────
// No login system exists in this app, so CreatedBy/AssignedTo/ApprovedBy/
// ACC_CommentBy are plain free-text fields here (same pattern as Oil Change
// LOG's "Done By") rather than references to real user accounts.
//
// ROUTINES columns: 0 RoutineId, 1 CreatedBy, 2 AssignedTo, 3 Contractor,
// 4 CreatedDate, 5 Status, 6 SubmittedDate, 7 ApprovedBy, 8 ApprovedDate,
// 9 ACC_Comment, 10 ACC_CommentBy, 11 ACC_CommentDate, 12 RouteName,
// 13 RouteType ("Oil Change"|"Sampling"), 14 DueDate, 15 SourceTemplateId
// (blank unless generated by a ROUTINE_TEMPLATES recurring template — see
// RouteTemplates.js). The backend's getRoutines appends two more (not
// sheet columns — computed server-side from OA_ROUTINE_ITEMS in the same
// call, so the list doesn't need an extra fetch per routine):
// 16 ItemsTotal, 17 ItemsDone.
export function rowToRoutine(row) {
  return {
    routineId: row[0] || "",
    createdBy: row[1] || "",
    assignedTo: row[2] || "",
    contractor: row[3] || "",
    createdDate: formatDate(row[4]),
    status: row[5] || "Assigned",
    submittedDate: formatDate(row[6]),
    approvedBy: row[7] || "",
    approvedDate: formatDate(row[8]),
    accComment: row[9] || "",
    accCommentBy: row[10] || "",
    accCommentDate: formatDate(row[11]),
    routeName: row[12] || "",
    routeType: row[13] || "",
    dueDate: formatDate(row[14]),
    sourceTemplateId: row[15] || "",
    itemsTotal: Number(row[16]) || 0,
    itemsDone: Number(row[17]) || 0,
  };
}

// ROUTINE_TEMPLATES columns: 0 TemplateId, 1 RouteName, 2 RouteType,
// 3 Contractor, 4 Area, 5 OilType, 6 Frequency, 7 NextGenerateDate,
// 8 Status ("Active"|"Paused"), 9 CreatedBy, 10 CreatedDate,
// 11 LastGeneratedRoutineId, 12 ModifiedDate.
export function rowToRouteTemplate(row) {
  return {
    templateId: row[0] || "",
    routeName: row[1] || "",
    routeType: row[2] || "",
    contractor: row[3] || "",
    area: row[4] || "",
    oilType: row[5] || "",
    frequency: row[6] || "",
    nextGenerateDate: formatDate(row[7]),
    status: row[8] || "Active",
    createdBy: row[9] || "",
    createdDate: formatDate(row[10]),
    lastGeneratedRoutineId: row[11] || "",
    modifiedDate: row[12] || "",
  };
}

// OA_ROUTINE_ITEMS columns: 0 RoutineItemId, 1 RoutineId, 2 LP_ID,
// 3 ItemType, 4 RequiredOilType, 5 Implemented, 6 NotImplementedReason,
// 7 ActualDate, 8 ActualQuantity, 9 SampleTaken, 10 CreatedDate,
// 11 ModifiedDate.
export function rowToRoutineItem(row) {
  return {
    routineItemId: row[0] || "",
    routineId: row[1] || "",
    lpId: row[2] || "",
    itemType: row[3] || "Change",
    requiredOilType: row[4] || "",
    implemented: row[5] || "",
    notImplementedReason: row[6] || "",
    actualDate: formatDate(row[7]),
    actualQuantity: row[8] || "",
    sampleTaken: row[9] || "",
    createdDate: formatDate(row[10]),
    modifiedDate: row[11] || "",
  };
}

// Client-generated id (e.g. for a new Routine/RoutineItem, or an Oil
// Inventory Product_ID) — see the backend's own comment on createRoutine
// for why this (not a server-generated id) is what makes write-
// verification exact.
export function newId(prefix) {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

// ── Oil Inventory (Oil Inventory + Oil Inventory LOG) ─────────────────────
// "Oil Inventory" columns: 0 Product_ID, 1 Lubricant_Type, 2 Lubricant_Brand,
// 3 Container_Type, 4 Container_Size_L, 5 Unit, 6 Current_Stock (sheet
// formula — see docs/oil-lubrication-migration-notes.md; never written by
// this app), 7 Recorder_Level, 8 Storage_Location, 9 Supplier, 10 Unit_Cost,
// 11 Status, 12 Last_Movement_Date (sheet formula, also never written),
// 13 Notes, 14 Created_Date, 15 Modified_Date.
export function rowToOilProduct(row) {
  return {
    productId: row[0] || "",
    lubricantType: row[1] || "",
    lubricantBrand: row[2] || "",
    containerType: row[3] || "",
    containerSizeL: row[4] || "",
    unit: row[5] || "",
    currentStock: row[6] === "" || row[6] == null ? null : Number(row[6]),
    recorderLevel: row[7] === "" || row[7] == null ? null : Number(row[7]),
    storageLocation: row[8] || "",
    supplier: row[9] || "",
    unitCost: row[10] || "",
    status: row[11] || "Active",
    lastMovementDate: formatDate(row[12]),
    notes: row[13] || "",
    createdDate: formatDate(row[14]),
    modifiedDate: row[15] || "",
    contractor: row[16] || "",
  };
}

// "Oil Inventory LOG" columns: 0 MovementId, 1 Product_ID, 2 MovementType
// ("Receipt"|"Issue"|"Adjustment"), 3 Quantity, 4 MovementDate,
// 5 LinkedLP_ID, 6 LinkedEventId, 7 Contractor, 8 DoneBy, 9 Reference,
// 10 Notes, 11 Created_Date.
export function rowToOilMovement(row) {
  return {
    movementId: row[0] || "",
    productId: row[1] || "",
    movementType: row[2] || "",
    quantity: row[3] === "" || row[3] == null ? null : Number(row[3]),
    movementDate: formatDate(row[4]),
    linkedLpId: row[5] || "",
    linkedEventId: row[6] || "",
    contractor: row[7] || "",
    doneBy: row[8] || "",
    reference: row[9] || "",
    notes: row[10] || "",
    createdDate: row[11] || "",
  };
}

// Row <-> object parsing for every sheet this app reads/writes, ported
// directly from the original bundle's row-shaping functions (`rm`, `lm`,
// `im`, `om`, `sm`, `am`, `um`, `_o`, plus the `Ga`/`Ka` row serializers).
// The Apps Script backend returns each RMS/SPM/register/last-reading row as
// a plain object keyed by that sheet's own header text (e.g. `row["Asset
// ID"]`), so these parsers read by column name rather than by index. See
// docs/SHEET_SCHEMA.md for the full column layout of each sheet.

// ── Primitive helpers ───────────────────────────────────────────────────

// Parses a numeric cell, treating "", null and undefined as "no value"
// (returns null) rather than 0 — important because 0 is itself a valid
// reading and must stay distinguishable from "not entered".
export function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

// Google Sheets serial-date-aware parser: accepts a JS Date, a spreadsheet
// serial number (or a numeric string), or any string Date() can parse, and
// always returns an ISO "YYYY-MM-DD" string (or "" if nothing parses). The
// 25569 offset is the number of days between the Sheets epoch
// (1899-12-30) and the Unix epoch.
export function parseSheetDate(value) {
  if (value == null || value === "") return "";
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    d = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    d = /^\d+(\.\d+)?$/.test(trimmed) ? new Date(Math.round((parseFloat(trimmed) - 25569) * 86400 * 1000)) : new Date(trimmed);
  }
  return !d || isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Human-friendly "DD Mon YYYY" display form, used everywhere a date is
// shown to the user (tables, cards, chart tooltips). Falls back to the raw
// value as a string if it isn't parseable, rather than showing nothing.
export function formatDisplayDate(value) {
  if (value == null || value === "") return "";
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    d = new Date(Math.round((value - 25569) * 86400 * 1000));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    d = /^\d+(\.\d+)?$/.test(trimmed) ? new Date(Math.round((parseFloat(trimmed) - 25569) * 86400 * 1000)) : new Date(trimmed);
  }
  if (!d || isNaN(d.getTime())) return String(value);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// "YYYY-MM-DD" -> "YYYY-MM", used as the Compliance Tracker's month key.
export function monthKey(dateStr) {
  return dateStr ? String(dateStr).slice(0, 7) : "";
}

// Normalizes a measurement-point label (the RMS/SPM "Asset ID" column —
// things like "Motor Outboard", "Gearbox Inboard"): collapses whitespace and
// fixes the handful of misspellings seen in the live sheet data
// ("ouboard", "outbord" -> "Outboard"; "inboard"/"outboard" -> properly
// cased). Order matters: the narrower typo fixes run before the generic
// case-normalization pass so they aren't shadowed by it.
export function normalizePoint(value) {
  if (value == null) return "";
  let s = String(value).replace(/\s+/g, " ").trim();
  s = s
    .replace(/\bouboard\b/gi, "Outboard")
    .replace(/\boutbord\b/gi, "Outboard")
    .replace(/\binboard\b/gi, "Inboard")
    .replace(/\boutboard\b/gi, "Outboard")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

// ── Sheet header rows (used both for CSV/append payloads and for display) ─

// RMS DATA — note the literal line break inside the "Gear" header: the live
// sheet's header cell is wrapped onto two lines ("Gear\n(mm/s)"), and the
// backend's column lookup is exact-match, so the newline has to be
// reproduced here rather than "cleaned up".
export const RMS_HEADERS = [
  "#",
  "Equipment Name",
  "Equipment ID",
  "Asset ID",
  "Date",
  "AXial (mm/s)",
  "Gear\n(mm/s)",
  "Horizontal (mm/s)",
  "Vertical (mm/s)",
  "Max Velocity (mm/s)",
];

// SPM DATA
export const SPM_HEADERS = ["#", "Equipment Name", "Equipment ID", "Asset ID", "Type", "Date", "HDm (dBsv)", "HDc (dBsv)", "Gs"];

// Action Tracker — column order used by the CSV export (Action Tracker page)
// and the appendAction/updateAction payload's field names.
export const ACTION_HEADERS = [
  "Action No",
  "Equipment ID",
  "Equipment Name",
  "Line",
  "Reading Date",
  "Trigger Type",
  "Trigger Point",
  "Trigger Value",
  "Machine Status",
  "Revision Date",
  "Action Status",
  "Completion Date",
  "Contractor",
  "Contractor Action",
  "ACC Action",
  "Agreed Action",
];

export const ACTION_STATUSES = ["Open", "In Progress", "Closed"];

// ── RMS DATA row <-> object ────────────────────────────────────────────

export function rowToRMS(row) {
  const point = normalizePoint(row["Asset ID"]);
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const date = parseSheetDate(row.Date);
  const axial = parseNumber(row["AXial (mm/s)"]);
  const gear = parseNumber(row["Gear\n(mm/s)"]);
  const horizontal = parseNumber(row["Horizontal (mm/s)"]);
  const vertical = parseNumber(row["Vertical (mm/s)"]);
  let maxVel = parseNumber(row["Max Velocity (mm/s)"]);
  if (maxVel === null) {
    const values = [axial, gear, horizontal, vertical].filter((v) => v !== null);
    maxVel = values.length ? Math.max(...values) : null;
  }
  return {
    _id: `RMS|${equipmentId}|${point}|${date}`,
    _matchCols: [2, 3, 4],
    _matchValues: [equipmentId, row["Asset ID"], row.Date],
    _rowNum: row._rowNum,
    seq: row["#"],
    equipmentName: row["Equipment Name"] || "",
    equipmentId,
    point,
    date,
    axial,
    gear,
    horizontal,
    vertical,
    maxVel,
  };
}

// Row-array form for append/update writes (column order matches RMS_HEADERS
// minus the header row itself).
export function rmsToRow(reading) {
  return [
    reading.seq ?? "",
    reading.equipmentName ?? "",
    reading.equipmentId ?? "",
    reading.point ?? "",
    reading.date ?? "",
    reading.axial ?? "",
    reading.gear ?? "",
    reading.horizontal ?? "",
    reading.vertical ?? "",
    reading.maxVel ?? "",
  ];
}

// ── SPM DATA row <-> object ────────────────────────────────────────────

export function rowToSPM(row) {
  const point = normalizePoint(row["Asset ID"]);
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const date = parseSheetDate(row.Date);
  return {
    _id: `SPM|${equipmentId}|${point}|${date}`,
    _matchCols: [2, 3, 5],
    _matchValues: [equipmentId, row["Asset ID"], row.Date],
    _rowNum: row._rowNum,
    seq: row["#"],
    equipmentName: row["Equipment Name"] || "",
    equipmentId,
    point,
    type: row.Type || "SPM",
    date,
    hdm: parseNumber(row["HDm (dBsv)"]),
    hdc: parseNumber(row["HDc (dBsv)"]),
    gs: parseNumber(row.Gs),
  };
}

export function spmToRow(reading) {
  return [
    reading.seq ?? "",
    reading.equipmentName ?? "",
    reading.equipmentId ?? "",
    reading.point ?? "",
    reading.type ?? "SPM",
    reading.date ?? "",
    reading.hdm ?? "",
    reading.hdc ?? "",
    reading.gs ?? "",
  ];
}

// ── Compliance Tracker ─────────────────────────────────────────────────
// The Compliance Tracker sheet is a wide one-row-per-equipment layout (a
// month per column, à la the oil app's Sample Tracker sheet). The backend
// does that reshaping server-side and hands the client an already-nested
// `{ equipmentId, line, equipment, last, months: [{ month, status }] }`
// object per equipment — this just normalizes/defends the shape, it doesn't
// parse raw columns itself.

export function rowToCompliance(row) {
  return {
    _id: `CMP|${String(row.equipmentId || "").trim()}`,
    line: row.line || "",
    equipment: row.equipment || "",
    equipmentId: String(row.equipmentId || "").trim(),
    last: row.last || "",
    months: row.months || [],
    _rowNum: row._rowNum,
  };
}

// ── Equipment Register (RMS side) ──────────────────────────────────────

export function rowToRmsRegister(row) {
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const points = String(row.Points || "")
    .split(",")
    .map((p) => normalizePoint(p))
    .filter(Boolean);
  return {
    _id: `RMSREG|${equipmentId}`,
    equipmentId,
    equipment: row["Equipment Name"] || "",
    namePlate: row["Name Plate"] || "",
    eqType: String(row["Eq Type"] || "").trim(),
    line: String(row.Line || "").trim(),
    rmsGood: parseNumber(row["RMS Good"]) ?? 2.8,
    rmsAcceptable: parseNumber(row["RMS Acceptable"]) ?? 7.1,
    rmsAlarm: parseNumber(row["RMS Alarm"]) ?? 18,
    points,
    _rowNum: row._rowNum,
  };
}

// ── Equipment Register (SPM side) ──────────────────────────────────────

// ── VIB Point Map (ACC Platform master DB merge) ───────────────────────
// Sandbox-only tab, not present on the production webhook — readAll()
// simply omits `vibPoints` there, so every consumer of this treats an
// empty/missing list as "no VIB IDs available yet" rather than an error.
// See apps-script/vib-id-merge/README.md for the merge itself.

export function rowToVibPoint(row) {
  return {
    _id: `VIB|${row["VIB ID"] || ""}`,
    vibId: String(row["VIB ID"] || "").trim(),
    equipmentId: String(row["Equipment ID"] || "").trim(),
    positionCode: String(row["Position Code"] || "").trim(),
    family: String(row.Family || "").trim(),
    description: normalizePoint(row["Point Description"]),
    status: String(row.Status || ""),
    _rowNum: row._rowNum,
  };
}

export function rowToSpmRegister(row) {
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const points = String(row.Points || "")
    .split(",")
    .map((p) => normalizePoint(p))
    .filter(Boolean);
  return {
    _id: `SPMREG|${equipmentId}`,
    equipmentId,
    equipment: row["Equipment Name"] || "",
    line: String(row.Line || "").trim(),
    points,
    spmType: String(row["SPM Type"] || ""),
    spmNormal: parseNumber(row["SPM Normal"]) ?? 20,
    spmCaution: parseNumber(row["SPM Caution"]) ?? 35,
    spmAlarm: parseNumber(row["SPM Alarm"]) ?? 50,
    _rowNum: row._rowNum,
  };
}

// ── Last Reading sheets (Dashboard's per-equipment "current status") ──────

export function rowToLastRMS(row) {
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const point = normalizePoint(row.Point || row["Asset ID"]);
  return {
    _id: `LRMS|${equipmentId}|${point}`,
    equipmentId,
    equipment: row["Equipment Name"] || "",
    line: String(row.Line || "").trim(),
    point,
    date: parseSheetDate(row.Date),
    axial: parseNumber(row.Axial || row.AXial),
    gear: parseNumber(row.Gear),
    horizontal: parseNumber(row.Horizontal),
    vertical: parseNumber(row.Vertical),
    maxVel: parseNumber(row["Max Velocity"] || row["Max Velocity (mm/s)"]),
    readingStatus: String(row["Reading Status"] || ""),
    machineStatus: String(row["Machine Status"] || ""),
    _matchCols: [0, 3],
    _matchValues: [equipmentId, row.Point || row["Asset ID"]],
    _rowNum: row._rowNum,
  };
}

export function rowToLastSPM(row) {
  const equipmentId = String(row["Equipment ID"] || "").trim();
  const point = normalizePoint(row.Point || row["Asset ID"]);
  return {
    _id: `LSPM|${equipmentId}|${point}`,
    equipmentId,
    equipment: row["Equipment Name"] || "",
    line: String(row.Line || "").trim(),
    point,
    spmType: String(row["SPM Type"] || ""),
    date: parseSheetDate(row.Date),
    hdm: parseNumber(row.HDm || row["HDm (dBsv)"]),
    hdc: parseNumber(row.HDc || row["HDc (dBsv)"]),
    gs: parseNumber(row.Gs),
    readingStatus: String(row["Reading Status"] || ""),
    machineStatus: String(row["Machine Status"] || ""),
    _matchCols: [0, 3],
    _matchValues: [equipmentId, row.Point || row["Asset ID"]],
    _rowNum: row._rowNum,
  };
}

// ── Action Tracker ──────────────────────────────────────────────────────
// Unlike RMS/SPM data, actions are never sent through the generic
// append/updateRow/deleteRow mechanism — they go through their own
// appendAction/updateAction/deleteAction backend actions, posted as a named
// field object (see api.js), so there's no row-array serializer here.

export function rowToAction(row) {
  return {
    _id: `ACT|${row["Action No"] || ""}`,
    actionNo: row["Action No"] || "",
    equipmentId: String(row["Equipment ID"] || "").trim(),
    equipmentName: row["Equipment Name"] || "",
    line: row.Line || "",
    readingDate: parseSheetDate(row["Reading Date"]),
    triggerType: row["Trigger Type"] || "",
    triggerPoint: row["Trigger Point"] || "",
    triggerValue: row["Trigger Value"] || "",
    machineStatus: row["Machine Status"] || "",
    revisionDate: parseSheetDate(row["Revision Date"]),
    actionStatus: row["Action Status"] || "Open",
    completionDate: parseSheetDate(row["Completion Date"]),
    contractor: row.Contractor || "",
    contractorAction: row["Contractor Action"] || "",
    accAction: row["ACC Action"] || "",
    agreedAction: row["Agreed Action"] || "",
    _rowNum: row._rowNum,
  };
}

// Named-field payload for appendAction/updateAction (Action No included).
export function actionToFields(action) {
  return {
    "Action No": action.actionNo,
    "Equipment ID": action.equipmentId,
    "Equipment Name": action.equipmentName,
    Line: action.line,
    "Reading Date": action.readingDate,
    "Trigger Type": action.triggerType,
    "Trigger Point": action.triggerPoint,
    "Trigger Value": action.triggerValue,
    "Machine Status": action.machineStatus,
    "Revision Date": action.revisionDate,
    "Action Status": action.actionStatus,
    "Completion Date": action.completionDate,
    Contractor: action.contractor,
    "Contractor Action": action.contractorAction,
    "ACC Action": action.accAction,
    "Agreed Action": action.agreedAction,
  };
}

// Client for the Google Apps Script webhook that backs this app.
//
// THE BUG THIS FIXES: the original app wrote every change with
// `fetch(url, { mode: "no-cors" })`. That's required because Apps Script Web
// Apps don't send CORS headers on POST responses — but it also means the
// browser is *not allowed to read the response*. The write could fail on the
// server (row not found, a thrown error) and the app would have no way to
// know; it just assumed success. The edit would look saved, then vanish on
// the next sync.
//
// GET requests are different: Apps Script's Web App response for a GET is
// served from a `content.googleusercontent.com` redirect that *does* carry
// permissive CORS headers, so plain `fetch()` reads work fine and are not
// blind.
//
// The fix: every write is followed by a verifying read. If the freshly
// re-fetched row doesn't match what we tried to save, we surface a real
// error instead of pretending it worked.

import {
  rowToAction,
  actionToRow,
  ACTION_HEADERS,
  rowToOilChangeEvent,
  rowToSample,
  sampleToRow,
  sameCalendarDay,
} from "./parsers";

export class SaveVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SaveVerificationError";
  }
}

async function getJSON(webhookUrl, params) {
  const url = new URL(webhookUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  // Apps Script Web App GET responses are served through a
  // content.googleusercontent.com redirect that can cache an identical URL
  // for a short window — a verify-read run right after a write can come
  // back with the pre-write response for that same equipment/action
  // lookup, which then fails write-verification even though the write
  // actually succeeded. A cache-busting param plus cache: "no-store" makes
  // every read (not just verification) hit the live sheet, not a cached one.
  url.searchParams.set("_", Date.now().toString());
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const json = await res.json();
  if (json && json.error) throw new Error(json.error);
  return json;
}

async function postBlind(webhookUrl, body) {
  try {
    await fetch(webhookUrl, { method: "POST", mode: "no-cors", body: JSON.stringify(body) });
  } catch (err) {
    throw new Error(`Network error while saving: ${err.message}`);
  }
}

// dateIndices gets the sameCalendarDay() fallback on a string mismatch —
// scoped to columns we know hold dates. JS's own Date parser reads plenty
// of non-date text as "valid" (e.g. new Date("0-6") or new Date("MOBIL SHC
// 630") both parse without error), so applying that fallback to every
// column would let real mismatches on Ac. No., Oil Type, etc. slip through
// undetected instead of catching a genuinely failed write.
function rowsEqual(a, b, { skipIndices, dateIndices } = {}) {
  const skip = new Set(skipIndices || []);
  const dates = new Set(dateIndices || []);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (skip.has(i)) continue;
    const av = String(a[i] ?? "").trim();
    const bv = String(b[i] ?? "").trim();
    if (av === bv) continue;
    if (dates.has(i) && sameCalendarDay(av, bv)) continue;
    return false;
  }
  return true;
}

// Verification failures otherwise give no clue why — this logs exactly
// which column(s) differed (or that the row wasn't found at all) so a
// mismatch can be diagnosed from the browser console instead of guessed at.
function logVerificationMismatch(label, sentRow, savedRow, headers) {
  if (!savedRow) {
    console.error(`[${label}] verify-read found no matching row at all.`, { sentRow });
    return;
  }
  const len = Math.max(sentRow.length, savedRow.length);
  const diffs = [];
  for (let i = 0; i < len; i++) {
    const sv = String(sentRow[i] ?? "").trim();
    const rv = String(savedRow[i] ?? "").trim();
    if (sv !== rv) diffs.push({ col: i, header: headers?.[i] || `col ${i}`, sent: sv, readBack: rv });
  }
  console.error(`[${label}] verify-read mismatch on ${diffs.length} column(s):`, diffs);
}

// Action Tracker's "Last Modified" column (index 17 — after Closing
// Comment) is stamped by the backend itself on every write, independent of
// whatever we send — so a verification read will always show a fresh value
// there and must not be compared, or every save would spuriously fail
// verification.
const ACTION_LAST_MODIFIED_COL = 17;

// Every date-bearing column in the Action Tracker row — Revision Date,
// Sample Date, Last Change, Completed Date — gets the sameCalendarDay()
// tolerance on verification, since any of them can round-trip through a
// Google Sheets Date-typed cell and come back in a different string form.
const ACTION_DATE_COLS = [4, 5, 8, 12];

// Data_Entry's Sampled Date column.
const SAMPLE_DATE_COL = 3;

// ── Reads ─────────────────────────────────────────────────────────────────

export async function readAll(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "readAll" });
  return {
    samples: (json.samples || []).filter((r) => Array.isArray(r) && r[0]).map(rowToSample),
    actions: (json.actions || []).filter((r) => Array.isArray(r) && r[0]).map(rowToAction),
    // Raw events from "Oil Change LOG" — the "current state per LP" view
    // pages actually consume is derived from these via
    // deriveCurrentOilChanges() (parsers.js), not read directly.
    oilChangeEvents: (json.oilChanges || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilChangeEvent),
    // Raw rows from the "Oil Sample Tracker" sheet, header row included (row
    // 0 = ["Equipment", "Last sample", "interval Days", "INTERVAL", "Jul-22",
    // "Aug-22", ...]). Deliberately not parsed here — see
    // parseTrackerRows() in parsers.js, which needs the header row to know
    // which columns are months.
    trackerRaw: Array.isArray(json.tracker) ? json.tracker : [],
  };
}

export async function getDashboard(webhookUrl) {
  return getJSON(webhookUrl, { action: "getDashboard" });
}

// The Equipment Registry sheet is the authoritative equipment list — it has
// every registered piece of equipment (confirmed ~152 rows against the live
// sheet), independent of whether that equipment has any samples yet. Used
// to build equipment dropdowns instead of deriving them from `samples`,
// which only covers equipment that happens to already have a sample row
// (confirmed ~144 of those, missing several equipment codes that do appear
// in Action Tracker).
export async function getEquipmentRegistry(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "readEquipmentRegistry" });
  return json.equipment || [];
}

// Column order matches the current "Equipment Registry" sheet exactly (see
// backend/oil-lubrication/src/Code.js's readEquipmentRegistry — this is its
// inverse): LP_ID, Equipment_ID, Report Equipment ID, Lubrication_Location,
// Point_Code, Lubrication_Point, Position, Area, Manufacturer, Model,
// Operating_Temperature_C, Lubricant_Type, Lubricant_Brand,
// Lubricant_Quantity_L, Oil_Analysis_Required, Oil_Analysis_Interval,
// Oil_Change_Interval, Contractor, LP_Status, Created_Date, Modified_Date.
// The backend's generic updateRow writes exactly as many columns as it's
// sent, starting from column A — sending every field back (not just the one
// that changed) is what keeps the other 20 columns from being wiped out.
function equipmentRegistryRow(eq) {
  return [
    eq.code || "",
    eq.equipmentId || "",
    eq.reportEquipmentId || "",
    eq.lubricationLocation || "",
    eq.pointCode || "",
    eq.lubricationPoint || "",
    eq.position || "",
    eq.area || "",
    eq.manufacturer || "",
    eq.model || "",
    eq.operatingTempC || "",
    eq.lubricant || "",
    eq.lubricantBrand || "",
    eq.lubricantQuantityL || "",
    eq.oilAnalysisRequired || "",
    eq.interval || "",
    eq.oilChangeInterval || "",
    eq.contractor || "",
    eq.status || "",
    eq.createdDate || "",
    eq.modifiedDate || "",
  ];
}

// Saves one equipment's Equipment Registry fields (used today for editing
// the sampling interval from Settings). The backend's generic updateRow
// replaces the whole row for any sheet other than Oil Change Log, so the
// full row is sent — every field this app already has for the equipment,
// not just the one that changed.
export async function updateEquipmentRegistryEntry(webhookUrl, equipment) {
  const row = equipmentRegistryRow(equipment);
  await postBlind(webhookUrl, {
    action: "updateRow",
    sheet: "Equipment Registry",
    matchCols: [0],
    matchValues: [equipment.code || ""],
    row,
  });

  const verify = await getEquipmentRegistry(webhookUrl);
  const saved = verify.find((r) => r.code === equipment.code);
  if (!saved || String(saved.interval || "").trim() !== String(equipment.interval || "").trim()) {
    throw new SaveVerificationError(`The sampling interval wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

// Keeps the "Oil Sample Tracker" sheet in sync automatically whenever a new
// sample is saved, instead of relying on someone to update it by hand too.
// The backend already has a purpose-built endpoint for this
// (updateSampleTrackerMonthly): it finds or creates this sample's month
// column and writes "<status>|<display date>" into this equipment's row —
// exactly the "STATUS|DATE" format parseTrackerRows() already expects.
// Best-effort: like applyOilChangeSideEffect, a failure here doesn't undo
// the sample save, it's surfaced as a separate toast by the caller.
export async function updateSampleTracker(webhookUrl, { equipmentCode, sampleDate, status }) {
  await postBlind(webhookUrl, { action: "updateSampleTracker", equipmentCode, sampleDate, status });
}

export async function getEquipmentRows(webhookUrl, equipmentCode) {
  return getJSON(webhookUrl, { action: "getEquipment", id: equipmentCode });
}

// The "Action Registry" sheet tab (columns: No, Actions) backs the
// multi-select pickers for Contractor Action / ACC Action. Parsed
// defensively since the exact shape the backend returns for this action
// (plain label strings vs {no, action} objects) hasn't been confirmed.
export async function getActionRegistry(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "readActionRegistry" });
  const raw = json.actions || json.registry || json.items || [];
  return raw
    .map((item) => (typeof item === "string" ? item : item?.action || item?.label || item?.name || ""))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

// Adds one new entry to the Action Registry sheet — reuses the same generic
// "append" write every other sheet in this app uses, on the assumption the
// backend's append handler isn't hardcoded to specific sheet names.
export async function addActionRegistryEntry(webhookUrl, label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return getActionRegistry(webhookUrl);
  const current = await getActionRegistry(webhookUrl);
  const nextNo = current.length + 1;
  await postBlind(webhookUrl, { action: "append", sheet: "Action Registry", row: [nextNo, trimmed], headers: ["No", "Actions"] });
  const verify = await getActionRegistry(webhookUrl);
  if (!verify.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
    throw new SaveVerificationError(`"${trimmed}" wasn't confirmed saved to the Action Registry sheet — please try again.`);
  }
  return verify;
}

// ── Writes (each verified by a follow-up read) ──────────────────────────

export async function saveAction(webhookUrl, action, { isNew }) {
  const row = actionToRow(action);
  if (isNew) {
    await postBlind(webhookUrl, { action: "append", sheet: "Action Tracker", row, headers: ACTION_HEADERS });
  } else {
    const matchCols = action._matchCols || [0, 1];
    const matchValues = action._matchValues || [action.acNo || "", action.equipmentCode || action.unitId || ""];
    await postBlind(webhookUrl, { action: "updateRow", sheet: "Action Tracker", matchCols, matchValues, row });
  }

  const verify = await getEquipmentRows(webhookUrl, action.equipmentCode || action.unitId || "");
  const savedRow = (verify.actions || []).find((r) => String(r[0]).trim() === String(row[0]).trim());
  if (!savedRow || !rowsEqual(savedRow, row, { skipIndices: [ACTION_LAST_MODIFIED_COL], dateIndices: ACTION_DATE_COLS })) {
    logVerificationMismatch("saveAction", row, savedRow, ACTION_HEADERS);
    throw new SaveVerificationError(
      `The action wasn't confirmed saved to the sheet. It may not have written — please check the Action Tracker tab and try again.`
    );
  }
  return rowToAction(savedRow);
}

export async function deleteAction(webhookUrl, action) {
  const matchCols = action._matchCols || [0, 1];
  const matchValues = action._matchValues || [action.acNo || "", action.equipmentCode || action.unitId || ""];
  await postBlind(webhookUrl, { action: "deleteRow", sheet: "Action Tracker", matchCols, matchValues });

  const verify = await getEquipmentRows(webhookUrl, action.equipmentCode || action.unitId || "");
  const stillThere = (verify.actions || []).some((r) => String(r[0]).trim() === String(matchValues[0]).trim());
  if (stillThere) {
    throw new SaveVerificationError(`The action wasn't confirmed deleted from the sheet — please try again.`);
  }
}

// Appends a new event to "Oil Change LOG" — never an update-in-place, since
// a change event is a historical fact. NextDueDate is computed server-side
// (from the point's own Equipment Registry Oil_Change_Interval), not sent
// by the client, so it can't drift from what the registry says the real
// interval is.
export async function logOilChangeEvent(webhookUrl, event) {
  const lpId = event.lpId || "";
  const eventDate = event.eventDate || "";
  const doneBy = event.doneBy || "";
  await postBlind(webhookUrl, {
    action: "logOilChangeEvent",
    lpId,
    eventDate,
    eventType: event.eventType || "Change",
    doneBy,
    conditionNotes: event.conditionNotes || "",
    contractor: event.contractor || "",
  });

  const verify = await getJSON(webhookUrl, { action: "getOilChangesForLp", lpId });
  const events = (verify.events || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilChangeEvent);
  const saved = events.find((ev) => sameCalendarDay(ev.eventDate, eventDate) && (ev.doneBy || "") === doneBy);
  if (!saved) {
    throw new SaveVerificationError(`The oil change wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

export async function saveSample(webhookUrl, sample, headers) {
  const row = sampleToRow(sample);
  await postBlind(webhookUrl, { action: "append", sheet: "Data_Entry", row, headers });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const savedRow = (verify.samples || []).find((r) => String(r[2]).trim() === String(sample.sampleId).trim());
  if (!savedRow) {
    throw new SaveVerificationError(`The sample wasn't confirmed saved to the sheet — please try again.`);
  }
  return rowToSample(savedRow);
}

// NOTE: (equipmentCode, sampleId) — this sample's match key — is not
// guaranteed unique in the live sheet (42 real collisions found during the
// schema audit; the lab reuses sample IDs across different sampling dates
// for the same equipment). updateRow/deleteRow hit whichever matching row
// the sheet lists first, so an edit to a sample sharing its ID with another
// sample for the same equipment can land on the wrong row. Flagging this
// here rather than solving it silently — there's no reliable disambiguator
// available client-side without also matching on sampledDate, which itself
// isn't guaranteed present/unique either.
export async function updateSample(webhookUrl, sample) {
  const row = sampleToRow(sample);
  const matchCols = sample._matchCols || [0, 2];
  const matchValues = sample._matchValues || [sample.unitId || "", sample.sampleId || ""];
  await postBlind(webhookUrl, { action: "updateRow", sheet: "Data_Entry", matchCols, matchValues, row });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const savedRow = (verify.samples || []).find((r) => String(r[2]).trim() === String(matchValues[1]).trim());
  if (!savedRow || !rowsEqual(savedRow, row, { dateIndices: [SAMPLE_DATE_COL] })) {
    logVerificationMismatch("updateSample", row, savedRow);
    throw new SaveVerificationError(`The sample wasn't confirmed saved to the sheet. It may not have written — please try again.`);
  }
  return rowToSample(savedRow);
}

export async function deleteSample(webhookUrl, sample) {
  const matchCols = sample._matchCols || [0, 2];
  const matchValues = sample._matchValues || [sample.unitId || "", sample.sampleId || ""];
  await postBlind(webhookUrl, { action: "deleteRow", sheet: "Data_Entry", matchCols, matchValues });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const stillThere = (verify.samples || []).some((r) => String(r[2]).trim() === String(matchValues[1]).trim());
  if (stillThere) {
    throw new SaveVerificationError(`The sample wasn't confirmed deleted from the sheet — please try again.`);
  }
}

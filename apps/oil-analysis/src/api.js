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
  rowToRoutine,
  rowToRoutineItem,
  rowToOilProduct,
  rowToOilMovement,
} from "./parsers";
import { API_SECRET } from "./config";

export class SaveVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SaveVerificationError";
  }
}

async function getJSON(webhookUrl, params) {
  const url = new URL(webhookUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("secret", API_SECRET);
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
    await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ ...body, secret: API_SECRET }),
    });
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

// Action Tracker's "Last Modified" column (index 18 — after Closing
// Comment) is stamped by the backend itself on every write, independent of
// whatever we send — so a verification read will always show a fresh value
// there and must not be compared, or every save would spuriously fail
// verification.
const ACTION_LAST_MODIFIED_COL = 18;

// Every date-bearing column in the Action Tracker row — Revision Date,
// Sample Date, Last Change, Completed Date — gets the sameCalendarDay()
// tolerance on verification, since any of them can round-trip through a
// Google Sheets Date-typed cell and come back in a different string form.
// (Shifted +1 from the pre-Step-3 indices by the Report Equipment ID
// column insertion — see docs/oil-lubrication-migration-notes.md.)
const ACTION_DATE_COLS = [5, 6, 9, 13];

// Data_Entry's Sampled Date column (shifted from 3 — same insertion).
const SAMPLE_DATE_COL = 4;

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

// Incremental sync (backend's getChanges action, Phase 8 — see Code.js):
// returns only rows whose "Last Modified" column is newer than `since` (an
// ISO timestamp). Cheaper than readAll() once the sheets are large, but it
// can't see row DELETIONS (a removed row has no Last Modified to compare)
// and doesn't cover "Oil Sample Tracker" — callers must still fall back to
// readAll() periodically, per fullSyncRequired below and the App.jsx
// scheduling that mixes in a full sync every few cycles.
export async function getChanges(webhookUrl, since) {
  const json = await getJSON(webhookUrl, { action: "getChanges", since: since || "" });
  return {
    samples: (json.samples || []).filter((r) => Array.isArray(r) && r[0]).map(rowToSample),
    actions: (json.actions || []).filter((r) => Array.isArray(r) && r[0]).map(rowToAction),
    oilChangeEvents: (json.oilChanges || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilChangeEvent),
    serverTime: json.serverTime || null,
    fullSyncRequired: !!json.fullSyncRequired,
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

// The real sheet tab is "OL_ACTION_PHRASES" (columns: No, Actions Phrase) —
// backs the multi-select pickers for Contractor Action / ACC Action. The
// backend previously had no matching readActionRegistry case at all (this
// always silently returned empty) and the write path targeted a sheet name
// ("Action Registry") that doesn't exist — both fixed together, see
// docs/oil-lubrication-migration-notes.md "Option A hardening".
export async function getActionRegistry(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "readActionRegistry" });
  const raw = json.actions || json.registry || json.items || [];
  return raw
    .map((item) => (typeof item === "string" ? item : item?.action || item?.label || item?.name || ""))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

// Adds one new entry to the Action Registry sheet — reuses the same generic
// "append" write every other sheet in this app uses; the backend's append
// handler now allowlists which sheets this path may touch (see Code.js),
// with OL_ACTION_PHRASES included specifically for this.
export async function addActionRegistryEntry(webhookUrl, label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return getActionRegistry(webhookUrl);
  const current = await getActionRegistry(webhookUrl);
  const nextNo = current.length + 1;
  await postBlind(webhookUrl, { action: "append", sheet: "OL_ACTION_PHRASES", row: [nextNo, trimmed], headers: ["No", "Actions Phrase"] });
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
  const savedRow = (verify.samples || []).find((r) => String(r[3]).trim() === String(sample.sampleId).trim());
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
  const matchCols = sample._matchCols || [0, 3];
  const matchValues = sample._matchValues || [sample.unitId || "", sample.sampleId || ""];
  await postBlind(webhookUrl, { action: "updateRow", sheet: "Data_Entry", matchCols, matchValues, row });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const savedRow = (verify.samples || []).find((r) => String(r[3]).trim() === String(matchValues[1]).trim());
  if (!savedRow || !rowsEqual(savedRow, row, { dateIndices: [SAMPLE_DATE_COL] })) {
    logVerificationMismatch("updateSample", row, savedRow);
    throw new SaveVerificationError(`The sample wasn't confirmed saved to the sheet. It may not have written — please try again.`);
  }
  return rowToSample(savedRow);
}

export async function deleteSample(webhookUrl, sample) {
  const matchCols = sample._matchCols || [0, 3];
  const matchValues = sample._matchValues || [sample.unitId || "", sample.sampleId || ""];
  await postBlind(webhookUrl, { action: "deleteRow", sheet: "Data_Entry", matchCols, matchValues });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const stillThere = (verify.samples || []).some((r) => String(r[3]).trim() === String(matchValues[1]).trim());
  if (stillThere) {
    throw new SaveVerificationError(`The sample wasn't confirmed deleted from the sheet — please try again.`);
  }
}

// ── Routines ─────────────────────────────────────────────────────────────
// Not synced as part of readAll() — fetched on demand by the Routines page
// itself, the same way Equipment Registry gets its own separate sync
// rather than riding along with the main sample/action/oil-change sync.

export async function getRoutines(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getRoutines" });
  return (json.routines || []).filter((r) => Array.isArray(r) && r[0]).map(rowToRoutine);
}

export async function getRoutineItems(webhookUrl, routineId) {
  const json = await getJSON(webhookUrl, { action: "getRoutineItems", routineId });
  return (json.items || []).filter((r) => Array.isArray(r) && r[0]).map(rowToRoutineItem);
}

// routineId/each item's routineItemId are generated by the CALLER (see
// newId() in parsers.js) and sent through, not returned by the
// backend — the usual blind-POST constraint (Apps Script Web Apps can't
// send CORS headers on a POST response) means write-verification always
// has to be a follow-up read; a client-supplied id makes that an exact
// lookup instead of guessing "the newest matching routine".
export async function createRoutine(webhookUrl, { routineId, assignedTo, contractor, createdBy, items }) {
  await postBlind(webhookUrl, {
    action: "createRoutine",
    routineId,
    assignedTo,
    contractor: contractor || "",
    createdBy: createdBy || "",
    items,
  });

  const routines = await getRoutines(webhookUrl);
  const saved = routines.find((r) => r.routineId === routineId);
  if (!saved) {
    throw new SaveVerificationError(`The routine wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

export async function submitRoutineItem(webhookUrl, routineId, item) {
  await postBlind(webhookUrl, {
    action: "submitRoutineItem",
    routineItemId: item.routineItemId,
    implemented: !!item.implemented,
    notImplementedReason: item.notImplementedReason || "",
    actualDate: item.actualDate || "",
    actualQuantity: item.actualQuantity || "",
    sampleTaken: !!item.sampleTaken,
  });

  const items = await getRoutineItems(webhookUrl, routineId);
  const saved = items.find((i) => i.routineItemId === item.routineItemId);
  if (!saved || (saved.implemented === "Yes") !== !!item.implemented) {
    throw new SaveVerificationError(`The routine item wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

export async function submitRoutine(webhookUrl, routineId) {
  await postBlind(webhookUrl, { action: "submitRoutine", routineId });

  const routines = await getRoutines(webhookUrl);
  const saved = routines.find((r) => r.routineId === routineId);
  if (!saved || saved.status !== "Submitted") {
    throw new SaveVerificationError(`The routine wasn't confirmed submitted — please try again.`);
  }
  return saved;
}

export async function approveRoutine(webhookUrl, routineId, approvedBy) {
  await postBlind(webhookUrl, { action: "approveRoutine", routineId, approvedBy: approvedBy || "" });

  const routines = await getRoutines(webhookUrl);
  const saved = routines.find((r) => r.routineId === routineId);
  if (!saved || saved.status !== "Approved") {
    throw new SaveVerificationError(`The routine wasn't confirmed approved — please try again.`);
  }
  return saved;
}

export async function addRoutineComment(webhookUrl, routineId, commentText, commentBy) {
  await postBlind(webhookUrl, { action: "addRoutineComment", routineId, commentText, commentBy: commentBy || "" });

  const routines = await getRoutines(webhookUrl);
  const saved = routines.find((r) => r.routineId === routineId);
  if (!saved || saved.accComment !== commentText) {
    throw new SaveVerificationError(`The comment wasn't confirmed saved — please try again.`);
  }
  return saved;
}

// ── Oil Inventory ────────────────────────────────────────────────────────
// Same split as Oil Change LOG (Step 2): "Oil Inventory LOG" is the only
// sheet this app appends to; "Oil Inventory" is read as the product
// registry, but its Current_Stock/Last_Movement_Date columns are sheet
// formulas (see docs/oil-lubrication-migration-notes.md) this app never
// writes to. Not synced with the main Full Sync — fetched on demand by the
// Oil Inventory page, same as Equipment Registry and Routines.

export async function getOilInventory(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getOilInventory" });
  return (json.products || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilProduct);
}

export async function getOilInventoryMovements(webhookUrl, productId) {
  const json = await getJSON(webhookUrl, { action: "getOilInventoryMovements", productId });
  return (json.movements || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilMovement);
}

// productId is client-generated (newId() in parsers.js) for the same
// exact-verification reason as Routines' ids.
export async function addOilProduct(webhookUrl, product) {
  await postBlind(webhookUrl, {
    action: "addOilProduct",
    productId: product.productId,
    lubricantType: product.lubricantType || "",
    lubricantBrand: product.lubricantBrand || "",
    containerType: product.containerType || "",
    containerSizeL: product.containerSizeL || "",
    unit: product.unit || "L",
    recorderLevel: product.recorderLevel || "",
    storageLocation: product.storageLocation || "",
    supplier: product.supplier || "",
    unitCost: product.unitCost || "",
    status: product.status || "Active",
    notes: product.notes || "",
  });

  const products = await getOilInventory(webhookUrl);
  const saved = products.find((p) => p.productId === product.productId);
  if (!saved) {
    throw new SaveVerificationError(`The product wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

export async function updateOilProduct(webhookUrl, product) {
  await postBlind(webhookUrl, {
    action: "updateOilProduct",
    productId: product.productId,
    lubricantType: product.lubricantType || "",
    lubricantBrand: product.lubricantBrand || "",
    containerType: product.containerType || "",
    containerSizeL: product.containerSizeL || "",
    unit: product.unit || "",
    recorderLevel: product.recorderLevel || "",
    storageLocation: product.storageLocation || "",
    supplier: product.supplier || "",
    unitCost: product.unitCost || "",
    status: product.status || "",
    notes: product.notes || "",
  });

  const products = await getOilInventory(webhookUrl);
  const saved = products.find((p) => p.productId === product.productId);
  if (!saved || saved.status !== (product.status || "")) {
    throw new SaveVerificationError(`The product wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

// movementId is client-generated so this can verify by exact id instead of
// guessing "the newest matching movement" — same reasoning as Routines.
export async function logOilMovement(webhookUrl, movement) {
  await postBlind(webhookUrl, {
    action: "logOilMovement",
    productId: movement.productId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    movementDate: movement.movementDate || "",
    linkedLpId: movement.linkedLpId || "",
    linkedEventId: movement.linkedEventId || "",
    contractor: movement.contractor || "",
    doneBy: movement.doneBy || "",
    reference: movement.reference || "",
    notes: movement.notes || "",
  });

  const movements = await getOilInventoryMovements(webhookUrl, movement.productId);
  const saved = movements.find(
    (m) => m.movementType === movement.movementType && Number(m.quantity) === Number(movement.quantity) && (m.doneBy || "") === (movement.doneBy || "")
  );
  if (!saved) {
    throw new SaveVerificationError(`The movement wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

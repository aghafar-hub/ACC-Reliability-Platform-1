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
  ACTION_STATUS,
  ACTION_HEADERS,
  rowToOilChangeEvent,
  rowToTopUpEvent,
  rowToSample,
  sampleToRow,
  sameCalendarDay,
  rowToRoutine,
  rowToRoutineItem,
  ROUTE_STATUS,
  rowToRouteTemplate,
  rowToOilProduct,
  rowToOilMovement,
  rowToAuditEntry,
  newId,
} from "./parsers";
import { API_SECRET } from "./config";

export class SaveVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SaveVerificationError";
  }
}

// Patch 10 (plant-readiness pass): a SPECIFIC kind of verify-read mismatch
// — the backend recognized that this row changed since the edit started
// (see Utils.js's hasConflict_) and skipped the write entirely rather than
// silently overwriting someone else's change. Thrown instead of a plain
// SaveVerificationError whenever the live row's own Last Modified value is
// newer than what this edit started from — see detectConflict() below. A
// distinct class (not just a different message) so a caller that wants to
// react differently — e.g. trigger a resync instead of just retrying the
// same save — can tell the two apart with instanceof.
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}

// Patch 11 (plant-readiness pass): thrown specifically when postBlind's own
// fetch() call rejects — meaning the request never even reached the
// server (no connectivity at all, not a slow/flaky one). Distinct from
// every other failure mode on purpose: a caller that sees THIS exact
// class knows it's safe to queue the write for an automatic retry later
// (see offlineQueue.js), because there is zero chance the write already
// landed server-side. A failure anywhere else in a save function — the
// verify-read afterward, a thrown SaveVerificationError/ConflictError —
// is NOT safe to blindly retry the same way: the write may well have
// already gone through, and resubmitting it could create a duplicate row
// (append has no dedupe). Only ever thrown from postBlind.
export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }
}

// Option B Phase 1 (see docs/oil-lubrication-migration-notes.md): the
// Platform Core session token for whoever is logged into the shell, set
// once by App.jsx's top-level effect from its `session` prop. Module-level
// rather than threaded through every call site, same reasoning as
// API_SECRET's injection below — getJSON/postBlind are plain exports, not
// hooks, so this is the one place that needs to know about it. Stays null
// for a standalone build (no shell session to read), which every request
// below already treats as "nothing to send."
let currentSessionToken = null;

export function setSessionToken(token) {
  currentSessionToken = token || null;
}

// A transport-level failure (bad HTTP status, or a non-JSON body — exactly
// what Apps Script's echo?user_content_key= redirect returns when it 404s)
// — distinct from a real backend error (json.error), which is never
// retried since retrying it wouldn't help.
class RetryableFetchError extends Error {}

// GET_RETRY_ATTEMPTS/DELAY ("solid app" round, see
// docs/oil-lubrication-migration-notes.md): confirmed live via the browser
// Network tab that Google Apps Script Web Apps don't reliably serve
// multiple simultaneous GET requests to the same deployment — the
// exec?action=... -> 302 -> echo?user_content_key=... redirect step can
// 404 under real concurrent load even when this app's OWN requests are
// properly serialized (App.jsx's startup fetches, RoutineDetail.jsx,
// OilProductDetail.jsx), since ~20 real people can still collectively hit
// the same deployment within the same second or two. Retried automatically
// with a short backoff instead of failing the read outright.
const GET_RETRY_ATTEMPTS = 3;
const GET_RETRY_BASE_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJSON(webhookUrl, params) {
  const url = new URL(webhookUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("secret", API_SECRET);
  if (currentSessionToken) url.searchParams.set("sessionToken", currentSessionToken);

  let lastErr;
  for (let attempt = 1; attempt <= GET_RETRY_ATTEMPTS; attempt++) {
    // Apps Script Web App GET responses are served through a
    // content.googleusercontent.com redirect that can cache an identical
    // URL for a short window — a verify-read run right after a write can
    // come back with the pre-write response for that same equipment/action
    // lookup, which then fails write-verification even though the write
    // actually succeeded. A fresh cache-busting param on every attempt
    // (not just every call) plus cache: "no-store" makes every read hit
    // the live sheet, not a cached one — including on a retry.
    url.searchParams.set("_", `${Date.now()}_${attempt}`);
    try {
      let res;
      try {
        res = await fetch(url.toString(), { cache: "no-store" });
      } catch (networkErr) {
        throw new RetryableFetchError(`Network error: ${networkErr.message}`);
      }
      if (!res.ok) throw new RetryableFetchError(`Server returned ${res.status}`);
      let json;
      try {
        json = await res.json();
      } catch {
        throw new RetryableFetchError("Server returned a non-JSON response");
      }
      if (json && json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      lastErr = err;
      if (!(err instanceof RetryableFetchError) || attempt === GET_RETRY_ATTEMPTS) throw err;
      await sleep(GET_RETRY_BASE_DELAY_MS * attempt + Math.random() * 200);
    }
  }
  throw lastErr;
}

// ─── Phase 0: Module Access ─────────────────────────────────────────────────
// When embedded, the platform shell publishes this person's access to every
// module on window.__accModuleAccess (frontend/src/moduleAccess.tsx). A save
// the server would refuse anyway (module in Maintenance, or a view-only
// page) is stopped here with a clear message instead of failing silently —
// these POSTs are blind, so the server's own refusal can't be read back.
// Standalone (no shell) there's nothing published and nothing is stopped.
export class AccessBlockedError extends Error {}

let currentPage = null;
export function setCurrentPage(page) {
  currentPage = page || null;
}

function shellAccess() {
  return typeof window !== "undefined" && window.__accModuleAccess ? window.__accModuleAccess.get("oil-analysis") : undefined;
}

export function isSavingPaused() {
  const a = shellAccess();
  return !!(a && a.enforced && !a.admin && a.status === "Maintenance");
}

function guardWrite(body) {
  const a = shellAccess();
  if (!a || a.admin || !a.enforced) return;
  if (body.action === "markNotificationRead" || body.action === "markAllNotificationsRead") return;
  if (a.status === "Maintenance") throw new AccessBlockedError("Oil Lubrication is being updated — changes can't be saved right now.");
  if (currentPage && a.tabs && a.tabs[currentPage] === "View") {
    throw new AccessBlockedError("This page is view only for you — changes can't be saved.");
  }
}

// Fresh from the server (not the shell's copy, which can be up to two
// minutes old) — used before replaying the offline queue, so queued work
// is never sent into a maintenance window and lost.
export async function getMyAccess(webhookUrl) {
  return getJSON(webhookUrl, { action: "getMyAccess" });
}

// Technicians the App Owner listed for this module (and contractor) in
// Module Access. null from a backend without Phase 0 yet.
export async function getModuleTechnicians(webhookUrl, contractor) {
  const json = await getJSON(webhookUrl, { action: "getModuleTechnicians", contractor: contractor || "" });
  return Array.isArray(json.technicians) ? json.technicians : null;
}

async function postBlind(webhookUrl, body) {
  guardWrite(body);
  try {
    const payload = { ...body, secret: API_SECRET };
    if (currentSessionToken) payload.sessionToken = currentSessionToken;
    await fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new NetworkError(`Network error while saving: ${err.message}`);
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

// Finds the row among `rows` whose values at `matchCols` all equal the
// corresponding `matchValues` — the read-side counterpart to the backend's
// own findRowIndex (Utils.js), needed once a verify-read can no longer
// assume a fixed column position (Patch 6: a sample matched by its
// Sample_UID has matchCols=[39], not the old hardcoded "column 3").
function findRowByMatch(rows, matchCols, matchValues) {
  return (rows || []).find((r) =>
    matchCols.every((col, i) => String(r[col] ?? "").trim() === String(matchValues[i] ?? "").trim())
  );
}

// Patch 10: distinguishes "the write never applied because the backend
// detected a conflict and skipped it" (Utils.js's hasConflict_) from every
// other reason a verify-read might not match what was sent. expectedLast-
// Modified is what THIS edit started from (the lastModified value already
// on the object when the user opened it, not anything new); lastModifiedCol
// is which column of the freshly re-read row to compare it against. No
// expectedLastModified, or no row came back at all (a different, worse
// failure — e.g. the row was deleted), means this isn't a conflict check's
// job to explain — left to the normal SaveVerificationError message.
function detectConflict(expectedLastModified, savedRow, lastModifiedCol) {
  if (!expectedLastModified || !savedRow) return false;
  const live = savedRow[lastModifiedCol];
  if (!live) return false;
  const liveTime = new Date(live).getTime();
  const expectedTime = new Date(expectedLastModified).getTime();
  if (isNaN(liveTime) || isNaN(expectedTime)) return false;
  return liveTime > expectedTime;
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

// Data_Entry's "Last Modified" column — same idea as
// ACTION_LAST_MODIFIED_COL above: stamped by the backend itself on every
// write, independent of what the client sends, so a verification read
// must not compare it. BUG FIX (found while building the Sample_UID
// column below, but real and pre-existing on its own): updateSample's
// verify-read was comparing the FULL row array, Last Modified included —
// the client's row array never had an element there at all (undefined,
// read as "" by rowsEqual), so it was being compared against whatever
// real timestamp the server had just stamped, which can never match.
// Every sample EDIT (not new adds, which verify differently) was very
// likely hitting this and throwing a false "wasn't confirmed saved"
// error. See rowsEqual's skipIndices usage in updateSample below.
const SAMPLE_LAST_MODIFIED_COL = 38;

// Patch 6 (plant-readiness pass): (equipmentCode, sampleId) alone isn't
// guaranteed unique in the live sheet — see updateSample's own comment
// below for the full story. This new trailing column gives every sample
// created from now on a real, client-generated unique id (see saveSample),
// so it can be matched exactly instead of by that ambiguous pair. A
// sample saved before this column existed has no value here and keeps
// using the old (equipmentCode, sampleId) match — exactly as ambiguous as
// it always was, never worse, since there's no way to retroactively
// invent a unique id for historical rows.
const SAMPLE_UID_COL = 39;

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

// PERFORMANCE: one combined request for everything the app needs on first
// load — readAll() + Equipment Registry + Action Registry — instead of the
// three separate sequential requests App.jsx's mount effect used to make
// one after another (see that effect's own comment for why they're
// sequential, not parallel, either way: Apps Script Web Apps don't reliably
// serve simultaneous GETs to the same deployment). Still exactly one
// request under the hood — this only merges three payloads into one
// response, it doesn't change that constraint. Only used for the initial
// mount fetch; periodic background re-sync keeps using readAll()/
// getChanges() on their own, since equipment/action-phrase data changes
// rarely and doesn't need to ride along on every routine poll.
export async function getStartupBundle(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getStartupBundle" });
  return {
    samples: (json.samples || []).filter((r) => Array.isArray(r) && r[0]).map(rowToSample),
    actions: (json.actions || []).filter((r) => Array.isArray(r) && r[0]).map(rowToAction),
    oilChangeEvents: (json.oilChanges || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilChangeEvent),
    trackerRaw: Array.isArray(json.tracker) ? json.tracker : [],
    equipment: json.equipment || [],
    actionPhrases: (json.actionPhrases || []).map((s) => String(s).trim()).filter(Boolean),
  };
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

// Phase 2: action._submit = the Submit button (Draft → Open); Due Date and
// Duration ride along as workflow fields — the server stores them only while
// the action is a Draft (later changes go through rescheduleAction).
function actionWorkflowFields(action) {
  return { submit: !!action._submit, dueDate: action.dueDate || "", duration: action.duration ?? "" };
}

export async function saveAction(webhookUrl, action, { isNew }) {
  const row = actionToRow(action);
  const workflow = actionWorkflowFields(action);
  if (isNew) {
    await postBlind(webhookUrl, { action: "append", sheet: "Action Tracker", row, headers: ACTION_HEADERS, workflow });
  } else {
    const matchCols = action._matchCols || [0, 1];
    const matchValues = action._matchValues || [action.acNo || "", action.equipmentCode || action.unitId || ""];
    // Patch 10: expectedLastModified lets the backend tell "someone else's
    // edit landed since this one started" apart from a normal write — see
    // Utils.js's hasConflict_. Only meaningful on an existing row; a new
    // action has no prior Last Modified to compare against.
    await postBlind(webhookUrl, { action: "updateRow", sheet: "Action Tracker", matchCols, matchValues, row, workflow, expectedLastModified: action.lastModified || "" });
  }

  const verify = await getEquipmentRows(webhookUrl, action.equipmentCode || action.unitId || "");
  const savedRow = (verify.actions || []).find((r) => String(r[0]).trim() === String(row[0]).trim());
  // Phase 2: columns after the app's own 20 belong to the server (closure workflow).
  if (!savedRow || !rowsEqual(savedRow.slice(0, row.length), row, { skipIndices: [ACTION_LAST_MODIFIED_COL], dateIndices: ACTION_DATE_COLS })) {
    if (!isNew && detectConflict(action.lastModified, savedRow, ACTION_LAST_MODIFIED_COL)) {
      throw new ConflictError(`Someone else changed this action while you were editing it. Reload and reapply your changes.`);
    }
    logVerificationMismatch("saveAction", row, savedRow, ACTION_HEADERS);
    throw new SaveVerificationError(
      action._submit
        ? `The action wasn't submitted. Submit needs the Agreed Action, Assigned To, Due Date and Duration, and is done by an ACC Engineer or the contractor's engineer.`
        : `The action wasn't confirmed saved to the sheet. It may not have written — please check the Action Tracker tab and try again.`
    );
  }
  return rowToAction(savedRow);
}

// ── Phase 2: action closure — request → ACC decision → close ────────────
// Blind POSTs like every write here; the verify read is what tells us it
// landed (and, when the server refused, that it didn't).
async function actionWorkflowStep(webhookUrl, action, body, check, failText) {
  const equipmentCode = action.equipmentCode || action.unitId || "";
  await postBlind(webhookUrl, { ...body, acNo: action.acNo, equipmentCode });
  const verify = await getEquipmentRows(webhookUrl, equipmentCode);
  const savedRow = (verify.actions || []).find((r) => String(r[0]).trim() === String(action.acNo).trim());
  const saved = savedRow ? rowToAction(savedRow) : null;
  if (!saved || !check(saved)) throw new SaveVerificationError(failText);
  return saved;
}

export function requestActionClosure(webhookUrl, action, comment) {
  return actionWorkflowStep(
    webhookUrl, action, { action: "requestActionClosure", comment },
    (a) => a.status === ACTION_STATUS.CLOSURE_REQUESTED && a.closureComment === comment,
    "The closure request wasn't confirmed — only this contractor's engineer can request it. Please try again."
  );
}

export function decideActionClosure(webhookUrl, action, decision, note) {
  return actionWorkflowStep(
    webhookUrl, action, { action: "decideActionClosure", decision, note: note || "" },
    (a) => (decision === "Approve" ? a.closureDecision === "Approved" : a.closureDecision === "Rejected" && a.status === ACTION_STATUS.OPEN),
    "The decision wasn't confirmed — only an ACC Engineer can approve or reject a closure. Please try again."
  );
}

export function rescheduleAction(webhookUrl, action, newDueDate, reason) {
  return actionWorkflowStep(
    webhookUrl, action, { action: "rescheduleAction", newDueDate, reason },
    (a) => sameCalendarDay(a.dueDate, newDueDate) && a.rescheduleReason === reason,
    "The new due date wasn't confirmed — only an ACC Engineer or the contractor's engineer can reschedule. Please try again."
  );
}

export function closeAction(webhookUrl, action, closingComment) {
  return actionWorkflowStep(
    webhookUrl, action, { action: "closeAction", closingComment: closingComment || "" },
    (a) => a.status === ACTION_STATUS.CLOSED,
    "The action wasn't confirmed closed — the closure must be approved by ACC first. Please try again."
  );
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
  // Bug-hunt pass: re-checked whether this .find() could match an older
  // pre-existing event instead of the one just written, when the same
  // person logs two changes for the same LP on the same calendar day —
  // it can't. getOilChangesForLp (backend/oil-lubrication/src/
  // OilChanges.js) explicitly reverses its rows before returning
  // ("newest first" — see its own header comment), and this write's own
  // LockService-serialized appendRow call (Code.js wraps every doPost in
  // a script lock) guarantees it physically lands after every row already
  // in the sheet. So the just-written event is always events[0] among any
  // date+doneBy matches here, and .find() already returns it correctly.
  const saved = events.find((ev) => sameCalendarDay(ev.eventDate, eventDate) && (ev.doneBy || "") === doneBy);
  if (!saved) {
    throw new SaveVerificationError(`The oil change wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

// Appends a new event to "Oil Top Up LOG" (Patch 17) — tracked separately
// from Oil Change LOG, same auto-deduction path against Oil Inventory.
// Unlike logOilChangeEvent, quantity is never defaulted server-side — a
// top-up is normally partial, so the caller must supply a real amount.
export async function logOilTopUp(webhookUrl, topUp) {
  const lpId = topUp.lpId || "";
  const eventDate = topUp.eventDate || "";
  const doneBy = topUp.doneBy || "";
  await postBlind(webhookUrl, {
    action: "logOilTopUp",
    lpId,
    eventDate,
    quantityUsed: topUp.quantityUsed,
    reason: topUp.reason || "",
    requestedBy: topUp.requestedBy || "",
    doneBy,
    routineId: topUp.routineId || "",
    remarks: topUp.remarks || "",
    contractor: topUp.contractor || "",
  });

  const verify = await getJSON(webhookUrl, { action: "getTopUpsForLp", lpId });
  const events = (verify.events || []).filter((r) => Array.isArray(r) && r[0]).map(rowToTopUpEvent);
  const saved = events.find((ev) => sameCalendarDay(ev.eventDate, eventDate) && (ev.doneBy || "") === doneBy);
  if (!saved) {
    throw new SaveVerificationError(`The top-up wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

export async function getTopUpsForLp(webhookUrl, lpId) {
  const json = await getJSON(webhookUrl, { action: "getTopUpsForLp", lpId });
  return (json.events || []).filter((r) => Array.isArray(r) && r[0]).map(rowToTopUpEvent);
}

// Every top-up across every LP (Patch 26) — the Dashboard's own
// dashboard-wide source, as opposed to getTopUpsForLp above (one LP).
export async function getAllTopUps(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getAllTopUps" });
  return (json.events || []).filter((r) => Array.isArray(r) && r[0]).map(rowToTopUpEvent);
}

// Full Oil Change LOG history for one LP, newest first — mirrors
// getTopUpsForLp above. Used by logOilChangeEvent's own write-verification
// (inlined there before this existed as a standalone export) and now also
// by Equipment.jsx's single-LP "Oil Changes" tab (originally built as a
// separate Equipment Viewer page/tab — folded back in, see Equipment.jsx).
export async function getOilChangesForLp(webhookUrl, lpId) {
  const json = await getJSON(webhookUrl, { action: "getOilChangesForLp", lpId });
  return (json.events || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilChangeEvent);
}

// Patch 6 (plant-readiness pass): every new sample gets a real, unique
// client-generated id here — the one place every save path (manual add,
// bulk import) funnels through — so it can be matched exactly on every
// future edit/delete instead of by the ambiguous (equipmentCode, sampleId)
// pair described below. newId() (parsers.js) is the same id generator
// Routines/Oil Inventory already use for exactly this reason.
export async function saveSample(webhookUrl, sample, headers) {
  const sampleUid = sample.sampleUid || newId("SMP");
  const row = sampleToRow({ ...sample, sampleUid });
  await postBlind(webhookUrl, { action: "append", sheet: "Data_Entry", row, headers });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const savedRow = findRowByMatch(verify.samples, [SAMPLE_UID_COL], [sampleUid]);
  if (!savedRow) {
    throw new SaveVerificationError(`The sample wasn't confirmed saved to the sheet — please try again.`);
  }
  return rowToSample(savedRow);
}

// NOTE: (equipmentCode, sampleId) — the fallback match key for any sample
// saved before the Sample_UID column existed (see sample._matchCols in
// parsers.js's rowToSample) — is not guaranteed unique in the live sheet
// (42 real collisions found during the schema audit; the lab reuses
// sample IDs across different sampling dates for the same equipment).
// updateRow/deleteRow hit whichever matching row the sheet lists first, so
// editing one of those older, UID-less samples can still land on the
// wrong row if it shares an id with another sample for the same
// equipment. Every sample created after this column existed no longer has
// this problem at all — matched by its own unique id instead.
export async function updateSample(webhookUrl, sample) {
  const row = sampleToRow(sample);
  const matchCols = sample._matchCols || [0, 3];
  const matchValues = sample._matchValues || [sample.unitId || "", sample.sampleId || ""];
  // Patch 10: same conflict signal as saveAction — see its own comment.
  await postBlind(webhookUrl, { action: "updateRow", sheet: "Data_Entry", matchCols, matchValues, row, expectedLastModified: sample.lastModified || "" });

  const verify = await getEquipmentRows(webhookUrl, sample.unitId || "");
  const savedRow = findRowByMatch(verify.samples, matchCols, matchValues);
  // BUG FIX, found while building the above: SAMPLE_LAST_MODIFIED_COL is
  // stamped by the backend itself on every write, independent of what
  // this row array ever contained — comparing it here meant this
  // verification could never pass, since the freshly-stamped real
  // timestamp can never equal what the client sent (nothing, at that
  // position). See SAMPLE_LAST_MODIFIED_COL's own comment above.
  if (!savedRow || !rowsEqual(savedRow, row, { skipIndices: [SAMPLE_LAST_MODIFIED_COL], dateIndices: [SAMPLE_DATE_COL] })) {
    if (detectConflict(sample.lastModified, savedRow, SAMPLE_LAST_MODIFIED_COL)) {
      throw new ConflictError(`Someone else changed this sample while you were editing it. Reload and reapply your changes.`);
    }
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
  const stillThere = !!findRowByMatch(verify.samples, matchCols, matchValues);
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

// Routines tab improvement pass: "opening the routine from table taking
// too much time" — RoutineDetail.jsx used to call getRoutines() (above)
// just to find the one routine it needed, which reads the ENTIRE ROUTINES
// sheet AND joins the entire OA_ROUTINE_ITEMS sheet to compute every
// OTHER routine's own item counts too — all just to display one row. This
// single-routine lookup skips that join entirely (see Routines.js's own
// getRoutine comment). itemsTotal/itemsDone come back 0 from rowToRoutine
// here (this response has no join to source them from) — harmless, since
// RoutineDetail.jsx already computes its own done-count client-side from
// the checklist items it fetches separately.
export async function getRoutine(webhookUrl, routineId) {
  const json = await getJSON(webhookUrl, { action: "getRoutine", routineId });
  if (!json.routine) return null;
  return rowToRoutine(json.routine);
}

// Patch 20: the unified Routines main-view aggregation — recurring
// templates and standalone one-time routines as one list, each already
// computed server-side (equipmentCount/nextDueDate/dueStatus/lastCompleted
// — see RouteTemplates.js's getRoutinesOverview). Returned as plain JSON
// objects already, not raw sheet rows, so no parsers.js row-mapping here.
export async function getRoutinesOverview(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getRoutinesOverview" });
  return json.items || [];
}

// Patch 20d: item-weighted on-time completion rate per month — see
// RouteTemplates.js's getRoutineCompletionTrend. rateByMonth entries are
// null (not 0) for a month with no routines due, so the chart can show
// "no data" instead of a misleading 0% bar.
export async function getRoutineCompletionTrend(webhookUrl, months = 6) {
  const json = await getJSON(webhookUrl, { action: "getRoutineCompletionTrend", months });
  return {
    months: json.months || [],
    rateByMonth: json.rateByMonth || [],
    totalByMonth: json.totalByMonth || [],
    onTimeByMonth: json.onTimeByMonth || [],
  };
}

// Phase 3 — saved Suggestions (open ones), see backend Suggestions.js.
export async function getSuggestions(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getSuggestions" });
  return json.suggestions || [];
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
export async function createRoutine(webhookUrl, { routineId, routeName, routeType, dueDate, duration, assignedTo, contractor, createdBy, items, reason, area }) {
  await postBlind(webhookUrl, {
    action: "createRoutine",
    routineId,
    routeName,
    routeType,
    dueDate: dueDate || "",
    duration: duration || 0,
    assignedTo,
    contractor: contractor || "",
    createdBy: createdBy || "",
    items,
    reason: reason || "", // Patch 18 — required server-side for routeType "Emergency Top Up" only
    area: area || "",
  });

  // getRoutine (not getRoutines — see its own comment) for the verify-read:
  // these writes only ever need to confirm the ONE routine they just
  // touched, not re-fetch every routine in the sheet to find it.
  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved) {
    throw new SaveVerificationError(`The routine wasn't confirmed saved to the sheet — please try again.`);
  }
  return saved;
}

// Only path from "Unassigned" (a recurring-template-generated routine with
// no technician yet) to "Assigned" — see RouteTemplates below.
export async function assignRoutineTechnician(webhookUrl, routineId, assignedTo) {
  await postBlind(webhookUrl, { action: "assignRoutineTechnician", routineId, assignedTo });

  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || saved.status !== ROUTE_STATUS.ASSIGNED) {
    throw new SaveVerificationError(`The assignment wasn't confirmed saved — please try again.`);
  }
  return saved;
}

// Routines tab improvement pass: the one field-edit path a routine never
// had — RouteType and its item list are deliberately NOT editable here
// (see Routines.js's own updateRoutine comment).
// Phase 1: the due date is changed only with rescheduleRoutine (below).
export async function updateRoutine(webhookUrl, routineId, { routeName, assignedTo, duration, area, reason }) {
  await postBlind(webhookUrl, {
    action: "updateRoutine",
    routineId,
    routeName,
    assignedTo,
    duration: duration || 0,
    area: area || "",
    reason: reason || "",
  });

  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || saved.routeName !== routeName || saved.assignedTo !== assignedTo) {
    throw new SaveVerificationError(`The routine edit wasn't confirmed saved — please try again.`);
  }
  return saved;
}

// Pause/Resume/Cancel — status is one of "Paused"/"Cancelled"/"Assigned"
// (the last one resumes a Paused routine). See Routines.js's
// setRoutineStatus for the allowed-transition rules this mirrors.
export async function setRoutineStatus(webhookUrl, routineId, status) {
  await postBlind(webhookUrl, { action: "setRoutineStatus", routineId, status });

  const saved = await getRoutine(webhookUrl, routineId);
  // Resuming a route with no technician puts it back to Draft.
  const expected = status === ROUTE_STATUS.ASSIGNED && saved && !saved.assignedTo ? ROUTE_STATUS.DRAFT : status;
  if (!saved || saved.status !== expected) {
    throw new SaveVerificationError(`The status change wasn't confirmed saved — please try again.`);
  }
  return saved;
}

// Phase 1 — the contractor's engineer moves the due date; the reason, the
// original date and who did it are recorded.
export async function rescheduleRoutine(webhookUrl, routineId, newDueDate, reason) {
  await postBlind(webhookUrl, { action: "rescheduleRoutine", routineId, newDueDate, reason });
  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || !sameCalendarDay(saved.dueDate, newDueDate)) {
    throw new SaveVerificationError(`The new date wasn't confirmed saved — only the contractor's engineer can reschedule. Please try again.`);
  }
  return saved;
}

// Phase 1 — send submitted work back to the technician with a reason.
export async function returnRoutine(webhookUrl, routineId, reason) {
  await postBlind(webhookUrl, { action: "returnRoutine", routineId, reason });
  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || saved.status !== ROUTE_STATUS.IN_PROGRESS || saved.returnReason !== reason) {
    throw new SaveVerificationError(`The return wasn't confirmed saved — please try again.`);
  }
  return saved;
}

// Admin-only hard delete — see Routines.js's own deleteRoutine comment for
// why this is distinct from setRoutineStatus("Cancelled"). Backend
// rejects it outright for anyone without ROLE-ADMIN.
export async function deleteRoutine(webhookUrl, routineId) {
  await postBlind(webhookUrl, { action: "deleteRoutine", routineId });

  const saved = await getRoutine(webhookUrl, routineId);
  if (saved) {
    throw new SaveVerificationError(`The delete wasn't confirmed — please try again.`);
  }
}

// ── Route Templates (recurring Routines) ────────────────────────────────
// Not synced as part of readAll() either — same on-demand pattern as
// Routines above. generateDueRouteInstances (the function that actually
// turns a due template into a real Routine) is intentionally NOT exposed
// here — it only runs via the Apps Script time trigger or a manual Run
// from the script editor (see RouteTemplates.js).

export async function getRouteTemplates(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getRouteTemplates" });
  return (json.templates || []).filter((r) => Array.isArray(r) && r[0]).map(rowToRouteTemplate);
}

export async function createRouteTemplate(webhookUrl, { templateId, routeName, routeType, contractor, area, oilType, frequency, startDate, createdBy }) {
  await postBlind(webhookUrl, {
    action: "createRouteTemplate",
    templateId,
    routeName,
    routeType,
    contractor,
    area: area || "",
    oilType: oilType || "",
    frequency,
    startDate: startDate || "",
    createdBy: createdBy || "",
  });

  const templates = await getRouteTemplates(webhookUrl);
  const saved = templates.find((t) => t.templateId === templateId);
  if (!saved) {
    throw new SaveVerificationError(`The recurring route wasn't confirmed saved — please try again.`);
  }
  return saved;
}

export async function setRouteTemplateStatus(webhookUrl, templateId, status) {
  await postBlind(webhookUrl, { action: "setRouteTemplateStatus", templateId, status });

  const templates = await getRouteTemplates(webhookUrl);
  const saved = templates.find((t) => t.templateId === templateId);
  if (!saved || saved.status !== status) {
    throw new SaveVerificationError(`The status change wasn't confirmed saved — please try again.`);
  }
  return saved;
}

export async function deleteRouteTemplate(webhookUrl, templateId) {
  await postBlind(webhookUrl, { action: "deleteRouteTemplate", templateId });

  const templates = await getRouteTemplates(webhookUrl);
  if (templates.some((t) => t.templateId === templateId)) {
    throw new SaveVerificationError(`The delete wasn't confirmed — please try again.`);
  }
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

  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || (saved.status !== ROUTE_STATUS.WAITING && saved.status !== ROUTE_STATUS.CONFIRMED)) {
    throw new SaveVerificationError(`The routine wasn't confirmed submitted — please try again.`);
  }
  return saved;
}

export async function approveRoutine(webhookUrl, routineId, approvedBy) {
  await postBlind(webhookUrl, { action: "approveRoutine", routineId, approvedBy: approvedBy || "" });

  const saved = await getRoutine(webhookUrl, routineId);
  if (!saved || saved.status !== ROUTE_STATUS.CONFIRMED) {
    throw new SaveVerificationError(`The route wasn't confirmed — only the contractor's engineer can confirm it. Please try again.`);
  }
  return saved;
}

export async function addRoutineComment(webhookUrl, routineId, commentText, commentBy) {
  await postBlind(webhookUrl, { action: "addRoutineComment", routineId, commentText, commentBy: commentBy || "" });

  const saved = await getRoutine(webhookUrl, routineId);
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

// Patch 23: unified ledger across every product, for the Movements tab —
// distinct from getOilInventoryMovements above (one product's own history,
// still used by OilProductDetail).
export async function getAllOilInventoryMovements(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getAllOilInventoryMovements" });
  return (json.movements || []).filter((r) => Array.isArray(r) && r[0]).map(rowToOilMovement);
}

// Patch 21: actual historical monthly usage — see
// backend/oil-lubrication/src/OilInventory.js's getOilInventoryConsumption.
// Already shaped for display, no row-parser needed.
export async function getOilInventoryConsumption(webhookUrl, months = 6) {
  const json = await getJSON(webhookUrl, { action: "getOilInventoryConsumption", months });
  return { months: json.months || [], byProduct: json.byProduct || [], totalsByMonth: json.totalsByMonth || [] };
}

// Projected consumption vs. current stock, per oil (type+brand+contractor),
// over the next `months` — see backend/oil-lubrication/src/OilInventory.js's
// getOilInventoryForecast for the projection logic. Already shaped for
// display (not raw sheet rows), so no row-parser needed here.
export async function getOilInventoryForecast(webhookUrl, months = 3) {
  const json = await getJSON(webhookUrl, { action: "getOilInventoryForecast", months });
  return {
    forecast: json.forecast || [],
    months: json.months || months,
    windowEnd: json.windowEnd || "",
    // Patch 22 — condition-based equipment with no logged history and no
    // open routine to project from; surfaced separately rather than just
    // being absent from `forecast`.
    insufficientHistory: json.insufficientHistory || [],
  };
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
    contractor: product.contractor || "",
    equivalentToType: product.equivalentToType || "",
    equivalentToBrand: product.equivalentToBrand || "",
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
    equivalentToType: product.equivalentToType || "",
    equivalentToBrand: product.equivalentToBrand || "",
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

// ── Audit trail (Patch 9, plant-readiness pass) ─────────────────────────
// Read-only, paginated, newest-first — no verify-on-write dance needed
// since nothing here is ever edited client-side. recordId narrows to one
// equipment/routine/template/product id; omit it for the global feed.
export async function getAuditTrail(webhookUrl, { recordId = "", page = 1, limit = 50 } = {}) {
  const json = await getJSON(webhookUrl, { action: "getAuditTrail", recordId, page, limit });
  return {
    entries: (json.rows || []).filter((r) => Array.isArray(r) && r[0]).map(rowToAuditEntry),
    page: json.page || page,
    limit: json.limit || limit,
    total: json.total || 0,
    totalPages: json.totalPages || 1,
  };
}

// ── Notification settings (Patch 14, plant-readiness pass) ──────────────
// Admin-only to change (the backend's updateNotificationSettings action
// requires ROLE-ADMIN — see requireAdmin_ in Rbac.js), but readable by
// anyone, same as every other GET in this app. No verify-on-write dance:
// updateNotificationSettings reads straight back from the same Script
// Properties it just wrote, so a mismatch here would mean the write
// itself failed, not a sheet-propagation race.
export async function getNotificationSettings(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getNotificationSettings" });
  return {
    enabled: json.enabled !== false,
    fromEmail: json.fromEmail || "",
    fromName: json.fromName || "",
  };
}

export async function updateNotificationSettings(webhookUrl, settings) {
  await postBlind(webhookUrl, {
    action: "updateNotificationSettings",
    enabled: !!settings.enabled,
    fromEmail: (settings.fromEmail || "").trim(),
    fromName: (settings.fromName || "").trim(),
  });

  const verify = await getNotificationSettings(webhookUrl);
  if (verify.enabled !== !!settings.enabled || verify.fromEmail !== (settings.fromEmail || "").trim()) {
    throw new SaveVerificationError(`Notification settings weren't confirmed saved — please try again.`);
  }
  return verify;
}

// Who's assigned as Contractor Engineer (per contractor) for the monthly
// sample-overdue digest (SampleOverdue.js) to notify — see
// ModuleResponsibilities.js's own comment for why this is stored in Oil
// Lubrication's own sheet rather than Platform Core's. Readable by
// anyone; writable only by App Admins (setModuleResponsibility is
// requireAdmin_-gated server-side, same as updateNotificationSettings).
export async function getModuleResponsibilities(webhookUrl) {
  const json = await getJSON(webhookUrl, { action: "getModuleResponsibilities" });
  return Array.isArray(json.responsibilities) ? json.responsibilities : [];
}

export async function setModuleResponsibility(webhookUrl, data) {
  await postBlind(webhookUrl, {
    action: "setModuleResponsibility",
    module: data.module || "Oil Lubrication",
    contractor: data.contractor || "",
    role: data.role || "",
    email: data.email || "",
    displayName: data.displayName || "",
  });
  return getModuleResponsibilities(webhookUrl);
}

// ── Platform Core (real account lookups) ────────────────────────────────
// A different backend from everything above (its own Apps Script Web App,
// its own URL — see SessionContext.jsx's usePlatformCoreUrl) and its own
// envelope shape: POST { action, sessionToken, ...} -> { ok: true, data } |
// { ok: false, error: { message, correlationId } } (see
// frontend/src/api/client.ts's matching doc comment — same backend, same
// contract, this is just a second client for it from inside this app).
// text/plain avoids a CORS preflight against the Apps Script Web App, which
// doesn't handle OPTIONS — the body is still JSON underneath.
//
// Used so "Assign Technician" can be a picker of real accounts instead of
// free text (see NewRoutine.jsx / RoutineDetail.jsx) — a typo there used to
// mean the routine silently never showed up for the right person's My Work
// list, since matching is by exact email.
export async function listOrgUsers(platformCoreUrl, sessionToken) {
  if (!platformCoreUrl || !sessionToken) return [];
  let res;
  try {
    res = await fetch(platformCoreUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "listOrgUsers", sessionToken }),
    });
  } catch (err) {
    throw new Error(`Could not reach the account directory: ${err.message}`);
  }
  let envelope;
  try {
    envelope = await res.json();
  } catch {
    throw new Error("The account directory returned an unexpected response.");
  }
  if (!envelope.ok) {
    throw new Error(envelope.error?.message || "Could not load the account directory.");
  }
  return envelope.data || [];
}

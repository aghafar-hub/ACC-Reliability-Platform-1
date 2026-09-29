// Oil Change LOG: logging change events and reading a lubrication point's
// change history. Split out of the old monolithic Code.js (see
// docs/oil-lubrication-migration-notes.md).



// ─── Oil Change LOG — append-only event write (Step 2) ──────────────────
//
// The sole read/write path for oil-change history. Every save is a NEW
// row — nothing here is ever edited in place, since a change event is a
// historical fact, not mutable "current state" (that's what the old
// "Oil Change Log" sheet used to be; it no longer exists — see the header
// comment). "Oil Last Change" is a separate, formula-only viewer sheet this
// backend deliberately never reads or writes.
//
// NextDueDate is computed HERE, server-side, from the lubrication point's
// own Oil_Change_Interval (Equipment Registry column Q) — never trusted
// from the client — so it can't drift from what the registry says the
// real interval is.
function logOilChangeEvent(ss, data) {
  var lpId = String(data.lpId || "").trim();
  if (!lpId) return { error: "lpId is required" };

  var eventDate = data.eventDate ? new Date(data.eventDate) : new Date();
  if (isNaN(eventDate.getTime())) return { error: "eventDate is invalid" };

  var reg = findRegistryEntryForOilChange_(ss, lpId);
  var months = intervalMonthsForOilChange_(reg ? reg.oilChangeInterval : "");
  var nextDueDate = months ? addMonths_(eventDate, months) : "";

  var eventId = "EVT-" + Utilities.getUuid();
  var row = [
    eventId,
    lpId,
    data.routineItemId || "",
    data.eventType || "Change",
    eventDate,
    data.quantityUsed || (reg ? reg.lubricantQuantityL : "") || "",
    data.oilBrandType || (reg ? oilBrandTypeFor_(reg) : "") || "",
    data.doneBy || "",
    data.contractor || (reg ? reg.contractor : "") || "",
    data.conditionNotes || "",
    data.photoUrl || "",
    nextDueDate,
    "", // Created_Date — filled by appendRow's own stampLastModified, same as every other tracked sheet
  ];
  appendRow(ss, "Oil Change LOG", row);
  return { status: "ok", eventId: eventId, nextDueDate: nextDueDate instanceof Date ? nextDueDate.toISOString() : nextDueDate };
}


function oilBrandTypeFor_(reg) {
  return reg.lubricantBrand ? (reg.lubricant + " / " + reg.lubricantBrand) : reg.lubricant;
}


// Minimal Equipment Registry lookup by LP_ID — scoped to just the fields
// logOilChangeEvent needs, not the full readEquipmentRegistry() shape.
function findRegistryEntryForOilChange_(ss, lpId) {
  var sheet = ss.getSheetByName("Equipment Registry");
  if (!sheet) return null;
  var vals = sheet.getDataRange().getValues();
  for (var i = 2; i < vals.length; i++) {
    if (String(vals[i][0] || "").trim() === lpId) {
      return {
        lubricant:          String(vals[i][11] || "").trim(),
        lubricantBrand:     String(vals[i][12] || "").trim(),
        lubricantQuantityL: String(vals[i][13] || "").trim(),
        oilChangeInterval:  String(vals[i][16] || "").trim(),
        contractor:         String(vals[i][17] || "").trim(),
      };
    }
  }
  return null;
}


// Mirrors the frontend's own intervalMonths() in parsers.js — keep both in
// sync if Oil_Change_Interval's text format ever changes. Handles "2 Y" /
// "0.5 Y" (the real format) and blank/"As needed" (no fixed interval, so no
// NextDueDate is set).
function intervalMonthsForOilChange_(freqText) {
  var t = String(freqText || "").trim().toLowerCase();
  if (!t || t === "as needed" || t === "if needed") return null;
  var m = t.match(/^([\d.]+)\s*y$/);
  if (m) return Math.round(parseFloat(m[1]) * 12);
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}


function addMonths_(date, months) {
  var d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}


// All Oil Change LOG events for one LP_ID, newest first — backs both the
// write-verification read in api.js and an eventual per-point history view.
function getOilChangesForLp(lpId) {
  var id = String(lpId || "").trim();
  if (!id) return { events: [] };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = readSheet(ss, "Oil Change LOG", true).filter(function(r) {
    return String(r[1] || "").trim() === id;
  });
  return { events: rows.slice().reverse(), count: rows.length };
}

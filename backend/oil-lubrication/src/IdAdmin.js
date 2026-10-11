// ─── App Owner: change, add and delete Equipment IDs and Lub IDs ─────────────
// Called from the platform's Settings → Equipment & IDs (action "idAdmin").
// A changed ID takes its history with it: every tab below that names it is
// rewritten. A deleted ID goes with all its history (samples, actions, oil
// changes, top ups, route items, suggestions); stock movements only lose the
// link. Logged in the Audit Log.
//
// ops:
//   renameEquipment { from, to }  — the machine's Lub IDs that carry its ID
//                                   ("LP-111.AF040-GB-R") are renamed too
//   deleteEquipment { id }        — with all its Lub IDs
//   renameLub { from, to } · deleteLub { id }
//   getLub { id } · saveLub { mode: "add" | "edit", item }

var IDA_LUB_FIELDS = ["lpId", "equipmentId", "reportEquipmentId", "lubricationLocation", "pointCode", "lubricationPoint", "position",
  "area", "manufacturer", "model", "operatingTempC", "lubricant", "lubricantBrand", "lubricantQuantityL", "oilAnalysisRequired",
  "interval", "oilChangeInterval", "contractor", "status"];
var IDA_REG = "Equipment Registry";
var IDA_REG_FIRST = 3; // row 1 title, row 2 headers

function idaSpec_() {
  return [
    { sheet: IDA_REG, col: 1, kind: "lp" },
    { sheet: IDA_REG, col: 2, kind: "eq" },
    { sheet: "Data_Entry", col: 1, kind: "lp" },
    { sheet: "Action Tracker", col: 2, kind: "lp" },
    { sheet: "Oil Change LOG", col: 2, kind: "lp" },
    { sheet: "Oil Top Up LOG", col: 2, kind: "lp" },
    { sheet: "OA_ROUTINE_ITEMS", col: 3, kind: "lp" },
    { sheet: "OL_SUGGESTIONS", col: 2, kind: "lp" },
    { sheet: "Oil Inventory LOG", col: 6, kind: "lp", onDelete: "blank" },
    { sheet: "Oil Sample Tracker", col: 1, kind: "lp" },
    { sheet: "OL_NOTIFY_SENT", header: "Key", embed: true },
  ];
}

function handleIdAdmin(data, user) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var op = String(data.op || "");
  var lubs = idaRegisterIds_(ss, IDA_REG, IDA_REG_FIRST, 1, 2);
  var hasLub = function (id) { return lubs.some(function (l) { return idaKey_(l.id) === idaKey_(id); }); };
  var plan, record, summary;

  if (op === "getLub") {
    var g = lubs.filter(function (l) { return idaKey_(l.id) === idaKey_(data.id); })[0];
    if (!g) return { status: "error", error: data.id + " is not in the Equipment Registry." };
    var row = ss.getSheetByName(IDA_REG).getRange(g.row, 1, 1, IDA_LUB_FIELDS.length).getValues()[0];
    var item = {};
    IDA_LUB_FIELDS.forEach(function (f, i) { item[f] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] == null ? "" : row[i]); });
    return { status: "ok", item: item };
  }
  if (op === "saveLub") return idaSaveLub_(ss, data, user, lubs);

  if (op === "renameEquipment" || op === "deleteEquipment") {
    var eq = String(op === "renameEquipment" ? data.from : data.id || "").trim();
    if (!eq) return { status: "error", error: "Equipment ID is required." };
    if (op === "renameEquipment") {
      var to = String(data.to || "").trim();
      if (!to || idaKey_(to) === idaKey_(eq)) return { status: "error", error: "Give the new Equipment ID." };
      plan = idaRenamePlan_("eq", eq, to);
      plan.renames.lp = {};
      var re = idaTokenRe_(eq);
      var clash = "";
      lubs.forEach(function (l) {
        var n = l.id.replace(re, function (m, pre) { return pre + to; });
        if (n === l.id) return;
        if (hasLub(n)) clash = n;
        plan.renames.lp[idaKey_(l.id)] = { from: l.id, to: n };
      });
      if (clash) return { status: "error", error: clash + " already exists — change or delete it first." };
      record = eq + " → " + to;
    } else {
      plan = { renames: {}, deletes: { eq: {}, lp: {} } };
      plan.deletes.eq[idaKey_(eq)] = true;
      lubs.forEach(function (l) { if (idaKey_(l.eq) === idaKey_(eq)) plan.deletes.lp[idaKey_(l.id)] = true; });
      record = eq;
    }
  } else if (op === "renameLub") {
    var from = String(data.from || "").trim(), to2 = String(data.to || "").trim();
    if (!hasLub(from)) return { status: "error", error: from + " is not in the Equipment Registry." };
    if (!to2) return { status: "error", error: "Give the new Lub ID." };
    if (idaKey_(to2) !== idaKey_(from) && hasLub(to2)) return { status: "error", error: to2 + " already exists." };
    plan = idaRenamePlan_("lp", from, to2);
    record = from + " → " + to2;
  } else if (op === "deleteLub") {
    if (!hasLub(data.id)) return { status: "error", error: data.id + " is not in the Equipment Registry." };
    plan = { renames: {}, deletes: { lp: {} } };
    plan.deletes.lp[idaKey_(data.id)] = true;
    record = String(data.id);
  } else {
    return { status: "error", error: "Unknown change: " + op };
  }
  var res = idaApply_(ss, plan);
  idaDone_();
  summary = idaSummary_(res);
  recordAudit_(ss, IDA_REG, record, { renameEquipment: "Equipment ID changed", deleteEquipment: "Equipment ID deleted",
    renameLub: "Lub ID changed", deleteLub: "Lub ID deleted" }[op], user, "", summary);
  return { status: "ok", op: op, result: res, summary: summary };
}

function idaSaveLub_(ss, data, user, lubs) {
  var mode = data.mode === "add" ? "add" : "edit";
  var item = data.item || {};
  var id = String(item.lpId || "").trim();
  if (!id) return { status: "error", error: "Lub ID is required." };
  var eq = String(item.equipmentId || "").trim();
  var problem = peEquipmentIdProblem_(eq);
  if (problem) return { status: "error", error: problem };
  var found = lubs.filter(function (l) { return idaKey_(l.id) === idaKey_(id); })[0];
  if (mode === "add" && found) return { status: "error", error: id + " already exists." };
  if (mode === "edit" && !found) return { status: "error", error: id + " is not in the Equipment Registry." };
  var sheet = ss.getSheetByName(IDA_REG);
  if (!sheet) return { status: "error", error: "Sheet 'Equipment Registry' not found" };
  var p = pePlatform_(eq);
  var now = new Date();
  var row = mode === "edit" ? sheet.getRange(found.row, 1, 1, 21).getValues()[0] : [];
  IDA_LUB_FIELDS.forEach(function (f, i) {
    if (mode === "add" || Object.prototype.hasOwnProperty.call(item, f)) row[i] = item[f] == null ? "" : String(item[f]).trim();
  });
  row[0] = mode === "edit" ? found.id : id;
  row[17] = (p && p.contractor) || row[17] || "";
  row[18] = row[18] || "Active";
  if (mode === "add") row[19] = now;
  row[20] = now;
  for (var i = 0; i < 21; i++) if (row[i] === undefined) row[i] = "";
  if (mode === "add") sheet.appendRow(row);
  else sheet.getRange(found.row, 1, 1, 21).setValues([row]);
  idaDone_();
  recordAudit_(ss, IDA_REG, row[0], mode === "add" ? "Lub ID added" : "Lub ID edited", user, row[17], eq);
  return { status: "ok", op: "saveLub", mode: mode, id: row[0] };
}

function idaDone_() {
  try { invalidateLpContractorMap_(); } catch (e) {}
  try { peForget_(); CacheService.getScriptCache().remove("pe|check"); } catch (e) {}
}

function idaSummary_(res) {
  return Object.keys(res.sheets).map(function (k) { return k + ": " + res.sheets[k]; }).join(", ") || "nothing to change";
}

// ─── The engine (same in Oil and Vibration) ─────────────────────────────────

function idaKey_(id) {
  return String(id == null ? "" : id).replace(/\s+/g, "").toUpperCase();
}

// "111.AF040" inside "LP-111.AF040-GB-R" / "IV|111.AF040|2026-10-01": not
// when it is only part of a longer ID ("111.AF0401").
function idaTokenRe_(id) {
  var esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z0-9.])" + esc + "(?=$|[^A-Za-z0-9])", "g");
}

// Each spec entry → { sheet, col (1-based), kind, embed, onDelete } for the
// tabs that exist. A header is looked for in the first 6 rows.
function idaColumns_(ss) {
  var out = [];
  idaSpec_().forEach(function (s) {
    var sheet = ss.getSheetByName(s.sheet);
    if (!sheet || sheet.getLastRow() < 1) return;
    var col = s.col;
    if (s.header) {
      var top = sheet.getRange(1, 1, Math.min(6, sheet.getLastRow()), sheet.getLastColumn()).getValues();
      col = 0;
      for (var r = 0; r < top.length && !col; r++) {
        for (var c = 0; c < top[r].length; c++) {
          if (String(top[r][c]).trim() === s.header) { col = c + 1; break; }
        }
      }
      if (!col) return;
    }
    out.push({ sheet: sheet, name: s.sheet, col: col, kind: s.kind, embed: !!s.embed, onDelete: s.onDelete || "row" });
  });
  return out;
}

// plan: { renames: { eq|lp|vib: { OLDKEY: "NEW" } }, deletes: { eq|lp|vib: { KEY: true } } }
// Renames every exact cell (and the IDs inside embedded keys); deletes the
// rows that name a deleted ID (or blanks the cell where onDelete is "blank").
// Returns { changed, deleted, blanked, sheets: { name: n } }.
function idaApply_(ss, plan) {
  var renames = plan.renames || {}, deletes = plan.deletes || {};
  var tokenRes = [];
  ["eq", "lp", "vib"].forEach(function (k) {
    Object.keys(renames[k] || {}).forEach(function (old) {
      tokenRes.push({ re: idaTokenRe_(renames[k][old].from), to: renames[k][old].to });
    });
  });
  var res = { changed: 0, deleted: 0, blanked: 0, sheets: {} };
  var rowsToDelete = {}; // sheet name -> { row: true }
  var sheetsByName = {};
  idaColumns_(ss).forEach(function (c) {
    var last = c.sheet.getLastRow();
    if (last < 1) return;
    var range = c.sheet.getRange(1, c.col, last, 1);
    var vals = range.getValues();
    var changed = [];
    for (var r = 0; r < vals.length; r++) {
      var v = vals[r][0];
      if (v === "" || v === null) continue;
      if (c.embed) {
        var s = String(v), t = s;
        tokenRes.forEach(function (x) { t = t.replace(x.re, function (m, pre) { return pre + x.to; }); });
        if (t !== s) { vals[r][0] = t; changed.push(r); }
        continue;
      }
      var key = idaKey_(v);
      if (deletes[c.kind] && deletes[c.kind][key]) {
        if (c.onDelete === "row") {
          (rowsToDelete[c.name] = rowsToDelete[c.name] || {})[r + 1] = true;
          sheetsByName[c.name] = c.sheet;
        } else if (c.onDelete === "blank") {
          vals[r][0] = ""; changed.push(r); res.blanked++;
        }
        continue;
      }
      var ren = renames[c.kind] && renames[c.kind][key];
      if (ren) { vals[r][0] = ren.to; changed.push(r); }
    }
    if (!changed.length) return;
    var formulas = range.getFormulas();
    var hasFormula = formulas.some(function (f) { return f[0]; });
    if (hasFormula) {
      changed.forEach(function (r) { c.sheet.getRange(r + 1, c.col).setValue(vals[r][0]); });
    } else {
      range.setValues(vals);
    }
    res.changed += changed.length;
    res.sheets[c.name] = (res.sheets[c.name] || 0) + changed.length;
  });
  // rows: bottom up, one call per run of neighbouring rows
  Object.keys(rowsToDelete).forEach(function (name) {
    var rows = Object.keys(rowsToDelete[name]).map(Number).sort(function (a, b) { return b - a; });
    var sheet = sheetsByName[name];
    var i = 0;
    while (i < rows.length) {
      var end = rows[i], start = end;
      while (i + 1 < rows.length && rows[i + 1] === start - 1) { start--; i++; }
      sheet.deleteRows(start, end - start + 1);
      i++;
    }
    res.deleted += rows.length;
    res.sheets[name] = (res.sheets[name] || 0) + rows.length;
  });
  return res;
}

// Every ID in the register's column `idCol` whose machine (column `eqCol`)
// is `eqKey` (deleteEquipment), or that carries the machine ID inside it
// (renameEquipment: "LP-111.AF040-GB-R" → "LP-111.AF061-GB-R").
function idaRegisterIds_(ss, sheetName, firstDataRow, idCol, eqCol) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < firstDataRow) return [];
  var vals = sheet.getRange(firstDataRow, 1, sheet.getLastRow() - firstDataRow + 1, Math.max(idCol, eqCol)).getValues();
  var out = [];
  vals.forEach(function (row, i) {
    var id = String(row[idCol - 1] || "").trim();
    if (id) out.push({ id: id, eq: String(row[eqCol - 1] || "").trim(), row: firstDataRow + i });
  });
  return out;
}

function idaRenamePlan_(kind, from, to) {
  var p = { renames: {}, deletes: {} };
  p.renames[kind] = {};
  p.renames[kind][idaKey_(from)] = { from: String(from).trim(), to: String(to).trim() };
  return p;
}

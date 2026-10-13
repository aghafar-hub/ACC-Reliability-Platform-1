// ─── Admin: change, add and delete Equipment IDs and Vib IDs ─────────────
// Called from the platform's Settings → Equipment & IDs (action "idAdmin").
// A changed ID takes its history with it: every tab below that names it is
// rewritten. A deleted ID goes with all its history (readings, report
// entries, limits, actions, route points, suggestions). Logged in the
// Vibration Audit.
//
// ops:
//   renameEquipment { from, to }  — the machine's Vib IDs that carry its ID
//                                   ("Vb-111.AF060-MDE-RMS") are renamed too
//   deleteEquipment { id }        — with all its Vib IDs
//   renameVib { from, to } · deleteVib { id }
//   getVib { id } · saveVib { mode: "add" | "edit", item }

var IDA_VIB_FIELDS = ["vibId", "equipmentId", "positionCode", "family", "description", "readingColumns", "contractor", "status", "area"];

function idaSpec_() {
  return [
    { sheet: SHEET_VIB_REGISTRY, col: 1, kind: "vib" },
    { sheet: SHEET_VIB_REGISTRY, col: 2, kind: "eq" },
    { sheet: SHEET_RMS_REG, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_SPM_REG, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_RMS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_SPM, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_RMS, header: "VIB ID", kind: "vib" },
    { sheet: SHEET_SPM, header: "VIB ID", kind: "vib" },
    { sheet: SHEET_LAST_RMS, col: 1, kind: "eq" },
    { sheet: SHEET_LAST_SPM, col: 1, kind: "eq" },
    { sheet: SHEET_COMPLIANCE, col: 3, kind: "eq" },
    { sheet: SHEET_ACTIONS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VENTRIES, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VENTRIES, header: "VIB ID", kind: "vib" },
    { sheet: SHEET_VCOVER, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VRECS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VLIMITS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VLIMITS, header: "VIB ID", kind: "vib" },
    { sheet: SHEET_VHIST, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VACTIONS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VFINDINGS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VRPOINTS, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VRPOINTS, header: "VIB ID", kind: "vib" },
    { sheet: SHEET_VRSUGG, header: "Equipment ID", kind: "eq" },
    { sheet: SHEET_VRSUGG, header: "Key", embed: true },
    { sheet: SHEET_VROUTES, header: "Source suggestions", embed: true },
  ];
}

function handleIdAdmin(params, session) {
  var who = session ? session.email : "";
  return vlLocked_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var op = String(params.op || "");
    var first = dataStartRowFor(SHEET_VIB_REGISTRY);
    var vibs = idaRegisterIds_(ss, SHEET_VIB_REGISTRY, first, 1, 2);
    var hasVib = function (id) { return vibs.some(function (v) { return idaKey_(v.id) === idaKey_(id); }); };
    var plan, record;

    if (op === "getVib") {
      var g = vibs.filter(function (v) { return idaKey_(v.id) === idaKey_(params.id); })[0];
      if (!g) return { status: "error", error: params.id + " is not in the VIB ID Registry." };
      var row = ss.getSheetByName(SHEET_VIB_REGISTRY).getRange(g.row, 1, 1, IDA_VIB_FIELDS.length).getValues()[0];
      var item = {};
      IDA_VIB_FIELDS.forEach(function (f, i) { item[f] = String(row[i] == null ? "" : row[i]); });
      return { status: "ok", item: item };
    }
    if (op === "saveVib") return idaSaveVib_(ss, params, who, vibs, first);

    if (op === "renameEquipment" || op === "deleteEquipment") {
      var eq = String(op === "renameEquipment" ? params.from : params.id || "").trim();
      if (!eq) return { status: "error", error: "Equipment ID is required." };
      if (op === "renameEquipment") {
        var to = String(params.to || "").trim();
        if (!to || idaKey_(to) === idaKey_(eq)) return { status: "error", error: "Give the new Equipment ID." };
        plan = idaRenamePlan_("eq", eq, to);
        plan.renames.vib = {};
        var re = idaTokenRe_(eq);
        var clash = "";
        vibs.forEach(function (v) {
          var n = v.id.replace(re, function (m, pre) { return pre + to; });
          if (n === v.id) return;
          if (hasVib(n)) clash = n;
          plan.renames.vib[idaKey_(v.id)] = { from: v.id, to: n };
        });
        if (clash) return { status: "error", error: clash + " already exists — change or delete it first." };
        record = eq + " → " + to;
      } else {
        plan = { renames: {}, deletes: { eq: {}, vib: {} } };
        plan.deletes.eq[idaKey_(eq)] = true;
        vibs.forEach(function (v) { if (idaKey_(v.eq) === idaKey_(eq)) plan.deletes.vib[idaKey_(v.id)] = true; });
        record = eq;
      }
    } else if (op === "renameVib") {
      var from = String(params.from || "").trim(), to2 = String(params.to || "").trim();
      if (!hasVib(from)) return { status: "error", error: from + " is not in the VIB ID Registry." };
      if (!to2) return { status: "error", error: "Give the new Vib ID." };
      if (idaKey_(to2) !== idaKey_(from) && hasVib(to2)) return { status: "error", error: to2 + " already exists." };
      plan = idaRenamePlan_("vib", from, to2);
      record = from + " → " + to2;
    } else if (op === "deleteVib") {
      if (!hasVib(params.id)) return { status: "error", error: params.id + " is not in the VIB ID Registry." };
      plan = { renames: {}, deletes: { vib: {} } };
      plan.deletes.vib[idaKey_(params.id)] = true;
      record = String(params.id);
    } else {
      return { status: "error", error: "Unknown change: " + op };
    }
    var res = idaApply_(ss, plan);
    idaDone_();
    var summary = idaSummary_(res);
    vlAudit_(ss, who, { renameEquipment: "Equipment ID changed", deleteEquipment: "Equipment ID deleted",
      renameVib: "Vib ID changed", deleteVib: "Vib ID deleted" }[op], record, summary);
    return { status: "ok", op: op, result: res, summary: summary };
  });
}

function idaSaveVib_(ss, params, who, vibs, first) {
  var mode = params.mode === "add" ? "add" : "edit";
  var item = params.item || {};
  if (typeof item === "string") { try { item = JSON.parse(item); } catch (e) { item = {}; } }
  var id = String(item.vibId || "").trim();
  if (!id) return { status: "error", error: "Vib ID is required." };
  var eq = String(item.equipmentId || "").trim();
  var problem = peEquipmentIdProblem_(eq);
  if (problem) return { status: "error", error: problem };
  var found = vibs.filter(function (v) { return idaKey_(v.id) === idaKey_(id); })[0];
  if (mode === "add" && found) return { status: "error", error: id + " already exists." };
  if (mode === "edit" && !found) return { status: "error", error: id + " is not in the VIB ID Registry." };
  var sheet = ss.getSheetByName(SHEET_VIB_REGISTRY);
  if (!sheet) return { status: "error", error: "Sheet 'VIB ID Registry' not found" };
  var n = IDA_VIB_FIELDS.length;
  var row = mode === "edit" ? sheet.getRange(found.row, 1, 1, n).getValues()[0] : [];
  IDA_VIB_FIELDS.forEach(function (f, i) {
    if (mode === "add" || Object.prototype.hasOwnProperty.call(item, f)) row[i] = item[f] == null ? "" : String(item[f]).trim();
  });
  row[0] = mode === "edit" ? found.id : id;
  var p = pePlatform_(eq);
  row[6] = (p && p.contractor) || row[6] || "";
  row[7] = row[7] || "Active";
  for (var i = 0; i < n; i++) if (row[i] === undefined) row[i] = "";
  if (mode === "add") sheet.appendRow(row);
  else sheet.getRange(found.row, 1, 1, n).setValues([row]);
  idaDone_();
  vlAudit_(ss, who, mode === "add" ? "Vib ID added" : "Vib ID edited", row[0], eq);
  return { status: "ok", op: "saveVib", mode: mode, id: row[0] };
}

function idaDone_() {
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

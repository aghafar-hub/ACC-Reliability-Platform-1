/**
 * Asset Master — the platform's equipment list (Foundation spec §7).
 *
 * Ownership (agreed with the App Owner):
 *   Equipment ID — owned here (EQUIPMENT_MASTER). Created, edited and retired
 *                  only by the App Admin, from Settings → Equipment & IDs.
 *   Lub ID       — owned by Oil Lubrication (its Equipment Registry).
 *   Vib ID       — owned by Vibration Analysis (its VIB ID Registry).
 * Every module's Equipment ID must be a copy of one in this list; name, area
 * and contractor come from here. The modules read the sheet directly (their
 * PlatformEquipment.js, same Google account) and report what doesn't match.
 *
 * EQUIPMENT_MASTER: an optional title row, then the header row
 *   Equipment_ID | Equipment_Description | Main_Area | Plant_Area | Sub_Area |
 *   Contractor (an ORG_MASTER OrgId) | Criticality | Parent_Equipment_ID |
 *   Equipment_Status | Created_Date | Modified_Date
 * EQUIPMENT_LOG (made on first change): At | By | Equipment_ID | Change | Before | After
 */

var AM_HEADERS = ['Equipment_ID', 'Equipment_Description', 'Main_Area', 'Plant_Area', 'Sub_Area', 'Contractor', 'Criticality',
  'Parent_Equipment_ID', 'Equipment_Status', 'Created_Date', 'Modified_Date'];
var AM_LOG = 'EQUIPMENT_LOG';
var AM_LOG_HEADERS = ['At', 'By', 'Equipment_ID', 'Change', 'Before', 'After'];
var AM_EDITABLE = { name: 'Equipment_Description', mainArea: 'Main_Area', plantArea: 'Plant_Area', subArea: 'Sub_Area',
  criticality: 'Criticality', parent: 'Parent_Equipment_ID' };
// plant IDs: 3 digits, a dot, letters then digits (e.g. 321.FN125, 111.AF040)
var AM_ID_RE = /^\d{2,3}\.[A-Z]{1,4}\d{2,4}[A-Z0-9]*$/;

function amKey_(id) {
  return String(id || '').replace(/\s+/g, '').toUpperCase();
}

// { sheet, headerRow (1-based), headers, rows: [{ _row, <header>: value }] }
function amRead_() {
  var sheet = getSheet_(SHEET_NAMES.EQUIPMENT_MASTER);
  var values = sheet.getDataRange().getValues();
  var h = -1;
  for (var i = 0; i < Math.min(values.length, 5); i++) {
    if (String(values[i][0]).trim() === 'Equipment_ID') { h = i; break; }
  }
  if (h === -1) throw new Error('EQUIPMENT_MASTER has no "Equipment_ID" header row.');
  var headers = values[h].map(function (x) { return String(x).trim(); });
  var rows = [];
  for (var r = h + 1; r < values.length; r++) {
    if (!String(values[r][0] || '').trim()) continue;
    var o = { _row: r + 1 };
    headers.forEach(function (k, c) { if (k) o[k] = values[r][c]; });
    rows.push(o);
  }
  return { sheet: sheet, headerRow: h + 1, headers: headers, rows: rows };
}

// OrgId <-> name (ORG-RHI <-> RHI)
function amOrgs_() {
  var byId = {}, byName = {};
  try {
    readSheetAsObjects_(getSheet_(SHEET_NAMES.ORG_MASTER)).forEach(function (o) {
      if (!o.OrgId) return;
      byId[o.OrgId] = String(o.OrgName || o.OrgId);
      byName[String(o.OrgName || '').toUpperCase()] = o.OrgId;
    });
  } catch (e) {}
  return { byId: byId, byName: byName };
}

// Text from a cell, without invisible control characters (a stray one
// pasted into a description can break the web app's answer).
function amText_(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, ' ');
}

function amOut_(r, orgs) {
  var org = String(r.Contractor || '').trim();
  return {
    id: amText_(r.Equipment_ID).trim(),
    name: amText_(r.Equipment_Description),
    mainArea: amText_(r.Main_Area),
    plantArea: amText_(r.Plant_Area),
    subArea: amText_(r.Sub_Area),
    contractor: orgs.byId[org] || org.replace(/^ORG-/, ''),
    contractorOrg: org,
    criticality: amText_(r.Criticality),
    parent: amText_(r.Parent_Equipment_ID),
    status: amText_(r.Equipment_Status || 'Active') || 'Active',
  };
}

/**
 * Everyone signed in; a contractor sees its own equipment only (spec §6.2).
 * body.limit / body.offset: one page of the list (the app asks 400 at a
 * time — the whole live list in one answer is too big for the web app to
 * hand back). Without a limit, the whole list (older app versions).
 * body.packed = 1: the whole list packed (amPack_), about 70 KB for 1,900
 * machines — one request instead of five pages.
 */
function listEquipmentMaster_(session, body) {
  var orgs = amOrgs_();
  var scope = getContractorScope_(session);
  var rows = amRead_().rows
    .filter(function (r) { return !scope || String(r.Contractor).trim() === scope; });
  // packed=1 (current app): the whole list in one small answer (amPack_)
  if (body && String(body.packed) === '1') {
    var all = rows.map(function (r) { return amOut_(r, orgs); });
    return { packed: amPack_(all), count: all.length, total: all.length };
  }
  var limit = Number(body && body.limit) || 0;
  var offset = Math.max(0, Number(body && body.offset) || 0);
  var page = limit > 0 ? rows.slice(offset, offset + limit) : rows;
  var list = page.map(function (r) { return amOut_(r, orgs); });
  var next = limit > 0 && offset + limit < rows.length ? offset + limit : null;
  return { equipment: list, count: list.length, total: rows.length, next: next };
}

// A list of row objects as { cols, dict, rows }: each row an array of values
// in cols order; a column with few different values sends them once in
// dict[column index] and each row holds the index. The app unpacks it
// (frontend/src/api/platformCore.ts listEquipmentMaster).
function amPack_(list) {
  var cols = list.length ? Object.keys(list[0]) : [];
  var dict = {}, index = {};
  cols.forEach(function (c, i) {
    var map = {}, values = [];
    for (var r = 0; r < list.length; r++) {
      var v = list[r][c] == null ? '' : list[r][c];
      if (!Object.prototype.hasOwnProperty.call(map, v)) {
        map[v] = values.length;
        values.push(v);
        if (values.length * 2 > list.length) return; // mostly different: as they are
      }
    }
    dict[i] = values;
    index[i] = map;
  });
  var rows = list.map(function (o) {
    return cols.map(function (c, i) { var v = o[c] == null ? '' : o[c]; return index[i] ? index[i][v] : v; });
  });
  return { cols: cols, dict: dict, rows: rows };
}

/**
 * App Admin only. body: { mode: 'add' | 'edit' | 'retire' | 'restore' | 'rename' | 'delete', item: { id, name,
 * mainArea, plantArea, subArea, contractor (RHI / ASEC or an OrgId), criticality, parent, newId (rename) } }
 * Rename and delete change this list only; the app then asks Oil and
 * Vibration to move or delete the machine's records (their IdAdmin.js).
 */
function saveEquipmentMaster_(session, body) {
  requireAppAdmin_(session.userId);
  var mode = String(body.mode || '');
  var item = body.item || {};
  var id = amKey_(item.id);
  if (!id) throw new Error('Equipment ID is required.');
  var by = session.email || session.userId;
  return withLock_(function () {
    var t = amRead_();
    var orgs = amOrgs_();
    var found = null;
    t.rows.forEach(function (r) { if (amKey_(r.Equipment_ID) === id) found = r; });
    var now = new Date();
    var org = function (c) {
      c = String(c || '').trim();
      if (!c) return '';
      if (orgs.byId[c]) return c;
      return orgs.byName[c.toUpperCase()] || ('ORG-' + c.toUpperCase());
    };
    if (mode === 'add') {
      if (found) throw new Error(id + ' is already in the list.');
      if (!AM_ID_RE.test(id)) throw new Error(id + ' does not look like a plant Equipment ID (e.g. 321.FN125).');
      if (!String(item.name || '').trim()) throw new Error('Name is required.');
      if (!org(item.contractor)) throw new Error('Contractor is required.');
      var o = { Equipment_ID: id, Equipment_Description: String(item.name).trim(), Main_Area: item.mainArea || '', Plant_Area: item.plantArea || '',
        Sub_Area: item.subArea || '', Contractor: org(item.contractor), Criticality: item.criticality || '', Parent_Equipment_ID: amKey_(item.parent),
        Equipment_Status: 'Active', Created_Date: now, Modified_Date: now };
      t.sheet.appendRow(t.headers.map(function (k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : ''; }));
      amLog_(by, id, 'Added', '', JSON.stringify(amOut_(o, orgs)));
      return { saved: true, item: amOut_(o, orgs) };
    }
    if (!found) throw new Error(id + ' is not in the list.');
    var before = amOut_(found, orgs);
    if (mode === 'rename' || mode === 'delete') return amRenameOrDelete_(t, orgs, found, mode, amKey_(item.newId), by, before, now);
    var next = {};
    Object.keys(found).forEach(function (k) { next[k] = found[k]; });
    var change;
    if (mode === 'retire' || mode === 'restore') {
      next.Equipment_Status = mode === 'retire' ? 'Retired' : 'Active';
      change = mode === 'retire' ? 'Retired' : 'Restored';
    } else if (mode === 'edit') {
      Object.keys(AM_EDITABLE).forEach(function (f) {
        if (Object.prototype.hasOwnProperty.call(item, f)) next[AM_EDITABLE[f]] = f === 'parent' ? amKey_(item[f]) : String(item[f] || '').trim();
      });
      if (Object.prototype.hasOwnProperty.call(item, 'contractor')) next.Contractor = org(item.contractor);
      if (!String(next.Equipment_Description || '').trim()) throw new Error('Name is required.');
      change = 'Edited';
    } else {
      throw new Error('Unknown change: ' + mode);
    }
    next.Modified_Date = now;
    t.sheet.getRange(found._row, 1, 1, t.headers.length).setValues([t.headers.map(function (k) { return k && next[k] !== undefined ? next[k] : ''; })]);
    var after = amOut_(next, orgs);
    amLog_(by, id, change, JSON.stringify(before), JSON.stringify(after));
    return { saved: true, item: after };
  });
}

// A new Equipment ID for the machine (and for machines that name it as
// parent), or the machine out of the list for good.
function amRenameOrDelete_(t, orgs, found, mode, newId, by, before, now) {
  var id = amKey_(found.Equipment_ID);
  var col = function (k) { return t.headers.indexOf(k) + 1; };
  var parentCol = col('Parent_Equipment_ID');
  var modCol = col('Modified_Date');
  if (mode === 'rename') {
    if (!newId) throw new Error('Give the new Equipment ID.');
    if (newId === id) throw new Error('The new Equipment ID is the same.');
    if (!AM_ID_RE.test(newId)) throw new Error(newId + ' does not look like a plant Equipment ID (e.g. 321.FN125).');
    if (t.rows.some(function (r) { return amKey_(r.Equipment_ID) === newId; })) throw new Error(newId + ' is already in the list.');
  }
  // children first: their rows don't move when this one is renamed
  if (parentCol > 0) {
    t.rows.forEach(function (r) {
      if (amKey_(r.Parent_Equipment_ID) !== id) return;
      t.sheet.getRange(r._row, parentCol).setValue(mode === 'rename' ? newId : '');
      if (modCol > 0) t.sheet.getRange(r._row, modCol).setValue(now);
    });
  }
  if (mode === 'delete') {
    t.sheet.deleteRow(found._row);
    amLog_(by, id, 'Deleted', JSON.stringify(before), '');
    return { saved: true, deleted: true, id: id };
  }
  t.sheet.getRange(found._row, col('Equipment_ID')).setValue(newId);
  if (modCol > 0) t.sheet.getRange(found._row, modCol).setValue(now);
  var next = {};
  Object.keys(found).forEach(function (k) { next[k] = found[k]; });
  next.Equipment_ID = newId;
  var after = amOut_(next, orgs);
  amLog_(by, id, 'ID changed to ' + newId, JSON.stringify(before), JSON.stringify(after));
  return { saved: true, item: after, from: id };
}

function amLog_(by, id, change, before, after) {
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    var sheet = ss.getSheetByName(AM_LOG);
    if (!sheet) {
      sheet = ss.insertSheet(AM_LOG);
      sheet.getRange(1, 1, 1, AM_LOG_HEADERS.length).setValues([AM_LOG_HEADERS]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), by, id, change, before, after]);
  } catch (e) { /* the log never blocks the change */ }
}

/** App Admin: the latest changes (newest first). */
function listEquipmentLog_(session, limit) {
  requireAppAdmin_(session.userId);
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = ss.getSheetByName(AM_LOG);
  if (!sheet) return { entries: [] };
  var rows = readSheetAsObjects_(sheet).reverse().slice(0, Number(limit) || 100);
  return {
    entries: rows.map(function (r) {
      return { at: r.At instanceof Date ? r.At.toISOString() : String(r.At || ''), by: String(r.By || ''), id: String(r.Equipment_ID || ''), change: String(r.Change || ''), before: String(r.Before || ''), after: String(r.After || '') };
    }),
  };
}

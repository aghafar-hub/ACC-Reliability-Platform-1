/**
 * Areas — the official area names (Settings → Equipment & IDs → Areas).
 *
 * The modules and the platform equipment list use many names for one place
 * ("CM1", "CementMill1", "Cement Mill 1"). Here the App Owner keeps one
 * official list — lines, and areas inside each line — and the other names
 * ("aliases") each one stands for. Every page shows the official name
 * (frontend areas.ts); the sheets themselves are not changed.
 *
 * AREAS (made on the first save): Kind | Name | Line | Aliases | Order | Updated_By | Updated_At
 *   Kind  'Line' or 'Area'
 *   Line  the line an area belongs to (empty for a line)
 *   Aliases  the other names, separated by " | "
 * Until the first save the proposed list below is returned (proposed: true).
 *
 * One other name may stand for areas on different lines ("Raw Meal" is on
 * Line 1 and Line 2): the machine's own line decides. And a machine on the
 * platform equipment list always takes its area from there (getAreas sends
 * "machines": Equipment ID → "Plant_Area|Main_Area").
 */

var AR_SHEET = 'AREAS';
var AR_HEADERS = ['Kind', 'Name', 'Line', 'Aliases', 'Order', 'Updated_By', 'Updated_At'];

// Proposed from the names in use (with the App Owner's placements: AF#1 Hot
// Disc, AF#2 Line 2 (AFR), Coal Meal Coal Mill 1, CM L2 Cement Mills 2, Raw
// Meal and Gypsum on both lines / both cement mills) (platform list Main_Area / Plant_Area, Oil
// Equipment Registry, Vibration registers). Names not sure enough to place
// are left out; they show under "Names in use" to be mapped by hand.
var AR_PROPOSED = [
  { kind: 'Line', name: 'Line 1', aliases: ['Line1', 'L1'] },
  { kind: 'Area', name: 'Crusher', line: 'Line 1', aliases: ['RMCrusher', 'Crusher'] },
  { kind: 'Area', name: 'Raw Mill 1', line: 'Line 1', aliases: ['RawMill1', 'RM#1', 'RM1', 'Raw Meal'] },
  { kind: 'Area', name: 'Kiln 1', line: 'Line 1', aliases: ['Kiln1', 'Kiln#1', 'Kiln #1'] },
  { kind: 'Area', name: 'Coal Mill 1', line: 'Line 1', aliases: ['CoalMill1', 'Coal Mill1', 'Coal M#1', 'Coal Meal'] },
  { kind: 'Area', name: 'Hot Disc', line: 'Line 1', aliases: ['HotDisc', 'AF#1'] },
  { kind: 'Line', name: 'Line 2', aliases: ['Line2', 'L2'] },
  { kind: 'Area', name: 'Raw Mill 2', line: 'Line 2', aliases: ['RawMill2', 'RM#2', 'RM2', 'Raw Meal'] },
  { kind: 'Area', name: 'Kiln 2', line: 'Line 2', aliases: ['Kiln2', 'Kiln#2', 'Kiln #2'] },
  { kind: 'Area', name: 'Coal Mill 2', line: 'Line 2', aliases: ['CoalMill2', 'Coal Mill2', 'Coal M#2'] },
  { kind: 'Area', name: 'AFR', line: 'Line 2', aliases: ['AFShredding', 'AF Shredding', 'AF#2'] },
  { kind: 'Line', name: 'Cement Mills 1', aliases: ['CM1', 'CM#1', 'CM 1'] },
  { kind: 'Area', name: 'Cement Mill 1', line: 'Cement Mills 1', aliases: ['CementMill1'] },
  { kind: 'Area', name: 'Cement Mill 2', line: 'Cement Mills 1', aliases: ['CementMill2'] },
  { kind: 'Area', name: 'Clinker Area 1', line: 'Cement Mills 1', aliases: ['ClinkerArea1'] },
  { kind: 'Area', name: 'Gypsum Conveying', line: 'Cement Mills 1', aliases: ['Gypsum Conv', 'Gypsum'] },
  { kind: 'Area', name: 'Packing 1', line: 'Cement Mills 1', aliases: ['PackingArea1'] },
  { kind: 'Line', name: 'Cement Mills 2', aliases: ['CM2', 'CM#2', 'CM 2', 'CM L2'] },
  { kind: 'Area', name: 'Cement Mill 3', line: 'Cement Mills 2', aliases: ['CementMill3'] },
  { kind: 'Area', name: 'Cement Mill 4', line: 'Cement Mills 2', aliases: ['CementMill4'] },
  { kind: 'Area', name: 'Clinker Area 2', line: 'Cement Mills 2', aliases: ['ClinkerArea2'] },
  { kind: 'Area', name: 'Gypsum Crusher', line: 'Cement Mills 2', aliases: ['GyCrusher', 'Gypsum'] },
  { kind: 'Area', name: 'Packing 2', line: 'Cement Mills 2', aliases: ['PackingArea2'] },
  { kind: 'Line', name: 'Common', aliases: [] },
  { kind: 'Area', name: 'Hydrogen Plant', line: 'Common', aliases: ['Hydrogen'] },
];

function arKey_(s) {
  return String(s || '').toLowerCase().replace(/[\s#._\-\/]+/g, '');
}

function arRead_() {
  var sh = null;
  try { sh = SpreadsheetApp.openById(getSpreadsheetId_()).getSheetByName(AR_SHEET); } catch (e) {}
  if (!sh || sh.getLastRow() < 2) return { areas: AR_PROPOSED.map(arClean_), proposed: true, changed: null };
  var rows = readSheetAsObjects_(sh);
  var changed = null;
  var list = rows.map(function (r) {
    if (r.Updated_At && (!changed || String(r.Updated_At) > changed.at)) changed = { by: String(r.Updated_By || ''), at: r.Updated_At instanceof Date ? r.Updated_At.toISOString() : String(r.Updated_At) };
    return { kind: String(r.Kind || ''), name: String(r.Name || '').trim(), line: String(r.Line || '').trim(), aliases: String(r.Aliases || '').split('|').map(function (a) { return a.trim(); }).filter(String), order: Number(r.Order) || 0 };
  }).filter(function (x) { return x.name; }).sort(function (a, b) { return a.order - b.order; });
  return { areas: list.map(arClean_), proposed: false, changed: changed };
}

function arClean_(x) {
  return { kind: x.kind === 'Line' ? 'Line' : 'Area', name: String(x.name || '').trim(), line: x.kind === 'Line' ? '' : String(x.line || '').trim(), aliases: (x.aliases || []).map(function (a) { return String(a).trim(); }).filter(String) };
}

/** Any signed-in user: the official list (or the proposal until the first save). */
function getAreas_(session) {
  var r = arRead_();
  r.canEdit = !!session && maybeAppAdmin_(session);
  r.machines = arMachines_();
  return r;
}

// Equipment ID → "Plant_Area|Main_Area" from the platform equipment list
// (active machines): the place a machine is in, whatever a module calls it.
function arMachines_() {
  var out = {};
  try {
    amRead_().rows.forEach(function (row) {
      if (/retired/i.test(String(row.Equipment_Status || ''))) return;
      var id = amKey_(row.Equipment_ID);
      var v = String(row.Plant_Area || '').trim() + '|' + String(row.Main_Area || '').trim();
      if (id && v !== '|') out[id] = v;
    });
  } catch (e) {}
  return out;
}

function maybeAppAdmin_(session) {
  try { requireAppAdmin_(session.userId); return true; } catch (e) { return false; }
}

/** App Owner: replace the whole list. body.areas: [{ kind, name, line, aliases }] */
function saveAreas_(session, body) {
  requireAppAdmin_(session.userId);
  var by = session.email || session.userId;
  var list = (typeof body.areas === 'string' ? JSON.parse(body.areas) : body.areas || []).map(arClean_).filter(function (x) { return x.name; });
  // checks: unique names, areas on a known line, one alias → one entry
  var seen = {};
  var lines = {};
  list.forEach(function (x) { if (x.kind === 'Line') lines[x.name] = true; });
  list.forEach(function (x) {
    var k = arKey_(x.name);
    if (seen[k]) throw new Error('"' + x.name + '" is in the list twice.');
    seen[k] = x.name;
    if (x.kind === 'Area' && !lines[x.line]) throw new Error('Area "' + x.name + '" needs a line from the list.');
  });
  var lineOf = {};
  list.forEach(function (x) { lineOf[x.name] = x.kind === 'Line' ? x.name : x.line; });
  var aliasLines = {}; // alias → { line: entry }
  list.forEach(function (x) {
    // keep each name once (RM#1 and RM1 count as different spellings: both kept)
    x.aliases = x.aliases.filter(function (a, i) { return x.aliases.indexOf(a) === i && arKey_(a) !== arKey_(x.name); });
    var mine = {};
    x.aliases.forEach(function (a) {
      if (mine[arKey_(a)]) return;
      mine[arKey_(a)] = true;
      var k = arKey_(a);
      // an official name can't also be another entry's other name
      var named = list.filter(function (y) { return arKey_(y.name) === k; })[0];
      if (named) throw new Error('"' + a + '" is the name of ' + named.name + ' — it can\'t also stand for ' + x.name + '.');
      var byLine = aliasLines[k] = aliasLines[k] || {};
      var ln = lineOf[x.name];
      if (byLine[ln]) throw new Error('"' + a + '" is given to both ' + byLine[ln] + ' and ' + x.name + ' on ' + ln + '.');
      byLine[ln] = x.name;
    });
  });
  return withLock_(function () {
    var before = arRead_();
    var ss = SpreadsheetApp.openById(getSpreadsheetId_());
    var sh = ss.getSheetByName(AR_SHEET);
    if (!sh) {
      sh = ss.insertSheet(AR_SHEET);
      sh.getRange(1, 1, 1, AR_HEADERS.length).setValues([AR_HEADERS]);
      sh.setFrozenRows(1);
    }
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, AR_HEADERS.length).clearContent();
    var now = new Date();
    var rows = list.map(function (x, i) { return [x.kind, x.name, x.line, x.aliases.join(' | '), i + 1, by, now]; });
    if (rows.length) sh.getRange(2, 1, rows.length, AR_HEADERS.length).setValues(rows);
    platformLog_(by, 'Equipment & IDs', 'Areas', 'Changed', arDiff_(before.proposed ? [] : before.areas, list) || 'Saved');
    return getAreas_(session);
  });
}

function arDiff_(a, b) {
  var byName = function (l) { var o = {}; l.forEach(function (x) { o[x.name] = x; }); return o; };
  var A = byName(a), B = byName(b), out = [];
  Object.keys(B).forEach(function (n) {
    if (!A[n]) out.push('added ' + n);
    else {
      if (A[n].line !== B[n].line) out.push(n + ': line ' + (A[n].line || '—') + ' → ' + (B[n].line || '—'));
      var add = B[n].aliases.filter(function (x) { return A[n].aliases.indexOf(x) === -1; });
      var rem = A[n].aliases.filter(function (x) { return B[n].aliases.indexOf(x) === -1; });
      if (add.length) out.push(n + ' + ' + add.join(', '));
      if (rem.length) out.push(n + ' − ' + rem.join(', '));
    }
  });
  Object.keys(A).forEach(function (n) { if (!B[n]) out.push('removed ' + n); });
  return out.slice(0, 30).join('; ');
}

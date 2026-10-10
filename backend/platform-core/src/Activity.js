/**
 * Platform Activity page (step 4): the platform's own changes — PLATFORM_LOG
 * (Settings access, Email & notifications, …) and EQUIPMENT_LOG (Equipment
 * IDs). The shell merges these with the modules' audit logs.
 * App Owner and ACC managers only. body.from = ISO date (default 31 days
 * back, at most a year); newest first.
 */
var ACT_MAX = 3000;

function activityAllowed_(session) {
  var roles = session.roles || [];
  return roles.indexOf('ROLE-ADMIN') !== -1 || roles.indexOf('ROLE-MGR') !== -1;
}

function actIso_(v) {
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? String(v || '') : d.toISOString();
}

// "contractor RHI → ASEC, name …" from two JSON snapshots of an equipment row
function actEquipmentDiff_(before, after) {
  var a = {}, b = {};
  try { a = JSON.parse(before || '{}'); } catch (e) {}
  try { b = JSON.parse(after || '{}'); } catch (e) {}
  var names = { name: 'name', mainArea: 'main area', plantArea: 'area', subArea: 'sub area', contractor: 'contractor', criticality: 'criticality', parent: 'parent', status: 'status' };
  var out = [];
  Object.keys(names).forEach(function (k) {
    if (String(a[k] || '') !== String(b[k] || '') && before) out.push(names[k] + ' ' + (a[k] || '—') + ' → ' + (b[k] || '—'));
  });
  if (!before && b.name) out.push(b.name + (b.contractor ? ' · ' + b.contractor : ''));
  return { text: out.join(', '), contractor: String(b.contractor || a.contractor || '') };
}

function listPlatformActivity_(session, body) {
  if (!activityAllowed_(session)) throw new Error('Activity is for the App Owner and ACC managers.');
  var from = new Date(String((body && body.from) || ''));
  if (isNaN(from.getTime())) from = new Date(Date.now() - 31 * 86400000);
  var min = new Date(Date.now() - 366 * 86400000);
  if (from < min) from = min;
  var fromIso = from.toISOString();
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var out = [];
  var log = ss.getSheetByName(PLATFORM_LOG);
  if (log) readSheetAsObjects_(log).forEach(function (r) {
    var at = actIso_(r.At);
    if (at >= fromIso) out.push({ at: at, by: String(r.By || ''), area: String(r.Area || ''), record: String(r.Record || ''), change: String(r.Change || ''), details: String(r.Details || ''), contractor: '', equipment: '' });
  });
  var eq = ss.getSheetByName('EQUIPMENT_LOG');
  if (eq) readSheetAsObjects_(eq).forEach(function (r) {
    var at = actIso_(r.At);
    if (at < fromIso) return;
    var d = actEquipmentDiff_(String(r.Before || ''), String(r.After || ''));
    out.push({ at: at, by: String(r.By || ''), area: 'Equipment', record: String(r.Equipment_ID || ''), change: String(r.Change || ''), details: d.text, contractor: d.contractor, equipment: String(r.Equipment_ID || '') });
  });
  out.sort(function (x, y) { return x.at < y.at ? 1 : x.at > y.at ? -1 : 0; });
  return { from: fromIso, entries: out.slice(0, ACT_MAX), truncated: out.length > ACT_MAX };
}

// A user's email for the log (falls back to the id).
function actUserEmail_(userId) {
  try {
    var u = readSheetAsObjects_(getSheet_(SHEET_NAMES.USERS)).filter(function (r) { return String(r.UserId) === String(userId); })[0];
    return u ? String(u.Email || userId) : String(userId || '');
  } catch (e) { return String(userId || ''); }
}

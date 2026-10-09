// ─── Measurement Tracker: is every machine measured on time? ──────────────
// Tracked per machine, not per report. Two sources:
//   - "Equipment Measurement History": one row per machine per month for the
//     past, built once from the old Compliance Tracker and the old readings
//     (Result Measured / Not measured, the level, the old mark).
//   - "Vibration Log Entries": every reading. From the month after the
//     history ends the months are worked out from the readings alone.
// The rule: a machine is due its interval (Limits page, default 30 days)
// after its last measurement, with VL_GRACE_DAYS of grace before it is
// overdue. A month with no reading is Missed only when the machine was
// overdue by the end of that month; Inactive machines show Not running.

var SHEET_VHIST = 'Equipment Measurement History';
var VHIST_HEADERS = ['Equipment ID', 'Equipment name', 'Area', 'Contractor', 'Month', 'Result', 'First measured', 'Last measured',
  'Level', 'Old tracker mark', 'Readings in app', 'Source', 'Report ID'];
var VL_GRACE_DAYS = 7;

function vtMonthEnd_(month) {
  var p = month.split('-');
  return Utilities.formatDate(new Date(Date.UTC(+p[0], +p[1], 0)), 'UTC', 'yyyy-MM-dd');
}
function vtAddMonths_(month, n) {
  var p = month.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM');
}
function vtWorse_(a, b) { return (VL_LEVEL_RANK[b] || 0) > (VL_LEVEL_RANK[a] || 0) ? b : a; }

// Every machine's measurements: { eq: { months: {m: {first, last, level, readings, hist}}, dates: [sorted] } }
// plus the last month the history tab covers. A history month with no
// readings (old mark only) counts as measured on the 15th for the interval.
function vtCollect_(ss) {
  var per = {};
  var get = function (eq) { return per[eq] || (per[eq] = { months: {}, dates: {} }); };
  var histEnd = '';
  vlRead_(ss, SHEET_VHIST).rows.forEach(function (r) {
    var eq = String(r['Equipment ID'] || '').trim(), m = vlMonth_(r['Month']);
    if (!eq || !m) return;
    if (m > histEnd) histEnd = m;
    var x = get(eq);
    var measured = String(r['Result']) === 'Measured';
    x.months[m] = { hist: true, measured: measured, level: measured ? String(r['Level'] || '') : '', first: vlDate_(r['First measured']),
      last: vlDate_(r['Last measured']), readings: 0, mark: String(r['Old tracker mark'] || ''), source: String(r['Source'] || '') };
    if (measured) {
      var d = vlDate_(r['Last measured']) || (m + '-15');
      x.dates[d] = true;
    }
  });
  vlRead_(ss, SHEET_VENTRIES).rows.forEach(function (r) {
    var eq = String(r['Equipment ID'] || '').trim(), d = vlDate_(r['Measurement date']);
    if (!eq || !d) return;
    var m = d.slice(0, 7);
    var x = get(eq);
    var c = x.months[m] || (x.months[m] = { hist: false, measured: true, level: '', first: '', last: '', readings: 0, mark: '', source: 'Readings' });
    c.measured = true;
    c.readings++;
    c.level = vtWorse_(c.level, String(r['Final status'] || ''));
    if (!c.first || d < c.first) c.first = d;
    if (!c.last || d > c.last) c.last = d;
    x.dates[d] = true;
  });
  Object.keys(per).forEach(function (eq) { per[eq].dates = Object.keys(per[eq].dates).sort(); });
  return { per: per, histEnd: histEnd };
}

// Last measurement per machine (readings, or the old tracker month).
function vtLastMeasured_(ss) {
  var c = vtCollect_(ss), last = {};
  Object.keys(c.per).forEach(function (eq) { var ds = c.per[eq].dates; if (ds.length) last[eq] = ds[ds.length - 1]; });
  return last;
}

// Where a machine stands today: On time / Due now / Overdue / Never measured / Not running.
function vtDueState_(last, interval, inactive, today) {
  if (inactive) return { state: 'Not running', nextDue: '' };
  if (!last) return { state: 'Never measured', nextDue: '' };
  var due = vlAddDays_(last, interval);
  if (today > vlAddDays_(due, VL_GRACE_DAYS)) return { state: 'Overdue', nextDue: due };
  if (today >= vlAddDays_(due, -VL_GRACE_DAYS)) return { state: 'Due now', nextDue: due };
  return { state: 'On time', nextDue: due };
}

// GET getVibTracker { from, to (yyyy-MM), equipmentId? }
// → { months, histEnd, graceDays, machines: [{ equipmentId, name, area, contractor, scope, interval, inactive,
//      lastMeasured, nextDue, state, measured, missed, onTimePct, cells: { month: { r, level, first, last, readings, mark, source } } }] }
// r: Measured | Missed | Overdue (this month, still open) | Not due | Not running | '' (no data)
function handleGetVibTracker(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var today = vlToday_();
  var to = vlMonth_(params.to) || today.slice(0, 7);
  var from = vlMonth_(params.from) || vtAddMonths_(to, -11);
  if (from > to) return { status: 'error', error: 'The start month is after the end month.' };
  var months = vtMonths_(from, to);
  var master = vlMasterData_(ss, { includeInactive: true });
  var t = vtTracker_(ss, master, me, months, String(params.equipmentId || '').trim(), today);
  return { status: 'ok', today: today, months: months, histEnd: t.histEnd, graceDays: VL_GRACE_DAYS, defaultInterval: VL_DEFAULT_INTERVAL,
    machines: t.machines, me: { contractor: me.contractor || '' } };
}

function vtMonths_(from, to) {
  var months = [];
  for (var m = from; m <= to && months.length < 120; m = vtAddMonths_(m, 1)) months.push(m);
  return months;
}

// The tracker rows for the given months (handleGetVibTracker, the dashboard).
function vtTracker_(ss, master, me, months, only, today) {
  var thisMonth = today.slice(0, 7);
  var col = vtCollect_(ss);
  var machines = [];
  Object.keys(master.eq).sort().forEach(function (id) {
    var e = master.eq[id];
    if (only && id !== only) return;
    if (!e.vibIds || !e.contractor || (me.contractor && e.contractor !== me.contractor)) return;
    var x = col.per[id] || { months: {}, dates: [] };
    var interval = e.interval || VL_DEFAULT_INTERVAL;
    var lastBefore = function (day) { // last measurement on or before day
      var best = '';
      for (var i = 0; i < x.dates.length && x.dates[i] <= day; i++) best = x.dates[i];
      return best;
    };
    var cells = {}, measured = 0, missed = 0;
    months.forEach(function (mo) {
      var c = x.months[mo];
      var cell;
      if (c && c.measured) {
        cell = { r: 'Measured', level: c.level, first: c.first, last: c.last, readings: c.readings, mark: c.mark, source: c.source };
        measured++;
      } else if (c && c.hist) {
        cell = { r: 'Missed', mark: c.mark, source: c.source };
        missed++;
      } else if (mo > thisMonth || (col.histEnd && mo <= col.histEnd)) {
        cell = { r: '' }; // future, or a history month with no row for this machine
      } else if (e.inactive) {
        cell = { r: 'Not running' };
      } else {
        var end = mo === thisMonth ? today : vtMonthEnd_(mo);
        var prev = lastBefore(end);
        var overdue = !prev || end > vlAddDays_(vlAddDays_(prev, interval), VL_GRACE_DAYS);
        if (!prev && !x.dates.length) cell = { r: '' }; // never measured at all: shown by the state, not as a run of misses
        else if (overdue && mo !== thisMonth) { cell = { r: 'Missed' }; missed++; }
        else cell = { r: overdue ? 'Overdue' : 'Not due' };
      }
      cells[mo] = cell;
    });
    var last = x.dates.length ? x.dates[x.dates.length - 1] : '';
    var st = vtDueState_(last, interval, e.inactive, today);
    machines.push({ equipmentId: id, name: e.name, area: e.area || '', contractor: e.contractor, scope: e.scope, interval: interval,
      inactive: !!e.inactive, lastMeasured: last, nextDue: st.nextDue, state: st.state, measured: measured, missed: missed,
      onTimePct: measured + missed ? Math.round(100 * measured / (measured + missed)) : null, cells: cells });
  });
  return { machines: machines, histEnd: col.histEnd };
}

// Machines measured per area per month: { area, cells: [{ month, measured, missed, pct }] }.
function vtAreaGrid_(machines, months) {
  var areas = {};
  machines.forEach(function (m) {
    var a = m.area || 'Other';
    var g = areas[a] || (areas[a] = {});
    months.forEach(function (mo) {
      var c = m.cells[mo] || {};
      var x = g[mo] || (g[mo] = { month: mo, measured: 0, missed: 0 });
      if (c.r === 'Measured') x.measured++;
      else if (c.r === 'Missed') x.missed++;
    });
  });
  var order = ['Line 1', 'Line 2', 'CM#1', 'CM#2'];
  return Object.keys(areas).sort(function (a, b) { return ((order.indexOf(a) + 1) || 9) - ((order.indexOf(b) + 1) || 9) || (a < b ? -1 : 1); })
    .map(function (a) {
      return { area: a, cells: months.map(function (mo) {
        var x = areas[a][mo];
        var n = x.measured + x.missed;
        return { month: mo, measured: x.measured, missed: x.missed, pct: n ? Math.round(100 * x.measured / n) : null };
      }) };
    });
}

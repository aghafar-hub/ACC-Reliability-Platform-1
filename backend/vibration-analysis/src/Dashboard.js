// ─── Vibration Dashboard (one request, everything the page draws) ─────────
// Machines by latest final status, reports received per contractor scope
// per month (last 12 months, 45-day rule), condition by scope, worst
// machines with their recent trend, actions and follow-ups — all filtered
// to the person's contractor when they are a contractor account.

function handleGetVibDashboard(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var today = vlToday_();
  var master = vlMasterData_(ss);
  var mineC = function (c) { return !me.contractor || c === me.contractor; };

  // one pass over the readings: latest month per machine, worst point, monthly max per machine/family
  var per = {};
  vlRead_(ss, SHEET_VENTRIES).rows.forEach(function (r) {
    var eq = String(r['Equipment ID'] || '');
    if (!eq || !mineC(r['Contractor'])) return;
    if (r['Reading kind'] && r['Reading kind'] !== 'Report reading') return;
    var m = vlMonth_(r['Month']) || vlDate_(r['Measurement date']).slice(0, 7);
    var x = per[eq] || (per[eq] = { months: {}, series: { RMS: {}, SPM: {} } });
    var mm = x.months[m] || (x.months[m] = { worst: '', date: '', point: null });
    var f = String(r['Final status'] || '');
    var fam = r['Family'];
    var v = fam === 'RMS' ? vlNum_(r['Max velocity (mm/s)']) : fam === 'SPM' ? vlNum_(r['HDm (dBsv)']) : vlNum_(r["G's (g)"]);
    var d = vlDate_(r['Measurement date']);
    if (d > mm.date) mm.date = d;
    var rank = VL_LEVEL_RANK[f] || 0;
    var limits = String(r['Limits used (N/C/A)'] || '').split('/').map(function (n) { return parseFloat(n); });
    var ratio = v !== null && limits.length === 3 && limits[2] > 0 ? v / limits[2] : 0;
    var cur = VL_LEVEL_RANK[mm.worst] || 0;
    if (!mm.point || rank > cur || (rank === cur && ratio > mm.point.ratio)) {
      if (rank >= cur) mm.worst = f;
      mm.point = { point: String(r['Point description'] || '').replace(/\s*\(.*\)$/, ''), family: fam, value: v, ratio: ratio, vibId: r['VIB ID'] };
    }
    if ((fam === 'RMS' || fam === 'SPM') && v !== null) {
      var s = x.series[fam];
      s[m] = Math.max(s[m] === undefined ? -Infinity : s[m], v);
    }
  });

  var machines = [];
  Object.keys(master.eq).forEach(function (id) {
    var e = master.eq[id];
    if (!e.vibIds || e.inactive || !e.contractor || !mineC(e.contractor)) return;
    var x = per[id] || { months: {}, series: { RMS: {}, SPM: {} } };
    var ms = Object.keys(x.months).sort();
    var last = ms[ms.length - 1], prev = ms[ms.length - 2];
    var lm = last ? x.months[last] : null;
    var fam = lm && lm.point ? lm.point.family : 'RMS';
    var series = Object.keys(x.series[fam] || {}).sort().slice(-6).map(function (k) { return { month: k, value: x.series[fam][k] }; });
    machines.push({ equipmentId: id, name: e.name, contractor: e.contractor, scope: e.scope, vibIds: e.vibIds, status: lm ? lm.worst : '',
      lastMonth: last || '', lastDate: lm ? lm.date : '', prevStatus: prev ? x.months[prev].worst : '', worstPoint: lm ? lm.point : null, series: series, family: fam });
  });

  // reports grid: last 12 months × scopes (45-day rule for months with no report row)
  var reps = {};
  vlRead_(ss, SHEET_VLOG).rows.forEach(function (r) {
    if (!r['Report ID'] || !mineC(r['Contractor'])) return;
    var o = vlReportOut_(r, today);
    reps[o['Month'] + '|' + o['Contractor'] + '|' + o['Report scope']] = o;
  });
  var scopes = vlScopes_(master).filter(function (s) { return mineC(s.contractor); });
  var months = [];
  var p = today.slice(0, 7).split('-').map(Number);
  for (var i = 11; i >= 0; i--) {
    var d0 = new Date(Date.UTC(p[0], p[1] - 1 - i, 1));
    months.push(d0.toISOString().slice(0, 7));
  }
  var grid = scopes.map(function (s) {
    return { contractor: s.contractor, scope: s.scope, cells: months.map(function (m) {
      var r = reps[m + '|' + s.contractor + '|' + s.scope];
      if (r) return { month: m, status: r['Report status'], workflow: r['Workflow status'], reportId: r['Report ID'] };
      var due = vlAddDays_(vlMonthEnd_(m), VL_DUE_DAYS);
      return { month: m, status: today > due ? 'Overdue' : 'Not due yet', workflow: '', reportId: '' };
    }) };
  });
  var yearStart = today.slice(0, 4) + '-01';
  var due = 0, onTime = 0;
  grid.forEach(function (g) { g.cells.forEach(function (c) {
    if (c.month < yearStart || c.status === 'Not due yet' || c.status === 'Awaiting report' || c.status === 'Skipped' || c.status === 'Report not imported') return;
    due++; if (c.status === 'Received') onTime++;
  }); });

  var actions = vlRead_(ss, SHEET_VACTIONS).rows.map(vaOut_).filter(function (a) { return mineC(a['Contractor']); });
  var open = actions.filter(function (a) { return VA_OPEN.indexOf(String(a['Status'])) !== -1; });
  var allRoutes = {};
  vlRead_(ss, SHEET_VROUTES).rows.forEach(function (r) { allRoutes[r['Route ID']] = r; });
  var sugg = [];
  try { sugg = vrSuggestions_(ss, master, me, 14, allRoutes).list; } catch (e) {}
  var thisMonth = today.slice(0, 7);
  return {
    status: 'ok', today: today, months: months, machines: machines, grid: grid,
    onTime: { due: due, onTime: onTime, year: today.slice(0, 4) },
    actions: {
      open: open.length,
      byStage: VA_OPEN.map(function (s) { return { stage: s, count: open.filter(function (a) { return a['Status'] === s; }).length }; }),
      pastDue: open.filter(function (a) { return ['Open', 'Waiting Stoppage'].indexOf(a['Status']) !== -1 && a['Due date'] && a['Due date'] < today; }).length,
      noOwner: open.filter(function (a) { return !a['Owner']; }).length,
    },
    followUps: { due: sugg.filter(function (s) { return s.type === 'Follow-up'; }).length, overdue: sugg.filter(function (s) { return s.type === 'Follow-up' && s.overdue; }).length },
    reportsThisMonth: grid.map(function (g) { var c = g.cells[g.cells.length - 1]; return { contractor: g.contractor, scope: g.scope, status: c.status, workflow: c.workflow }; }),
    newAlerts: machines.filter(function (m) { return m.lastMonth === thisMonth && ['Alert', 'Danger'].indexOf(m.status) !== -1 && ['Alert', 'Danger'].indexOf(m.prevStatus) === -1; }).length,
    me: { contractor: me.contractor, acc: me.acc, canApprove: me.canApprove },
  };
}

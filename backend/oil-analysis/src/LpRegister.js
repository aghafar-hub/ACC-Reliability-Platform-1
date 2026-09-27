/**
 * OA_LP_REGISTER — the lubrication-point register (spec §7: this module
 * owns LP_POINT_MASTER-equivalent data outright, unlike EQUIPMENT_MASTER
 * which stays centralized in Platform Core). Point-level write authority
 * is App Admin only, same rule as Asset Master.
 */

function listLpPoints_(session, filters) {
  var rows = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_LP_REGISTER));
  rows = filterByContractor_(session, rows, 'Contractor', true);
  filters = filters || {};
  if (filters.equipmentId) {
    rows = rows.filter(function (r) { return r.Equipment_ID === filters.equipmentId; });
  }
  if (filters.oilAnalysisRequired !== undefined) {
    var want = filters.oilAnalysisRequired ? 'Yes' : 'No';
    rows = rows.filter(function (r) { return r.Oil_Analysis_Required === want; });
  }
  if (filters.status) {
    rows = rows.filter(function (r) { return r.LP_Status === filters.status; });
  }
  return rows;
}

function getLpPoint_(session, lpId) {
  var row = findRowByColumn_(getSheet_(SHEET_NAMES.OA_LP_REGISTER), 'LP_ID', lpId);
  if (!row) throw new Error('Unknown LP_ID: ' + lpId);
  if (!isAcc_(session) && !isAppAdmin_(session) && orgIdForContractorCode_(row.Contractor) !== session.orgId) {
    throw new Error('You do not have access to this lubrication point.');
  }
  return row;
}

function createLpPoint_(session, lpData) {
  requireRole_(session, [ROLE.ADMIN]);
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.OA_LP_REGISTER);
    if (!lpData.LP_ID) throw new Error('LP_ID is required.');
    if (findRowByColumn_(sheet, 'LP_ID', lpData.LP_ID)) {
      throw new Error('A lubrication point with this LP_ID already exists.');
    }
    appendRow_(sheet, Object.assign({}, lpData, {
      LP_Status: lpData.LP_Status || 'Active',
      Created_Date: new Date(),
      Modified_Date: ''
    }));
    return { lpId: lpData.LP_ID };
  });
}

function updateLpPoint_(session, lpId, updates) {
  requireRole_(session, [ROLE.ADMIN]);
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.OA_LP_REGISTER);
    var applied = updateRowByColumn_(sheet, 'LP_ID', lpId, Object.assign({}, updates, { Modified_Date: new Date() }));
    if (!applied) throw new Error('Unknown LP_ID: ' + lpId);
    return { ok: true };
  });
}

/** Most recent change/top-up or sample date recorded for lpId, or null if none. */
function getLatestServiceDate_(lpId) {
  var changeDates = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_CHANGE_LOG))
    .filter(function (r) { return r.LP_ID === lpId && r.EventDate; })
    .map(function (r) { return new Date(r.EventDate); });
  var sampleDates = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_SAMPLES))
    .filter(function (r) { return r.LP_ID === lpId && r.SampleDate; })
    .map(function (r) { return new Date(r.SampleDate); });
  var all = changeDates.concat(sampleDates);
  if (!all.length) return null;
  return new Date(Math.max.apply(null, all.map(function (d) { return d.getTime(); })));
}

/**
 * Next due date for an analysis-required point: last service date (or the
 * point's registration date if it has never been serviced) plus the
 * ChangeDueCapYears cap (spec: hard 2-year cap, extended by a fresh cap
 * on every normal result — see DueDates.js).
 */
function computeNextDueDate_(lpId) {
  var lp = findRowByColumn_(getSheet_(SHEET_NAMES.OA_LP_REGISTER), 'LP_ID', lpId);
  if (!lp) throw new Error('Unknown LP_ID: ' + lpId);
  var capYears = Number(getSetting_('ChangeDueCapYears', 2));
  var base = getLatestServiceDate_(lpId) || (lp.Created_Date ? new Date(lp.Created_Date) : new Date());
  var due = new Date(base.getTime());
  due.setFullYear(due.getFullYear() + capYears);
  return due;
}

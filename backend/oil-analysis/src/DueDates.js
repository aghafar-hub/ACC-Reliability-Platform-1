/**
 * Due-date / auto-trigger rule — confirmed in
 * docs/oil-analysis-module-notes.md: for an analysis-required point, once
 * within SamplingCheckWindowMonths of the ChangeDueCapYears cap with no
 * sample in that same window, flag it so a Contractor Engineer can
 * schedule a sampling Routine. A normal result naturally extends the cap
 * because computeNextDueDate_ (LpRegister.js) bases the next due date on
 * the most recent sample/change date — no separate "extend" step needed.
 * An abnormal result's recommended action (what to do next) is a human
 * call by the Contractor Engineer, not automated here.
 *
 * checkDueDates_ is meant to run on a daily time-driven trigger — Apps
 * Script triggers can't be installed remotely, so add one by hand in the
 * Apps Script editor (Triggers > Add Trigger > checkDueDates_ > Time-driven
 * > Day timer) once this project is deployed. See docs/deployment-guide.md.
 */

/**
 * Public entry point for the daily trigger. Apps Script's Trigger UI hides
 * any function ending in "_" from its "Select function to run" picker —
 * every function in this codebase uses that suffix to mean "internal, not
 * a public entry point" (same reason doPost/doGet in Code.gs don't have
 * one), so checkDueDates_ itself will never show up there. Bind the
 * trigger to this wrapper instead.
 */
function runDailyDueDateCheck() {
  return checkDueDates_();
}

function checkDueDates_() {
  var checkWindowMonths = Number(getSetting_('SamplingCheckWindowMonths', 6));
  var lpRows = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_LP_REGISTER))
    .filter(function (r) { return r.Oil_Analysis_Required === 'Yes' && r.LP_Status === 'Active'; });
  var actionsSheet = getSheet_(SHEET_NAMES.OA_ACTIONS);
  var alreadyFlagged = readSheetAsObjects_(actionsSheet)
    .filter(function (r) { return r.TriggerType === 'DueDateApproaching' && r.Status === 'Open'; })
    .map(function (r) { return r.LP_ID; });

  var now = new Date();
  var flagged = [];
  lpRows.forEach(function (lp) {
    if (alreadyFlagged.indexOf(lp.LP_ID) !== -1) return;

    var dueDate = computeNextDueDate_(lp.LP_ID);
    var monthsToDue = monthsBetween_(now, dueDate);
    if (monthsToDue > checkWindowMonths) return;

    var latestSample = getLatestSampleDate_(lp.LP_ID);
    var monthsSinceSample = latestSample ? monthsBetween_(latestSample, now) : Infinity;
    if (monthsSinceSample < checkWindowMonths) return;

    appendRow_(actionsSheet, {
      ActionId: 'ACT-' + Utilities.getUuid(),
      LP_ID: lp.LP_ID,
      TriggerType: 'DueDateApproaching',
      TriggerReference: dueDate.toISOString(),
      Description: 'Due-date cap approaching (' + Utilities.formatDate(dueDate, 'Africa/Cairo', 'dd/MM/yyyy') +
        ') with no oil analysis sample in the last ' + checkWindowMonths + ' months — schedule a sampling routine.',
      Status: 'Open',
      Contractor: lp.Contractor,
      Created_Date: now
    });
    flagged.push(lp.LP_ID);
  });
  return { flaggedCount: flagged.length, flagged: flagged };
}

function getLatestSampleDate_(lpId) {
  var sampleDates = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_SAMPLES))
    .filter(function (r) { return r.LP_ID === lpId && r.SampleDate; })
    .map(function (r) { return new Date(r.SampleDate); });
  if (!sampleDates.length) return null;
  return new Date(Math.max.apply(null, sampleDates.map(function (d) { return d.getTime(); })));
}

function monthsBetween_(fromDate, toDate) {
  return (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

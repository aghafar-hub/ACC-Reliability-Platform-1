/**
 * Routine-based approval workflow — the confirmed design in
 * docs/oil-analysis-module-notes.md (Round: Routine workflow design).
 *
 * Flow: Contractor Engineer or Manager creates a Routine and assigns a
 * Technician -> Technician executes each item (change/top-up/sample),
 * marking it implemented (with date/quantity) or not implemented (with a
 * reason) -> Technician submits the whole Routine -> Contractor Engineer
 * (or Manager) reviews and approves — this is the step that actually
 * writes OA_CHANGE_LOG / OA_SAMPLES, never the technician's submission ->
 * ACC (Reliability Engineer/Manager) may add a comment at any point but
 * never blocks and is never required.
 *
 * A technician may hold multiple open Routines at once (confirmed) — each
 * is just an independent row keyed by RoutineId, so nothing special is
 * needed for that here.
 *
 * Known gap: this module has no access to Platform Core's USERS sheet, so
 * it cannot independently verify the assigned technician belongs to
 * contractorOrgId — only that the *creator* does (requireContractorMatch_).
 * Acceptable for v1 since only Contractor Engineers/Managers can create
 * Routines in the first place; flagged here for the cross-module
 * validation task if it turns out to matter in practice.
 */

var ROUTINE_STATUS = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'InProgress',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved'
};

var ITEM_TYPE = { CHANGE: 'Change', TOP_UP: 'Top-up', SAMPLE: 'Sample' };

function createRoutine_(session, input) {
  requireRole_(session, [ROLE.CONTRACTOR_ENGINEER, ROLE.MANAGER, ROLE.ADMIN]);
  requireContractorMatch_(session, input.contractorOrgId);
  if (!input.assignedTo) throw new Error('assignedTo is required.');
  if (!input.items || !input.items.length) throw new Error('A routine needs at least one item.');

  return withLock_(function () {
    var lpSheet = getSheet_(SHEET_NAMES.OA_LP_REGISTER);
    var resolvedItems = input.items.map(function (item) {
      var lp = findRowByColumn_(lpSheet, 'LP_ID', item.lpId);
      if (!lp) throw new Error('Unknown LP_ID: ' + item.lpId);
      if (!isAppAdmin_(session) && orgIdForContractorCode_(lp.Contractor) !== input.contractorOrgId) {
        throw new Error('LP_ID ' + item.lpId + ' does not belong to that contractor.');
      }
      if ([ITEM_TYPE.CHANGE, ITEM_TYPE.TOP_UP, ITEM_TYPE.SAMPLE].indexOf(item.itemType) === -1) {
        throw new Error('Invalid item type: ' + item.itemType);
      }
      return { lp: lp, itemType: item.itemType };
    });

    var routineId = 'RT-' + Utilities.getUuid();
    appendRow_(getSheet_(SHEET_NAMES.OA_ROUTINES), {
      RoutineId: routineId, CreatedBy: session.userId, AssignedTo: input.assignedTo,
      Contractor: input.contractorOrgId, CreatedDate: new Date(), Status: ROUTINE_STATUS.ASSIGNED,
      SubmittedDate: '', ApprovedBy: '', ApprovedDate: '',
      ACC_Comment: '', ACC_CommentBy: '', ACC_CommentDate: ''
    });

    var itemsSheet = getSheet_(SHEET_NAMES.OA_ROUTINE_ITEMS);
    resolvedItems.forEach(function (ri) {
      appendRow_(itemsSheet, {
        RoutineItemId: 'RI-' + Utilities.getUuid(), RoutineId: routineId, LP_ID: ri.lp.LP_ID,
        ItemType: ri.itemType, RequiredOilType: ri.lp.Lubricant_Type, Implemented: '',
        NotImplementedReason: '', ActualDate: '', ActualQuantity: '', SampleTaken: '',
        CreatedDate: new Date(), ModifiedDate: ''
      });
    });
    return { routineId: routineId };
  });
}

function getRoutine_(session, routineId) {
  var routine = findRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId);
  if (!routine) throw new Error('Unknown RoutineId: ' + routineId);
  assertRoutineAccess_(session, routine);
  var items = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_ROUTINE_ITEMS))
    .filter(function (r) { return r.RoutineId === routineId; });
  return { routine: routine, items: items };
}

function assertRoutineAccess_(session, routine) {
  if (isAppAdmin_(session) || isAcc_(session)) return;
  if (session.orgId === routine.Contractor || session.userId === routine.AssignedTo) return;
  throw new Error('You do not have access to this routine.');
}

/** Technician's own routines, or (for Contractor Engineer/Manager/ACC/Admin) their visible scope. */
function listRoutines_(session, filters) {
  var rows = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_ROUTINES));
  filters = filters || {};
  if (!isAppAdmin_(session) && !isAcc_(session)) {
    rows = rows.filter(function (r) { return r.Contractor === session.orgId || r.AssignedTo === session.userId; });
  }
  if (filters.assignedToMe) {
    rows = rows.filter(function (r) { return r.AssignedTo === session.userId; });
  }
  if (filters.status) {
    rows = rows.filter(function (r) { return r.Status === filters.status; });
  }
  return rows;
}

/**
 * Technician marks a single item done. Allowed while the routine is
 * Assigned or InProgress (i.e. before the technician has submitted it).
 */
function submitRoutineItem_(session, routineItemId, outcome) {
  return withLock_(function () {
    var itemsSheet = getSheet_(SHEET_NAMES.OA_ROUTINE_ITEMS);
    var item = findRowByColumn_(itemsSheet, 'RoutineItemId', routineItemId);
    if (!item) throw new Error('Unknown RoutineItemId: ' + routineItemId);
    var routine = findRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', item.RoutineId);
    if (!isAppAdmin_(session) && session.userId !== routine.AssignedTo) {
      throw new Error('Only the assigned technician can update this item.');
    }
    if ([ROUTINE_STATUS.ASSIGNED, ROUTINE_STATUS.IN_PROGRESS].indexOf(routine.Status) === -1) {
      throw new Error('This routine has already been submitted and can no longer be edited.');
    }
    if (!outcome.implemented && !outcome.notImplementedReason) {
      throw new Error('A reason is required when an item is not implemented.');
    }
    updateRowByColumn_(itemsSheet, 'RoutineItemId', routineItemId, {
      Implemented: !!outcome.implemented,
      NotImplementedReason: outcome.implemented ? '' : outcome.notImplementedReason,
      ActualDate: outcome.actualDate || '',
      ActualQuantity: outcome.actualQuantity || '',
      SampleTaken: outcome.sampleTaken ? true : '',
      ModifiedDate: new Date()
    });
    if (routine.Status === ROUTINE_STATUS.ASSIGNED) {
      updateRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', item.RoutineId, {
        Status: ROUTINE_STATUS.IN_PROGRESS
      });
    }
    return { ok: true };
  });
}

/** Technician finalizes the routine once every item has an outcome recorded. */
function submitRoutine_(session, routineId) {
  return withLock_(function () {
    var routine = findRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId);
    if (!routine) throw new Error('Unknown RoutineId: ' + routineId);
    if (!isAppAdmin_(session) && session.userId !== routine.AssignedTo) {
      throw new Error('Only the assigned technician can submit this routine.');
    }
    var items = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_ROUTINE_ITEMS))
      .filter(function (r) { return r.RoutineId === routineId; });
    var incomplete = items.some(function (r) { return r.Implemented === '' || r.Implemented === undefined; });
    if (incomplete) {
      throw new Error('Every item must be marked implemented or not-implemented before submitting.');
    }
    updateRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId, {
      Status: ROUTINE_STATUS.SUBMITTED, SubmittedDate: new Date()
    });
    return { ok: true };
  });
}

/**
 * Contractor Engineer or Manager (same contractor) approves — the only
 * step that writes OA_CHANGE_LOG/OA_SAMPLES. ACC never approves; it can
 * only comment (addAccComment_ below), and approval never waits on ACC.
 */
function approveRoutine_(session, routineId) {
  return withLock_(function () {
    var routine = findRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId);
    if (!routine) throw new Error('Unknown RoutineId: ' + routineId);
    requireRole_(session, [ROLE.CONTRACTOR_ENGINEER, ROLE.MANAGER, ROLE.ADMIN]);
    requireContractorMatch_(session, routine.Contractor);
    if (routine.Status !== ROUTINE_STATUS.SUBMITTED) {
      throw new Error('Only a submitted routine can be approved.');
    }

    var items = readSheetAsObjects_(getSheet_(SHEET_NAMES.OA_ROUTINE_ITEMS))
      .filter(function (r) { return r.RoutineId === routineId; });
    var lpSheet = getSheet_(SHEET_NAMES.OA_LP_REGISTER);

    items.filter(function (r) { return r.Implemented === true; }).forEach(function (item) {
      var lp = findRowByColumn_(lpSheet, 'LP_ID', item.LP_ID);
      if (item.ItemType === ITEM_TYPE.CHANGE || item.ItemType === ITEM_TYPE.TOP_UP) {
        appendRow_(getSheet_(SHEET_NAMES.OA_CHANGE_LOG), {
          EventId: 'EVT-' + Utilities.getUuid(), LP_ID: item.LP_ID, RoutineItemId: item.RoutineItemId,
          EventType: item.ItemType, EventDate: item.ActualDate || new Date(),
          QuantityUsed: item.ActualQuantity || '', OilBrandType: lp ? lp.Lubricant_Type : '',
          DoneBy: routine.AssignedTo, Contractor: lp ? lp.Contractor : '',
          ConditionNotes: '', PhotoUrl: '',
          NextDueDate: computeCapDate_(item.ActualDate || new Date()), Created_Date: new Date()
        });
      } else if (item.ItemType === ITEM_TYPE.SAMPLE) {
        appendRow_(getSheet_(SHEET_NAMES.OA_SAMPLES), {
          SampleId: 'SMP-' + Utilities.getUuid(), LP_ID: item.LP_ID, RoutineItemId: item.RoutineItemId,
          SampleDate: item.ActualDate || new Date(), ReportStatus: 'Pending',
          Contractor: lp ? lp.Contractor : '', Created_Date: new Date()
        });
      }
    });

    updateRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId, {
      Status: ROUTINE_STATUS.APPROVED, ApprovedBy: session.userId, ApprovedDate: new Date()
    });
    return { ok: true };
  });
}

function computeCapDate_(fromDate) {
  var capYears = Number(getSetting_('ChangeDueCapYears', 2));
  var due = new Date(new Date(fromDate).getTime());
  due.setFullYear(due.getFullYear() + capYears);
  return due;
}

/** ACC comment — never gates approval, available at any routine status. */
function addAccComment_(session, routineId, commentText) {
  requireRole_(session, [ROLE.RELIABILITY_ENGINEER, ROLE.MANAGER, ROLE.ADMIN]);
  if (!isAcc_(session) && !isAppAdmin_(session)) {
    throw new Error('Only ACC roles can comment here.');
  }
  return withLock_(function () {
    var applied = updateRowByColumn_(getSheet_(SHEET_NAMES.OA_ROUTINES), 'RoutineId', routineId, {
      ACC_Comment: commentText, ACC_CommentBy: session.userId, ACC_CommentDate: new Date()
    });
    if (!applied) throw new Error('Unknown RoutineId: ' + routineId);
    return { ok: true };
  });
}

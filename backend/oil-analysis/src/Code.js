/**
 * Oil Analysis Apps Script Web App entry point.
 *
 * Independent deployment from Platform Core and every other module (spec
 * §4) — its own endpoint, its own Sheet, its own failure domain. Every
 * request must carry a sessionToken issued by Platform Core; requireSession_
 * (Session.js) verifies it locally, with no callback to Platform Core.
 */

function doPost(e) {
  return safeHandle_(function () {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var session = requireSession_(body.sessionToken);

    switch (action) {
      case 'listLpPoints':
        return ok_(listLpPoints_(session, body.filters));
      case 'getLpPoint':
        return ok_(getLpPoint_(session, body.lpId));
      case 'createLpPoint':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return createLpPoint_(session, body.lpData);
        }));
      case 'updateLpPoint':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return updateLpPoint_(session, body.lpId, body.updates);
        }));

      case 'createRoutine':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return createRoutine_(session, body.input);
        }));
      case 'getRoutine':
        return ok_(getRoutine_(session, body.routineId));
      case 'listRoutines':
        return ok_(listRoutines_(session, body.filters));
      case 'submitRoutineItem':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return submitRoutineItem_(session, body.routineItemId, body.outcome);
        }));
      case 'submitRoutine':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return submitRoutine_(session, body.routineId);
        }));
      case 'approveRoutine':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return approveRoutine_(session, body.routineId);
        }));
      case 'addAccComment':
        return ok_(withIdempotency_(body.operationId, action, function () {
          return addAccComment_(session, body.routineId, body.commentText);
        }));

      case 'setSetting':
        return ok_(setSetting_(session, body.key, body.value));

      // Manual re-run of the daily due-date sweep (App Admin only) —
      // useful for testing without waiting on the time-driven trigger.
      case 'checkDueDatesNow':
        requireRole_(session, [ROLE.ADMIN]);
        return ok_(checkDueDates_());

      default:
        throw new Error('Unknown action: ' + action);
    }
  });
}

function doGet(e) {
  return safeHandle_(function () {
    return ok_({ status: 'Oil Analysis module is running' });
  });
}

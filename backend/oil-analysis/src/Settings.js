/**
 * OA_SETTINGS — flat Key/Value store for this module's tunables
 * (ChangeDueCapYears, SamplingCheckWindowMonths), same pattern as
 * Platform Core's ADMIN_SETTINGS.
 */

function getSetting_(key, defaultValue) {
  var row = findRowByColumn_(getSheet_(SHEET_NAMES.OA_SETTINGS), 'Key', key);
  return row ? row.Value : defaultValue;
}

function setSetting_(session, key, value) {
  requireRole_(session, [ROLE.ADMIN]);
  return withLock_(function () {
    var sheet = getSheet_(SHEET_NAMES.OA_SETTINGS);
    var updated = updateRowByColumn_(sheet, 'Key', key, {
      Value: value, ModifiedDate: new Date(), ModifiedBy: session.email
    });
    if (!updated) {
      appendRow_(sheet, { Key: key, Value: value, ModifiedDate: new Date(), ModifiedBy: session.email });
    }
    return { ok: true };
  });
}

// Turns a mysql2 error into an accurate, specific HTTP response instead of
// guessing. A table can have more than one foreign key (e.g.
// lubrication_points references both equipment and organizations) — a
// route that assumes "any FK violation must be about the field I care
// about" gives a misleading error when a DIFFERENT FK actually failed.
// mysql2's err.sqlMessage always names the real constraint
// (CONSTRAINT `fk_x` FOREIGN KEY ...), so parse that instead of assuming.
//
// `constraintMessages` maps constraint name -> the message to send back,
// e.g. { fk_lp_equipment: "Equipment ... does not exist", fk_lp_org: "..." }.
// Returns null if `err` isn't a foreign-key violation at all, so callers can
// fall through to their own duplicate-key handling or rethrow.
export function friendlyForeignKeyError(err, constraintMessages) {
  if (err.code !== "ER_NO_REFERENCED_ROW_2" && err.code !== "ER_ROW_IS_REFERENCED_2") return null;
  const match = /CONSTRAINT `([^`]+)`/.exec(err.sqlMessage || "");
  const constraintName = match?.[1];
  return constraintMessages[constraintName] || "Referenced record does not exist";
}

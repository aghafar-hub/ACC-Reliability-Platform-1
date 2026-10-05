// Shared helper for writing to audit_log (database/schema/00_core.sql) —
// replaces Oil Lubrication's own "Audit Log" sheet, made generic so every
// module can use the same mechanism instead of reinventing it (schema
// survey finding #6 territory, applied to audit trails specifically).
//
// `conn` is whatever executes a query — pass the pool directly for a
// single-statement write, or a transaction connection (conn.getConnection())
// when the audit entry needs to commit atomically with the change it's
// describing (e.g. routines.js's approve handler).
//
// Deliberately NOT wired into every mutating endpoint yet — only
// routines.js's approve action calls this so far, as a proven, tested
// example of the mechanism end-to-end. Which other actions deserve an
// audit trail (every write? only approvals/status changes? user admin
// actions?) is a product decision for the user to prioritize, not
// something to retrofit blind across ~15 endpoints in one pass.
export async function writeAuditLog(conn, { moduleId, entityType, entityId, action, actingUserId, orgId, summary }) {
  await conn.query(
    `INSERT INTO audit_log (module_id, entity_type, entity_id, action, acting_user_id, org_id, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [moduleId, entityType, entityId, action, actingUserId || null, orgId || null, summary || null],
  );
}

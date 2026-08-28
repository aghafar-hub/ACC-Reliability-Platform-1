/**
 * Asset Master — Foundation spec §7.
 *
 * EQUIPMENT_MASTER / LP_POINT_MASTER / VIB_POINT_MASTER are read by every
 * module but written only through these functions, which must call
 * requireAppAdmin_() before any create/update — no other role may add
 * equipment, add a contractor, or reassign equipment's contractor.
 *
 * Contractor reassignment is immediate and total (spec §6.2): the moment
 * an equipment's Contractor changes, the previous contractor's users
 * lose all access to it and its history, enforced automatically because
 * every query filters live on the current Contractor value — no separate
 * "revoke access" step needed, but this must be verified by the
 * contractor-isolation regression check (spec §10a) once built.
 *
 * STATUS: skeleton — full implementation, including the guided
 * Excel/CSV import tool (upload -> preview -> confirm), is a dedicated
 * task ("Build Apps Script backend: Asset Master + import tool").
 */

function listEquipment_(userId, filters) {
  // TODO: apply getContractorScope_(userId) + filters (area, status, criticality...)
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

function createEquipment_(userId, equipmentData) {
  requireAppAdmin_(userId);
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

function reassignEquipmentContractor_(userId, equipmentId, newContractorId) {
  requireAppAdmin_(userId);
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

function createContractor_(userId, contractorName) {
  requireAppAdmin_(userId);
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

/**
 * Import workflow, per spec §7: upload -> preview (parsed rows, no
 * write yet) -> confirm (atomic apply). previewImport_ and
 * commitImport_ are separate calls so the UI can show a preview before
 * anything is written.
 */
function previewImport_(userId, fileBlob) {
  requireAppAdmin_(userId);
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

function commitImport_(userId, previewToken) {
  requireAppAdmin_(userId);
  throw new Error('Not yet implemented — see Task: Build Apps Script backend: Asset Master + import tool');
}

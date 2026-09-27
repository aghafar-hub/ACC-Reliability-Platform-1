// Shared between EditActionModal (manual add/edit) and
// GenerateMonthlyActionsModal (bulk auto-create) — both need the exact same
// "pick equipment -> prefill Description/Oil Type/Contractor/Last
// Change/Prev. Month Agreed Action" logic so the two paths can't drift.

// "26 Mar 2026"-style (or any parseable) date -> "2026-03-26" for
// <input type="date">, using local date parts so it can't shift by a day
// against a UTC conversion.
export function toISODate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Picks the most recently changed Oil Change Log row for an equipment (it
// can have several lubrication points) — used to prefill Last Change Date
// and to default which lubrication point a Last Change edit applies to.
export function latestOilChangeFor(oilChanges, equipmentCode) {
  const rows = (oilChanges || []).filter((o) => o.equipmentCode === equipmentCode && o.changeDate);
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (new Date(a.changeDate) > new Date(b.changeDate) ? a : b));
}

// Most recent PRIOR action for an equipment (excluding the action being
// edited itself, when there is one) — its Agreed Action becomes the new
// action's starting "Prev. Month Agreed Action", so a reviewer can see
// whether last time's agreed action was actually followed up on.
export function lastAgreedActionFor(allActions, equipmentCode, excludeId) {
  const rows = (allActions || []).filter((a) => a.equipmentCode === equipmentCode && a._id !== excludeId && a.agreedAction);
  if (rows.length === 0) return "";
  const latest = rows.reduce((a, b) =>
    new Date(a.revisionDate || a.sampleDate || 0) > new Date(b.revisionDate || b.sampleDate || 0) ? a : b
  );
  return latest.agreedAction || "";
}

// Equipment Registry -> action-field autofill: Description, Oil Type
// (Lubricant Grade), and Contractor come straight from the registry row;
// Last Change Date is inherited from that equipment's Oil Change Log entry;
// Prev. Month Agreed Action is inherited from this equipment's last action.
export function autofillFromEquipment(code, { equipmentRegistry, oilChanges, allActions, excludeId }) {
  const reg = (equipmentRegistry || []).find((r) => r.code === code);
  const latest = latestOilChangeFor(oilChanges, code);
  return {
    equipmentCode: code,
    description: reg?.description || "",
    oilType: reg?.lubricant || "",
    contractor: reg?.contractor || "",
    lastChange: latest ? toISODate(latest.changeDate) : "",
    prevMonthAgreedAction: lastAgreedActionFor(allActions, code, excludeId),
  };
}

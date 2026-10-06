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

// "Last Previous Action": the Agreed Action of the most recent EARLIER
// action on the same point (excluding the action being edited itself, and
// anything revised after it), so a reviewer can see whether last time's
// agreed action was actually followed up on. Always computed, never typed.
export function lastAgreedActionFor(allActions, equipmentCode, excludeId, beforeDate) {
  const limit = beforeDate ? new Date(beforeDate) : null;
  const rows = (allActions || []).filter((a) => {
    if (a.equipmentCode !== equipmentCode || a._id === excludeId || !a.agreedAction) return false;
    if (!limit || Number.isNaN(limit.getTime())) return true;
    const d = new Date(a.revisionDate || a.sampleDate || 0);
    return Number.isNaN(d.getTime()) || d.getTime() <= limit.getTime();
  });
  if (rows.length === 0) return "";
  const latest = rows.reduce((a, b) =>
    new Date(a.revisionDate || a.sampleDate || 0) > new Date(b.revisionDate || b.sampleDate || 0) ? a : b
  );
  return latest.agreedAction || "";
}

// Most recent sample for an equipment — Sample Date defaults to it (still
// changeable via the Sample Date dropdown, which re-derives Sample Result/
// Sample Analysis for whichever date is actually picked — see
// EditActionModal.jsx's selectSampleDate).
export function latestSampleFor(samples, equipmentCode) {
  const rows = (samples || []).filter((sm) => sm.unitId === equipmentCode && sm.sampledDate);
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (new Date(a.sampledDate) > new Date(b.sampledDate) ? a : b));
}

// Equipment Registry -> action-field autofill: Description, Oil Type
// (Lubricant Grade), Contractor, and Report Equipment ID come straight from
// the registry row; Last Change Date is inherited from that equipment's Oil
// Change Log (never typed — the log is updated by confirmed oil-change
// routes); Last Previous Action is this equipment's last earlier agreed
// action; Sample Date/Result/Analysis are inherited from
// this equipment's own most recent sample.
export function autofillFromEquipment(code, { equipmentRegistry, oilChanges, allActions, samples, excludeId, revisionDate }) {
  const reg = (equipmentRegistry || []).find((r) => r.code === code);
  const latest = latestOilChangeFor(oilChanges, code);
  const latestSample = latestSampleFor(samples, code);
  return {
    equipmentCode: code,
    reportEquipmentId: reg?.reportEquipmentId || "",
    description: reg?.description || "",
    oilType: reg?.lubricant || "",
    contractor: reg?.contractor || "",
    lastChange: latest ? toISODate(latest.changeDate) : "",
    prevMonthAgreedAction: lastAgreedActionFor(allActions, code, excludeId, revisionDate),
    sampleDate: latestSample?.sampledDate || "",
    sampleResult: (latestSample?.reportStatus || "").toUpperCase(),
    sampleAnalysis: (latestSample?.recommendations || []).join("; "),
  };
}

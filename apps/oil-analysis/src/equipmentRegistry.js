import { DEFAULT_EQUIPMENT_REGISTRY } from "./equipmentRegistryDefault";

// Matches the original app's own architecture: the equipment registry is
// NOT part of the regular sample/action/oil-change sync. It's a hardcoded
// default list — pulled from the live "Equipment Registry" sheet tab
// (152 rows, all 10 columns including Area and Contractor) rather than the
// original bundle's own stale snapshot, which predated the Contractor
// column and had no Area data at all — that a user can override by
// explicitly running "Sync Equipment Registry" in Settings → Configuration,
// which persists the result under this same localStorage key so it
// survives across sessions independent of the sample/action cache.
const KEY = "oilapp_equipment_registry";

// The sheet DOES carry Contractor (column J) — the Apps Script's
// readEquipmentRegistry() just never read that far (it stopped at column
// I / Area), so every "Sync Equipment Registry" run in Settings overwrote
// each synced equipment with a contractor-less record from the backend,
// silently wiping the field. That backend function is fixed too now, but
// browsers that already ran a sync before both fixes landed are stuck with
// the emptied-out result in localStorage, and the backend fix alone can't
// reach back and repair it — this backfills any equipment still missing
// its contractor from the bundled default (itself a real snapshot of the
// sheet) so those sessions repair themselves on next load. It's a stopgap:
// running "Sync Equipment Registry" again after the backend fix is applied
// pulls each equipment's real, current contractor straight from column J.
function backfillContractor(list) {
  const defaultByCode = new Map(DEFAULT_EQUIPMENT_REGISTRY.map((r) => [r.code, r]));
  let changed = false;
  const fixed = list.map((eq) => {
    if (eq.contractor) return eq;
    const fallback = defaultByCode.get(eq.code)?.contractor;
    if (!fallback) return eq;
    changed = true;
    return { ...eq, contractor: fallback };
  });
  return changed ? fixed : list;
}

export function loadEquipmentRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const healed = backfillContractor(parsed);
        if (healed !== parsed) saveEquipmentRegistry(healed);
        return healed;
      }
    }
  } catch {
    // ignore — fall through to default
  }
  return DEFAULT_EQUIPMENT_REGISTRY;
}

export function saveEquipmentRegistry(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore — localStorage may be unavailable
  }
}

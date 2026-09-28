import { DEFAULT_EQUIPMENT_REGISTRY } from "./equipmentRegistryDefault";

// Matches the original app's own architecture: the equipment registry is
// NOT part of the regular sample/action/oil-change sync. It's a hardcoded
// default list — pulled from the live "Equipment Registry" sheet tab, one
// row per LP_ID — that a user can override by explicitly running "Sync
// Equipment Registry" in Settings → Configuration, which persists the
// result under this same localStorage key so it survives across sessions
// independent of the sample/action cache.
const KEY = "oilapp_equipment_registry";

export function loadEquipmentRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

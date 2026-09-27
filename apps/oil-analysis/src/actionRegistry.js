import { DEFAULT_ACTION_REGISTRY } from "./actionRegistryDefault";

// Same pattern as equipmentRegistry.js: a baked-in default list, overridable
// by explicitly syncing from the "Action Registry" sheet tab in Settings,
// persisted here independent of the regular sample/action/oil-change cache.
const KEY = "oilapp_action_registry";

export function loadActionRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore — fall through to default
  }
  return DEFAULT_ACTION_REGISTRY;
}

export function saveActionRegistry(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore — localStorage may be unavailable
  }
}

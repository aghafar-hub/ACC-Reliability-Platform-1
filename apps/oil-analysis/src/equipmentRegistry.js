// The equipment registry (one row per LP_ID) comes with the startup data
// from the server — only this person's contractor's points — and is kept
// under this localStorage key for the next start. There is no built-in
// list any more (audit F-13): it was 0.6 MB of every contractor's points in
// every download; until the first answer the list is just empty.
const KEY = "oilapp_equipment_registry";

export function loadEquipmentRegistry() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore — nothing kept yet
  }
  return [];
}

export function saveEquipmentRegistry(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore — localStorage may be unavailable
  }
}

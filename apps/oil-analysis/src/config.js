const KEY = "acc_oilapp_config";

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // ignore — localStorage may be unavailable (private browsing, quota)
  }
}

const CACHE_PREFIX = "acc_oilapp_cache_";

export function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { data: parsed.data, ageMinutes: (Date.now() - parsed.timestamp) / 60000 };
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

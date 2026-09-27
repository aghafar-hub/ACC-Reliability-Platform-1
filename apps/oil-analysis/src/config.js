const KEY = "acc_oilapp_config";

// The production Google Apps Script Web App URL and the Google Sheet it
// reads/writes — used as defaults until Settings → Configuration overrides
// them, same pattern as apps/vibration-analysis/src/config.js.
export const DEFAULT_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbx3GDHY_1njtZ5wO5684BuYyslzuzB7GvAchJQtnBCynVOCLxfJ0ZnNm9oXWhqk36Lt/exec";
export const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1ckDYD5vjRIyFc7vBK1cqHJHhlI8KuwmRtucgtrfZXto/edit";

const DEFAULT_CONFIG = {
  webhookUrl: DEFAULT_WEBHOOK_URL,
  sheetUrl: DEFAULT_SHEET_URL,
};

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
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

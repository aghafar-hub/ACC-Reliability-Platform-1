// Local (per-browser) persistence for connection settings, the logo URL, and
// per-equipment threshold overrides — ported from the original bundle's `en`
// object and its supporting constants. Keys match the original exactly so
// that a browser which already has the original app's localStorage populated
// (same origin) keeps working with this rebuild without needing to
// reconfigure anything.

export const APP_VERSION = "3.1.0"; // original bundle's `Yf`

const CONFIG_KEY = "app_config_v3"; // original `Ua`
const LOGO_KEY = "app_logo_url"; // original `Va`
export const THRESHOLDS_KEY = "vib_thresholds_v3"; // per-equipment RMS/SPM limit overrides

// The production Google Apps Script Web App URL shipped hardcoded in the
// original bundle (its `Vl` constant) — used as the default `webhookUrl`
// until Settings → Configuration overrides it, and as the placeholder text
// in that field.
export const DEFAULT_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzZdGU1307BiHsHGSsZmwC-7JwZWKJoMzRiRCdUFkHySdRkRxRT6dQp3y1sS1leAPu9/exec";

// Default logo (Arabian Cement, hosted on Google Drive) — original `fn`.
export const DEFAULT_LOGO_URL = "https://drive.google.com/uc?export=view&id=18yKS0deihECxq7i-XD4aXNM49KazppDx";

export const DEFAULT_CONFIG = {
  webhookUrl: DEFAULT_WEBHOOK_URL,
  googleSheetUrl: "",
  contractors: "RHI,ASEC",
  // Both fields exist in the original's default config object and are shown
  // nowhere in the UI (no Settings control reads or writes them) — no
  // setInterval/auto-sync loop exists anywhere in the bundle either. They
  // look like a shipped-but-unwired feature. Kept here for parity; nothing
  // in this rebuild acts on them either.
  autoSyncMinutes: 5,
  enableAutoSync: false,
};

export const configStore = {
  load() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  },
  save(config) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      return true;
    } catch {
      return false;
    }
  },
  loadLogo() {
    try {
      return localStorage.getItem(LOGO_KEY) || DEFAULT_LOGO_URL;
    } catch {
      return DEFAULT_LOGO_URL;
    }
  },
  saveLogo(url) {
    try {
      localStorage.setItem(LOGO_KEY, url);
      return true;
    } catch {
      return false;
    }
  },
};

// Converts a Google Drive "share" link (…/file/d/<id>/view or ?id=<id>) into
// a direct-viewable image URL. Anything already in `uc?export=view` form, or
// any non–Drive URL, passes through unchanged.
export function toDriveDirectUrl(url) {
  if (!url || !url.trim()) return DEFAULT_LOGO_URL;
  const trimmed = url.trim();
  if (trimmed.includes("drive.google.com/uc")) return trimmed;
  const match = trimmed.match(/\/file\/d\/([^/?\s]+)/) || trimmed.match(/[?&]id=([^&\s]+)/);
  return match ? `https://drive.google.com/uc?export=view&id=${match[1]}` : trimmed;
}

export function loadThresholdOverrides() {
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveThresholdOverrides(overrides) {
  try {
    localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(overrides));
  } catch {
    // ignore — localStorage may be unavailable
  }
}

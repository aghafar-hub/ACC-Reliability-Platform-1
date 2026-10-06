/**
 * Backend endpoint configuration. Platform Core's URL is build-time config
 * (there's nowhere to discover it from — it's the login authority itself);
 * Oil Analysis's URL is also read from env for now rather than fetched from
 * Platform Core's MODULE_REGISTRY at runtime, to keep the login path free
 * of an extra network round trip. If more modules are added, revisit this
 * in favor of fetching MODULE_REGISTRY once after login.
 *
 * Set these in frontend/.env.local (gitignored — see .env.example).
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `Missing ${key} — copy frontend/.env.example to frontend/.env.local and fill in your deployed Apps Script Web App URLs.`,
    );
  }
  return value;
}

export const PLATFORM_CORE_URL = requireEnv('VITE_PLATFORM_CORE_URL');
export const OIL_ANALYSIS_URL = requireEnv('VITE_OIL_ANALYSIS_URL');

// Optional: only needed to point a test build at a test copy of the
// Vibration backend. Without it, the live URL baked into
// apps/vibration-analysis/src/config.js is used, same as before Phase 0.
export const VIBRATION_ANALYSIS_URL: string =
  import.meta.env.VITE_VIBRATION_ANALYSIS_URL ||
  'https://script.google.com/macros/s/AKfycbzBSXj7ugvqgd_KnTPOXpISmTDeQ4aB3CcIaMAg4RUnbJ6fZO03uOCqS8ekxlxLPaW9Kw/exec';

// Shared theme palette list for the platform-level Settings page. Both
// embedded apps (apps/oil-analysis/src/theme.js, apps/vibration-analysis/src/theme.js)
// define these same 10 palettes with matching names and colors — this file
// only duplicates the handful of colors needed to preview each one here,
// since those apps are separate builds this project can't import from
// directly (see apps/*'s own vite.embed.config.js for how they're built).
export type ThemePreview = { name: string; appBg: string; sidebarBg: string; accent: string };

export const THEME_PREVIEWS: ThemePreview[] = [
  { name: 'Navy Dark', appBg: '#0A1628', sidebarBg: '#0D1E35', accent: '#00B4D8' },
  { name: 'Midnight Blue', appBg: '#0D0F1A', sidebarBg: '#12152B', accent: '#7C6FE6' },
  { name: 'Forest Green', appBg: '#0A1A12', sidebarBg: '#0D2019', accent: '#2DC653' },
  { name: 'Slate Light', appBg: '#EEF2F6', sidebarBg: '#FFFFFF', accent: '#0078A0' },
  { name: 'Warm Sand', appBg: '#F0EBE0', sidebarBg: '#FDF7EE', accent: '#B06010' },
  { name: 'Pearl White', appBg: '#F7F8FA', sidebarBg: '#FFFFFF', accent: '#2563EB' },
  { name: 'Sky Blue', appBg: '#EFF6FF', sidebarBg: '#DBEAFE', accent: '#0369A1' },
  { name: 'Rose Light', appBg: '#FFF1F2', sidebarBg: '#FFFFFF', accent: '#BE123C' },
  { name: 'Mint Fresh', appBg: '#F0FDF4', sidebarBg: '#FFFFFF', accent: '#15803D' },
  { name: 'Carbon Dark', appBg: '#111111', sidebarBg: '#1C1C1C', accent: '#E63946' },
];

export const THEME_NAMES = THEME_PREVIEWS.map((t) => t.name);
export const DEFAULT_THEME = 'Navy Dark';

const PLATFORM_THEME_KEY = 'acc.platformTheme';
const OIL_ANALYSIS_CONFIG_KEY = 'acc_oilapp_config'; // apps/oil-analysis/src/config.js
const VIBRATION_ANALYSIS_THEME_KEY = 'selected_theme'; // apps/vibration-analysis/src/ThemeContext.jsx

export function getPlatformTheme(): string {
  try {
    const stored = localStorage.getItem(PLATFORM_THEME_KEY);
    return stored && THEME_NAMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// Writes the choice into our own key (for the Settings page itself) plus
// both embedded apps' own storage, so a fresh mount of either one already
// starts on the right theme without needing a live push at all — the live
// push (see embeddedNav.tsx's setTheme) only matters for an app that's
// already mounted at the moment the theme changes.
export function persistPlatformTheme(name: string): void {
  try {
    localStorage.setItem(PLATFORM_THEME_KEY, name);
  } catch {
    // ignore — localStorage may be unavailable
  }
  try {
    const raw = localStorage.getItem(OIL_ANALYSIS_CONFIG_KEY);
    const cfg = raw ? JSON.parse(raw) : {};
    cfg.themeName = name;
    localStorage.setItem(OIL_ANALYSIS_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(VIBRATION_ANALYSIS_THEME_KEY, name);
  } catch {
    // ignore
  }
}

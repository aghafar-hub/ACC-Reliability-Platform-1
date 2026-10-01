// Shared theme palette list — drives both the platform Settings picker and
// the shell's own chrome (Sidebar, Dashboard, every page). Both embedded
// apps (apps/oil-analysis/src/theme.js, apps/vibration-analysis/src/theme.js)
// define these same 10 palettes with matching names and colors — this file
// duplicates the tokens needed here since those apps are separate builds
// this project can't import from directly (see each app's own
// vite.embed.config.js).
export type ThemePalette = {
  name: string;
  appBg: string;
  sidebarBg: string;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentText: string;
};

export const THEME_PALETTES: ThemePalette[] = [
  { name: 'Navy Dark', appBg: '#0A1628', sidebarBg: '#0D1E35', cardBg: '#0D1E35', border: '#1E3A5F', textPrimary: '#E8F4FD', textSecondary: '#6B8CAE', accent: '#00B4D8', accentText: '#0A1628' },
  { name: 'Midnight Blue', appBg: '#0D0F1A', sidebarBg: '#12152B', cardBg: '#12152B', border: '#252A4A', textPrimary: '#E6E8FF', textSecondary: '#7B82C0', accent: '#7C6FE6', accentText: '#FFFFFF' },
  { name: 'Forest Green', appBg: '#0A1A12', sidebarBg: '#0D2019', cardBg: '#0D2019', border: '#1A3A28', textPrimary: '#E8F5EE', textSecondary: '#5A9A70', accent: '#2DC653', accentText: '#0A1A12' },
  { name: 'Slate Light', appBg: '#EEF2F6', sidebarBg: '#FFFFFF', cardBg: '#FFFFFF', border: '#CBD8E4', textPrimary: '#0F1E2D', textSecondary: '#3D5470', accent: '#0078A0', accentText: '#FFFFFF' },
  { name: 'Warm Sand', appBg: '#F0EBE0', sidebarBg: '#FDF7EE', cardBg: '#FDF7EE', border: '#CEC0A0', textPrimary: '#1E1008', textSecondary: '#60400A', accent: '#B06010', accentText: '#FFFFFF' },
  { name: 'Pearl White', appBg: '#F7F8FA', sidebarBg: '#FFFFFF', cardBg: '#FFFFFF', border: '#E2E8F0', textPrimary: '#0F172A', textSecondary: '#475569', accent: '#2563EB', accentText: '#FFFFFF' },
  { name: 'Sky Blue', appBg: '#EFF6FF', sidebarBg: '#DBEAFE', cardBg: '#FFFFFF', border: '#BFDBFE', textPrimary: '#1E3A5F', textSecondary: '#3B6EA5', accent: '#0369A1', accentText: '#FFFFFF' },
  { name: 'Rose Light', appBg: '#FFF1F2', sidebarBg: '#FFFFFF', cardBg: '#FFFFFF', border: '#FECDD3', textPrimary: '#3B0A14', textSecondary: '#9F3040', accent: '#BE123C', accentText: '#FFFFFF' },
  { name: 'Mint Fresh', appBg: '#F0FDF4', sidebarBg: '#FFFFFF', cardBg: '#FFFFFF', border: '#BBF7D0', textPrimary: '#052E16', textSecondary: '#166534', accent: '#15803D', accentText: '#FFFFFF' },
  { name: 'Carbon Dark', appBg: '#111111', sidebarBg: '#1C1C1C', cardBg: '#1C1C1C', border: '#303030', textPrimary: '#F2F2F2', textSecondary: '#A0A0A0', accent: '#E63946', accentText: '#FFFFFF' },
  // New theme (Patch 27) — matches the same palette added to both embedded
  // apps' own theme.js files, kept in sync so the shell's own chrome looks
  // identical to the embedded modules under this theme.
  { name: 'ACC Corporate', appBg: '#F4F6F9', sidebarBg: '#0B2340', cardBg: '#FFFFFF', border: '#D7DEE8', textPrimary: '#0F1E2D', textSecondary: '#5B6B7F', accent: '#2563EB', accentText: '#FFFFFF' },
];

export const THEME_NAMES = THEME_PALETTES.map((t) => t.name);
export const DEFAULT_THEME = 'Navy Dark';

export function getThemePalette(name: string): ThemePalette {
  return THEME_PALETTES.find((t) => t.name === name) ?? THEME_PALETTES[0];
}

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

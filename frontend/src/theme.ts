// The platform's five themes (design system, D1) — three light (ACC Light,
// the default; Warm Paper; High Contrast) and two dark (Navy Dark, Carbon
// Dark). Both embedded apps (apps/oil-analysis/src/theme.js,
// apps/vibration-analysis/src/theme.js) define the same five, generated from
// one list so the colours never drift; this file keeps the tokens the
// shell's own chrome needs. Only surfaces and text change between themes —
// danger / warning / success always mean Alert / Caution / Normal and accent
// is the one action colour; every text/background pair meets WCAG AA.
export type ThemePalette = {
  name: string;
  appBg: string;
  sidebarBg: string;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  // Text on the sidebar/rail, which is dark in every theme (also the light ones).
  sidebarText: string;
  sidebarTextSecondary: string;
  accent: string;
  accentText: string;
  topbarBg: string;
  textMuted: string;
  danger: string;
  warning: string;
  success: string;
  dark: boolean;
};

export const THEME_PALETTES: ThemePalette[] = [
  { name: 'ACC Light', appBg: '#F3F5F8', sidebarBg: '#0B1B2E', cardBg: '#FFFFFF', border: '#D9E0E8', textPrimary: '#0F1B2D', textSecondary: '#4A5A70', sidebarText: '#E8F0F8', sidebarTextSecondary: '#A9B8CC', accent: '#1E5BB8', accentText: '#FFFFFF', topbarBg: '#FFFFFF', textMuted: '#5F6D82', danger: '#C42B2B', warning: '#9A5500', success: '#18734A', dark: false },
  { name: 'Warm Paper', appBg: '#F5F1E8', sidebarBg: '#2B2620', cardBg: '#FFFDF7', border: '#E2D9C6', textPrimary: '#2A2418', textSecondary: '#5A4E3C', sidebarText: '#F3ECDD', sidebarTextSecondary: '#BFB29A', accent: '#1F58A8', accentText: '#FFFFFF', topbarBg: '#FFFDF7', textMuted: '#716553', danger: '#B8322A', warning: '#995500', success: '#1E7346', dark: false },
  { name: 'High Contrast', appBg: '#FFFFFF', sidebarBg: '#000000', cardBg: '#FFFFFF', border: '#1A1A1A', textPrimary: '#000000', textSecondary: '#1A1A1A', sidebarText: '#FFFFFF', sidebarTextSecondary: '#E0E0E0', accent: '#0A3A8C', accentText: '#FFFFFF', topbarBg: '#000000', textMuted: '#333333', danger: '#A80000', warning: '#7A4300', success: '#00602E', dark: false },
  { name: 'Navy Dark', appBg: '#0A1628', sidebarBg: '#0D1E35', cardBg: '#0F2138', border: '#1F3A5C', textPrimary: '#E8F1FA', textSecondary: '#B6C7DA', sidebarText: '#E8F1FA', sidebarTextSecondary: '#9FB4CB', accent: '#4C9BFF', accentText: '#06142A', topbarBg: '#0D1E35', textMuted: '#8AA2BC', danger: '#FF6B6B', warning: '#F2A541', success: '#4CC38A', dark: true },
  { name: 'Carbon Dark', appBg: '#0E0F11', sidebarBg: '#141619', cardBg: '#17191C', border: '#2A2E33', textPrimary: '#ECEDEE', textSecondary: '#BFC3C8', sidebarText: '#ECEDEE', sidebarTextSecondary: '#A4AAB1', accent: '#5B9BFF', accentText: '#0B1424', topbarBg: '#141619', textMuted: '#8E949B', danger: '#FF6B6B', warning: '#F2A541', success: '#4CC38A', dark: true },
];

// Names from before the five-theme set map to their nearest new theme
// (light to light, dark to dark) — anyone who had picked one keeps a close look.
export const LEGACY_THEME_NAMES: Record<string, string> = {
  "Midnight Blue": "Navy Dark",
  "Forest Green": "Navy Dark",
  "Vivid Spectrum": "Navy Dark",
  "Slate Light": "ACC Light",
  "Pearl White": "ACC Light",
  "Sky Blue": "ACC Light",
  "Mint Fresh": "ACC Light",
  "ACC Corporate": "ACC Light",
  "Vivid Spectrum Light": "ACC Light",
  "Warm Sand": "Warm Paper",
  "Rose Light": "Warm Paper",
};

export const THEME_NAMES = THEME_PALETTES.map((t) => t.name);
export const DEFAULT_THEME = 'ACC Light';

export function resolveThemeName(name: string | null | undefined): string {
  if (name && THEME_NAMES.includes(name)) return name;
  if (name && LEGACY_THEME_NAMES[name]) return LEGACY_THEME_NAMES[name];
  return DEFAULT_THEME;
}

export function getThemePalette(name: string): ThemePalette {
  return THEME_PALETTES.find((t) => t.name === name) ?? THEME_PALETTES[0];
}

const PLATFORM_THEME_KEY = 'acc.platformTheme';
const OIL_ANALYSIS_CONFIG_KEY = 'acc_oilapp_config'; // apps/oil-analysis/src/config.js
const VIBRATION_ANALYSIS_THEME_KEY = 'selected_theme'; // apps/vibration-analysis/src/ThemeContext.jsx

export function getPlatformTheme(): string {
  try {
    return resolveThemeName(localStorage.getItem(PLATFORM_THEME_KEY));
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
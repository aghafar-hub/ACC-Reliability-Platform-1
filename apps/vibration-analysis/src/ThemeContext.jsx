import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { THEMES, DEFAULT_THEME, buildStyles } from "./theme";

const THEME_STORAGE_KEY = "selected_theme"; // matches the original bundle's own key exactly

const ThemeContext = createContext(null);

// Pushes the active palette onto CSS custom properties on <html>, mirroring
// the original's Bs() theme-switch function. Nothing in this rebuild reads
// these variables (every component gets colors through useTheme() instead),
// but the inline <style> block in index.html's original app used a couple
// of them (scrollbar, background) — keeping them set means anything relying
// on that global styling still looks right.
function applyDocumentVars(T) {
  try {
    const root = document.documentElement;
    root.style.setProperty("--primary", T.accent);
    root.style.setProperty("--background", T.appBg);
    root.style.setProperty("--surface", T.sidebarBg);
    root.style.setProperty("--text", T.textPrimary);
    root.style.setProperty("--text-secondary", T.textSecondary);
    root.style.setProperty("--border", T.border);
    root.style.setProperty("--success", T.success);
    root.style.setProperty("--warning", T.warning);
    root.style.setProperty("--danger", T.danger);
    root.style.setProperty("--info", T.info);
    root.style.setProperty("--purple", T.purple || T.accent);
    root.style.setProperty("--accent", T.accent);
    root.style.setProperty("--accent-text", T.accentText);
    root.style.setProperty("--scrollbar", T.scrollThumb);
    document.body.style.background = T.appBg;
    document.body.style.color = T.textPrimary;
  } catch {
    // documentElement/body can be unavailable in non-browser test environments
  }
}

export function ThemeProvider({ children }) {
  const [themeName, setThemeNameState] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored && THEMES[stored] ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    applyDocumentVars(THEMES[themeName] || THEMES[DEFAULT_THEME]);
  }, [themeName]);

  const setThemeName = (name) => {
    if (!THEMES[name]) return;
    setThemeNameState(name);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch {
      // localStorage may be unavailable (private browsing, quota)
    }
  };

  const value = useMemo(() => {
    const T = THEMES[themeName] || THEMES[DEFAULT_THEME];
    return { T, s: buildStyles(T), themeName, setThemeName };
  }, [themeName]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return ctx;
}

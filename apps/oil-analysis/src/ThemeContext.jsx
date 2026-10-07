import { createContext, useContext, useMemo } from "react";
import { THEMES, buildStyles, resolveThemeName } from "./theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ themeName, children }) {
  const value = useMemo(() => {
    // an old theme name (from before the five-theme set) maps to its nearest
    const name = resolveThemeName(themeName);
    const T = THEMES[name];
    return { T, s: buildStyles(T), themeName: name };
  }, [themeName]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return ctx;
}

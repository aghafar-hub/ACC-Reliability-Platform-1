import { createContext, useContext, useMemo } from "react";
import { THEMES, DEFAULT_THEME, buildStyles } from "./theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ themeName, children }) {
  const value = useMemo(() => {
    const T = THEMES[themeName] || THEMES[DEFAULT_THEME];
    return { T, s: buildStyles(T), themeName: THEMES[themeName] ? themeName : DEFAULT_THEME };
  }, [themeName]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return ctx;
}

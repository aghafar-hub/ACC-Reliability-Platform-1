import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useEmbeddedNav } from './embeddedNav';
import { getPlatformTheme, getThemePalette, persistPlatformTheme, type ThemePalette } from './theme';

// The single source of truth for the platform theme — drives the shell's
// own chrome (Sidebar, every page, via CSS custom properties set in
// App.tsx) in addition to the two embedded modules (via persistPlatformTheme
// + embeddedNav's pushTheme, unchanged from before). Choosing a theme here
// re-renders the whole shell immediately, which is what makes it visible on
// every tab, not just on the Settings page itself.
type ShellThemeContextValue = {
  themeName: string;
  palette: ThemePalette;
  setThemeName: (name: string) => void;
};

const ShellThemeContext = createContext<ShellThemeContextValue | null>(null);

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const embeddedNav = useEmbeddedNav();
  const [themeName, setThemeNameState] = useState(() => getPlatformTheme());

  const value = useMemo<ShellThemeContextValue>(
    () => ({
      themeName,
      palette: getThemePalette(themeName),
      setThemeName: (name: string) => {
        setThemeNameState(name);
        persistPlatformTheme(name);
        embeddedNav.pushTheme(name);
      },
    }),
    [themeName, embeddedNav],
  );

  return <ShellThemeContext.Provider value={value}>{children}</ShellThemeContext.Provider>;
}

export function useShellTheme(): ShellThemeContextValue {
  const ctx = useContext(ShellThemeContext);
  if (!ctx) throw new Error('useShellTheme must be used within ShellThemeProvider');
  return ctx;
}

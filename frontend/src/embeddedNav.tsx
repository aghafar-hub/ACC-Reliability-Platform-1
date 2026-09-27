import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * navBridge is a plain JS object (not React state) handed to an embedded
 * app's mount function — see each app's own src/embed.jsx. It's the seam across
 * the React 18/19 root boundary: the embedded app sets `.navigate` to its
 * own internal navigate function, and calls `.onNavigate(page)` whenever
 * its page changes so we can mirror it here.
 */
export type NavBridge = {
  navigate?: (pageId: string) => void;
  onNavigate?: (pageId: string) => void;
  // Set by the embedded app itself (see each app's ThemeContext/App) so the
  // platform Settings page can push a live theme change into whichever
  // module(s) are currently mounted — mirrors the navigate/onNavigate pair
  // above, but for theme instead of page navigation.
  setTheme?: (themeName: string) => void;
};

type ModuleEntry = { bridge: NavBridge; activePage: string | null };

// Keyed by moduleId ('oil-analysis' / 'vibration-analysis') rather than
// tracking a single "current" module — both embedded apps stay mounted for
// the whole session once first visited (see EmbeddedOilAnalysis.tsx /
// EmbeddedVibrationAnalysis.tsx), just hidden via CSS when not the active
// route, specifically so switching away and back never loses their synced
// data or re-triggers a sync. That means more than one can be registered
// at once, so callers (Sidebar's native sub-tabs) always name which module
// they mean.
type EmbeddedNavContextValue = {
  activePageFor: (moduleId: string) => string | null;
  register: (moduleId: string, bridge: NavBridge) => void;
  unregister: (moduleId: string) => void;
  setActivePage: (moduleId: string, pageId: string) => void;
  navigateTo: (moduleId: string, pageId: string) => void;
  // Live-pushes a theme change to every currently-registered module (no-op
  // for one that hasn't wired navBridge.setTheme — either way the choice is
  // still persisted separately, see theme.ts).
  pushTheme: (themeName: string) => void;
};

const EmbeddedNavContext = createContext<EmbeddedNavContextValue | null>(null);

export function EmbeddedNavProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<Record<string, ModuleEntry>>({});

  const value = useMemo<EmbeddedNavContextValue>(
    () => ({
      activePageFor: (moduleId) => modules[moduleId]?.activePage ?? null,
      register: (moduleId, bridge) => {
        setModules((prev) => ({ ...prev, [moduleId]: { bridge, activePage: prev[moduleId]?.activePage ?? null } }));
      },
      unregister: (moduleId) => {
        setModules((prev) => {
          if (!(moduleId in prev)) return prev;
          const next = { ...prev };
          delete next[moduleId];
          return next;
        });
      },
      setActivePage: (moduleId, pageId) => {
        setModules((prev) =>
          prev[moduleId] ? { ...prev, [moduleId]: { ...prev[moduleId], activePage: pageId } } : prev,
        );
      },
      navigateTo: (moduleId, pageId) => modules[moduleId]?.bridge.navigate?.(pageId),
      pushTheme: (themeName) => {
        Object.values(modules).forEach((m) => m.bridge.setTheme?.(themeName));
      },
    }),
    [modules],
  );

  return <EmbeddedNavContext.Provider value={value}>{children}</EmbeddedNavContext.Provider>;
}

export function useEmbeddedNav(): EmbeddedNavContextValue {
  const ctx = useContext(EmbeddedNavContext);
  if (!ctx) throw new Error('useEmbeddedNav must be used within EmbeddedNavProvider');
  return ctx;
}

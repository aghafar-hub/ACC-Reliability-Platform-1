import { createContext, useContext, useMemo, useState, type ReactNode, useRef } from 'react';

/**
 * navBridge is a plain JS object (not React state) handed to an embedded
 * app's mount function — see each app's own src/embed.jsx. It's the seam across
 * the React 18/19 root boundary: the embedded app sets `.navigate` to its
 * own internal navigate function, and calls `.onNavigate(page)` whenever
 * its page changes so we can mirror it here.
 */
export type NavBridge = {
  // recordId (Patch 15, notification bell deep-linking): an optional id the
  // embedded app's own navigate() may use to open a specific record on that
  // page (e.g. a routineId) instead of just landing on the page's list view.
  // An embedded app that doesn't recognize it for a given page just ignores
  // the extra argument and behaves exactly as before.
  // An object recordId carries a pre-filled form instead, e.g.
  // { newRoute: { routeType: 'Emergency Top Up', ... } } (the phone's ＋ menu).
  navigate?: (pageId: string, recordId?: NavRecord) => void;
  onNavigate?: (pageId: string) => void;
  // Set by the embedded app itself (see each app's ThemeContext/App) so the
  // platform Settings page can push a live theme change into whichever
  // module(s) are currently mounted — mirrors the navigate/onNavigate pair
  // above, but for theme instead of page navigation.
  setTheme?: (themeName: string) => void;
  // Patch 35 ("make it one [top bar]"): mirrors navigate/onNavigate again,
  // but for sync — the embedded app sets `.sync` to its own runSync
  // function and calls `.onSyncStateChange(info)` whenever its syncState/
  // pendingSyncCount change, so the shell's own TopBar can show that
  // module's Sync button and pending-upload count instead of the module
  // rendering a second, duplicate bar for it. Online/offline status isn't
  // part of this — it's just the browser's own navigator.onLine, read
  // directly by the shell, no bridge needed.
  sync?: () => void;
  onSyncStateChange?: (info: SyncInfo) => void;
  // Global search (top bar): the module answers from the data it already
  // holds — points, sample IDs, … — so search works offline too.
  search?: (query: string) => SearchResult[];
};

export type NavRecord = string | Record<string, unknown>;

export type SearchResult = {
  kind: string;
  title: string;
  subtitle?: string;
  page: string;
  recordId?: string;
};

// lastSyncAt: ISO time of the module's last successful sync (the offline
// banner says how old the data on screen is); optional — not every module has it.
export type SyncInfo = { syncState: string; pendingSyncCount: number; lastSyncAt?: string | null };

// 'idle': not started yet. 'loading': the embed bundle is downloading/
// mounting (kicked off right after login now, not on first click — see
// EmbeddedOilAnalysis.tsx/EmbeddedVibrationAnalysis.tsx). 'ready': mounted
// and visible instantly on click. Sidebar.tsx reads this to show a small
// loading signal next to the module's nav item while it's still warming up.
export type ModuleLoadState = 'idle' | 'loading' | 'ready';

type ModuleEntry = { bridge: NavBridge; activePage: string | null; syncInfo: SyncInfo | null };

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
  navigateTo: (moduleId: string, pageId: string, recordId?: NavRecord) => void;
  search: (moduleId: string, query: string) => SearchResult[];
  // Patch 35: the shell TopBar's module-aware Sync button/badge — see
  // NavBridge.sync/onSyncStateChange above.
  syncInfoFor: (moduleId: string) => SyncInfo | null;
  setSyncInfo: (moduleId: string, info: SyncInfo) => void;
  triggerSync: (moduleId: string) => void;
  // Live-pushes a theme change to every currently-registered module (no-op
  // for one that hasn't wired navBridge.setTheme — either way the choice is
  // still persisted separately, see theme.ts).
  pushTheme: (themeName: string) => void;
  loadStateFor: (moduleId: string) => ModuleLoadState;
  setLoadState: (moduleId: string, state: ModuleLoadState) => void;
};

const EmbeddedNavContext = createContext<EmbeddedNavContextValue | null>(null);

export function EmbeddedNavProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<Record<string, ModuleEntry>>({});
  const [loadStates, setLoadStates] = useState<Record<string, ModuleLoadState>>({});
  // A navigation asked for before the module has mounted (an app shortcut or
  // a link opened on a cold start) waits here until its bridge can take it.
  const pendingNav = useRef<Record<string, { pageId: string; recordId?: NavRecord }>>({});
  // The module wires bridge.navigate in its own effect, a moment after
  // registering — retry for up to ~10 s.
  function deliverWhenReady(moduleId: string, bridge: NavBridge, tries = 0) {
    const p = pendingNav.current[moduleId];
    if (!p) return;
    if (bridge.navigate) {
      delete pendingNav.current[moduleId];
      bridge.navigate(p.pageId, p.recordId);
    } else if (tries < 100) setTimeout(() => deliverWhenReady(moduleId, bridge, tries + 1), 100);
  }

  const value = useMemo<EmbeddedNavContextValue>(
    () => ({
      loadStateFor: (moduleId) => loadStates[moduleId] ?? 'idle',
      setLoadState: (moduleId, state) => {
        setLoadStates((prev) => (prev[moduleId] === state ? prev : { ...prev, [moduleId]: state }));
      },
      activePageFor: (moduleId) => modules[moduleId]?.activePage ?? null,
      register: (moduleId, bridge) => {
        if (pendingNav.current[moduleId]) deliverWhenReady(moduleId, bridge);
        setModules((prev) => ({
          ...prev,
          [moduleId]: { bridge, activePage: prev[moduleId]?.activePage ?? null, syncInfo: prev[moduleId]?.syncInfo ?? null },
        }));
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
      navigateTo: (moduleId, pageId, recordId) => {
        const nav = modules[moduleId]?.bridge.navigate;
        if (nav) nav(pageId, recordId);
        else {
          pendingNav.current[moduleId] = { pageId, recordId };
          const bridge = modules[moduleId]?.bridge;
          if (bridge) deliverWhenReady(moduleId, bridge); // registered, navigate not wired yet
        }
      },
      search: (moduleId, query) => {
        try {
          return modules[moduleId]?.bridge.search?.(query) ?? [];
        } catch {
          return [];
        }
      },
      pushTheme: (themeName) => {
        Object.values(modules).forEach((m) => m.bridge.setTheme?.(themeName));
      },
      syncInfoFor: (moduleId) => modules[moduleId]?.syncInfo ?? null,
      setSyncInfo: (moduleId, info) => {
        setModules((prev) => (prev[moduleId] ? { ...prev, [moduleId]: { ...prev[moduleId], syncInfo: info } } : prev));
      },
      triggerSync: (moduleId) => modules[moduleId]?.bridge.sync?.(),
    }),
    [modules, loadStates],
  );

  return <EmbeddedNavContext.Provider value={value}>{children}</EmbeddedNavContext.Provider>;
}

export function useEmbeddedNav(): EmbeddedNavContextValue {
  const ctx = useContext(EmbeddedNavContext);
  if (!ctx) throw new Error('useEmbeddedNav must be used within EmbeddedNavProvider');
  return ctx;
}

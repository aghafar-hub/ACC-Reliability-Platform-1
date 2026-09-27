import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type EmbeddedPage = { id: string; label: string; icon: string };

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
};

type EmbeddedNavState = {
  moduleId: string | null;
  pages: EmbeddedPage[];
  activePage: string | null;
  navigateTo: (pageId: string) => void;
};

type EmbeddedNavContextValue = EmbeddedNavState & {
  register: (moduleId: string, pages: EmbeddedPage[], bridge: NavBridge) => void;
  setActivePage: (pageId: string) => void;
  unregister: (moduleId: string) => void;
};

const EmbeddedNavContext = createContext<EmbeddedNavContextValue | null>(null);

export function EmbeddedNavProvider({ children }: { children: ReactNode }) {
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [pages, setPages] = useState<EmbeddedPage[]>([]);
  const [activePage, setActivePageState] = useState<string | null>(null);
  const [bridge, setBridge] = useState<NavBridge | null>(null);

  const value = useMemo<EmbeddedNavContextValue>(
    () => ({
      moduleId,
      pages,
      activePage,
      navigateTo: (pageId: string) => bridge?.navigate?.(pageId),
      register: (id, pageList, navBridge) => {
        setModuleId(id);
        setPages(pageList);
        setBridge(navBridge);
      },
      setActivePage: (pageId: string) => setActivePageState(pageId),
      unregister: (id: string) => {
        setModuleId((current) => (current === id ? null : current));
        setPages((current) => (moduleId === id ? [] : current));
        setBridge((current) => (moduleId === id ? null : current));
      },
    }),
    [moduleId, pages, activePage, bridge],
  );

  return <EmbeddedNavContext.Provider value={value}>{children}</EmbeddedNavContext.Provider>;
}

export function useEmbeddedNav(): EmbeddedNavContextValue {
  const ctx = useContext(EmbeddedNavContext);
  if (!ctx) throw new Error('useEmbeddedNav must be used within EmbeddedNavProvider');
  return ctx;
}

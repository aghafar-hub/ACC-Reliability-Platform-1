import { useEffect, useRef } from 'react';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';
import { OIL_SUB_TABS } from '../navigation';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

// The native subset of navigation.ts's OIL_SUB_TABS (excludes "Routines"/
// "Oil Inventory", which route elsewhere instead of being pages this
// embedded app itself knows how to show) — registered with the shared
// sidebar (see embeddedNav.tsx) so navigating between this app's own
// sections happens via the unified sidebar instead of its own (hidden)
// internal one.
const OIL_ANALYSIS_PAGES = OIL_SUB_TABS.filter((t) => !t.to);

// Loads the as-is copied app's own pre-built embed bundle (its own React
// 18 + every dependency bundled in — see
// apps/oil-analysis/vite.embed.config.js) and mounts it into a container
// this page owns, instead of linking out to it as a separate page. Loaded
// on demand so it costs nothing until actually visited. Also registers its
// page list with the shared sidebar (see embeddedNav.tsx) so navigating
// between Oil Analysis's own sections happens via the unified sidebar
// instead of this app's own (hidden) internal one. The new Routine-based
// Oil Analysis module built this session lives separately at /oil-analysis-new.
export default function EmbeddedOilAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedNav = useEmbeddedNav();

  useEffect(() => {
    let cancelled = false;
    let unmount: (() => void) | undefined;
    const navBridge: NavBridge = { onNavigate: (page) => embeddedNav.setActivePage(page) };
    embeddedNav.register('oil-analysis', OIL_ANALYSIS_PAGES, navBridge);

    const modulePath = `${import.meta.env.BASE_URL}apps/oil-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountOilAnalysis: MountFn }) => {
      if (cancelled || !containerRef.current) return;
      unmount = mod.mountOilAnalysis(containerRef.current, { navBridge });
    });

    return () => {
      cancelled = true;
      unmount?.();
      embeddedNav.unregister('oil-analysis');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; embeddedNav's own identity is stable per render but its methods close over fresh state via context, re-running this on every embeddedNav change would remount the app
  }, []);

  return <div ref={containerRef} className="app-content--embedded" />;
}

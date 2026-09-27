import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

const MODULE_ID = 'oil-analysis';
const BASE_ROUTE = '/oil-analysis';

// Loads the as-is copied app's own pre-built embed bundle (its own React
// 18 + every dependency bundled in — see
// apps/oil-analysis/vite.embed.config.js) and mounts it into a container
// this page owns, instead of linking out to it as a separate page.
//
// Rendered unconditionally as a persistent sibling of <Routes> in App.tsx
// (not as a routed element) so it mounts once, lazily, the first time this
// module is visited, and then stays mounted — just hidden via CSS — for
// the rest of the session, no matter what other tab you navigate to.
// Unmounting and remounting on every visit (the previous design, tied to
// React Router mounting/unmounting a routed element) discarded this app's
// own in-memory synced data on every tab switch, forcing a full re-sync
// each time you came back. The new Routine-based Oil Analysis module built
// this session lives separately at /oil-analysis-new.
export default function EmbeddedOilAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedNav = useEmbeddedNav();
  const location = useLocation();
  const startedRef = useRef(false);
  const visible = location.pathname === BASE_ROUTE;

  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;

    const navBridge: NavBridge = { onNavigate: (page) => embeddedNav.setActivePage(MODULE_ID, page) };
    embeddedNav.register(MODULE_ID, navBridge);

    const modulePath = `${import.meta.env.BASE_URL}apps/oil-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountOilAnalysis: MountFn }) => {
      if (!containerRef.current) return;
      mod.mountOilAnalysis(containerRef.current, { navBridge });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once, the first time `visible` turns true; embeddedNav's identity is stable enough for this one-shot read
  }, [visible]);

  // Only ever runs its cleanup when this component is truly removed from
  // the tree (e.g. logout unmounting the whole authenticated shell) — never
  // on a route change, which just toggles `visible` above.
  useEffect(() => {
    return () => embeddedNav.unregister(MODULE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: see comment above
  }, []);

  return <div ref={containerRef} className="app-content--embedded" style={visible ? undefined : { display: 'none' }} />;
}

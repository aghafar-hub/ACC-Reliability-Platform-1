import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

const MODULE_ID = 'vibration-analysis';
const BASE_ROUTE = '/vibration-analysis';

// See EmbeddedOilAnalysis.tsx for the full rationale — same pattern,
// loading apps/vibration-analysis's own pre-built embed bundle (see
// apps/vibration-analysis/vite.embed.config.js), rendered as a persistent
// sibling of <Routes> that mounts once — right after login, not waiting
// for this route to actually be visited, so the download happens in the
// background while the user is still on the Dashboard — and then stays
// mounted — hidden via CSS, never unmounted — for the rest of the
// session, so switching tabs and coming back never loses its synced data.
export default function EmbeddedVibrationAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedNav = useEmbeddedNav();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const startedRef = useRef(false);
  // Patch 29: also visible from the consolidated Settings page's
  // "Vibration Analysis" side tab (?module=vibration-analysis on
  // /settings) — see EmbeddedOilAnalysis.tsx for the full rationale.
  const visible = location.pathname === BASE_ROUTE || (location.pathname === '/settings' && searchParams.get('module') === MODULE_ID);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const navBridge: NavBridge = {
      onNavigate: (page) => embeddedNav.setActivePage(MODULE_ID, page),
      // Patch 38: lets the shell's own TopBar show this module's Sync
      // button instead of this module rendering a second bar for it — see
      // EmbeddedOilAnalysis.tsx for the original version of this pattern.
      onSyncStateChange: (info) => embeddedNav.setSyncInfo(MODULE_ID, info),
    };
    embeddedNav.register(MODULE_ID, navBridge);
    embeddedNav.setLoadState(MODULE_ID, 'loading');

    const modulePath = `${import.meta.env.BASE_URL}apps/vibration-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountVibrationAnalysis: MountFn }) => {
      embeddedNav.setLoadState(MODULE_ID, 'ready');
      if (!containerRef.current) return;
      mod.mountVibrationAnalysis(containerRef.current, { navBridge });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once on mount; embeddedNav's identity is stable enough for this one-shot read
  }, []);

  useEffect(() => {
    return () => embeddedNav.unregister(MODULE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: only runs on true unmount (e.g. logout), see EmbeddedOilAnalysis.tsx
  }, []);

  return <div ref={containerRef} className="app-content--embedded" style={visible ? undefined : { display: 'none' }} />;
}

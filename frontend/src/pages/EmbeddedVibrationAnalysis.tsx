import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useModuleNotice } from '../components/ModuleAccessNotice';
import { setPlant } from '../plant';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';
import { canOpenModule, useModuleAccess } from '../moduleAccess';

// session: Phase 0 — the login token this module now sends on every request
// so its backend can apply Module Access (see apps/vibration-analysis/src/api.js).
type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge; session?: { token: string } }) => () => void;

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
  const { sessionToken, claims } = useAuth();
  // the signed-in user, for the per-user copy of the plant summary
  const userRef = useRef('');
  userRef.current = claims?.userId || claims?.email || '';
  const { access, settled } = useModuleAccess();
  const moduleAccess = access[MODULE_ID];
  const allowedToMount = (settled || !!moduleAccess) && canOpenModule(moduleAccess);
  const { blocked, notice } = useModuleNotice(MODULE_ID, 'Vibration Analysis');

  useEffect(() => {
    if (startedRef.current) return;
    if (!sessionToken || !allowedToMount) return;
    startedRef.current = true;

    const navBridge: NavBridge = {
      onNavigate: (page) => embeddedNav.setActivePage(MODULE_ID, page),
      // Patch 38: lets the shell's own TopBar show this module's Sync
      // button instead of this module rendering a second bar for it — see
      // EmbeddedOilAnalysis.tsx for the original version of this pattern.
      onSyncStateChange: (info) => embeddedNav.setSyncInfo(MODULE_ID, info),
      // Plant overview (Home + Equipment) — see plant.ts
      onPlant: (summary) => setPlant(userRef.current, MODULE_ID, summary),
    };
    embeddedNav.register(MODULE_ID, navBridge);
    embeddedNav.setLoadState(MODULE_ID, 'loading');

    // ?v=<build sha> cache-busts the PWA service worker's runtime cache for
    // this file (see frontend/vite.config.ts's runtimeCaching entry for
    // /apps/ — StaleWhileRevalidate, 30-day maxAge) — embed.js's own
    // filename never changes between builds, so without this a browser that
    // already cached an old version could keep running it for up to 30 days
    // after a real deploy, no matter how many times the page is reloaded.
    const modulePath = `${import.meta.env.BASE_URL}apps/vibration-analysis/embed.js?v=${import.meta.env.VITE_BUILD_SHA || "dev"}`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountVibrationAnalysis: MountFn }) => {
      embeddedNav.setLoadState(MODULE_ID, 'ready');
      if (!containerRef.current) return;
      mod.mountVibrationAnalysis(containerRef.current, { navBridge, session: { token: sessionToken } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once, as soon as access allows it; embeddedNav's identity is stable enough for this one-shot read
  }, [sessionToken, allowedToMount]);

  useEffect(() => {
    return () => embeddedNav.unregister(MODULE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: only runs on true unmount (e.g. logout), see EmbeddedOilAnalysis.tsx
  }, []);

  return (
    <>
      {visible && notice}
      <div ref={containerRef} className="app-content--embedded" style={visible && !blocked ? undefined : { display: 'none' }} />
    </>
  );
}

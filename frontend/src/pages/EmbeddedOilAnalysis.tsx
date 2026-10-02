import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PLATFORM_CORE_URL } from '../config';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';

// platformCoreUrl lets this embedded app call Platform Core's own actions
// directly (listOrgUsers, so far) — see apps/oil-analysis/src/api.js's
// listOrgUsers() for the client side of this. The embedded app has no other
// way to know this URL: unlike the Oil Lubrication webhook URL (baked into
// its own build), Platform Core's URL is only known to the shell that logged
// the user in.
type EmbeddedSession = {
  token: string;
  claims: { userId: string; email: string; orgId: string; roles: string[] } | null;
  platformCoreUrl: string;
};
type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge; session?: EmbeddedSession }) => () => void;

const MODULE_ID = 'oil-analysis';
const BASE_ROUTE = '/oil-analysis';

// Loads the as-is copied app's own pre-built embed bundle (its own React
// 18 + every dependency bundled in — see
// apps/oil-analysis/vite.embed.config.js) and mounts it into a container
// this page owns, instead of linking out to it as a separate page.
//
// Rendered unconditionally as a persistent sibling of <Routes> in App.tsx
// (not as a routed element) so it mounts once — as soon as a session is
// available, not waiting for this route to actually be visited (see the
// mount effect below) — and then stays mounted — just hidden via CSS —
// for the rest of the session, no matter what other tab you navigate to.
// Unmounting and remounting on every visit (the previous design, tied to
// React Router mounting/unmounting a routed element) discarded this app's
// own in-memory synced data on every tab switch, forcing a full re-sync
// each time you came back. The new Routine-based Oil Analysis module built
// this session lives separately at /oil-analysis-new.
//
// PERFORMANCE: this used to wait for `visible` (the route actually being
// open) before even starting the download — so the very first click on
// "Oil Lubrication" paid for downloading and parsing this module's whole
// embed bundle (~1MB+ gzipped) with the tab just sitting there loading.
// Starting the same download right after login instead (while the user is
// still on the Dashboard, where a few extra seconds of background network
// activity is invisible) means that by the time they do click the tab,
// it's already downloaded and mounts instantly. Total work is identical —
// this only moves *when* it happens, not *what* happens — so it doesn't
// change this module's own behavior once mounted.
export default function EmbeddedOilAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedNav = useEmbeddedNav();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const startedRef = useRef(false);
  // Patch 29: the consolidated Settings page (see Settings.tsx) also makes
  // this module visible — in place, showing its own internal Settings page
  // — while its "Oil Lubrication" side tab is selected (?module=oil-analysis
  // on /settings), reusing this same persistent-mount instance rather than
  // navigating away to /oil-analysis. (Patch 31 briefly did the same for the
  // shell's top-level "/" and "/equipment" routes too — reverted in Patch 32:
  // those are meant for a future HIGH-level, platform-wide Dashboard/
  // Equipment, not this module's own LOW-level ones — see App.tsx.)
  const visible = location.pathname === BASE_ROUTE || (location.pathname === '/settings' && searchParams.get('module') === MODULE_ID);
  const { sessionToken, claims } = useAuth();

  useEffect(() => {
    if (startedRef.current) return;
    // This whole tree sits behind RequireAuth, so sessionToken is already
    // populated by the time a user can reach here — but guard anyway
    // rather than mount with a half-formed session on some future routing
    // change that isn't true anymore.
    if (!sessionToken) return;
    startedRef.current = true;

    const navBridge: NavBridge = {
      onNavigate: (page) => embeddedNav.setActivePage(MODULE_ID, page),
      // Patch 35: lets the shell's own TopBar show this module's Sync
      // button/pending-count instead of this module rendering a second bar
      // for it — see embeddedNav.tsx's NavBridge.onSyncStateChange.
      onSyncStateChange: (info) => embeddedNav.setSyncInfo(MODULE_ID, info),
    };
    embeddedNav.register(MODULE_ID, navBridge);
    embeddedNav.setLoadState(MODULE_ID, 'loading');

    const modulePath = `${import.meta.env.BASE_URL}apps/oil-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountOilAnalysis: MountFn }) => {
      embeddedNav.setLoadState(MODULE_ID, 'ready');
      if (!containerRef.current) return;
      mod.mountOilAnalysis(containerRef.current, {
        navBridge,
        session: { token: sessionToken, claims, platformCoreUrl: PLATFORM_CORE_URL },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once, as soon as sessionToken is available; embeddedNav's identity is stable enough for this one-shot read
  }, [sessionToken]);

  // Only ever runs its cleanup when this component is truly removed from
  // the tree (e.g. logout unmounting the whole authenticated shell) — never
  // on a route change, which just toggles `visible` above.
  useEffect(() => {
    return () => embeddedNav.unregister(MODULE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: see comment above
  }, []);

  return <div ref={containerRef} className="app-content--embedded" style={visible ? undefined : { display: 'none' }} />;
}

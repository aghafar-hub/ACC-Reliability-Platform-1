import { useEffect, useRef } from 'react';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

// Matches apps/oil-analysis/src/components/Sidebar.jsx's own NAV array
// exactly (id/label/Tabler icon class) — this is what renders as the
// unified sidebar's sub-tabs under "Oil Analysis" while this page is open.
const OIL_ANALYSIS_PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { id: 'equipment', label: 'Equipment', icon: 'ti-engine' },
  { id: 'oilreport', label: 'Oil Analysis Report', icon: 'ti-file-analytics' },
  { id: 'upload', label: 'Add Sample', icon: 'ti-plus' },
  { id: 'actions', label: 'Action Tracker', icon: 'ti-checklist' },
  { id: 'oilchange', label: 'Oil Change Log', icon: 'ti-oil' },
  { id: 'reports', label: 'Reports', icon: 'ti-report' },
  { id: 'tracker', label: 'Sample Tracker', icon: 'ti-timeline' },
  { id: 'howto', label: 'How to Use', icon: 'ti-help-circle' },
  { id: 'settings', label: 'Settings', icon: 'ti-settings' },
];

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

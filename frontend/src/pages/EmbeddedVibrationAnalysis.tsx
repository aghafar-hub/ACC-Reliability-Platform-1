import { useEffect, useRef } from 'react';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

// Matches apps/vibration-analysis/src/navigation.js's own NAV_ITEMS exactly
// (key/label/icon name — icon names match keys in frontend/src/icons.tsx,
// copied from that app's own components/icons.jsx) — this is what renders
// as the unified sidebar's sub-tabs under "Vibration Analysis" while this
// page is open.
const VIBRATION_ANALYSIS_PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'newreading', label: 'New Reading', icon: 'plus' },
  { id: 'equipreg', label: 'Equipment Register', icon: 'registry' },
  { id: 'registry', label: 'Equipment Readings', icon: 'graphs' },
  { id: 'graphs', label: 'Graphs Dashboard', icon: 'graphs' },
  { id: 'compliance', label: 'Compliance Tracker', icon: 'compliance' },
  { id: 'actions', label: 'Action Tracker', icon: 'action' },
  { id: 'limits', label: 'Limits Settings', icon: 'limits' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// See EmbeddedOilAnalysis.tsx for the full rationale — same pattern,
// loading apps/vibration-analysis's own pre-built embed bundle (see
// apps/vibration-analysis/vite.embed.config.js) and registering its page
// list with the shared sidebar.
export default function EmbeddedVibrationAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedNav = useEmbeddedNav();

  useEffect(() => {
    let cancelled = false;
    let unmount: (() => void) | undefined;
    const navBridge: NavBridge = { onNavigate: (page) => embeddedNav.setActivePage(page) };
    embeddedNav.register('vibration-analysis', VIBRATION_ANALYSIS_PAGES, navBridge);

    const modulePath = `${import.meta.env.BASE_URL}apps/vibration-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountVibrationAnalysis: MountFn }) => {
      if (cancelled || !containerRef.current) return;
      unmount = mod.mountVibrationAnalysis(containerRef.current, { navBridge });
    });

    return () => {
      cancelled = true;
      unmount?.();
      embeddedNav.unregister('vibration-analysis');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once, see EmbeddedOilAnalysis.tsx
  }, []);

  return <div ref={containerRef} className="app-content--embedded" />;
}

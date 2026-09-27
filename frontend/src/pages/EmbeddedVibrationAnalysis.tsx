import { useEffect, useRef } from 'react';
import { useEmbeddedNav, type NavBridge } from '../embeddedNav';
import { VIBRATION_SUB_TABS } from '../navigation';

type MountFn = (container: HTMLElement, options?: { navBridge?: NavBridge }) => () => void;

// navigation.ts's VIBRATION_SUB_TABS — every entry is "native" (a page this
// embedded app itself knows how to show) today, registered with the shared
// sidebar (see embeddedNav.tsx) so navigating between this app's own
// sections happens via the unified sidebar instead of its own (hidden)
// internal one.
const VIBRATION_ANALYSIS_PAGES = VIBRATION_SUB_TABS.filter((t) => !t.to);

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

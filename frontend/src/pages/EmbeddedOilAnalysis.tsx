import { useEffect, useRef } from 'react';

type MountFn = (container: HTMLElement) => () => void;

// Loads the as-is copied app's own pre-built embed bundle (its own React
// 18 + every dependency bundled in — it can't share this shell's React 19,
// see apps/oil-analysis/vite.embed.config.js) and mounts it into a
// container this page owns, instead of linking out to it as a separate
// page. Loaded on demand (dynamic import of a runtime-computed URL) so it
// costs nothing until actually visited. The new Routine-based Oil Analysis
// module built this session lives separately at /oil-analysis-new.
export default function EmbeddedOilAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unmount: (() => void) | undefined;
    const modulePath = `${import.meta.env.BASE_URL}apps/oil-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountOilAnalysis: MountFn }) => {
      if (cancelled || !containerRef.current) return;
      unmount = mod.mountOilAnalysis(containerRef.current);
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  return <div ref={containerRef} className="app-content--embedded" />;
}

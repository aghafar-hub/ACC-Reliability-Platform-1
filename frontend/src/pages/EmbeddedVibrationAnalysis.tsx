import { useEffect, useRef } from 'react';

type MountFn = (container: HTMLElement) => () => void;

// Loads the as-is copied app's own pre-built embed bundle (its own React
// 18 + every dependency bundled in — see
// apps/vibration-analysis/vite.embed.config.js) and mounts it into a
// container this page owns, instead of linking out to it as a separate
// page. Loaded on demand so it costs nothing until actually visited.
export default function EmbeddedVibrationAnalysis() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unmount: (() => void) | undefined;
    const modulePath = `${import.meta.env.BASE_URL}apps/vibration-analysis/embed.js`;
    import(/* @vite-ignore */ modulePath).then((mod: { mountVibrationAnalysis: MountFn }) => {
      if (cancelled || !containerRef.current) return;
      unmount = mod.mountVibrationAnalysis(containerRef.current);
    });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  return <div ref={containerRef} className="app-content--embedded" />;
}

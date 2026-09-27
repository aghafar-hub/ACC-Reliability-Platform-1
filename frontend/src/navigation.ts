export type NavItem = {
  label: string;
  to: string;
  /** True for links that leave the SPA entirely (a separate app, not a route in this one). */
  external?: boolean;
};

// Oil Analysis is now a real route in this app (single-app integration —
// see docs/oil-analysis-module-notes.md). Vibration Analysis stays a
// separate app for now: it has no backend built against the new schema
// yet, so folding it into this shell is future work, not a regression.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Oil Analysis', to: '/oil-analysis' },
  { label: 'Vibration Analysis', to: 'apps/vibration-analysis/', external: true },
];

export type NavItem = {
  label: string;
  to: string;
  /** True for links that leave the SPA entirely (a separate app, not a route in this one). */
  external?: boolean;
};

// Both as-is copied apps are mounted in place (their own unchanged code,
// UI, backend, and login — see EmbeddedOilAnalysis.tsx /
// EmbeddedVibrationAnalysis.tsx) rather than linked out to as separate
// pages, per the single-app-integration decision. The new Routine-based
// Oil Analysis module built this session is parked at /oil-analysis-new,
// not linked here for now.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Vibration Analysis', to: '/vibration-analysis' },
  { label: 'Oil Analysis', to: '/oil-analysis' },
];

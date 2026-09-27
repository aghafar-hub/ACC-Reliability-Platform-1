export type NavItem = {
  label: string;
  to: string;
  /** True for links that leave the SPA entirely (a separate app, not a route in this one). */
  external?: boolean;
};

// Reverted to linking both as-is copied apps externally, per instruction
// to step back and edit from the original apps rather than the new
// single-app-integration build. The new Oil Analysis module (routes,
// pages, backends) is untouched and still reachable directly at
// /oil-analysis — just not linked from the sidebar for now.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Vibration Analysis', to: 'apps/vibration-analysis/', external: true },
  { label: 'Oil Analysis', to: 'apps/oil-analysis/', external: true },
];

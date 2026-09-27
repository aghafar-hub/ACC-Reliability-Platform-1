export type NavItem = {
  label: string;
  to: string;
  /** True for links that leave the SPA entirely (a separate app, not a route in this one). */
  external?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Vibration Analysis', to: '/apps/vibration-analysis/', external: true },
  { label: 'Oil Analysis', to: '/apps/oil-analysis/', external: true },
];

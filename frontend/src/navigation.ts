export type NavItem = {
  label: string;
  to: string;
  /** True for links that leave the SPA entirely (a separate app, not a route in this one). */
  external?: boolean;
};

// Sub-app links are relative (no leading slash) so they resolve correctly
// under whatever base path this app itself is served from (e.g. "/" in
// local dev, "/ACC-Reliability-Platform-1/" on GitHub Pages) without
// hardcoding that base here.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Vibration Analysis', to: 'apps/vibration-analysis/', external: true },
  { label: 'Oil Analysis', to: 'apps/oil-analysis/', external: true },
];


// Single source of truth for the sidebar's structure — both the top-level
// tabs and each module's sub-tabs. A sub-tab is either "native" (a page the
// embedded legacy app itself knows how to show — clicking it calls into
// that app's own navigate function via navBridge, see embeddedNav.tsx) or
// "routed" (a real route in this app, for anything the embedded legacy app
// has no page for — new tabs added ahead of their own design/build pass).
// EmbeddedOilAnalysis.tsx / EmbeddedVibrationAnalysis.tsx import the native
// subset of these lists (the ones with no `to`) to register with the
// embedded app's own navBridge — see those files.

export type SubTab = {
  id: string;
  label: string;
  icon: string;
  /** Set only for a "routed" sub-tab — see the file comment above. */
  to?: string;
};

export type NavItem = {
  label: string;
  to: string;
  icon: string;
  subTabs?: SubTab[];
  /** Set only when subTabs exist — the id EmbeddedOilAnalysis.tsx/EmbeddedVibrationAnalysis.tsx register with embeddedNav.tsx, for native sub-tab clicks. */
  moduleId?: string;
};

// Ids match apps/vibration-analysis/src/App.jsx's own `page` states exactly
// — these are "native" pages the embedded app already knows how to render.
export const VIBRATION_SUB_TABS: SubTab[] = [
  { id: 'dashboard', label: 'Vibration Dashboard', icon: 'dashboard' },
  { id: 'registry', label: 'Equipment Reading', icon: 'graphs' },
  { id: 'graphs', label: 'Graphs', icon: 'graphs' },
  { id: 'newreading', label: 'New reading', icon: 'plus' },
  { id: 'actions', label: 'Vibration Actions', icon: 'action' },
  { id: 'compliance', label: 'Compliance Tracker', icon: 'compliance' },
  { id: 'equipreg', label: 'Equipment Register', icon: 'registry' },
  { id: 'limits', label: 'Limits setting', icon: 'limits' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// Ids match apps/oil-analysis/src/App.jsx's own `page` states exactly for
// every entry without a `to` — "Routines" and "Oil Inventory" don't exist
// as pages there (or anywhere yet), so they route to a placeholder instead
// (see pages/ComingSoon.tsx) until their own design/build pass.
export const OIL_SUB_TABS: SubTab[] = [
  { id: 'dashboard', label: 'Oil Dashboard', icon: 'ti-layout-dashboard' },
  { id: 'equipment', label: 'Equipment', icon: 'ti-engine' },
  { id: 'routines', label: 'Routines', icon: 'ti-route', to: '/oil-analysis/routines' },
  { id: 'oilreport', label: 'Oil Analysis Report', icon: 'ti-file-analytics' },
  { id: 'upload', label: 'Add Report', icon: 'ti-plus' },
  { id: 'actions', label: 'Oil Actions', icon: 'ti-checklist' },
  { id: 'oilchange', label: 'Oil Change Log', icon: 'ti-oil' },
  { id: 'tracker', label: 'Sample Tracking', icon: 'ti-timeline' },
  { id: 'inventory', label: 'Oil Inventory', icon: 'ti-package', to: '/oil-analysis/inventory' },
  { id: 'reports', label: 'Reports', icon: 'ti-report' },
  { id: 'settings', label: 'Settings', icon: 'ti-settings' },
];

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: 'dashboard' },
  { label: 'My Work', to: '/my-work', icon: 'action' },
  { label: 'Equipment', to: '/equipment', icon: 'registry' },
  {
    label: 'Vibration Analysis',
    to: '/vibration-analysis',
    icon: 'graphs',
    subTabs: VIBRATION_SUB_TABS,
    moduleId: 'vibration-analysis',
  },
  { label: 'Oil Lubrication', to: '/oil-analysis', icon: 'droplet', subTabs: OIL_SUB_TABS, moduleId: 'oil-analysis' },
  { label: 'Reliability Measures', to: '/reliability-measures', icon: 'compliance' },
  { label: 'Compressors', to: '/compressors', icon: 'sync' },
];

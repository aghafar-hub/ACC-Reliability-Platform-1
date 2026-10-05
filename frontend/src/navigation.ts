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
  // No "Settings" entry here on purpose — it's the exact same embedded
  // page as the platform-level Settings page's own "Vibration Analysis"
  // tab (both call embeddedNav.navigateTo('vibration-analysis', 'settings')
  // — see Settings.tsx), so having it in both places was just two paths
  // to one screen.
];

// Ids match apps/oil-analysis/src/App.jsx's own `page` states exactly for
// every entry without a `to`. "Routines" and "Oil Inventory" were
// placeholders too, until Steps 4 and 5 respectively (see
// docs/oil-lubrication-migration-notes.md) built them as native pages.
export const OIL_SUB_TABS: SubTab[] = [
  { id: 'dashboard', label: 'Oil Dashboard', icon: 'ti-layout-dashboard' },
  { id: 'equipment', label: 'Oil Equipment', icon: 'ti-engine' },
  { id: 'routines', label: 'Routines', icon: 'ti-route' },
  { id: 'oilreport', label: 'Oil Analysis Report', icon: 'ti-file-analytics' },
  { id: 'upload', label: 'Add Report', icon: 'ti-plus' },
  { id: 'actions', label: 'Oil Actions', icon: 'ti-checklist' },
  // Was "ti-oil" — not a real Tabler Icons class, so it rendered nothing
  // (confirmed by the user: "there is no small symbol"). "ti-droplet-
  // filled" stays oil-themed but reads as distinct from the plain outline
  // "ti-droplet" used for the Oil Lubrication section above it.
  { id: 'oilchange', label: 'Oil Change Log', icon: 'ti-droplet-filled' },
  { id: 'tracker', label: 'Oil Sampling Log', icon: 'ti-timeline' },
  { id: 'inventory', label: 'Oil Inventory', icon: 'ti-package' },
  { id: 'reports', label: 'Oil Reports', icon: 'ti-report' },
  { id: 'activity', label: 'Activity', icon: 'ti-history' },
  // No "Settings" entry here on purpose — same reasoning as
  // VIBRATION_SUB_TABS above: it's the identical embedded page the
  // platform-level Settings page's own "Oil Lubrication" tab already
  // opens.
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

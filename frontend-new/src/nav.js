// Platform-level two-tier nav structure — matches the REAL sidebar
// (docs/visual-reference/"top level dashboard.png" + the Vibration/Oil
// Lubrication screenshots showing each module expanded), not the old
// standalone apps/oil-analysis app's own flat single-module sidebar, which
// Phase 1 was mistakenly built to match initially.
//
// Only "oil-dashboard" and "oil-sampling-log" have real pages behind them
// in this phase — everything else renders the same honest placeholder text
// the real app itself uses for its own not-yet-built tabs ("This tab is on
// the sidebar — its design is still to come."), confirmed verbatim from
// multiple real screenshots (Equipment, Reliability Measures, Compressors,
// top-level Dashboard).
export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
  { id: "my-work", label: "My Work", icon: "ti-tool" },
  { id: "equipment", label: "Equipment", icon: "ti-file" },
  {
    id: "vibration",
    label: "Vibration Analysis",
    icon: "ti-activity",
    children: [
      { id: "vib-dashboard", label: "Vibration Dashboard", icon: "ti-layout-dashboard" },
      { id: "vib-equipment-reading", label: "Equipment Reading", icon: "ti-activity" },
      { id: "vib-graphs", label: "Graphs", icon: "ti-chart-line" },
      { id: "vib-new-reading", label: "New reading", icon: "ti-plus" },
      { id: "vib-actions", label: "Vibration Actions", icon: "ti-tool" },
      { id: "vib-compliance", label: "Compliance Tracker", icon: "ti-circle-check" },
      { id: "vib-equipment-register", label: "Equipment Register", icon: "ti-file" },
      { id: "vib-limits", label: "Limits setting", icon: "ti-chart-bar" },
    ],
  },
  {
    id: "oil",
    label: "Oil Lubrication",
    icon: "ti-droplet",
    children: [
      { id: "oil-dashboard", label: "Oil Dashboard", icon: "ti-layout-dashboard" },
      { id: "oil-equipment", label: "Oil Equipment", icon: "ti-engine" },
      { id: "oil-routines", label: "Routines", icon: "ti-route" },
      { id: "oil-report", label: "Oil Analysis Report", icon: "ti-file-analytics" },
      { id: "oil-add-report", label: "Add Report", icon: "ti-plus" },
      { id: "oil-actions", label: "Oil Actions", icon: "ti-checklist" },
      { id: "oil-change-log", label: "Oil Change Log", icon: "ti-droplet-filled" },
      { id: "oil-sampling-log", label: "Oil Sampling Log", icon: "ti-timeline" },
      { id: "oil-inventory", label: "Oil Inventory", icon: "ti-package" },
      { id: "oil-reports", label: "Oil Reports", icon: "ti-report" },
      { id: "oil-activity", label: "Activity", icon: "ti-history" },
    ],
  },
  { id: "reliability", label: "Reliability Measures", icon: "ti-circle-check" },
  { id: "compressors", label: "Compressors", icon: "ti-refresh" },
];

// Pages with a real implementation in this phase — everything else in NAV
// (including every other child of "oil" and "vibration") falls back to the
// shared Placeholder page.
export const REAL_PAGES = new Set(["oil-dashboard", "oil-sampling-log"]);

// { id -> { label, parentLabel|null } } flattened for breadcrumb/title lookup.
export const PAGE_INDEX = (() => {
  const index = {};
  for (const item of NAV) {
    index[item.id] = { label: item.label, parentLabel: null };
    for (const child of item.children || []) {
      index[child.id] = { label: child.label, parentLabel: item.label };
    }
  }
  return index;
})();

// Which top-level NAV id (if any) owns a given page id — used to know which
// section should stay expanded while browsing one of its children.
export function parentIdOf(pageId) {
  for (const item of NAV) {
    if (item.id === pageId) return null;
    if ((item.children || []).some((c) => c.id === pageId)) return item.id;
  }
  return null;
}

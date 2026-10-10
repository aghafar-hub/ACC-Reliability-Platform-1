// Nav id/label/icon list — ported verbatim from the original bundle's `tm`
// array. Order matters: it's the order the sidebar renders in. Kept in its
// own module (rather than inside Sidebar.jsx) purely so Vite's fast-refresh
// doesn't warn about a component file exporting plain data too.
export const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "log", label: "Vibration Log", icon: "compliance" },
  { key: "newreading", label: "New Reading", icon: "plus" },
  { key: "equipreg", label: "Equipment Register", icon: "registry" },
  { key: "registry", label: "Equipment Readings", icon: "graphs" },
  { key: "graphs", label: "Graphs Dashboard", icon: "graphs" },
  { key: "compliance", label: "Measurement Tracker", icon: "compliance" },
  { key: "actions", label: "Action Tracker", icon: "action" },
  { key: "reports", label: "Reports", icon: "graphs" },
  { key: "limits", label: "Limits Settings", icon: "limits" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export const PAGE_TITLES = Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item.label]));

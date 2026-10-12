// The report checklist NewReport.jsx shows — ids, labels and groups only,
// so the page doesn't load the PDF/Excel generators (reportGenerators.js,
// with jsPDF and ExcelJS) until a report is actually made. The same ids
// are listed with their renderers in reportGenerators.js REPORT_SECTIONS.
export const REPORT_GROUPS = [
  { id: "condition", label: "Condition Based Oil", icon: "ti-flask", iconColor: "accent" },
  { id: "time", label: "Time Based Oil", icon: "ti-clock", iconColor: "warning" },
  { id: "inventory", label: "Inventory Status", icon: "ti-package", iconColor: "success" },
  { id: "forecast", label: "Forecast", icon: "ti-chart-line", iconColor: "danger" },
];

export const REPORT_SECTION_LIST = [
  { id: "condition-open-actions", group: "condition", label: "Open Actions" },
  { id: "condition-samples", group: "condition", label: "Missing / Overdue Samples" },
  { id: "condition-oil-health", group: "condition", label: "Oil Health (Lab Results)" },
  { id: "condition-overdue-changes", group: "condition", label: "Oil Overdue Changes" },
  { id: "condition-performance", group: "condition", label: "Contractor Performance" },
  { id: "time-overdue-lp", group: "time", label: "Overdue LP Points" },
  { id: "time-open-routines", group: "time", label: "Open Routines & Current Status" },
  { id: "time-coming-soon", group: "time", label: "Coming Soon Oil Change" },
  { id: "time-last-month-topup", group: "time", label: "Last Month Top Up" },
  { id: "time-completion", group: "time", label: "Contractor Completion" },
  { id: "inventory-status", group: "inventory", label: "Inventory Status" },
  { id: "forecast-next-month", group: "forecast", label: "Forecast — Next Month" },
];

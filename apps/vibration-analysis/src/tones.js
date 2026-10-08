// Fixed colours for report states (design reference §5): one colour per
// state everywhere — the Vibration Log cards, the report page and tables.

export function reportTone(T, status) {
  return (
    {
      Received: T.success,
      "Received late": T.warning,
      "Awaiting report": T.info,
      "Not due yet": T.textSecondary,
      Overdue: T.danger,
      Missing: T.danger,
      "Report not imported": T.accent,
      Skipped: T.textSecondary,
    }[status] || T.textSecondary
  );
}
export function workflowTone(T, wf) {
  return { Draft: T.warning, "ACC review": T.info, Returned: T.danger, Approved: T.success }[wf] || T.textSecondary;
}

// Categorical palette in fixed order (same as Oil's pointHistory.js
// SERIES_LIGHT / SERIES_DARK): one colour per series, never cycled by rank.
export const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export function seriesColors(themeName) {
  return /dark/i.test(String(themeName || "")) ? SERIES_DARK : SERIES_LIGHT;
}

// Action stages (design reference §5: Draft = warning, Open = danger,
// Waiting Stoppage = accent, Closure Requested = info, Closed = success).
export const STAGES = ["Draft", "Open", "Waiting Stoppage", "Closure Requested", "Closed"];
export function stageTone(T, st) {
  return { Draft: T.warning, Open: T.danger, "Waiting Stoppage": T.accent, "Closure Requested": T.info, Closed: T.success, Cancelled: T.textSecondary }[st] || T.textSecondary;
}

// Route statuses.
export function routeTone(T, st) {
  return { Unassigned: T.warning, Assigned: T.accent, "In Progress": T.info, Submitted: T.info, Returned: T.danger, Closed: T.success, Cancelled: T.textSecondary }[st] || T.textSecondary;
}

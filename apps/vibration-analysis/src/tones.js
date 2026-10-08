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

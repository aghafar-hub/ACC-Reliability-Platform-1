import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";

// Patch 9 (plant-readiness pass): a visible "who changed what, when" feed
// for everyone in this app, not just whoever can open the raw Google
// Sheet and read a bare Last Modified timestamp. Backed by the new Audit
// Log sheet (see backend/oil-lubrication/src/AuditLog.js) — one row per
// successful write, already scoped to the caller's own contractor server-
// side (see getAuditTrail), so a Contractor Engineer only ever sees their
// own contractor's activity here, same as everywhere else in this app.
function formatTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Patch 12 — "direct-edit" is logged server-side (SheetTriggers.js's
// onEdit) whenever someone edits a governed sheet directly in the Sheets
// UI, bypassing the app entirely — flagged with its own label so it
// reads as a warning, not just another ordinary change.
const ACTION_LABEL = { create: "Created", update: "Updated", delete: "Deleted", "direct-edit": "Direct sheet edit" };

export default function Activity({ webhookUrl }) {
  const { T, s } = useTheme();
  const [recordId, setRecordId] = useState("");
  const [appliedRecordId, setAppliedRecordId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!webhookUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditTrail(webhookUrl, { recordId: appliedRecordId, page, limit: 50 });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, appliedRecordId, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function applyFilter(e) {
    e.preventDefault();
    setPage(1);
    setAppliedRecordId(recordId.trim());
  }

  function clearFilter() {
    setRecordId("");
    setAppliedRecordId("");
    setPage(1);
  }

  if (!webhookUrl) {
    return <p style={{ color: T.textSecondary }}>Add your Apps Script webhook URL in Settings first.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Activity</p>
        <form onSubmit={applyFilter} style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...s.input, width: 220 }}
            placeholder="Filter by LP_ID, routine, product id…"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
          />
          <button type="submit" style={s.btn}>
            <i className="ti ti-filter" aria-hidden="true" /> Filter
          </button>
          {appliedRecordId && (
            <button type="button" style={s.btn} onClick={clearFilter}>
              Clear
            </button>
          )}
        </form>
      </div>

      <p style={{ fontSize: 12, color: T.textSecondary, marginTop: -6, marginBottom: 16 }}>
        Every create, update, and delete made through this app — who did it, when, and to what. Not a raw sheet timestamp: this is a
        dedicated log, newest first.
      </p>

      {error && (
        <div style={{ color: T.danger, marginBottom: 14, fontSize: 13 }}>
          Couldn't load activity: {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: T.textMuted, fontSize: 13 }}>Loading…</p>
      ) : result.entries.length === 0 ? (
        <p style={{ color: T.textMuted, fontSize: 13 }}>
          {appliedRecordId ? `No activity found for "${appliedRecordId}".` : "No activity recorded yet."}
        </p>
      ) : (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          {result.entries.map((e, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "14px 20px",
                borderTop: i === 0 ? "none" : `1px solid ${T.border2}`,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11.5, color: T.textMuted, minWidth: 140, flexShrink: 0 }}>{formatTimestamp(e.timestamp)}</span>
              <span style={s.badge(e.action)}>{ACTION_LABEL[e.action] || e.action}</span>
              <span style={{ fontSize: 12, color: T.textMuted, flexShrink: 0 }}>{e.sheet}</span>
              {e.recordId && (
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12.5, color: T.accent, flexShrink: 0 }}>{e.recordId}</span>
              )}
              <span style={{ fontSize: 12.5, color: T.textPrimary, flex: 1, minWidth: 180 }}>{e.summary}</span>
              <span style={{ fontSize: 11.5, color: T.textSecondary, flexShrink: 0 }}>{e.actingUser || "—"}</span>
            </div>
          ))}
        </div>
      )}

      {result.totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <button style={s.btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <i className="ti ti-chevron-left" aria-hidden="true" /> Prev
          </button>
          <span style={{ fontSize: 12, color: T.textMuted }}>
            Page {result.page} of {result.totalPages} · {result.total} total
          </span>
          <button style={s.btn} disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>
            Next <i className="ti ti-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

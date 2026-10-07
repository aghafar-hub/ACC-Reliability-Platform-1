import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { MiniBars } from "../components/DashCharts";

// Patch 9 (plant-readiness pass): a visible "who changed what, when" feed
// for everyone in this app, not just whoever can open the raw Google
// Sheet and read a bare Last Modified timestamp. Backed by the new Audit
// Log sheet (see backend/oil-lubrication/src/AuditLog.js) — one row per
// successful write, already scoped to the caller's own contractor server-
// side (see getAuditTrail), so a Contractor Engineer only ever sees their
// own contractor's activity here, same as everywhere else in this app.
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
  const [kindFilter, setKindFilter] = useState("all");

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

  const kinds = ["create", "update", "delete", "direct-edit"];
  const kindStyle = {
    create: { icon: "ti-plus", color: T.success },
    update: { icon: "ti-pencil", color: T.accent },
    delete: { icon: "ti-trash", color: T.danger },
    "direct-edit": { icon: "ti-alert-triangle", color: T.warning },
  };
  const counts = Object.fromEntries(kinds.map((k) => [k, result.entries.filter((e) => e.action === k).length]));
  const shown = kindFilter === "all" ? result.entries : result.entries.filter((e) => e.action === kindFilter);
  // Group by day, newest first (the log already comes newest first).
  const dayKey = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "Unknown date" : d.toDateString();
  };
  const dayTitle = (key) => {
    if (key === "Unknown date") return key;
    const d = new Date(key);
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    if (key === today) return "Today";
    if (key === yest) return "Yesterday";
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
  };
  const groups = [];
  shown.forEach((e) => {
    const k = dayKey(e.timestamp);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(e);
    else groups.push({ key: k, items: [e] });
  });
  // Changes per day on this page, oldest → newest, for the small chart.
  const perDay = [...groups].reverse().map((g) => ({ label: g.key === "Unknown date" ? "?" : new Date(g.key).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), value: g.items.length }));
  const people = Object.entries(
    result.entries.reduce((m, e) => {
      const u = e.actingUser || "—";
      m[u] = (m[u] || 0) + 1;
      return m;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const initials = (u) => String(u || "?").split("@")[0].split(/[._\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
  const timeOf = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div className="mobile-stack-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: 0 }}>Activity</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "2px 0 0" }}>Every create, update and delete made through this app — who, when and what. Newest first.</p>
        </div>
        <form onSubmit={applyFilter} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ ...s.input, width: 240, flex: 1, minWidth: 0 }}
            placeholder="Filter by LP_ID, routine, product id…"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            aria-label="Filter by record"
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

      {error && <div style={{ ...s.card, color: T.danger, marginBottom: 14, fontSize: 13 }}>Couldn't load activity: {error}</div>}

      {!loading && result.entries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14, marginBottom: 16 }} data-testid="activity-summary">
          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>Changes per day {result.totalPages > 1 || perDay.length > 10 ? "(latest days shown)" : ""}</div>
            <MiniBars T={T} data={perDay.slice(-10).map((d, i) => ({ key: `${d.label}-${i}`, label: d.label, value: d.value }))} color={T.accent} height={70} ariaLabel={`Changes per day: ${perDay.map((d) => `${d.label} ${d.value}`).join(", ")}`} />
          </div>
          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>By kind</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {kinds.map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: kindStyle[k].color + "1A", color: kindStyle[k].color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${kindStyle[k].icon}`} aria-hidden="true" />
                  </span>
                  <span style={{ fontSize: 12.5, color: T.textSecondary }}>
                    <b style={{ color: k === "direct-edit" && counts[k] ? T.warning : T.textPrimary, fontSize: 15 }}>{counts[k]}</b> {ACTION_LABEL[k]}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...s.card, marginBottom: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>Most active</div>
            {people.map(([u, n]) => (
              <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: T.accent, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(u)}</span>
                <span style={{ fontSize: 12.5, color: T.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u}</span>
                <b style={{ fontSize: 12.5 }}>{n}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && result.entries.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {["all", ...kinds].map((k) => {
            const on = kindFilter === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                data-testid={`activity-kind-${k}`}
                onClick={() => setKindFilter(k)}
                style={{ ...s.btn, padding: "6px 12px", fontSize: 12.5, borderColor: on ? T.accent : T.border, color: on ? T.accent : T.textSecondary, fontWeight: on ? 700 : 500 }}
              >
                {k === "all" ? `All ${result.entries.length}` : `${ACTION_LABEL[k]} ${counts[k]}`}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p style={{ color: T.textMuted, fontSize: 13 }}>Loading…</p>
      ) : result.entries.length === 0 ? (
        <div style={{ ...s.card, textAlign: "center", color: T.textSecondary, padding: 30 }}>
          <i className="ti ti-history" aria-hidden="true" style={{ fontSize: 28 }} />
          <p style={{ margin: "6px 0 0" }}>{appliedRecordId ? `No activity found for "${appliedRecordId}".` : "No activity recorded yet."}</p>
        </div>
      ) : (
        <div data-testid="activity-feed">
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 8px 4px" }}>
                {dayTitle(g.key)} <span style={{ fontWeight: 500 }}>· {g.items.length}</span>
              </div>
              <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                {g.items.map((e, i) => {
                  const k = kindStyle[e.action] || { icon: "ti-point", color: T.textSecondary };
                  return (
                    <div
                      key={i}
                      data-testid="activity-entry"
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.border2}`, background: e.action === "direct-edit" ? T.warning + "0F" : "transparent" }}
                    >
                      <span style={{ width: 32, height: 32, borderRadius: 10, background: k.color + "1A", color: k.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        <i className={`ti ${k.icon}`} aria-hidden="true" />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: k.color }}>{ACTION_LABEL[e.action] || e.action}</span>
                          <span style={{ fontSize: 12, color: T.textSecondary }}>{e.sheet}</span>
                          {e.recordId && (
                            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: T.accent, background: T.accent + "12", borderRadius: 6, padding: "1px 6px" }}>{e.recordId}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 3, overflowWrap: "anywhere" }}>{e.summary}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary }}>{timeOf(e.timestamp)}</div>
                        <div style={{ fontSize: 12, color: T.textSecondary, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.actingUser}>
                          {e.actingUser || "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p style={{ color: T.textMuted, fontSize: 13 }}>Nothing of this kind on this page.</p>}
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

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";

// New per-LP profile page (design review, Patch 25) — deliberately simpler
// than the reference mockup: dropped Running Hours, the Vibration/Temp/
// Load card, Photo/Attachments, the Line tag, and Installed year, all
// confirmed directly by the user. Kept: Top Ups as their own tracked
// history, Type relabeled from an existing registry field (Position —
// no dedicated "Type" column exists), a single consolidated health card,
// and the Lubrication Timeline. Identified by LP_ID (the user's own
// "Lubrication_Point (column F)" — one profile per lubrication point, not
// per the broader Equipment_ID grouping multiple LPs share).
const TABS = [
  { key: "overview", label: "Overview", icon: "ti-layout-dashboard" },
  { key: "samples", label: "Oil Samples", icon: "ti-flask" },
  { key: "changes", label: "Oil Changes", icon: "ti-droplet" },
  { key: "topups", label: "Top Ups", icon: "ti-droplet-plus" },
  { key: "actions", label: "Actions", icon: "ti-checklist" },
  { key: "info", label: "Equipment Info", icon: "ti-info-circle" },
];

const TIMELINE_COLOR = { Change: "accent", Sample: "info", TopUp: "danger" };

function SmallBadge({ T, color, children }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: T[color] || color, background: (T[color] || color) + "22", borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// Criticality is computed, not stored — confirmed directly by the user
// ("criticality depend on oil analysis or oil change over due"): High if
// the latest oil sample is in Alert, or the oil change is overdue; Medium
// for Caution/Warning; Normal otherwise.
function criticalityFor(latestSample, oilChangeOverdue) {
  if (latestSample?.reportStatus === "Alert" || oilChangeOverdue) return "High";
  if (latestSample?.reportStatus === "Caution" || latestSample?.reportStatus === "Warning") return "Medium";
  return "Normal";
}

function SearchBar({ T, s, equipmentRegistry, onSelect }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return (equipmentRegistry || [])
      .filter((r) => r.code.toLowerCase().includes(q) || (r.lubricationPoint || "").toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [equipmentRegistry, q]);

  return (
    <div>
      <p style={{ ...s.sectionTitle, margin: "0 0 16px" }}>Equipment Viewer</p>
      <input
        style={{ ...s.input, marginBottom: 16, maxWidth: 480 }}
        type="search"
        placeholder="Search by LP code, lubrication point, or description…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q && results.length === 0 && <p style={{ color: T.textSecondary }}>No lubrication point matches.</p>}
      {results.length > 0 && (
        <div style={{ ...s.card, padding: 0, overflow: "hidden", maxWidth: 680 }}>
          {results.map((r) => (
            <div
              key={r.code}
              style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
              onClick={() => onSelect(r.code)}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.code} — {r.lubricationPoint || r.description}</div>
              <div style={{ fontSize: 11.5, color: T.textSecondary }}>{r.area} · {r.contractor}</div>
            </div>
          ))}
        </div>
      )}
      {!q && <p style={{ color: T.textSecondary }}>Search for a lubrication point to view its full profile.</p>}
    </div>
  );
}

export default function EquipmentViewer({ equipmentRegistry, samples, oilChanges, actions, webhookUrl, pushToast, initialCode, onCodeChange }) {
  const { T, s } = useTheme();
  const [selectedCode, setSelectedCode] = useState(initialCode || null);
  const [activeTab, setActiveTab] = useState("overview");
  const [changeHistory, setChangeHistory] = useState([]);
  const [topUps, setTopUps] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function select(code) {
    setSelectedCode(code);
    setActiveTab("overview");
    onCodeChange?.(code);
  }

  useEffect(() => {
    if (!selectedCode || !webhookUrl) return;
    let cancelled = false;
    setLoadingHistory(true);
    Promise.all([api.getOilChangesForLp(webhookUrl, selectedCode), api.getTopUpsForLp(webhookUrl, selectedCode)])
      .then(([changes, tops]) => {
        if (cancelled) return;
        setChangeHistory(changes);
        setTopUps(tops);
      })
      .catch((err) => pushToast?.(err.message, "error"))
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [selectedCode, webhookUrl, pushToast]);

  const reg = useMemo(() => (equipmentRegistry || []).find((r) => r.code === selectedCode) || null, [equipmentRegistry, selectedCode]);

  const lpSamples = useMemo(
    () => (samples || []).filter((sm) => sm.unitId === selectedCode).sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate)),
    [samples, selectedCode]
  );
  const lpOilChangeState = useMemo(() => (oilChanges || []).find((o) => o.lpId === selectedCode) || null, [oilChanges, selectedCode]);
  const lpActions = useMemo(
    () => (actions || []).filter((a) => a.equipmentCode === selectedCode).sort((a, b) => new Date(b.revisionDate) - new Date(a.revisionDate)),
    [actions, selectedCode]
  );
  const siblingCount = useMemo(
    () => (reg ? (equipmentRegistry || []).filter((r) => r.equipmentId === reg.equipmentId).length : 0),
    [equipmentRegistry, reg]
  );

  const latestSample = lpSamples[0] || null;
  const latestChange = changeHistory[0] || null;
  const latestTopUp = topUps[0] || null;
  const openActions = lpActions.filter((a) => a.status !== "Closed");
  const oilChangeOverdue = lpOilChangeState?.status === "Overdue";
  const criticality = criticalityFor(latestSample, oilChangeOverdue);
  const criticalityColor = criticality === "High" ? "danger" : criticality === "Medium" ? "warning" : "success";

  // Overall health: worse of oil analysis / oil change / open actions.
  const healthScore = (latestSample?.reportStatus === "Alert" ? 2 : latestSample?.reportStatus === "Caution" || latestSample?.reportStatus === "Warning" ? 1 : 0)
    + (oilChangeOverdue ? 2 : 0)
    + (openActions.length > 0 ? 1 : 0);
  const health = healthScore >= 3 ? "Poor" : healthScore >= 1 ? "Fair" : "Good";
  const healthColor = health === "Poor" ? "danger" : health === "Fair" ? "warning" : "success";

  const timeline = useMemo(() => {
    const events = [];
    changeHistory.forEach((c) => events.push({ type: "Change", date: c.eventDate, label: `${c.quantityUsed || "—"} L`, detail: c.oilBrandType }));
    lpSamples.forEach((sm) => events.push({ type: "Sample", date: sm.sampledDate, label: sm.reportStatus || "—", detail: sm.sampleId }));
    topUps.forEach((t) => events.push({ type: "TopUp", date: t.eventDate, label: `${t.quantity || "—"} L`, detail: t.reason }));
    return events.filter((e) => e.date).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-12);
  }, [changeHistory, lpSamples, topUps]);

  if (!selectedCode) {
    return <SearchBar T={T} s={s} equipmentRegistry={equipmentRegistry} onSelect={select} />;
  }

  if (!reg) {
    return (
      <div>
        <button style={{ ...s.btn, marginBottom: 14 }} onClick={() => select(null)}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Search
        </button>
        <p style={{ color: T.danger }}>Lubrication point not found.</p>
      </div>
    );
  }

  return (
    <div>
      <button style={{ ...s.btn, marginBottom: 14 }} onClick={() => select(null)}>
        <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Search
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={{ ...s.sectionTitle, margin: 0 }}>{reg.code}</p>
            <SmallBadge T={T} color={healthColor}>{health}</SmallBadge>
          </div>
          <p style={{ fontSize: 14, color: T.textSecondary, margin: "4px 0 8px" }}>{reg.lubricationPoint || reg.description}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SmallBadge T={T} color="textSecondary">{reg.area || "—"}</SmallBadge>
            <SmallBadge T={T} color="accent">{reg.contractor || "—"}</SmallBadge>
            <SmallBadge T={T} color={criticalityColor}>Criticality: {criticality}</SmallBadge>
          </div>
        </div>
        <div style={{ ...s.metricCard, textAlign: "center", minWidth: 110 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{siblingCount}</div>
          <div style={{ fontSize: 10, color: T.textSecondary }}>LP Points on this equipment</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={{
              ...s.btn,
              background: activeTab === t.key ? T.accent : "transparent",
              color: activeTab === t.key ? T.accentText : T.textSecondary,
              borderColor: activeTab === t.key ? T.accent : T.border,
            }}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 20 }}>
            <div style={s.card}>
              <p style={{ fontWeight: 700, margin: "0 0 10px" }}>Equipment Health Status</p>
              {[
                { label: "Oil Analysis", value: latestSample?.reportStatus || "No data", color: latestSample ? statusColorKey(latestSample.reportStatus) : "textMuted" },
                { label: "Oil Change", value: lpOilChangeState?.status || "No data", color: oilChangeOverdue ? "danger" : "success" },
                { label: "Top Up", value: latestTopUp ? "Logged" : "None", color: "textSecondary" },
                { label: "Open Actions", value: String(openActions.length), color: openActions.length ? "warning" : "success" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ color: T.textSecondary }}>{row.label}</span>
                  <span style={{ color: T[row.color], fontWeight: 700 }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={s.card}>
              <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-flask" aria-hidden="true" /> Last Oil Sample</p>
              {latestSample ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{latestSample.sampledDate}</div>
                  <SmallBadge T={T} color={statusColorKey(latestSample.reportStatus)}>{latestSample.reportStatus}</SmallBadge>
                  <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>Sample {latestSample.sampleId}</div>
                </>
              ) : (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No samples logged.</p>
              )}
            </div>

            <div style={s.card}>
              <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-droplet" aria-hidden="true" /> Last Oil Change</p>
              {latestChange ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{latestChange.eventDate}</div>
                  <SmallBadge T={T} color={oilChangeOverdue ? "danger" : "success"}>{lpOilChangeState?.status || "—"}</SmallBadge>
                  <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>{latestChange.quantityUsed} L · {latestChange.oilBrandType}</div>
                </>
              ) : loadingHistory ? (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
              ) : (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No oil changes logged.</p>
              )}
            </div>

            <div style={s.card}>
              <p style={{ fontWeight: 700, margin: "0 0 10px" }}><i className="ti ti-droplet-plus" aria-hidden="true" /> Last Top Up</p>
              {latestTopUp ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{latestTopUp.eventDate}</div>
                  <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 8 }}>{latestTopUp.quantity} L · {latestTopUp.reason}</div>
                </>
              ) : loadingHistory ? (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>Loading…</p>
              ) : (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No top-ups logged.</p>
              )}
            </div>
          </div>

          <div style={{ ...s.card, marginBottom: 20 }}>
            <p style={{ fontWeight: 700, margin: "0 0 12px" }}>Lubrication Timeline</p>
            {timeline.length === 0 ? (
              <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0 }}>No lubrication activity logged yet.</p>
            ) : (
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                {timeline.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      flex: "0 0 auto",
                      minWidth: 110,
                      border: `1px solid ${T[TIMELINE_COLOR[e.type]]}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: T[TIMELINE_COLOR[e.type]] }}>{e.type}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, margin: "4px 0" }}>{e.date}</div>
                    <div style={{ fontSize: 10.5, color: T.textSecondary }}>{e.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            <RecentTable T={T} s={s} title="Recent Oil Samples" rows={lpSamples.slice(0, 5)} columns={["sampledDate", "sampleId", "reportStatus"]} headers={["Date", "Sample ID", "Status"]} />
            <RecentTable T={T} s={s} title="Recent Oil Changes" rows={changeHistory.slice(0, 5)} columns={["eventDate", "quantityUsed", "oilBrandType"]} headers={["Date", "Qty (L)", "Oil"]} />
            <RecentTable T={T} s={s} title="Recent Top Ups" rows={topUps.slice(0, 5)} columns={["eventDate", "quantity", "reason"]} headers={["Date", "Qty (L)", "Reason"]} />
            <RecentTable T={T} s={s} title="Recent Actions" rows={lpActions.slice(0, 5)} columns={["revisionDate", "status", "agreedAction"]} headers={["Date", "Status", "Action"]} />
          </div>
        </div>
      )}

      {activeTab === "samples" && (
        <HistoryTable
          T={T} s={s}
          rows={lpSamples}
          empty="No oil samples logged for this lubrication point."
          columns={[
            { key: "sampledDate", label: "Date" },
            { key: "sampleId", label: "Sample ID" },
            { key: "reportStatus", label: "Status", badge: statusColorKey },
          ]}
        />
      )}

      {activeTab === "changes" && (
        loadingHistory ? <p style={{ color: T.textSecondary }}>Loading…</p> :
        <HistoryTable
          T={T} s={s}
          rows={changeHistory}
          empty="No oil changes logged for this lubrication point."
          columns={[
            { key: "eventDate", label: "Date" },
            { key: "quantityUsed", label: "Quantity (L)" },
            { key: "oilBrandType", label: "Oil" },
            { key: "doneBy", label: "Done By" },
            { key: "nextDueDate", label: "Next Due" },
          ]}
        />
      )}

      {activeTab === "topups" && (
        loadingHistory ? <p style={{ color: T.textSecondary }}>Loading…</p> :
        <HistoryTable
          T={T} s={s}
          rows={topUps}
          empty="No top-ups logged for this lubrication point."
          columns={[
            { key: "eventDate", label: "Date" },
            { key: "quantity", label: "Quantity (L)" },
            { key: "reason", label: "Reason" },
            { key: "doneBy", label: "Done By" },
          ]}
        />
      )}

      {activeTab === "actions" && (
        <HistoryTable
          T={T} s={s}
          rows={lpActions}
          empty="No actions logged for this lubrication point."
          columns={[
            { key: "revisionDate", label: "Date" },
            { key: "status", label: "Status", badge: () => "textSecondary" },
            { key: "agreedAction", label: "Action" },
            { key: "contractor", label: "Contractor" },
          ]}
        />
      )}

      {activeTab === "info" && (
        <div style={{ ...s.card, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {[
            ["Lubrication Location", reg.lubricationLocation],
            ["Point Code", reg.pointCode],
            ["Position", reg.position],
            ["Operating Temp (°C)", reg.operatingTempC],
            ["Lubricant", reg.lubricant],
            ["Lubricant Brand", reg.lubricantBrand],
            ["Quantity (L)", reg.lubricantQuantityL],
            ["Oil Analysis Required", reg.oilAnalysisRequired],
            ["Sampling Interval", reg.interval],
            ["Oil Change Interval", reg.oilChangeInterval],
            ["Status", reg.status],
            ["Created Date", reg.createdDate],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{value || "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusColorKey(status) {
  if (status === "Alert") return "danger";
  if (status === "Caution" || status === "Warning") return "warning";
  if (status === "Normal") return "success";
  return "textMuted";
}

function RecentTable({ T, s, title, rows, columns, headers }) {
  return (
    <div style={s.card}>
      <p style={{ fontWeight: 700, margin: "0 0 10px" }}>{title}</p>
      {rows.length === 0 ? (
        <p style={{ color: T.textSecondary, fontSize: 12, margin: 0 }}>None yet.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} style={{ textAlign: "left", color: T.textSecondary, fontWeight: 600, padding: "4px 6px 6px 0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                {columns.map((c) => (
                  <td key={c} style={{ padding: "6px 6px 6px 0" }}>{r[c] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryTable({ T, s, rows, empty, columns }) {
  if (rows.length === 0) {
    return (
      <div style={s.card}>
        <p style={{ color: T.textSecondary, margin: 0 }}>{empty}</p>
      </div>
    );
  }
  return (
    <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden" }}>
      <table style={s.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={s.th}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={s.td}>
                  {c.badge ? <SmallBadge T={T} color={c.badge(r[c.key])}>{r[c.key] ?? "—"}</SmallBadge> : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

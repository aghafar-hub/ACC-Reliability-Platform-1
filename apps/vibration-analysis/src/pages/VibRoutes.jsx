import { useCallback, useEffect, useMemo, useState } from "react";
import { createVibRoute, dismissVibSuggestion, getVibRoute, getVibRoutes, peekCached, vibRouteTransition } from "../api";
import { useTheme } from "../ThemeContext";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import ModalShell, { FormSection, ReadValue, StepTrail } from "../components/ModalShell";
import { CalendarHeat } from "../components/DashCharts";
import Tile, { PageHeader, TabBar } from "../components/Tile";
import { PhoneSummary } from "../components/PhoneParts";
import { StatePill } from "../components/Level";
import { SCOPES, shortDate } from "../vibModel";
import { routeTone } from "../tones";

// Vibration Routes (workflow "Route Planning & Assignment"): suggestions
// worked out from each machine's interval and from actions that need a
// follow-up reading; routes grouped by the contractor engineer and assigned
// to a technician (who ticks the points in My Work); ACC emergency routes;
// confirm / return / reassign / reschedule / cancel. Backend: Routes.js.

const STEPS = ["Unassigned", "Assigned", "In Progress", "Submitted", "Closed"];
const ACTIVE = ["Unassigned", "Assigned", "In Progress", "Submitted", "Returned"];
const typeTone = (T, t) => ({ Emergency: T.danger, "Follow-up": T.alert || T.warning, Scheduled: T.textSecondary }[t] || T.textSecondary);

export default function VibRoutes({ webhookUrl, openRouteId, setOpenRouteId }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [chartsOpen, setChartsOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [data, setData] = useState(() => peekCached("getVibRoutes", { days: "30" }));
  const [error, setError] = useState("");
  const [contractor, setContractor] = useState("All");
  const [tab, setTab] = useState("routes");
  const [creating, setCreating] = useState(null);
  const [picked, setPicked] = useState([]);
  const [dismissing, setDismissing] = useState(null);
  const [scope, setScope] = useState("All");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getVibRoutes(webhookUrl, days));
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl, days]);
  useEffect(() => {
    load();
  }, [load]);

  const me = data?.me || {};
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const inScope = (x) => (contractor === "All" || x.Contractor === contractor || x.contractor === contractor) && (scope === "All" || String(x["Report scope"] || x.scope || "").includes(scope));
  const routes = (data?.routes || []).filter(inScope);
  const active = routes.filter((r) => ACTIVE.includes(r.Status)).sort((a, b) => (a["Planned date"] < b["Planned date"] ? -1 : 1));
  const done = routes.filter((r) => !ACTIVE.includes(r.Status)).sort((a, b) => (a["Planned date"] < b["Planned date"] ? 1 : -1));
  const sugg = (data?.suggestions || []).filter(inScope);
  const machines = (data?.machines || []).filter(inScope);
  const closed12 = done.filter((r) => r.Status === "Closed" && r["Planned date"] >= new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10));
  const onTime = closed12.filter((r) => String(r["Submitted at"] || "").slice(0, 10) <= r["Planned date"]);
  const heat = useMemo(() => {
    const m = new Map();
    const add = (d, n, what) => {
      const x = m.get(d) || { count: 0, detail: [] };
      x.count += n;
      x.detail.push(what);
      m.set(d, x);
    };
    active.forEach((r) => add(r["Planned date"], +r.Machines || 0, `${r["Route ID"]} (${r.Machines})`));
    sugg.forEach((x) => add(x.due < today ? today : x.due, 1, `${x.equipmentId} due`));
    return m;
  }, [active, sugg, today]);
  const canCreate = me.engineer || me.acc;
  const contractors = me.contractor ? [me.contractor] : ["RHI", "ASEC"];

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-routes">
      <PageHeader
        title="Vibration Routes"
        subtitle={data ? `${active.length} active routes · ${active.filter((r) => r.overdue).length} overdue · ${sugg.length} measurements due in the next ${days} days · each machine has its own interval` : "Loading routes…"}
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={contractors} testid="vr-contractor" />
            <select style={s.select} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Window" data-testid="vr-days">
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  Next {d} days
                </option>
              ))}
            </select>
            {me.engineer && (
              <button type="button" style={s.btnPrimary} onClick={() => setCreating({ type: "Scheduled", machines: picked.map((k) => sugg.find((x) => x.key === k)).filter(Boolean) })} data-testid="vr-create">
                <i className="ti ti-plus" aria-hidden="true" /> Create route
              </button>
            )}
            {!me.engineer && me.acc && (
              <button type="button" style={{ ...s.btnPrimary, background: T.danger }} onClick={() => setCreating({ type: "Emergency", machines: [] })} data-testid="vr-emergency">
                <i className="ti ti-urgent" aria-hidden="true" /> Emergency route
              </button>
            )}
          </>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          Couldn't load routes: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {data && (
        <>
          {isMobile && (
            <PhoneSummary open={chartsOpen} onToggle={() => setChartsOpen((v) => !v)} testid="vr-summary">
              <span style={{ color: active.some((r) => r.overdue) ? T.danger : T.textPrimary, fontWeight: 700 }}>{active.filter((r) => r.overdue).length} overdue</span>
              <span style={{ color: T.textSecondary }}>{sugg.filter((x) => x.type === "Follow-up").length} follow-ups due</span>
            </PhoneSummary>
          )}
          {(!isMobile || chartsOpen) && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr)) minmax(0,1.6fr)", marginBottom: 14, alignItems: "start" }}>
            <Tile icon="ti-clock-exclamation" value={active.filter((r) => r.overdue).length} label="Overdue routes" sub={active.filter((r) => r.overdue).map((r) => r["Route ID"]).slice(0, 3).join(" · ") || "None"} tone={active.some((r) => r.overdue) ? T.danger : undefined} testid="vr-tile-overdue" />
            <Tile icon="ti-repeat" value={sugg.filter((x) => x.type === "Follow-up").length} label="Follow-up readings due" sub="made from actions (Alert 30 d, Danger 7 d)" tone={sugg.some((x) => x.type === "Follow-up") ? T.alert : undefined} onClick={() => setTab("suggestions")} testid="vr-tile-followup" />
            <Tile
              icon="ti-checks"
              value={closed12.length ? `${Math.round((onTime.length / closed12.length) * 100)}%` : "—"}
              label="Routes done on time (12 m)"
              sub={`${active.filter((r) => r.Status === "Submitted").length} waiting for engineer confirmation`}
              testid="vr-tile-ontime"
            />
            <div style={{ ...s.card, marginBottom: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8, color: T.textPrimary }}>
                Machines due per day <span style={{ fontWeight: 400, fontSize: 12, color: T.textSecondary }}>next 5 weeks · routes + suggestions</span>
              </div>
              <CalendarHeat T={T} days={heat} weeks={5} unit="machines" />
            </div>
          </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <select style={s.select} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
              <option value="All">All scopes</option>
              {SCOPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <TabBar
            value={tab}
            onChange={setTab}
            testid="vr-tabs"
            tabs={[
              { id: "routes", label: "Routes", count: active.length },
              { id: "suggestions", label: "Suggestions", count: sugg.length },
              { id: "machines", label: "Machines & intervals", count: machines.length },
              { id: "closed", label: "Closed / cancelled", count: done.length },
            ]}
          />
          {(tab === "routes" || tab === "closed") && <RouteTable T={T} s={s} rows={tab === "routes" ? active : done} onOpen={setOpenRouteId} empty={tab === "routes" ? "No active routes." : "Nothing closed yet."} />}
          {tab === "suggestions" && (
            <SuggestionTable
              T={T}
              s={s}
              rows={sugg}
              picked={picked}
              setPicked={setPicked}
              canPlan={me.engineer}
              canDismiss={me.engineer || me.acc}
              onCreate={() => setCreating({ type: picked.some((k) => sugg.find((x) => x.key === k)?.type === "Follow-up") ? "Follow-up" : "Scheduled", machines: picked.map((k) => sugg.find((x) => x.key === k)).filter(Boolean) })}
              onDismiss={setDismissing}
            />
          )}
          {tab === "machines" && <MachineTable T={T} s={s} rows={machines} today={today} onOpen={setOpenRouteId} />}
        </>
      )}
      {creating && data && canCreate && (
        <CreateRoute
          webhookUrl={webhookUrl}
          me={me}
          preset={creating}
          machines={data.machines || []}
          suggestions={data.suggestions || []}
          technicians={data.technicians || []}
          today={today}
          onClose={() => setCreating(null)}
          onSaved={(id) => {
            setCreating(null);
            setPicked([]);
            load();
            setOpenRouteId(id);
          }}
        />
      )}
      {openRouteId && (
        <RouteModal
          webhookUrl={webhookUrl}
          routeId={openRouteId}
          onClose={() => setOpenRouteId(null)}
          onChanged={load}
        />
      )}
      {dismissing && (
        <DismissModal
          webhookUrl={webhookUrl}
          s={dismissing}
          onClose={() => setDismissing(null)}
          onSaved={() => {
            setDismissing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RouteTable({ T, s, rows, onOpen, empty }) {
  return (
    <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vr-table">
      <table data-phone-cards="" style={s.table}>
        <thead>
          <tr>
            {["Route", "Type", "Name", "Contractor", "Machines", "Points", "Planned", "Technician", "Status", ""].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r["Route ID"]} style={{ cursor: "pointer" }} onClick={() => onOpen(r["Route ID"])} data-testid={`vr-row-${r["Route ID"]}`}>
              <td style={{ ...s.td, fontWeight: 700 }}>{r["Route ID"]}</td>
              <td style={s.td}>
                <StatePill tone={typeTone(T, r.Type)}>{r.Type}</StatePill>
              </td>
              <td style={s.td}>{r.Name}</td>
              <td style={s.td}>{r.Contractor}</td>
              <td style={s.td}>{r.Machines}</td>
              <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                {r["Points done"] || 0} / {r.Points}
                <span style={{ display: "block", height: 4, background: T.border2, borderRadius: 2, marginTop: 3, width: 70 }}>
                  <span style={{ display: "block", height: 4, borderRadius: 2, background: T.success, width: `${r.Points ? Math.round(((+r["Points done"] || 0) / r.Points) * 100) : 0}%` }} />
                </span>
              </td>
              <td style={{ ...s.td, whiteSpace: "nowrap", color: r.overdue ? T.danger : T.textPrimary, fontWeight: r.overdue ? 700 : 400 }}>
                {r.overdue && "⚠ "}
                {shortDate(r["Planned date"])}
              </td>
              <td style={s.td}>{r.Technician || <span style={{ color: T.warning }}>none</span>}</td>
              <td style={s.td}>
                <StatePill tone={routeTone(T, r.Status)}>{r.Status}</StatePill>
              </td>
              <td style={{ ...s.td, color: T.textSecondary }}>›</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={10} style={{ ...s.td, color: T.textSecondary }}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SuggestionTable({ T, s, rows, picked, setPicked, canPlan, canDismiss, onCreate, onDismiss }) {
  const toggle = (k) => setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
  return (
    <>
      {canPlan && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.textSecondary }}>{picked.length} picked</span>
          <button type="button" style={s.btnPrimary} disabled={!picked.length} onClick={onCreate} data-testid="vr-plan">
            Create route from picked
          </button>
          {picked.length > 0 && (
            <button type="button" style={{ ...s.btnGhost, padding: "6px 10px" }} onClick={() => setPicked([])}>
              Clear
            </button>
          )}
        </div>
      )}
      <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vr-sugg">
        <table data-phone-cards="" style={s.table}>
          <thead>
            <tr>
              {[canPlan ? "" : null, "Machine", "Scope", "Why", "Due", ""].filter((h) => h !== null).map((h, i) => (
                <th key={i} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} data-testid={`vr-sugg-${x.equipmentId}`}>
                {canPlan && (
                  <td style={s.td}>
                    <input type="checkbox" checked={picked.includes(x.key)} onChange={() => toggle(x.key)} aria-label={`Pick ${x.equipmentId}`} />
                  </td>
                )}
                <td style={s.td}>
                  <b>{x.equipmentId}</b> <span style={{ color: T.textSecondary }}>{x.name}</span>
                </td>
                <td style={s.td}>
                  {x.contractor} · {x.scope}
                </td>
                <td style={s.td}>
                  <StatePill tone={typeTone(T, x.type)}>{x.type}</StatePill> <span style={{ fontSize: 12.5 }}>{x.reason}</span>
                </td>
                <td style={{ ...s.td, whiteSpace: "nowrap", color: x.overdue ? T.danger : T.textPrimary, fontWeight: x.overdue ? 700 : 400 }}>
                  {x.overdue ? "⚠ " : ""}
                  {shortDate(x.due)}
                </td>
                <td style={s.td}>
                  {canDismiss && (
                    <button type="button" style={{ ...s.btnGhost, padding: "3px 9px" }} onClick={() => onDismiss(x)}>
                      Dismiss
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ ...s.td, color: T.textSecondary }}>
                  Nothing due in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MachineTable({ T, s, rows, today, onOpen }) {
  return (
    <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vr-machines">
      <table data-phone-cards="" style={s.table}>
        <thead>
          <tr>
            {["Machine", "Scope", "Interval", "Last measured", "Next due", "On route", "Status"].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.equipmentId}>
              <td style={s.td}>
                <b>{m.equipmentId}</b> <span style={{ color: T.textSecondary }}>{m.name}</span>
              </td>
              <td style={s.td}>
                {m.contractor} · {m.scope}
              </td>
              <td style={s.td}>{m.interval} days</td>
              <td style={s.td}>{shortDate(m.lastMeasured) || "never"}</td>
              <td style={{ ...s.td, color: m.nextDue && m.nextDue < today ? T.danger : T.textPrimary }}>{shortDate(m.nextDue) || "now"}</td>
              <td style={s.td}>
                {m.onRoute ? (
                  <button type="button" onClick={() => onOpen(m.onRoute)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                    {m.onRoute}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td style={s.td}>{m.inactive ? <StatePill tone={T.warning}>Inactive</StatePill> : <StatePill tone={T.success}>Active</StatePill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Two panes (design reference §4): available machines with search / filters
// and tick boxes | the picked ones with remove ✕.
function CreateRoute({ webhookUrl, me, preset, machines, suggestions, technicians, today, onClose, onSaved }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const emergency = preset.type === "Emergency";
  const [type, setType] = useState(preset.type || "Scheduled");
  const [contractor, setContractor] = useState(me.contractor || preset.machines?.[0]?.contractor || "RHI");
  const [picked, setPicked] = useState(() => (preset.machines || []).map((x) => x.equipmentId));
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("All");
  const [dueOnly, setDueOnly] = useState(!emergency);
  const [date, setDate] = useState(today);
  const [tech, setTech] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState(preset.machines?.map((x) => x.reason).filter(Boolean).slice(0, 3).join("; ") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dueKeys = new Set(suggestions.map((x) => x.equipmentId));
  const qMatch = idTextMatch(q, machines.map((m) => m.equipmentId));
  const list = machines.filter((m) => m.contractor === contractor && !m.inactive && !m.onRoute && (scope === "All" || m.scope === scope) && (!dueOnly || dueKeys.has(m.equipmentId)) && qMatch(m.equipmentId, m.name));
  const sourceAction = (preset.machines || []).map((x) => x.sourceAction).filter(Boolean)[0] || "";
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const save = async () => {
    setError("");
    if (!picked.length) return setError("Pick at least one machine.");
    if (emergency && !reason.trim()) return setError("Say why the emergency measurement is needed.");
    setBusy(true);
    try {
      const r = await createVibRoute(webhookUrl, { name, type, contractor, plannedDate: date, technician: tech, machines: picked, reason, sourceAction, suggestions: (preset.machines || []).map((x) => x.key) });
      onSaved(r.routeId);
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  return (
    <ModalShell
      icon={emergency ? "urgent" : "route"}
      title={emergency ? "ACC emergency route" : "Create vibration route"}
      subtitle={emergency ? "The contractor engineer assigns the technician" : "Group machines, set the date, assign a technician"}
      onClose={onClose}
      width={980}
      testid="vr-create-modal"
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: 12.5, color: T.textSecondary }}>{picked.length} machines picked</span>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vr-create-save">
            {busy ? "Creating…" : "Create route"}
          </button>
        </>
      }
    >
      <FormSection icon="route" title="Route">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          {emergency ? (
            <ReadValue label="Type">Emergency (ACC)</ReadValue>
          ) : (
            <div>
              <span style={{ ...s.label, fontSize: 12 }}>Type</span>
              <ContractorChips value={type} onChange={setType} options={["Scheduled", "Follow-up"]} allLabel={null} label="Type" size="sm" />
            </div>
          )}
          {me.contractor ? (
            <ReadValue label="Contractor">{me.contractor}</ReadValue>
          ) : (
            <div>
              <span style={{ ...s.label, fontSize: 12 }}>Contractor</span>
              <ContractorChips
                value={contractor}
                onChange={(c) => {
                  setContractor(c);
                  setPicked([]);
                }}
                allLabel={null}
                size="sm"
              />
            </div>
          )}
          <label>
            <span style={{ ...s.label, fontSize: 12 }}>Planned date</span>
            <input type="date" style={s.input} value={date} min={emergency ? undefined : today} onChange={(e) => setDate(e.target.value)} data-testid="vr-date" />
          </label>
          <label>
            <span style={{ ...s.label, fontSize: 12 }}>Technician {emergency && <span style={{ fontWeight: 400 }}>(optional)</span>}</span>
            <select style={{ ...s.select, width: "100%" }} value={tech} onChange={(e) => setTech(e.target.value)} data-testid="vr-tech">
              <option value="">{emergency ? "Contractor engineer assigns" : "Assign later"}</option>
              {technicians
                .filter((t) => !t.contractor || t.contractor === contractor)
                .map((t) => (
                  <option key={t.email} value={t.email}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", marginTop: 12 }}>
          <label>
            <span style={{ ...s.label, fontSize: 12 }}>Name (optional)</span>
            <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Line 1 raw mill — October" />
          </label>
          <label>
            <span style={{ ...s.label, fontSize: 12 }}>Why {emergency && <span style={{ color: T.danger }}>*</span>}</span>
            <input style={s.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={emergency ? "e.g. operator reports noise at fan NDE" : "interval due / follow-up of VA-…"} data-testid="vr-reason" />
          </label>
        </div>
        {sourceAction && <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 8 }}>Linked to action {sourceAction}</div>}
      </FormSection>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.3fr) minmax(0,1fr)" }}>
        <FormSection icon="list-search" title="Machines" hint={`${list.length} available`} style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <EquipmentSearch freeText options={machines.filter((m) => m.contractor === contractor && !m.inactive && !m.onRoute).map((m) => ({ code: m.equipmentId, description: m.name }))} value={q} onChange={setQ} placeholder="Equipment ID or name…" width="100%" testid="vr-find" />
            </div>
            <select style={s.select} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
              <option value="All">All scopes</option>
              {SCOPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12.5, color: T.textSecondary }}>
              <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Due only
            </label>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {list.map((m) => (
              <label key={m.equipmentId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 2px", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={picked.includes(m.equipmentId)} onChange={() => toggle(m.equipmentId)} data-testid={`vr-pick-${m.equipmentId}`} />
                <b>{m.equipmentId}</b>
                <span style={{ color: T.textSecondary, flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 12, color: m.nextDue && m.nextDue < today ? T.danger : T.textMuted }}>{m.nextDue ? `due ${shortDate(m.nextDue)}` : "never measured"}</span>
              </label>
            ))}
            {!list.length && <div style={{ fontSize: 13, color: T.textSecondary }}>No machines — try "Due only" off. Machines already on an active route are not shown.</div>}
          </div>
        </FormSection>
        <FormSection icon="checklist" title="Picked" hint={`${picked.length}`} right={picked.length ? <button type="button" style={{ ...s.btnGhost, padding: "3px 9px" }} onClick={() => setPicked([])}>Clear</button> : null} style={{ marginBottom: 0 }}>
          {picked.map((id) => {
            const m = machines.find((x) => x.equipmentId === id);
            return (
              <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 2px", fontSize: 13 }}>
                <b>{id}</b>
                <span style={{ color: T.textSecondary, flex: 1 }}>{m?.name}</span>
                <button type="button" aria-label={`Remove ${id}`} onClick={() => toggle(id)} style={{ border: "none", background: "none", cursor: "pointer", color: T.textSecondary }}>
                  ✕
                </button>
              </div>
            );
          })}
          {!picked.length && <div style={{ fontSize: 13, color: T.textSecondary }}>Tick machines on the left.</div>}
        </FormSection>
      </div>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13, whiteSpace: "pre-wrap", marginTop: 10 }} data-testid="vr-create-error">
          {error}
        </div>
      )}
    </ModalShell>
  );
}

function RouteModal({ webhookUrl, routeId, onClose, onChanged }) {
  const { T, s } = useTheme();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [tech, setTech] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const x = await getVibRoute(webhookUrl, routeId);
      setD(x);
      setTech(x.route.Technician || "");
      setDate(x.route["Planned date"] || "");
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl, routeId]);
  useEffect(() => {
    load();
  }, [load]);
  const r = d?.route;
  const me = d?.me || {};
  const eng = me.engineer && r && r.Contractor === me.contractor;
  const accEm = me.canApprove && r?.Type === "Emergency";
  const can = eng || accEm;
  const st = r?.Status;
  const open = r && !["Closed", "Cancelled"].includes(st);
  const step = async (to, extra = {}) => {
    setError("");
    setBusy(true);
    try {
      await vibRouteTransition(webhookUrl, { routeId, to, reason, ...extra });
      setReason("");
      await load();
      onChanged();
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };
  const byEq = {};
  (d?.points || []).forEach((p) => (byEq[p["Equipment ID"]] ||= []).push(p));
  return (
    <ModalShell
      icon="route"
      title={r ? `${r["Route ID"]} · ${r.Name}` : routeId}
      subtitle={r ? `${r.Type} · ${r.Contractor} ${r["Report scope"]} · planned ${shortDate(r["Planned date"])}${r.Technician ? ` · ${r.Technician}` : ""}` : "Loading…"}
      badge={r && <StatePill tone={routeTone(T, st)} testid="vr-status">{st}</StatePill>}
      onClose={onClose}
      width={860}
      testid="vr-modal"
      footer={
        r && (
          <>
            {open && can && st !== "Submitted" && (
              <button type="button" style={{ ...s.btnGhost, color: T.danger, borderColor: T.danger, marginRight: "auto" }} disabled={busy} onClick={() => step("cancel")} data-testid="vr-cancel">
                Cancel route
              </button>
            )}
            <button type="button" style={s.btnGhost} onClick={onClose}>
              Close
            </button>
            {st === "Submitted" && eng && (
              <>
                <button type="button" style={s.btnGhost} disabled={busy} onClick={() => step("return")} data-testid="vr-return">
                  Return to technician
                </button>
                <button type="button" style={s.btnPrimary} disabled={busy} onClick={() => step("confirm")} data-testid="vr-confirm">
                  Confirm & close
                </button>
              </>
            )}
          </>
        )
      }
    >
      {r && st !== "Cancelled" && <StepTrail steps={STEPS} current={st === "Returned" ? "In Progress" : st} testid="vr-steps" />}
      {r?.Status === "Returned" && (
        <div role="status" style={{ ...s.card, borderLeft: `4px solid ${T.danger}`, background: T.dangerBg, marginBottom: 14 }}>
          <b>Returned:</b> {r["Return reason"]}
        </div>
      )}
      {r?.Reason && (
        <FormSection icon="info-circle" title="Why">
          <span style={{ fontSize: 13 }}>{r.Reason}</span>
          {r["Source action"] && <span style={{ fontSize: 12.5, color: T.textSecondary }}> · action {r["Source action"]}</span>}
        </FormSection>
      )}
      {r && open && can && (
        <FormSection icon="user-check" title="Technician and date">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label>
              <span style={{ ...s.label, fontSize: 12 }}>Technician</span>
              <select style={s.select} value={tech} onChange={(e) => setTech(e.target.value)} data-testid="vr-assign-tech" disabled={st === "Submitted"}>
                <option value="">Pick…</option>
                {(d.technicians || []).map((t) => (
                  <option key={t.email} value={t.email}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" style={s.btnGhost} disabled={busy || !tech || tech === r.Technician || st === "Submitted"} onClick={() => step("assign", { technician: tech })} data-testid="vr-assign">
              {r.Technician ? "Reassign" : "Assign"}
            </button>
            <label>
              <span style={{ ...s.label, fontSize: 12 }}>Planned date</span>
              <input type="date" style={s.input} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button type="button" style={s.btnGhost} disabled={busy || !date || date === r["Planned date"]} onClick={() => step("reschedule", { plannedDate: date })} data-testid="vr-reschedule">
              Reschedule
            </button>
          </div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>Reassigning, rescheduling, returning and cancelling need a reason (below).</div>
        </FormSection>
      )}
      <FormSection icon="checklist" title="Points" hint={r ? `${r["Points done"] || 0} / ${r.Points} done or skipped — the technician ticks them in My Work` : ""}>
        {Object.entries(byEq).map(([eq, pts]) => (
          <div key={eq} style={{ padding: "6px 0", borderTop: `1px solid ${T.border2}` }}>
            <b style={{ fontSize: 13 }}>{eq}</b>
            {pts[0]["Equipment comment"] && <span style={{ fontSize: 12.5, color: T.textSecondary }}> — “{pts[0]["Equipment comment"]}”</span>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {pts.map((p) => (
                <span key={p["VIB ID"]} title={p["Skip reason"] || p["VIB ID"]} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: p.Done === "Yes" ? T.successBg : p["Skip reason"] ? T.warningBg : T.cardSubBg, color: p.Done === "Yes" ? T.success : p["Skip reason"] ? T.warning : T.textSecondary }}>
                  {p.Done === "Yes" ? "✓ " : p["Skip reason"] ? "↷ " : "○ "}
                  {p.Point}
                </span>
              ))}
            </div>
          </div>
        ))}
        {r?.["Route comment"] && <div style={{ fontSize: 13, marginTop: 8 }}>Route comment: “{r["Route comment"]}”</div>}
      </FormSection>
      {r && open && (can || eng) && (
        <FormSection icon="message" title="Reason / note">
          <textarea style={{ ...s.input, minHeight: 50 }} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="vr-reason-note" />
        </FormSection>
      )}
      {d?.history?.length > 0 && (
        <FormSection icon="history" title="History">
          {d.history.map((h, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: "3px 0" }}>
              <b>{h.action}</b>
              {h.details && <span style={{ color: T.textSecondary }}> — {h.details}</span>}
              <span style={{ color: T.textMuted }}> · {h.who} · {h.when ? new Date(h.when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
            </div>
          ))}
        </FormSection>
      )}
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13 }} data-testid="vr-error">
          {error}
        </div>
      )}
    </ModalShell>
  );
}

function DismissModal({ webhookUrl, s: sg, onClose, onSaved }) {
  const { T, s } = useTheme();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await dismissVibSuggestion(webhookUrl, { key: sg.key, equipmentId: sg.equipmentId, suggestionReason: sg.reason, reason });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
    }
  };
  return (
    <ModalShell
      icon="x"
      title="Dismiss suggestion"
      subtitle={`${sg.equipmentId} · ${sg.reason} · due ${shortDate(sg.due)}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={save} data-testid="vr-dismiss-save">
            Dismiss
          </button>
        </>
      }
    >
      <FormSection icon="message" title="Why is no measurement needed?">
        <textarea style={{ ...s.input, minHeight: 70 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. machine stopped for overhaul" />
      </FormSection>
      {error && <div role="alert" style={{ color: T.danger, fontSize: 13 }}>{error}</div>}
    </ModalShell>
  );
}

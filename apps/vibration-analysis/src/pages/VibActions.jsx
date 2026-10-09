import { useCallback, useEffect, useMemo, useState } from "react";
import { getVibActionHistory, getVibActions, saveVibAction, vibActionTransition } from "../api";
import { useTheme } from "../ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import ModalShell, { FormSection, ReadValue, StepTrail } from "../components/ModalShell";
import { Donut, StackedBars } from "../components/DashCharts";
import Tile, { PageHeader, TabBar } from "../components/Tile";
import { ChipRow, CountChip, PAGE_SIZE, PhoneSummary, ShowMore } from "../components/PhoneParts";
import { LevelPill, StatePill } from "../components/Level";
import { LEVEL_RANK, LEVELS, levelColor } from "../levels";
import { SCOPES, monthLabel, shortDate } from "../vibModel";
import { STAGES, stageTone } from "../tones";

// Vibration Actions (workflow "Automatic Draft Action & Shared
// Recommendations" + "Agreed Action Execution & ACC Closure"). One action
// per machine problem with four parts in the same record; drafts come from
// approved reports (backend VibActions.js) or are added by hand.
// Draft → Open → Waiting Stoppage → Closure Requested → Closed.

const OPEN = ["Draft", "Open", "Waiting Stoppage", "Closure Requested"];

export default function VibActions({ webhookUrl, scopeEquipment, oldActions, onOpenReport, onOpenMachine, openActionId, setOpenActionId }) {
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [chartsOpen, setChartsOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [contractor, setContractor] = useState("All");
  const [scope, setScope] = useState("All");
  const [sev, setSev] = useState("All");
  const [owner, setOwner] = useState("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState("Board");
  const [tab, setTab] = useState("actions");
  const [quick, setQuick] = useState("");
  // the open action lives in App (so My Work links can open one)
  const openId = openActionId;
  const setOpenId = setOpenActionId;
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await getVibActions(webhookUrl));
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [webhookUrl]);
  useEffect(() => {
    load();
  }, [load]);

  const me = data?.me || {};
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const all = data?.actions || [];
  const pastDue = (a) => ["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today;
  const noOwner = (a) => OPEN.includes(a.Status) && !a.Owner;
  const base = all.filter((a) => (contractor === "All" || a.Contractor === contractor) && (scope === "All" || a["Report scope"] === scope));
  const shown = base
    .filter((a) => (sev === "All" || a.Severity === sev) && (owner === "All" || (owner === "No owner" ? !a.Owner : a.Owner === owner)))
    .filter((a) => !q || `${a["Action ID"]} ${a["Equipment ID"]} ${a["Equipment name"]} ${a["Agreed action"]} ${a["Contractor recommendation"]}`.toLowerCase().includes(q.toLowerCase()))
    .filter((a) => (quick === "pastdue" ? pastDue(a) : quick === "noowner" ? noOwner(a) : quick === "toclose" ? a.Status === "Closure Requested" : true));
  const open = base.filter((a) => OPEN.includes(a.Status));
  const owners = [...new Set(all.map((a) => a.Owner).filter(Boolean))].sort();
  const findingsOf = (id) => (data?.findings || []).filter((f) => f["Action ID"] === id);
  const contractors = me.contractor ? [me.contractor] : ["RHI", "ASEC"];

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-actions">
      <PageHeader
        title="Vibration Actions"
        subtitle={data ? `${open.length} open · ${base.filter(pastDue).length} past due · ${base.filter(noOwner).length} with no owner · ${base.filter((a) => a.Status === "Closure Requested").length} waiting for closure` : "Loading actions…"}
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={contractors} testid="va-contractor" />
            <button type="button" style={s.btnPrimary} onClick={() => setAdding(true)} data-testid="va-add">
              <i className="ti ti-plus" aria-hidden="true" /> Add action
            </button>
          </>
        }
      />
      {error && (
        <div role="alert" style={{ ...s.card, borderColor: T.danger, color: T.danger }}>
          Couldn't load actions: {error}{" "}
          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!data && !error && <div style={{ ...s.card, color: T.textSecondary }}>Loading…</div>}
      {data && (
        <>
          {isMobile && (
            <PhoneSummary open={chartsOpen} onToggle={() => setChartsOpen((v) => !v)} testid="va-summary">
              <span><b style={{ fontSize: 16 }}>{open.length}</b> open</span>
              <span style={{ color: base.some(pastDue) ? T.danger : T.textSecondary, fontWeight: 600 }}>◆ {base.filter(pastDue).length} past due</span>
              <span style={{ color: base.some(noOwner) ? T.warning : T.textSecondary, fontWeight: 600 }}>▲ {base.filter(noOwner).length} no owner</span>
            </PhoneSummary>
          )}
          {(!isMobile || chartsOpen) && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.3fr) minmax(0,0.8fr)", marginBottom: 14 }}>
            <div style={{ ...s.card, marginBottom: 0, display: "flex", gap: 14, alignItems: "center" }} data-testid="va-donut">
              <Donut T={T} size={118} segments={OPEN.map((st) => ({ label: st, value: open.filter((a) => a.Status === st).length, color: stageTone(T, st) }))} center={open.length} sub="open" ariaLabel="Open actions by stage" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, flex: 1 }}>
                {OPEN.map((st) => (
                  <span key={st} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: stageTone(T, st) }} />
                    {st}
                    <b style={{ marginLeft: "auto" }}>{open.filter((a) => a.Status === st).length}</b>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ ...s.card, marginBottom: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, color: T.textPrimary }}>
                Open actions by scope <span style={{ fontWeight: 400, fontSize: 12, color: T.textSecondary }}>severity of the finding · tap to filter</span>
              </div>
              <StackedBars
                T={T}
                labelWidth={120}
                activeLabel={scope === "All" ? null : scope}
                onRow={(r) => setScope(scope === r.label ? "All" : r.label)}
                rows={SCOPES.filter((sc) => all.some((a) => a["Report scope"] === sc && (contractor === "All" || a.Contractor === contractor))).map((sc) => {
                  const l = all.filter((a) => a["Report scope"] === sc && OPEN.includes(a.Status) && (contractor === "All" || a.Contractor === contractor));
                  return { label: sc, parts: ["Caution", "Alert", "Danger"].map((lv) => ({ label: lv, value: l.filter((a) => a.Severity === lv).length, color: levelColor(T, lv) })) };
                })}
              />
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <Tile icon="ti-clock-exclamation" value={base.filter(pastDue).length} label="Past due" tone={base.some(pastDue) ? T.danger : undefined} onClick={() => setQuick(quick === "pastdue" ? "" : "pastdue")} testid="va-tile-pastdue" />
              <Tile icon="ti-user-question" value={base.filter(noOwner).length} label="No owner" tone={base.some(noOwner) ? T.warning : undefined} onClick={() => setQuick(quick === "noowner" ? "" : "noowner")} testid="va-tile-noowner" />
              {me.canApprove && <Tile icon="ti-checks" value={base.filter((a) => a.Status === "Closure Requested").length} label="Waiting for your closure" tone={base.some((a) => a.Status === "Closure Requested") ? T.info : undefined} onClick={() => setQuick(quick === "toclose" ? "" : "toclose")} testid="va-tile-toclose" />}
            </div>
          </div>
          )}
          <TabBar
            value={tab}
            onChange={setTab}
            testid="va-tabs"
            tabs={[
              { id: "actions", label: "Actions", count: base.length },
              { id: "old", label: "Old Action Tracker", count: (oldActions || []).length },
            ]}
          />
          {tab === "actions" && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <input style={{ ...s.input, width: 220 }} placeholder="Find action or machine" value={q} onChange={(e) => setQ(e.target.value)} data-testid="va-find" />
                <select style={s.select} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
                  <option value="All">All scopes</option>
                  {SCOPES.map((sc) => (
                    <option key={sc}>{sc}</option>
                  ))}
                </select>
                <select style={s.select} value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity">
                  <option value="All">All severities</option>
                  {LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <select style={s.select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
                  <option value="All">All owners</option>
                  <option>No owner</option>
                  {owners.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <ContractorChips value={view} onChange={setView} options={["Board", "Table"]} allLabel={null} label="View" size="sm" testid="va-view" />
                {quick && (
                  <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={() => setQuick("")}>
                    ✕ {quick === "pastdue" ? "Past due" : quick === "noowner" ? "No owner" : "Waiting for closure"}
                  </button>
                )}
              </div>
              {view === "Board" ? <Board T={T} s={s} rows={shown} today={today} findingsOf={findingsOf} onOpen={setOpenId} isMobile={isMobile} /> : <ActionTable T={T} s={s} rows={shown} today={today} onOpen={setOpenId} />}
            </>
          )}
          {tab === "old" && <OldTracker T={T} s={s} rows={(oldActions || []).filter((a) => contractor === "All" || a.contractor === contractor)} />}
        </>
      )}
      {openId && (
        <ActionModal
          webhookUrl={webhookUrl}
          action={all.find((a) => a["Action ID"] === openId)}
          findings={findingsOf(openId)}
          owners={data?.owners || []}
          priorities={data?.priorities || []}
          me={me}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onOpenReport={onOpenReport}
          onOpenMachine={onOpenMachine}
        />
      )}
      {adding && (
        <AddActionModal
          webhookUrl={webhookUrl}
          me={me}
          machines={Object.values(scopeEquipment || {}).filter((m) => m.points.length && (!me.contractor || m.contractor === me.contractor))}
          openActions={all.filter((a) => OPEN.includes(a.Status))}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            load().then(() => setOpenId(id));
          }}
          onOpenExisting={(id) => {
            setAdding(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function ActionCard({ T, s, a, today, findings, onOpen }) {
  const late = ["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today;
  return (
    <button
      type="button"
      onClick={() => onOpen(a["Action ID"])}
      data-testid={`va-card-${a["Action ID"]}`}
      style={{ ...s.card, marginBottom: 10, padding: 12, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderLeft: late ? `4px solid ${T.danger}` : `1px solid ${T.border}`, boxSizing: "border-box" }}
    >
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.textSecondary }}>{a["Action ID"]}</span>
        <span style={{ marginLeft: "auto" }}>
          <LevelPill level={a.Severity} />
        </span>
      </span>
      <b style={{ display: "block", marginTop: 6, color: T.textPrimary }}>
        {a["Equipment ID"]} · {a["Equipment name"]}
      </b>
      <span style={{ display: "block", margin: "5px 0", fontSize: 12.5, color: T.textPrimary }}>{a["Agreed action"] || a["ACC recommendation"] || a["Contractor recommendation"] || a["Analysis recommendation"] || <i style={{ color: T.textMuted }}>Recommendations to enter</i>}</span>
      <span style={{ display: "flex", gap: 8, fontSize: 12, color: T.textSecondary }}>
        <span>
          {a.Contractor} · {a.Owner || "no owner"}
        </span>
        <span style={{ marginLeft: "auto", color: late ? T.danger : T.textSecondary, fontWeight: late ? 700 : 400 }}>{a["Due date"] ? `${late ? "⚠ " : ""}${shortDate(a["Due date"])}` : "—"}</span>
      </span>
      {findings.length > 1 && <span style={{ display: "block", fontSize: 12, color: T.textSecondary, marginTop: 4 }}>⊕ {findings.length} findings</span>}
    </button>
  );
}

function Board({ T, s, rows, today, findingsOf, onOpen, isMobile }) {
  const recentClosed = rows.filter((a) => a.Status === "Closed" && (!a["Closed at"] || String(a["Closed at"]).slice(0, 10) >= new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)));
  const [stage, setStage] = useState("Open");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const listFor = (st) => (st === "Closed" ? recentClosed : rows.filter((a) => a.Status === st)).sort((a, b) => (LEVEL_RANK[b.Severity] || 0) - (LEVEL_RANK[a.Severity] || 0) || String(a["Due date"] || "9").localeCompare(String(b["Due date"] || "9")));
  // Phone: one stage at a time (chips above), 50 cards at a time — no
  // five stacked columns to scroll past.
  if (isMobile) {
    const list = listFor(stage);
    return (
      <div data-testid="va-board">
        <ChipRow label="Stage">
          {STAGES.map((st) => (
            <CountChip key={st} on={stage === st} onClick={() => { setStage(st); setLimit(PAGE_SIZE); }} count={listFor(st).length} color={stageTone(T, st)} testid={`va-stage-${st.replace(/\s+/g, "")}`}>
              {st}
            </CountChip>
          ))}
        </ChipRow>
        {stage === "Closed" && <div style={{ fontSize: 12, color: T.textSecondary, margin: "0 2px 8px" }}>Closed in the last 60 days</div>}
        <div data-testid={`va-col-${stage.replace(/\s+/g, "")}`}>
          {list.slice(0, limit).map((a) => (
            <ActionCard key={a["Action ID"]} T={T} s={s} a={a} today={today} findings={findingsOf(a["Action ID"])} onOpen={onOpen} />
          ))}
          {!list.length && <div style={{ ...s.card, fontSize: 13, color: T.textMuted, textAlign: "center" }}>No actions here</div>}
          <ShowMore shown={limit} total={list.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} testid="va-more" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))", alignItems: "start" }} data-testid="va-board">
      {STAGES.map((st) => {
        const list = (st === "Closed" ? recentClosed : rows.filter((a) => a.Status === st)).sort((a, b) => (LEVEL_RANK[b.Severity] || 0) - (LEVEL_RANK[a.Severity] || 0) || String(a["Due date"] || "9").localeCompare(String(b["Due date"] || "9")));
        const tone = stageTone(T, st);
        return (
          <div key={st} style={{ background: tone + "14", borderRadius: 12, padding: 10, minWidth: 0 }} data-testid={`va-col-${st.replace(/\s+/g, "")}`}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontWeight: 700, color: tone }}>
              {st}
              <span style={{ background: T.cardBg, color: tone, borderRadius: 999, padding: "1px 8px", fontSize: 12 }}>{list.length}</span>
              {st === "Closed" && <span style={{ fontSize: 12, fontWeight: 400, color: T.textSecondary }}>last 60 days</span>}
            </div>
            {list.map((a) => (
              <ActionCard key={a["Action ID"]} T={T} s={s} a={a} today={today} findings={findingsOf(a["Action ID"])} onOpen={onOpen} />
            ))}
            {!list.length && <div style={{ fontSize: 12, color: T.textMuted, padding: "6px 2px" }}>None</div>}
          </div>
        );
      })}
    </div>
  );
}

function ActionTable({ T, s, rows, today, onOpen }) {
  return (
    <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="va-table">
      <table data-phone-cards="" style={s.table}>
        <thead>
          <tr>
            {["Action", "Equipment", "Status", "Severity", "Agreed action", "Owner", "Due", "Findings", "Source"].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const late = ["Open", "Waiting Stoppage"].includes(a.Status) && a["Due date"] && a["Due date"] < today;
            return (
              <tr key={a["Action ID"]} style={{ cursor: "pointer" }} onClick={() => onOpen(a["Action ID"])}>
                <td style={{ ...s.td, fontWeight: 700 }}>{a["Action ID"]}</td>
                <td style={s.td}>
                  {a["Equipment ID"]} <span style={{ color: T.textSecondary }}>{a["Equipment name"]}</span>
                </td>
                <td style={s.td}>
                  <StatePill tone={stageTone(T, a.Status)}>{a.Status}</StatePill>
                </td>
                <td style={s.td}>
                  <LevelPill level={a.Severity} />
                </td>
                <td style={{ ...s.td, maxWidth: 320 }}>{a["Agreed action"] || <span style={{ color: T.textMuted }}>—</span>}</td>
                <td style={s.td}>{a.Owner || <span style={{ color: T.warning }}>no owner</span>}</td>
                <td style={{ ...s.td, color: late ? T.danger : T.textPrimary, fontWeight: late ? 700 : 400, whiteSpace: "nowrap" }}>{shortDate(a["Due date"]) || "—"}</td>
                <td style={s.td}>{a.Findings || 0}</td>
                <td style={s.td}>{a.Source}</td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={9} style={{ ...s.td, color: T.textSecondary }}>
                No actions match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OldTracker({ T, s, rows }) {
  const [q, setQ] = useState("");
  const list = rows.filter((a) => !q || `${a.actionNo} ${a.equipmentId} ${a.equipmentName} ${a.agreedAction} ${a.contractorAction}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input style={{ ...s.input, width: 240 }} placeholder="Find in the old tracker" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ fontSize: 12, color: T.textSecondary }}>Read only — the actions recorded before the redesign (📋 Action Tracker tab).</span>
      </div>
      <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="va-old">
        <table data-phone-cards="" style={s.table}>
          <thead>
            <tr>
              {["No.", "Equipment", "Reading date", "Trigger", "Machine status", "Status", "Contractor action", "ACC action", "Agreed action", "Completed"].map((h) => (
                <th key={h} style={s.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((a) => (
              <tr key={a._id + a._rowNum}>
                <td style={s.td}>{a.actionNo}</td>
                <td style={s.td}>
                  {a.equipmentId} <span style={{ color: T.textSecondary }}>{a.equipmentName}</span>
                </td>
                <td style={s.td}>{a.readingDate}</td>
                <td style={s.td}>
                  {a.triggerPoint} {a.triggerValue}
                </td>
                <td style={s.td}>{a.machineStatus}</td>
                <td style={s.td}>{a.actionStatus}</td>
                <td style={{ ...s.td, maxWidth: 220 }}>{a.contractorAction}</td>
                <td style={{ ...s.td, maxWidth: 220 }}>{a.accAction}</td>
                <td style={{ ...s.td, maxWidth: 220 }}>{a.agreedAction}</td>
                <td style={s.td}>{a.completionDate}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={10} style={{ ...s.td, color: T.textSecondary }}>
                  Nothing in the old tracker.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list.length > 300 && <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>Showing 300 of {list.length} — use Find to narrow.</div>}
    </>
  );
}

function ActionModal({ webhookUrl, action, findings, owners, priorities, me, onClose, onChanged, onOpenReport, onOpenMachine }) {
  const { T, s } = useTheme();
  const a = action || {};
  const st = a.Status;
  const isAcc = !!me.acc;
  const canApprove = !!me.canApprove;
  const contractorTurn = st === "Draft";
  const closed = st === "Closed" || st === "Cancelled";
  const [f, setF] = useState(() => ({
    analysisRecommendation: a["Analysis recommendation"] || "",
    contractorRecommendation: a["Contractor recommendation"] || "",
    accRecommendation: a["ACC recommendation"] || "",
    agreedAction: a["Agreed action"] || "",
    owner: a.Owner || "",
    dueDate: a["Due date"] || "",
    priority: a.Priority || "",
    severity: a.Severity || "",
    followUpReading: a["Follow-up reading"] || "No",
    followUpDays: a["Follow-up days"] || "",
  }));
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hist, setHist] = useState(null);
  const actionId = a["Action ID"];
  useEffect(() => {
    getVibActionHistory(webhookUrl, actionId)
      .then((d) => setHist(d.history || []))
      .catch(() => setHist([]));
  }, [webhookUrl, actionId]);
  if (!action) return null;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const dirty = () => {
    const was = { analysisRecommendation: a["Analysis recommendation"] || "", contractorRecommendation: a["Contractor recommendation"] || "", accRecommendation: a["ACC recommendation"] || "", agreedAction: a["Agreed action"] || "", owner: a.Owner || "", dueDate: a["Due date"] || "", priority: a.Priority || "", severity: a.Severity || "", followUpReading: a["Follow-up reading"] || "No", followUpDays: String(a["Follow-up days"] || "") };
    const out = {};
    Object.keys(was).forEach((k) => {
      if (String(f[k] ?? "") !== String(was[k] ?? "")) out[k] = f[k];
    });
    if ("followUpReading" in out || "followUpDays" in out) {
      out.followUpReading = f.followUpReading;
      out.followUpDays = f.followUpDays;
    }
    return out;
  };
  const run = async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      await onChanged();
      onClose();
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  const saveFields = async () => {
    const d = dirty();
    if (!Object.keys(d).length) return;
    await saveVibAction(webhookUrl, { actionId: a["Action ID"], ...d, reason });
  };
  const step = (to, extra = {}) => run(async () => {
    await saveFields();
    await vibActionTransition(webhookUrl, { actionId: a["Action ID"], to, ...extra });
  });
  const editRec = isAcc ? !closed : contractorTurn;
  const area = (k, label, editable, testid, hint) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ ...s.label, fontSize: 12 }}>
        {label} {hint && <span style={{ fontWeight: 400, color: T.textMuted }}>· {hint}</span>}
      </span>
      {editable ? <textarea style={{ ...s.input, minHeight: 58 }} value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={testid} /> : <ReadValue label="">{f[k] || <span style={{ color: T.textMuted }}>—</span>}</ReadValue>}
    </label>
  );
  const footer = (
    <>
      {st === "Draft" && canApprove && (
        <button type="button" style={{ ...s.btnGhost, color: T.danger, borderColor: T.danger, marginRight: "auto" }} disabled={busy || !reason.trim()} title={reason.trim() ? "" : "Write the reason below first"} onClick={() => step("cancel", { reason })} data-testid="va-cancel">
          Cancel action
        </button>
      )}
      <button type="button" style={s.btnGhost} onClick={onClose}>
        Close
      </button>
      {!closed && (isAcc || contractorTurn) && (
        <button type="button" style={s.btnGhost} disabled={busy} onClick={() => run(saveFields)} data-testid="va-save">
          Save
        </button>
      )}
      {st === "Draft" && canApprove && (
        <button type="button" style={s.btnPrimary} disabled={busy} onClick={() => step("open")} data-testid="va-open">
          Agree & open
        </button>
      )}
      {st === "Open" && (
        <button type="button" style={s.btnGhost} disabled={busy} onClick={() => step("waiting")} data-testid="va-waiting">
          Waiting stoppage
        </button>
      )}
      {(st === "Open" || st === "Waiting Stoppage") && (
        <button type="button" style={s.btnPrimary} disabled={busy} onClick={() => step("requestClosure", { evidence, reason: comment })} data-testid="va-request">
          Request closure
        </button>
      )}
      {st === "Closure Requested" && canApprove && (
        <>
          <button type="button" style={s.btnGhost} disabled={busy} onClick={() => step("return", { reason })} data-testid="va-return">
            Return
          </button>
          <button type="button" style={s.btnPrimary} disabled={busy} onClick={() => step("close", { reason })} data-testid="va-close">
            Close action
          </button>
        </>
      )}
    </>
  );
  return (
    <ModalShell
      icon="checklist"
      title={`${a["Action ID"]} · ${a["Equipment ID"]}`}
      subtitle={`${a["Equipment name"]} · ${a.Contractor} ${a["Report scope"]} · ${a.Source === "Automatic" ? "from report findings" : a.Source === "Manual" ? "added by hand" : a.Source}`}
      badge={
        <span style={{ display: "inline-flex", gap: 6 }}>
          <StatePill tone={stageTone(T, st)} testid="va-status">
            {st}
          </StatePill>
          <LevelPill level={a.Severity} />
        </span>
      }
      onClose={onClose}
      width={880}
      testid="va-modal"
      footer={footer}
    >
      {st !== "Cancelled" && <StepTrail steps={STAGES} current={st} testid="va-steps" />}
      {a["Return reason"] && st === "Open" && (
        <div role="status" style={{ ...s.card, borderLeft: `4px solid ${T.danger}`, background: T.dangerBg, marginBottom: 14 }}>
          <b>Returned:</b> {a["Return reason"]}
        </div>
      )}
      <FormSection icon="report-analytics" title="Findings" hint={`${findings.length} from approved reports`}>
        {findings.length ? (
          findings
            .slice()
            .reverse()
            .map((x) => (
              <div key={x["Finding ID"]} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: `1px solid ${T.border2}`, fontSize: 13 }}>
                <LevelPill level={x.Severity} />
                <span style={{ flex: 1 }}>
                  {x.Points}
                  <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>
                    {monthLabel(x.Month)} ·{" "}
                    <button type="button" onClick={() => onOpenReport(x["Report ID"])} style={{ background: "none", border: "none", color: T.accent, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                      {x["Report ID"]}
                    </button>
                  </span>
                </span>
              </div>
            ))
        ) : (
          <span style={{ fontSize: 13, color: T.textSecondary }}>Added by hand — no report finding yet.</span>
        )}
        <button type="button" onClick={() => onOpenMachine(a["Equipment ID"])} style={{ ...s.btnGhost, padding: "4px 10px", marginTop: 8 }}>
          <i className="ti ti-engine" aria-hidden="true" /> Machine page
        </button>
      </FormSection>
      <FormSection icon="messages" title="Recommendations" hint="one record — changing one never makes a new action">
        {area("analysisRecommendation", "Analysis (report) recommendation", editRec, "va-analysis", "from the vibration report")}
        {area("contractorRecommendation", "Contractor recommended action", editRec, "va-contractor-rec", isAcc ? "" : contractorTurn ? "yours to fill" : "fixed once open")}
        {area("accRecommendation", "ACC recommended action", isAcc && !closed, "va-acc-rec", "ACC engineer")}
        {area("agreedAction", "Agreed action", isAcc && !closed, "va-agreed", "ACC engineer — needed to open")}
      </FormSection>
      <FormSection icon="calendar-event" title="Plan" hint={isAcc ? "owner, due date and priority are set by ACC" : "set by ACC"}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          {isAcc && !closed ? (
            <label>
              <span style={{ ...s.label, fontSize: 12 }}>Owner (contractor engineer)</span>
              <select style={{ ...s.select, width: "100%" }} value={f.owner} onChange={(e) => set("owner", e.target.value)} data-testid="va-owner">
                <option value="">Pick owner…</option>
                {owners
                  .filter((o) => !a.Contractor || o.contractor === a.Contractor)
                  .map((o) => (
                    <option key={o.email} value={o.email}>
                      {o.name}
                    </option>
                  ))}
                {f.owner && !owners.some((o) => o.email === f.owner) && <option value={f.owner}>{f.owner}</option>}
              </select>
            </label>
          ) : (
            <ReadValue label="Owner">{f.owner || "—"}</ReadValue>
          )}
          {isAcc && !closed ? (
            <label>
              <span style={{ ...s.label, fontSize: 12 }}>Due date</span>
              <input type="date" style={s.input} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} data-testid="va-due" />
            </label>
          ) : (
            <ReadValue label="Due date">{shortDate(f.dueDate) || "—"}</ReadValue>
          )}
          {isAcc && !closed ? (
            <div>
              <span style={{ ...s.label, fontSize: 12 }}>Severity</span>
              <select style={{ ...s.select, width: "100%" }} value={f.severity} onChange={(e) => set("severity", e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          ) : (
            <ReadValue label="Severity">{f.severity}</ReadValue>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={{ ...s.label, fontSize: 12 }}>Priority</span>
          {isAcc && !closed ? <ContractorChips value={f.priority} onChange={(v) => set("priority", v)} options={priorities} allLabel={null} label="Priority" size="sm" testid="va-priority" /> : <b>{f.priority || "—"}</b>}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <span style={{ ...s.label, fontSize: 12 }}>Follow-up reading</span>
            {isAcc && !closed ? <ContractorChips value={f.followUpReading} onChange={(v) => set("followUpReading", v)} options={["Yes", "No"]} allLabel={null} label="Follow-up reading" size="sm" /> : <b>{f.followUpReading}</b>}
          </div>
          {f.followUpReading === "Yes" &&
            (isAcc && !closed ? (
              <label style={{ fontSize: 12, color: T.textSecondary }}>
                after (days)
                <input type="number" min="1" max="365" style={{ ...s.input, width: 100, display: "block" }} value={f.followUpDays} onChange={(e) => set("followUpDays", e.target.value)} />
              </label>
            ) : (
              <span style={{ fontSize: 13 }}>after {f.followUpDays} days</span>
            ))}
        </div>
        {isAcc && st !== "Draft" && !closed && f.dueDate !== (a["Due date"] || "") && <div style={{ fontSize: 12, color: T.warning, marginTop: 8 }}>Changing the due date needs a reason (box below).</div>}
      </FormSection>
      {(st === "Open" || st === "Waiting Stoppage") && (
        <FormSection icon="photo-check" title="Request closure" hint="evidence of the work, or a comment on what was done">
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ ...s.label, fontSize: 12 }}>Evidence link (photo / report)</span>
            <input style={s.input} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://drive.google.com/…" data-testid="va-evidence" />
          </label>
          <label>
            <span style={{ ...s.label, fontSize: 12 }}>What was done</span>
            <textarea style={{ ...s.input, minHeight: 56 }} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="va-comment" />
          </label>
        </FormSection>
      )}
      {(st === "Closure Requested" || st === "Closed") && (
        <FormSection icon="photo-check" title="Closure">
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            <ReadValue label="Evidence">
              {a["Closure evidence"] ? (
                <a href={a["Closure evidence"]} target="_blank" rel="noreferrer" style={{ color: T.accent }}>
                  open
                </a>
              ) : (
                "—"
              )}
            </ReadValue>
            <ReadValue label="Requested by">{a["Closure requested by"] || "—"}</ReadValue>
            {st === "Closed" && <ReadValue label="Closed by">{`${a["Closed by"]} · ${a["Closed at"] ? new Date(a["Closed at"]).toLocaleDateString("en-GB") : ""}`}</ReadValue>}
          </div>
          <div style={{ fontSize: 13, marginTop: 10, whiteSpace: "pre-wrap" }}>{a["Closure comment"]}</div>
        </FormSection>
      )}
      {!closed && (isAcc || contractorTurn) && (
        <FormSection icon="message" title={st === "Closure Requested" ? "ACC decision note" : "Reason / note"} hint={st === "Closure Requested" ? "needed to return" : st === "Draft" ? "needed to cancel" : "needed to move the due date"}>
          <textarea style={{ ...s.input, minHeight: 50 }} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="va-reason" />
        </FormSection>
      )}
      <FormSection icon="history" title="History">
        {hist === null ? (
          <span style={{ fontSize: 13, color: T.textSecondary }}>Loading…</span>
        ) : hist.length ? (
          hist.map((h, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: "3px 0" }}>
              <b>{h.action}</b>
              {h.details && <span style={{ color: T.textSecondary }}> — {h.details}</span>}
              <span style={{ color: T.textMuted }}>
                {" "}
                · {h.who} · {h.when ? new Date(h.when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}
              </span>
            </div>
          ))
        ) : (
          <span style={{ fontSize: 13, color: T.textSecondary }}>Created {a["Created at"] ? new Date(a["Created at"]).toLocaleDateString("en-GB") : ""} by {a["Created by"]}.</span>
        )}
      </FormSection>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13, whiteSpace: "pre-wrap" }} data-testid="va-error">
          {error}
        </div>
      )}
    </ModalShell>
  );
}

function AddActionModal({ webhookUrl, me, machines, openActions, onClose, onSaved, onOpenExisting }) {
  const { T, s } = useTheme();
  const [eqId, setEqId] = useState("");
  const [find, setFind] = useState("");
  const [severity, setSeverity] = useState("Caution");
  const [analysis, setAnalysis] = useState("");
  const [rec, setRec] = useState("");
  const [accRec, setAccRec] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useMemo(() => machines.filter((m) => !find || (m.id + " " + m.name).toLowerCase().includes(find.toLowerCase())).sort((a, b) => a.id.localeCompare(b.id)), [machines, find]);
  const existing = openActions.find((a) => a["Equipment ID"] === eqId);
  const save = async () => {
    setError("");
    if (!eqId) return setError("Pick the equipment.");
    setBusy(true);
    try {
      const r = await saveVibAction(webhookUrl, { equipmentId: eqId, severity, analysisRecommendation: analysis, contractorRecommendation: rec, accRecommendation: accRec });
      onSaved(r.actionId);
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };
  return (
    <ModalShell
      icon="plus"
      title="Add vibration action"
      subtitle="Starts as a Draft — ACC agrees the action, owner and due date to open it"
      onClose={onClose}
      width={720}
      testid="va-add-modal"
      footer={
        <>
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={s.btnPrimary} onClick={save} disabled={busy || !!existing} data-testid="va-add-save">
            {busy ? "Saving…" : "Create draft"}
          </button>
        </>
      }
    >
      <FormSection icon="engine" title="Machine">
        <input style={{ ...s.input, marginBottom: 6 }} placeholder="Find by ID or name" value={find} onChange={(e) => setFind(e.target.value)} />
        <select style={{ ...s.select, width: "100%" }} value={eqId} onChange={(e) => setEqId(e.target.value)} data-testid="va-add-eq">
          <option value="">Pick equipment…</option>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {m.name}
            </option>
          ))}
        </select>
        {existing && (
          <div style={{ marginTop: 10, fontSize: 13, color: T.warning }}>
            {eqId} already has an open action ({existing["Action ID"]}, {existing.Status}). One action per machine —{" "}
            <button type="button" onClick={() => onOpenExisting(existing["Action ID"])} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 13 }}>
              open it
            </button>
            .
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <span style={{ ...s.label, fontSize: 12 }}>Severity</span>
          <ContractorChips value={severity} onChange={setSeverity} options={["Caution", "Alert", "Danger"]} allLabel={null} label="Severity" size="sm" />
        </div>
      </FormSection>
      <FormSection icon="messages" title="What was found and what to do">
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ ...s.label, fontSize: 12 }}>Analysis / finding</span>
          <textarea style={{ ...s.input, minHeight: 56 }} value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ ...s.label, fontSize: 12 }}>Contractor recommended action</span>
          <textarea style={{ ...s.input, minHeight: 56 }} value={rec} onChange={(e) => setRec(e.target.value)} data-testid="va-add-rec" />
        </label>
        {me.acc && (
          <label style={{ display: "block" }}>
            <span style={{ ...s.label, fontSize: 12 }}>ACC recommended action</span>
            <textarea style={{ ...s.input, minHeight: 56 }} value={accRec} onChange={(e) => setAccRec(e.target.value)} />
          </label>
        )}
      </FormSection>
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13 }}>
          {error}
        </div>
      )}
    </ModalShell>
  );
}

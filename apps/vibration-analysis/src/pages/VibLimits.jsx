import { useMemo, useState } from "react";
import { saveVibLimits, setVibPointStatus } from "../api";
import { areaText, useAreaNames } from "../officialAreas";
import { useTheme } from "../ThemeContext";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import useIsMobile from "../hooks/useIsMobile";
import ContractorChips from "../components/ContractorChips";
import ModalShell, { FormSection, ReadValue } from "../components/ModalShell";
import Tile, { PageHeader, TabBar } from "../components/Tile";
import { PhoneSummary } from "../components/PhoneParts";
import { StatePill } from "../components/Level";
import { SCOPES } from "../vibModel";

// Limits & intervals (workflow "Equipment Limits"): what each machine's
// readings are judged against, how often it is measured and whether it is
// Active. Only the App Owner changes them, always with a reason; every change
// is kept (Change history). Readings already saved keep the limits they were
// judged with.

const FAMS = [
  ["RMS", "RMS velocity", "mm/s"],
  ["SPM", "SPM HDm", "dBsv"],
  ["Gs", "G's (PeakVue)", "g"],
];

export default function VibLimits({ webhookUrl, limits, reload, scopeEquipment, vibPoints = [], onPointStatus }) {
  const [chartsOpen, setChartsOpen] = useState(false);
  const { T, s } = useTheme();
  const isMobile = useIsMobile();
  const [contractor, setContractor] = useState("All");
  const [scope, setScope] = useState("All");
  const [only, setOnly] = useState("All");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("machines");
  const [editing, setEditing] = useState(null);
  const eqs = limits?.equipment || [];
  const vibLimits = limits?.vibLimits || {};
  const canEdit = !!limits?.canEdit;
  const pointCount = (id) => Object.keys(vibLimits).filter((v) => scopeEquipment?.[id]?.points.some((p) => p.vibId === v)).length;
  const isOwn = (e) => e.custom?.RMS || e.custom?.SPM || e.custom?.Gs;
  const base = eqs.filter((e) => (contractor === "All" || e.contractor === contractor) && (scope === "All" || e.scope === scope));
  const rows = base
    .filter(((match) => (e) => match(e.equipmentId, e.name))(idTextMatch(q, base.map((e) => e.equipmentId))))
    .filter((e) => (only === "All" ? true : only === "Own limits" ? isOwn(e) || pointCount(e.equipmentId) : only === "Inactive" ? e.status === "Inactive" : only === "Not every 30 days" ? e.interval !== limits?.defaultInterval : true));
  const contractors = [...new Set(eqs.map((e) => e.contractor))].filter(Boolean).sort((a, b) => (a === "RHI" ? -1 : b === "RHI" ? 1 : 0));

  const lim = (l, src) => (
    <span style={{ whiteSpace: "nowrap" }}>
      {l ? l.join(" / ") : <span style={{ color: T.textMuted }}>no limits</span>}
      {src && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: src === "Own" ? T.accent : T.textMuted }}>{src}</span>}
    </span>
  );

  return (
    <div style={{ padding: isMobile ? "14px 12px" : "20px 24px" }} data-testid="vib-limits">
      <PageHeader
        title="Limits & intervals"
        subtitle={limits ? `${base.length} machines · ${base.filter(isOwn).length} with own limits · ${Object.keys(vibLimits).length} VIB ID limits · ${base.filter((e) => e.status === "Inactive").length} inactive` : "Loading…"}
        right={
          <>
            <ContractorChips value={contractor} onChange={setContractor} options={contractors} testid="vlim-contractor" />
            {limits && !canEdit && <StatePill tone={T.textSecondary}>View only — the App Owner changes limits</StatePill>}
          </>
        }
      />
      {!limits && <div style={{ ...s.card, color: T.textSecondary }}>Loading limits…</div>}
      {limits && (
        <>
          {isMobile && (
            <PhoneSummary open={chartsOpen} onToggle={() => setChartsOpen((v) => !v)} testid="vlim-summary">
              <span><b style={{ fontSize: 16 }}>{base.filter(isOwn).length}</b> with own limits</span>
              <span style={{ color: T.textSecondary }}>{Object.keys(vibLimits).length} VIB ID limits</span>
            </PhoneSummary>
          )}
          {(!isMobile || chartsOpen) && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", marginBottom: 14 }}>
            <Tile icon="ti-adjustments" value={base.filter(isOwn).length} label="Machines with own limits" sub="others use the RMS / SPM Register" onClick={() => setOnly("Own limits")} />
            <Tile icon="ti-target" value={Object.keys(vibLimits).length} label="VIB ID limits" sub="override the machine's limits" />
            <Tile icon="ti-wave-square" value={base.filter((e) => e.gs).length} label="Machines with G's limits" sub="G's has no limits by default" />
            <Tile icon="ti-player-pause" value={base.filter((e) => e.status === "Inactive").length} label="Inactive machines" sub="left out of reports and routes" tone={base.some((e) => e.status === "Inactive") ? T.warning : undefined} onClick={() => setOnly("Inactive")} />
          </div>
          )}
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "machines", label: "Machines", count: base.length },
              { id: "points", label: "Measuring points", count: vibPoints.filter((p) => p.vibId && isOff(p)).length || undefined },
              ...(canEdit ? [{ id: "history", label: "Change history", count: (limits.history || []).length }] : []),
            ]}
          />
          {tab === "machines" && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <EquipmentSearch freeText options={base.map((e) => ({ code: e.equipmentId, description: e.name }))} value={q} onChange={setQ} placeholder="Equipment ID or name…" width={240} testid="vlim-find" />
                <select style={s.select} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
                  <option value="All">All scopes</option>
                  {SCOPES.map((sc) => (
                    <option key={sc}>{sc}</option>
                  ))}
                </select>
                <select style={s.select} value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Show">
                  {["All", "Own limits", "Not every 30 days", "Inactive"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSecondary }}>Caution / Alert / Danger from · RMS mm/s · SPM dBsv · G&apos;s g</span>
              </div>
              <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }}>
                <table data-phone-cards="" style={s.table} data-testid="vlim-table">
                  <thead>
                    <tr>
                      {["Equipment", "Name", "Scope", "RMS", "SPM", "G's", "VIB ID limits", "Interval", "Status", ""].map((h) => (
                        <th key={h} style={s.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.equipmentId} data-testid={`vlim-row-${e.equipmentId}`}>
                        <td style={{ ...s.td, fontWeight: 700 }}>{e.equipmentId}</td>
                        <td style={s.td}>{e.name}</td>
                        <td style={s.td}>
                          {e.contractor} · {e.scope || "—"}
                        </td>
                        <td style={s.td}>{lim(e.rms, e.custom?.RMS ? "Own" : "Register")}</td>
                        <td style={s.td}>{lim(e.spm, e.custom?.SPM ? "Own" : "Register")}</td>
                        <td style={s.td}>{lim(e.gs, e.gs ? "Own" : "")}</td>
                        <td style={s.td}>{pointCount(e.equipmentId) || "—"}</td>
                        <td style={s.td}>{e.interval} days</td>
                        <td style={s.td}>
                          <StatePill tone={e.status === "Inactive" ? T.warning : T.success}>{e.status}</StatePill>
                        </td>
                        <td style={s.td}>
                          <button type="button" style={{ ...s.btnGhost, padding: "4px 10px" }} onClick={() => setEditing(e)} data-testid={`vlim-edit-${e.equipmentId}`}>
                            {canEdit ? "Edit" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "points" && (
            <MeasuringPoints webhookUrl={webhookUrl} canEdit={canEdit} vibPoints={vibPoints} scopeEquipment={scopeEquipment} contractor={contractor} onPointStatus={onPointStatus} reload={reload} />
          )}
          {tab === "history" && (
            <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflowX: "auto" }} data-testid="vlim-history">
              <table data-phone-cards="" style={s.table}>
                <thead>
                  <tr>
                    {["When", "Equipment", "What", "Limits / setting", "Reason", "By", "Active"].map((h) => (
                      <th key={h} style={s.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(limits.history || [])
                    .slice()
                    .reverse()
                    .map((h) => (
                      <tr key={h["Change ID"]} style={{ opacity: h.Active === "Yes" ? 1 : 0.6 }}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{h["Changed at"] ? new Date(h["Changed at"]).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}</td>
                        <td style={s.td}>{h["Equipment ID"]}</td>
                        <td style={s.td}>{h["VIB ID"] ? `${h["VIB ID"]}${h.Family === "Point status" ? " · measuring" : ""}` : h.Family === "Settings" ? "Interval / status" : h.Family}</td>
                        <td style={s.td}>{h.Family === "Point status" ? (h["Equipment status"] === "Inactive" ? "Switched off" : "Switched on") : h.Family === "Settings" ? `${h["Interval days"]} days · ${h["Equipment status"]}` : h["Caution from"] !== "" ? `${h["Caution from"]} / ${h["Alert from"]} / ${h["Danger from"]} ${h.Unit}` : "back to default"}</td>
                        <td style={s.td}>{h.Reason}</td>
                        <td style={s.td}>{h["Changed by"]}</td>
                        <td style={s.td}>{h.Active === "Yes" ? "Current" : "Replaced"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editing && (
        <EditLimits
          webhookUrl={webhookUrl}
          e={editing}
          canEdit={canEdit}
          info={scopeEquipment?.[editing.equipmentId]}
          vibLimits={vibLimits}
          history={(limits.history || []).filter((h) => h["Equipment ID"] === editing.equipmentId)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function EditLimits({ webhookUrl, e, canEdit, info, vibLimits, history, onClose, onSaved }) {
  const { T, s } = useTheme();
  const init = (l) => (l ? l.map(String) : ["", "", ""]);
  const [fam, setFam] = useState({ RMS: { own: !!e.custom?.RMS, v: init(e.rms) }, SPM: { own: !!e.custom?.SPM, v: init(e.spm) }, Gs: { own: !!e.gs, v: init(e.gs) } });
  const points = info?.points || [];
  const [pts, setPts] = useState(() => Object.fromEntries(points.map((p) => [p.vibId, { own: !!vibLimits[p.vibId], v: init(vibLimits[p.vibId]) }])));
  const [interval, setInterval] = useState(String(e.interval || ""));
  const [status, setStatus] = useState(e.status || "Active");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = () => {
    const c = { equipmentId: e.equipmentId, reason, families: {}, points: {} };
    FAMS.forEach(([f]) => {
      const was = f === "Gs" ? !!e.gs : !!e.custom?.[f];
      const wasV = init(f === "RMS" ? e.rms : f === "SPM" ? e.spm : e.gs).join("/");
      if (fam[f].own) {
        if (!was || fam[f].v.join("/") !== wasV) c.families[f] = fam[f].v;
      } else if (was) c.families[f] = null;
    });
    points.forEach((p) => {
      const was = !!vibLimits[p.vibId];
      const x = pts[p.vibId];
      if (x.own) {
        if (!was || x.v.join("/") !== init(vibLimits[p.vibId]).join("/")) c.points[p.vibId] = x.v;
      } else if (was) c.points[p.vibId] = null;
    });
    if (String(e.interval) !== interval) c.intervalDays = interval;
    if (e.status !== status) c.equipmentStatus = status;
    return c;
  };
  const save = async () => {
    setError("");
    const c = change();
    if (!Object.keys(c.families).length && !Object.keys(c.points).length && c.intervalDays === undefined && c.equipmentStatus === undefined) return setError("Nothing changed.");
    if (!reason.trim()) return setError("Give the reason for the change.");
    setBusy(true);
    try {
      await saveVibLimits(webhookUrl, c);
      onSaved();
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  };
  const three = (vals, onChange, unit, testid) => (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      {["Caution from", "Alert from", "Danger from"].map((lab, i) => (
        <label key={lab} style={{ display: "flex", flexDirection: "column", fontSize: 12, color: T.textSecondary }}>
          {lab}
          <input type="number" step="0.01" disabled={!canEdit} style={{ ...s.input, width: 96 }} value={vals[i]} onChange={(ev) => onChange(vals.map((x, j) => (j === i ? ev.target.value : x)))} data-testid={testid ? `${testid}-${i}` : undefined} />
        </label>
      ))}
      <span style={{ fontSize: 12, color: T.textSecondary, paddingBottom: 8 }}>{unit}</span>
    </span>
  );
  return (
    <ModalShell
      icon="adjustments"
      title={`${canEdit ? "Edit" : "View"} limits — ${e.equipmentId}`}
      subtitle={`${e.name} · ${e.contractor} ${e.scope}`}
      onClose={onClose}
      width={820}
      testid="vlim-modal"
      footer={
        canEdit ? (
          <>
            <button type="button" style={s.btnGhost} onClick={onClose}>
              Cancel
            </button>
            <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vlim-save">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <button type="button" style={s.btnGhost} onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <FormSection icon="adjustments" title="Machine limits" hint="Caution < Alert < Danger. Without own limits the RMS / SPM Register applies.">
        {FAMS.map(([f, label, unit]) => (
          <div key={f} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "10px 0", borderTop: f === "RMS" ? "none" : `1px solid ${T.border2}`, flexWrap: "wrap" }}>
            <div style={{ width: 170 }}>
              <b style={{ color: T.textPrimary }}>{label}</b>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: T.textSecondary, marginTop: 4 }}>
                <input type="checkbox" disabled={!canEdit} checked={fam[f].own} onChange={(ev) => setFam({ ...fam, [f]: { ...fam[f], own: ev.target.checked } })} data-testid={`vlim-own-${f}`} />
                Own limits
              </label>
            </div>
            {fam[f].own ? (
              three(fam[f].v, (v) => setFam({ ...fam, [f]: { ...fam[f], v } }), unit, `vlim-${f}`)
            ) : (
              <ReadValue label={f === "Gs" ? "No limits" : "From the Register"}>{f === "RMS" ? (e.registerRms || [2.8, 7.1, 18]).join(" / ") + " mm/s" : f === "SPM" ? (e.registerSpm || [20, 35, 50]).join(" / ") + " dBsv" : "G's readings get no system status"}</ReadValue>
            )}
          </div>
        ))}
      </FormSection>
      <FormSection icon="target" title="VIB ID limits" hint="only where one point needs its own limits">
        {points.map((p) => (
          <div key={p.vibId} style={{ display: "flex", gap: 14, alignItems: "center", padding: "6px 0", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", width: 260, fontSize: 12.5 }}>
              <input type="checkbox" disabled={!canEdit} checked={pts[p.vibId].own} onChange={(ev) => setPts({ ...pts, [p.vibId]: { ...pts[p.vibId], own: ev.target.checked } })} />
              <span>
                {p.vibId}
                <span style={{ display: "block", color: T.textMuted, fontSize: 12 }}>{String(p.description).split(";")[0]}</span>
              </span>
            </label>
            {pts[p.vibId].own && three(pts[p.vibId].v, (v) => setPts({ ...pts, [p.vibId]: { ...pts[p.vibId], v } }), { RMS: "mm/s", SPM: "dBsv", Gs: "g" }[p.family])}
          </div>
        ))}
      </FormSection>
      <FormSection icon="calendar-repeat" title="Measurement">
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: T.textSecondary }}>
            Interval (days between measurements)
            <input type="number" min="1" max="366" disabled={!canEdit} style={{ ...s.input, width: 120 }} value={interval} onChange={(ev) => setInterval(ev.target.value)} data-testid="vlim-interval" />
          </label>
          <div>
            <span style={{ fontSize: 12, color: T.textSecondary, display: "block", marginBottom: 4 }}>Status</span>
            {canEdit ? <ContractorChips value={status} onChange={setStatus} options={["Active", "Inactive"]} allLabel={null} label="Status" testid="vlim-status" /> : <b>{status}</b>}
          </div>
        </div>
        {status === "Inactive" && <div style={{ fontSize: 12, color: T.warning, marginTop: 8 }}>An inactive machine is left out of reports, coverage and routes, and takes no new readings.</div>}
      </FormSection>
      {canEdit && (
        <FormSection icon="message" title="Reason for the change" hint="required — kept in the history">
          <textarea style={{ ...s.input, minHeight: 60 }} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. OEM manual, new bearing type, ISO 10816 class change" data-testid="vlim-reason" />
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 6 }}>Readings already saved keep the limits they were judged with.</div>
        </FormSection>
      )}
      {history.length > 0 && (
        <FormSection icon="history" title="History of this machine">
          {history
            .slice()
            .reverse()
            .map((h) => (
              <div key={h["Change ID"]} style={{ fontSize: 12.5, padding: "4px 0", color: h.Active === "Yes" ? T.textPrimary : T.textMuted }}>
                {h["Changed at"] ? new Date(h["Changed at"]).toLocaleDateString("en-GB") : ""} · {h["VIB ID"] || (h.Family === "Settings" ? "Interval / status" : h.Family)} ·{" "}
                {h.Family === "Settings" ? `${h["Interval days"]} days, ${h["Equipment status"]}` : h["Caution from"] !== "" ? `${h["Caution from"]}/${h["Alert from"]}/${h["Danger from"]}` : "default"} — {h.Reason} ({h["Changed by"]})
              </div>
            ))}
        </FormSection>
      )}
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13, whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
    </ModalShell>
  );
}

const isOff = (p) => String(p.status).toLowerCase() === "inactive";
const FAM_LABEL = { RMS: "RMS", SPM: "SPM", Gs: "G's" };

// Measuring points: switch VIB IDs on or off, e.g. SPM in the cement mills
// where only G's is measured now. An off point leaves the machine page, the
// charts, routes and coverage; its readings stay in the log. Pick by area and
// type (RMS / SPM / G's), tick the VIB IDs, then switch off / on with a reason.
function MeasuringPoints({ webhookUrl, canEdit, vibPoints, scopeEquipment, contractor, onPointStatus, reload }) {
  const { T, s } = useTheme();
  const resolveArea = useAreaNames();
  const [area, setArea] = useState("All");
  const [fam, setFam] = useState("All");
  const [state, setState] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // "Inactive" | "Active"
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const all = useMemo(
    () =>
      vibPoints
        .filter((p) => p.vibId && (contractor === "All" || p.contractor === contractor))
        .map((p) => {
          const m = scopeEquipment?.[p.equipmentId];
          const r = resolveArea(p.area || m?.line || "", p.equipmentId, m?.line);
          return { ...p, name: m?.name || "", place: areaText(r) || p.area || m?.line || "—", line: r.line || "" };
        })
        .sort((a, b) => a.equipmentId.localeCompare(b.equipmentId) || a.positionCode.localeCompare(b.positionCode) || a.family.localeCompare(b.family)),
    [vibPoints, scopeEquipment, contractor, resolveArea]
  );
  // areas grouped by line for the picker
  const groups = useMemo(() => {
    const g = {};
    all.forEach((p) => {
      const ln = p.line || "Other";
      (g[ln] ||= new Set()).add(p.place);
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [all]);
  const match = idTextMatch(q, all.map((p) => p.equipmentId));
  const rows = all.filter(
    (p) =>
      (area === "All" || (area.startsWith("line:") ? p.line === area.slice(5) : p.place === area)) &&
      (fam === "All" || FAM_LABEL[p.family] === fam) &&
      (state === "All" || (state === "Off" ? isOff(p) : !isOff(p))) &&
      match(p.equipmentId, `${p.name} ${p.vibId} ${p.description}`)
  );
  const picked = rows.filter((p) => sel.has(p.vibId));
  const pickedOn = picked.filter((p) => !isOff(p));
  const pickedOff = picked.filter(isOff);
  const allPicked = rows.length > 0 && picked.length === rows.length;
  const toggle = (id) => setSel((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const byFam = (list) => Object.entries(list.reduce((o, p) => ({ ...o, [FAM_LABEL[p.family] || p.family]: (o[FAM_LABEL[p.family] || p.family] || 0) + 1 }), {})).map(([f, n]) => `${n} ${f}`).join(" · ");

  const save = async () => {
    const list = confirm === "Inactive" ? pickedOn : pickedOff;
    if (!reason.trim()) return setError("Give the reason for the change.");
    setBusy(true);
    setError("");
    try {
      const ids = list.map((p) => p.vibId);
      await setVibPointStatus(webhookUrl, ids, confirm, reason.trim());
      onPointStatus?.(ids, confirm);
      setDone(`${ids.length} VIB ID${ids.length > 1 ? "s" : ""} switched ${confirm === "Inactive" ? "off" : "on"}.`);
      setSel(new Set());
      setConfirm(null);
      setReason("");
      reload?.();
    } catch (err) {
      setError(String(err.message || err));
    }
    setBusy(false);
  };

  const pill = (active, label, onClick, testid) => (
    <button type="button" aria-pressed={active} onClick={onClick} style={{ ...s.btn, padding: "4px 12px", fontSize: 12.5, borderRadius: 999, background: active ? T.accent : T.cardBg, color: active ? "#fff" : T.textPrimary, borderColor: active ? T.accent : T.border }} data-testid={testid}>
      {label}
    </button>
  );

  return (
    <div data-testid="vlim-points">
      <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 10, maxWidth: 820 }}>
        A VIB ID switched off is no longer measured: it leaves the machine page, the charts, routes and coverage. Its readings stay in the log. {canEdit ? "Pick an area and a type, tick the VIB IDs, then switch them off or on." : "Only the App Owner switches points on or off."}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <EquipmentSearch freeText options={[...new Map(all.map((p) => [p.equipmentId, { code: p.equipmentId, description: p.name }])).values()]} value={q} onChange={setQ} placeholder="Equipment, VIB ID or point…" width={240} testid="vpts-find" />
        <select style={s.select} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area" data-testid="vpts-area">
          <option value="All">All areas</option>
          {groups.map(([ln, set]) => (
            <optgroup key={ln} label={ln}>
              {ln !== "Other" && <option value={`line:${ln}`}>All of {ln}</option>}
              {[...set].sort().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div role="group" aria-label="Type" style={{ display: "flex", gap: 6 }}>
          {["All", "RMS", "SPM", "G's"].map((f) => pill(fam === f, f === "All" ? "All types" : f, () => setFam(f), `vpts-fam-${f === "G's" ? "Gs" : f}`))}
        </div>
        <div role="group" aria-label="Measuring" style={{ display: "flex", gap: 6 }}>
          {[["All", "On and off"], ["On", "Measured"], ["Off", "Switched off"]].map(([k, l]) => pill(state === k, l, () => setState(k), `vpts-state-${k}`))}
        </div>
      </div>
      {done && (
        <div role="status" style={{ ...s.card, padding: "10px 14px", color: T.success, marginBottom: 10 }} data-testid="vpts-done">
          {done}
        </div>
      )}
      {canEdit && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: T.textSecondary }}>
            {rows.length} VIB IDs shown{picked.length ? ` · ${picked.length} ticked` : ""}
          </span>
          <button type="button" style={{ ...s.btnGhost, padding: "4px 12px" }} onClick={() => setSel(allPicked ? new Set() : new Set(rows.map((p) => p.vibId)))} data-testid="vpts-all">
            {allPicked ? "Untick all" : `Tick all ${rows.length}`}
          </button>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" style={{ ...s.btnGhost, padding: "6px 14px" }} disabled={!pickedOff.length} onClick={() => { setError(""); setConfirm("Active"); }} data-testid="vpts-on">
              Switch on ({pickedOff.length})
            </button>
            <button type="button" style={{ ...s.btnPrimary, padding: "6px 14px", opacity: pickedOn.length ? 1 : 0.5 }} disabled={!pickedOn.length} onClick={() => { setError(""); setConfirm("Inactive"); }} data-testid="vpts-off">
              Switch off ({pickedOn.length})
            </button>
          </span>
        </div>
      )}
      <div className="phone-cards-box" style={{ ...s.card, padding: 0, overflow: "auto", maxHeight: 560 }}>
        <table data-phone-cards="" style={s.table} data-testid="vpts-table">
          <thead>
            <tr>
              {[canEdit ? "" : null, "VIB ID", "Equipment", "Point", "Type", "Area", "Measuring"].filter((h) => h !== null).map((h, i) => (
                <th key={i} style={{ ...s.th, position: "sticky", top: 0, zIndex: 1 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 600).map((p) => (
              <tr key={p.vibId} style={{ opacity: isOff(p) ? 0.65 : 1 }} data-testid={`vpts-row-${p.vibId}`}>
                {canEdit && (
                  <td style={s.td}>
                    <input type="checkbox" checked={sel.has(p.vibId)} onChange={() => toggle(p.vibId)} aria-label={`Tick ${p.vibId}`} />
                  </td>
                )}
                <td style={{ ...s.td, fontWeight: 700, whiteSpace: "nowrap" }}>{p.vibId}</td>
                <td style={s.td}>
                  {p.equipmentId} <span style={{ color: T.textSecondary }}>{p.name}</span>
                </td>
                <td style={s.td}>{String(p.description).split(";")[0]}</td>
                <td style={s.td}>{FAM_LABEL[p.family] || p.family}</td>
                <td style={s.td}>{p.place}</td>
                <td style={s.td}>
                  <StatePill tone={isOff(p) ? T.textMuted : T.success}>{isOff(p) ? "Switched off" : "Measured"}</StatePill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 600 && <div style={{ padding: 10, fontSize: 12.5, color: T.textSecondary }}>First 600 of {rows.length} — narrow the area or type to see the rest. Tick all still takes all {rows.length}.</div>}
        {!rows.length && <div style={{ padding: 16, color: T.textSecondary }}>No VIB IDs match.</div>}
      </div>
      {confirm && (
        <ModalShell
          icon={confirm === "Inactive" ? "player-pause" : "player-play"}
          title={confirm === "Inactive" ? "Switch off measuring points" : "Switch measuring points back on"}
          subtitle={`${(confirm === "Inactive" ? pickedOn : pickedOff).length} VIB IDs · ${byFam(confirm === "Inactive" ? pickedOn : pickedOff)}`}
          onClose={() => !busy && setConfirm(null)}
          width={560}
          testid="vpts-modal"
          footer={
            <>
              <button type="button" style={s.btnGhost} onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" style={s.btnPrimary} onClick={save} disabled={busy} data-testid="vpts-save">
                {busy ? "Saving…" : confirm === "Inactive" ? "Switch off" : "Switch on"}
              </button>
            </>
          }
        >
          <FormSection icon="list" title="What changes">
            <div style={{ fontSize: 13, color: T.textPrimary }}>
              {confirm === "Inactive"
                ? "These points are no longer expected: they leave the machine pages, charts, routes and coverage. Readings already saved stay in the log."
                : "These points are measured again: they come back on the machine pages, charts, routes and coverage."}
            </div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 6 }}>
              {[...new Set((confirm === "Inactive" ? pickedOn : pickedOff).map((p) => p.place))].join(" · ")}
            </div>
          </FormSection>
          <FormSection icon="message" title="Reason" hint="required — kept in the Change history">
            <textarea style={{ ...s.input, minHeight: 60 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. SPM no longer measured in the cement mills — G's only" data-testid="vpts-reason" />
          </FormSection>
          {error && (
            <div role="alert" style={{ color: T.danger, fontSize: 13 }}>
              {error}
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}

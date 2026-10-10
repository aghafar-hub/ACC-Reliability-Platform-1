import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { saveEquipmentRegistry } from "../equipmentRegistry";
import EquipmentSearch, { idTextMatch } from "../components/EquipmentSearch";
import { saveActionRegistry } from "../actionRegistry";
import { useSession } from "../SessionContext";
import { offlineQueueCount } from "../offlineQueue";

// Settings → Oil Lubrication (redesigned, step 3): five cards that each save
// on their own — Status, Intervals, Lists, Targets, Notifications — and a
// "This device" row. Who may open it and who may change it is set in
// Settings → Settings access (backend ModuleSettings.js checks it again);
// everyone else sees the same page read-only. Every change goes to the
// Audit Log (→ Activity) and shows "Last changed by" on its card.

const SHOWN = 60;

function fmtWhen(iso, withTime) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "";
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (same) return withTime ? `Today ${time}` : "Today";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + (withTime ? ` ${time}` : "");
}

function Card({ T, icon, title, hint, right, children, testid, badge }) {
  return (
    <section data-testid={testid} style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: T.accent + "1A", color: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
        </span>
        <b style={{ fontSize: 15, color: T.textPrimary }}>{title}</b>
        {hint && <span style={{ fontSize: 13, color: T.textSecondary }}>{hint}</span>}
        {badge}
        {right && <span style={{ marginInlineStart: "auto", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

function CardFoot({ T, s, changed, msg, onSave, canSave, busy, testid, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border2 || T.border}` }}>
      <span style={{ fontSize: 12.5, color: T.textMuted }}>
        {changed && changed.by ? `Last changed by ${changed.by} · ${fmtWhen(changed.at)}` : "Not changed yet"}
      </span>
      {children}
      <span style={{ marginInlineStart: "auto", display: "inline-flex", gap: 10, alignItems: "center" }}>
        {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.ok ? T.success : T.danger }}>{msg.text}</span>}
        {onSave && (
          <button type="button" style={{ ...s.btnPrimary, opacity: canSave && !busy ? 1 : 0.5 }} disabled={!canSave || busy} onClick={onSave} data-testid={testid}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </span>
    </div>
  );
}

function Tile({ T, label, value, tone, sub }) {
  const color = tone === "good" ? T.success : tone === "bad" ? T.danger : tone === "warn" ? T.warning : T.textPrimary;
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: T.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 3, lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Action phrases as chips: × removes, "+ Add phrase" adds (Edit only).
function PhraseChips({ T, s, list, onChange, canEdit, testid }) {
  const [adding, setAdding] = useState(null);
  const add = () => {
    const v = String(adding || "").trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...list, v]);
    setAdding(null);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid={testid}>
      {list.length === 0 && <span style={{ fontSize: 13, color: T.textMuted }}>No phrases yet.</span>}
      {list.map((p) => (
        <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${T.border}`, borderRadius: 999, padding: "5px 12px", fontSize: 13.5, color: T.textPrimary }}>
          {p}
          {canEdit && (
            <button type="button" aria-label={`Remove ${p}`} onClick={() => onChange(list.filter((x) => x !== p))} style={{ border: 0, background: "none", color: T.textMuted, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          )}
        </span>
      ))}
      {canEdit &&
        (adding === null ? (
          <button type="button" onClick={() => setAdding("")} style={{ border: `1px dashed ${T.accent}`, borderRadius: 999, padding: "5px 12px", fontSize: 13.5, color: T.accent, background: "none", cursor: "pointer", fontFamily: "inherit" }} data-testid={`${testid}-add`}>
            + Add phrase
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 6 }}>
            <input autoFocus value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(null); }} placeholder="New phrase" style={{ ...s.input, width: 180, padding: "5px 10px", fontSize: 13.5 }} data-testid={`${testid}-input`} />
            <button type="button" style={{ ...s.btn, padding: "5px 10px" }} onClick={add} data-testid={`${testid}-ok`}>Add</button>
          </span>
        ))}
    </div>
  );
}

function TargetInputs({ T, s, items, values, onChange, canEdit }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {items.map((it) => (
        <label key={it.key} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: T.textSecondary }}>
          {it.label}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.textPrimary, fontWeight: 700 }}>
            <input type="number" min="50" max="100" value={values[it.key] ?? ""} disabled={!canEdit} onChange={(e) => onChange({ ...values, [it.key]: e.target.value })} style={{ ...s.input, width: 76, fontSize: 14, fontWeight: 600 }} data-testid={`target-${it.key}`} />%
          </span>
        </label>
      ))}
    </div>
  );
}

// Which Oil events send an email is set once for every module on the platform page.
function NotificationsCard({ T, s, email, moduleName, isOwner }) {
  const e = email || {};
  const text = !e.connected ? "Platform not connected" : !e.sender ? "All off · no platform sender yet" : !e.enabled ? `Off · ${e.on} event${e.on === 1 ? "" : "s"} chosen` : `On · ${e.on} event${e.on === 1 ? "" : "s"}`;
  const on = e.enabled && e.sender;
  return (
    <Card T={T} icon="ti-mail" title="Notifications" hint={`Which ${moduleName} events send an email — set in one place for all modules`} testid="ms-notifications"
      right={
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 700, background: (on ? T.success : T.accent) + "14", color: on ? T.success : T.accent }} data-testid="ms-email-status">
            <i className={`ti ${on ? "ti-mail-check" : "ti-mail-off"}`} aria-hidden="true" /> {text}
          </span>
          {isOwner ? (
            <button type="button" style={s.btn} onClick={() => window.dispatchEvent(new CustomEvent("acc-shell-navigate", { detail: { path: "/settings?tab=email" } }))} data-testid="ms-open-email">
              Open Email & notifications →
            </button>
          ) : (
            <span style={{ fontSize: 12.5, color: T.textMuted }}>Set by the App Owner</span>
          )}
        </>
      }
    />
  );
}

function ThisDevice({ T, s, children, onClear, testid }) {
  const [cleared, setCleared] = useState("");
  return (
    <section data-testid={testid} style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <i className="ti ti-device-desktop" style={{ fontSize: 18, color: T.textSecondary }} aria-hidden="true" />
      <b style={{ fontSize: 14.5, color: T.textPrimary }}>This device</b>
      {children}
      <button type="button" style={s.btn} onClick={() => setCleared(onClear())} data-testid="ms-clear">
        Clear saved data
      </button>
      {cleared && <span style={{ fontSize: 12.5, color: T.success, fontWeight: 600 }}>{cleared}</span>}
      <span style={{ marginInlineStart: "auto", fontSize: 12.5, color: T.textMuted }}>Only affects this phone / PC</span>
    </section>
  );
}

function StatusTiles({ T, settings, version }) {
  const m = settings?.module || {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
      <Tile T={T} label="Backend" value={settings ? "✓ Connected" : "…"} tone={settings ? "good" : undefined} />
      <Tile T={T} label="Platform equipment list" value={m.connected ? `✓ ${Number(m.platformCount || 0).toLocaleString()} machines` : "Not connected"} tone={m.connected ? "good" : "warn"} sub={m.connected ? "" : "PLATFORM_CORE_SPREADSHEET_ID not set"} />
      <Tile T={T} label="Last ID check" value={m.checkedAt ? <>{fmtWhen(m.checkedAt, true)} · <span style={{ color: m.open ? T.danger : T.success }}>{m.open ? `${m.open} not matching` : "all match"}</span></> : "Not run yet"} />
      <Tile T={T} label="Version" value={version} />
    </div>
  );
}

function buildVersion() {
  const v = typeof window !== "undefined" && window.__accBuildId ? String(window.__accBuildId) : "dev";
  return v.replace(/^test-/, "test ").slice(0, 24);
}

export default function Settings({ config, onSave, onSync, syncState, equipmentRegistry, onRegistryChange, onActionRegistryChange }) {
  const { T, s } = useTheme();
  const session = useSession();
  const isOwner = (session?.claims?.roles || []).includes("ROLE-ADMIN");
  const url = config.webhookUrl;
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [msgs, setMsgs] = useState({});
  const [details, setDetails] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [sheetUrl, setSheetUrl] = useState(config.sheetUrl || "");
  // card drafts
  const [query, setQuery] = useState("");
  const [edits, setEdits] = useState({}); // lpId → { interval?, oilChangeInterval? }
  const [bulk, setBulk] = useState(null);
  const [phrases, setPhrases] = useState([]);
  const [targets, setTargets] = useState({});

  const take = (st) => {
    setSettings(st);
    setPhrases(st.phrases || []);
    setTargets({ ...(st.targets || {}) });
  };
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    api.getModuleSettings(url).then((st) => !cancelled && take(st), (e) => !cancelled && setLoadError(e.message));
    return () => { cancelled = true; };
  }, [url]);

  const canEdit = !!settings?.canEdit;
  const note = (card, ok, text) => {
    setMsgs((m) => ({ ...m, [card]: { ok, text } }));
    if (ok) setTimeout(() => setMsgs((m) => (m[card]?.text === text ? { ...m, [card]: null } : m)), 5000);
  };

  async function save(card, body, after) {
    setBusy(card);
    setMsgs((m) => ({ ...m, [card]: null }));
    try {
      const r = await api.saveModuleSettings(url, { card, ...body });
      if (r.settings) take(r.settings);
      after?.(r);
      note(card, true, "Saved");
    } catch (e) {
      note(card, false, e.message);
    } finally {
      setBusy("");
    }
  }

  // ── Intervals ──
  const registry = useMemo(() => equipmentRegistry || [], [equipmentRegistry]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry;
    const match = idTextMatch(q, registry.map((r) => r.code));
    return registry.filter((r) => match(r.code, r.description));
  }, [registry, query]);
  const shown = filtered.slice(0, SHOWN);
  const val = (eq, k) => (edits[eq.code] && k in edits[eq.code] ? edits[eq.code][k] : eq[k] || "");
  const setVal = (eq, k, v) => setEdits((all) => ({ ...all, [eq.code]: { ...(all[eq.code] || {}), [k]: v } }));
  const changes = Object.entries(edits)
    .map(([lpId, c]) => {
      const eq = registry.find((r) => r.code === lpId) || {};
      const x = { lpId };
      if ("interval" in c && c.interval.trim() !== (eq.interval || "")) x.interval = c.interval.trim();
      if ("oilChangeInterval" in c && c.oilChangeInterval.trim() !== (eq.oilChangeInterval || "")) x.oilChangeInterval = c.oilChangeInterval.trim();
      return x;
    })
    .filter((x) => Object.keys(x).length > 1);
  function applyBulk() {
    if (!bulk) return;
    setEdits((all) => {
      const out = { ...all };
      filtered.forEach((eq) => {
        const next = { ...(out[eq.code] || {}) };
        if (bulk.interval.trim()) next.interval = bulk.interval.trim();
        if (bulk.oilChangeInterval.trim()) next.oilChangeInterval = bulk.oilChangeInterval.trim();
        out[eq.code] = next;
      });
      return out;
    });
    setBulk(null);
  }
  const saveIntervals = () =>
    save("intervals", { changes }, () => {
      const next = registry.map((r) => {
        const c = changes.find((x) => x.lpId === r.code);
        return c ? { ...r, ...("interval" in c ? { interval: c.interval } : {}), ...("oilChangeInterval" in c ? { oilChangeInterval: c.oilChangeInterval } : {}), modifiedDate: new Date().toISOString() } : r;
      });
      saveEquipmentRegistry(next);
      onRegistryChange?.(next);
      setEdits({});
    });

  const phrasesDirty = JSON.stringify(phrases) !== JSON.stringify(settings?.phrases || []);
  const targetsDirty = settings && ["routes", "samples", "actions"].some((k) => Number(targets[k]) !== settings.targets[k]);

  async function testConnection() {
    setTestMsg("Testing…");
    try {
      const t0 = Date.now();
      await api.getModuleSettings(url).then(take);
      setTestMsg(`✓ Answers in ${Date.now() - t0} ms`);
    } catch (e) {
      setTestMsg(`✕ ${e.message}`);
    }
    setTimeout(() => setTestMsg(""), 8000);
  }

  function clearSaved() {
    const pending = offlineQueueCount();
    const keep = new Set(["acc_oilapp_config", "acc_oilapp_offline_queue"]);
    let n = 0;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("acc_oilapp_") || k.startsWith("oilapp_")) && !keep.has(k)) {
          localStorage.removeItem(k);
          n++;
        }
      }
    } catch {
      return "This browser blocks saved data";
    }
    return `Cleared ${n} saved item${n === 1 ? "" : "s"}${pending ? ` — ${pending} unsent change${pending === 1 ? "" : "s"} kept` : ""}. Reload to read everything fresh.`;
  }

  if (!url) return <div style={{ ...s.card }}>The backend address is missing from this build.</div>;
  if (loadError)
    return (
      <div style={{ ...s.card, color: T.danger }} data-testid="oil-settings">
        {/accessDenied|permission/i.test(loadError) ? "You don't have access to Oil Lubrication's settings." : `Couldn't load the settings: ${loadError}`}
      </div>
    );

  const th = { textAlign: "start", fontSize: 11.5, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.3, padding: "8px 10px", whiteSpace: "nowrap", position: "sticky", top: 0, background: T.cardBg, zIndex: 1 };
  const td = { padding: "7px 10px", borderTop: `1px solid ${T.border2 || T.border}`, fontSize: 13.5, color: T.textPrimary, verticalAlign: "middle" };
  const cell = { ...s.input, width: 110, padding: "6px 9px", fontSize: 13.5 };

  return (
    <div data-testid="oil-settings" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {settings && !canEdit && (
        <div data-testid="ms-readonly" style={{ border: `1px solid ${T.warning}55`, background: T.warning + "12", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: T.textPrimary }}>
          <i className="ti ti-eye" aria-hidden="true" /> View only — your Settings access lets you see these settings but not change them.
        </div>
      )}

      <Card T={T} icon="ti-plug" title="Status" testid="ms-status"
        right={
          <>
            {testMsg && <span style={{ fontSize: 12.5, fontWeight: 600, color: testMsg.startsWith("✓") ? T.success : testMsg.startsWith("✕") ? T.danger : T.textMuted }}>{testMsg}</span>}
            <button type="button" style={s.btn} onClick={testConnection} data-testid="ms-test"><i className="ti ti-plug" aria-hidden="true" /> Test connection</button>
            <button type="button" style={s.btn} onClick={() => setDetails((d) => !d)} aria-expanded={details} data-testid="ms-details">Details {details ? "▴" : "▾"}</button>
          </>
        }
      >
        <StatusTiles T={T} settings={settings} version={buildVersion()} />
        {details && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>Apps Script address (built in)</div>
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, wordBreak: "break-all", color: T.textSecondary, background: T.cardSubBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", marginTop: 4 }}>{url}</div>
            </div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: "grid", gap: 4 }}>
              Google Sheet (for the Open sheet button — this device)
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...s.input, flex: "1 1 260px" }} value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} onBlur={() => sheetUrl !== (config.sheetUrl || "") && onSave({ ...config, sheetUrl })} placeholder="https://docs.google.com/spreadsheets/d/…" />
                {sheetUrl && <a href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: "none" }}><i className="ti ti-external-link" aria-hidden="true" /> Open sheet</a>}
                <button type="button" style={s.btn} onClick={onSync} disabled={syncState === "loading"}><i className="ti ti-refresh" aria-hidden="true" /> {syncState === "loading" ? "Syncing…" : "Sync now"}</button>
              </span>
            </label>
          </div>
        )}
      </Card>

      <Card T={T} icon="ti-calendar-repeat" title="Intervals" hint="Sampling and oil change interval for each Lub ID" testid="ms-intervals"
        right={
          <>
            <EquipmentSearch freeText options={registry} value={query} onChange={setQuery} placeholder="Lub ID or description…" width={260} testid="ms-int-find" />
            {canEdit && <button type="button" style={s.btn} onClick={() => setBulk(bulk ? null : { interval: "", oilChangeInterval: "" })} data-testid="ms-bulk">Set for all shown…</button>}
          </>
        }
      >
        {bulk && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, padding: "8px 10px", background: T.cardSubBg, borderRadius: 8, fontSize: 13 }}>
            For the {filtered.length} Lub ID{filtered.length === 1 ? "" : "s"} shown: sampling every
            <input style={cell} value={bulk.interval} onChange={(e) => setBulk({ ...bulk, interval: e.target.value })} placeholder="e.g. 6" data-testid="ms-bulk-int" />
            oil change every
            <input style={cell} value={bulk.oilChangeInterval} onChange={(e) => setBulk({ ...bulk, oilChangeInterval: e.target.value })} placeholder="e.g. 2 Y" />
            <button type="button" style={s.btnPrimary} onClick={applyBulk} data-testid="ms-bulk-ok">Apply</button>
            <span style={{ color: T.textMuted }}>then Save changes</span>
          </div>
        )}
        <div style={{ maxHeight: 380, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Lub ID</th>
                <th style={th}>Equipment</th>
                <th style={th}>Sampling every</th>
                <th style={th}>Oil change every</th>
                <th style={th}>Changed</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: T.textMuted }}>No Lub ID matches.</td></tr>
              )}
              {shown.map((eq) => {
                const dirty = changes.some((c) => c.lpId === eq.code);
                return (
                  <tr key={eq.code} data-testid={`ms-int-${eq.code}`} style={{ background: dirty ? T.accent + "0D" : undefined }}>
                    <td style={{ ...td, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, whiteSpace: "nowrap" }}>{eq.code}</td>
                    <td style={{ ...td, color: T.textSecondary, minWidth: 160 }}>{[eq.equipmentName || eq.description, eq.area].filter(Boolean).join(" · ")}</td>
                    <td style={td}>{canEdit ? <input style={cell} value={val(eq, "interval")} onChange={(e) => setVal(eq, "interval", e.target.value)} aria-label={`${eq.code} sampling interval`} /> : val(eq, "interval") || "—"}</td>
                    <td style={td}>{canEdit ? <input style={cell} value={val(eq, "oilChangeInterval")} onChange={(e) => setVal(eq, "oilChangeInterval", e.target.value)} aria-label={`${eq.code} oil change interval`} /> : val(eq, "oilChangeInterval") || "—"}</td>
                    <td style={{ ...td, color: T.textMuted, whiteSpace: "nowrap" }}>{eq.modifiedDate ? fmtWhen(eq.modifiedDate) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CardFoot T={T} s={s} changed={settings?.changed?.intervals} msg={msgs.intervals} onSave={canEdit ? saveIntervals : null} canSave={changes.length > 0} busy={busy === "intervals"} testid="ms-save-intervals">
          <span style={{ fontSize: 12.5, color: T.textMuted }}>
            {registry.length} Lub IDs · showing {shown.length}
            {filtered.length > SHOWN ? ` of ${filtered.length} — search to narrow` : ""} · sampling in months (6, 0.5), 2 Y, Monthly, If needed · oil change 2 Y, As needed
            {changes.length ? ` · ${changes.length} not saved yet` : ""}
          </span>
        </CardFoot>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Card T={T} icon="ti-list-details" title="Lists" hint="Action phrases to pick from" testid="ms-lists">
          <PhraseChips T={T} s={s} list={phrases} onChange={setPhrases} canEdit={canEdit} testid="ms-phrases" />
          <CardFoot T={T} s={s} changed={settings?.changed?.lists} msg={msgs.lists} onSave={canEdit ? () => save("lists", { phrases }, (r) => { const l = r.settings?.phrases || phrases; saveActionRegistry(l); onActionRegistryChange?.(l); }) : null} canSave={phrasesDirty} busy={busy === "lists"} testid="ms-save-lists" />
        </Card>
        <Card T={T} icon="ti-target" title="Targets" hint="Shown on the Oil dashboard" testid="ms-targets">
          <TargetInputs T={T} s={s} canEdit={canEdit} values={targets} onChange={setTargets}
            items={[{ key: "routes", label: "Routes on time" }, { key: "samples", label: "Samples on time" }, { key: "actions", label: "Actions closed in time" }]} />
          <CardFoot T={T} s={s} changed={settings?.changed?.targets} msg={msgs.targets} onSave={canEdit ? () => save("targets", { routes: Number(targets.routes), samples: Number(targets.samples), actions: Number(targets.actions) }) : null} canSave={!!targetsDirty} busy={busy === "targets"} testid="ms-save-targets" />
        </Card>
      </div>

      <NotificationsCard T={T} s={s} email={settings?.email} moduleName="Oil" isOwner={isOwner} />

      <ThisDevice T={T} s={s} onClear={clearSaved} testid="ms-device">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.textSecondary }}>
          Auto-sync
          <button type="button" role="switch" aria-checked={!!config.enableAutoSync} onClick={() => onSave({ ...config, enableAutoSync: !config.enableAutoSync })} data-testid="ms-autosync"
            style={{ position: "relative", width: 42, height: 24, borderRadius: 12, border: 0, cursor: "pointer", background: config.enableAutoSync ? T.accent : T.border }}>
            <span style={{ position: "absolute", top: 3, insetInlineStart: config.enableAutoSync ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "inset-inline-start .15s" }} />
          </button>
        </span>
      </ThisDevice>
    </div>
  );
}

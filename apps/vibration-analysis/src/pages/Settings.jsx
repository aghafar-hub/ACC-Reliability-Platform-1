import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { getModuleSettings, saveModuleSettings } from "../api";

// Settings → Vibration Analysis (redesigned, step 3) — the same cards as Oil's:
// Status, Intervals & limits, Lists, Targets, Notifications and "This
// device". Each card saves on its own (backend ModuleSettings.js), every
// change goes to the Vibration Audit tab (→ Activity) and shows "Last changed
// by". Who may open / change it: Settings → Settings access. Per-machine
// limits and intervals stay on Limits & intervals.

function fmtWhen(iso, withTime) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "";
  const same = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (same) return withTime ? `Today ${time}` : "Today";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + (withTime ? ` ${time}` : "");
}

function Card({ T, icon, title, hint, right, children, testid }) {
  return (
    <section data-testid={testid} style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: T.accent + "1A", color: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
        </span>
        <b style={{ fontSize: 15, color: T.textPrimary }}>{title}</b>
        {hint && <span style={{ fontSize: 13, color: T.textSecondary }}>{hint}</span>}
        {right && <span style={{ marginInlineStart: "auto", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

function CardFoot({ T, s, changed, msg, onSave, canSave, busy, testid }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border2 || T.border}` }}>
      <span style={{ fontSize: 12.5, color: T.textMuted }}>{changed && changed.by ? `Last changed by ${changed.by} · ${fmtWhen(changed.at)}` : "Not changed yet"}</span>
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

function Tile({ T, label, value, tone, sub, children }) {
  const color = tone === "good" ? T.success : tone === "bad" ? T.danger : tone === "warn" ? T.warning : T.textPrimary;
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: T.textSecondary }}>{label}</div>
      {children || <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 3, lineHeight: 1.3 }}>{value}</div>}
      {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function NumberTile({ T, s, label, unit, value, onChange, canEdit, testid }) {
  return (
    <Tile T={T} label={label}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6, fontWeight: 700, color: T.textPrimary, fontSize: 15 }}>
        <input type="number" min="0" value={value ?? ""} disabled={!canEdit} onChange={(e) => onChange(e.target.value)} style={{ ...s.input, width: 76, fontSize: 14, fontWeight: 600 }} data-testid={testid} />
        {unit}
      </span>
    </Tile>
  );
}

function PhraseChips({ T, s, list, onChange, canEdit, testid }) {
  const [adding, setAdding] = useState(null);
  const add = () => {
    const v = String(adding || "").trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...list, v]);
    setAdding(null);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid={testid}>
      {list.length === 0 && <span style={{ fontSize: 13, color: T.textMuted }}>No phrases yet — add the ones engineers pick from on an action.</span>}
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

export default function Settings({ webhookUrl, onSync, onOpenLimits }) {
  const { T, s } = useTheme();
  const access = typeof window !== "undefined" && window.__accModuleAccess ? window.__accModuleAccess.get("vibration-analysis") : undefined;
  const isOwner = !!access?.admin;
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [msgs, setMsgs] = useState({});
  const [testMsg, setTestMsg] = useState("");
  const [details, setDetails] = useState(false);
  const [intervals, setIntervals] = useState({});
  const [phrases, setPhrases] = useState([]);
  const [targets, setTargets] = useState({});

  const take = (st) => {
    setSettings(st);
    setIntervals({ ...(st.intervals || {}) });
    setPhrases(st.phrases || []);
    setTargets({ ...(st.targets || {}) });
  };
  useEffect(() => {
    if (!webhookUrl) return;
    let cancelled = false;
    getModuleSettings(webhookUrl).then((st) => !cancelled && take(st), (e) => !cancelled && setLoadError(e.message));
    return () => { cancelled = true; };
  }, [webhookUrl]);

  const canEdit = !!settings?.canEdit;
  async function save(card, body) {
    setBusy(card);
    setMsgs((m) => ({ ...m, [card]: null }));
    try {
      const r = await saveModuleSettings(webhookUrl, { card, ...body });
      if (r.settings) take(r.settings);
      setMsgs((m) => ({ ...m, [card]: { ok: true, text: "Saved" } }));
      setTimeout(() => setMsgs((m) => (m[card]?.text === "Saved" ? { ...m, [card]: null } : m)), 5000);
    } catch (e) {
      setMsgs((m) => ({ ...m, [card]: { ok: false, text: e.message } }));
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    setTestMsg("Testing…");
    try {
      const t0 = Date.now();
      take(await getModuleSettings(webhookUrl));
      setTestMsg(`✓ Answers in ${Date.now() - t0} ms`);
    } catch (e) {
      setTestMsg(`✕ ${e.message}`);
    }
    setTimeout(() => setTestMsg(""), 8000);
  }

  function clearSaved() {
    let n = 0;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && /(^|[^a-z])vib\|/.test(k) && !/draft/i.test(k)) {
          localStorage.removeItem(k);
          n++;
        }
      }
    } catch {
      return "This browser blocks saved data";
    }
    return `Cleared ${n} saved item${n === 1 ? "" : "s"}. Reload to read everything fresh.`;
  }
  const [cleared, setCleared] = useState("");

  if (loadError)
    return (
      <div style={{ ...s.card, margin: 20, color: T.danger }} data-testid="vib-settings">
        {/permission|access/i.test(loadError) ? "You don't have access to Vibration Analysis settings." : `Couldn't load the settings: ${loadError}`}
      </div>
    );

  const m = settings?.module || {};
  const lim = settings?.limits || {};
  const e = settings?.email || {};
  const emailOn = e.enabled && e.sender;
  const emailText = !e.connected ? "Platform not connected" : !e.sender ? "All off · no platform sender yet" : !e.enabled ? `Off · ${e.on} event${e.on === 1 ? "" : "s"} chosen` : `On · ${e.on} event${e.on === 1 ? "" : "s"}`;
  const dirty = (a, b, keys) => !!settings && keys.some((k) => Number(a[k]) !== Number(b[k]));
  const version = (typeof window !== "undefined" && window.__accBuildId ? String(window.__accBuildId) : "dev").replace(/^test-/, "test ").slice(0, 24);

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }} data-testid="vib-settings">
      {settings && !canEdit && (
        <div data-testid="ms-readonly" style={{ border: `1px solid ${T.warning}55`, background: T.warning + "12", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: T.textPrimary }}>
          <i className="ti ti-eye" aria-hidden="true" /> View only — your Settings access lets you see these settings but not change them.
        </div>
      )}

      <Card T={T} icon="ti-plug" title="Status" testid="ms-status"
        right={
          <>
            {testMsg && <span style={{ fontSize: 12.5, fontWeight: 600, color: testMsg.startsWith("✓") ? T.success : testMsg.startsWith("✕") ? T.danger : T.textMuted }}>{testMsg}</span>}
            <button type="button" style={s.btn} onClick={testConnection} data-testid="vset-test"><i className="ti ti-plug" aria-hidden="true" /> Test connection</button>
            <button type="button" style={s.btn} onClick={() => setDetails((d) => !d)} aria-expanded={details} data-testid="ms-details">Details {details ? "▴" : "▾"}</button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <Tile T={T} label="Backend" value={settings ? "✓ Connected" : "…"} tone={settings ? "good" : undefined} />
          <Tile T={T} label="Platform equipment list" value={m.connected ? `✓ ${Number(m.platformCount || 0).toLocaleString()} machines` : settings ? "Not connected" : "…"} tone={m.connected ? "good" : "warn"} />
          <Tile T={T} label="Last ID check" value={m.checkedAt ? <>{fmtWhen(m.checkedAt, true)} · <span style={{ color: m.open ? T.danger : T.success }}>{m.open ? `${m.open} not matching` : "all match"}</span></> : "Not run yet"} />
          <Tile T={T} label="Version" value={version} />
        </div>
        {details && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>Apps Script address (built in)</div>
            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, wordBreak: "break-all", color: T.textSecondary, background: T.cardSubBg || T.codeBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px" }}>{webhookUrl}</div>
            <span><button type="button" style={s.btn} onClick={onSync}><i className="ti ti-refresh" aria-hidden="true" /> Sync now</button></span>
          </div>
        )}
      </Card>

      <Card T={T} icon="ti-adjustments" title="Intervals & limits" hint="Default measuring interval and the alarm limits" testid="ms-intervals"
        right={onOpenLimits && <button type="button" style={s.btn} onClick={onOpenLimits} data-testid="ms-open-limits">Open Limits & intervals →</button>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(max(180px, 30%), 1fr))", gap: 10 }}>
          <NumberTile T={T} s={s} label="Measure every (default)" unit="days" value={intervals.interval} onChange={(v) => setIntervals({ ...intervals, interval: v })} canEdit={canEdit} testid="ms-interval" />
          <NumberTile T={T} s={s} label='Grace before "Overdue"' unit="days" value={intervals.grace} onChange={(v) => setIntervals({ ...intervals, grace: v })} canEdit={canEdit} testid="ms-grace" />
          <NumberTile T={T} s={s} label="Report due after first reading" unit="days" value={intervals.reportDue} onChange={(v) => setIntervals({ ...intervals, reportDue: v })} canEdit={canEdit} testid="ms-reportdue" />
          <Tile T={T} label="RMS limits (mm/s)" value={lim.rms || "—"} sub="Normal · Alert · Danger — most machines" />
          <Tile T={T} label="SPM limits (dBsv)" value={lim.spm || "—"} sub="Normal · Caution · Alarm — most machines" />
          <Tile T={T} label="Machines with own limits" value={lim.ownLimits ?? "—"} sub={`${lim.ownInterval ?? 0} own interval · ${lim.notRunning ?? 0} not running`} />
        </div>
        <CardFoot T={T} s={s} changed={settings?.changed?.intervals} msg={msgs.intervals} onSave={canEdit ? () => save("intervals", { interval: Number(intervals.interval), grace: Number(intervals.grace), reportDue: Number(intervals.reportDue) }) : null}
          canSave={dirty(intervals, settings?.intervals || {}, ["interval", "grace", "reportDue"])} busy={busy === "intervals"} testid="ms-save-intervals" />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <Card T={T} icon="ti-list-details" title="Lists" hint="Action phrases to pick from" testid="ms-lists">
          <PhraseChips T={T} s={s} list={phrases} onChange={setPhrases} canEdit={canEdit} testid="ms-phrases" />
          <CardFoot T={T} s={s} changed={settings?.changed?.lists} msg={msgs.lists} onSave={canEdit ? () => save("lists", { phrases }) : null}
            canSave={!!settings && JSON.stringify(phrases) !== JSON.stringify(settings.phrases || [])} busy={busy === "lists"} testid="ms-save-lists" />
        </Card>
        <Card T={T} icon="ti-target" title="Targets" hint="Shown on the Vibration dashboard" testid="ms-targets">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {[["measured", "Machines measured on time"], ["reports", "Reports in time"], ["actions", "Actions closed in time"]].map(([k, l]) => (
              <NumberTile key={k} T={T} s={s} label={l} unit="%" value={targets[k]} onChange={(v) => setTargets({ ...targets, [k]: v })} canEdit={canEdit} testid={`target-${k}`} />
            ))}
          </div>
          <CardFoot T={T} s={s} changed={settings?.changed?.targets} msg={msgs.targets} onSave={canEdit ? () => save("targets", { measured: Number(targets.measured), reports: Number(targets.reports), actions: Number(targets.actions) }) : null}
            canSave={dirty(targets, settings?.targets || {}, ["measured", "reports", "actions"])} busy={busy === "targets"} testid="ms-save-targets" />
        </Card>
      </div>

      <Card T={T} icon="ti-mail" title="Notifications" hint="Which Vibration events send an email — set in one place for all modules" testid="ms-notifications"
        right={
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 700, background: (emailOn ? T.success : T.accent) + "14", color: emailOn ? T.success : T.accent }} data-testid="ms-email-status">
              <i className={`ti ${emailOn ? "ti-mail-check" : "ti-mail-off"}`} aria-hidden="true" /> {settings ? emailText : "…"}
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

      <section data-testid="ms-device" style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <i className="ti ti-device-desktop" style={{ fontSize: 18, color: T.textSecondary }} aria-hidden="true" />
        <b style={{ fontSize: 14.5, color: T.textPrimary }}>This device</b>
        <button type="button" style={s.btn} onClick={() => setCleared(clearSaved())} data-testid="ms-clear">Clear saved data</button>
        {cleared && <span style={{ fontSize: 12.5, color: T.success, fontWeight: 600 }}>{cleared}</span>}
        <span style={{ marginInlineStart: "auto", fontSize: 12.5, color: T.textMuted }}>Only affects this phone / PC</span>
      </section>
    </div>
  );
}

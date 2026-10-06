import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import { saveEquipmentRegistry } from "../equipmentRegistry";
import { saveActionRegistry } from "../actionRegistry";
import { useSession } from "../SessionContext";

const SETTINGS_SUB_TABS = [
  { id: "connection", label: "Connection", icon: "ti-plug" },
  { id: "registries", label: "Registries", icon: "ti-list-check" },
  { id: "notifications", label: "Notifications", icon: "ti-bell" },
  { id: "system", label: "System", icon: "ti-adjustments" },
];

function Toggle({ T, s, label, desc, checked, onChange }) {
  return (
    <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <label style={{ ...s.label, fontSize: 12, fontWeight: 600, color: T.textHighlight, display: "block" }}>{label}</label>
        {desc && <p style={{ margin: "4px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.6, maxWidth: 420 }}>{desc}</p>}
      </div>
      <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background: checked ? T.accent : T.border,
            transition: "background 0.15s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: checked ? 23 : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.15s",
            }}
          />
        </span>
      </label>
    </div>
  );
}

// Inline-editable list of every equipment's sampling interval, saved
// straight to the "Equipment Registry" sheet (column F) via a full-row
// updateRow — the same generic write every other sheet in this app uses.
// A search box keeps this usable against the live ~150-row registry.
function IntervalRegistryEditor({ T, s, webhookUrl, equipmentRegistry, onRegistryChange, isAdmin }) {
  const [query, setQuery] = useState("");
  const [editingCode, setEditingCode] = useState(null);
  const [draftInterval, setDraftInterval] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const registry = equipmentRegistry || [];
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? registry
    : registry.filter((r) => r.code.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q));
  const shown = filtered.slice(0, 50);

  function startEdit(eq) {
    setEditingCode(eq.code);
    setDraftInterval(eq.interval || "");
    setMsg("");
  }
  function cancelEdit() {
    setEditingCode(null);
    setDraftInterval("");
  }
  async function saveEdit(eq) {
    if (!webhookUrl) {
      setMsg("❌ Configure Webhook URL first");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const updated = await api.updateEquipmentRegistryEntry(webhookUrl, { ...eq, interval: draftInterval.trim() });
      const next = registry.map((r) => (r.code === eq.code ? { ...r, ...updated } : r));
      saveEquipmentRegistry(next);
      onRegistryChange?.(next);
      setEditingCode(null);
      setMsg(`✓ ${eq.code} interval updated`);
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 6000);
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <i className="ti ti-clock-hour-4" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Sampling Intervals</p>
          <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
            Edit how often each piece of equipment should be sampled — saved straight to the "Equipment Registry" sheet.
          </p>
        </div>
      </div>
      {!isAdmin && (
        <p style={{ fontSize: 11.5, color: T.warning, margin: "0 0 10px", lineHeight: 1.6 }}>
          <i className="ti ti-lock" aria-hidden="true" /> Read-only — only an Admin account can edit sampling intervals.
        </p>
      )}
      <input
        style={{ ...s.input, fontSize: 13, marginBottom: 10, maxWidth: 320 }}
        placeholder="Search equipment code or description…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        {shown.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: T.textMuted, fontSize: 12 }}>No equipment match.</div>
        ) : (
          shown.map((eq) => (
            <div
              key={eq.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderBottom: `1px solid ${T.border2}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: T.accent }}>{eq.code}</div>
                <div style={{ fontSize: 11, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {eq.description}
                </div>
              </div>
              {editingCode === eq.code ? (
                <>
                  <input
                    style={{ ...s.input, fontSize: 12, width: 140 }}
                    value={draftInterval}
                    onChange={(e) => setDraftInterval(e.target.value)}
                    placeholder="e.g. 6 Months"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(eq)}
                    disabled={saving}
                  />
                  <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11 }} onClick={() => saveEdit(eq)} disabled={saving}>
                    <i className={`ti ${saving ? "ti-loader" : "ti-check"}`} aria-hidden="true" />
                  </button>
                  <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11 }} onClick={cancelEdit} disabled={saving}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: T.textHighlight, width: 100, textAlign: "right" }}>{eq.interval || "—"}</span>
                  <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11 }} onClick={() => startEdit(eq)} disabled={!isAdmin}>
                    <i className="ti ti-pencil" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
      {filtered.length > 50 && (
        <p style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>Showing 50 of {filtered.length} — narrow your search to see more.</p>
      )}
      {msg && <p style={{ marginTop: 8, fontSize: 12, color: msg.startsWith("✓") ? T.success : T.danger }}>{msg}</p>}
    </div>
  );
}

function Field({ T, s, label, value, placeholder, onChange, desc, type = "text" }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ ...s.label, fontSize: 12, fontWeight: 600, color: T.textHighlight }}>{label}</label>
      <input
        style={{ ...s.input, fontSize: 13 }}
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {desc && <p style={{ margin: "5px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>{desc}</p>}
    </div>
  );
}

// Patch 14 (plant-readiness pass) — admin on/off switch for every email
// Notifications.js sends (Routine assigned/submitted/approved, the aging
// actions and low-stock digests), plus which address/name they appear to
// come FROM. Platform-wide, not per-device: unlike everything else on this
// page, loading/saving this goes through the backend (Script Properties,
// see Notifications.js), not localStorage — one setting for the whole
// deployment, the same for whoever opens Settings next.
//
// isAdmin is read from the Platform Core session (ROLE-ADMIN) — the real
// gate is server-side (requireAdmin_ in Rbac.js rejects a non-admin's
// save regardless), this just disables the inputs so a non-admin sees why
// before trying, rather than after a failed save.
function NotificationSettingsCard({ T, s, webhookUrl, isAdmin }) {
  const [settings, setSettings] = useState(null); // null while loading
  const [draft, setDraft] = useState({ enabled: true, fromEmail: "", fromName: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!webhookUrl) return;
    api.getNotificationSettings(webhookUrl).then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setDraft(loaded);
    }).catch((err) => {
      if (!cancelled) setMsg(`❌ Couldn't load notification settings: ${err.message}`);
    });
    return () => {
      cancelled = true;
    };
  }, [webhookUrl]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const saved = await api.updateNotificationSettings(webhookUrl, draft);
      setSettings(saved);
      setDraft(saved);
      setMsg("✓ Notification settings saved");
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 6000);
    }
  }

  return (
    <div style={{ ...s.card, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <i className="ti ti-mail" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Email Notifications</p>
          <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
            Routine assigned/submitted/approved emails, plus the daily aging-actions and low-stock digests. Admin-only — applies to
            everyone, not just this device.
          </p>
        </div>
      </div>

      {!webhookUrl ? (
        <p style={{ fontSize: 12, color: T.textMuted }}>Configure the Webhook URL above first.</p>
      ) : settings === null ? (
        <p style={{ fontSize: 12, color: T.textMuted }}>Loading…</p>
      ) : (
        <>
          {!isAdmin && (
            <p style={{ fontSize: 11.5, color: T.warning, margin: "0 0 14px", lineHeight: 1.6 }}>
              <i className="ti ti-lock" aria-hidden="true" /> Only an Admin account can change these — shown here read-only.
            </p>
          )}
          <Toggle
            T={T}
            s={s}
            label="Enable email notifications"
            desc="Turn every email this app sends on or off, platform-wide. Off means nobody gets any of them, not just you."
            checked={draft.enabled}
            onChange={(v) => isAdmin && setDraft((d) => ({ ...d, enabled: v }))}
          />
          <fieldset disabled={!isAdmin} style={{ border: "none", padding: 0, margin: 0, opacity: isAdmin ? 1 : 0.6 }}>
            <Field
              T={T}
              s={s}
              label="Notifications From (email)"
              value={draft.fromEmail}
              placeholder="reliability@arabiancement.com"
              onChange={(v) => setDraft((d) => ({ ...d, fromEmail: v }))}
              desc="So these emails come from the Reliability Platform, not a personal inbox. IMPORTANT: this address must first be added and verified as a 'Send As' alias in the Gmail account that owns this Apps Script deployment (Gmail → Settings → Accounts and Import → Send mail as) — otherwise Google silently keeps sending from that account's own address no matter what's typed here."
            />
            <Field
              T={T}
              s={s}
              label="Display Name"
              value={draft.fromName}
              placeholder="Arabian Cement Reliability Platform"
              onChange={(v) => setDraft((d) => ({ ...d, fromName: v }))}
              desc="The friendly name shown in the From line — this part works immediately, no alias needed."
            />
          </fieldset>
          {isAdmin && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
                <i className={`ti ${saving ? "ti-loader" : "ti-device-floppy"}`} aria-hidden="true" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
          {msg && <p style={{ marginTop: 10, fontSize: 12, color: msg.startsWith("✓") ? T.success : T.danger }}>{msg}</p>}
        </>
      )}
    </div>
  );
}

// Ported from the original app's Settings (`Kh`), then cut down: the
// password-protected "Configuration" gate (shared password, independent of
// role) and the "Appearance" tab/theme picker were both leftovers from
// before this app had real login/RBAC or a platform shell — theme now
// lives in the platform Settings page (frontend/src/pages/Settings.tsx),
// and real ROLE-ADMIN gating (the same `isAdmin` every other card on this
// page already uses) replaces the password for the handful of actions here
// that actually write shared data (sampling intervals, Action Registry).
// Everything else on this page is a per-device preference (cache/sync/
// debug), harmless for anyone logged in to change, so it's left open.
export default function Settings({
  config,
  onSave,
  onSync,
  syncState,
  syncMsg,
  equipmentRegistry,
  onRegistryChange,
  onActionRegistryChange,
  actionRegistry,
}) {
  const { T, s } = useTheme();
  const session = useSession();
  const isAdmin = (session?.claims?.roles || []).includes("ROLE-ADMIN");
  const [subTab, setSubTab] = useState("connection");
  const [draft, setDraft] = useState(() => ({ ...config }));
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);

  const [cacheMsg, setCacheMsg] = useState("");

  const [newActionText, setNewActionText] = useState("");
  const [actionSyncing, setActionSyncing] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function save() {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function testConnection() {
    if (!draft.webhookUrl) {
      setTestMsg("❌ No webhook URL set");
      return;
    }
    setTesting(true);
    setTestMsg("Testing…");
    try {
      const res = await api.readAll(draft.webhookUrl);
      setTestMsg(`✓ Connected — Apps Script responded OK (${res.samples.length} samples)`);
    } catch (err) {
      setTestMsg(`❌ ${err.message}`);
    }
    setTesting(false);
    setTimeout(() => setTestMsg(""), 8000);
  }

  async function addNewAction() {
    const label = newActionText.trim();
    if (!label || !draft.webhookUrl) return;
    setActionSyncing(true);
    setActionMsg("");
    try {
      const list = await api.addActionRegistryEntry(draft.webhookUrl, label);
      saveActionRegistry(list);
      onActionRegistryChange?.(list);
      setNewActionText("");
      setActionMsg(`✓ "${label}" added`);
    } catch (err) {
      setActionMsg(`❌ ${err.message}`);
    } finally {
      setActionSyncing(false);
      setTimeout(() => setActionMsg(""), 6000);
    }
  }

  function clearCache() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("acc_oilapp_cache_"))
      .forEach((k) => localStorage.removeItem(k));
    setCacheMsg("✓ Cache cleared — next sync will fetch fresh data");
    setTimeout(() => setCacheMsg(""), 4000);
  }

  // Non-admin users don't see any of this at all — not read-only, not
  // disabled fields, nothing rendered — same as AccountsPanel's own
  // `if (!claims?.roles.includes(ROLE.ADMIN)) return null` on the General
  // settings tab. Theme/appearance has no module-level equivalent here
  // (it lives on the General tab, visible to everyone there), so there's
  // nothing for a non-admin to see on this tab at all.
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 740 }}>
        <p style={s.sectionTitle}>Settings</p>
        <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
          <i className="ti ti-lock" style={{ fontSize: 32, color: T.textMuted, display: "block", marginBottom: 12 }} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Admin access required</p>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: T.textSecondary }}>
            Only an App Admin account can view Oil Lubrication's settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 740 }}>
      <p style={s.sectionTitle}>Settings</p>

      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 20, flexWrap: "wrap" }}>
        {SETTINGS_SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "10px 16px",
              cursor: "pointer",
              background: "transparent",
              border: "none",
              borderBottom: subTab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
              color: subTab === t.id ? T.accent : T.textSecondary,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "connection" && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <i className="ti ti-plug" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
            <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Connection</p>
          </div>

          <Field
            T={T}
            s={s}
            label="Google Sheet URL"
            value={draft.sheetUrl}
            placeholder="https://docs.google.com/spreadsheets/d/XXXXXXX/edit"
            onChange={(v) => set("sheetUrl", v)}
            desc="Paste your sheet URL here. Used for the 'Open Sheet' button."
          />

          {/* Read-only, not an input: the real value is baked into the
              build (see config.js's DEFAULT_WEBHOOK_URL — "Bake correct
              webhook URL into the build"). Letting it be hand-edited per
              device used to mean a mistyped URL could silently desync
              just that one device from the real backend with no obvious
              cause; Test Connection is the safe way to check it still
              answers. */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ ...s.label, fontSize: 12, fontWeight: 600, color: T.textHighlight, display: "block" }}>
              Apps Script Webhook URL
            </label>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: T.textSecondary,
                fontFamily: "monospace",
                wordBreak: "break-all",
                background: T.cardSubBg,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              {draft.webhookUrl || "Not configured"}
            </p>
            <p style={{ margin: "5px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
              Baked into the build — not editable here. Use Test Connection to confirm it's reachable.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
            <button style={{ ...s.btn, fontSize: 12 }} onClick={testConnection} disabled={testing}>
              <i className="ti ti-plug" aria-hidden="true" /> Test Connection
            </button>
            <button style={{ ...s.btn, fontSize: 12 }} onClick={onSync} disabled={syncState === "loading"}>
              <i
                className={`ti ${syncState === "loading" ? "ti-loader" : "ti-refresh"}`}
                style={{ animation: syncState === "loading" ? "spin 1s linear infinite" : "none" }}
                aria-hidden="true"
              />{" "}
              {syncState === "loading" ? "Syncing…" : "Sync Now"}
            </button>
            {draft.sheetUrl && (
              <a
                href={draft.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...s.btn, textDecoration: "none", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <i className="ti ti-external-link" aria-hidden="true" /> Open Sheet
              </a>
            )}
            {testMsg && <span style={{ fontSize: 12, color: testMsg.startsWith("✓") ? T.success : T.danger }}>{testMsg}</span>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <button style={s.btnPrimary} onClick={save}>
              <i className="ti ti-device-floppy" aria-hidden="true" /> Save Settings
            </button>
            {saved && <span style={{ fontSize: 12, color: T.success }}>✓ Saved</span>}
          </div>
        </div>
      )}

      {subTab === "registries" && (
        <>
          <div style={{ ...s.card, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <i className="ti ti-database-import" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Equipment Registry</p>
                <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
                  Loaded automatically from the "Equipment Registry" sheet tab every time the app opens — same list on every
                  device, nothing to sync by hand. Currently {equipmentRegistry?.length || 0} equipment.
                </p>
              </div>
            </div>
          </div>

          <IntervalRegistryEditor
            T={T}
            s={s}
            webhookUrl={draft.webhookUrl}
            equipmentRegistry={equipmentRegistry}
            onRegistryChange={onRegistryChange}
            isAdmin={isAdmin}
          />

          <div style={{ ...s.card, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <i className="ti ti-list-check" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Action Registry</p>
                <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
                  The pick list Contractor Action / ACC Action draw from in Action Tracker — loaded automatically every time the
                  app opens. Add new entries here; they're saved to the "OL_ACTION_PHRASES" sheet tab.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {(actionRegistry || []).length === 0 && <span style={{ fontSize: 12, color: T.textMuted }}>No actions yet.</span>}
              {(actionRegistry || []).map((a) => (
                <span
                  key={a}
                  style={{
                    background: T.navActive,
                    color: T.accent,
                    borderRadius: 4,
                    padding: "3px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {a}
                </span>
              ))}
            </div>

            {!isAdmin && (
              <p style={{ fontSize: 11.5, color: T.warning, margin: "0 0 10px", lineHeight: 1.6 }}>
                <i className="ti ti-lock" aria-hidden="true" /> Only an Admin account can add new actions.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                style={{ ...s.input, fontSize: 13, width: 220 }}
                value={newActionText}
                placeholder="New action, e.g. Change Belt"
                onChange={(e) => setNewActionText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNewAction()}
                disabled={!isAdmin}
              />
              <button
                style={{ ...s.btn, fontSize: 12 }}
                onClick={addNewAction}
                disabled={!isAdmin || actionSyncing || !draft.webhookUrl || !newActionText.trim()}
              >
                <i
                  className={`ti ${actionSyncing ? "ti-loader" : "ti-plus"}`}
                  style={{ animation: actionSyncing ? "spin 1s linear infinite" : "none" }}
                  aria-hidden="true"
                />{" "}
                Add
              </button>
              {actionMsg && <span style={{ fontSize: 12, color: actionMsg.startsWith("✓") ? T.success : T.danger }}>{actionMsg}</span>}
            </div>
          </div>
        </>
      )}

      {subTab === "notifications" && (
        <>
          <NotificationSettingsCard T={T} s={s} webhookUrl={draft.webhookUrl} isAdmin={isAdmin} />
          <div style={{ ...s.card, marginBottom: 20 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Who gets alerts</p>
            <p style={{ margin: 0, fontSize: 12, color: T.textSecondary }}>
              Alerts go to the responsible engineers listed in Settings → General → Module Access (App Owner only).
            </p>
          </div>
        </>
      )}

      {subTab === "system" && (
        <>
          <div style={{ ...s.card, marginBottom: 20 }}>
            <p style={{ margin: "0 0 12px", fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>App Status</p>
            {[
              ["Version", "4.0"],
              ["Sheet URL", draft.sheetUrl ? "Configured" : "Not configured"],
              ["Webhook URL", draft.webhookUrl ? "Configured" : "Not configured"],
              ["Cache", draft.enableCache ? "Enabled" : "Disabled"],
              ["Auto-Sync", draft.enableAutoSync ? `Every ${draft.autoSyncMinutes || 5} min` : "Disabled"],
              ["Debug Mode", draft.enableDebugMode ? "On" : "Off"],
              ["Last sync", syncMsg || "Not synced yet"],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 12,
                }}
              >
                <span style={{ color: T.textSecondary }}>{k}</span>
                <span style={{ color: T.textHighlight, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ ...s.card, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <i className="ti ti-settings" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
              <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Sync &amp; Cache Preferences</p>
            </div>

            <Toggle
              T={T}
              s={s}
              label="Enable Auto-Sync"
              desc="Automatically re-sync from Google Sheets in the background at the interval below."
              checked={draft.enableAutoSync}
              onChange={(v) => set("enableAutoSync", v)}
            />
            <Field
              T={T}
              s={s}
              label="Auto-Sync Interval (minutes)"
              type="number"
              value={draft.autoSyncMinutes}
              onChange={(v) => set("autoSyncMinutes", Number(v) || 5)}
              desc="How often to automatically re-sync when Auto-Sync is enabled."
            />
            <Toggle T={T} s={s} label="Enable Cache" checked={draft.enableCache} onChange={(v) => set("enableCache", v)} />
            <Field
              T={T}
              s={s}
              label="Cache Duration (minutes)"
              type="number"
              value={draft.cacheDurationMinutes}
              onChange={(v) => set("cacheDurationMinutes", Number(v) || 10)}
              desc="How long cached data is considered fresh before a background refresh."
            />
            <Toggle T={T} s={s} label="Enable Debug Mode" checked={draft.enableDebugMode} onChange={(v) => set("enableDebugMode", v)} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button style={{ ...s.btn, fontSize: 12 }} onClick={clearCache}>
                <i className="ti ti-trash-x" aria-hidden="true" /> Clear Cache
              </button>
              {cacheMsg && <span style={{ fontSize: 12, color: T.success, alignSelf: "center" }}>{cacheMsg}</span>}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <button style={s.btnPrimary} onClick={save}>
                <i className="ti ti-device-floppy" aria-hidden="true" /> Save Settings
              </button>
              {saved && <span style={{ fontSize: 12, color: T.success }}>✓ Saved</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

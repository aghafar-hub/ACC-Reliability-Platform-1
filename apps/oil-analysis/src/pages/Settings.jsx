import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { THEMES, THEME_NAMES } from "../theme";
import * as api from "../api";
import { loadEquipmentRegistry, saveEquipmentRegistry } from "../equipmentRegistry";
import { saveActionRegistry } from "../actionRegistry";

const CONFIG_PASSWORD = "17593";

function ThemeSwatch({ name, palette, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: 10,
        border: `2px solid ${active ? palette.accent : palette.border}`,
        overflow: "hidden",
        transition: "border-color 0.2s",
        boxShadow: active ? `0 0 0 2px ${palette.accent}44` : "none",
      }}
    >
      <div style={{ background: palette.appBg, padding: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
          <div style={{ width: 28, background: palette.sidebarBg, borderRadius: 3, padding: "3px 4px" }}>
            {[palette.accent, palette.textSecondary, palette.textSecondary].map((c, i) => (
              <div key={i} style={{ height: 3, background: c, borderRadius: 2, marginBottom: 2, opacity: i === 0 ? 1 : 0.5 }} />
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 8,
                background: palette.cardBg,
                borderRadius: 3,
                border: `1px solid ${palette.border}`,
                marginBottom: 3,
                padding: 2,
              }}
            >
              <div style={{ height: 4, width: "60%", background: palette.accent, borderRadius: 2 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              {[palette.cardBg, palette.cardBg].map((c, i) => (
                <div key={i} style={{ height: 12, background: c, borderRadius: 2, border: `1px solid ${palette.border}` }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
          {[palette.accent, "#2DC653", "#E63946", "#F4A261"].map((c, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
          ))}
        </div>
      </div>
      <div
        style={{
          background: palette.sidebarBg,
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: palette.textPrimary }}>{name}</span>
        {active && <i className="ti ti-check" style={{ fontSize: 12, color: palette.accent }} aria-hidden="true" />}
      </div>
    </div>
  );
}

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
function IntervalRegistryEditor({ T, s, webhookUrl, equipmentRegistry, onRegistryChange }) {
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
                  <button style={{ ...s.btn, padding: "4px 8px", fontSize: 11 }} onClick={() => startEdit(eq)}>
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

// Ported from the original app's Settings (`Kh`): two tabs — Appearance (no
// password) and Configuration (password 17593, re-required every time the
// tab is opened) — including the Equipment Registry Sync reconciliation
// flow, App Status summary, and export/import/reset/clear-cache actions.
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
  const { T, s, themeName } = useTheme();
  const [draft, setDraft] = useState(() => ({ ...config }));
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);

  const [tab, setTab] = useState("appearance");
  const [locked, setLocked] = useState(true);
  const [pwInput, setPwInput] = useState("");
  const [pwWrong, setPwWrong] = useState(false);

  const [registrySyncing, setRegistrySyncing] = useState(false);
  const [registryResult, setRegistryResult] = useState(null);
  const [registryPreview, setRegistryPreview] = useState(null);

  const [importMsg, setImportMsg] = useState("");
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
  function openConfiguration() {
    setTab("configuration");
    setLocked(true);
    setPwInput("");
    setPwWrong(false);
  }
  function tryUnlock() {
    if (pwInput === CONFIG_PASSWORD) {
      setLocked(false);
      setPwWrong(false);
    } else {
      setPwWrong(true);
      setPwInput("");
    }
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

  async function syncRegistry() {
    if (!draft.webhookUrl) return;
    setRegistrySyncing(true);
    setRegistryResult(null);
    setRegistryPreview(null);
    try {
      const sheetEquip = await api.getEquipmentRegistry(draft.webhookUrl);
      if (!sheetEquip || sheetEquip.length === 0) {
        setRegistryResult({ error: "No equipment returned" });
        return;
      }
      const current = loadEquipmentRegistry();
      const sheetCodes = new Set(sheetEquip.map((r) => r.code));
      const appOnly = current.filter((r) => !sheetCodes.has(r.code)).map((r) => ({ eq: r, action: "keep" }));
      setRegistryPreview({ sheetEquip, appOnly, current });
      setRegistryResult({ synced: sheetEquip.length, appOnlyCount: appOnly.length });
    } catch (err) {
      setRegistryResult({ error: err.message });
    } finally {
      setRegistrySyncing(false);
    }
  }
  function setAppOnlyAction(index, action) {
    setRegistryPreview((prev) => ({ ...prev, appOnly: prev.appOnly.map((item, i) => (i === index ? { ...item, action } : item)) }));
  }
  function applyRegistrySync() {
    if (!registryPreview) return;
    const kept = registryPreview.appOnly.filter((item) => item.action === "keep").map((item) => item.eq);
    // Contractor lives in column J of the sheet, so a normal overwrite is
    // fine once the backend reads it — but fall back to the prior known
    // value when the sheet's cell (or an older, not-yet-updated backend
    // deployment) leaves it blank, rather than losing it outright.
    const currentByCode = Object.fromEntries((registryPreview.current || []).map((r) => [r.code, r]));
    const merged = [
      ...registryPreview.sheetEquip.map((eq) => ({
        ...currentByCode[eq.code],
        ...eq,
        contractor: eq.contractor || currentByCode[eq.code]?.contractor || "",
      })),
      ...kept,
    ];
    saveEquipmentRegistry(merged);
    onRegistryChange?.(merged);
    setRegistryResult({ applied: true, total: merged.length });
    setRegistryPreview(null);
  }

  async function syncActionRegistry() {
    if (!draft.webhookUrl) return;
    setActionSyncing(true);
    setActionMsg("");
    try {
      const list = await api.getActionRegistry(draft.webhookUrl);
      if (!list || list.length === 0) {
        setActionMsg("❌ No actions returned from the sheet");
        return;
      }
      saveActionRegistry(list);
      onActionRegistryChange?.(list);
      setActionMsg(`✓ Synced — ${list.length} actions loaded`);
    } catch (err) {
      setActionMsg(`❌ ${err.message}`);
    } finally {
      setActionSyncing(false);
      setTimeout(() => setActionMsg(""), 6000);
    }
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

  function resetConfig() {
    if (
      !window.confirm(
        "Reset all settings to defaults? Your Sheet URL and Webhook URL will be kept; theme, cache, and sync preferences will revert to defaults."
      )
    )
      return;
    const next = {
      sheetUrl: draft.sheetUrl,
      webhookUrl: draft.webhookUrl,
      themeName: "Navy Dark",
      autoSyncMinutes: 5,
      cacheDurationMinutes: 10,
      enableCache: true,
      enableAutoSync: true,
      enableDebugMode: false,
      logoUrl: "",
      appName: "Arabian Cement Oil Analysis",
    };
    setDraft(next);
    onSave(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oil-analysis-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importConfig(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        setDraft((d) => ({ ...d, ...parsed }));
        setImportMsg("✓ Config imported — click Save Settings to apply");
      } catch {
        setImportMsg("❌ Invalid config file");
      }
      setTimeout(() => setImportMsg(""), 5000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function clearCache() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("acc_oilapp_cache_"))
      .forEach((k) => localStorage.removeItem(k));
    setCacheMsg("✓ Cache cleared — next sync will fetch fresh data");
    setTimeout(() => setCacheMsg(""), 4000);
  }

  return (
    <div style={{ maxWidth: 740 }}>
      <p style={s.sectionTitle}>Settings</p>

      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
        {[
          { id: "appearance", label: "Appearance", icon: "ti-palette" },
          { id: "configuration", label: "Configuration", icon: "ti-settings-2" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => (t.id === "configuration" ? openConfiguration() : setTab(t.id))}
            style={{
              padding: "10px 16px",
              cursor: "pointer",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
              color: tab === t.id ? T.accent : T.textSecondary,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
            {t.id === "configuration" && <i className="ti ti-lock" style={{ fontSize: 11 }} aria-hidden="true" />}
          </button>
        ))}
      </div>

      {tab === "appearance" && (
        <div>
          <div style={{ ...s.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <i className="ti ti-palette" style={{ color: T.accent, fontSize: 20 }} aria-hidden="true" />
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Appearance</p>
                <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>Choose a colour theme. Changes apply instantly.</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
              {THEME_NAMES.map((name) => (
                <ThemeSwatch
                  key={name}
                  name={name}
                  palette={THEMES[name]}
                  active={themeName === name}
                  onClick={() => onSave({ ...config, themeName: name })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "configuration" && (
        <div>
          {locked ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
              <i className="ti ti-lock" style={{ fontSize: 40, color: T.accent, display: "block", marginBottom: 16 }} aria-hidden="true" />
              <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Configuration is password protected</p>
              <p style={{ margin: "0 0 20px", fontSize: 12, color: T.textSecondary }}>
                Enter the password to access configuration settings
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
                <input
                  style={{ ...s.input, width: 160, textAlign: "center" }}
                  type="password"
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                  autoFocus
                />
                <button style={s.btnPrimary} onClick={tryUnlock}>
                  <i className="ti ti-arrow-right" aria-hidden="true" />
                </button>
              </div>
              {pwWrong && <p style={{ marginTop: 12, fontSize: 12, color: T.danger }}>Incorrect password</p>}
            </div>
          ) : (
            <div>
              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <i className="ti ti-database-import" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Equipment Registry Sync</p>
                    <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
                      Sync equipment data from the "Equipment Registry" sheet tab. Keeps app-only equipment with your choice.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                  <button style={{ ...s.btn, fontSize: 12 }} onClick={syncRegistry} disabled={registrySyncing || !draft.webhookUrl}>
                    <i
                      className={`ti ${registrySyncing ? "ti-loader" : "ti-refresh"}`}
                      style={{ animation: registrySyncing ? "spin 1s linear infinite" : "none" }}
                      aria-hidden="true"
                    />{" "}
                    Sync Equipment Registry
                  </button>
                  {!draft.webhookUrl && <span style={{ fontSize: 11, color: T.danger }}>Configure Webhook URL first</span>}
                </div>
                {registryResult?.error && (
                  <div
                    style={{
                      marginTop: 10,
                      background: T.dangerBg,
                      border: `1px solid ${T.danger}`,
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12,
                      color: T.danger,
                    }}
                  >
                    <i className="ti ti-alert-circle" aria-hidden="true" /> {registryResult.error}
                  </div>
                )}
                {registryResult?.applied && (
                  <div
                    style={{
                      marginTop: 10,
                      background: T.successBg,
                      border: `1px solid ${T.success}`,
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12,
                      color: T.success,
                    }}
                  >
                    <i className="ti ti-check" aria-hidden="true" /> Registry updated — {registryResult.total} equipment now in app
                    registry. Changes take effect immediately.
                  </div>
                )}
                {registryPreview && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8 }}>
                      {registryPreview.sheetEquip.length} equipment from the sheet. {registryPreview.appOnly.length} equipment exist in the
                      app but not the sheet — choose Keep or Remove for each:
                    </p>
                    {registryPreview.appOnly.length === 0 ? (
                      <button style={s.btnPrimary} onClick={applyRegistrySync}>
                        <i className="ti ti-check" aria-hidden="true" /> Apply
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {registryPreview.appOnly.map((item, i) => (
                          <div
                            key={item.eq.code}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              background: T.cardSubBg,
                              border: `1px solid ${T.border}`,
                              borderRadius: 6,
                              padding: "6px 10px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontFamily: "monospace",
                                color: T.accent,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.eq.code}
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                style={{
                                  ...s.btn,
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  background: item.action === "keep" ? T.accent : "transparent",
                                  color: item.action === "keep" ? T.accentText : T.textSecondary,
                                }}
                                onClick={() => setAppOnlyAction(i, "keep")}
                              >
                                Keep
                              </button>
                              <button
                                style={{
                                  ...s.btn,
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  background: item.action === "remove" ? T.danger : "transparent",
                                  color: item.action === "remove" ? "#fff" : T.textSecondary,
                                }}
                                onClick={() => setAppOnlyAction(i, "remove")}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                        <button style={{ ...s.btnPrimary, marginTop: 6, alignSelf: "flex-start" }} onClick={applyRegistrySync}>
                          <i className="ti ti-check" aria-hidden="true" /> Apply
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <IntervalRegistryEditor
                T={T}
                s={s}
                webhookUrl={draft.webhookUrl}
                equipmentRegistry={equipmentRegistry}
                onRegistryChange={onRegistryChange}
              />

              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <i className="ti ti-list-check" style={{ color: T.accent, fontSize: 18 }} aria-hidden="true" />
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Action Registry</p>
                    <p style={{ margin: 0, fontSize: 11, color: T.textSecondary }}>
                      The pick list Contractor Action / ACC Action draw from in Action Tracker. Add new entries here — they're saved to the
                      "Action Registry" sheet tab.
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

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ ...s.input, fontSize: 13, width: 220 }}
                    value={newActionText}
                    placeholder="New action, e.g. Change Belt"
                    onChange={(e) => setNewActionText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNewAction()}
                  />
                  <button
                    style={{ ...s.btn, fontSize: 12 }}
                    onClick={addNewAction}
                    disabled={actionSyncing || !draft.webhookUrl || !newActionText.trim()}
                  >
                    <i className="ti ti-plus" aria-hidden="true" /> Add
                  </button>
                  <button style={{ ...s.btn, fontSize: 12 }} onClick={syncActionRegistry} disabled={actionSyncing || !draft.webhookUrl}>
                    <i
                      className={`ti ${actionSyncing ? "ti-loader" : "ti-refresh"}`}
                      style={{ animation: actionSyncing ? "spin 1s linear infinite" : "none" }}
                      aria-hidden="true"
                    />{" "}
                    Sync from Sheet
                  </button>
                  {!draft.webhookUrl && <span style={{ fontSize: 11, color: T.danger }}>Configure Webhook URL first</span>}
                  {actionMsg && <span style={{ fontSize: 12, color: actionMsg.startsWith("✓") ? T.success : T.danger }}>{actionMsg}</span>}
                </div>
              </div>

              <div style={{ ...s.card, marginBottom: 20 }}>
                <p style={{ margin: "0 0 12px", fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>App Status</p>
                {[
                  ["App Name", draft.appName || "Arabian Cement Oil Analysis"],
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
                  <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Application Configuration</p>
                </div>

                <Field
                  T={T}
                  s={s}
                  label="Application Name"
                  value={draft.appName}
                  onChange={(v) => set("appName", v)}
                  desc="Shown in the sidebar / browser title."
                />
                <Field
                  T={T}
                  s={s}
                  label="Google Sheet URL"
                  value={draft.sheetUrl}
                  placeholder="https://docs.google.com/spreadsheets/d/XXXXXXX/edit"
                  onChange={(v) => set("sheetUrl", v)}
                  desc="Paste your sheet URL here. Used for the 'Open Sheet' button."
                />
                <Field
                  T={T}
                  s={s}
                  label="Apps Script Webhook URL"
                  value={draft.webhookUrl}
                  placeholder="https://script.google.com/macros/s/XXXXXXX/exec"
                  onChange={(v) => set("webhookUrl", v)}
                  desc="Deployed Web App URL from your Apps Script. Handles all reads and writes."
                />

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

                <div style={{ marginBottom: 18 }}>
                  <label style={{ ...s.label, fontSize: 12, fontWeight: 600, color: T.textHighlight, display: "block" }}>
                    Logo Image URL
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input
                      style={{ ...s.input, fontSize: 13 }}
                      value={draft.logoUrl || ""}
                      placeholder="https://example.com/logo.png"
                      onChange={(e) => set("logoUrl", e.target.value)}
                    />
                    {draft.logoUrl && (
                      <img
                        src={draft.logoUrl}
                        alt="Logo preview"
                        style={{ height: 40, objectFit: "contain" }}
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    )}
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
                    If hosting on Google Drive, share as <strong>Anyone with the link</strong>. Blank preview? Check URL or Drive sharing.
                  </p>
                </div>

                <Toggle T={T} s={s} label="Enable Debug Mode" checked={draft.enableDebugMode} onChange={(v) => set("enableDebugMode", v)} />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <button style={{ ...s.btn, fontSize: 12 }} onClick={resetConfig}>
                    <i className="ti ti-rotate" aria-hidden="true" /> Reset
                  </button>
                  <button style={{ ...s.btn, fontSize: 12 }} onClick={exportConfig}>
                    <i className="ti ti-download" aria-hidden="true" /> Export
                  </button>
                  <label style={{ ...s.btn, fontSize: 12, cursor: "pointer" }}>
                    <i className="ti ti-upload" aria-hidden="true" /> Import
                    <input type="file" accept="application/json" onChange={importConfig} style={{ display: "none" }} />
                  </label>
                  <button style={{ ...s.btn, fontSize: 12 }} onClick={clearCache}>
                    <i className="ti ti-trash-x" aria-hidden="true" /> Clear Cache
                  </button>
                  {(importMsg || cacheMsg) && (
                    <span style={{ fontSize: 12, color: T.success, alignSelf: "center" }}>{importMsg || cacheMsg}</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                  <button style={s.btnPrimary} onClick={save}>
                    <i className="ti ti-device-floppy" aria-hidden="true" /> Save Settings
                  </button>
                  {saved && <span style={{ fontSize: 12, color: T.success }}>✓ Saved</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

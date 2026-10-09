import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { getStartupBundle, saveConfig as saveConfigApi, testConnection } from "../api";
import { APP_VERSION, configStore, DEFAULT_WEBHOOK_URL } from "../config";

// Vibration settings: one card — the backend this app talks to, the sheet
// behind it, a connection check. Who may open it is set in Module Access
// (the "Settings" tab level), like every other page; there is no separate
// password any more. Limits and intervals live on their own page.
//
// Removed (no longer used by any page): the passcode, Backfill Last Readings
// (the 📋 Last RMS / SPM Reading tabs aren't read by the app now), App Info
// and the old v3 setup instructions (docs/vibration-workflow.md has the
// current Apps Script steps).
export default function Settings({ webhookUrl, setWebhookUrl, sheetUrl, setSheetUrl, onSync, config, setConfig, syncState, webhookRef }) {
  const { T, s } = useTheme();
  const [draft, setDraft] = useState({ ...config });
  const [saveMessage, setSaveMessage] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);

  const saveConfiguration = async () => {
    const merged = { ...draft };
    configStore.save(merged);
    setConfig(merged);
    setWebhookUrl(merged.webhookUrl || webhookUrl);
    setSheetUrl(merged.googleSheetUrl || sheetUrl);
    const url = merged.webhookUrl || webhookRef?.current;
    if (url) {
      try {
        await saveConfigApi(url, { webhookUrl: merged.webhookUrl || "", googleSheetUrl: merged.googleSheetUrl || "", contractors: merged.contractors || "" });
      } catch {
        // best-effort — a failed save-to-sheet still keeps the local config saved
      }
    }
    setSaveMessage("✓ Saved");
    setTimeout(() => setSaveMessage(""), 2500);
  };

  const runTest = async () => {
    const url = draft.webhookUrl || webhookUrl;
    setTesting(true);
    const results = [];
    const show = () => setTestResults([...results]);
    if (!url) {
      results.push({ ok: false, label: "Webhook URL", detail: "Not configured" });
      show();
      setTesting(false);
      return;
    }
    try {
      const start = Date.now();
      const result = await testConnection(url);
      const ok = result && result.status === "ok";
      results.push({ ok, label: "Apps Script answers", detail: ok ? `OK — ${Date.now() - start} ms` : `Failed: ${JSON.stringify(result)}` });
    } catch (err) {
      results.push({ ok: false, label: "Apps Script answers", detail: String(err.message || err) });
      show();
      setTesting(false);
      return;
    }
    show();
    try {
      const b = await getStartupBundle(url);
      results.push({ ok: (b.rmsRegister || []).length > 0, label: "⚙ RMS Register", detail: `${(b.rmsRegister || []).length} machines` });
      results.push({ ok: (b.spmRegister || []).length > 0, label: "⚙ SPM Register", detail: `${(b.spmRegister || []).length} machines` });
      results.push({ ok: (b.vibPoints || []).length > 0, label: "VIB ID Registry", detail: `${(b.vibPoints || []).length} points` });
      results.push({ ok: !!b.config, label: "Configuration tab", detail: b.config ? "Present" : "Not found" });
    } catch (err) {
      results.push({ ok: false, label: "Reading the sheet", detail: String(err.message || err) });
    }
    show();
    setTesting(false);
  };

  return (
    <div style={{ padding: 20, maxWidth: 860 }} data-testid="vib-settings">
      <div style={{ ...s.card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: T.accent + "1A", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-plug" aria-hidden="true" style={{ fontSize: 18 }} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: T.textPrimary, fontSize: 14 }}>Connection</p>
            <p style={{ margin: 0, fontSize: 12, color: T.textSecondary }}>Version {APP_VERSION} · {syncState?.message || "—"}</p>
          </div>
        </div>

        {/* Read-only: the real value is baked into the build (config.js). */}
        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Apps Script webhook URL</label>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textSecondary, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", wordBreak: "break-all", background: T.codeBg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px" }}>
            {draft.webhookUrl || DEFAULT_WEBHOOK_URL}
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: T.textMuted }}>Baked into the build — not editable here. Use Test connection to check it answers.</p>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Google Sheet URL (for the Open sheet button)</label>
          <input style={s.input} value={draft.googleSheetUrl || ""} onChange={(e) => setDraft((d) => ({ ...d, googleSheetUrl: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/…" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={s.btn} onClick={runTest} disabled={testing} data-testid="vset-test">
            <i className="ti ti-plug" aria-hidden="true" /> {testing ? "Testing…" : "Test connection"}
          </button>
          <button style={s.btn} onClick={onSync}>
            <i className="ti ti-refresh" aria-hidden="true" /> Sync now
          </button>
          {draft.googleSheetUrl && (
            <a href={draft.googleSheetUrl} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <i className="ti ti-external-link" aria-hidden="true" /> Open sheet
            </a>
          )}
          <button style={{ ...s.btnPrimary, marginLeft: "auto" }} onClick={saveConfiguration}>
            <i className="ti ti-device-floppy" aria-hidden="true" /> Save
          </button>
          {saveMessage && <span style={{ fontSize: 12, color: T.success, fontWeight: 700 }}>{saveMessage}</span>}
        </div>
        {testResults && (
          <div style={{ marginTop: 12 }} data-testid="vset-results">
            {testResults.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: i < testResults.length - 1 ? `1px solid ${T.border2}` : "none" }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: r.ok ? T.successBg : T.dangerBg, color: r.ok ? T.success : T.danger, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{r.ok ? "✓" : "✕"}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, wordBreak: "break-all" }}>{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

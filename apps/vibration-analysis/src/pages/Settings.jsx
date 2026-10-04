import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { readAll, saveConfig as saveConfigApi, testConnection } from "../api";
import BackfillButton from "../components/BackfillButton";
import ConfigUnlockModal from "../components/ConfigUnlockModal";
import { APP_VERSION, configStore, DEFAULT_WEBHOOK_URL } from "../config";

// Sub-tabs: Connection and Contractors stay passcode-gated (same
// ConfigUnlockModal as before — this app has no real session/RBAC system
// yet, unlike Oil Lubrication, so unlike that app's own Settings cleanup
// there is no `isAdmin` to replace this with; that's the bigger
// contractor-separation/RBAC build the user has on hold pending a database
// update, not a stale-settings cleanup). System stays open to everyone,
// same as before.
const TABS = [
  { key: "connection", label: "Connection" },
  { key: "contractors", label: "Contractors" },
  { key: "system", label: "System" },
];
const GATED_TABS = new Set(["connection", "contractors"]);

// Settings page: Connection (webhook/sheet URL, test/sync), Contractors
// (contractor list), System (Backfill Last Readings, app info, Apps Script
// setup instructions). Ported from the original's `Hm`, then cut down:
// the "Appearance" tab (logo + theme picker) only ever fed this app's own
// standalone Sidebar/branding — confirmed dead with the user: the
// standalone GitHub Pages build (no login, no Platform Core shell, and a
// different Apps Script backend than this platform's) is an old, unused
// version, so that UI never did anything in production. Theme now lives
// in Platform Core's own Settings page.
export default function Settings({
  webhookUrl,
  setWebhookUrl,
  sheetUrl,
  setSheetUrl,
  themeName,
  onSync,
  config,
  setConfig,
  syncState,
  webhookRef,
}) {
  const { T, s } = useTheme();
  const [tab, setTab] = useState("connection");
  const [unlocked, setUnlocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  // Which gated tab the unlock-prompting click was for — so unlocking
  // actually lands on the tab the user clicked, not wherever they
  // already were. With only one gated tab (the old "Configuration") this
  // didn't matter; splitting it into Connection/Contractors means a
  // locked click's target has to be remembered across the modal.
  const [pendingTab, setPendingTab] = useState(null);
  const [draft, setDraft] = useState({ ...config });
  const [saveMessage, setSaveMessage] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const saveConfiguration = async () => {
    const merged = { ...draft };
    configStore.save(merged);
    setConfig(merged);
    setWebhookUrl(merged.webhookUrl || webhookUrl);
    setSheetUrl(merged.googleSheetUrl || sheetUrl);
    const url = merged.webhookUrl || webhookRef?.current;
    if (url) {
      try {
        await saveConfigApi(url, {
          webhookUrl: merged.webhookUrl || "",
          googleSheetUrl: merged.googleSheetUrl || "",
          contractors: merged.contractors || "",
        });
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
    if (!url) {
      results.push({ ok: false, label: "Webhook URL", detail: "Not configured" });
      setTestResults([...results]);
      setTesting(false);
      return;
    }
    results.push({ ok: true, label: "Webhook URL", detail: url });
    setTestResults([...results]);
    try {
      const start = Date.now();
      const result = await testConnection(url);
      const elapsed = Date.now() - start;
      const ok = result && result.status === "ok";
      results.push({
        ok,
        label: "Connection test",
        detail: ok ? `OK — ${elapsed}ms — ${result.time}` : `Failed: ${JSON.stringify(result)}`,
      });
    } catch (err) {
      results.push({ ok: false, label: "Connection test", detail: String(err.message || err) });
      setTestResults([...results]);
      setTesting(false);
      return;
    }
    setTestResults([...results]);
    try {
      const data = await readAll(url);
      if (data.error) {
        results.push({ ok: false, label: "readAll", detail: data.error });
      } else {
        results.push({ ok: true, label: "readAll — JSON valid", detail: "OK" });
        results.push({ ok: (data.rms || []).length > 0, label: "📥 RMS DATA", detail: `${(data.rms || []).length} rows` });
        results.push({ ok: (data.spm || []).length > 0, label: "📥 SPM DATA", detail: `${(data.spm || []).length} rows` });
        results.push({
          ok: (data.compliance || []).length > 0,
          label: "📋 Compliance",
          detail: `${(data.compliance || []).length} equipment`,
        });
        results.push({ ok: Array.isArray(data.actions), label: "📋 Action Tracker", detail: `${(data.actions || []).length} actions` });
        results.push({
          ok: !!data.config,
          label: "Configuration sheet",
          detail: data.config ? "Present" : "Not found — create it per setup instructions",
        });
      }
    } catch (err) {
      results.push({ ok: false, label: "readAll", detail: String(err.message || err) });
    }
    setTestResults([...results]);
    setTesting(false);
  };

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      {showUnlock && (
        <ConfigUnlockModal
          onUnlock={() => {
            setUnlocked(true);
            setShowUnlock(false);
            if (pendingTab) setTab(pendingTab);
          }}
          onCancel={() => setShowUnlock(false)}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          overflow: "hidden",
          width: "fit-content",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <div
              key={t.key}
              onClick={() => {
                if (GATED_TABS.has(t.key) && !unlocked) {
                  setPendingTab(t.key);
                  setShowUnlock(true);
                  return;
                }
                setTab(t.key);
              }}
              style={{
                padding: "10px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                background: active ? T.accent : "transparent",
                color: active ? T.accentText : T.textSecondary,
                transition: "all 0.15s",
                borderRight: t.key !== "system" ? `1px solid ${T.border}` : "none",
              }}
            >
              {GATED_TABS.has(t.key) ? (unlocked ? t.label : `${t.label} 🔒`) : t.label}
            </div>
          );
        })}
      </div>

      {saveMessage && <div style={{ fontSize: 13, color: T.success, fontWeight: 700, marginBottom: 12 }}>{saveMessage}</div>}

      {tab === "connection" && unlocked && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 12 }}>Connection</div>

            {/* Read-only, not an input: the real value is baked into the
                build (config.js's DEFAULT_WEBHOOK_URL). Letting it be
                hand-edited used to mean a mistyped URL could silently
                desync this device from the real backend with no obvious
                cause; Test Connection is the safe way to check it still
                answers. */}
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Webhook URL (Apps Script /exec URL)</label>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: T.textSecondary,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  background: T.codeBg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: "6px 10px",
                }}
              >
                {draft.webhookUrl || DEFAULT_WEBHOOK_URL}
              </p>
              <p style={{ margin: "5px 0 0", fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
                Baked into the build — not editable here. Use Test Connection to confirm it's reachable.
              </p>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Google Sheet URL (for &quot;Open Sheet&quot; button)</label>
              <input
                style={s.input}
                value={draft.googleSheetUrl || ""}
                onChange={(e) => set("googleSheetUrl", e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={s.btn} onClick={runTest} disabled={testing}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button style={s.btnSecondary} onClick={onSync}>
                Sync Now
              </button>
            </div>
            {testResults && (
              <div style={{ marginTop: 12 }}>
                {testResults.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "6px 0",
                      borderBottom: i < testResults.length - 1 ? `1px solid ${T.border2}` : "none",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        flexShrink: 0,
                        marginTop: 1,
                        background: r.ok ? T.successBg : T.dangerBg,
                        color: r.ok ? T.success : T.danger,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {r.ok ? "✓" : "✕"}
                    </span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, wordBreak: "break-all" }}>{r.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...s.card, marginBottom: 16, borderColor: T.info }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.info, marginBottom: 8 }}>📋 Configuration Sheet Setup</div>
            <div style={{ fontSize: 12.5, color: T.textPrimary, lineHeight: 1.8 }}>
              <b>Create a sheet tab named exactly:</b>{" "}
              <code style={{ background: T.codeBg, color: T.codeText, padding: "1px 6px", borderRadius: 4 }}>Configuration</code>
              <br />
              <b>Row 1:</b> Headers →{" "}
              <code style={{ background: T.codeBg, color: T.codeText, padding: "1px 6px", borderRadius: 4 }}>Key</code> |{" "}
              <code style={{ background: T.codeBg, color: T.codeText, padding: "1px 6px", borderRadius: 4 }}>Value</code>
              <br />
              <b>Row 2+:</b> App will auto-create key-value rows when you save configuration.
              <br />
              Leave it blank — the app will populate it on first save.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <span style={{ fontSize: 12, color: T.success, fontWeight: 700, alignSelf: "center" }}>{saveMessage}</span>
            <button style={s.btn} onClick={saveConfiguration}>
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {tab === "contractors" && unlocked && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 12 }}>Contractors</div>
            <div style={{ marginBottom: 4 }}>
              <label style={s.label}>Contractor List (comma-separated)</label>
              <input
                style={s.input}
                value={draft.contractors || "RHI,ASEC"}
                onChange={(e) => set("contractors", e.target.value)}
                placeholder="RHI,ASEC"
              />
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                Line1/Line2 → first contractor, CM1/CM2 → second contractor (for auto-generate monthly actions)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <span style={{ fontSize: 12, color: T.success, fontWeight: 700, alignSelf: "center" }}>{saveMessage}</span>
            <button style={s.btn} onClick={saveConfiguration}>
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {tab === "system" && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 8 }}>Backfill Last Readings</div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 14, lineHeight: 1.6 }}>
              Scans all RMS &amp; SPM DATA history, finds the latest reading per equipment+point, and writes to the Last Reading sheets. Run
              this after importing historical data or if the Dashboard shows stale readings.
            </div>
            <BackfillButton webhookUrl={webhookUrl} />
          </div>

          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 4 }}>App Info</div>
            <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.8 }}>
              <b>Version:</b> {APP_VERSION}
              <br />
              <b>Theme:</b> {themeName}
              <br />
              <b>Sync Status:</b> {syncState.message}
            </div>
          </div>

          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 8 }}>
              Apps Script v3 — Setup Instructions
            </div>
            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.7, marginBottom: 10 }}>
              1. Open your Google Sheet → <b>Extensions → Apps Script</b>
              <br />
              2. Replace <code style={{ background: T.codeBg, color: T.codeText, padding: "1px 4px", borderRadius: 3 }}>Code.gs</code> with
              the <b>AppsScript_v3.gs</b> file provided
              <br />
              3. <b>Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone</b>
              <br />
              4. Copy the <code>/exec</code> URL → paste in Settings → Connection → Webhook URL
              <br />
              5. After ANY future change: <b>Deploy → Manage deployments → edit → New version → Deploy</b>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 6 }}>New in v3:</div>
            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.7 }}>
              ✓ Action Tracker CRUD (readActions, appendAction, updateAction, deleteAction)
              <br />
              ✓ Email via GmailApp (sendActionEmail)
              <br />
              ✓ Configuration sheet sync (readConfig, saveConfig)
              <br />
              ✓ Compliance auto-update on new reading (updateCompliance)
              <br />✓ Equipment Register editing (namePlate, eqType, line, points, limits via updateRegisterLimits)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { readAll, saveConfig as saveConfigApi, testConnection } from "../api";
import BackfillButton from "../components/BackfillButton";
import ConfigUnlockModal from "../components/ConfigUnlockModal";
import { APP_VERSION, configStore, DEFAULT_WEBHOOK_URL, toDriveDirectUrl } from "../config";
import { THEMES } from "../theme";

const TABS = [
  { key: "appearance", label: "Appearance" },
  { key: "configuration", label: "Configuration" },
  { key: "system", label: "System" },
];

// Settings page: Appearance (logo + one of 8 theme palettes), Configuration
// (passcode-gated: webhook/sheet URL, contractor list, Configuration-sheet
// setup notes), System (Backfill Last Readings, app info, Apps Script setup
// instructions). Ported from the original's `Hm`.
export default function Settings({
  webhookUrl,
  setWebhookUrl,
  sheetUrl,
  setSheetUrl,
  themeName,
  onSync,
  logoUrl,
  setLogoUrl,
  config,
  setConfig,
  syncState,
  webhookRef,
}) {
  const { T, s, setThemeName } = useTheme();
  const [tab, setTab] = useState("appearance");
  const [unlocked, setUnlocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [draft, setDraft] = useState({ ...config });
  const [saveMessage, setSaveMessage] = useState("");
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);
  const [logoInput, setLogoInput] = useState(logoUrl || "");
  const [logoLoads, setLogoLoads] = useState(true);

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

  const saveLogo = () => {
    const direct = toDriveDirectUrl(logoInput);
    configStore.saveLogo(direct);
    setLogoUrl(direct);
    setLogoInput(direct);
    setSaveMessage("✓ Logo saved");
    setTimeout(() => setSaveMessage(""), 2000);
  };

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      {showUnlock && (
        <ConfigUnlockModal
          onUnlock={() => {
            setUnlocked(true);
            setShowUnlock(false);
            setTab("configuration");
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
                if (t.key === "configuration" && !unlocked) {
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
              {t.key === "configuration" ? (unlocked ? t.label : `${t.label} 🔒`) : t.label}
            </div>
          );
        })}
      </div>

      {saveMessage && <div style={{ fontSize: 13, color: T.success, fontWeight: 700, marginBottom: 12 }}>{saveMessage}</div>}

      {tab === "appearance" && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 4 }}>Logo</div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={s.label}>Logo URL (Google Drive direct link)</label>
                <input
                  style={s.input}
                  value={logoInput}
                  onChange={(e) => {
                    setLogoInput(e.target.value);
                    setLogoLoads(true);
                  }}
                  placeholder="https://drive.google.com/uc?export=view&id=…"
                />
              </div>
              <button style={s.btn} onClick={saveLogo}>
                Save Logo
              </button>
            </div>
            {logoInput && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>Preview:</span>
                {logoLoads ? (
                  <img
                    src={toDriveDirectUrl(logoInput)}
                    alt="Logo preview"
                    style={{ height: 40, maxWidth: 200, objectFit: "contain" }}
                    onError={() => setLogoLoads(false)}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: T.danger }}>⚠ Could not load image — ensure the file is publicly shared</span>
                )}
              </div>
            )}
          </div>

          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 12 }}>Theme</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
              {Object.keys(THEMES).map((name) => {
                const palette = THEMES[name];
                const active = name === themeName;
                return (
                  <div
                    key={name}
                    onClick={() => setThemeName(name)}
                    style={{
                      cursor: "pointer",
                      borderRadius: 10,
                      overflow: "hidden",
                      border: `2px solid ${active ? palette.accent : T.border}`,
                      boxShadow: active ? `0 0 0 3px ${palette.accent}33` : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ background: palette.appBg, padding: "8px 8px 5px" }}>
                      <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 4,
                            background: palette.sidebarBg,
                            border: `1px solid ${palette.border}`,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 7, borderRadius: 3, background: palette.accent, marginBottom: 3 }} />
                          <div style={{ height: 5, borderRadius: 3, background: palette.textMuted, opacity: 0.4 }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[palette.success, palette.warning, palette.danger, palette.purple || palette.accent].map((c, i) => (
                          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: c }} />
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        background: palette.cardBg,
                        padding: "6px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: palette.textPrimary }}>{name}</span>
                      {active && (
                        <span
                          style={{
                            width: 13,
                            height: 13,
                            borderRadius: "50%",
                            background: palette.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9,
                            color: palette.accentText,
                            fontWeight: 800,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "configuration" && unlocked && (
        <div>
          <div style={{ ...s.card, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textHighlight, marginBottom: 12 }}>Connection</div>
            <div style={{ marginBottom: 10 }}>
              <label style={s.label}>Webhook URL (Apps Script /exec URL)</label>
              <input
                style={s.input}
                value={draft.webhookUrl || ""}
                onChange={(e) => set("webhookUrl", e.target.value)}
                placeholder={DEFAULT_WEBHOOK_URL}
              />
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
              4. Copy the <code>/exec</code> URL → paste in Settings → Configuration → Webhook URL
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

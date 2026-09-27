import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { backfillLastReadings } from "../api";

// Settings → System → "Run Backfill Now" — ported from the original's `Wm`.
export default function BackfillButton({ webhookUrl }) {
  const { T, s } = useTheme();
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");

  const run = async () => {
    if (!webhookUrl) {
      setMessage("No webhook URL");
      setState("error");
      return;
    }
    setState("loading");
    setMessage("Running backfill — this may take 20-40 seconds…");
    try {
      const result = await backfillLastReadings(webhookUrl);
      if (result && result.status === "ok") {
        setMessage(`✓ Done — ${result.rmsRows} RMS · ${result.spmRows} SPM rows written.`);
        setState("done");
      } else {
        setMessage("Error: " + (result?.error || "unknown"));
        setState("error");
      }
    } catch (err) {
      setMessage("Error: " + String(err.message || err));
      setState("error");
    }
  };

  return (
    <div>
      <button style={{ ...s.btn, opacity: state === "loading" ? 0.6 : 1 }} disabled={state === "loading"} onClick={run}>
        {state === "loading" ? "⏳ Running…" : "▶ Run Backfill Now"}
      </button>
      {message && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            color: state === "done" ? T.success : state === "error" ? T.danger : T.textSecondary,
            fontWeight: 600,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

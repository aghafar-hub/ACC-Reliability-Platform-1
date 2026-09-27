import { useEffect, useRef, useState } from "react";
import { useTheme } from "../ThemeContext";

// Base64 comparison of the literal string "17593" — this is exactly what
// the original does (`btoa(input) === btoa("17593")`), not a real
// credential check: the pass key is trivially recoverable by anyone who
// opens devtools or reads this file. Reproduced as-is; see
// docs/API_CONTRACT.md's "Known gaps" for why this isn't a security
// boundary.
const PASS_KEY_B64 = btoa("17593");

function checkPassKey(input) {
  try {
    return btoa(input) === PASS_KEY_B64;
  } catch {
    return false;
  }
}

// Settings → Configuration lock screen — ported from the original's `Om`.
export default function ConfigUnlockModal({ onUnlock, onCancel }) {
  const { T, s } = useTheme();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (checkPassKey(value)) {
      onUnlock();
    } else {
      setError("Invalid pass key.");
      setValue("");
      setTimeout(() => setError(""), 2500);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div style={{ ...s.card, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.textHighlight }}>Configuration Access</div>
          <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>Enter pass key to unlock settings.</div>
        </div>
        <input
          ref={inputRef}
          type="password"
          style={{ ...s.input, marginBottom: 8, textAlign: "center", fontSize: 18, letterSpacing: 6 }}
          placeholder="•••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 8, textAlign: "center", fontWeight: 600 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...s.btnSecondary, flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button style={{ ...s.btn, flex: 1 }} onClick={submit}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}

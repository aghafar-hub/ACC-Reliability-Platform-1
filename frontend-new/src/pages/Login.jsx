import { useState } from "react";
import { T, s } from "../theme";
import * as api from "../api";
import logo from "../assets/arabian-cement-logo.png";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(email, password);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.appBg,
        fontFamily: "'Inter',sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 340,
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src={logo} alt="Arabian Cement Logo" style={{ width: 160, height: "auto", margin: "0 auto 10px", display: "block" }} />
          <p style={{ fontSize: 11, color: T.textSecondary, margin: 0, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Oil Analysis Management
          </p>
        </div>

        <label style={s.label}>Email</label>
        <input
          style={{ ...s.input, marginBottom: 14 }}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label style={s.label}>Password</label>
        <input
          style={{ ...s.input, marginBottom: 18 }}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && (
          <div style={{ color: T.danger, fontSize: 12, marginBottom: 14, background: T.dangerBg, padding: "8px 10px", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <button type="submit" style={{ ...s.btnPrimary, width: "100%" }} disabled={loading}>
          {loading ? "Logging in…" : "Log In"}
        </button>
      </form>
    </div>
  );
}

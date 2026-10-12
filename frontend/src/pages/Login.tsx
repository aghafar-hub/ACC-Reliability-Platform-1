import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { describeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { SESSION_ENDED_NOTICE_KEY } from '../auth/sessionEnded';
import './Auth.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // shown once: why the person is back on this page (sessionEnded.ts)
  const [notice] = useState<string | null>(() => {
    try {
      const n = sessionStorage.getItem(SESSION_ENDED_NOTICE_KEY);
      if (n) sessionStorage.removeItem(SESSION_ENDED_NOTICE_KEY);
      return n;
    } catch {
      return null;
    }
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, remember);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeError(err, 'Login failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card-wrap">
        <div className="auth-brand">
          <img src={`${import.meta.env.BASE_URL}brand/acc-logo-full.png`} alt="ACC Reliability" className="auth-logo" />
          <p className="auth-tagline">Reliability Platform</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          {notice && (
            <p className="auth-hint" role="status" data-testid="signin-notice">
              {notice}
            </p>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="tap-scale" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">Arabian Cement Company · Sokhna Plant</p>
      </div>
    </div>
  );
}

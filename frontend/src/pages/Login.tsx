import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { describeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { SESSION_ENDED_NOTICE_KEY } from '../auth/sessionEnded';
import AuthLayout, { AuthField, AuthIcon } from './AuthLayout';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [forgot, setForgot] = useState(false);
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
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-eyebrow">ACC Reliability Platform</div>
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to your workspace</p>
        {notice && (
          <p className="auth-notice" role="status" data-testid="signin-notice">
            <AuthIcon name="info" size={18} />
            {notice}
          </p>
        )}
        <AuthField label="Email address" icon="mail" type="email" value={email} onChange={setEmail} autoComplete="username" autoFocus placeholder="you@company.com" />
        <AuthField label="Password" icon="lock" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="auth-row">
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
          <button type="button" className="auth-link" onClick={() => setForgot((f) => !f)} aria-expanded={forgot}>
            Forgot password?
          </button>
        </div>
        {forgot && (
          <p className="auth-notice auth-notice--info" role="note">
            <AuthIcon name="info" size={18} />
            Ask the App Owner to reset your password. You get a temporary one and choose your own at the next sign-in.
          </p>
        )}
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-btn tap-scale" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
          {!submitting && <AuthIcon name="arrow" />}
        </button>
      </form>
    </AuthLayout>
  );
}

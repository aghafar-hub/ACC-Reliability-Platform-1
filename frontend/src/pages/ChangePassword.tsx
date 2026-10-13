import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AuthLayout, { AuthField } from './AuthLayout';

// Same rules as the server (Platform Core Auth.js passwordProblem_).
const MIN_LENGTH = 10;

const STRENGTH = ['', 'Too weak', 'Weak', 'Almost there', 'Strong'];

function initials(email: string) {
  const name = email.split('@')[0] || '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || '?';
}

export default function ChangePassword() {
  const { completeChangePassword, mustChangePassword, claims } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const email = claims?.email || '';
  const emailName = email.split('@')[0].toLowerCase();
  const longEnough = newPassword.length >= MIN_LENGTH;
  const lettersAndNumbers = /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const notEmailName = newPassword.length > 0 && !(emailName && newPassword.toLowerCase().includes(emailName));
  const rules = [
    { ok: longEnough, text: `At least ${MIN_LENGTH} characters` },
    { ok: lettersAndNumbers, text: 'Letters and numbers' },
    { ok: notEmailName, text: 'Not your email name' },
  ];
  const met = rules.filter((r) => r.ok).length;
  // 4th bar: all rules met and a little extra (14+ characters or a symbol)
  const level = !newPassword ? 0 : met === 3 && (newPassword.length >= 14 || /[^A-Za-z0-9]/.test(newPassword)) ? 4 : Math.max(1, met);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!longEnough) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!lettersAndNumbers) {
      setError('Use letters and numbers.');
      return;
    }
    if (!notEmailName) {
      setError('Do not use your email name in the password.');
      return;
    }
    setSubmitting(true);
    try {
      await completeChangePassword(newPassword, mustChangePassword ? undefined : currentPassword);
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeError(err, 'Could not change password.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-eyebrow">ACC Reliability Platform</div>
        <h1>{mustChangePassword ? 'Set your password' : 'Change your password'}</h1>
        <p className="auth-sub">
          {mustChangePassword ? 'First sign-in or a reset: choose your own password to continue' : 'Choose a new password for your account'}
        </p>
        {email && (
          <div className="auth-who">
            <span className="auth-avatar" aria-hidden="true">
              {initials(email)}
            </span>
            <div>
              <b data-no-translate="">{email}</b>
              <span>Your other devices will be signed out</span>
            </div>
          </div>
        )}
        {!mustChangePassword && (
          <AuthField label="Current password" icon="lock" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" autoFocus />
        )}
        <AuthField label="New password" icon="key" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" autoFocus={mustChangePassword} />
        <div className="auth-meter" data-level={level} aria-live="polite">
          <i />
          <i />
          <i />
          <i />
          <span>{STRENGTH[level]}</span>
        </div>
        <ul className="auth-rules" aria-label={`Password rules: at least ${MIN_LENGTH} characters, with letters and numbers`}>
          {rules.map((r) => (
            <li key={r.text} className={r.ok ? 'ok' : ''}>
              <i aria-hidden="true">{r.ok ? '✓' : ''}</i>
              {r.text}
            </li>
          ))}
        </ul>
        <AuthField label="Confirm new password" icon="key" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-btn tap-scale" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save password'}
        </button>
        {!mustChangePassword && (
          <button type="button" className="auth-ghost" onClick={() => navigate(-1)} disabled={submitting}>
            Cancel
          </button>
        )}
      </form>
    </AuthLayout>
  );
}

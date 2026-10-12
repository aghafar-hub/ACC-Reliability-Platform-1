import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import './Auth.css';

// Same rules as the server (Platform Core Auth.js passwordProblem_).
const MIN_LENGTH = 10;

export default function ChangePassword() {
  const { completeChangePassword, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Use letters and numbers.');
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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{mustChangePassword ? 'Set your password' : 'Change your password'}</h1>
        <p className="auth-hint">
          {mustChangePassword
            ? 'This is a first login (or an admin reset) — choose a real password to continue.'
            : 'Your other devices will be signed out.'}{' '}
          At least {MIN_LENGTH} characters, with letters and numbers.
        </p>
        {!mustChangePassword && (
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
        )}
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoFocus={mustChangePassword}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  );
}

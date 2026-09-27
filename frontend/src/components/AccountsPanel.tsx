import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { adminResetPassword, createUser } from '../api/platformCore';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { useOrgUsers } from '../hooks/useOrgUsers';
import './AccountsPanel.css';

// Hardcoded org list — temporary until a real listOrgs endpoint reads
// ORG_MASTER (backend/platform-core/src/Config.js names the sheet but no
// action reads it yet). Matches the 3 orgs named throughout
// docs/requirements-notes.md; add a 4th here if one is ever needed.
const ORGS = [
  { id: 'ORG-ACC', label: 'ACC' },
  { id: 'ORG-RHI', label: 'RHI' },
  { id: 'ORG-ASEC', label: 'ASEC' },
];

function orgLabel(orgId: string): string {
  return ORGS.find((o) => o.id === orgId)?.label ?? orgId;
}

// App Admin only — adds a new account (email + org, per the Foundation
// spec: "App Admin can add any user by email" with a system-generated
// first password) and lets the admin reset any existing account's
// password. Role assignment isn't wired up yet (backend only takes
// email + org today) — a later addition, not in scope for this panel.
export default function AccountsPanel() {
  const { sessionToken, claims } = useAuth();
  const { users, loading, refetch } = useOrgUsers();

  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState(ORGS[0].id);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<{ email: string; tempPassword: string } | null>(null);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);

  if (!claims?.roles.includes(ROLE.ADMIN)) return null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!sessionToken) return;
    setCreateError(null);
    setNewAccount(null);
    setCreating(true);
    try {
      const result = await createUser(sessionToken, email.trim(), orgId);
      setNewAccount(result);
      setEmail('');
      refetch();
    } catch (err) {
      setCreateError(describeError(err, 'Could not create the account.'));
    } finally {
      setCreating(false);
    }
  }

  async function handleReset(userId: string) {
    if (!sessionToken) return;
    setResetError(null);
    setResetResult(null);
    setResettingId(userId);
    try {
      const result = await adminResetPassword(sessionToken, userId);
      setResetResult(result);
    } catch (err) {
      setResetError(describeError(err, 'Could not reset the password.'));
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="accounts-panel">
      <p className="accounts-panel-title">Accounts</p>
      <p className="settings-intro">Add a new account, or reset an existing one's password.</p>

      <form className="accounts-form" onSubmit={handleCreate}>
        <input
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {ORGS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={creating}>
          {creating ? 'Adding…' : 'Add account'}
        </button>
      </form>
      {createError && <p className="auth-error">{createError}</p>}
      {newAccount && (
        <div className="accounts-temp-password">
          <strong>{newAccount.email}</strong> — temporary password: <code>{newAccount.tempPassword}</code>
          <br />
          Share this with them directly — it won't be shown again.
        </div>
      )}

      <table className="accounts-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Org</th>
            <th>Roles</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.userId}>
              <td>{u.email}</td>
              <td>{orgLabel(u.orgId)}</td>
              <td>{u.roles.length ? u.roles.join(', ') : '—'}</td>
              <td>
                <button type="button" onClick={() => handleReset(u.userId)} disabled={resettingId === u.userId}>
                  {resettingId === u.userId ? 'Resetting…' : 'Reset password'}
                </button>
              </td>
            </tr>
          ))}
          {!loading && users.length === 0 && (
            <tr>
              <td colSpan={4}>No accounts yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      {resetError && <p className="auth-error">{resetError}</p>}
      {resetResult && (
        <div className="accounts-temp-password">
          <strong>{resetResult.email}</strong> — new temporary password: <code>{resetResult.tempPassword}</code>
          <br />
          Share this with them directly — it won't be shown again.
        </div>
      )}
    </div>
  );
}

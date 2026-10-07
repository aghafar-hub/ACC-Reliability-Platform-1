import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { adminResetPassword, createUser, setUserRoles, type OrgUser } from '../api/platformCore';
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

// Same reasoning as ORGS above — the ROLE constant already matches the
// live ROLES sheet 1:1 (see backend/platform-core/src/Rbac.js's
// seedRolePermissions_ seeding grants for exactly these role IDs), so
// this reads from that shared constant rather than a separate fetch.
const ROLE_OPTIONS = [
  { id: ROLE.ADMIN, label: 'App Admin' },
  { id: ROLE.RELIABILITY_ENGINEER, label: 'ACC Engineer' },
  { id: ROLE.MANAGER, label: 'ACC Manager' },
  { id: ROLE.CONTRACTOR_MANAGER, label: 'Contractor Manager' },
  { id: ROLE.CONTRACTOR_ENGINEER, label: 'Contractor Engineer' },
  { id: ROLE.TECHNICIAN, label: 'Technician' },
  { id: ROLE.VISITOR, label: 'Visitor (view only)' },
];

// Shows a password/value with a one-click copy button — used below for the
// system-generated temp passwords, which are shown exactly once (see the
// "won't be shown again" copy) so a typo while hand-transcribing one means
// a lockout the admin has to come back and reset again.
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the
      // value is still shown in the <code> next to this button either way.
    }
  }

  return (
    <button type="button" className="accounts-copy-btn" onClick={handleCopy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function orgLabel(orgId: string): string {
  return ORGS.find((o) => o.id === orgId)?.label ?? orgId;
}

function roleLabel(roleId: string): string {
  return ROLE_OPTIONS.find((r) => r.id === roleId)?.label ?? roleId;
}

function toggleRole(current: string[], roleId: string): string[] {
  return current.includes(roleId) ? current.filter((r) => r !== roleId) : [...current, roleId];
}

function RoleCheckboxes({ selected, onChange, idPrefix }: { selected: string[]; onChange: (next: string[]) => void; idPrefix: string }) {
  return (
    <div className="accounts-role-checkboxes">
      {ROLE_OPTIONS.map((r) => (
        <label key={r.id} className="accounts-role-checkbox">
          <input
            type="checkbox"
            id={`${idPrefix}-${r.id}`}
            checked={selected.includes(r.id)}
            onChange={() => onChange(toggleRole(selected, r.id))}
          />
          {r.label}
        </label>
      ))}
    </div>
  );
}

function EditRolesRow({
  user,
  sessionToken,
  onDone,
}: {
  user: OrgUser;
  sessionToken: string;
  onDone: (updated: OrgUser | null) => void;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await setUserRoles(sessionToken, user.userId, roles);
      onDone({ ...user, roles: result.roles });
    } catch (err) {
      setError(describeError(err, 'Could not save roles.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RoleCheckboxes selected={roles} onChange={setRoles} idPrefix={`edit-${user.userId}`} />
      {error && <p className="auth-error">{error}</p>}
      <div className="accounts-role-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => onDone(null)} disabled={saving}>
          Cancel
        </button>
      </div>
    </>
  );
}

// App Admin only — adds a new account (email + org + roles, per the
// Foundation spec: "App Admin can add any user by email" with a
// system-generated first password) and lets the admin reset any existing
// account's password or change their role set.
export default function AccountsPanel() {
  const { sessionToken, claims } = useAuth();
  const { users, loading, refetch } = useOrgUsers();

  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState(ORGS[0].id);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<{ email: string; tempPassword: string } | null>(null);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [editingRolesId, setEditingRolesId] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState<Record<string, OrgUser>>({});

  if (!claims?.roles.includes(ROLE.ADMIN)) return null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!sessionToken) return;
    setCreateError(null);
    setNewAccount(null);
    setCreating(true);
    try {
      const result = await createUser(sessionToken, email.trim(), orgId, newRoles);
      setNewAccount(result);
      setEmail('');
      setNewRoles([]);
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

  const displayUsers = users.map((u) => localUsers[u.userId] ?? u);

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
      <RoleCheckboxes selected={newRoles} onChange={setNewRoles} idPrefix="new" />
      {createError && <p className="auth-error">{createError}</p>}
      {newAccount && (
        <div className="accounts-temp-password">
          <strong>{newAccount.email}</strong> — temporary password: <code>{newAccount.tempPassword}</code>{' '}
          <CopyButton value={newAccount.tempPassword} />
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
          {displayUsers.map((u) => (
            <tr key={u.userId}>
              <td>{u.email}</td>
              <td>{orgLabel(u.orgId)}</td>
              <td>
                {editingRolesId === u.userId ? (
                  sessionToken && (
                    <EditRolesRow
                      user={u}
                      sessionToken={sessionToken}
                      onDone={(updated) => {
                        if (updated) setLocalUsers((prev) => ({ ...prev, [u.userId]: updated }));
                        setEditingRolesId(null);
                      }}
                    />
                  )
                ) : u.roles.length ? (
                  u.roles.map(roleLabel).join(', ')
                ) : (
                  '—'
                )}
              </td>
              <td>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {editingRolesId !== u.userId && (
                    <button type="button" onClick={() => setEditingRolesId(u.userId)}>
                      Edit roles
                    </button>
                  )}
                  <button type="button" onClick={() => handleReset(u.userId)} disabled={resettingId === u.userId}>
                    {resettingId === u.userId ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
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
          <strong>{resetResult.email}</strong> — new temporary password: <code>{resetResult.tempPassword}</code>{' '}
          <CopyButton value={resetResult.tempPassword} />
          <br />
          Share this with them directly — it won't be shown again.
        </div>
      )}
    </div>
  );
}

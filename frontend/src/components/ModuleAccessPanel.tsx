import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ROLE } from '../auth/session';
import { useOrgUsers } from '../hooks/useOrgUsers';
import { MODULE_BACKENDS, moduleGet, modulePost, useModuleAccess, type ModuleStatus, type TabLevel } from '../moduleAccess';
import { OIL_SUB_TABS, VIBRATION_SUB_TABS } from '../navigation';
import './ModuleAccessPanel.css';

// Settings > General > Module Access (App Owner only). Reads and writes each
// module backend's own access settings (backend/*/src/ModuleAccess.js).
// After every change it re-reads the settings from the server and shows
// those, so what's on screen is always what's actually saved.

type Person = { email: string; displayName: string; contractor: string; responsibility: string };
type Config = {
  moduleId: string;
  moduleName: string;
  enforced: boolean;
  statusInfo: { status: ModuleStatus; version: string; releasedDate: string; changedBy: string; changedAt: string };
  tabs: string[];
  roles: { id: string; label: string }[];
  people: Person[];
  roleDefaults: Record<string, Record<string, TabLevel>>;
  userOverrides: Record<string, Record<string, TabLevel>>;
};

const RESP = {
  ACC: 'ACC Responsible Engineer',
  CONTRACTOR: 'Contractor Responsible Engineer',
  TECH: 'Technician',
  MEMBER: 'Member',
} as const;
const CONTRACTORS = [
  { id: 'ASEC', orgId: 'ORG-ASEC' },
  { id: 'RHI', orgId: 'ORG-RHI' },
];
const LEVELS: TabLevel[] = ['Hidden', 'View', 'Edit'];
const ORG_TO_CONTRACTOR: Record<string, string> = { 'ORG-ACC': 'ACC', 'ORG-RHI': 'RHI', 'ORG-ASEC': 'ASEC' };

const TAB_LABELS: Record<string, Record<string, string>> = {
  'oil-analysis': {
    ...Object.fromEntries(OIL_SUB_TABS.map((t) => [t.id, t.label])),
    mywork: 'My Work',
    settings: 'Settings',
  },
  'vibration-analysis': {
    ...Object.fromEntries(VIBRATION_SUB_TABS.map((t) => [t.id, t.label])),
    settings: 'Settings',
  },
};

function tabLabel(moduleId: string, tabId: string) {
  return TAB_LABELS[moduleId]?.[tabId] || tabId;
}

export default function ModuleAccessPanel() {
  const { sessionToken } = useAuth();
  const { refresh: refreshMyAccess } = useModuleAccess();
  const { users } = useOrgUsers();
  const [moduleId, setModuleId] = useState(MODULE_BACKENDS[0].id);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const json = await moduleGet(moduleId, sessionToken, { action: 'getModuleAccessConfig' });
      if (json.error) throw new Error(json.error);
      if (json.moduleId !== moduleId) throw new Error("This module's server hasn't been updated for Module Access yet.");
      setConfig(json as Config);
    } catch (err) {
      setConfig(null);
      setMessage({ kind: 'error', text: (err as Error).message || 'Could not load the settings.' });
    } finally {
      setLoading(false);
    }
  }, [moduleId, sessionToken]);

  useEffect(() => {
    setMessage(null);
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>, okText: string) {
    if (!sessionToken) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await modulePost(moduleId, sessionToken, body);
      if (res.status === 'error') throw new Error(res.message || res.error || 'Not saved.');
      await load();
      void refreshMyAccess();
      setMessage({ kind: 'ok', text: okText });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message || 'Not saved — please try again.' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ma-panel">
      <p className="settings-intro">
        Choose who can open each module, which tabs they see, and who is responsible for it. Alerts go only to the
        responsible engineers listed here.
      </p>

      <div className="settings-subtabs" role="tablist" aria-label="Module">
        {MODULE_BACKENDS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === moduleId}
            className={m.id === moduleId ? 'settings-subtab settings-subtab--active' : 'settings-subtab'}
            onClick={() => setModuleId(m.id)}
          >
            <span>{m.name}</span>
          </button>
        ))}
      </div>

      {message && <div className={`ma-message ma-message--${message.kind}`}>{message.text}</div>}
      {loading && !config && <p className="ma-muted">Loading…</p>}

      {config && (
        <fieldset className="ma-fieldset" disabled={saving}>
          {!config.enforced && (
            <div className="ma-warning">
              Access rules aren't active on this module's server yet (its login secret isn't set), so everyone can still
              open it. You can prepare the lists now; they take effect once the secret is set.
            </div>
          )}
          <StatusCard
            key={`${config.moduleId}|${config.statusInfo.status}|${config.statusInfo.version}|${config.statusInfo.releasedDate}`}
            config={config}
            onSave={save}
          />
          <PeopleCard config={config} users={users} onSave={save} />
          <RoleDefaultsCard config={config} onSave={save} />
          <OverridesCard config={config} onSave={save} />
        </fieldset>
      )}
    </div>
  );
}

type SaveFn = (body: Record<string, unknown>, okText: string) => Promise<void>;

function StatusCard({ config, onSave }: { config: Config; onSave: SaveFn }) {
  const [status, setStatus] = useState<ModuleStatus>(config.statusInfo.status);
  const [version, setVersion] = useState(config.statusInfo.version);
  const [releasedDate, setReleasedDate] = useState(config.statusInfo.releasedDate);

  const changed =
    status !== config.statusInfo.status || version !== config.statusInfo.version || releasedDate !== config.statusInfo.releasedDate;

  return (
    <section className="ma-card">
      <h3>Status and version</h3>
      <div className="ma-status-row">
        {(['Active', 'Maintenance', 'Off'] as ModuleStatus[]).map((s) => (
          <label key={s} className={status === s ? 'ma-status ma-status--on' : 'ma-status'}>
            <input type="radio" name="ma-status" value={s} checked={status === s} onChange={() => setStatus(s)} />
            <strong>{s}</strong>
            <span>
              {s === 'Active' && 'Normal use.'}
              {s === 'Maintenance' && 'Everyone can look, nobody but you can save.'}
              {s === 'Off' && 'Hidden from everyone but you.'}
            </span>
          </label>
        ))}
      </div>
      <div className="ma-inline">
        <label>
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. Phase 1" />
        </label>
        <label>
          Released
          <input type="date" value={releasedDate} onChange={(e) => setReleasedDate(e.target.value)} />
        </label>
        <button
          type="button"
          className="ma-primary"
          disabled={!changed}
          onClick={() => onSave({ action: 'maSetStatus', status, version, releasedDate }, `${config.moduleName} is now ${status}.`)}
        >
          Save status
        </button>
      </div>
      {config.statusInfo.changedAt && (
        <p className="ma-muted">
          Last changed by {config.statusInfo.changedBy || 'unknown'} on {new Date(config.statusInfo.changedAt).toLocaleString()}.
        </p>
      )}
    </section>
  );
}

type OrgUser = { userId: string; email: string; orgId: string; roles: string[] };

function PeopleCard({ config, users, onSave }: { config: Config; users: OrgUser[]; onSave: SaveFn }) {
  const groups: { title: string; hint: string; responsibility: string; contractor: string; orgId: string }[] = [
    { title: 'ACC responsible engineers', hint: 'Get ACC alerts for this module.', responsibility: RESP.ACC, contractor: 'ACC', orgId: 'ORG-ACC' },
    ...CONTRACTORS.map((c) => ({
      title: `${c.id} responsible engineers`,
      hint: `Get ${c.id}'s alerts for this module.`,
      responsibility: RESP.CONTRACTOR,
      contractor: c.id,
      orgId: c.orgId,
    })),
    ...CONTRACTORS.map((c) => ({
      title: `${c.id} technicians`,
      hint: 'Can be assigned work.',
      responsibility: RESP.TECH,
      contractor: c.id,
      orgId: c.orgId,
    })),
  ];

  const members = config.people.filter((p) => p.responsibility === RESP.MEMBER);
  const listedEmails = new Set(config.people.map((p) => p.email));
  const unlisted = users.filter((u) => !listedEmails.has(u.email.toLowerCase()) && !u.roles.includes(ROLE.ADMIN));

  function addEveryone() {
    const people = unlisted.map((u) => {
      const contractor = ORG_TO_CONTRACTOR[u.orgId] || '';
      const techOnly = u.roles.length > 0 && u.roles.every((r) => r === ROLE.TECHNICIAN);
      return {
        email: u.email,
        contractor,
        responsibility: techOnly && contractor && contractor !== 'ACC' ? RESP.TECH : RESP.MEMBER,
      };
    });
    void onSave({ action: 'maAddPeople', people }, `Added ${people.length} people.`);
  }

  return (
    <section className="ma-card">
      <h3>People</h3>
      <p className="ma-muted">
        Anyone listed below can open {config.moduleName}. What they see inside depends on their role (next section). The
        App Owner always has full access.
      </p>
      {unlisted.length > 0 && (
        <div className="ma-callout">
          <span>
            {unlisted.length} account{unlisted.length === 1 ? '' : 's'} can't open {config.moduleName} yet.
          </span>
          <button type="button" onClick={addEveryone}>
            Add them all
          </button>
          <span className="ma-muted">Technician-only accounts are added as technicians, everyone else as a member.</span>
        </div>
      )}
      <div className="ma-groups">
        {groups.map((g) => (
          <PeopleGroup
            key={g.title}
            title={g.title}
            hint={g.hint}
            people={config.people.filter((p) => p.responsibility === g.responsibility && p.contractor === g.contractor)}
            candidates={users.filter((u) => u.orgId === g.orgId)}
            onAdd={(email) =>
              onSave({ action: 'maAddPeople', people: [{ email, contractor: g.contractor, responsibility: g.responsibility }] }, `Added ${email}.`)
            }
            onRemove={(email) => onSave({ action: 'maRemovePerson', email, responsibility: g.responsibility }, `Removed ${email}.`)}
          />
        ))}
        <PeopleGroup
          title="Other people with access"
          hint="Can open the module, no responsibility."
          people={members}
          candidates={users}
          onAdd={(email) => {
            const u = users.find((x) => x.email === email);
            void onSave(
              { action: 'maAddPeople', people: [{ email, contractor: u ? ORG_TO_CONTRACTOR[u.orgId] || '' : '', responsibility: RESP.MEMBER }] },
              `Added ${email}.`,
            );
          }}
          onRemove={(email) => onSave({ action: 'maRemovePerson', email, responsibility: RESP.MEMBER }, `Removed ${email}.`)}
        />
      </div>
    </section>
  );
}

function PeopleGroup({
  title,
  hint,
  people,
  candidates,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  people: Person[];
  candidates: OrgUser[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
}) {
  const [pick, setPick] = useState('');
  const listed = new Set(people.map((p) => p.email));
  const options = candidates.filter((u) => !listed.has(u.email.toLowerCase()));
  return (
    <div className="ma-group">
      <div className="ma-group-head">
        <strong>{title}</strong>
        <span className="ma-muted">{hint}</span>
      </div>
      <ul className="ma-chips">
        {people.length === 0 && <li className="ma-muted">Nobody yet.</li>}
        {people.map((p) => (
          <li key={p.email} className="ma-chip">
            <span>{p.displayName || p.email}</span>
            <button type="button" aria-label={`Remove ${p.email}`} onClick={() => onRemove(p.email)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="ma-add">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Add to ${title}`}>
          <option value="">Choose a person…</option>
          {options.map((u) => (
            <option key={u.userId} value={u.email}>
              {u.email}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            onAdd(pick);
            setPick('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RoleDefaultsCard({ config, onSave }: { config: Config; onSave: SaveFn }) {
  return (
    <section className="ma-card">
      <h3>Tab access by role</h3>
      <p className="ma-muted">What each role sees once added to this module. Hidden tabs disappear from the menu.</p>
      <div className="ma-table-wrap">
        <table className="ma-table">
          <thead>
            <tr>
              <th>Tab</th>
              {config.roles.map((r) => (
                <th key={r.id}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.tabs.map((tabId) => (
              <tr key={tabId}>
                <td>{tabLabel(config.moduleId, tabId)}</td>
                {config.roles.map((r) => {
                  const level = config.roleDefaults[r.id]?.[tabId] || 'Hidden';
                  return (
                    <td key={r.id}>
                      <LevelSelect
                        value={level}
                        label={`${r.label} — ${tabLabel(config.moduleId, tabId)}`}
                        onChange={(next) =>
                          onSave(
                            { action: 'maSetTabLevel', kind: 'Role', key: r.id, tabId, level: next },
                            `${r.label}: ${tabLabel(config.moduleId, tabId)} is now ${next}.`,
                          )
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OverridesCard({ config, onSave }: { config: Config; onSave: SaveFn }) {
  const emails = useMemo(() => Array.from(new Set(config.people.map((p) => p.email))).sort(), [config.people]);
  const [email, setEmail] = useState('');
  const overrides = (email && config.userOverrides[email]) || {};
  const peopleWithOverrides = Object.keys(config.userOverrides).filter((e) => Object.keys(config.userOverrides[e]).length > 0);

  return (
    <section className="ma-card">
      <h3>Exceptions for one person</h3>
      <p className="ma-muted">Give one person a different level than their role's on any tab.</p>
      <div className="ma-inline">
        <label>
          Person
          <select value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Choose a person…</option>
            {emails.map((e) => (
              <option key={e} value={e}>
                {e}
                {peopleWithOverrides.includes(e) ? ' (has exceptions)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {email && (
        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Tab</th>
                <th>For this person</th>
              </tr>
            </thead>
            <tbody>
              {config.tabs.map((tabId) => (
                <tr key={tabId}>
                  <td>{tabLabel(config.moduleId, tabId)}</td>
                  <td>
                    <select
                      value={overrides[tabId] || ''}
                      aria-label={`${email} — ${tabLabel(config.moduleId, tabId)}`}
                      onChange={(e) =>
                        onSave(
                          { action: 'maSetTabLevel', kind: 'User', key: email, tabId, level: e.target.value },
                          e.target.value
                            ? `${email}: ${tabLabel(config.moduleId, tabId)} is now ${e.target.value}.`
                            : `${email}: ${tabLabel(config.moduleId, tabId)} follows their role again.`,
                        )
                      }
                    >
                      <option value="">Same as their role</option>
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LevelSelect({ value, label, onChange }: { value: TabLevel; label: string; onChange: (l: TabLevel) => void }) {
  return (
    <select className={`ma-level ma-level--${value.toLowerCase()}`} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as TabLevel)}>
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

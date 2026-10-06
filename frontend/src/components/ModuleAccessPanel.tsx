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
  const [loadCount, setLoadCount] = useState(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const json = await moduleGet(moduleId, sessionToken, { action: 'getModuleAccessConfig' });
      if (json.error) throw new Error(json.error);
      if (json.moduleId !== moduleId) throw new Error("This module's server hasn't been updated for Module Access yet.");
      setConfig(json as Config);
      setLoadCount((n) => n + 1);
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
          <RoleDefaultsCard key={`roles-${loadCount}`} config={config} onSave={save} />
          <OverridesCard key={`exceptions-${loadCount}`} config={config} onSave={save} />
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
              {s === 'Off' && 'Hidden from everyone, you included. Turn it back on here.'}
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

function cellKey(a: string, b: string) {
  return `${a}|${b}`;
}

function SaveBar({ count, onSave, onDiscard, label }: { count: number; onSave: () => void; onDiscard: () => void; label?: string }) {
  if (count === 0) return null;
  return (
    <div className="ma-savebar">
      <span>
        {count} unsaved change{count === 1 ? '' : 's'}
      </span>
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
      <button type="button" className="ma-primary" onClick={onSave}>
        {label || 'Save changes'}
      </button>
    </div>
  );
}

// Edits collect here and are saved together with one "Save changes".
function RoleDefaultsCard({ config, onSave }: { config: Config; onSave: SaveFn }) {
  const [draft, setDraft] = useState<Record<string, TabLevel>>({});
  const saved = (roleId: string, tabId: string): TabLevel => config.roleDefaults[roleId]?.[tabId] || 'Hidden';

  function change(roleId: string, tabId: string, level: TabLevel) {
    setDraft((d) => {
      const next = { ...d };
      if (level === saved(roleId, tabId)) delete next[cellKey(roleId, tabId)];
      else next[cellKey(roleId, tabId)] = level;
      return next;
    });
  }

  function saveAll() {
    const changes = Object.entries(draft).map(([k, level]) => {
      const [key, tabId] = k.split('|');
      return { kind: 'Role', key, tabId, level };
    });
    void onSave({ action: 'maSetTabLevels', changes }, `Saved ${changes.length} change${changes.length === 1 ? '' : 's'} to role access.`);
  }

  const count = Object.keys(draft).length;
  return (
    <section className="ma-card">
      <h3>Tab access by role</h3>
      <p className="ma-muted">
        What each role sees once added to this module. Hidden tabs disappear from the menu. Make all your changes, then
        press Save changes.
      </p>
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
                  const k = cellKey(r.id, tabId);
                  const value = draft[k] || saved(r.id, tabId);
                  return (
                    <td key={r.id} className={draft[k] ? 'ma-changed' : undefined}>
                      <LevelSelect value={value} label={`${r.label} — ${tabLabel(config.moduleId, tabId)}`} onChange={(next) => change(r.id, tabId, next)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveBar count={count} onSave={saveAll} onDiscard={() => setDraft({})} />
    </section>
  );
}

type ExceptionChoice = '' | 'role' | TabLevel;

// Exceptions: pick any number of people, choose levels for the tabs that
// should differ from their role, save once — applied to everyone picked.
function OverridesCard({ config, onSave }: { config: Config; onSave: SaveFn }) {
  const emails = useMemo(() => Array.from(new Set(config.people.map((p) => p.email))).sort(), [config.people]);
  const withExceptions = Object.keys(config.userOverrides).filter((e) => Object.keys(config.userOverrides[e]).length > 0).sort();
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, ExceptionChoice>>({});
  const [filter, setFilter] = useState('');

  const shown = emails.filter((e) => e.includes(filter.trim().toLowerCase()));
  const single = selected.length === 1 ? selected[0] : null;
  const changedTabs = Object.entries(choices).filter(([, c]) => c !== '');
  const changeCount = changedTabs.length * selected.length;

  function toggle(email: string) {
    setSelected((cur) => (cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email]));
  }

  function describe(email: string) {
    return Object.entries(config.userOverrides[email] || {})
      .map(([tabId, level]) => `${tabLabel(config.moduleId, tabId)}: ${level}`)
      .join(' · ');
  }

  function saveAll() {
    const changes = selected.flatMap((email) =>
      changedTabs.map(([tabId, c]) => ({ kind: 'User', key: email, tabId, level: c === 'role' ? '' : c })),
    );
    void onSave(
      { action: 'maSetTabLevels', changes },
      `Saved exceptions for ${selected.length} ${selected.length === 1 ? 'person' : 'people'}.`,
    );
  }

  function removeAll(email: string) {
    const changes = Object.keys(config.userOverrides[email] || {}).map((tabId) => ({ kind: 'User', key: email, tabId, level: '' }));
    void onSave({ action: 'maSetTabLevels', changes }, `${email} now follows their role again.`);
  }

  return (
    <section className="ma-card">
      <h3>Exceptions</h3>
      <p className="ma-muted">
        Give one or more people a different level than their role's on some tabs. Pick the people, set only the tabs that
        should differ, then save — it applies to everyone you picked.
      </p>

      {withExceptions.length > 0 && (
        <div className="ma-exception-list">
          <strong>People with exceptions now</strong>
          <ul>
            {withExceptions.map((email) => (
              <li key={email}>
                <span className="ma-exception-who">{email}</span>
                <span className="ma-muted">{describe(email)}</span>
                <span className="ma-exception-actions">
                  <button type="button" onClick={() => setSelected([email])}>
                    Edit
                  </button>
                  <button type="button" onClick={() => removeAll(email)}>
                    Remove all
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ma-exception-editor">
        <div className="ma-people-pick">
          <div className="ma-people-pick-head">
            <strong>People ({selected.length} picked)</strong>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            )}
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search…" aria-label="Search people" />
          <ul className="ma-people-list">
            {shown.length === 0 && <li className="ma-muted">Nobody added to this module yet.</li>}
            {shown.map((email) => (
              <li key={email}>
                <label>
                  <input type="checkbox" checked={selected.includes(email)} onChange={() => toggle(email)} />
                  <span>{email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="ma-table-wrap">
          <table className="ma-table">
            <thead>
              <tr>
                <th>Tab</th>
                {single && <th>Now</th>}
                <th>Change to</th>
              </tr>
            </thead>
            <tbody>
              {config.tabs.map((tabId) => {
                const current = single ? config.userOverrides[single]?.[tabId] : undefined;
                return (
                  <tr key={tabId}>
                    <td>{tabLabel(config.moduleId, tabId)}</td>
                    {single && <td className="ma-muted">{current ? `${current} (exception)` : 'Same as role'}</td>}
                    <td className={choices[tabId] ? 'ma-changed' : undefined}>
                      <select
                        value={choices[tabId] || ''}
                        aria-label={`Exception — ${tabLabel(config.moduleId, tabId)}`}
                        onChange={(e) => setChoices((c) => ({ ...c, [tabId]: e.target.value as ExceptionChoice }))}
                      >
                        <option value="">No change</option>
                        <option value="role">Same as their role</option>
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected.length > 0 ? (
        <SaveBar
          count={changeCount}
          onSave={saveAll}
          onDiscard={() => setChoices({})}
          label={`Save for ${selected.length} ${selected.length === 1 ? 'person' : 'people'}`}
        />
      ) : (
        changedTabs.length > 0 && <p className="ma-muted">Pick at least one person to save these exceptions for.</p>
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

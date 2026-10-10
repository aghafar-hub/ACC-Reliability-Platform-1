import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/client';
import { saveSettingsAccess, type SettingsAccess, type SettingsLevel } from '../api/platformCore';
import { useSettingsAccess } from '../settingsAccess';
import { useOrgUsers } from '../hooks/useOrgUsers';
import { TablerIcon } from '../icons';
import IdSearch from './IdSearch';
import './SettingsAccessPanel.css';

// Settings → Settings access (App Owner): which role sees which Settings
// page, plus exceptions for one person. Fixed rules shown with a lock.

const PAGE_LABEL: Record<string, string> = {
  appearance: 'Appearance',
  language: 'Language (word list)',
  delegations: 'My delegations',
  users: 'Users',
  'module-access': 'Module Access',
  'settings-access': 'Settings access',
  'equipment-ids': 'Equipment & IDs',
  email: 'Email & notifications',
  'oil-analysis': 'Oil Lubrication settings',
  'vibration-analysis': 'Vibration Analysis settings',
};
const ROLE_LABEL: Record<string, string> = {
  'ROLE-MGR': 'ACC Manager',
  'ROLE-RENG': 'ACC Engineer',
  'ROLE-CMGR': 'Contractor Manager',
  'ROLE-CENG': 'Contractor Engineer',
  'ROLE-TECH': 'Technician',
  'ROLE-VIEW': 'Visitor',
};
const LEVEL_TEXT: Record<SettingsLevel, string> = { Hidden: 'Hidden', View: 'View', Responsible: 'Edit · responsible', Edit: 'Edit' };

function cycle(page: string, l: SettingsLevel, a: SettingsAccess): SettingsLevel {
  const order: SettingsLevel[] = a.viewMax.includes(page) ? ['Hidden', 'View'] : a.modulePages.includes(page) ? ['Hidden', 'View', 'Responsible', 'Edit'] : ['Hidden', 'View', 'Edit'];
  return order[(order.indexOf(l) + 1) % order.length];
}

export default function SettingsAccessPanel() {
  const { sessionToken } = useAuth();
  const { full, reload } = useSettingsAccess();
  const { users } = useOrgUsers();
  const [matrix, setMatrix] = useState<SettingsAccess['matrix']>(full?.matrix);
  const [people, setPeople] = useState<NonNullable<SettingsAccess['people']>>(full?.people || []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<{ email: string; page: string; level: SettingsLevel } | null>(null);
  useEffect(() => {
    setMatrix(full?.matrix);
    setPeople(full?.people || []);
  }, [full]);

  if (!full) return <p className="sa-muted">Loading…</p>;
  if (!full.matrix) return <p className="sa-muted">Platform Core hasn't been updated for Settings access yet (paste SettingsAccess.js and Code.js).</p>;
  const changed = JSON.stringify(matrix) !== JSON.stringify(full.matrix) || JSON.stringify(people) !== JSON.stringify(full.people || []);

  async function save() {
    if (!sessionToken) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveSettingsAccess(sessionToken, matrix, people);
      await reload();
      setMsg({ ok: true, text: '✓ Saved — everyone sees the change the next time Settings opens.' });
    } catch (e) {
      setMsg({ ok: false, text: describeError(e, 'Not saved — please try again.') });
    } finally {
      setBusy(false);
    }
  }

  const fixed = (page: string) => page === 'appearance' || full.ownerOnly.includes(page);
  const editablePages = full.pages.filter((p) => !fixed(p));
  return (
    <div className="sa-panel" data-testid="settings-access">
      <p className="settings-intro">
        Choose which Settings pages each role can open, and whether they can only <b>view</b> or also <b>edit</b>. The App Owner can always edit everything. Tap a cell to change it.
      </p>
      {msg && <div className={`sa-msg ${msg.ok ? 'sa-msg--ok' : 'sa-msg--error'}`}>{msg.text}</div>}
      <section className="sa-card">
        <div className="sa-head">
          <TablerIcon className="ti-lock-access" size={18} />
          <b>Who sees which settings</b>
          <span className="sa-muted">by role · exceptions for one person below</span>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table" data-testid="sa-matrix">
            <thead>
              <tr>
                <th>Settings page</th>
                <th>App Owner</th>
                {full.roles.map((r) => (
                  <th key={r}>{ROLE_LABEL[r] || r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {full.pages.map((p) => (
                <tr key={p}>
                  <td className="sa-page">{PAGE_LABEL[p] || p}</td>
                  {p === 'appearance' ? (
                    <td colSpan={full.roles.length + 1}>
                      <span className="sa-lvl sa-lvl--Edit">Everyone · always</span> <span title="Fixed">🔒</span>
                    </td>
                  ) : (
                    <>
                      <td>
                        <span className="sa-lvl sa-lvl--Edit">Edit</span>
                        {fixed(p) && <span title="App Owner only"> 🔒</span>}
                      </td>
                      {full.roles.map((r) => {
                        const l = (matrix?.[p]?.[r] || 'Hidden') as SettingsLevel;
                        return (
                          <td key={r}>
                            {fixed(p) ? (
                              <span className="sa-lvl sa-lvl--Hidden">Hidden</span>
                            ) : (
                              <button
                                type="button"
                                className={`sa-lvl sa-lvl--${l} sa-cell`}
                                onClick={() => setMatrix((m) => ({ ...m, [p]: { ...(m?.[p] || {}), [r]: cycle(p, l, full) } }))}
                                data-testid={`sa-${p}-${r}`}
                                title="Tap to change"
                              >
                                {LEVEL_TEXT[l]}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sa-muted sa-foot">
          🔒 fixed: Appearance is open to everyone; Users, Settings access and Email are for the App Owner only; Equipment &amp; IDs can be viewed but only the App Owner changes Equipment IDs. <b>Edit · responsible</b> = edit only for that module's ACC responsible engineer (others with the role can view).
        </p>
      </section>

      <section className="sa-card">
        <div className="sa-head">
          <TablerIcon className="ti-user-exclamation" size={18} />
          <b>Exceptions for one person</b>
          <span className="sa-muted">replace the role's level for that page</span>
          <button type="button" className="sa-btn" style={{ marginInlineStart: 'auto' }} onClick={() => setAdding({ email: '', page: editablePages[0], level: 'View' })} data-testid="sa-add">
            <TablerIcon className="ti-plus" size={14} /> Add exception
          </button>
        </div>
        {adding && (
          <div className="sa-add">
            <div className="sa-add-who">
              <IdSearch options={users.map((u) => ({ code: u.email, description: (u.roles || []).map((x) => ROLE_LABEL[x] || x).join(', ') }))} value={adding.email} onChange={(v) => setAdding({ ...adding, email: v })} placeholder="Person (email)…" testid="sa-add-email" />
            </div>
            <select className="sa-select" value={adding.page} onChange={(e) => setAdding({ ...adding, page: e.target.value, level: 'View' })} data-testid="sa-add-page">
              {editablePages.map((p) => (
                <option key={p} value={p}>
                  {PAGE_LABEL[p]}
                </option>
              ))}
            </select>
            <select className="sa-select" value={adding.level} onChange={(e) => setAdding({ ...adding, level: e.target.value as SettingsLevel })} data-testid="sa-add-level">
              {(full.viewMax.includes(adding.page) ? ['Hidden', 'View'] : ['Hidden', 'View', 'Edit']).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <button
              type="button"
              className="sa-btn sa-btn--primary"
              disabled={!/@/.test(adding.email)}
              onClick={() => {
                setPeople((ps) => [...ps.filter((x) => !(x.email === adding.email.toLowerCase() && x.page === adding.page)), { ...adding, email: adding.email.trim().toLowerCase() }]);
                setAdding(null);
              }}
              data-testid="sa-add-ok"
            >
              Add
            </button>
            <button type="button" className="sa-btn" onClick={() => setAdding(null)}>
              Cancel
            </button>
          </div>
        )}
        {!people.length && !adding && <p className="sa-muted">No exceptions.</p>}
        {!!people.length && (
          <div className="sa-table-wrap">
          <table className="sa-table sa-people">
            <thead>
              <tr>
                <th>Person</th>
                <th>Settings page</th>
                <th>Level</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((x) => (
                <tr key={x.email + x.page}>
                  <td>{x.email}</td>
                  <td>{PAGE_LABEL[x.page] || x.page}</td>
                  <td>
                    <span className={`sa-lvl sa-lvl--${x.level}`}>{LEVEL_TEXT[x.level]}</span>
                  </td>
                  <td>
                    <button type="button" className="sa-link" onClick={() => setPeople((ps) => ps.filter((y) => y !== x))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <div className="sa-savebar">
        <span className="sa-muted">{changed ? 'Changes not saved yet' : 'All saved'}</span>
        <button type="button" className="sa-btn" disabled={!changed || busy} onClick={() => { setMatrix(full.matrix); setPeople(full.people || []); }}>
          Undo
        </button>
        <button type="button" className="sa-btn sa-btn--primary" disabled={!changed || busy} onClick={save} data-testid="sa-save">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

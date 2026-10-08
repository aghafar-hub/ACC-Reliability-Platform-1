import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useOrgUsers } from '../hooks/useOrgUsers';
import { MODULE_BACKENDS, moduleGet, useModuleAccess } from '../moduleAccess';
import { TablerIcon } from '../icons';
import ShellModal, { FormSection } from './ShellModal';
import './DelegationsPanel.css';

// Settings → My delegations. A responsible engineer who will be away hands
// their work in one or more modules to a colleague of the same contractor
// (ACC to ACC); a manager can set it up for them or cover it himself. Each
// module backend keeps its own delegations (backend/*/src/ModuleAccess.js,
// getMyDelegations / maCreateDelegation / maEndDelegation) and checks every
// rule; this page only gathers them and asks.

type Delegation = {
  id: string;
  from: string;
  to: string;
  side: string;
  contractor: string;
  start: string;
  end: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  status: string;
  endedBy: string;
  endedAt: string;
  state: 'Upcoming' | 'Active' | 'Ended' | 'Expired';
};
type Mine = {
  moduleId: string;
  moduleName: string;
  today: string;
  side: string;
  contractor: string;
  listed: boolean;
  manager: boolean;
  admin: boolean;
  covering: { from: string; until: string; id: string }[];
  engineers: { email: string; displayName: string }[];
  delegations: Delegation[];
  nobodyResponsible: string[];
};
type Group = { key: string; d: Delegation; modules: { moduleId: string; moduleName: string; id: string }[] };

const MAX_DAYS = 120;
const ORG_TO_CONTRACTOR: Record<string, string> = { 'ORG-ACC': 'ACC', 'ORG-RHI': 'RHI', 'ORG-ASEC': 'ASEC' };
const ROLE_LABEL: Record<string, string> = {
  'ROLE-RENG': 'ACC Engineer',
  'ROLE-CENG': 'Contractor Engineer',
  'ROLE-MGR': 'ACC Manager',
  'ROLE-CMGR': 'Contractor Manager',
  'ROLE-ADMIN': 'App Owner',
  'ROLE-TECH': 'Technician',
};
const ENGINEER_ROLES = ['ROLE-RENG', 'ROLE-CENG', 'ROLE-MGR', 'ROLE-CMGR', 'ROLE-ADMIN'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(s: string, n: number) {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function days(a: string, b: string) {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5) + 1;
}
function fmt(s: string) {
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
const nameOf = (email: string) => email.split('@')[0];

export default function DelegationsPanel() {
  const { sessionToken, claims } = useAuth();
  const { refresh: refreshAccess } = useModuleAccess();
  const { users } = useOrgUsers();
  const me = (claims?.email || '').toLowerCase();
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [filter, setFilter] = useState<'current' | 'ended' | 'all'>('current');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    const out: Mine[] = [];
    const bad: string[] = [];
    await Promise.all(
      MODULE_BACKENDS.map(async (m) => {
        try {
          const j = await moduleGet(m.id, sessionToken, { action: 'getMyDelegations' });
          if (j && j.status === 'ok' && j.moduleId === m.id) out.push({ ...j, moduleName: m.name });
          else bad.push(m.name);
        } catch {
          bad.push(m.name);
        }
      }),
    );
    out.sort((a, b) => MODULE_BACKENDS.findIndex((m) => m.id === a.moduleId) - MODULE_BACKENDS.findIndex((m) => m.id === b.moduleId));
    setMine(out);
    setFailed(bad);
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  // One row per delegation even when it was made for several modules at once.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    (mine || []).forEach((m) =>
      m.delegations.forEach((d) => {
        const key = [d.from, d.to, d.start, d.end, d.createdBy, d.state, d.reason].join('|');
        const g = map.get(key) || { key, d, modules: [] };
        g.modules.push({ moduleId: m.moduleId, moduleName: m.moduleName, id: d.id });
        map.set(key, g);
      }),
    );
    const order = { Active: 0, Upcoming: 1, Ended: 2, Expired: 3 } as const;
    return [...map.values()].sort((a, b) => order[a.d.state] - order[b.d.state] || (a.d.start < b.d.start ? 1 : -1));
  }, [mine]);
  const shown = groups.filter((g) => (filter === 'all' ? true : filter === 'current' ? g.d.state === 'Active' || g.d.state === 'Upcoming' : g.d.state === 'Ended' || g.d.state === 'Expired'));

  const canCreateIn = (mine || []).filter((m) => m.listed || m.manager || m.admin);
  const isManager = (mine || []).some((m) => m.manager || m.admin);
  const nobody = (mine || []).flatMap((m) => m.nobodyResponsible.map((c) => `${m.moduleName} · ${c}`));
  const myContractor = mine?.[0]?.contractor || ORG_TO_CONTRACTOR[claims?.orgId || ''] || '';

  async function endGroup(g: Group) {
    if (!sessionToken) return;
    setBusy(g.key);
    setMessage(null);
    const errors: string[] = [];
    for (const m of g.modules) {
      try {
        const r = await moduleGet(m.moduleId, sessionToken, { action: 'maEndDelegation', delegationId: m.id }, { attempts: 1 });
        if (r.status !== 'ok') errors.push(`${m.moduleName}: ${r.error || 'not ended'}`);
      } catch {
        errors.push(`${m.moduleName}: no answer from the server`);
      }
    }
    setBusy('');
    setMessage(errors.length ? { kind: 'error', text: errors.join(' · ') } : { kind: 'ok', text: 'Delegation ended. Everyone involved has been told.' });
    await load();
    refreshAccess();
  }

  const canEnd = (g: Group) =>
    (g.d.state === 'Active' || g.d.state === 'Upcoming') &&
    (g.d.from === me || g.d.to === me || g.d.createdBy === me || isManager);

  if (!mine) {
    return (
      <div className="settings-card dl-loading" data-testid="dl-loading">
        Loading your delegations…
      </div>
    );
  }

  return (
    <div className="dl-panel" data-testid="dl-panel">
      {nobody.length > 0 && (
        <div className="dl-callout dl-callout--warn" data-testid="dl-nobody">
          <TablerIcon className="ti-alert-triangle" size={18} />
          <div>
            <strong>Nobody responsible today</strong>
            <span>{nobody.join(' · ')} — add a responsible engineer in Module Access, or cover it yourself with a new delegation.</span>
          </div>
        </div>
      )}
      {failed.length > 0 && <p className="dl-muted">Couldn't reach {failed.join(', ')} — its delegations aren't shown.</p>}

      <div className="settings-card">
        <div className="dl-card-head">
          <div>
            <p className="settings-card-title">Your responsibility</p>
            <p className="settings-intro">Where you get the engineer work in My Work, module by module.</p>
          </div>
          {canCreateIn.length > 0 && (
            <button type="button" className="dl-primary" onClick={() => setCreating(true)} data-testid="dl-new">
              <TablerIcon className="ti-plus" size={15} /> New delegation
            </button>
          )}
        </div>
        <div className="dl-tiles">
          {mine.map((m) => {
            const away = m.delegations.find((d) => d.from === me && d.state === 'Active');
            let tone = 'muted';
            let line = 'Not a responsible engineer here';
            if (m.covering.length) {
              tone = 'info';
              line = 'Covering for ' + m.covering.map((c) => (c.from ? nameOf(c.from) : 'the team') + ' until ' + fmt(c.until)).join(', ');
            } else if (away) {
              tone = 'warn';
              line = `Away — ${nameOf(away.to)} covers until ${fmt(away.end)}`;
            } else if (m.listed) {
              tone = 'ok';
              line = 'Responsible engineer';
            } else if (m.manager || m.admin) {
              line = m.admin ? 'App Owner — not listed as engineer' : 'Manager — not listed as engineer';
            }
            return (
              <div key={m.moduleId} className={`dl-tile dl-tile--${tone}`} data-testid={`dl-tile-${m.moduleId}`}>
                <span className="dl-tile-name">{m.moduleName}</span>
                <span className="dl-tile-line">{line}</span>
                <span className="dl-tile-meta">{m.side === 'ACC' ? 'ACC' : m.contractor}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-card">
        <div className="dl-card-head">
          <div>
            <p className="settings-card-title">Delegations</p>
            <p className="settings-intro">
              {groups.filter((g) => g.d.state === 'Active').length} active · {groups.filter((g) => g.d.state === 'Upcoming').length} upcoming
              {isManager ? ` · ${myContractor === 'ACC' ? 'ACC' : myContractor} team` : ''}
            </p>
          </div>
          <div className="dl-chips" role="group" aria-label="Show">
            {(
              [
                ['current', 'Active & upcoming'],
                ['ended', 'Ended'],
                ['all', 'All'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'dl-chip dl-chip--on' : 'dl-chip'} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {message && <p className={`dl-message dl-message--${message.kind}`}>{message.text}</p>}
        {shown.length === 0 ? (
          <p className="dl-muted" data-testid="dl-empty">
            {filter === 'current' ? 'No delegation in place. When you will be away, start one so your work keeps moving.' : 'Nothing here yet.'}
          </p>
        ) : (
          <ul className="dl-list" data-testid="dl-list">
            {shown.map((g) => (
              <li key={g.key} className="dl-row" data-testid="dl-row">
                <div className="dl-who">
                  <span className="dl-person">{g.d.from ? nameOf(g.d.from) : 'No engineer free'}</span>
                  <TablerIcon className="ti-arrow-right" size={15} />
                  <span className="dl-person">{nameOf(g.d.to)}</span>
                  <span className={`dl-pill dl-pill--${g.d.state.toLowerCase()}`}>{g.d.state}</span>
                </div>
                <div className="dl-meta">
                  <span>
                    <TablerIcon className="ti-calendar" size={13} /> {fmt(g.d.start)} → {fmt(g.d.end)} · {days(g.d.start, g.d.end)} day{days(g.d.start, g.d.end) === 1 ? '' : 's'}
                  </span>
                  <span>{g.modules.map((m) => m.moduleName).join(' + ')}</span>
                  <span>{g.d.side === 'ACC' ? 'ACC' : g.d.contractor}</span>
                </div>
                {g.d.reason && <div className="dl-reason">“{g.d.reason}”</div>}
                <div className="dl-foot">
                  <span className="dl-muted">
                    Set up by {g.d.createdBy === me ? 'you' : nameOf(g.d.createdBy)}
                    {g.d.endedBy ? ` · ended by ${g.d.endedBy === me ? 'you' : nameOf(g.d.endedBy)}` : ''}
                  </span>
                  {canEnd(g) && (
                    <button type="button" className="dl-secondary" disabled={busy === g.key} onClick={() => endGroup(g)} data-testid="dl-end">
                      {busy === g.key ? 'Ending…' : g.d.state === 'Upcoming' ? 'Cancel' : 'End now'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <NewDelegation
          me={me}
          orgId={claims?.orgId || ''}
          modules={canCreateIn}
          users={users}
          onClose={() => setCreating(false)}
          onDone={async (text) => {
            setCreating(false);
            setMessage({ kind: 'ok', text });
            setFilter('current');
            await load();
            refreshAccess();
          }}
        />
      )}
    </div>
  );
}

function NewDelegation({
  me,
  orgId,
  modules,
  users,
  onClose,
  onDone,
}: {
  me: string;
  orgId: string;
  modules: Mine[];
  users: { email: string; orgId: string; roles: string[] }[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { sessionToken } = useAuth();
  const today = modules[0]?.today || ymd(new Date());
  const manager = modules.some((m) => m.manager || m.admin);
  // start with the modules you're listed in (a manager who isn't: all of them)
  const [picked, setPicked] = useState<string[]>(() => {
    const listed = modules.filter((m) => m.listed).map((m) => m.moduleId);
    return listed.length ? listed : modules.map((m) => m.moduleId);
  });
  const [from, setFrom] = useState<string>(modules.some((m) => m.listed) ? me : '');
  const [to, setTo] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const sel = modules.filter((m) => picked.includes(m.moduleId));
  // engineers who can be away: me (if listed) or, for a manager, anyone listed in the picked modules
  const engineers = useMemo(() => {
    const set = new Map<string, string>();
    sel.forEach((m) => m.engineers.forEach((e) => (manager || e.email === me) && set.set(e.email, e.displayName || nameOf(e.email))));
    return [...set.entries()];
  }, [sel, manager, me]);
  const selfCover = manager && from === '__none__';
  // the colleague: same organisation (= same contractor; ACC with ACC), an engineer or manager
  const away = new Set(
    sel.flatMap((m) => m.delegations.filter((d) => (d.state === 'Active' || d.state === 'Upcoming') && d.start <= end && d.end >= start).map((d) => d.from)),
  );
  const colleagues = users
    .filter((u) => u.orgId === orgId && u.email.toLowerCase() !== from && u.roles.some((r) => ENGINEER_ROLES.includes(r)))
    .map((u) => ({ email: u.email.toLowerCase(), roles: u.roles, away: away.has(u.email.toLowerCase()) }))
    .sort((a, b) => a.email.localeCompare(b.email));
  const toValue = selfCover ? me : to;
  const length = days(start, end);
  const problem = !sel.length
    ? 'Pick at least one module.'
    : !from
      ? manager
        ? 'Pick who is away.'
        : ''
      : !toValue
        ? 'Pick the colleague who will cover.'
        : !start || !end
          ? 'Give the dates.'
          : end < start
            ? 'The end date is before the start date.'
            : end < today
              ? 'The end date is in the past.'
              : length > MAX_DAYS + 1
                ? `A delegation can last up to ${MAX_DAYS} days.`
                : '';

  async function save() {
    if (!sessionToken || problem) return;
    setSaving(true);
    setErrors([]);
    const errs: string[] = [];
    const okNames: string[] = [];
    for (const m of sel) {
      const params: Record<string, string> = { action: 'maCreateDelegation', to: toValue, startDate: start, endDate: end, reason };
      if (selfCover) params.from = '';
      else if (from !== me) params.from = from;
      try {
        const r = await moduleGet(m.moduleId, sessionToken, params, { attempts: 1 });
        if (r.status === 'ok') okNames.push(m.moduleName);
        else errs.push(`${m.moduleName}: ${r.error || 'not saved'}`);
      } catch {
        errs.push(`${m.moduleName}: no answer from the server — check the list before trying again.`);
      }
    }
    setSaving(false);
    if (errs.length && !okNames.length) {
      setErrors(errs);
      return;
    }
    onDone(
      `Delegation started for ${okNames.join(' + ')}. ${nameOf(toValue)}, the managers and ACC have been told.` + (errs.length ? ` Not saved: ${errs.join(' · ')}` : ''),
    );
  }

  return (
    <ShellModal
      icon="user-check"
      title="New delegation"
      subtitle={manager ? "Hand an engineer's work to a colleague — or cover it yourself when nobody is free" : 'Hand your work to a colleague while you are away'}
      onClose={onClose}
      testid="dl-modal"
      footer={
        <>
          {problem && <span className="dl-muted dl-problem">{problem}</span>}
          <button type="button" className="dl-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="dl-primary" disabled={!!problem || saving} onClick={save} data-testid="dl-save">
            {saving ? 'Starting…' : 'Start delegation'}
          </button>
        </>
      }
    >
      <FormSection icon="category" title="Modules" hint="The work that moves to your colleague">
        <div className="dl-chips">
          {modules.map((m) => {
            const on = picked.includes(m.moduleId);
            return (
              <button
                key={m.moduleId}
                type="button"
                className={on ? 'dl-chip dl-chip--on' : 'dl-chip'}
                aria-pressed={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.moduleId) : [...p, m.moduleId]))}
              >
                {on && <TablerIcon className="ti-check" size={13} />} {m.moduleName}
              </button>
            );
          })}
        </div>
      </FormSection>

      <FormSection icon="user" title="Who is away">
        {manager ? (
          <select className="dl-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="dl-from">
            <option value="">Pick the engineer…</option>
            {engineers.map(([email, name]) => (
              <option key={email} value={email}>
                {email === me ? `Me (${name})` : `${name} — ${email}`}
              </option>
            ))}
            <option value="__none__">No engineer free — I'll cover the work myself</option>
          </select>
        ) : (
          <div className="dl-read">You ({me})</div>
        )}
      </FormSection>

      <FormSection icon="users" title="Who covers" hint="Same company only · must already have a platform account">
        {selfCover ? (
          <div className="dl-read">You ({me}) — you'll get the engineer work in My Work and can approve and close.</div>
        ) : (
          <div className="dl-people" data-testid="dl-colleagues">
            {colleagues.length === 0 && <p className="dl-muted">No colleague with an engineer or manager account in your company yet — ask the App Owner to add one.</p>}
            {colleagues.map((c) => (
              <label key={c.email} className={`dl-person-opt${to === c.email ? ' dl-person-opt--on' : ''}${c.away ? ' dl-person-opt--away' : ''}`}>
                <input type="radio" name="dl-to" value={c.email} checked={to === c.email} disabled={c.away} onChange={() => setTo(c.email)} />
                <span className="dl-person-name">
                  {nameOf(c.email)}
                  {c.email === me ? ' (me)' : ''}
                </span>
                <span className="dl-person-sub">
                  {c.away ? 'Away on these dates' : c.roles.map((r) => ROLE_LABEL[r]).filter(Boolean).join(', ') || c.email}
                </span>
              </label>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection icon="calendar" title="Dates" hint={`Up to ${MAX_DAYS} days · you can end it early`}>
        <div className="dl-dates">
          <label>
            From
            <input className="dl-input" type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} data-testid="dl-start" />
          </label>
          <label>
            Until (included)
            <input className="dl-input" type="date" value={end} min={start || today} onChange={(e) => setEnd(e.target.value)} data-testid="dl-end-date" />
          </label>
          <label className="dl-reason-field">
            Reason (optional)
            <input className="dl-input" type="text" value={reason} maxLength={120} placeholder="Annual leave, training, site visit…" onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      </FormSection>

      {!problem && (
        <div className="dl-summary" data-testid="dl-summary">
          <TablerIcon className="ti-info-circle" size={16} />
          <span>
            {selfCover ? 'You cover' : <>{from === me ? 'Your' : `${nameOf(from)}'s`} work in </>}
            {selfCover ? ' the ' : ''}
            <strong>{sel.map((m) => m.moduleName).join(' + ')}</strong>
            {selfCover ? ' engineer work' : <> goes to <strong>{nameOf(toValue)}</strong></>} from <strong>{fmt(start)}</strong> to <strong>{fmt(end)}</strong> ({length} day
            {length === 1 ? '' : 's'}). {selfCover ? 'You' : 'They'} can approve and close. The managers, ACC managers and ACC engineers are told when it starts and ends.
          </span>
        </div>
      )}
      {errors.length > 0 && (
        <div className="dl-message dl-message--error" data-testid="dl-errors">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
    </ShellModal>
  );
}

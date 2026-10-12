import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/client';
import { listLoginHistory, listPresence, type LoginEntry, type PresenceList, type PresenceUser } from '../api/platformCore';
import '../pages/Activity.css';
import './WhoIsOnline.css';

// Settings → Who's online (App Owner + ACC managers; Platform Core
// Presence.js checks it too): who has the app open now, on which page and
// device, and the sign-in history.

const ORG: Record<string, string> = { 'ORG-ACC': 'ACC', 'ORG-RHI': 'RHI', 'ORG-ASEC': 'ASEC' };
const ROLE_LABEL: Record<string, string> = {
  'ROLE-ADMIN': 'App Owner',
  'ROLE-MGR': 'ACC Manager',
  'ROLE-RENG': 'ACC Engineer',
  'ROLE-CMGR': 'Contractor Manager',
  'ROLE-CENG': 'Contractor Engineer',
  'ROLE-TECH': 'Technician',
  'ROLE-VIEW': 'Visitor',
};
const STATUS: Record<PresenceUser['status'], { label: string; symbol: string }> = {
  online: { label: 'Online now', symbol: '●' },
  idle: { label: 'Idle', symbol: '◐' },
  today: { label: 'Earlier today', symbol: '○' },
  offline: { label: 'Not today', symbol: '·' },
};
const EVENTS = ['Signed in', 'Opened the app', 'Signed out', 'Failed sign-in'];
const RANGES = [
  { id: 1, label: 'Today' },
  { id: 7, label: 'Last 7 days' },
  { id: 30, label: 'Last 30 days' },
  { id: 90, label: 'Last 3 months' },
];

const orgOf = (orgId: string) => ORG[orgId] || orgId || '—';
const rolesOf = (roles: string[]) => roles.map((r) => ROLE_LABEL[r] || r).join(', ') || '—';

function ago(iso: string, nowMs: number): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const s = Math.max(0, (nowMs - t) / 1000);
  if (s < 90) return 'now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const d = new Date(t);
  const today = new Date(nowMs);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 1) return `yesterday ${time}`;
  return days < 30 ? `${days} days ago` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function WhoIsOnlinePanel() {
  const { sessionToken } = useAuth();
  const [view, setView] = useState<'now' | 'history'>('now');
  const [data, setData] = useState<PresenceList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState('');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      setData(await listPresence(sessionToken));
      setError('');
    } catch (err) {
      setError(describeError(err, "Who's online couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  // fresh every minute while this page is in view
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const nowMs = data ? new Date(data.now).getTime() : Date.now();
  const users = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.users || []).filter((u) => (!org || orgOf(u.orgId) === org) && (!t || u.email.toLowerCase().includes(t)));
  }, [data, org, q]);
  const count = (st: PresenceUser['status']) => (data?.users || []).filter((u) => u.status === st).length;
  const order: PresenceUser['status'][] = ['online', 'idle', 'today', 'offline'];
  const groups = order.map((st) => ({
    st,
    items: users.filter((u) => u.status === st).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')),
  }));

  return (
    <div className="who-page" data-testid="who-online">
      <div className="act-tiles">
        <div className="act-tile who-tile--online">
          <span>Online now</span>
          <b data-testid="who-online-count">{data ? count('online') : '…'}</b>
          <small>using the app</small>
        </div>
        <div className="act-tile who-tile--idle">
          <span>Idle</span>
          <b data-testid="who-idle-count">{data ? count('idle') : '…'}</b>
          <small>app open, not in use</small>
        </div>
        <div className="act-tile who-tile--today">
          <span>Earlier today</span>
          <b data-testid="who-today-count">{data ? count('today') : '…'}</b>
          <small>used it today</small>
        </div>
        <div className="act-tile act-tile--platform">
          <span>Accounts</span>
          <b>{data ? data.users.length : '…'}</b>
          <small>active</small>
        </div>
      </div>

      <div className="who-tabs" role="group" aria-label="View">
        {(
          [
            ['now', "Who's online"],
            ['history', 'Login history'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} className={view === id ? 'who-tab who-tab--on' : 'who-tab'} onClick={() => setView(id)} data-testid={`who-tab-${id}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'now' && (
        <section className="act-card">
          <div className="act-filters">
            <input className="act-select who-search" placeholder="Search a person…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a person" />
            <span className="act-chips" role="group" aria-label="Company">
              {['', 'ACC', 'RHI', 'ASEC'].map((c) => (
                <button key={c || 'all'} type="button" className={org === c ? 'act-chip act-chip--on' : 'act-chip'} onClick={() => setOrg(c)} data-testid={`who-org-${c || 'all'}`}>
                  {c || 'Everyone'}
                </button>
              ))}
            </span>
            <span className="who-updated">
              {data ? `Updated ${timeOf(data.now)}` : ''}
              <button type="button" className="act-btn" onClick={load} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </span>
          </div>
          {error && <p className="act-warn">{error}</p>}
          {groups.map(({ st, items }) => {
            if (!items.length) return null;
            const shown = st === 'offline' && !showAll ? [] : items;
            return (
              <div key={st} className="act-day" data-testid={`who-group-${st}`}>
                <div className="act-day-label">
                  {STATUS[st].label} · {items.length}
                  {st === 'offline' && (
                    <button type="button" className="who-link" onClick={() => setShowAll((x) => !x)}>
                      {showAll ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
                {shown.map((u) => (
                  <div key={u.userId} className="act-row" data-testid={`who-row-${u.email}`}>
                    <span className={`who-dot who-dot--${u.status}`} aria-hidden="true">{STATUS[u.status].symbol}</span>
                    <span className="act-main">
                      <span className="act-title">{u.email}</span>
                      <span className="act-meta">
                        <span className="who-org">{orgOf(u.orgId)}</span>
                        <span>{rolesOf(u.roles)}</span>
                        {(u.module || u.page) && (u.status === 'online' || u.status === 'idle') && <span>· {[u.module, u.page].filter(Boolean).join(' › ')}</span>}
                      </span>
                    </span>
                    <span className="who-right">
                      <span className="who-when">{u.status === 'online' ? 'now' : ago(u.lastSeen, nowMs)}</span>
                      {u.device && <span className="who-device">{u.device}</span>}
                      {u.firstToday && u.status !== 'offline' && <span className="who-device">since {timeOf(u.firstToday)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          {data && !users.length && <p className="act-muted">Nobody matches.</p>}
          <p className="who-note">
            Online = used the app in the last 3 minutes. Idle = the app is open but untouched, or it was closed in the last 15 minutes. The page shown is the module and page open,
            never what is typed.
          </p>
        </section>
      )}

      {view === 'history' && <LoginHistory />}
    </div>
  );
}

function LoginHistory() {
  const { sessionToken } = useAuth();
  const [days, setDays] = useState(7);
  const [entries, setEntries] = useState<LoginEntry[] | null>(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const [event, setEvent] = useState('');

  useEffect(() => {
    if (!sessionToken) return;
    let gone = false;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    setEntries(null);
    listLoginHistory(sessionToken, from.toISOString())
      .then((r) => !gone && (setEntries(r.entries), setError('')))
      .catch((err) => !gone && setError(describeError(err, "The login history couldn't be loaded.")));
    return () => {
      gone = true;
    };
  }, [sessionToken, days]);

  const all = useMemo(() => entries || [], [entries]);
  const people = useMemo(() => [...new Set(all.map((e) => e.email).filter(Boolean))].sort(), [all]);
  const shown = all.filter((e) => (!person || e.email === person) && (!event || e.event === event));
  const perPerson = useMemo(() => {
    const m = new Map<string, { email: string; org: string; days: Set<string>; signIns: number; failed: number; last: string }>();
    all.forEach((e) => {
      if (!e.email) return;
      const p = m.get(e.email) || { email: e.email, org: orgOf(e.orgId), days: new Set<string>(), signIns: 0, failed: 0, last: '' };
      if (e.event === 'Failed sign-in') p.failed++;
      else {
        p.days.add(new Date(e.at).toDateString());
        if (e.event === 'Signed in') p.signIns++;
        if (!p.last || e.at > p.last) p.last = e.at;
      }
      if (p.org === '—' && e.orgId) p.org = orgOf(e.orgId);
      m.set(e.email, p);
    });
    return [...m.values()].sort((a, b) => b.days.size - a.days.size || a.email.localeCompare(b.email));
  }, [all]);

  const groups: { day: string; items: LoginEntry[] }[] = [];
  shown.slice(0, 500).forEach((e) => {
    const k = new Date(e.at).toDateString();
    if (!groups.length || groups[groups.length - 1].day !== k) groups.push({ day: k, items: [] });
    groups[groups.length - 1].items.push(e);
  });

  function exportCsv() {
    const cell = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const rows = [['When', 'Person', 'Company', 'Event', 'Device', 'Details'], ...shown.map((e) => [e.at, e.email, orgOf(e.orgId), e.event, e.device, e.details])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `login-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const failed = all.filter((e) => e.event === 'Failed sign-in').length;
  return (
    <>
      <section className="act-card who-summary" data-testid="who-history-summary">
        <div className="act-filters">
          <select className="act-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" data-testid="who-range">
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="who-updated">
            {entries ? `${perPerson.filter((p) => p.days.size).length} people used the app · ${failed} failed sign-in${failed === 1 ? '' : 's'}` : 'Loading…'}
          </span>
        </div>
        {error && <p className="act-warn">{error}</p>}
        {perPerson.length > 0 && (
          <div className="who-table-box">
            <table className="who-table" data-phone-cards="">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Company</th>
                  <th>Days used</th>
                  <th>Sign-ins</th>
                  <th>Failed</th>
                  <th>Last used</th>
                </tr>
              </thead>
              <tbody>
                {perPerson.map((p) => (
                  <tr key={p.email} onClick={() => setPerson(p.email)} className="who-click" title="Show this person's history">
                    <td>{p.email}</td>
                    <td>{p.org}</td>
                    <td>{p.days.size}</td>
                    <td>{p.signIns}</td>
                    <td className={p.failed ? 'who-bad' : ''}>{p.failed}</td>
                    <td>{p.last ? ago(p.last, Date.now()) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="act-card" style={{ marginTop: 12 }}>
        <div className="act-filters">
          <select className="act-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" data-testid="who-person">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="act-chips" role="group" aria-label="Event">
            {['', ...EVENTS].map((ev) => (
              <button key={ev || 'all'} type="button" className={event === ev ? 'act-chip act-chip--on' : 'act-chip'} onClick={() => setEvent(ev)}>
                {ev || 'All'}
              </button>
            ))}
          </span>
          <button type="button" className="act-btn" onClick={exportCsv} disabled={!shown.length}>
            Export CSV
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.day} className="act-day">
            <div className="act-day-label">{new Date(g.day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            {g.items.map((e, i) => (
              <div key={e.at + e.email + i} className="act-row" data-testid="who-history-row">
                <span className="act-time">{timeOf(e.at)}</span>
                <span className={`who-event who-event--${e.event.replace(/\W+/g, '-').toLowerCase()}`}>{e.event}</span>
                <span className="act-main">
                  <span className="act-title">{e.email || '—'}</span>
                  <span className="act-meta">
                    <span className="who-org">{orgOf(e.orgId)}</span>
                    {e.device && <span>{e.device}</span>}
                    {e.details && <span>· {e.details}</span>}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
        {entries && !shown.length && <p className="act-muted">Nothing in this period.</p>}
      </section>
    </>
  );
}

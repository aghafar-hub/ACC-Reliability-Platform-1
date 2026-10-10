import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchTeamHistory, type TeamHistory, type TeamPerson } from '../myWork';
import TeamTab from '../components/TeamTab';
import '../components/TeamTab.css';
import './Team.css';

// Team (step 5): work waiting and done across every module — replaces Oil's
// Team Workload and My Work → My team. Each module's getTeamHistory
// (ModuleAccess.js maTeamHistory_ + TeamHistory.js) decides what this person
// may see: App Owner, ACC managers and ACC engineers everyone; a contractor
// manager their own contractor; a contractor's responsible engineer their own
// technicians. Shown as workload, not as a ranking.

type Period = 'week' | 'month' | 'quarter';
const PERIODS: [Period, string][] = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['quarter', '3 months'],
];
const MODULES = [
  { id: 'oil-analysis', label: 'Oil', what: 'routes · actions · lab' },
  { id: 'vibration-analysis', label: 'Vibration', what: 'reports · routes · actions' },
];
const CONTRACTORS = ['RHI', 'ASEC'];
const SITES: Record<string, string> = { RHI: 'Line 1 · Line 2', ASEC: 'Cement mills' };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function range(p: Period): [string, string] {
  const now = new Date();
  if (p === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return [ymd(d), ymd(now)];
  }
  if (p === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now)];
  return [ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), ymd(now)];
}
const nameOf = (p: TeamPerson) => p.name || p.email;

function Share({ part, whole }: { part: number; whole: number }) {
  const pct = whole ? Math.min(100, Math.round((part / whole) * 100)) : 0;
  return (
    <span className="tp-bar" title={whole ? `${pct}% overdue` : 'nothing open'}>
      <span className="tp-bar-fill tp-bar-fill--danger" style={{ width: `${pct}%` }} />
    </span>
  );
}

export default function Team() {
  const { sessionToken } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [contractor, setContractor] = useState('');
  const [mods, setMods] = useState<string[]>([]);
  const [tab, setTab] = useState<'contractors' | 'people' | 'history'>('contractors');
  const [data, setData] = useState<TeamHistory | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setData(null);
    const [from, to] = range(period);
    fetchTeamHistory(sessionToken, from, to).then(
      (h) => !cancelled && setData(h),
      (e) => !cancelled && setError(String((e as Error).message || e)),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionToken, period]);

  const scoped = data && data.scope && data.scope !== 'all' ? data.scope : '';
  const techOnly = !!data?.techOnly;
  const conOk = (c: string) => !contractor || c === contractor;
  const modOk = (m: string) => !mods.length || mods.includes(m);
  const teams = useMemo(() => (data?.teams || []).filter((t) => modOk(t.moduleId)), [data, mods]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => (data?.events || []).filter((e) => modOk(e.moduleId) && conOk(e.home || e.contractor)), [data, mods, contractor]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(
    () =>
      (data?.people || [])
        .filter((p) => conOk(p.contractor))
        .map((p) => {
          const oil = p.openBy?.['oil-analysis'] || 0;
          const vib = p.openBy?.['vibration-analysis'] || 0;
          const open = (!mods.length || mods.includes('oil-analysis') ? oil : 0) + (!mods.length || mods.includes('vibration-analysis') ? vib : 0);
          const done = events.filter((e) => e.who === p.email).length;
          return { p, oil, vib, open, done };
        })
        .sort((a, b) => b.open + b.p.overdue - (a.open + a.p.overdue) || nameOf(a.p).localeCompare(nameOf(b.p))),
    [data, events, mods, contractor], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const contractorTeams = teams.filter((t) => t.contractor !== 'ACC' && conOk(t.contractor));
  const sum = (k: 'open' | 'overdue') => contractorTeams.reduce((n, t) => n + (t[k] || 0), 0);
  const openAll = sum('open');
  const overdueAll = sum('overdue');
  const waitingAcc = teams.filter((t) => t.contractor === 'ACC').reduce((n, t) => n + t.waiting, 0);
  const engineers = people.filter((x) => x.p.kind === 'engineer').length;
  const techs = people.filter((x) => x.p.kind === 'technician').length;
  const maxLoad = Math.max(1, ...people.map((x) => x.open));
  const shownContractors = (scoped ? [scoped] : CONTRACTORS).filter(conOk);
  const periodLabel = PERIODS.find((x) => x[0] === period)?.[1].toLowerCase();
  const chip = (on: boolean) => (on ? 'tp-chip tp-chip--on' : 'tp-chip');

  return (
    <div className="tp-page" data-testid="team-page">
      <h1>Team</h1>
      <p className="tp-sub">
        Work waiting and done, across all modules · {periodLabel}
        {scoped ? ` · ${scoped}` : ''}
        {techOnly ? ' · technicians' : ''}
      </p>

      <div className="tp-filters">
        {!scoped && (
          <span className="tp-chips" role="group" aria-label="Contractor">
            {['', ...CONTRACTORS].map((c) => (
              <button key={c || 'all'} type="button" className={chip(contractor === c)} onClick={() => setContractor(c)} data-testid={`tp-con-${c || 'all'}`}>
                {c || 'All contractors'}
              </button>
            ))}
          </span>
        )}
        <span className="tp-chips" role="group" aria-label="Module">
          <button type="button" className={chip(!mods.length)} onClick={() => setMods([])}>All modules</button>
          {MODULES.map((m) => (
            <button key={m.id} type="button" className={chip(mods.includes(m.id))} onClick={() => setMods((x) => (x.includes(m.id) ? x.filter((y) => y !== m.id) : [...x, m.id]))} data-testid={`tp-mod-${m.label}`}>
              {m.label}
            </button>
          ))}
        </span>
        <span className="tp-chips" role="group" aria-label="Period">
          {PERIODS.map(([id, label]) => (
            <button key={id} type="button" className={chip(period === id)} onClick={() => setPeriod(id)} data-testid={`tp-period-${id}`}>
              {label}
            </button>
          ))}
        </span>
      </div>

      {error && <div className="tp-warn">{error}</div>}
      {data && data.failed.length > 0 && <div className="tp-warn">Not shown: {data.failed.join(', ')} (couldn't reach the module)</div>}
      {data && !data.people.length && !data.teams.length && !data.failed.length && (
        <div className="tp-warn" data-testid="tp-none">Nothing to show — the Team page is for managers, ACC engineers and responsible engineers.</div>
      )}

      <div className="tp-tiles">
        {!techOnly && (
          <div className="tp-tile tp-tile--accent">
            <span>Open work</span>
            <b data-testid="tp-open">{data ? openAll : '…'}</b>
            <small>routes, actions, reports</small>
          </div>
        )}
        {!techOnly && (
          <div className="tp-tile tp-tile--danger">
            <span>Overdue</span>
            <b className="tp-danger" data-testid="tp-overdue">{data ? overdueAll : '…'}</b>
            <small>{openAll ? `${Math.round((overdueAll / openAll) * 100)}% of open` : '—'}</small>
          </div>
        )}
        <div className="tp-tile tp-tile--success">
          <span>Done {periodLabel}</span>
          <b data-testid="tp-done">{data ? events.length : '…'}</b>
          <small>by {new Set(events.map((e) => e.who)).size} people</small>
        </div>
        {!techOnly && (
          <div className="tp-tile tp-tile--warning">
            <span>Waiting for ACC</span>
            <b data-testid="tp-waiting">{data ? waitingAcc : '…'}</b>
            <small>approvals, closures, reports</small>
          </div>
        )}
        <div className="tp-tile tp-tile--accent">
          <span>People</span>
          <b data-testid="tp-people">{data ? people.length : '…'}</b>
          <small>
            {engineers} engineer{engineers === 1 ? '' : 's'} · {techs} technician{techs === 1 ? '' : 's'}
          </small>
        </div>
      </div>

      <div className="tm-tabs tp-tabs" role="tablist">
        {(techOnly ? (['people', 'history'] as const) : (['contractors', 'people', 'history'] as const)).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'tm-tab tm-tab--on' : 'tm-tab'} onClick={() => setTab(t)} data-testid={`tp-tab-${t}`}>
            {t === 'contractors' ? 'Contractors' : t === 'people' ? 'People' : 'History'}
          </button>
        ))}
      </div>

      {!data && !error && <p className="tp-muted">Loading…</p>}

      {data && tab === 'contractors' && !techOnly && (
        <div className="tp-grid">
          {shownContractors.map((c) => {
            const rows = MODULES.filter((m) => modOk(m.id)).map((m) => {
              const t = teams.find((x) => x.moduleId === m.id && x.contractor === c);
              const done = events.filter((e) => e.moduleId === m.id && (e.home || e.contractor) === c).length;
              const parts = t ? [`routes ${t.openRoutes || 0}`, `actions ${t.openActions || 0}`, `${m.id === 'oil-analysis' ? 'lab' : 'reports'} ${t.openReports || 0}`] : [];
              // a module that reports open work but has nothing for this contractor = 0, not unknown
              const known = (data.teams || []).some((x) => x.moduleId === m.id && x.open !== undefined);
              const zero = [`routes 0`, `actions 0`, `${m.id === 'oil-analysis' ? 'lab' : 'reports'} 0`];
              return { m, open: t?.open ?? 0, overdue: t?.overdue ?? 0, done, parts: t ? parts : zero, known };
            });
            const tot = rows.reduce((a, r) => ({ open: a.open + r.open, overdue: a.overdue + r.overdue, done: a.done + r.done }), { open: 0, overdue: 0, done: 0 });
            const nTech = (data.people || []).filter((p) => p.contractor === c && p.kind === 'technician').length;
            return (
              <section key={c} className="tp-card" data-testid={`tp-card-${c}`}>
                <div className="tp-card-head">
                  <b>{c}</b>
                  <span className="tp-muted">{SITES[c] || ''}</span>
                  <span className="tp-pill">{nTech} technician{nTech === 1 ? '' : 's'}</span>
                </div>
                <div className="tp-table-wrap">
                  <table className="tp-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Open</th>
                        <th>Overdue</th>
                        <th>Done</th>
                        <th className="tp-wide">Overdue share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.m.id}>
                          <td>
                            <span className={`tp-badge tp-badge--${r.m.label}`}>{r.m.label}</span>{' '}
                            <span className="tp-muted">{r.known ? r.parts.join(' · ') : r.m.what}</span>
                          </td>
                          <td>{r.known ? r.open : '—'}</td>
                          <td className={r.overdue ? 'tp-danger' : ''}>{r.overdue}</td>
                          <td>{r.done}</td>
                          <td className="tp-wide">
                            <Share part={r.overdue} whole={r.open} />
                          </td>
                        </tr>
                      ))}
                      <tr className="tp-total">
                        <td>Total</td>
                        <td>{tot.open}</td>
                        <td className={tot.overdue ? 'tp-danger' : ''}>{tot.overdue}</td>
                        <td>{tot.done}</td>
                        <td className="tp-wide">
                          <Share part={tot.overdue} whole={tot.open} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && (tab === 'people' || (techOnly && tab === 'contractors')) && (
        <section className="tp-card">
          <div className="tp-card-head">
            <b>People — most loaded first</b>
            <span className="tp-muted">all modules together · History shows each person's list</span>
          </div>
          <div className="tp-table-wrap">
            <table className="tp-table" data-testid="tp-people-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Contractor</th>
                  <th>Role</th>
                  {modOk('oil-analysis') && <th>Oil open</th>}
                  {modOk('vibration-analysis') && <th>Vibration open</th>}
                  <th>Overdue</th>
                  <th>Done {periodLabel}</th>
                  <th className="tp-wide">Load</th>
                </tr>
              </thead>
              <tbody>
                {people.length === 0 && (
                  <tr>
                    <td colSpan={8} className="tp-muted">Nobody yet.</td>
                  </tr>
                )}
                {people.map(({ p, oil, vib, open, done }) => (
                  <tr key={p.email} data-testid="tp-person">
                    <td>
                      <b>{nameOf(p)}</b>
                    </td>
                    <td>{p.contractor || '—'}</td>
                    <td>{p.kind === 'technician' ? 'Technician' : p.contractor === 'ACC' ? 'ACC Engineer' : 'Contractor Engineer'}</td>
                    {modOk('oil-analysis') && <td>{oil}</td>}
                    {modOk('vibration-analysis') && <td>{vib}</td>}
                    <td className={p.overdue ? 'tp-danger' : ''}>{p.overdue}</td>
                    <td>{done}</td>
                    <td className="tp-wide">
                      <span className="tp-bar" title={`${open} open`}>
                        <span className={p.overdue ? 'tp-bar-fill tp-bar-fill--warning' : 'tp-bar-fill'} style={{ width: `${Math.round((open / maxLoad) * 100)}%` }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'history' && <TeamTab />}
    </div>
  );
}

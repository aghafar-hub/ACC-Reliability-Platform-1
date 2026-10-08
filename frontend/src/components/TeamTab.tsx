import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
import { MODULE_BACKENDS } from '../moduleAccess';
import { fetchTeamHistory, type TeamEvent, type TeamHistory, type TeamPerson } from '../myWork';
import { TablerIcon } from '../icons';
import ShellModal from './ShellModal';
import './TeamTab.css';

// My Work → My team (managers and the App Owner). What each engineer and
// technician did in the period, what they still have in hand, and their
// dated history — from every module at once. A contractor manager gets
// their own contractor only; a contractor's responsible engineer gets their
// own technicians only. The backend decides (ModuleAccess.js maTeamScope_). Shown as workload, sorted by name or by overdue — not as
// a ranking.

type Period = 'month' | 'quarter' | 'year';
const PERIODS: [Period, string][] = [
  ['month', 'This month'],
  ['quarter', 'Last 3 months'],
  ['year', 'This year'],
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function periodRange(p: Period): [string, string] {
  const now = new Date();
  const to = ymd(now);
  if (p === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to];
  if (p === 'quarter') return [ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to];
  return [ymd(new Date(now.getFullYear(), 0, 1)), to];
}
function fmt(s: string) {
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
// display name from Module Access, else the full email (two people can share "eng@")
const nameOf = (p: { name?: string; email: string }) => p.name || p.email;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

type Row = {
  person: TeamPerson;
  events: TeamEvent[];
  done: number;
  timed: number;
  onTime: number;
  avgDays: number | null;
  covering: number;
  last: string;
};

function rowsFor(h: TeamHistory, kind: 'engineer' | 'technician', company: string): Row[] {
  return h.people
    .filter((p) => p.kind === kind && (company === 'All' || p.contractor === company))
    .map((p) => {
      const ev = h.events.filter((e) => e.who === p.email);
      const timed = ev.filter((e) => e.onTime !== null);
      const answered = ev.filter((e) => typeof e.days === 'number');
      return {
        person: p,
        events: ev,
        done: ev.length,
        timed: timed.length,
        onTime: timed.filter((e) => e.onTime).length,
        avgDays: answered.length ? Math.round((answered.reduce((n, e) => n + (e.days as number), 0) / answered.length) * 10) / 10 : null,
        covering: ev.filter((e) => e.covering).length,
        last: ev[0]?.date || '',
      };
    });
}

export default function TeamTab() {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const [period, setPeriod] = useState<Period>('month');
  const [kind, setKind] = useState<'engineer' | 'technician'>('engineer');
  const [company, setCompany] = useState('All');
  const [sort, setSort] = useState<'name' | 'overdue'>('name');
  const [data, setData] = useState<TeamHistory | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setData(null);
    setError('');
    const [from, to] = periodRange(period);
    fetchTeamHistory(sessionToken, from, to)
      .then((h) => !cancelled && setData(h))
      .catch(() => !cancelled && setError("Couldn't load the team history — try again."));
    return () => {
      cancelled = true;
    };
  }, [sessionToken, period]);

  const companies = useMemo(() => {
    const set = new Set((data?.people || []).map((p) => p.contractor).filter(Boolean));
    const order = ['ACC', 'ASEC', 'RHI'];
    return [...set].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  }, [data]);

  useEffect(() => {
    if (data?.techOnly) setKind('technician');
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const r = rowsFor(data, kind, company);
    return r.sort((a, b) =>
      sort === 'overdue' ? b.person.overdue - a.person.overdue || b.timed - b.onTime - (a.timed - a.onTime) || b.person.open - a.person.open || nameOf(a.person).localeCompare(nameOf(b.person)) : nameOf(a.person).localeCompare(nameOf(b.person)),
    );
  }, [data, kind, company, sort]);

  const counts = useMemo(() => {
    if (!data) return { engineer: 0, technician: 0 };
    return { engineer: rowsFor(data, 'engineer', company).length, technician: rowsFor(data, 'technician', company).length };
  }, [data, company]);

  const totals = useMemo(() => {
    const done = rows.reduce((n, r) => n + r.done, 0);
    const timed = rows.reduce((n, r) => n + r.timed, 0);
    const onTime = rows.reduce((n, r) => n + r.onTime, 0);
    const waiting = (data?.teams || []).filter((t) => company === 'All' || t.contractor === company);
    return {
      done,
      onTime: pct(onTime, timed),
      timed,
      inHand: kind === 'technician' ? rows.reduce((n, r) => n + r.person.open, 0) : waiting.reduce((n, t) => n + t.waiting, 0),
      overdue: kind === 'technician' ? rows.reduce((n, r) => n + r.person.overdue, 0) : waiting.reduce((n, t) => n + t.overdue, 0),
    };
  }, [rows, data, company, kind]);

  function openRecord(e: TeamEvent) {
    const path = MODULE_BACKENDS.find((m) => m.id === e.moduleId)?.path;
    if (!path || !e.link) return;
    setOpen(null);
    navigate(path);
    embeddedNav.navigateTo(e.moduleId, e.link.page, e.link.recordId || undefined);
  }

  return (
    <div className="tm" data-testid="team-tab">
      <div className="tm-controls">
        <div className="tm-chips" role="group" aria-label="Period">
          {PERIODS.map(([id, label]) => (
            <button key={id} type="button" className={period === id ? 'tm-chip tm-chip--on' : 'tm-chip'} aria-pressed={period === id} onClick={() => setPeriod(id)}>
              {label}
            </button>
          ))}
        </div>
        {companies.length > 1 && (
          <div className="tm-chips" role="group" aria-label="Company" data-testid="team-companies">
            {['All', ...companies].map((c) => (
              <button key={c} type="button" className={company === c ? 'tm-chip tm-chip--on' : 'tm-chip'} aria-pressed={company === c} onClick={() => setCompany(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data?.techOnly && (
      <div className="tm-tabs" role="tablist">
        {(
          [
            ['engineer', 'Engineers'],
            ['technician', 'Technicians'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id} className={kind === id ? 'tm-tab tm-tab--on' : 'tm-tab'} onClick={() => setKind(id)} data-testid={`team-tab-${id}`}>
            {label} <span className="tm-tab-count">{data ? counts[id] : ''}</span>
          </button>
        ))}
      </div>
      )}

      {error && <p className="mywork-error">{error}</p>}
      {!data && !error && <div className="tm-loading">Loading the team's work…</div>}
      {data && !data.techOnly && data.people.length === 0 && data.events.length === 0 && data.failed.length === 0 && data.scope === '' && (
        <p className="tm-muted" data-testid="team-none">Team history is for managers and responsible engineers.</p>
      )}
      {data && (
        <>
          {data.failed.length > 0 && <p className="tm-muted">Couldn't reach {data.failed.join(', ')} — not included.</p>}
          <div className="tm-tiles" data-testid="team-tiles">
            <div className="tm-tile">
              <span className="tm-tile-label">{kind === 'engineer' ? 'Engineers' : 'Technicians'}</span>
              <span className="tm-tile-value">{rows.length}</span>
              <span className="tm-tile-sub">{company === 'All' ? (data.scope === 'all' ? 'ACC and contractors' : data.scope) : company}</span>
            </div>
            <div className="tm-tile">
              <span className="tm-tile-label">Work done</span>
              <span className="tm-tile-value">{totals.done}</span>
              <span className="tm-tile-sub">{PERIODS.find((p) => p[0] === period)?.[1]}</span>
            </div>
            <div className="tm-tile">
              <span className="tm-tile-label">{kind === 'engineer' ? 'Answered within 3 days' : 'Routes on time'}</span>
              <span className="tm-tile-value">{totals.onTime === null ? '—' : `${totals.onTime}%`}</span>
              <span className="tm-tile-sub">{totals.timed ? `of ${totals.timed} with a deadline` : 'nothing timed yet'}</span>
            </div>
            <div className={totals.overdue ? 'tm-tile tm-tile--late' : 'tm-tile'}>
              <span className="tm-tile-label">{kind === 'engineer' ? 'Waiting with the team now' : 'Routes in hand now'}</span>
              <span className="tm-tile-value">{totals.inHand}</span>
              <span className="tm-tile-sub">{totals.overdue ? `${totals.overdue} overdue` : 'none overdue'}</span>
            </div>
          </div>

          <div className="tm-list-head">
            <span className="tm-muted">{rows.length ? 'Tap a person to see their history.' : ''}</span>
            <div className="tm-chips" role="group" aria-label="Sort">
              {(
                [
                  ['name', 'By name'],
                  ['overdue', 'Most overdue'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={sort === id ? 'tm-chip tm-chip--on' : 'tm-chip'} aria-pressed={sort === id} onClick={() => setSort(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="tm-muted" data-testid="team-empty">
              No {kind === 'engineer' ? 'engineers' : 'technicians'} here yet — people are added in Settings → Module Access.
            </p>
          ) : (
            <div className="tm-table" role="table" data-testid={`team-rows-${kind}`}>
              <div className="tm-tr tm-th" role="row">
                <span role="columnheader">Name</span>
                <span role="columnheader">Done</span>
                <span role="columnheader">{kind === 'engineer' ? 'Within 3 days' : 'On time'}</span>
                <span role="columnheader">{kind === 'engineer' ? 'Avg. days to answer' : 'In hand'}</span>
                <span role="columnheader">{kind === 'engineer' ? 'Late answers' : 'Overdue'}</span>
                <span role="columnheader">Last activity</span>
              </div>
              {rows.map((r) => {
                const p = pct(r.onTime, r.timed);
                return (
                  <button key={r.person.email} type="button" role="row" className="tm-tr tm-row" onClick={() => setOpen(r)} data-testid="team-row">
                    <span className="tm-name" role="cell">
                      <strong>{nameOf(r.person)}</strong>
                      <span className="tm-sub">
                        {r.person.contractor}
                        {!r.person.listed && kind === 'engineer' ? ' · not listed' : ''}
                        {r.covering ? ` · ${r.covering} while covering` : ''}
                      </span>
                    </span>
                    <span role="cell" data-label="Done">
                      <b>{r.done}</b>
                    </span>
                    <span role="cell" data-label={kind === 'engineer' ? 'Within 3 days' : 'On time'} className={p !== null && p < 80 ? 'tm-warn' : ''}>
                      {p === null ? '—' : `${p}%`}
                    </span>
                    <span role="cell" data-label={kind === 'engineer' ? 'Avg. days' : 'In hand'}>
                      {kind === 'engineer' ? (r.avgDays === null ? '—' : r.avgDays) : r.person.open}
                    </span>
                    {kind === 'engineer' ? (
                      <span role="cell" data-label="Late answers" className={r.timed - r.onTime ? 'tm-late' : ''}>
                        {r.timed - r.onTime}
                      </span>
                    ) : (
                      <span role="cell" data-label="Overdue" className={r.person.overdue ? 'tm-late' : ''}>
                        {r.person.overdue}
                      </span>
                    )}
                    <span role="cell" data-label="Last activity">
                      {r.last ? fmt(r.last) : 'none in period'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {kind === 'engineer' && (data.teams || []).length > 0 && (
            <p className="tm-muted tm-waiting" data-testid="team-waiting">
              Waiting with each team now:{' '}
              {Object.entries(
                data.teams
                  .filter((t) => company === 'All' || t.contractor === company)
                  .reduce<Record<string, { w: number; o: number }>>((acc, t) => {
                    acc[t.contractor] = { w: (acc[t.contractor]?.w || 0) + t.waiting, o: (acc[t.contractor]?.o || 0) + t.overdue };
                    return acc;
                  }, {}),
              )
                .map(([c, v]) => `${c} ${v.w}${v.o ? ` (${v.o} overdue)` : ''}`)
                .join(' · ')}
            </p>
          )}
        </>
      )}

      {open && (
        <ShellModal
          icon={kind === 'engineer' ? 'user-check' : 'user'}
          title={nameOf(open.person)}
          subtitle={`${open.person.email} · ${open.person.contractor} · ${PERIODS.find((p) => p[0] === period)?.[1]}`}
          onClose={() => setOpen(null)}
          testid="team-history"
          footer={
            <button type="button" className="tm-secondary" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          <div className="tm-tiles tm-tiles--small">
            <div className="tm-tile">
              <span className="tm-tile-label">Done</span>
              <span className="tm-tile-value">{open.done}</span>
            </div>
            <div className="tm-tile">
              <span className="tm-tile-label">{kind === 'engineer' ? 'Within 3 days' : 'On time'}</span>
              <span className="tm-tile-value">{pct(open.onTime, open.timed) === null ? '—' : `${pct(open.onTime, open.timed)}%`}</span>
            </div>
            {kind === 'technician' && (
              <div className={open.person.overdue ? 'tm-tile tm-tile--late' : 'tm-tile'}>
                <span className="tm-tile-label">In hand now</span>
                <span className="tm-tile-value">{open.person.open}</span>
                <span className="tm-tile-sub">{open.person.overdue ? `${open.person.overdue} overdue` : 'none overdue'}</span>
              </div>
            )}
            {open.covering > 0 && (
              <div className="tm-tile">
                <span className="tm-tile-label">While covering</span>
                <span className="tm-tile-value">{open.covering}</span>
              </div>
            )}
          </div>
          {open.events.length === 0 ? (
            <p className="tm-muted">Nothing recorded in this period.</p>
          ) : (
            <ul className="tm-history" data-testid="team-history-list">
              {open.events.map((e, i) => (
                <li key={i}>
                  <button type="button" className="tm-ev" onClick={() => openRecord(e)}>
                    <span className="tm-ev-date">{fmt(e.date)}</span>
                    <span className="tm-ev-main">
                      <span className="tm-ev-label">{e.label}</span>
                      <span className="tm-ev-title">{e.title}</span>
                      <span className="tm-ev-tags">
                        <span className="tm-tag">{e.moduleName}</span>
                        {e.covering && <span className="tm-tag tm-tag--cover">Covering for {e.covering.split('@')[0]}</span>}
                        {e.onTime === true && <span className="tm-tag tm-tag--ok">{typeof e.days === 'number' ? `${e.days} day${e.days === 1 ? '' : 's'}` : 'On time'}</span>}
                        {e.onTime === false && <span className="tm-tag tm-tag--late">{typeof e.days === 'number' ? `${e.days} days` : 'Late'}</span>}
                      </span>
                    </span>
                    <TablerIcon className="ti-chevron-right" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ShellModal>
      )}
    </div>
  );
}

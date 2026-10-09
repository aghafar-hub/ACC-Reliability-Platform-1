import { useMemo, useState } from 'react';
import IdSearch, { idTextMatch } from '../components/IdSearch';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../icons';
import { conditionRank, poorOnBoth, type MergedMachine } from '../plant';
import { ConditionBar, ConditionPill, countConditions, ModuleTag, usePlantData } from './plantShared';
import './Plant.css';

const PAGE = 50;

// Platform Equipment: every machine once (by Equipment ID), with its overall
// condition (worse of oil and vibration) and each module's own word.
export function PlantEquipmentList() {
  const { modules, machines, loading } = usePlantData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const show = params.get('show') || 'all';
  const setShow = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'all') next.delete('show');
    else next.set('show', v);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const [q, setQ] = useState('');
  const [contractor, setContractor] = useState('All');
  const [area, setArea] = useState('All');
  const [limit, setLimit] = useState(PAGE);

  const contractors = useMemo(() => [...new Set(machines.map((m) => m.contractor).filter(Boolean))].sort(), [machines]);
  const areas = useMemo(() => [...new Set(machines.map((m) => m.area).filter(Boolean))].sort(), [machines]);
  const base = machines.filter((m) => (contractor === 'All' || m.contractor === contractor) && (area === 'All' || m.area === area));
  const showFilter: Record<string, (m: MergedMachine) => boolean> = {
    all: () => true,
    both: (m) => Object.keys(m.parts).length > 1,
    attention: (m) => conditionRank(m.condition) >= 2,
    Poor: (m) => m.condition === 'Poor',
    'both-poor': poorOnBoth,
    ...Object.fromEntries(modules.map((mod) => [mod.short, (m: MergedMachine) => !!m.parts[mod.moduleId]])),
  };
  const match = idTextMatch(q, base.map((m) => m.id));
  const rows = base.filter(showFilter[show] || (() => true)).filter((m) => match(m.id, m.name));
  const counts = countConditions(base);
  const chip = (key: string, label: string, n: number) => (
    <button key={key} type="button" className={`plant-chip${show === key ? ' plant-chip--on' : ''}`} aria-pressed={show === key} onClick={() => setShow(show === key ? 'all' : key)} data-testid={`peq-show-${key}`}>
      {label} <b>{n}</b>
    </button>
  );

  return (
    <div className="plant-page" data-testid="plant-equipment">
      <div className="plant-head">
        <div>
          <h1 className="plant-title">Equipment</h1>
          <p className="plant-sub">Every machine once, by Equipment ID · worst first · {modules.map((m) => m.label).join(' + ')}</p>
        </div>
      </div>
      <IdSearch options={base.map((m) => ({ code: m.id, description: m.name }))} value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Equipment ID or name…" ariaLabel="Search Equipment ID or name" testid="peq-search" />
      <div className="plant-summary">
        <b>{base.length ? `${Math.round((counts.Good / base.length) * 100)}%` : '—'}</b> Good
        <ConditionBar counts={counts} />
        <span className="plant-ink-Poor">◆ {counts.Poor}</span>
      </div>
      <div className="plant-chiprow" role="group" aria-label="Show">
        {chip('all', 'All', base.length)}
        {chip('attention', 'Needs attention', base.filter(showFilter.attention).length)}
        {chip('Poor', '◆ Poor', counts.Poor)}
        {modules.length > 1 && chip('both', 'Oil + Vib', base.filter(showFilter.both).length)}
        {modules.length > 1 && chip('both-poor', 'Poor on both', base.filter(poorOnBoth).length)}
        {modules.length > 1 && modules.map((mod) => chip(mod.short, `${mod.short} only`, base.filter((m) => m.parts[mod.moduleId]).length))}
      </div>
      <div className="plant-chiprow">
        {contractors.length > 1 && (
          <span role="group" aria-label="Contractor" style={{ display: 'contents' }}>
            {['All', ...contractors].map((c) => (
              <button key={c} type="button" className={`plant-chip${contractor === c ? ' plant-chip--on' : ''}`} aria-pressed={contractor === c} onClick={() => setContractor(c)}>
                {c === 'All' ? 'All contractors' : c}
              </button>
            ))}
          </span>
        )}
        {areas.length > 1 && (
          <select className="plant-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            <option value="All">All areas</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        )}
      </div>
      <p className="plant-muted plant-count">{rows.length} machines</p>
      {loading && !machines.length && <div className="plant-card plant-empty">Loading the machines…</div>}
      {!loading && rows.length === 0 && <div className="plant-card plant-empty">No machine matches.</div>}
      <div className="plant-list">
        {rows.slice(0, limit).map((m) => (
          <button key={m.id} type="button" className="plant-row" onClick={() => navigate(`/equipment/${encodeURIComponent(m.id)}`)} data-testid={`peq-row-${m.id}`}>
            <span className="plant-row-main">
              <span className="plant-code">{m.id}</span>
              <span className="plant-row-sub">{[m.name, m.area, m.contractor].filter(Boolean).join(' · ')}</span>
              <span className="plant-row-mods">
                {modules.map((mod) =>
                  m.parts[mod.moduleId] ? <ModuleTag key={mod.moduleId} short={mod.short} word={m.parts[mod.moduleId].word} condition={m.parts[mod.moduleId].condition} /> : null,
                )}
              </span>
            </span>
            <ConditionPill condition={m.condition} />
            <Icon name="chevronRight" size={16} />
          </button>
        ))}
      </div>
      {rows.length > limit && (
        <button type="button" className="plant-more" onClick={() => setLimit((n) => n + PAGE)} data-testid="peq-more">
          Show {Math.min(PAGE, rows.length - limit)} more · {rows.length - limit} left
        </button>
      )}
    </div>
  );
}

// One machine: overall condition first, then each module's part.
export function PlantMachinePage() {
  const { id = '' } = useParams();
  const { modules, machines, loading, openModule } = usePlantData();
  const m = machines.find((x) => x.id === id);
  if (!m)
    return (
      <div className="plant-page">
        <Link className="plant-back" to="/equipment">
          ‹ Equipment
        </Link>
        <div className="plant-card plant-empty">{loading ? 'Loading…' : `${id} is not in your modules' equipment.`}</div>
      </div>
    );
  const events = Object.entries(m.parts)
    .flatMap(([mid, p]) => p.events.map((e) => ({ ...e, mod: modules.find((x) => x.moduleId === mid)?.short || '' })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const dues = Object.entries(m.parts)
    .map(([mid, p]) => (p.nextDue ? { ...p.nextDue, mod: modules.find((x) => x.moduleId === mid)?.short || '' } : null))
    .filter(Boolean) as { date: string; label: string; late?: boolean; mod: string }[];
  return (
    <div className="plant-page" data-testid="plant-machine">
      <Link className="plant-back" to="/equipment">
        ‹ Equipment
      </Link>
      <div className={`plant-card plant-hero plant-hero--${m.condition || 'none'}`}>
        <div className="plant-hero-top">
          <span className="plant-code plant-code--big" data-testid="pm-id">{m.id}</span>
          <ConditionPill condition={m.condition} big />
        </div>
        {m.name && <div className="plant-hero-name">{m.name}</div>}
        <div className="plant-tags">
          {m.area && <span>{m.area}</span>}
          {m.contractor && <span>{m.contractor}</span>}
          <span>{modules.filter((mod) => m.parts[mod.moduleId]).map((mod) => mod.label).join(' + ')}</span>
        </div>
        <div className="plant-overall" data-testid="pm-overall">
          <b>Overall condition: {m.condition || 'not checked yet'}</b>
          <span className="plant-muted"> — the worse of {Object.keys(m.parts).length > 1 ? 'oil and vibration' : 'its module'}</span>
          {m.reasons.length > 0 ? (
            <ul>
              {m.reasons.slice(0, 6).map((r, i) => (
                <li key={i}>
                  <span className={`plant-modtag plant-modtag--${r.module}`}>{r.module}</span> {r.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="plant-muted">Nothing needs attention.</p>
          )}
        </div>
      </div>

      <div className="plant-panels">
        {modules.map((mod) => {
          const p = m.parts[mod.moduleId];
          return (
            <div key={mod.moduleId} className={`plant-card plant-panel plant-panel--${mod.short}`} data-testid={`pm-panel-${mod.short}`}>
              <div className="plant-module-head">
                <b>{mod.label}</b>
                {p ? <ModuleTag short={mod.short} word={p.word} condition={p.condition} /> : <span className="plant-muted">not in this module</span>}
              </div>
              {p && (
                <>
                  <div className="plant-facts">
                    {p.facts.map((f) => (
                      <div key={f.label}>
                        <span>{f.label}</span>
                        <b className={f.tone ? `plant-tone-${f.tone}` : ''}>{f.value}</b>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="plant-open"
                    onClick={() => openModule(mod.moduleId, 'equipment', mod.moduleId === 'oil-analysis' ? { machine: m.id } : m.id)}
                    data-testid={`pm-open-${mod.short}`}
                  >
                    Open in {mod.label} <Icon name="chevronRight" size={14} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="plant-panels">
        <div className="plant-card">
          <div className="plant-card-title">Next due</div>
          {dues.length === 0 && <p className="plant-muted">Nothing planned.</p>}
          {dues.map((d) => (
            <div key={d.mod} className="plant-due-row">
              <span className={`plant-modtag plant-modtag--${d.mod}`}>{d.mod}</span> {d.label}
              <b className={d.late ? 'plant-tone-danger' : ''}>
                {d.date}
                {d.late ? ' · overdue' : ''}
              </b>
            </div>
          ))}
        </div>
        <div className="plant-card">
          <div className="plant-card-title">Latest, both modules</div>
          {events.length === 0 && <p className="plant-muted">No history yet.</p>}
          <div className="plant-timeline">
            {events.map((e, i) => (
              <div key={i} className={`plant-ev plant-ev--${e.tone || 'none'}`}>
                <b>{e.label}</b> <span className="plant-muted">{e.date}</span> <span className={`plant-modtag plant-modtag--${e.mod}`}>{e.mod}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

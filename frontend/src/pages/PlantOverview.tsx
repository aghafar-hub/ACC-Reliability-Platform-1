import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { poorOnBoth, type MergedMachine } from '../plant';
import { ConditionBar, countConditions, usePlantData } from './plantShared';
import './Plant.css';

// Plant overview (Home): both modules on one screen — the condition of
// every machine (worse of oil and vibration, Good / Fair / Poor), what needs
// attention across both, a card per module that opens its own dashboard,
// open actions by area and the work due in the next 5 weeks. Machines are
// named by Equipment ID only.
export default function PlantOverview() {
  const { state, modules, machines, loading, failed, openModule } = usePlantData();
  const navigate = useNavigate();
  const [contractor, setContractor] = useState('All');
  const [area, setArea] = useState('All');

  const contractors = useMemo(() => [...new Set(machines.map((m) => m.contractor).filter(Boolean))].sort(), [machines]);
  const areas = useMemo(() => [...new Set(machines.map((m) => m.area).filter(Boolean))].sort(), [machines]);
  const list = useMemo(
    () => machines.filter((m) => (contractor === 'All' || m.contractor === contractor) && (area === 'All' || m.area === area)),
    [machines, contractor, area],
  );
  const counts = countConditions(list);
  const goodPct = list.length ? Math.round((counts.Good / list.length) * 100) : null;
  const both = list.filter((m) => Object.keys(m.parts).length > 1).length;
  const badBoth = list.filter(poorOnBoth);
  const inList = new Set(list.map((m) => m.id));
  const filtered = contractor !== 'All' || area !== 'All';

  // Needs attention across both modules (counts follow the filters)
  const attention: { key: string; count: number; label: string; tag?: string; tone: string; sub: string; go: () => void }[] = [];
  if (badBoth.length)
    attention.push({ key: 'both', count: badBoth.length, label: 'Poor on both oil and vibration', tone: 'Poor', sub: badBoth.slice(0, 3).map((m) => m.id).join(' · ') + (badBoth.length > 3 ? ` · +${badBoth.length - 3}` : ''), go: () => navigate('/equipment?show=both-poor') });
  modules.forEach((mod) => {
    (state[mod.moduleId]?.attention || []).forEach((a) => {
      // machine-level items are recounted for the filtered list; the rest as given
      const machinesOf = (pred: (m: MergedMachine) => boolean) => list.filter(pred);
      let count = a.count;
      let examples = a.examples;
      if (filtered && a.examples.length) {
        const ms = machinesOf((m) => {
          const p = m.parts[mod.moduleId];
          if (!p) return false;
          if (a.key === 'oil-change') return !!p.changeOverdue;
          if (a.key === 'oil-alert') return p.reasons.includes('Latest lab result Alert') && !p.openActions;
          if (a.key === 'vib-danger') return p.word === 'Danger';
          if (a.key === 'vib-late') return !!p.nextDue?.late;
          return inList.has(m.id);
        });
        count = ms.length;
        examples = ms.slice(0, 3).map((m) => m.id);
      }
      if (!count) return;
      attention.push({
        key: a.key,
        count,
        label: a.label,
        tag: mod.short,
        tone: a.tone === 'purple' ? 'Danger' : a.tone === 'danger' ? 'Poor' : 'Fair',
        sub: examples.length ? examples.join(' · ') + (count > examples.length ? ` · +${count - examples.length}` : '') : 'tap to open the list',
        go: () => openModule(mod.moduleId, a.page),
      });
    });
  });
  const toneRank: Record<string, number> = { Danger: 3, Poor: 2, Fair: 1 };
  attention.sort((x, y) => (x.key === 'both' ? -1 : y.key === 'both' ? 1 : toneRank[y.tone] - toneRank[x.tone] || y.count - x.count));

  // open actions by area, per module
  const byArea = new Map<string, Record<string, number>>();
  list.forEach((m) =>
    Object.entries(m.parts).forEach(([mid, p]) => {
      if (!p.openActions) return;
      const a = m.area || 'No area set';
      const row = byArea.get(a) || {};
      row[mid] = (row[mid] || 0) + p.openActions;
      byArea.set(a, row);
    }),
  );
  const areaRows = [...byArea.entries()]
    .map(([label, r]) => ({ label, r, total: Object.values(r).reduce((n, x) => n + x, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const maxArea = Math.max(1, ...areaRows.map((r) => r.total));

  // work due per day, next 5 weeks (from Monday this week)
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = iso(today);
  const due = new Map<string, number>();
  let lateCount = 0;
  list.forEach((m) =>
    Object.values(m.parts).forEach((p) => {
      if (!p.nextDue?.date) return;
      if (p.nextDue.date < todayIso) lateCount++;
      else due.set(p.nextDue.date, (due.get(p.nextDue.date) || 0) + 1);
    }),
  );
  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { iso: iso(d), n: due.get(iso(d)) || 0, past: iso(d) < todayIso, d };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  if (!modules.length)
    return (
      <div className="plant-page">
        <h1 className="plant-title">Plant overview</h1>
        <div className="plant-card plant-empty">You don't have access to a module yet. Ask the App Owner to add you in Settings → Module access.</div>
      </div>
    );

  return (
    <div className="plant-page" data-testid="plant-overview">
      <div className="plant-head">
        <div>
          <h1 className="plant-title">Plant overview</h1>
          <p className="plant-sub" data-testid="plant-sub">
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {list.length} machines
            {modules.filter((m) => state[m.moduleId]).map((m) => ` · ${m.short} ${list.filter((x) => x.parts[m.moduleId]).length}`).join('')}
            {modules.filter((m) => state[m.moduleId]).length > 1 ? ` · ${both} in both` : ''}
          </p>
        </div>
        <div className="plant-filters" role="group" aria-label="Filters">
          {contractors.length > 1 &&
            ['All', ...contractors].map((c) => (
              <button key={c} type="button" className={`plant-chip${contractor === c ? ' plant-chip--on' : ''}`} aria-pressed={contractor === c} onClick={() => setContractor(c)}>
                {c === 'All' ? 'All contractors' : c}
              </button>
            ))}
          {areas.length > 1 && (
            <select className="plant-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              <option value="All">All areas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && !machines.length ? (
        <div className="plant-card plant-empty" data-testid="plant-loading">
          Loading the machines from {modules.map((m) => m.label).join(' and ')}…
        </div>
      ) : (
        <div className="plant-grid">
          <button type="button" className="plant-card plant-condition" onClick={() => navigate('/equipment')} data-testid="plant-condition">
            <span className="plant-ring" style={ringStyle(counts, list.length)}>
              <i>
                {goodPct == null ? '—' : `${goodPct}%`}
                <small>Good</small>
              </i>
            </span>
            <span className="plant-legend">
              <b className="plant-card-title">Machine condition</b>
              <span className="plant-muted">worse of oil and vibration</span>
              <span><span className="plant-sym plant-ink-Good">●</span><b>{counts.Good}</b> Good</span>
              <span><span className="plant-sym plant-ink-Fair">▲</span><b>{counts.Fair}</b> Fair</span>
              <span><span className="plant-sym plant-ink-Poor">◆</span><b>{counts.Poor}</b> Poor</span>
              {counts[''] > 0 && <span className="plant-muted">{counts['']} not checked yet</span>}
            </span>
          </button>

          <div className="plant-card" data-testid="plant-attention">
            <div className="plant-card-title">
              Needs attention <span className="plant-muted">tap to open</span>
            </div>
            {attention.length === 0 && <p className="plant-muted">Nothing needs attention right now.</p>}
            {attention.map((a) => (
              <button key={a.key} type="button" className={`plant-att plant-att--${a.tone}`} onClick={a.go} data-testid={`plant-att-${a.key}`}>
                <span className="plant-att-n">{a.count}</span>
                <span className="plant-att-x">
                  <b>
                    {a.label} {a.tag && <span className={`plant-modtag plant-modtag--${a.tag}`}>{a.tag}</span>}
                  </b>
                  <span>{a.sub}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>

          {modules.map((mod) => {
            const sum = state[mod.moduleId];
            const own = list.map((m) => m.parts[mod.moduleId]).filter(Boolean);
            return (
              <div key={mod.moduleId} className="plant-card plant-module" data-testid={`plant-module-${mod.short}`}>
                <div className="plant-module-head">
                  <b>{mod.label}</b>
                  <button type="button" className="plant-link" onClick={() => openModule(mod.moduleId, 'dashboard')} data-testid={`plant-open-${mod.short}`}>
                    Dashboard <Icon name="chevronRight" size={14} />
                  </button>
                </div>
                {!sum ? (
                  failed.includes(mod.moduleId) ? (
                    <p className="plant-muted" data-testid={`plant-failed-${mod.short}`}>
                      Couldn't load {mod.label} — open it to try again.
                    </p>
                  ) : (
                    <p className="plant-muted">Loading…</p>
                  )
                ) : (
                  <>
                    <div className="plant-module-bar">
                      <ConditionBar counts={countConditions(own)} />
                      <span className="plant-muted">{own.length} machines</span>
                    </div>
                    <div className="plant-kpis">
                      {sum.kpis.map((k) => (
                        <div key={k.label}>
                          <span>{k.label}</span>
                          <b className={k.tone ? `plant-tone-${k.tone}` : ''}>{k.value}</b>
                          {k.sub && <small>{k.sub}</small>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <div className="plant-card" data-testid="plant-areas">
            <div className="plant-card-title">
              Open actions by area <span className="plant-muted">{modules.map((m) => m.short).join(' + ')}</span>
            </div>
            {areaRows.length === 0 && <p className="plant-muted">No open actions.</p>}
            {areaRows.map((r) => (
              <div key={r.label} className="plant-area-row">
                <span className="plant-area-label">{r.label}</span>
                <span className="plant-area-bars">
                  {modules.map((m) =>
                    r.r[m.moduleId] ? <i key={m.moduleId} className={`plant-area-${m.short}`} style={{ width: `${(r.r[m.moduleId] / maxArea) * 100}%` }} title={`${m.short} ${r.r[m.moduleId]}`} /> : null,
                  )}
                </span>
                <b>{r.total}</b>
              </div>
            ))}
            {areaRows.length > 0 && (
              <div className="plant-key">
                {modules.map((m) => (
                  <span key={m.moduleId}>
                    <i className={`plant-area-${m.short}`} /> {m.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="plant-card" data-testid="plant-due">
            <div className="plant-card-title">
              Work due · next 5 weeks <span className="plant-muted">oil changes + vibration measurements</span>
            </div>
            <div className="plant-cal">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} className="plant-cal-h">{d}</span>
              ))}
              {days.map((d) => (
                <span
                  key={d.iso}
                  className={`plant-cal-d${d.past ? ' plant-cal-past' : ''}${d.iso === todayIso ? ' plant-cal-today' : ''}`}
                  style={d.n ? { background: `color-mix(in srgb, var(--shell-accent) ${Math.round(15 + (d.n / maxDay) * 75)}%, transparent)` } : undefined}
                  title={`${d.d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${d.n} due`}
                >
                  {d.d.getDate()}
                </span>
              ))}
            </div>
            <p className="plant-muted">{lateCount ? `${lateCount} already overdue` : 'Nothing overdue'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ringStyle(c: Record<string, number>, total: number) {
  if (!total) return { background: 'var(--shell-border)' };
  const pct = (n: number) => (n / total) * 100;
  const g = pct(c.Good);
  const f = g + pct(c.Fair);
  const p = f + pct(c.Poor);
  return {
    background: `conic-gradient(var(--plant-good) 0 ${g}%, var(--plant-fair) ${g}% ${f}%, var(--plant-poor) ${f}% ${p}%, var(--shell-border) ${p}% 100%)`,
  };
}

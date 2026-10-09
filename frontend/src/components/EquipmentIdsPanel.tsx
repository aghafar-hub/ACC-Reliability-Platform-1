import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/client';
import { listEquipmentLog, listEquipmentMaster, saveEquipmentMaster, type EquipmentChange, type PlatformEquipment } from '../api/platformCore';
import { fetchIdChecks, ID_MODULES, markIdProblem, type IdProblem, type ModuleIdCheck } from '../equipmentIds';
import { TablerIcon } from '../icons';
import IdSearch, { idTextMatch } from './IdSearch';
import ShellModal, { FormSection } from './ShellModal';
import './EquipmentIdsPanel.css';

// Settings → Equipment & IDs (App Owner only).
//   Equipment ID — owned by the platform: this page adds, edits and retires them.
//   Lub ID       — owned by Oil Lubrication; Vib ID — owned by Vibration Analysis.
// Every module's Equipment ID must be one of the platform's; the modules use
// the platform's name, area and contractor, and report what doesn't match
// ("Not matching"). New problems reach the App Owner every morning (bell +
// email, the modules' idCheckDaily).

type Tab = 'equipment' | 'lub' | 'vib' | 'problems' | 'log';
const PAGE = 100;
const CONTRACTORS = ['RHI', 'ASEC'];
const CRITICALITY = ['High', 'Medium', 'Low'];
const KIND_ORDER = ['notInPlatform', 'noEquipmentId', 'duplicate', 'orphanRecords', 'retired', 'idMismatch', 'registerNoVibId', 'vibIdNoRegister', 'contractorDiffers'];

export default function EquipmentIdsPanel() {
  const { sessionToken } = useAuth();
  const [tab, setTab] = useState<Tab>('equipment');
  const [list, setList] = useState<PlatformEquipment[] | null>(null);
  const [checks, setChecks] = useState<ModuleIdCheck[]>([]);
  const [log, setLog] = useState<EquipmentChange[] | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<{ mode: 'add' | 'edit'; item: Partial<PlatformEquipment> } | null>(null);

  const load = useCallback(
    async (fresh = false) => {
      if (!sessionToken) return;
      setError('');
      if (fresh) setChecking(true);
      try {
        const [eq, ch] = await Promise.all([listEquipmentMaster(sessionToken).catch((e) => ({ error: describeError(e, "Couldn't load the equipment list.") })), fetchIdChecks(sessionToken, fresh)]);
        if ('error' in eq) setError(eq.error as string);
        else setList(eq.equipment);
        setChecks(ch);
      } finally {
        setChecking(false);
      }
    },
    [sessionToken],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab === 'log' && sessionToken && !log) listEquipmentLog(sessionToken).then((r) => setLog(r.entries)).catch(() => setLog([]));
  }, [tab, sessionToken, log]);

  const oil = checks.find((c) => c.moduleId === 'oil-analysis');
  const vib = checks.find((c) => c.moduleId === 'vibration-analysis');
  const counts = useMemo(() => {
    const lub: Record<string, number> = {};
    const vb: Record<string, number> = {};
    const key = (s: string) => s.replace(/\s+/g, '').toUpperCase();
    (oil?.ids || []).forEach((x) => x.equipmentId && (lub[key(x.equipmentId)] = (lub[key(x.equipmentId)] || 0) + 1));
    (vib?.ids || []).forEach((x) => x.equipmentId && (vb[key(x.equipmentId)] = (vb[key(x.equipmentId)] || 0) + 1));
    return { lub: (id: string) => lub[key(id)] || 0, vib: (id: string) => vb[key(id)] || 0 };
  }, [oil, vib]);
  const problems = useMemo(() => checks.flatMap((c) => c.problems.map((p) => ({ ...p, moduleId: c.moduleId }))), [checks]);
  const openProblems = problems.filter((p) => p.status !== 'OK');

  async function save(mode: 'add' | 'edit' | 'retire' | 'restore', item: Partial<PlatformEquipment> & { id: string }) {
    if (!sessionToken) return;
    await saveEquipmentMaster(sessionToken, mode, item);
    setLog(null);
    const eq = await listEquipmentMaster(sessionToken);
    setList(eq.equipment);
  }

  const notConnected = checks.filter((c) => c.failed || !c.connected);

  return (
    <div className="eid-panel" data-testid="equipment-ids">
      <p className="settings-intro">
        <b>Equipment IDs</b> are owned by the platform — added, changed and retired only here. <b>Lub IDs</b> belong to Oil Lubrication and <b>Vib IDs</b> to Vibration Analysis, and each must point to an Equipment ID from this list. The modules show the platform's name, area and contractor. Anything that doesn't match is listed under <b>Not matching</b>; new problems reach you every morning (bell + email).
      </p>
      {error && <div className="eid-msg eid-msg--error">{error}</div>}
      {notConnected.map((c) => (
        <div key={c.moduleId} className="eid-msg eid-msg--warn" data-testid={`eid-notconnected-${c.moduleId}`}>
          <b>{c.module}:</b> {c.failed || `not reading the platform list — ${c.error || 'set the script property PLATFORM_CORE_SPREADSHEET_ID'}.`}
        </div>
      ))}

      <div className="eid-tiles">
        <Tile label="Machines on the platform" value={list ? list.filter((e) => !/retired/i.test(e.status)).length : '…'} sub={list ? `${list.filter((e) => /retired/i.test(e.status)).length} retired` : ''} onClick={() => setTab('equipment')} />
        <Tile label="Lub IDs (Oil)" value={oil ? oil.ids.length : '…'} sub={oil ? `${oil.ids.filter((x) => !x.inPlatform).length} not on the platform` : ''} onClick={() => setTab('lub')} />
        <Tile label="Vib IDs (Vibration)" value={vib ? vib.ids.length : '…'} sub={vib ? `${vib.ids.filter((x) => !x.inPlatform).length} not on the platform` : ''} onClick={() => setTab('vib')} />
        <Tile label="Not matching" value={checks.length ? openProblems.length : '…'} sub={checks.length ? `${problems.length - openProblems.length} marked OK` : ''} tone={openProblems.length ? 'danger' : 'ok'} onClick={() => setTab('problems')} testid="eid-tile-problems" />
      </div>

      <div className="eid-tabs" role="tablist" aria-label="Equipment and IDs">
        {(
          [
            ['equipment', 'Equipment'],
            ['lub', 'Lub IDs'],
            ['vib', 'Vib IDs'],
            ['problems', `Not matching${openProblems.length ? ` (${openProblems.length})` : ''}`],
            ['log', 'Change log'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'eid-tab eid-tab--on' : 'eid-tab'} onClick={() => setTab(id)} data-testid={`eid-tab-${id}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'equipment' && <EquipmentTab list={list} counts={counts} onAdd={() => setEditing({ mode: 'add', item: { contractor: 'RHI', criticality: 'Medium' } })} onOpen={(e) => setEditing({ mode: 'edit', item: e })} />}
      {tab === 'lub' && <IdsTab kind="lub" check={oil} />}
      {tab === 'vib' && <IdsTab kind="vib" check={vib} />}
      {tab === 'problems' && (
        <ProblemsTab
          problems={problems}
          checks={checks}
          checking={checking}
          onCheck={() => load(true)}
          onAddToPlatform={(id) => setEditing({ mode: 'add', item: { id, contractor: 'RHI', criticality: 'Medium' } })}
          onMark={async (p, status) => {
            if (!sessionToken) return;
            setChecks((cs) => cs.map((c) => (c.moduleId !== p.moduleId ? c : { ...c, problems: c.problems.map((x) => (x.key === p.key ? { ...x, status } : x)) })));
            await markIdProblem(sessionToken, p.moduleId, p.key, status);
          }}
        />
      )}
      {tab === 'log' && <LogTab log={log} />}

      {editing && (
        <EquipmentModal
          mode={editing.mode}
          item={editing.item}
          list={list || []}
          counts={counts}
          onClose={() => setEditing(null)}
          onSave={async (mode, item) => {
            await save(mode, item);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone, onClick, testid }: { label: string; value: number | string; sub?: string; tone?: 'danger' | 'ok'; onClick?: () => void; testid?: string }) {
  return (
    <button type="button" className={`eid-tile${tone ? ` eid-tile--${tone}` : ''}`} onClick={onClick} data-testid={testid}>
      <span className="eid-tile-label">{label}</span>
      <span className="eid-tile-value">{value}</span>
      {sub && <span className="eid-tile-sub">{sub}</span>}
    </button>
  );
}

function Chips<T extends string>({ value, options, onChange, label, all, names }: { value: T | 'All'; options: T[]; onChange: (v: T | 'All') => void; label: string; all?: string; names?: Record<string, string> }) {
  return (
    <span role="group" aria-label={label} className="eid-chips">
      {(all ? (['All', ...options] as (T | 'All')[]) : options).map((o) => (
        <button key={o} type="button" aria-pressed={value === o} className={`eid-chip${value === o ? ' eid-chip--on' : ''}`} onClick={() => onChange(o)}>
          {o === 'All' ? all : names?.[o] || o}
        </button>
      ))}
    </span>
  );
}

function EquipmentTab({ list, counts, onAdd, onOpen }: { list: PlatformEquipment[] | null; counts: { lub: (id: string) => number; vib: (id: string) => number }; onAdd: () => void; onOpen: (e: PlatformEquipment) => void }) {
  const [q, setQ] = useState('');
  const [contractor, setContractor] = useState<string>('All');
  const [area, setArea] = useState('All');
  const [status, setStatus] = useState<'Active' | 'Retired' | 'All'>('Active');
  const [limit, setLimit] = useState(PAGE);
  if (!list) return <p className="eid-muted">Loading the equipment list…</p>;
  const areas = [...new Set(list.map((e) => e.mainArea).filter(Boolean))].sort();
  const base = list.filter((e) => (contractor === 'All' || e.contractor === contractor) && (area === 'All' || e.mainArea === area) && (status === 'All' || (status === 'Retired') === /retired/i.test(e.status)));
  const match = idTextMatch(q, base.map((e) => e.id));
  const rows = base.filter((e) => match(e.id, e.name, e.plantArea));
  return (
    <section className="eid-card">
      <div className="eid-filters">
        <div className="eid-search">
          <IdSearch options={base.map((e) => ({ code: e.id, description: e.name }))} value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder="Equipment ID or name…" testid="eid-find" />
        </div>
        <select className="eid-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Main area">
          <option value="All">All areas</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <Chips value={contractor} options={CONTRACTORS} onChange={setContractor} label="Contractor" all="All contractors" />
        <Chips value={status} options={['Active', 'Retired'] as ('Active' | 'Retired')[]} onChange={setStatus} label="Status" all="All" />
        <button type="button" className="eid-primary" onClick={onAdd} data-testid="eid-add">
          <TablerIcon className="ti-plus" size={14} /> Add equipment
        </button>
      </div>
      <p className="eid-muted">{rows.length} machines</p>
      <div className="eid-table-wrap">
        <table className="eid-table" data-testid="eid-equipment-table">
          <thead>
            <tr>
              <th>Equipment ID</th>
              <th>Name</th>
              <th>Area</th>
              <th>Contractor</th>
              <th>Criticality</th>
              <th className="eid-num">Lub IDs</th>
              <th className="eid-num">Vib IDs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((e) => (
              <tr key={e.id} onClick={() => onOpen(e)} data-testid={`eid-row-${e.id}`}>
                <td className="eid-code">{e.id}</td>
                <td>{e.name}</td>
                <td>
                  {e.mainArea}
                  {e.plantArea && <span className="eid-dim"> · {e.plantArea}</span>}
                </td>
                <td>{e.contractor}</td>
                <td>{e.criticality}</td>
                <td className="eid-num">{counts.lub(e.id) || <span className="eid-dim">—</span>}</td>
                <td className="eid-num">{counts.vib(e.id) || <span className="eid-dim">—</span>}</td>
                <td>{/retired/i.test(e.status) ? <span className="eid-pill eid-pill--muted">Retired</span> : <span className="eid-pill eid-pill--ok">Active</span>}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="eid-dim">
                  No machine matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="eid-secondary eid-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </button>
      )}
    </section>
  );
}

function IdsTab({ kind, check }: { kind: 'lub' | 'vib'; check?: ModuleIdCheck }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'All' | 'Not on the platform'>('All');
  const [limit, setLimit] = useState(PAGE);
  if (!check) return <p className="eid-muted">Loading…</p>;
  if (check.failed) return <p className="eid-muted">{check.failed}</p>;
  const idOf = (x: ModuleIdCheck['ids'][number]) => (kind === 'lub' ? x.lubId : x.vibId) || '';
  const base = check.ids.filter((x) => only === 'All' || !x.inPlatform);
  const match = idTextMatch(q, base.map(idOf));
  const rows = base.filter((x) => match(idOf(x), x.equipmentId, x.point));
  const label = kind === 'lub' ? 'Lub ID' : 'Vib ID';
  return (
    <section className="eid-card">
      <p className="eid-muted">
        Owned by {check.module}: added and changed there{kind === 'lub' ? ' (Equipment Registry tab)' : ' (VIB ID Registry tab)'}. Shown here to check them against the platform list.
      </p>
      <div className="eid-filters">
        <div className="eid-search">
          <IdSearch options={base.map((x) => ({ code: idOf(x), description: x.equipmentId }))} value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder={`${label} or Equipment ID…`} testid={`eid-${kind}-find`} />
        </div>
        <Chips value={only} options={['Not on the platform'] as 'Not on the platform'[]} onChange={setOnly} label="Show" all="All" />
      </div>
      <p className="eid-muted">{rows.length} {label}s</p>
      <div className="eid-table-wrap">
        <table className="eid-table" data-testid={`eid-${kind}-table`}>
          <thead>
            <tr>
              <th>{label}</th>
              <th>Equipment ID</th>
              <th>Point</th>
              {kind === 'vib' && <th>Family</th>}
              <th>Contractor</th>
              <th>Status</th>
              <th>Platform</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((x, i) => (
              <tr key={idOf(x) + i} className="eid-row-static">
                <td className="eid-code">{idOf(x)}</td>
                <td className="eid-code">{x.equipmentId || <span className="eid-bad">none</span>}</td>
                <td>{x.point}</td>
                {kind === 'vib' && <td>{x.family}</td>}
                <td>{x.contractor}</td>
                <td>{x.status}</td>
                <td>{x.inPlatform ? <span className="eid-pill eid-pill--ok">✓ listed</span> : <span className="eid-pill eid-pill--bad">Not on the platform</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="eid-secondary eid-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
        </button>
      )}
    </section>
  );
}

type ModuleProblem = IdProblem & { moduleId: string };

function ProblemsTab({ problems, checks, checking, onCheck, onAddToPlatform, onMark }: { problems: ModuleProblem[]; checks: ModuleIdCheck[]; checking: boolean; onCheck: () => void; onAddToPlatform: (id: string) => void; onMark: (p: ModuleProblem, s: 'OK' | 'Open') => void }) {
  const [mod, setMod] = useState<string>('All');
  const [showOk, setShowOk] = useState(false);
  const shown = problems.filter((p) => (mod === 'All' || p.moduleId === mod) && (showOk || p.status !== 'OK'));
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: shown.filter((p) => p.kind === k) })).filter((g) => g.items.length);
  const other = shown.filter((p) => !KIND_ORDER.includes(p.kind));
  if (other.length) groups.push({ kind: 'other', items: other });
  const lastCheck = checks.map((c) => c.checkedAt).filter(Boolean).sort()[0];
  return (
    <section className="eid-card" data-testid="eid-problems">
      <div className="eid-filters">
        <Chips value={mod} options={ID_MODULES.map((m) => m.id)} names={Object.fromEntries(ID_MODULES.map((m) => [m.id, m.name]))} onChange={setMod} label="Module" all="All modules" />
        <label className="eid-check">
          <input type="checkbox" checked={showOk} onChange={(e) => setShowOk(e.target.checked)} /> Show the ones marked OK
        </label>
        <button type="button" className="eid-secondary" onClick={onCheck} disabled={checking} data-testid="eid-check-now">
          <TablerIcon className="ti-refresh" size={14} /> {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
      <p className="eid-muted">{lastCheck ? `Last checked ${new Date(lastCheck).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''} · every morning at 07:00 new problems are sent to you</p>
      {!groups.length && <div className="eid-empty">✓ Everything matches the platform list.</div>}
      {groups.map((g) => (
        <div key={g.kind} className="eid-group">
          <div className="eid-group-head">
            <span>{g.items[0].title}</span>
            <b>{g.items.length}</b>
          </div>
          {g.items.map((p) => (
            <div key={p.moduleId + p.key} className={`eid-problem eid-problem--${p.severity}${p.status === 'OK' ? ' eid-problem--ok' : ''}`} data-testid={`eid-problem-${p.key}`}>
              <span className="eid-code">{p.id}</span>
              <span className="eid-problem-text">
                <span className="eid-tag">{ID_MODULES.find((m) => m.id === p.moduleId)?.short}</span> {p.detail}
              </span>
              <span className="eid-problem-actions">
                {p.kind === 'notInPlatform' && p.status !== 'OK' && (
                  <button type="button" className="eid-secondary" onClick={() => onAddToPlatform(p.id)}>
                    Add to platform
                  </button>
                )}
                {p.status === 'OK' ? (
                  <button type="button" className="eid-link" onClick={() => onMark(p, 'Open')}>
                    Marked OK · reopen
                  </button>
                ) : (
                  <button type="button" className="eid-link" onClick={() => onMark(p, 'OK')} data-testid={`eid-ok-${p.key}`}>
                    Mark OK
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function LogTab({ log }: { log: EquipmentChange[] | null }) {
  if (!log) return <p className="eid-muted">Loading…</p>;
  const diff = (b: string, a: string) => {
    try {
      const x = b ? JSON.parse(b) : {};
      const y = a ? JSON.parse(a) : {};
      return Object.keys(y)
        .filter((k) => k !== 'contractorOrg' && x[k] !== y[k])
        .map((k) => (b ? `${k}: ${x[k] || '—'} → ${y[k] || '—'}` : `${k}: ${y[k]}`))
        .filter((t) => !t.endsWith(': '))
        .join(' · ');
    } catch {
      return '';
    }
  };
  return (
    <section className="eid-card">
      {!log.length && <p className="eid-muted">No changes yet.</p>}
      {!!log.length && (
        <div className="eid-table-wrap">
          <table className="eid-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Equipment ID</th>
                <th>Change</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i} className="eid-row-static">
                  <td>{e.at ? new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</td>
                  <td>{e.by}</td>
                  <td className="eid-code">{e.id}</td>
                  <td>{e.change}</td>
                  <td className="eid-dim">{diff(e.before, e.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EquipmentModal({ mode, item, list, counts, onClose, onSave }: { mode: 'add' | 'edit'; item: Partial<PlatformEquipment>; list: PlatformEquipment[]; counts: { lub: (id: string) => number; vib: (id: string) => number }; onClose: () => void; onSave: (mode: 'add' | 'edit' | 'retire' | 'restore', item: Partial<PlatformEquipment> & { id: string }) => Promise<void> }) {
  const [f, setF] = useState<Partial<PlatformEquipment>>({ ...item });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof PlatformEquipment, v: string) => setF((x) => ({ ...x, [k]: v }));
  const retired = /retired/i.test(f.status || '');
  const mainAreas = [...new Set(list.map((e) => e.mainArea).filter(Boolean))].sort();
  const plantAreas = [...new Set(list.filter((e) => !f.mainArea || e.mainArea === f.mainArea).map((e) => e.plantArea).filter(Boolean))].sort();
  const run = async (m: 'add' | 'edit' | 'retire' | 'restore') => {
    setErr('');
    if (m === 'retire' && (counts.lub(f.id || '') || counts.vib(f.id || '')) && !window.confirm(`${f.id} still has Lub / Vib IDs. Retire it anyway? They will be listed under Not matching.`)) return;
    setBusy(true);
    try {
      await onSave(m, { ...f, id: String(f.id || '') });
    } catch (e) {
      setErr(describeError(e, "Couldn't save."));
      setBusy(false);
    }
  };
  return (
    <ShellModal
      icon="building-factory-2"
      title={mode === 'add' ? 'Add equipment' : f.id || ''}
      subtitle={mode === 'add' ? 'A new Equipment ID on the platform list' : `${counts.lub(f.id || '')} Lub IDs · ${counts.vib(f.id || '')} Vib IDs`}
      badge={mode === 'edit' ? <span className={`eid-pill ${retired ? 'eid-pill--muted' : 'eid-pill--ok'}`}>{retired ? 'Retired' : 'Active'}</span> : undefined}
      onClose={onClose}
      width={640}
      testid="eid-modal"
      footer={
        <>
          {mode === 'edit' && (
            <button type="button" className="eid-secondary" disabled={busy} onClick={() => run(retired ? 'restore' : 'retire')} data-testid="eid-retire">
              {retired ? 'Restore' : 'Retire'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="eid-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="eid-primary" disabled={busy} onClick={() => run(mode)} data-testid="eid-save">
            {busy ? 'Saving…' : mode === 'add' ? 'Add' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="eid-msg eid-msg--error">{err}</div>}
      <FormSection icon="list-details" title="Equipment">
        <div className="eid-form">
          <label>
            <span>Equipment ID</span>
            {mode === 'add' ? (
              <input className="eid-input eid-code" value={f.id || ''} onChange={(e) => set('id', e.target.value.toUpperCase())} placeholder="e.g. 321.FN125" data-testid="eid-f-id" />
            ) : (
              <span className="eid-read eid-code">{f.id}</span>
            )}
          </label>
          <label className="eid-span2">
            <span>Name</span>
            <input className="eid-input" value={f.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kiln ID fan" data-testid="eid-f-name" />
          </label>
        </div>
      </FormSection>
      <FormSection icon="map-pin" title="Area and owner">
        <div className="eid-form">
          <label>
            <span>Main area</span>
            <input className="eid-input" list="eid-main-areas" value={f.mainArea || ''} onChange={(e) => set('mainArea', e.target.value)} placeholder="Line1, Line2, CM1, CM2" />
            <datalist id="eid-main-areas">{mainAreas.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label>
            <span>Plant area</span>
            <input className="eid-input" list="eid-plant-areas" value={f.plantArea || ''} onChange={(e) => set('plantArea', e.target.value)} placeholder="Kiln1, RawMill1…" />
            <datalist id="eid-plant-areas">{plantAreas.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label>
            <span>Sub area</span>
            <input className="eid-input" value={f.subArea || ''} onChange={(e) => set('subArea', e.target.value)} />
          </label>
          <div className="eid-span2">
            <span className="eid-label">Contractor</span>
            <Chips value={(f.contractor as string) || 'RHI'} options={CONTRACTORS} onChange={(v) => set('contractor', v)} label="Contractor" />
          </div>
          <div>
            <span className="eid-label">Criticality</span>
            <Chips value={(f.criticality as string) || 'Medium'} options={CRITICALITY} onChange={(v) => set('criticality', v)} label="Criticality" />
          </div>
          <label>
            <span>Parent Equipment ID</span>
            <input className="eid-input eid-code" value={f.parent || ''} onChange={(e) => set('parent', e.target.value.toUpperCase())} placeholder="optional" />
          </label>
        </div>
        {mode === 'edit' && <p className="eid-muted">Changing the contractor moves this machine — and its Lub IDs and Vib IDs — to the other contractor in both modules.</p>}
      </FormSection>
    </ShellModal>
  );
}

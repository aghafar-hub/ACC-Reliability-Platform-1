import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, describeError } from '../api/client';
import { listEquipmentLog, listEquipmentMaster, saveEquipmentMaster, type EquipmentChange, type PlatformEquipment } from '../api/platformCore';
import { fetchIdChecks, ID_MODULES, idAdmin, markIdProblem, type IdProblem, type ModuleIdCheck } from '../equipmentIds';
import { TablerIcon } from '../icons';
import IdSearch, { idTextMatch } from './IdSearch';
import ShellModal, { FormSection } from './ShellModal';
import AreasTab from './AreasTab';
import { areaResolver, useAreas } from '../areas';
import './EquipmentIdsPanel.css';
import SectionBoundary from './SectionBoundary';

// Settings → Equipment & IDs (Admin only).
//   Equipment ID — owned by the platform: this page adds, edits and retires them.
//   Lub ID       — owned by Oil Lubrication; Vib ID — owned by Vibration Analysis.
// Every module's Equipment ID must be one of the platform's; the modules use
// the platform's name, area and contractor, and report what doesn't match
// ("Not matching"). New problems reach the Admin every morning (bell +
// email, the modules' idCheckDaily).

type Tab = 'equipment' | 'areas' | 'lub' | 'vib' | 'problems' | 'log';
const PAGE = 100;
const CONTRACTORS = ['RHI', 'ASEC'];
const CRITICALITY = ['High', 'Medium', 'Low'];
// Same token rule as the modules' IdAdmin.js (idaTokenRe_): the Equipment ID
// inside a Lub / Vib ID, not followed by more letters or digits.
function idToken(id: string) {
  return new RegExp('(^|[^A-Za-z0-9.])' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^A-Za-z0-9])', 'g');
}

// The module and ID that would block renaming `from` to `to`, else ''.
function renameClash(from: string, to: string, checks: (ModuleIdCheck | undefined)[]): string {
  const k = (s: string) => s.replace(/\s+/g, '').toUpperCase();
  for (const c of checks) {
    if (!c) continue;
    const all = new Set(c.ids.map((x) => k(x.lubId || x.vibId || '')));
    for (const x of c.ids) {
      const cur = x.lubId || x.vibId || '';
      if (k(x.equipmentId) !== k(from)) continue;
      const next = cur.replace(idToken(from.trim()), (_m, pre) => pre + to.trim());
      if (next !== cur && all.has(k(next))) {
        return `${c.module}: ${next} already exists, so ${from} can't become ${to}. Nothing was changed. Delete or change the IDs under ${to} first.`;
      }
    }
  }
  return '';
}

// A module's refusal is a plain Error: show its reason, not the fallback.
function errText(e: unknown, fallback: string) {
  return e instanceof Error && !(e instanceof ApiError) && !(e instanceof TypeError) && e.message ? e.message : describeError(e, fallback);
}

const KIND_ORDER = ['notInPlatform', 'noEquipmentId', 'duplicate', 'orphanRecords', 'retired', 'idMismatch', 'registerNoVibId', 'vibIdNoRegister', 'contractorDiffers'];

export default function EquipmentIdsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { sessionToken } = useAuth();
  const [tab, setTab] = useState<Tab>('equipment');
  const [list, setList] = useState<PlatformEquipment[] | null>(null);
  const [checks, setChecks] = useState<ModuleIdCheck[]>([]);
  const [log, setLog] = useState<EquipmentChange[] | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<{ mode: 'add' | 'edit'; item: Partial<PlatformEquipment> } | null>(null);
  const [idEditing, setIdEditing] = useState<{ kind: 'lub' | 'vib'; id?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [serverTotal, setServerTotal] = useState<number | undefined | null>(null);

  const load = useCallback(
    async (fresh = false) => {
      if (!sessionToken) return;
      setError('');
      if (fresh) setChecking(true);
      try {
        const [eq, ch] = await Promise.all([listEquipmentMaster(sessionToken).catch((e) => ({ error: describeError(e, "Couldn't load the equipment list.") })), fetchIdChecks(sessionToken, fresh)]);
        if ('error' in eq) setError(eq.error as string);
        else {
          setList(eq.equipment);
          setServerTotal(eq.serverTotal);
          if (eq.count < eq.total) setError(`Loaded ${eq.count} of ${eq.total} machines — reload the page to get the rest.`);
        }
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

  // A new Equipment ID / a machine deleted: the platform list first, then
  // each module moves (or deletes) the machine's IDs and history. Run again
  // after a module failed: the platform step is skipped once it is done.
  const key = (s: string) => s.replace(/\s+/g, '').toUpperCase();
  async function equipmentIdChange(op: 'rename' | 'delete', id: string, to = '') {
    if (!sessionToken) return '';
    const listed = (x: string) => (list || []).some((e) => key(e.id) === key(x));
    // A rename the modules would refuse must stop before anything changes:
    // a Lub / Vib ID of this machine whose new name is already taken.
    if (op === 'rename') {
      const clash = renameClash(id, to, [oil, vib]);
      if (clash) throw new Error(clash);
    }
    try {
      if (listed(id)) await saveEquipmentMaster(sessionToken, op, { id, newId: to });
      else if (op === 'rename' && !listed(to)) throw new Error(`${id} is not in the list.`);
      const done: string[] = [];
      for (const m of ID_MODULES) {
        const r = await idAdmin(sessionToken, m.id, op === 'rename' ? { op: 'renameEquipment', from: id, to } : { op: 'deleteEquipment', id });
        done.push(`${m.short}: ${r.summary}`);
      }
      return done.join(' · ');
    } finally {
      setLog(null);
      const eq = await listEquipmentMaster(sessionToken).catch(() => null);
      if (eq) setList(eq.equipment);
      load(true);
    }
  }

  const notConnected = checks.filter((c) => c.failed || !c.connected);

  return (
    <div className="eid-panel" data-testid="equipment-ids">
      <p className="settings-intro">
        <b>Equipment IDs</b> are owned by the platform — added, changed and retired only here. <b>Lub IDs</b> belong to Oil Lubrication and <b>Vib IDs</b> to Vibration Analysis, and each must point to an Equipment ID from this list. The modules show the platform's name, area and contractor. Anything that doesn't match is listed under <b>Not matching</b>; new problems reach you every morning (bell + email).
      </p>
      {error && <div className="eid-msg eid-msg--error">{error}</div>}
      {notice && (
        <div className="eid-msg eid-msg--ok" data-testid="eid-notice">
          {notice}{' '}
          <button type="button" className="eid-link" onClick={() => setNotice('')}>
            OK
          </button>
        </div>
      )}
      {notConnected.map((c) => (
        <div key={c.moduleId} className="eid-msg eid-msg--warn" data-testid={`eid-notconnected-${c.moduleId}`}>
          <b>{c.module}:</b> {c.failed || `not reading the platform list — ${c.error || 'set the script property PLATFORM_CORE_SPREADSHEET_ID'}.`}
        </div>
      ))}

      <div className="eid-tiles">
        <Tile label="Machines on the platform" value={list ? list.filter((e) => !/retired/i.test(e.status)).length : '…'} sub={list ? `${list.filter((e) => /retired/i.test(e.status)).length} retired${serverTotal !== null ? ` · server: ${serverTotal ?? 'no total sent'}` : ''}` : ''} onClick={() => setTab('equipment')} />
        <Tile label="Lub IDs (Oil)" value={oil ? oil.ids.length : '…'} sub={oil ? `${oil.ids.filter((x) => !x.inPlatform).length} not on the platform` : ''} onClick={() => setTab('lub')} />
        <Tile label="Vib IDs (Vibration)" value={vib ? vib.ids.length : '…'} sub={vib ? `${vib.ids.filter((x) => !x.inPlatform).length} not on the platform` : ''} onClick={() => setTab('vib')} />
        <Tile label="Not matching" value={checks.length ? openProblems.length : '…'} sub={checks.length ? `${problems.length - openProblems.length} marked OK` : ''} tone={openProblems.length ? 'danger' : 'ok'} onClick={() => setTab('problems')} testid="eid-tile-problems" />
      </div>

      <div className="eid-tabs" role="tablist" aria-label="Equipment and IDs">
        {(
          [
            ['equipment', 'Equipment'],
            ['areas', 'Areas'],
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

      {tab === 'equipment' && <EquipmentTab list={list} counts={counts} onAdd={readOnly ? undefined : () => setEditing({ mode: 'add', item: { contractor: 'RHI', criticality: 'Medium' } })} onOpen={readOnly ? undefined : (e) => setEditing({ mode: 'edit', item: e })} />}
      {tab === 'areas' && (
        <SectionBoundary name="Areas">
          <AreasTab list={list} readOnly={readOnly} />
        </SectionBoundary>
      )}
      {tab === 'lub' && <IdsTab kind="lub" check={oil} onOpen={readOnly ? undefined : (id) => setIdEditing({ kind: 'lub', id })} />}
      {tab === 'vib' && <IdsTab kind="vib" check={vib} onOpen={readOnly ? undefined : (id) => setIdEditing({ kind: 'vib', id })} />}
      {tab === 'problems' && (
        <ProblemsTab
          problems={problems}
          checks={checks}
          checking={checking}
          onCheck={() => load(true)}
          onAddToPlatform={readOnly ? undefined : (id) => setEditing({ mode: 'add', item: { id, contractor: 'RHI', criticality: 'Medium' } })}
          onMark={readOnly ? undefined : async (p, status) => {
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
          onRename={async (from, to) => setNotice(`${from} is now ${to}. ${await equipmentIdChange('rename', from, to)}`)}
          onDelete={async (id) => {
            setNotice(`${id} deleted with its history. ${await equipmentIdChange('delete', id)}`);
            setEditing(null);
          }}
        />
      )}
      {idEditing && sessionToken && (
        <IdModal
          kind={idEditing.kind}
          id={idEditing.id}
          platformIds={(list || []).map((e) => e.id)}
          sessionToken={sessionToken}
          onClose={() => setIdEditing(null)}
          onDone={(msg) => {
            setIdEditing(null);
            setNotice(msg);
            load(true);
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

function EquipmentTab({ list, counts, onAdd, onOpen }: { list: PlatformEquipment[] | null; counts: { lub: (id: string) => number; vib: (id: string) => number }; onAdd?: () => void; onOpen?: (e: PlatformEquipment) => void }) {
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
        {onAdd && <button type="button" className="eid-primary" onClick={onAdd} data-testid="eid-add">
          <TablerIcon className="ti-plus" size={14} /> Add equipment
        </button>}
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
              <tr key={e.id} className={onOpen ? undefined : 'eid-row-static'} onClick={() => onOpen?.(e)} data-testid={`eid-row-${e.id}`}>
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

function IdsTab({ kind, check, onOpen }: { kind: 'lub' | 'vib'; check?: ModuleIdCheck; onOpen?: (id?: string) => void }) {
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
        Owned by {check.module}{kind === 'lub' ? ' (Equipment Registry tab)' : ' (VIB ID Registry tab)'}.{onOpen ? ` Open one to change, rename or delete it; a new ${label} must point to an Equipment ID from the platform list.` : ''}
      </p>
      <div className="eid-filters">
        <div className="eid-search">
          <IdSearch options={base.map((x) => ({ code: idOf(x), description: x.equipmentId }))} value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder={`${label} or Equipment ID…`} testid={`eid-${kind}-find`} />
        </div>
        <Chips value={only} options={['Not on the platform'] as 'Not on the platform'[]} onChange={setOnly} label="Show" all="All" />
        {onOpen && (
          <button type="button" className="eid-primary" onClick={() => onOpen()} data-testid={`eid-${kind}-add`}>
            <TablerIcon className="ti-plus" size={14} /> Add {label}
          </button>
        )}
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
              <tr key={idOf(x) + i} className={onOpen ? undefined : 'eid-row-static'} onClick={onOpen ? () => onOpen(idOf(x)) : undefined} data-testid={`eid-${kind}-row`}>
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

function ProblemsTab({ problems, checks, checking, onCheck, onAddToPlatform, onMark }: { problems: ModuleProblem[]; checks: ModuleIdCheck[]; checking: boolean; onCheck: () => void; onAddToPlatform?: (id: string) => void; onMark?: (p: ModuleProblem, s: 'OK' | 'Open') => void }) {
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
                {onAddToPlatform && p.kind === 'notInPlatform' && p.status !== 'OK' && (
                  <button type="button" className="eid-secondary" onClick={() => onAddToPlatform(p.id)}>
                    Add to platform
                  </button>
                )}
                {!onMark ? (
                  p.status === 'OK' && <span className="eid-dim">Marked OK</span>
                ) : p.status === 'OK' ? (
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

function EquipmentModal({ mode, item, list, counts, onClose, onSave, onRename, onDelete }: { mode: 'add' | 'edit'; item: Partial<PlatformEquipment>; list: PlatformEquipment[]; counts: { lub: (id: string) => number; vib: (id: string) => number }; onClose: () => void; onSave: (mode: 'add' | 'edit' | 'retire' | 'restore', item: Partial<PlatformEquipment> & { id: string }) => Promise<void>; onRename: (from: string, to: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [f, setF] = useState<Partial<PlatformEquipment>>({ ...item });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newId, setNewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const set = (k: keyof PlatformEquipment, v: string) => setF((x) => ({ ...x, [k]: v }));
  const retired = /retired/i.test(f.status || '');
  // suggestions: the official lines and areas (Areas tab), else the names in use
  const { sessionToken } = useAuth();
  const official = useAreas(sessionToken)?.areas || [];
  const line = areaResolver(official)(f.mainArea || '').line;
  const mainAreas = official.length ? official.filter((x) => x.kind === 'Line').map((x) => x.name) : [...new Set(list.map((e) => e.mainArea).filter(Boolean))].sort();
  const plantAreas = official.length
    ? official.filter((x) => x.kind === 'Area' && (!line || x.line === line)).map((x) => x.name)
    : [...new Set(list.filter((e) => !f.mainArea || e.mainArea === f.mainArea).map((e) => e.plantArea).filter(Boolean))].sort();
  const run = async (m: 'add' | 'edit' | 'retire' | 'restore') => {
    setErr('');
    if (m === 'retire' && (counts.lub(f.id || '') || counts.vib(f.id || '')) && !window.confirm(`${f.id} still has Lub / Vib IDs. Retire it anyway? They will be listed under Not matching.`)) return;
    setBusy(true);
    try {
      let id = String(f.id || '');
      const to = (newId || '').trim().toUpperCase();
      if (m === 'edit' && to && to !== id) {
        await onRename(id, to);
        id = to;
        setF((x) => ({ ...x, id: to }));
        setNewId(null);
      }
      await onSave(m, { ...f, id });
    } catch (e) {
      setErr(errText(e, "Couldn't save."));
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
          {mode === 'edit' && (
            <button type="button" className="eid-danger" disabled={busy} onClick={() => setDeleting(true)} data-testid="eid-delete">
              Delete
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
      {deleting && (
        <DeleteConfirm
          id={String(f.id || '')}
          what={`the machine from the platform list, its ${counts.lub(f.id || '')} Lub IDs and ${counts.vib(f.id || '')} Vib IDs, and all their history in Oil and Vibration (readings, samples, reports, actions, routes)`}
          onCancel={() => setDeleting(false)}
          onDelete={async () => {
            setErr('');
            try {
              await onDelete(String(f.id || ''));
            } catch (e) {
              setErr(errText(e, "Couldn't delete."));
              setDeleting(false);
            }
          }}
        />
      )}
      <FormSection icon="list-details" title="Equipment">
        <div className="eid-form">
          <label>
            <span>Equipment ID</span>
            {mode === 'add' ? (
              <input className="eid-input eid-code" value={f.id || ''} onChange={(e) => set('id', e.target.value.toUpperCase())} placeholder="e.g. 321.FN125" data-testid="eid-f-id" />
            ) : newId === null ? (
              <span className="eid-read eid-code">
                {f.id}{' '}
                <button type="button" className="eid-link" onClick={() => setNewId(f.id || '')} data-testid="eid-change-id">
                  Change ID
                </button>
              </span>
            ) : (
              <input className="eid-input eid-code" value={newId} onChange={(e) => setNewId(e.target.value.toUpperCase())} data-testid="eid-f-newid" autoFocus />
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
            <input className="eid-input" list="eid-main-areas" value={f.mainArea || ''} onChange={(e) => set('mainArea', e.target.value)} placeholder="Line 1, Line 2, Cement Mills 1…" />
            <datalist id="eid-main-areas">{mainAreas.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label>
            <span>Plant area</span>
            <input className="eid-input" list="eid-plant-areas" value={f.plantArea || ''} onChange={(e) => set('plantArea', e.target.value)} placeholder="Kiln 1, Raw Mill 1…" />
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
        {newId !== null && <p className="eid-muted">A new Equipment ID moves everything with it: the machine's Lub IDs and Vib IDs that carry the old ID are renamed too, and all their history follows.</p>}
      </FormSection>
    </ShellModal>
  );
}

// Type the ID to delete it: deleting takes all its history and can't be undone.
function DeleteConfirm({ id, what, onCancel, onDelete }: { id: string; what: string; onCancel: () => void; onDelete: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="eid-msg eid-msg--error eid-delete" data-testid="eid-delete-confirm">
      <b>Delete {id} for good?</b> This removes {what}. It can't be undone.
      <label>
        <span>Type {id} to confirm</span>
        <input className="eid-input eid-code" value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="eid-delete-type" />
      </label>
      <div className="eid-delete-actions">
        <button type="button" className="eid-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="eid-danger"
          disabled={busy || typed.trim().toUpperCase() !== id.toUpperCase()}
          onClick={async () => {
            setBusy(true);
            await onDelete();
            setBusy(false);
          }}
          data-testid="eid-delete-go"
        >
          {busy ? 'Deleting…' : 'Delete for good'}
        </button>
      </div>
    </div>
  );
}

type IdField = { k: string; label: string; options?: string[]; span?: boolean; code?: boolean };
const LUB_FIELDS: IdField[] = [
  { k: 'lubricationLocation', label: 'Lubrication location' },
  { k: 'pointCode', label: 'Point code', code: true },
  { k: 'lubricationPoint', label: 'Lubrication point' },
  { k: 'position', label: 'Position' },
  { k: 'reportEquipmentId', label: 'Lab report Unit ID', code: true },
  { k: 'manufacturer', label: 'Manufacturer' },
  { k: 'model', label: 'Model' },
  { k: 'operatingTempC', label: 'Operating temp (°C)' },
  { k: 'lubricant', label: 'Lubricant type' },
  { k: 'lubricantBrand', label: 'Lubricant brand' },
  { k: 'lubricantQuantityL', label: 'Quantity (L)' },
  { k: 'interval', label: 'Oil analysis interval' },
  { k: 'oilChangeInterval', label: 'Oil change interval' },
  { k: 'oilAnalysisRequired', label: 'Oil analysis required', options: ['Yes', 'No'] },
  { k: 'status', label: 'Status', options: ['Active', 'Inactive'] },
];
const VIB_FIELDS: IdField[] = [
  { k: 'positionCode', label: 'Position code', code: true },
  { k: 'description', label: 'Point description', span: true },
  { k: 'family', label: 'Family', options: ['RMS', 'SPM', 'Gs'] },
  { k: 'readingColumns', label: 'Reading columns' },
  { k: 'status', label: 'Status', options: ['Active', 'Inactive'] },
];

// Settings → Equipment & IDs → Lub IDs / Vib IDs: add one, or open one to
// change its fields, give it a new ID (its history follows) or delete it
// with its history (backend IdAdmin.js in the module).
function IdModal({ kind, id, platformIds, sessionToken, onClose, onDone }: { kind: 'lub' | 'vib'; id?: string; platformIds: string[]; sessionToken: string; onClose: () => void; onDone: (msg: string) => void }) {
  const moduleId = kind === 'lub' ? 'oil-analysis' : 'vibration-analysis';
  const label = kind === 'lub' ? 'Lub ID' : 'Vib ID';
  const idKey = kind === 'lub' ? 'lpId' : 'vibId';
  const fields = kind === 'lub' ? LUB_FIELDS : VIB_FIELDS;
  const T = kind === 'lub' ? 'Lub' : 'Vib';
  const [f, setF] = useState<Record<string, string> | null>(id ? null : { status: 'Active', ...(kind === 'vib' ? { family: 'RMS' } : { oilAnalysisRequired: 'Yes' }) });
  const [newId, setNewId] = useState(id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!id) return;
    idAdmin(sessionToken, moduleId, { op: `get${T}`, id })
      .then((r) => setF(r.item || {}))
      .catch((e) => setErr(errText(e, "Couldn't open it.")));
  }, [id, sessionToken, moduleId, T]);
  const set = (k: string, v: string) => setF((x) => ({ ...(x || {}), [k]: v }));
  const save = async () => {
    if (!f) return;
    setErr('');
    setBusy(true);
    try {
      const to = newId.trim();
      const msgs: string[] = [];
      if (id && to && to !== id) {
        const r = await idAdmin(sessionToken, moduleId, { op: `rename${T}`, from: id, to });
        msgs.push(`${id} is now ${to} (${r.summary}).`);
      }
      await idAdmin(sessionToken, moduleId, { op: `save${T}`, mode: id ? 'edit' : 'add', item: { ...f, [idKey]: to || id } });
      onDone(msgs.join(' ') || `${to || id} ${id ? 'saved' : 'added'}.`);
    } catch (e) {
      setErr(errText(e, "Couldn't save."));
      setBusy(false);
    }
  };
  return (
    <ShellModal
      icon={kind === 'lub' ? 'droplet' : 'activity'}
      title={id || `Add ${label}`}
      subtitle={kind === 'lub' ? 'Oil Lubrication · Equipment Registry' : 'Vibration Analysis · VIB ID Registry'}
      onClose={onClose}
      width={640}
      testid="eid-id-modal"
      footer={
        <>
          {id && (
            <button type="button" className="eid-danger" disabled={busy || !f} onClick={() => setDeleting(true)} data-testid="eid-id-delete">
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="eid-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="eid-primary" disabled={busy || !f || !newId.trim() || !(f.equipmentId || '').trim()} onClick={save} data-testid="eid-id-save">
            {busy ? 'Saving…' : id ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      {err && <div className="eid-msg eid-msg--error">{err}</div>}
      {deleting && id && (
        <DeleteConfirm
          id={id}
          what={kind === 'lub' ? 'the Lub ID with all its samples, actions, oil changes, top ups and route items (stock movements stay, without the link)' : 'the Vib ID with all its readings, report entries, limits and route points'}
          onCancel={() => setDeleting(false)}
          onDelete={async () => {
            setErr('');
            try {
              const r = await idAdmin(sessionToken, moduleId, { op: `delete${T}`, id });
              onDone(`${id} deleted with its history (${r.summary}).`);
            } catch (e) {
              setErr(errText(e, "Couldn't delete."));
              setDeleting(false);
            }
          }}
        />
      )}
      {!f ? (
        !err && <p className="eid-muted">Loading…</p>
      ) : (
        <>
          <FormSection icon="list-details" title={label}>
            <div className="eid-form">
              <label>
                <span>{label}</span>
                <input className="eid-input eid-code" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={kind === 'lub' ? 'e.g. LP-321.FN125-GB-R' : 'e.g. Vb-321.FN125-MDE-RMS'} data-testid="eid-id-f-id" />
              </label>
              <label>
                <span>Equipment ID</span>
                <input className="eid-input eid-code" list="eid-platform-ids" value={f.equipmentId || ''} onChange={(e) => set('equipmentId', e.target.value.toUpperCase())} data-testid="eid-id-f-eq" />
                <datalist id="eid-platform-ids">{platformIds.map((x) => <option key={x} value={x} />)}</datalist>
              </label>
            </div>
            {id && newId.trim() && newId.trim() !== id && <p className="eid-muted">A new {label} moves all its history with it.</p>}
          </FormSection>
          <FormSection icon="adjustments" title="Details">
            <div className="eid-form">
              {fields.map((x) =>
                x.options ? (
                  <div key={x.k}>
                    <span className="eid-label">{x.label}</span>
                    <Chips value={f[x.k] || x.options[0]} options={x.options} onChange={(v) => set(x.k, v)} label={x.label} />
                  </div>
                ) : (
                  <label key={x.k} className={x.span ? 'eid-span2' : undefined}>
                    <span>{x.label}</span>
                    <input className={x.code ? 'eid-input eid-code' : 'eid-input'} value={f[x.k] || ''} onChange={(e) => set(x.k, e.target.value)} />
                  </label>
                ),
              )}
            </div>
            <p className="eid-muted">Contractor and area come from the platform's Equipment ID.</p>
          </FormSection>
        </>
      )}
    </ShellModal>
  );
}

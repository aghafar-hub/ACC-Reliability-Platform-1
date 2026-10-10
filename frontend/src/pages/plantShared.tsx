import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ORG_ACC } from '../auth/session';
import { useEmbeddedNav, type NavRecord } from '../embeddedNav';
import { canOpenModule, useModuleAccess } from '../moduleAccess';
import { areaLabel, areaResolver, useAreas } from '../areas';
import { CONDITION_SYMBOL, mergeMachines, PLANT_MODULES, usePlant, WORD_SYMBOL, type Condition, type MergedMachine } from '../plant';

// Shared by the Plant overview (Home) and the platform Equipment pages.
export function usePlantData() {
  const { claims, sessionToken } = useAuth();
  const areaList = useAreas(sessionToken);
  const user = claims?.userId || claims?.email || '';
  const state = usePlant(user);
  const { access } = useModuleAccess();
  const embeddedNav = useEmbeddedNav();
  const navigate = useNavigate();
  const modules = PLANT_MODULES.filter((m) => canOpenModule(access[m.moduleId]));
  const allowed = modules.map((m) => m.moduleId);
  const key = allowed.map((id) => state[id]?.updatedAt || '').join('|');
  // every machine's area as the official name (Settings → Equipment & IDs → Areas)
  const machines = useMemo(() => {
    const resolve = areaResolver(areaList?.areas || [], areaList?.machines || {});
    return mergeMachines(state, allowed).map((m) => {
      // the other module's name is the line hint (Vibration knows the line)
      const hint = Object.values(m.parts).map((p) => p.area).find((a) => a && a !== m.area) || '';
      const r = resolve(m.area, m.id, hint);
      return { ...m, rawArea: m.area, area: areaLabel(r), line: r.line };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when a summary or the area list changes
  }, [key, allowed.join(','), areaList]);
  // a module whose data couldn't load (its own sync failed, or nothing came
  // within 20 s) and has no saved copy on this device
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 20000);
    return () => clearTimeout(t);
  }, []);
  const failed = modules.filter((m) => !state[m.moduleId] && (waited || embeddedNav.syncInfoFor(m.moduleId)?.syncState === 'error')).map((m) => m.moduleId);
  const loading = modules.some((m) => !state[m.moduleId] && !failed.includes(m.moduleId));
  const openModule = (moduleId: string, page: string, record?: NavRecord) => {
    const m = PLANT_MODULES.find((x) => x.moduleId === moduleId);
    if (!m) return;
    embeddedNav.navigateTo(moduleId, page, record);
    navigate(m.route);
  };
  return { state, modules, allowed, machines, loading, failed, openModule, contractorStaff: !!claims && claims.orgId !== ORG_ACC };
}

// Area filter: "All", a whole line, or one area — grouped by line, in the
// order of the official list; names nobody has mapped yet at the end.
export function areaMatch(m: MergedMachine, value: string) {
  if (value === 'All') return true;
  if (value.startsWith('line:')) return m.line === value.slice(5);
  return m.area === value.slice(5);
}

export function AreaSelect({ machines, value, onChange }: { machines: MergedMachine[]; value: string; onChange: (v: string) => void }) {
  const { sessionToken } = useAuth();
  const areaList = useAreas(sessionToken);
  const used = new Set(machines.map((m) => m.area).filter(Boolean));
  const usedLines = new Set(machines.map((m) => m.line).filter(Boolean));
  const official = areaList?.areas || [];
  const lines = official.filter((x) => x.kind === 'Line' && usedLines.has(x.name));
  const known = new Set(official.map((x) => x.name));
  const other = [...used].filter((a) => !known.has(a)).sort();
  if (used.size < 2) return null;
  return (
    <select className="plant-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Area" data-testid="plant-area">
      <option value="All">All areas</option>
      {lines.map((l) => (
        <optgroup key={l.name} label={l.name}>
          <option value={`line:${l.name}`}>All of {l.name}</option>
          {official
            .filter((x) => x.kind === 'Area' && x.line === l.name && used.has(x.name))
            .map((x) => (
              <option key={x.name} value={`area:${x.name}`}>
                {x.name}
              </option>
            ))}
        </optgroup>
      ))}
      {other.length > 0 && (
        <optgroup label="Not in the area list yet">
          {other.map((a) => (
            <option key={a} value={`area:${a}`}>
              {a}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function ConditionPill({ condition, big }: { condition: Condition; big?: boolean }) {
  if (!condition) return <span className={`plant-pill plant-pill--none${big ? ' plant-pill--big' : ''}`}>Not checked</span>;
  return (
    <span className={`plant-pill plant-pill--${condition}${big ? ' plant-pill--big' : ''}`}>
      {CONDITION_SYMBOL[condition]} {condition}
    </span>
  );
}

// A module's own word on a machine (e.g. "Vib ■ Danger").
export function ModuleTag({ short, word, condition }: { short: string; word: string; condition: Condition }) {
  return (
    <span className={`plant-mod plant-mod--${condition || 'none'}${word === 'Danger' ? ' plant-mod--danger' : ''}`}>
      {short} {word ? `${WORD_SYMBOL[word] || ''} ${word}` : '· not checked'}
    </span>
  );
}

export function ConditionBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((n, x) => n + x, 0) || 1;
  return (
    <span className="plant-bar" aria-hidden="true">
      {(['Good', 'Fair', 'Poor', ''] as const).map((c) =>
        counts[c] ? <i key={c || 'none'} className={`plant-bar-${c || 'none'}`} style={{ width: `${(counts[c] / total) * 100}%` }} /> : null,
      )}
    </span>
  );
}

export function countConditions(list: { condition: Condition }[]) {
  const n: Record<string, number> = { Good: 0, Fair: 0, Poor: 0, '': 0 };
  list.forEach((m) => (n[m.condition] = (n[m.condition] || 0) + 1));
  return n;
}

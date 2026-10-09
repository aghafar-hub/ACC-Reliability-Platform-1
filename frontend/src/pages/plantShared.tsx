import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ORG_ACC } from '../auth/session';
import { useEmbeddedNav, type NavRecord } from '../embeddedNav';
import { canOpenModule, useModuleAccess } from '../moduleAccess';
import { CONDITION_SYMBOL, mergeMachines, PLANT_MODULES, usePlant, WORD_SYMBOL, type Condition } from '../plant';

// Shared by the Plant overview (Home) and the platform Equipment pages.
export function usePlantData() {
  const { claims } = useAuth();
  const user = claims?.userId || claims?.email || '';
  const state = usePlant(user);
  const { access } = useModuleAccess();
  const embeddedNav = useEmbeddedNav();
  const navigate = useNavigate();
  const modules = PLANT_MODULES.filter((m) => canOpenModule(access[m.moduleId]));
  const allowed = modules.map((m) => m.moduleId);
  const key = allowed.map((id) => state[id]?.updatedAt || '').join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when a summary changes
  const machines = useMemo(() => mergeMachines(state, allowed), [key, allowed.join(',')]);
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

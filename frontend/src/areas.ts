import { useEffect, useState } from 'react';
import { getAreas, type AreaEntry, type AreaList } from './api/platformCore';

// The official area names (Settings → Equipment & IDs → Areas). Every page
// shows a machine's area through resolveArea, so "CM1", "CementMill1" and
// "Cement Mill 1" all read "Cement Mill 1". A name nobody has mapped yet is
// shown as it is. Loaded once per session; kept on the device for the next
// first paint; the Areas page updates it after a save.

export const areaKey = (s: string) => String(s || '').toLowerCase().replace(/[\s#._\-/]+/g, '');

export type ResolvedArea = { area: string; line: string };
const idKey = (s: string) => String(s || '').replace(/\s+/g, '').toUpperCase();

// resolve(raw, equipmentId, hint): 1. a machine on the platform equipment
// list takes its place from there; 2. else its own name in the official
// list — a name standing for areas on two lines (Raw Meal) is decided by
// `hint`, the machine's line; 3. else the name as it is. (The modules use
// the same rules: apps/*/src/officialAreas.js.)
export function areaResolver(list: AreaEntry[], machines: Record<string, string> = {}) {
  const names = new Map<string, ResolvedArea[]>();
  list.forEach((x) => {
    const r: ResolvedArea = x.kind === 'Line' ? { area: '', line: x.name } : { area: x.name, line: x.line };
    [x.name, ...x.aliases].forEach((n) => {
      const k = areaKey(n);
      const c = names.get(k) || [];
      if (!c.some((y) => y.area === r.area && y.line === r.line)) c.push(r);
      names.set(k, c);
    });
  });
  const byName = (raw: string, hintLine = ''): ResolvedArea | null => {
    const c = names.get(areaKey(raw)) || [];
    if (c.length === 1) return c[0];
    if (c.length > 1) return c.find((x) => x.line === hintLine) || null;
    return null;
  };
  return (raw: string, id?: string, hint?: string): ResolvedArea => {
    const onList = id ? machines[idKey(id)] : '';
    if (onList) {
      const [plant, main] = onList.split('|');
      const line = (main && byName(main)?.line) || '';
      const p = plant ? byName(plant, line) : null;
      if (p) return p;
      if (line) return { area: '', line };
    }
    const hintLine = hint ? byName(hint)?.line || '' : '';
    return byName(raw, hintLine) || { area: raw || '', line: hintLine };
  };
}

// The label a machine shows: its area, else its line.
export const areaLabel = (r: ResolvedArea) => r.area || r.line;

const KEY = 'acc.areas.v1';
let store: AreaList | null = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AreaList) : null;
  } catch {
    return null;
  }
})();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

// the embedded modules read the same list (apps/*/src/officialAreas.js)
function publish(list: AreaList | null) {
  try {
    (window as unknown as { __accAreas?: AreaList | null }).__accAreas = list;
    window.dispatchEvent(new Event('acc-areas'));
  } catch {
    /* no window (tests) */
  }
}
publish(store);

export function setAreas(list: AreaList) {
  store = list;
  publish(list);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* blocked storage: the live copy still works */
  }
  listeners.forEach((l) => l());
}

export function useAreas(sessionToken: string | null | undefined): AreaList | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    if (sessionToken && !loading) {
      loading = getAreas(sessionToken)
        .then(setAreas)
        .catch(() => {
          loading = null; // try again on the next page that asks
        });
    }
    return () => {
      listeners.delete(l);
    };
  }, [sessionToken]);
  return store;
}

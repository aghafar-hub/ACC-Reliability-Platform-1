import { useEffect, useState } from 'react';
import { getAreas, type AreaEntry, type AreaList } from './api/platformCore';

// The official area names (Settings → Equipment & IDs → Areas). Every page
// shows a machine's area through resolveArea, so "CM1", "CementMill1" and
// "Cement Mill 1" all read "Cement Mill 1". A name nobody has mapped yet is
// shown as it is. Loaded once per session; kept on the device for the next
// first paint; the Areas page updates it after a save.

export const areaKey = (s: string) => String(s || '').toLowerCase().replace(/[\s#._\-/]+/g, '');

export type ResolvedArea = { area: string; line: string; known: boolean };

export function areaResolver(list: AreaEntry[]) {
  const map = new Map<string, ResolvedArea>();
  list.forEach((x) => {
    const r: ResolvedArea = x.kind === 'Line' ? { area: '', line: x.name, known: true } : { area: x.name, line: x.line, known: true };
    [x.name, ...x.aliases].forEach((n) => map.set(areaKey(n), r));
  });
  return (raw: string): ResolvedArea => {
    if (!raw) return { area: '', line: '', known: false };
    return map.get(areaKey(raw)) || { area: raw, line: '', known: false };
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

export function setAreas(list: AreaList) {
  store = list;
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

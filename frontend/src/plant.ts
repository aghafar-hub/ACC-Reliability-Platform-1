import { useEffect, useState } from 'react';

// Plant overview (Home) + Equipment: each module hands the shell a summary
// per machine over the navBridge (NavBridge.onPlant — see
// apps/*/src/plantSummary.js), built from the data it already holds, so the
// same health rules apply everywhere and contractors only ever get their
// own machines. The shell keeps the latest copy per user on the device, so
// Home opens at once and works offline.

export type Condition = 'Good' | 'Fair' | 'Poor' | '';
export type Fact = { label: string; value: string; tone?: string };
export type PlantEvent = { date: string; label: string; tone?: string };
export type PlantMachine = {
  id: string;
  name: string;
  area: string;
  contractor: string;
  condition: Condition;
  word: string;
  reasons: string[];
  openActions: number;
  overdueActions: number;
  facts: Fact[];
  events: PlantEvent[];
  nextDue: { date: string; label: string; late?: boolean } | null;
  changeOverdue?: boolean; // oil
  measureLate?: boolean; // vibration
};
export type PlantSummary = {
  moduleId: string;
  label: string;
  updatedAt: string;
  machines: PlantMachine[];
  kpis: { label: string; value: string | number; sub?: string; tone?: string }[];
  attention: { key: string; label: string; count: number; tone: string; examples: string[]; page: string }[];
};

export const PLANT_MODULES = [
  { moduleId: 'oil-analysis', label: 'Oil lubrication', short: 'Oil', route: '/oil-lubrication' },
  { moduleId: 'vibration-analysis', label: 'Vibration', short: 'Vib', route: '/vibration-analysis' },
] as const;

const RANK: Record<string, number> = { '': 0, Good: 1, Fair: 2, Poor: 3 };
export const conditionRank = (c: string) => RANK[c] ?? 0;
export const CONDITION_SYMBOL: Record<string, string> = { Good: '●', Fair: '▲', Poor: '◆' };
export const WORD_SYMBOL: Record<string, string> = { Good: '●', Normal: '●', Fair: '▲', Caution: '▲', Poor: '◆', Alert: '◆', Danger: '■' };

const store: Record<string, PlantSummary | null> = {};
const listeners = new Set<() => void>();
let currentUser = '';
const keyFor = (user: string, moduleId: string) => `acc.plant.v1.${user}.${moduleId}`;

function loadFor(user: string) {
  PLANT_MODULES.forEach(({ moduleId }) => {
    try {
      const raw = localStorage.getItem(keyFor(user, moduleId));
      store[moduleId] = raw ? (JSON.parse(raw) as PlantSummary) : null;
    } catch {
      store[moduleId] = null;
    }
  });
}

// Called by the embedded module's bridge whenever its data changes.
export function setPlant(user: string, moduleId: string, summary: PlantSummary) {
  if (!user || !summary || !Array.isArray(summary.machines)) return;
  if (user !== currentUser) {
    currentUser = user;
    loadFor(user);
  }
  store[moduleId] = summary;
  try {
    localStorage.setItem(keyFor(user, moduleId), JSON.stringify(summary));
  } catch {
    /* full or blocked storage: the live copy still works */
  }
  listeners.forEach((l) => l());
}

export type PlantState = Record<string, PlantSummary | null>;

export function usePlant(user: string): PlantState {
  const [, setTick] = useState(0);
  if (user && user !== currentUser) {
    currentUser = user;
    loadFor(user);
  }
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { ...store };
}

// One row per Equipment ID across the modules.
export type MergedMachine = {
  id: string;
  name: string;
  area: string;
  contractor: string;
  condition: Condition;
  parts: Record<string, PlantMachine>;
  reasons: { module: string; text: string }[];
  openActions: number;
  overdueActions: number;
};

export function mergeMachines(state: PlantState, allowed: string[]): MergedMachine[] {
  const map = new Map<string, MergedMachine>();
  PLANT_MODULES.forEach(({ moduleId, short }) => {
    if (!allowed.includes(moduleId)) return;
    (state[moduleId]?.machines || []).forEach((m) => {
      let x = map.get(m.id);
      if (!x) {
        x = { id: m.id, name: m.name, area: m.area, contractor: m.contractor, condition: '', parts: {}, reasons: [], openActions: 0, overdueActions: 0 };
        map.set(m.id, x);
      }
      x.parts[moduleId] = m;
      // oil's names/areas first (the plant areas); vibration fills the gaps
      x.name ||= m.name;
      x.area ||= m.area;
      x.contractor ||= m.contractor;
      if (conditionRank(m.condition) > conditionRank(x.condition)) x.condition = m.condition;
      m.reasons.forEach((t) => x!.reasons.push({ module: short, text: t }));
      x.openActions += m.openActions || 0;
      x.overdueActions += m.overdueActions || 0;
    });
  });
  return [...map.values()].sort(
    (a, b) => conditionRank(b.condition) - conditionRank(a.condition) || b.overdueActions - a.overdueActions || a.id.localeCompare(b.id),
  );
}

export const poorOnBoth = (m: MergedMachine) =>
  Object.keys(m.parts).length > 1 && Object.values(m.parts).every((p) => p.condition === 'Poor');

// My Work across modules (Phase 9).
//
// Every module that has work for people answers the same request, GET
// getMyWork, in the same shape (below), and sets myWork: true on its entry
// in MODULE_BACKENDS. This page then shows it with no module-specific code:
// a new module plugs in by implementing getMyWork on its backend.
//
// What goes in a module's answer is decided by that module from the
// person's roles (oil: backend/oil-lubrication/src/MyWork.js).

import { MODULE_BACKENDS, moduleGet, tabLevel, type ModuleAccess, type ModuleBackend } from './moduleAccess';

export type WorkItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  flag?: 'overdue' | 'returned' | 'due' | '';
  link?: { page: string; recordId?: string };
};

export type WorkSection = {
  id: string;
  title: string;
  hint?: string;
  severity: 'action' | 'warning' | 'info';
  total: number;
  // only sums up records listed elsewhere (e.g. team summary) — not counted
  summary?: boolean;
  items: WorkItem[];
};

export type Covering = { from: string; until: string; id: string };

export type ModuleWork = {
  moduleId: string;
  moduleName: string;
  sections: WorkSection[];
  error?: string;
  // responsible-engineer work through a delegation (backend ModuleAccess.js)
  covering?: Covering[];
  listed?: boolean;
};

// Modules that provide My Work and that this person can see My Work in
// (only once their access to the module is known).
export function myWorkModules(access: Record<string, ModuleAccess | undefined>): ModuleBackend[] {
  return MODULE_BACKENDS.filter((m) => m.myWork && !!access[m.id] && tabLevel(access[m.id], 'mywork') !== 'Hidden');
}

export async function fetchMyWork(sessionToken: string, modules: ModuleBackend[]): Promise<ModuleWork[]> {
  const results = await Promise.allSettled(modules.map((m) => moduleGet(m.id, sessionToken, { action: 'getMyWork' })));
  return results.map((r, i) => {
    const m = modules[i];
    if (r.status === 'rejected') return { moduleId: m.id, moduleName: m.name, sections: [], error: "Couldn't load — try again." };
    const json = r.value || {};
    if (json.error) return { moduleId: m.id, moduleName: m.name, sections: [], error: String(json.error) };
    return {
      moduleId: m.id,
      moduleName: json.moduleName || m.name,
      sections: Array.isArray(json.sections) ? json.sections : [],
      covering: Array.isArray(json.covering) ? json.covering : [],
      listed: !!json.listed,
    };
  });
}

// ─── My team (managers) ──────────────────────────────────────────────────────
// Every module answers GET getTeamHistory the same way (backend
// ModuleAccess.js maTeamHistory_ + the module's TeamHistory.js).

export type TeamEvent = {
  who: string;
  date: string;
  kind: string;
  label: string;
  title: string;
  contractor: string;
  home: string;
  side: 'ACC' | 'Contractor' | 'Technician';
  link?: { page: string; recordId?: string };
  onTime: boolean | null;
  days: number | null;
  covering: string;
  moduleId: string;
  moduleName: string;
};
export type TeamPerson = { email: string; name: string; contractor: string; kind: 'engineer' | 'technician'; listed: boolean; open: number; overdue: number };
export type TeamWaiting = { contractor: string; waiting: number; overdue: number; moduleId: string; moduleName: string };
// techOnly: a contractor's responsible engineer — their own technicians only.
export type TeamHistory = { people: TeamPerson[]; events: TeamEvent[]; teams: TeamWaiting[]; scope: string; failed: string[]; techOnly: boolean };

export async function fetchTeamHistory(sessionToken: string, from: string, to: string): Promise<TeamHistory> {
  const modules = MODULE_BACKENDS.filter((m) => m.myWork);
  const results = await Promise.allSettled(modules.map((m) => moduleGet(m.id, sessionToken, { action: 'getTeamHistory', from, to })));
  const people = new Map<string, TeamPerson>();
  const events: TeamEvent[] = [];
  const teams: TeamWaiting[] = [];
  const failed: string[] = [];
  let scope = '';
  let answered = 0;
  let techOnly = 0;
  results.forEach((r, i) => {
    const m = modules[i];
    const j = r.status === 'fulfilled' ? r.value : null;
    if (!j) {
      failed.push(m.name);
      return;
    }
    // not responsible in this module (or it doesn't provide team history)
    if (j.status !== 'ok') return;
    answered++;
    if (j.techOnly) techOnly++;
    scope = scope || j.scope;
    (j.people || []).forEach((p: TeamPerson) => {
      const had = people.get(p.email);
      if (!had) people.set(p.email, { ...p });
      else {
        had.open += p.open;
        had.overdue += p.overdue;
        had.listed = had.listed || p.listed;
        had.name = had.name || p.name;
        if (p.kind === 'engineer') had.kind = 'engineer';
      }
    });
    (j.events || []).forEach((e: TeamEvent) => events.push({ ...e, moduleId: m.id, moduleName: m.name }));
    (j.teams || []).forEach((t: TeamWaiting) => teams.push({ ...t, moduleId: m.id, moduleName: m.name }));
  });
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { people: [...people.values()], events, teams, scope, failed, techOnly: answered > 0 && techOnly === answered };
}

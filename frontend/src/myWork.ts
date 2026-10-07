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
  items: WorkItem[];
};

export type ModuleWork = {
  moduleId: string;
  moduleName: string;
  sections: WorkSection[];
  error?: string;
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
    return { moduleId: m.id, moduleName: json.moduleName || m.name, sections: Array.isArray(json.sections) ? json.sections : [] };
  });
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OIL_API_SECRET } from './api/oilLubrication';
import { useAuth } from './auth/AuthContext';
import { OIL_ANALYSIS_URL, VIBRATION_ANALYSIS_URL } from './config';

// Phase 0 — Module Access. Each module backend decides who may open it,
// which tabs they see (Hidden / View / Edit) and whether the module is
// Active, in Maintenance or Off (see backend/*/src/ModuleAccess.js). This
// file asks each backend "what can I do here?" right after login, keeps the
// answer fresh, and shares it with:
//   - the shell (menu, maintenance banner, no-access screens, My Work), via
//     useModuleAccess();
//   - the embedded module apps, via window.__accModuleAccess, which their
//     api.js reads before every save (separate bundles — no shared React
//     tree to pass it through).
// The backend enforces the same rules on every request; this only decides
// what to show.

export type TabLevel = 'Hidden' | 'View' | 'Edit';
export type ModuleStatus = 'Active' | 'Maintenance' | 'Off';

export type ModuleAccess = {
  moduleId: string;
  moduleName: string;
  enforced: boolean;
  status: ModuleStatus;
  version: string;
  releasedDate: string;
  admin: boolean;
  member: boolean;
  responsibilities: string[];
  contractor: string;
  tabs: Record<string, TabLevel>;
};

export type ModuleBackend = { id: string; name: string; url: string; secret?: string };

export const MODULE_BACKENDS: ModuleBackend[] = [
  { id: 'oil-analysis', name: 'Oil Lubrication', url: OIL_ANALYSIS_URL, secret: OIL_API_SECRET },
  { id: 'vibration-analysis', name: 'Vibration Analysis', url: VIBRATION_ANALYSIS_URL },
];

export function moduleBackend(moduleId: string): ModuleBackend {
  const m = MODULE_BACKENDS.find((b) => b.id === moduleId);
  if (!m) throw new Error(`Unknown module ${moduleId}`);
  return m;
}

const REFRESH_MS = 2 * 60 * 1000;
const STORAGE_PREFIX = 'acc.moduleAccess.v1:';

// ─── Talking to a module backend ─────────────────────────────────────────────

export async function moduleGet(moduleId: string, sessionToken: string, params: Record<string, string>): Promise<any> {
  const m = moduleBackend(moduleId);
  const url = new URL(m.url);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (m.secret) url.searchParams.set('secret', m.secret);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    url.searchParams.set('_', `${Date.now()}_${attempt}`);
    try {
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

// Admin writes. text/plain keeps it a "simple" request (no CORS preflight,
// which Apps Script can't answer). Callers re-read the settings afterwards
// either way — that read is the real confirmation.
export async function modulePost(moduleId: string, sessionToken: string, body: Record<string, unknown>): Promise<{ status?: string; message?: string; error?: string }> {
  const m = moduleBackend(moduleId);
  const payload: Record<string, unknown> = { ...body, sessionToken };
  if (m.secret) payload.secret = m.secret;
  const res = await fetch(m.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// A backend that hasn't had Phase 0 deployed yet answers getMyAccess with
// its generic "ok" reply — treat that as full access, i.e. exactly the
// behaviour before Phase 0, so the frontend can safely go live first.
function legacyAccess(backend: ModuleBackend): ModuleAccess {
  return {
    moduleId: backend.id,
    moduleName: backend.name,
    enforced: false,
    status: 'Active',
    version: '',
    releasedDate: '',
    admin: false,
    member: true,
    responsibilities: [],
    contractor: '',
    tabs: {},
  };
}

async function fetchMyAccess(backend: ModuleBackend, sessionToken: string): Promise<ModuleAccess> {
  const json = await moduleGet(backend.id, sessionToken, { action: 'getMyAccess' });
  if (!json || json.moduleId !== backend.id) return legacyAccess(backend);
  return json as ModuleAccess;
}

// ─── Rules shared by the shell (the embedded apps keep their own copy) ───────

/**
 * Unknown access (still loading, or the backend unreachable with nothing
 * cached) is treated as allowed — the server still has the final say.
 * Off hides the module from everyone, the App Owner included; it's turned
 * back on from Settings > General > Module Access, which stays reachable.
 */
export function canOpenModule(a: ModuleAccess | undefined): boolean {
  if (!a) return true;
  if (a.status === 'Off') return false;
  if (a.admin || !a.enforced) return true;
  return a.member;
}

/** True when this person can see some tab of the module other than My Work. */
export function hasModuleTabsBeyondMyWork(a: ModuleAccess | undefined): boolean {
  if (!a || !a.enforced || !canOpenModule(a)) return false;
  if (a.admin) return true;
  return Object.entries(a.tabs).some(([tabId, level]) => tabId !== 'mywork' && level !== 'Hidden');
}

export function tabLevel(a: ModuleAccess | undefined, tabId: string): TabLevel {
  if (!a || a.admin || !a.enforced) return 'Edit';
  if (!canOpenModule(a)) return 'Hidden';
  return a.tabs[tabId] || 'Hidden';
}

export function canSave(a: ModuleAccess | undefined, tabId: string): boolean {
  if (!a || a.admin) return true;
  if (a.status === 'Maintenance' && a.enforced) return false;
  return tabLevel(a, tabId) === 'Edit';
}

// ─── Provider ────────────────────────────────────────────────────────────────

type ModuleAccessContextValue = {
  access: Record<string, ModuleAccess | undefined>;
  /** True once every module has answered (or failed) at least once. */
  settled: boolean;
  refresh: () => Promise<void>;
};

const ModuleAccessContext = createContext<ModuleAccessContextValue>({ access: {}, settled: true, refresh: async () => {} });

declare global {
  interface Window {
    __accModuleAccess?: { get: (moduleId: string) => ModuleAccess | undefined };
  }
}

function readCache(email: string): Record<string, ModuleAccess> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + email.toLowerCase());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(email: string, access: Record<string, ModuleAccess | undefined>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + email.toLowerCase(), JSON.stringify(access));
  } catch {
    // storage full or blocked — the in-memory copy still works
  }
}

export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const { sessionToken, claims } = useAuth();
  const email = claims?.email || '';
  const [access, setAccess] = useState<Record<string, ModuleAccess | undefined>>(() => (email ? readCache(email) : {}));
  const [settled, setSettled] = useState(false);
  const accessRef = useRef(access);
  useEffect(() => {
    accessRef.current = access;
  }, [access]);

  // Published for the embedded module bundles (see the file comment).
  useEffect(() => {
    window.__accModuleAccess = { get: (moduleId) => accessRef.current[moduleId] };
    return () => {
      delete window.__accModuleAccess;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    const results = await Promise.allSettled(MODULE_BACKENDS.map((b) => fetchMyAccess(b, sessionToken)));
    setAccess((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        // A failed fetch keeps the last known answer (offline at the plant).
        if (r.status === 'fulfilled') next[MODULE_BACKENDS[i].id] = r.value;
      });
      if (email) writeCache(email, next);
      return next;
    });
    setSettled(true);
  }, [sessionToken, email]);

  useEffect(() => {
    setAccess(email ? readCache(email) : {});
    setSettled(false);
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, email]);

  const value = useMemo(() => ({ access, settled, refresh }), [access, settled, refresh]);
  return <ModuleAccessContext.Provider value={value}>{children}</ModuleAccessContext.Provider>;
}

export function useModuleAccess() {
  return useContext(ModuleAccessContext);
}

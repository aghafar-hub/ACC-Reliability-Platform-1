import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { ROLE } from './auth/session';
import { getSettingsAccess, type SettingsAccess, type SettingsLevel } from './api/platformCore';
import { useModuleAccess } from './moduleAccess';

// Who sees which Settings page (Settings → Settings access, Platform Core
// SettingsAccess.js). "Responsible" on a module's settings means Edit for
// that module's ACC responsible engineer, View for the rest. Kept on the
// device so Settings opens at once; read again after each save.

type Levels = Record<string, 'Hidden' | 'View' | 'Edit'>;
type Ctx = { levels: Levels; full: SettingsAccess | null; reload: () => Promise<void>; legacy: boolean };
const SettingsAccessContext = createContext<Ctx | null>(null);
const KEY = 'acc.settingsAccess.v1:';

// Before Platform Core has SettingsAccess.js: the rules the app had before.
function legacyLevels(roles: string[], canDelegate: boolean): Levels {
  const owner = roles.includes(ROLE.ADMIN);
  const e = (b: boolean) => (b ? 'Edit' : 'Hidden');
  return {
    appearance: 'Edit',
    language: owner ? 'Edit' : 'View',
    delegations: e(owner || canDelegate),
    users: e(owner),
    'module-access': e(owner),
    'settings-access': e(owner),
    'equipment-ids': e(owner),
    email: e(owner),
    'oil-analysis': owner ? 'Edit' : 'View',
    'vibration-analysis': owner ? 'Edit' : 'View',
  };
}

export function SettingsAccessProvider({ children }: { children: ReactNode }) {
  const { sessionToken, claims } = useAuth();
  const { access } = useModuleAccess();
  const roles = claims?.roles || [];
  const email = claims?.email || '';
  const canDelegate =
    roles.some((r) => r === ROLE.RELIABILITY_ENGINEER || r === ROLE.CONTRACTOR_ENGINEER || r === ROLE.MANAGER || r === ROLE.CONTRACTOR_MANAGER) ||
    Object.values(access).some((a) => a?.responsibilities?.some((x) => /Responsible Engineer|Manager/.test(x)));
  const [full, setFull] = useState<SettingsAccess | null>(() => {
    try {
      const raw = localStorage.getItem(KEY + email);
      return raw ? (JSON.parse(raw) as SettingsAccess) : null;
    } catch {
      return null;
    }
  });
  const [legacy, setLegacy] = useState(false);

  const reload = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const r = await getSettingsAccess(sessionToken);
      if (!r || typeof r.mine !== 'object' || !r.mine) {
        setLegacy(true);
        return;
      }
      setFull(r);
      setLegacy(false);
      try {
        localStorage.setItem(KEY + email, JSON.stringify(r));
      } catch {
        /* storage full: memory copy still works */
      }
    } catch (err) {
      if (/Unknown action/i.test(String((err as Error).message))) setLegacy(true);
    }
  }, [sessionToken, email]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // "Responsible" → Edit for this module's ACC responsible engineer, else View
  const resolve = (page: string, l: SettingsLevel): 'Hidden' | 'View' | 'Edit' => {
    if (l !== 'Responsible') return l;
    return access[page]?.responsibilities?.includes('ACC Responsible Engineer') ? 'Edit' : 'View';
  };
  const levels: Levels =
    legacy || !full?.mine
      ? legacyLevels(roles, canDelegate)
      : Object.fromEntries(Object.entries(full.mine).map(([p, l]) => [p, resolve(p, l)]));
  levels.appearance = 'Edit';

  return <SettingsAccessContext.Provider value={{ levels, full, reload, legacy }}>{children}</SettingsAccessContext.Provider>;
}

export function useSettingsAccess(): Ctx {
  const c = useContext(SettingsAccessContext);
  if (!c) throw new Error('useSettingsAccess outside SettingsAccessProvider');
  return c;
}

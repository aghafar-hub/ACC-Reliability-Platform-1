// The modules' side of the equipment list: their Lub IDs / Vib IDs and what
// doesn't match the platform (backend PlatformEquipment.js, getIdCheck).
import { moduleGet, modulePost } from './moduleAccess';

export type IdProblem = {
  key: string;
  kind: string;
  id: string;
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  module: string;
  status: 'Open' | 'OK';
  firstSeen?: string;
};
export type ModuleIdCheck = {
  moduleId: string;
  module: string;
  connected: boolean;
  error: string;
  platformCount: number;
  checkedAt: string;
  ids: { lubId?: string; vibId?: string; equipmentId: string; point: string; family?: string; contractor: string; status: string; inPlatform: boolean }[];
  problems: IdProblem[];
  failed?: string;
};

export const ID_MODULES = [
  { id: 'oil-analysis', name: 'Oil Lubrication', short: 'Oil' },
  { id: 'vibration-analysis', name: 'Vibration Analysis', short: 'Vibration' },
];

export async function fetchIdChecks(sessionToken: string, fresh = false): Promise<ModuleIdCheck[]> {
  const res = await Promise.allSettled(ID_MODULES.map((m) => moduleGet(m.id, sessionToken, { action: 'getIdCheck', ...(fresh ? { fresh: '1' } : {}) }, { attempts: fresh ? 1 : 2 })));
  return res.map((r, i) => {
    const m = ID_MODULES[i];
    const empty = { moduleId: m.id, module: m.name, connected: false, error: '', platformCount: 0, checkedAt: '', ids: [], problems: [] };
    if (r.status === 'rejected') return { ...empty, failed: "Couldn't reach the module — try again." };
    const j = r.value || {};
    if (j.error || j.accessDenied || !Array.isArray(j.problems)) return { ...empty, failed: String(j.error || j.message || 'The module has not been updated yet (paste PlatformEquipment.js).') };
    return { ...empty, ...j, moduleId: m.id, module: m.name };
  });
}

// App Owner: change / delete / add IDs in a module (backend IdAdmin.js).
// Throws the module's own message when it refuses.
export async function idAdmin(sessionToken: string, moduleId: string, body: Record<string, unknown>): Promise<{ status: string; summary?: string; item?: Record<string, string> }> {
  const r = (await modulePost(moduleId, sessionToken, { action: 'idAdmin', ...body })) as { status?: string; error?: string; message?: string; summary?: string; item?: Record<string, string> };
  if (!r || r.status !== 'ok') {
    const name = ID_MODULES.find((m) => m.id === moduleId)?.name || moduleId;
    throw new Error(`${name}: ${r?.error || r?.message || 'not updated yet — paste IdAdmin.js and Code.js, then publish a new version.'}`);
  }
  return r as { status: string; summary?: string; item?: Record<string, string> };
}

export function markIdProblem(sessionToken: string, moduleId: string, key: string, status: 'OK' | 'Open') {
  return modulePost(moduleId, sessionToken, { action: 'markIdCheck', key, status });
}

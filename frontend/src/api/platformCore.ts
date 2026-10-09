import { PLATFORM_CORE_URL } from '../config';
import { newOperationId, postAction } from './client';

export type LoginResult = {
  userId: string;
  email: string;
  orgId: string;
  mustChangePassword: boolean;
  sessionToken: string;
};

export function login(email: string, password: string): Promise<LoginResult> {
  return postAction<LoginResult>(PLATFORM_CORE_URL, 'login', { email, password });
}

export function changePassword(sessionToken: string, newPassword: string): Promise<{ ok: true }> {
  return postAction(PLATFORM_CORE_URL, 'changePassword', { sessionToken, newPassword });
}

export type OrgUser = { userId: string; email: string; orgId: string; roles: string[] };

export function listOrgUsers(sessionToken: string): Promise<OrgUser[]> {
  return postAction<OrgUser[]>(PLATFORM_CORE_URL, 'listOrgUsers', { sessionToken });
}

export function createUser(
  sessionToken: string,
  email: string,
  orgId: string,
  roleIds: string[],
): Promise<{ email: string; tempPassword: string }> {
  return postAction(PLATFORM_CORE_URL, 'createUser', {
    sessionToken,
    email,
    orgId,
    roleIds,
    operationId: newOperationId(),
  });
}

export function adminResetPassword(
  sessionToken: string,
  userId: string,
): Promise<{ email: string; tempPassword: string }> {
  return postAction(PLATFORM_CORE_URL, 'adminResetPassword', { sessionToken, userId });
}

export function setUserRoles(
  sessionToken: string,
  userId: string,
  roleIds: string[],
): Promise<{ userId: string; roles: string[] }> {
  return postAction(PLATFORM_CORE_URL, 'setUserRoles', { sessionToken, userId, roleIds });
}

// ─── Equipment list (Platform Core AssetMaster.js) ───────────────────────────
// Equipment IDs are owned by the platform; Lub IDs by Oil, Vib IDs by Vibration.
export type PlatformEquipment = {
  id: string;
  name: string;
  mainArea: string;
  plantArea: string;
  subArea: string;
  contractor: string;
  contractorOrg: string;
  criticality: string;
  parent: string;
  status: string;
};
export type EquipmentChange = { at: string; by: string; id: string; change: string; before: string; after: string };

export function listEquipmentMaster(sessionToken: string): Promise<{ equipment: PlatformEquipment[]; count: number }> {
  return postAction(PLATFORM_CORE_URL, 'listEquipmentMaster', { sessionToken });
}

export function saveEquipmentMaster(
  sessionToken: string,
  mode: 'add' | 'edit' | 'retire' | 'restore',
  item: Partial<PlatformEquipment> & { id: string },
): Promise<{ saved: boolean; item: PlatformEquipment }> {
  return postAction(PLATFORM_CORE_URL, 'saveEquipmentMaster', { sessionToken, mode, item });
}

export function listEquipmentLog(sessionToken: string, limit = 200): Promise<{ entries: EquipmentChange[] }> {
  return postAction(PLATFORM_CORE_URL, 'listEquipmentLog', { sessionToken, limit });
}

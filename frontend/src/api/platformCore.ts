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

// ─── Settings access (Platform Core SettingsAccess.js) ───────────────────────
export type SettingsLevel = 'Hidden' | 'View' | 'Responsible' | 'Edit';
export type SettingsAccess = {
  pages: string[];
  roles: string[];
  ownerOnly: string[];
  viewMax: string[];
  modulePages: string[];
  mine: Record<string, SettingsLevel>;
  matrix?: Record<string, Record<string, SettingsLevel>>;
  people?: { email: string; page: string; level: SettingsLevel }[];
};

export function getSettingsAccess(sessionToken: string): Promise<SettingsAccess> {
  return postAction(PLATFORM_CORE_URL, 'getSettingsAccess', { sessionToken });
}

export function saveSettingsAccess(sessionToken: string, matrix: SettingsAccess['matrix'], people: SettingsAccess['people']): Promise<{ saved: boolean; access: SettingsAccess }> {
  return postAction(PLATFORM_CORE_URL, 'saveSettingsAccess', { sessionToken, matrix, people });
}

// ─── Email & notifications (App Owner) ─────────────────────────────────────
export type EmailEvent = { key: string; label: string; to: string };
export type EmailModule = { id: string; name: string; events: EmailEvent[] };
export type EmailToggles = Record<string, Record<string, { email: boolean; digest: boolean }>>;
export type EmailSettings = {
  senderEmail: string;
  senderName: string;
  enabled: boolean;
  digestTime: string;
  events: EmailToggles;
  modules: EmailModule[];
  changed: Partial<Record<'senderEmail' | 'senderName' | 'enabled' | 'digestTime' | 'events', { by: string; at: string }>>;
};

export function getEmailSettings(sessionToken: string): Promise<EmailSettings> {
  return postAction(PLATFORM_CORE_URL, 'getEmailSettings', { sessionToken });
}

export function saveEmailSettings(
  sessionToken: string,
  body: { part: 'sender'; senderEmail: string; senderName: string } | { part: 'switch'; enabled: boolean } | { part: 'events'; events: EmailToggles; digestTime: string },
): Promise<EmailSettings> {
  return postAction(PLATFORM_CORE_URL, 'saveEmailSettings', { sessionToken, ...body });
}

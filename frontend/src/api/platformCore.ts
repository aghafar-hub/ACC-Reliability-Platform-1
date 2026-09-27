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
): Promise<{ email: string; tempPassword: string }> {
  return postAction(PLATFORM_CORE_URL, 'createUser', {
    sessionToken,
    email,
    orgId,
    operationId: newOperationId(),
  });
}

export function adminResetPassword(
  sessionToken: string,
  userId: string,
): Promise<{ email: string; tempPassword: string }> {
  return postAction(PLATFORM_CORE_URL, 'adminResetPassword', { sessionToken, userId });
}

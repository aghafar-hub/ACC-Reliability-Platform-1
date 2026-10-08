// Vibration Analysis calls the platform shell makes itself (My Work's
// vibration route checklist). Everything else lives in the embedded app.
// Reads and writes both go through the module's GET endpoint (its backend
// takes writes by action name — see backend/vibration-analysis/src/Code.js).
import { moduleGet } from '../moduleAccess';

const VIB = 'vibration-analysis';

export type VibRoutePoint = {
  'Route ID': string;
  'Equipment ID': string;
  'VIB ID': string;
  Point: string;
  Done: string;
  'Skip reason': string;
  'Equipment comment': string;
};

export type VibRoute = {
  'Route ID': string;
  Name: string;
  Contractor: string;
  'Report scope': string;
  Type: string;
  Status: string;
  'Planned date': string;
  Technician: string;
  Reason: string;
  Points: number;
  'Points done': number;
  'Route comment': string;
  'Return reason': string;
  overdue: boolean;
};

async function call(sessionToken: string, params: Record<string, string>) {
  const json = await moduleGet(VIB, sessionToken, params);
  if (!json || json.status === 'error' || json.error) throw new Error(json?.error || 'Request failed');
  return json;
}

export async function getVibRoute(sessionToken: string, routeId: string): Promise<{ route: VibRoute; points: VibRoutePoint[] }> {
  return call(sessionToken, { action: 'getVibRoute', routeId });
}

export async function saveVibRouteProgress(
  sessionToken: string,
  routeId: string,
  points: { vibId: string; done: boolean; skipReason: string }[],
  equipmentComments: Record<string, string>,
  routeComment: string,
) {
  return call(sessionToken, {
    action: 'saveVibRouteProgress',
    routeId,
    points: JSON.stringify(points),
    equipmentComments: JSON.stringify(equipmentComments),
    routeComment,
  });
}

export async function submitVibRoute(sessionToken: string, routeId: string) {
  return call(sessionToken, { action: 'vibRouteTransition', routeId, to: 'submit' });
}

// The platform bell: this person's own vibration notices (backend
// VibNotifications.js). Same shape as Oil's in-app notifications.
export type VibNotification = {
  notificationId: string;
  type: string;
  message: string;
  contractor: string;
  linkPage: string;
  linkRecordId: string;
  createdDate: string;
  read: boolean;
};

export async function getVibNotifications(sessionToken: string, limit = 30): Promise<{ notifications: VibNotification[]; unreadCount: number }> {
  const json = await call(sessionToken, { action: 'getVibNotifications', limit: String(limit) });
  return { notifications: json.notifications || [], unreadCount: json.unreadCount || 0 };
}

export async function markVibNotificationsRead(sessionToken: string, notificationId: string | null) {
  return call(sessionToken, notificationId ? { action: 'markVibNotificationsRead', notificationId } : { action: 'markVibNotificationsRead', all: 'true' });
}

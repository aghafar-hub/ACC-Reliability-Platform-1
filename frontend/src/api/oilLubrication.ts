import { OIL_ANALYSIS_URL } from '../config';

// A thin, purpose-built client against the Oil Lubrication backend
// (backend/oil-lubrication), for My Work's native routine list + checklist
// — NOT a general-purpose client for that whole app (apps/oil-analysis has
// its own much larger one, src/api.js, which this mirrors the GET-retry /
// POST-then-verify patterns of, since both hit the same known Apps Script
// quirks: GET responses redirect through a userscontent.com URL that needs
// cache-busting + retry, and POST responses can't be read at all — see that
// file's own header comment for the full story).
//
// Same shared secret as apps/oil-analysis/src/config.js's API_SECRET —
// duplicated rather than imported (separate build, can't cross-import), and
// not a real security boundary either way (documented there): it just
// raises the bar from "anyone who's ever seen the URL" to "anyone with the
// URL and this value," rotatable independently per app if it ever leaks.
const OIL_API_SECRET = '5RfANz0fp5kycVaABAYrKZ9eWBJxXOBaghBKRM9o';

export type Routine = {
  routineId: string;
  createdBy: string;
  assignedTo: string;
  contractor: string;
  createdDate: string;
  status: string;
  submittedDate: string;
  approvedBy: string;
  approvedDate: string;
  routeName: string;
  routeType: string;
  dueDate: string;
  itemsTotal: number;
  itemsDone: number;
};

export type RoutineItem = {
  routineItemId: string;
  routineId: string;
  lpId: string;
  itemType: string;
  requiredOilType: string;
  implemented: string;
  notImplementedReason: string;
  actualDate: string;
  actualQuantity: string;
  sampleTaken: string;
};

class SaveVerificationError extends Error {}

function formatDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function rowToRoutine(row: unknown[]): Routine {
  return {
    routineId: String(row[0] || ''),
    createdBy: String(row[1] || ''),
    assignedTo: String(row[2] || ''),
    contractor: String(row[3] || ''),
    createdDate: formatDate(row[4]),
    status: String(row[5] || 'Assigned'),
    submittedDate: formatDate(row[6]),
    approvedBy: String(row[7] || ''),
    approvedDate: formatDate(row[8]),
    routeName: String(row[12] || ''),
    routeType: String(row[13] || ''),
    dueDate: formatDate(row[14]),
    // Patch 18: ROUTINES gained a raw column 16 (Reason, Emergency Top Up
    // only) — itemsTotal/itemsDone are NOT raw sheet columns, getRoutines()
    // (Routines.js) appends them after the real row, so they now trail one
    // index further than before.
    itemsTotal: Number(row[17]) || 0,
    itemsDone: Number(row[18]) || 0,
  };
}

function rowToRoutineItem(row: unknown[]): RoutineItem {
  return {
    routineItemId: String(row[0] || ''),
    routineId: String(row[1] || ''),
    lpId: String(row[2] || ''),
    itemType: String(row[3] || 'Change'),
    requiredOilType: String(row[4] || ''),
    implemented: String(row[5] || ''),
    notImplementedReason: String(row[6] || ''),
    actualDate: formatDate(row[7]),
    actualQuantity: String(row[8] || ''),
    sampleTaken: String(row[9] || ''),
  };
}

const GET_RETRY_ATTEMPTS = 3;
const GET_RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RetryableFetchError extends Error {}

async function getJSON(sessionToken: string, params: Record<string, string>): Promise<any> {
  const url = new URL(OIL_ANALYSIS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('secret', OIL_API_SECRET);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= GET_RETRY_ATTEMPTS; attempt++) {
    url.searchParams.set('_', `${Date.now()}_${attempt}`);
    try {
      let res: Response;
      try {
        res = await fetch(url.toString(), { cache: 'no-store' });
      } catch (networkErr) {
        throw new RetryableFetchError(`Network error: ${(networkErr as Error).message}`);
      }
      if (!res.ok) throw new RetryableFetchError(`Server returned ${res.status}`);
      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new RetryableFetchError('Server returned a non-JSON response');
      }
      if (json && json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      lastErr = err;
      if (!(err instanceof RetryableFetchError) || attempt === GET_RETRY_ATTEMPTS) throw err;
      await sleep(GET_RETRY_BASE_DELAY_MS * attempt + Math.random() * 200);
    }
  }
  throw lastErr;
}

async function postBlind(sessionToken: string, body: Record<string, unknown>): Promise<void> {
  try {
    const payload: Record<string, unknown> = { ...body, secret: OIL_API_SECRET };
    if (sessionToken) payload.sessionToken = sessionToken;
    await fetch(OIL_ANALYSIS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Network error while saving: ${(err as Error).message}`);
  }
}

export async function getRoutines(sessionToken: string): Promise<Routine[]> {
  const json = await getJSON(sessionToken, { action: 'getRoutines' });
  return (json.routines || []).map(rowToRoutine);
}

export async function getRoutineItems(sessionToken: string, routineId: string): Promise<RoutineItem[]> {
  const json = await getJSON(sessionToken, { action: 'getRoutineItems', routineId });
  return (json.items || []).map(rowToRoutineItem);
}

export async function submitRoutineItem(
  sessionToken: string,
  routineId: string,
  item: {
    routineItemId: string;
    implemented: boolean;
    notImplementedReason?: string;
    actualDate?: string;
    actualQuantity?: string;
    sampleTaken: boolean;
  },
): Promise<RoutineItem> {
  await postBlind(sessionToken, {
    action: 'submitRoutineItem',
    routineItemId: item.routineItemId,
    implemented: item.implemented,
    notImplementedReason: item.notImplementedReason || '',
    actualDate: item.actualDate || '',
    actualQuantity: item.actualQuantity || '',
    sampleTaken: item.sampleTaken,
  });

  const items = await getRoutineItems(sessionToken, routineId);
  const saved = items.find((i) => i.routineItemId === item.routineItemId);
  if (!saved || (saved.implemented === 'Yes') !== item.implemented) {
    throw new SaveVerificationError("The routine item wasn't confirmed saved — please try again.");
  }
  return saved;
}

export async function submitRoutine(sessionToken: string, routineId: string): Promise<Routine> {
  await postBlind(sessionToken, { action: 'submitRoutine', routineId });

  const routines = await getRoutines(sessionToken);
  const saved = routines.find((r) => r.routineId === routineId);
  if (!saved || saved.status !== 'Submitted') {
    throw new SaveVerificationError("The routine wasn't confirmed submitted — please try again.");
  }
  return saved;
}

// Patch 15 — the platform shell's notification bell (frontend/src/components/
// NotificationBell.tsx). Reads/writes InAppNotifications.js on the Oil
// Lubrication backend directly, same as the rest of this file — there's
// nothing module-specific about the feed itself even though every event it
// currently carries happens to originate in Oil Lubrication.
export type InAppNotification = {
  notificationId: string;
  type: string;
  message: string;
  contractor: string;
  linkPage: string;
  linkRecordId: string;
  createdDate: string;
  read: boolean;
};

export async function getInAppNotifications(
  sessionToken: string,
  limit = 30,
): Promise<{ notifications: InAppNotification[]; unreadCount: number }> {
  const json = await getJSON(sessionToken, { action: 'getInAppNotifications', limit: String(limit) });
  return { notifications: json.notifications || [], unreadCount: json.unreadCount || 0 };
}

// Deliberately no verify-read-after-write here, unlike every other write in
// this file: this is a low-stakes, user-initiated "mark read" action with no
// data to lose if the blind POST silently fails — the bell's own next poll
// (NotificationBell.tsx) just shows it unread again, which is a harmless,
// self-correcting outcome, not worth a round trip + SaveVerificationError
// toast for something this minor.
export async function markNotificationRead(sessionToken: string, notificationId: string): Promise<void> {
  await postBlind(sessionToken, { action: 'markNotificationRead', notificationId });
}

export async function markAllNotificationsRead(sessionToken: string): Promise<void> {
  await postBlind(sessionToken, { action: 'markAllNotificationsRead' });
}

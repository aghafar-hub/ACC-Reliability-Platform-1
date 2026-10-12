/**
 * Thin POST wrapper shared by both backends. Every Apps Script Web App in
 * this platform speaks the same envelope: POST { action, sessionToken?,
 * ...params } -> { ok: true, data } | { ok: false, error: { message,
 * correlationId } } (see each backend's src/Utils.js, safeHandle_/ok_).
 */

import { isSessionEnded, reportSessionEnded } from '../auth/sessionEnded';

export class ApiError extends Error {
  correlationId?: string;
  constructor(message: string, correlationId?: string) {
    super(message);
    this.correlationId = correlationId;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; correlationId?: string; sessionEnded?: boolean } };

// Reads are safe to repeat: when Google answers a read with its own error
// page (a passing hiccup delivering the answer), try once more.
const READ_ACTION = /^(get|list|fetch|read)/;

export async function postAction<T>(
  baseUrl: string,
  action: string,
  params: Record<string, unknown> = {},
  retried = false,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      // text/plain avoids a CORS preflight against Apps Script Web Apps,
      // which don't handle OPTIONS — the body is still JSON underneath.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }

  let envelope: Envelope<T>;
  const text = await response.text().catch(() => '');
  try {
    envelope = JSON.parse(text);
  } catch {
    if (!retried && READ_ACTION.test(action)) {
      await new Promise((r) => setTimeout(r, 1200));
      return postAction<T>(baseUrl, action, params, true);
    }
    throw new ApiError(`The server returned an unexpected response${serverErrorText(text)} (${action})`);
  }

  if (!envelope.ok) {
    if (action !== 'login' && action !== 'signOut' && isSessionEnded(envelope.error)) reportSessionEnded();
    throw new ApiError(envelope.error.message, envelope.error.correlationId);
  }
  return envelope.data;
}

// Apps Script answers with its own HTML page when the script itself fails
// (a file missing, a time-out, permissions not granted): show the error
// line from that page instead of a bare "unexpected response".
function serverErrorText(text: string): string {
  const plain = String(text || '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const m = plain.match(/(\w*Error|Exception)[^.]{0,200}/);
  return m ? `: ${m[0]}` : plain ? `: ${plain.slice(0, 200)}` : '';
}

/** A fresh idempotency key for a write action — see Utils.js#withIdempotency_. */
export function newOperationId(): string {
  return crypto.randomUUID();
}

/** Formats a caught error for display, including the correlation ID when the backend gave one. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.correlationId ? `${err.message} (ref: ${err.correlationId})` : err.message;
  }
  return fallback;
}

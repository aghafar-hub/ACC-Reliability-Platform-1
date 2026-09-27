/**
 * Thin POST wrapper shared by both backends. Every Apps Script Web App in
 * this platform speaks the same envelope: POST { action, sessionToken?,
 * ...params } -> { ok: true, data } | { ok: false, error: { message,
 * correlationId } } (see each backend's src/Utils.js, safeHandle_/ok_).
 */

export class ApiError extends Error {
  correlationId?: string;
  constructor(message: string, correlationId?: string) {
    super(message);
    this.correlationId = correlationId;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; correlationId?: string } };

export async function postAction<T>(
  baseUrl: string,
  action: string,
  params: Record<string, unknown> = {},
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
  try {
    envelope = await response.json();
  } catch {
    throw new ApiError('The server returned an unexpected response.');
  }

  if (!envelope.ok) {
    throw new ApiError(envelope.error.message, envelope.error.correlationId);
  }
  return envelope.data;
}

/** A fresh idempotency key for a write action — see Utils.js#withIdempotency_. */
export function newOperationId(): string {
  return crypto.randomUUID();
}

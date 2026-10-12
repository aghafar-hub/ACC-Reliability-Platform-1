// Audit F-02: every sign-in now has an end time and can be cancelled (deleted
// user, role or password change, signed out elsewhere). Every backend then
// answers "Your sign-in has ended — please sign in again." (with
// sessionEnded: true); whichever request sees it raises this window event and
// the shell signs out (AuthContext). The two module apps raise the same
// event by name — they share the window but not this file.
export const SESSION_ENDED_EVENT = 'acc-session-ended';
export const SESSION_ENDED_NOTICE_KEY = 'acc.signin.notice';
const ENDED_RE = /sign-in has ended/i;

export function isSessionEnded(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'object' && (value as { sessionEnded?: boolean }).sessionEnded) return true;
  const msg = typeof value === 'string' ? value : String((value as { message?: string; error?: string }).message || (value as { error?: string }).error || '');
  return ENDED_RE.test(msg);
}

export function reportSessionEnded(): void {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT));
  } catch {
    // no window (tests)
  }
}

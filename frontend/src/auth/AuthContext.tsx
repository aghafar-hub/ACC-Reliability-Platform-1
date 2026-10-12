import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SESSION_ENDED_EVENT, SESSION_ENDED_NOTICE_KEY } from './sessionEnded';
import { clearModuleDeviceData, forgetPreviousPerson, unsentWorkCount } from './deviceData';
import { changePassword as apiChangePassword, login as apiLogin, signOut as apiSignOut } from '../api/platformCore';

// device kind for the login history (same rule as presence.ts)
function loginDevice(): string {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const kind = window.innerWidth <= 860 && touch ? 'phone' : touch ? 'tablet' : 'desktop';
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches ? `${kind} app` : kind;
}
import { decodeSessionClaims, type SessionClaims } from './session';

const STORAGE_KEY = 'acc.session';

type StoredSession = { sessionToken: string; mustChangePassword: boolean };

type AuthState = {
  sessionToken: string | null;
  claims: SessionClaims | null;
  mustChangePassword: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  completeChangePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// "Keep me signed in" (Login.tsx's checkbox) chooses which storage a
// session lands in: localStorage survives closing the browser, sessionStorage
// doesn't. Read both so a session from either one is picked up; write to
// whichever one the checkbox chose, clearing the other so a stale copy can't
// linger and confuse a later read.
function readStored(): StoredSession | null {
  try {
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    if (fromLocal) return JSON.parse(fromLocal);
  } catch {
    // ignore — fall through to sessionStorage
  }
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    return fromSession ? JSON.parse(fromSession) : null;
  } catch {
    return null;
  }
}

function wasRememberedStorage(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return true; // default to "remembered" for a fresh session with no prior choice yet
  }
}

function writeStored(value: StoredSession | null, remember: boolean) {
  try {
    if (!value) {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const json = JSON.stringify(value);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, json);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, json);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Best-effort — a private window or blocked storage just means no persistence across reloads.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredSession | null>(() => readStored());
  const rememberRef = useRef<boolean>(wasRememberedStorage());
  const claims = useMemo(() => (stored ? decodeSessionClaims(stored.sessionToken) : null), [stored]);

  useEffect(() => {
    writeStored(stored, rememberRef.current);
  }, [stored]);

  async function login(email: string, password: string, remember: boolean) {
    const result = await apiLogin(email, password, { device: loginDevice(), remember });
    // another person used this device before: their module data goes first
    await forgetPreviousPerson(decodeSessionClaims(result.sessionToken)?.email || email);
    rememberRef.current = remember;
    setStored({ sessionToken: result.sessionToken, mustChangePassword: result.mustChangePassword });
  }

  async function completeChangePassword(newPassword: string, currentPassword?: string) {
    if (!stored) throw new Error('Not logged in.');
    const result = await apiChangePassword(stored.sessionToken, newPassword, currentPassword);
    // the server cancelled the old sign-in and sent a fresh one for this device
    setStored({ sessionToken: result.sessionToken || stored.sessionToken, mustChangePassword: false });
  }

  // a backend said this sign-in has ended (sessionEnded.ts): back to Login
  useEffect(() => {
    function onEnded() {
      try {
        sessionStorage.setItem(SESSION_ENDED_NOTICE_KEY, 'Your sign-in has ended — please sign in again.');
      } catch {
        // storage blocked: the Login page just shows no notice
      }
      setStored(null);
      // the module data goes; unsent work stays for when this person signs in again
      clearModuleDeviceData(false).finally(() => window.location.reload());
    }
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);

  async function logout() {
    const unsent = unsentWorkCount();
    if (
      unsent &&
      !window.confirm(
        `${unsent} entr${unsent === 1 ? 'y' : 'ies'} saved on this device ${unsent === 1 ? "hasn't" : "haven't"} reached the server yet (no connection when saved). Signing out deletes ${unsent === 1 ? 'it' : 'them'}. Sign out anyway?`
      )
    )
      return;
    // for the login history (Platform Core Presence.js); never waits for it
    if (stored?.sessionToken) apiSignOut(stored.sessionToken, loginDevice()).catch(() => {});
    setStored(null);
    // nothing of this person's stays on the device (shared plant PCs), and
    // a reload clears what the modules hold in memory
    await clearModuleDeviceData(true);
    window.location.reload();
  }

  const value: AuthState = {
    sessionToken: stored?.sessionToken ?? null,
    claims,
    mustChangePassword: stored?.mustChangePassword ?? false,
    login,
    completeChangePassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

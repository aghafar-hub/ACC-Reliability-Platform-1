import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { changePassword as apiChangePassword, login as apiLogin } from '../api/platformCore';
import { decodeSessionClaims, type SessionClaims } from './session';

const STORAGE_KEY = 'acc.session';

type StoredSession = { sessionToken: string; mustChangePassword: boolean };

type AuthState = {
  sessionToken: string | null;
  claims: SessionClaims | null;
  mustChangePassword: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  completeChangePassword: (newPassword: string) => Promise<void>;
  logout: () => void;
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
    const result = await apiLogin(email, password);
    rememberRef.current = remember;
    setStored({ sessionToken: result.sessionToken, mustChangePassword: result.mustChangePassword });
  }

  async function completeChangePassword(newPassword: string) {
    if (!stored) throw new Error('Not logged in.');
    await apiChangePassword(stored.sessionToken, newPassword);
    setStored({ ...stored, mustChangePassword: false });
  }

  function logout() {
    setStored(null);
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

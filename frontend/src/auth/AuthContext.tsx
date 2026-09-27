import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { changePassword as apiChangePassword, login as apiLogin } from '../api/platformCore';
import { decodeSessionClaims, type SessionClaims } from './session';

const STORAGE_KEY = 'acc.session';

type StoredSession = { sessionToken: string; mustChangePassword: boolean };

type AuthState = {
  sessionToken: string | null;
  claims: SessionClaims | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeChangePassword: (newPassword: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(value: StoredSession | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort — a private window or blocked storage just means no persistence across reloads.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredSession | null>(() => readStored());
  const claims = useMemo(() => (stored ? decodeSessionClaims(stored.sessionToken) : null), [stored]);

  useEffect(() => {
    writeStored(stored);
  }, [stored]);

  async function login(email: string, password: string) {
    const result = await apiLogin(email, password);
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

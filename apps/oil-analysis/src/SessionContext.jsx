import { createContext, useContext } from "react";

// Option B Phase 1 (see docs/oil-lubrication-migration-notes.md): identity
// of the logged-in user, when this app is mounted inside the Platform Core
// shell (App.jsx's `session` prop, set once at mount by
// frontend/src/pages/EmbeddedOilAnalysis.tsx from its own useAuth()). Stays
// null for a standalone build, which has no shell login to read — every
// consumer below already treats a missing session as "no identity to
// prefill," not an error.
const SessionContext = createContext(null);

export function SessionProvider({ session, children }) {
  return <SessionContext.Provider value={session || null}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

// Convenience for prefilling a free-text "who did this" field: "" (never
// null/undefined) so it can be dropped straight into a useState/useEffect
// default without a null check at each call site.
export function useSessionEmail() {
  const session = useSession();
  return session?.claims?.email || "";
}

// "" (never null/undefined) for the same reason useSessionEmail() is — a
// standalone build or an embedded mount from before platformCoreUrl existed
// both leave this blank, and every consumer already treats blank as
// "can't reach Platform Core from here, fall back to free text" rather
// than as an error.
export function usePlatformCoreUrl() {
  const session = useSession();
  return session?.platformCoreUrl || "";
}

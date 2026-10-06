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

// Same ORG-RHI/ORG-ASEC scheme TechnicianPicker.jsx's own
// CONTRACTOR_TO_ORG_ID uses, and the same mapping Rbac.js's
// ORG_TO_CONTRACTOR enforces server-side — duplicated here rather than
// imported since the frontend has no shared module with the backend.
const ORG_TO_CONTRACTOR = { "ORG-RHI": "RHI", "ORG-ASEC": "ASEC" };

// "" for an ACC/admin account (or a standalone build with no session at
// all) — meaning "not locked to one contractor, let them choose" — and a
// real contractor code ("RHI"/"ASEC") for an account whose own org maps to
// one. Lets a screen that currently shows a manual Contractor dropdown
// (NewRoutine.jsx, EditActionModal.jsx) instead auto-select and lock to
// the logged-in contractor's own org, same as the data they already only
// ever see is already scoped server-side — the dropdown was only ever
// meaningful for an ACC account overseeing both.
export function useSessionContractor() {
  const session = useSession();
  return ORG_TO_CONTRACTOR[session?.claims?.orgId] || "";
}

// Phase 1: confirming, returning and rescheduling a route belong to that
// route's own contractor's engineer, and the App Owner — same rule as
// Rbac.js's isRouteEngineerFor_ on the server. A standalone build (no
// session) keeps every button, as before.
export function useIsRouteEngineerFor(contractor) {
  const session = useSession();
  if (!session) return true;
  const roles = session?.claims?.roles || [];
  if (roles.includes("ROLE-ADMIN")) return true;
  const mine = ORG_TO_CONTRACTOR[session?.claims?.orgId] || "";
  return !!mine && mine === contractor && roles.some((r) => r === "ROLE-CENG" || r === "ROLE-CMGR" || r === "ROLE-MGR");
}

// Phase 2: approving or rejecting an action's closure belongs to ACC
// Engineers (ACC org, ROLE-RENG/ROLE-MGR) and the App Owner — same rule as
// Rbac.js's isAccEngineer_ on the server.
export function useIsAccEngineer() {
  const session = useSession();
  if (!session) return true;
  const roles = session?.claims?.roles || [];
  if (roles.includes("ROLE-ADMIN")) return true;
  return session?.claims?.orgId === "ORG-ACC" && roles.some((r) => r === "ROLE-RENG" || r === "ROLE-MGR");
}

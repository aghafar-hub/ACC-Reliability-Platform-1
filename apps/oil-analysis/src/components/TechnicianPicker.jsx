import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSession } from "../SessionContext";
import * as api from "../api";
import { loadConfig } from "../config";

const CONTRACTOR_TO_ORG_ID = { RHI: "ORG-RHI", ASEC: "ORG-ASEC" };
const ROLE_TECHNICIAN = "ROLE-TECH";

// Real-account picker for "who is this assigned to" — a dropdown of actual
// accounts for the selected contractor, instead of a free-text box. A typo
// in free text used to mean a routine silently never showed up for the
// right person's My Work list (matching there is by exact login email —
// see frontend/src/pages/MyWork.tsx), or just an untraceable name on an
// action with no real owner.
//
// roleFilter (default ROLE-TECH, matching the original "Assign Technician"
// use on Routines) narrows the list to that role only; pass null to show
// every account in the contractor's org regardless of role — Action
// Tracker's "Assigned To" uses this, since an action can reasonably be
// owned by a Technician, a Contractor Engineer, or a Manager, not just a
// Technician.
//
// Falls back to the original free-text input whenever the picker can't do
// its job — no Platform Core URL available (a standalone build has none),
// the directory fails to load, or the contractor genuinely has zero
// matching accounts set up yet — so this never blocks creating or
// assigning a routine/action, it just makes the common case exact instead
// of typo-prone.
export default function TechnicianPicker({ contractor, value, onChange, roleFilter = ROLE_TECHNICIAN, placeholder = "Technician or team name" }) {
  const { T, s } = useTheme();
  const session = useSession();
  const [users, setUsers] = useState(null); // null = still loading, [] = loaded (maybe empty) or unreachable
  const [loadFailed, setLoadFailed] = useState(false);
  // Bug-hunt: the embedded Oil Lubrication module mounts once at login and
  // stays mounted for the whole browser session (see
  // frontend/src/pages/EmbeddedOilAnalysis.tsx) — this effect's deps
  // (platformCoreUrl/token) never change after that, so a transient
  // directory-load failure (Platform Core briefly unreachable, a dropped
  // request) used to get stuck showing the free-text fallback for the
  // REST of that session with no way to recover short of a full
  // reload/re-login. retryNonce gives "Retry" below a way to re-run this
  // effect on demand instead.
  const [retryNonce, setRetryNonce] = useState(0);
  // Phase 0: when Module Access is switched on, only technicians the App
  // Owner listed for this module and contractor can be assigned. null =
  // no list to apply (backend without Phase 0, or rules not switched on).
  const [moduleTechEmails, setModuleTechEmails] = useState(null);

  useEffect(() => {
    if (roleFilter !== ROLE_TECHNICIAN) return;
    const access = typeof window !== "undefined" && window.__accModuleAccess ? window.__accModuleAccess.get("oil-analysis") : null;
    if (!access || !access.enforced) {
      setModuleTechEmails(null);
      return;
    }
    let cancelled = false;
    api
      .getModuleTechnicians(loadConfig().webhookUrl, contractor)
      .then((list) => {
        if (!cancelled) setModuleTechEmails(list ? list.map((t) => String(t.email).toLowerCase()) : null);
      })
      .catch(() => {
        if (!cancelled) setModuleTechEmails(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roleFilter, contractor, retryNonce]);

  useEffect(() => {
    const platformCoreUrl = session?.platformCoreUrl;
    const sessionToken = session?.token;
    if (!platformCoreUrl || !sessionToken) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    setLoadFailed(false);
    api
      .listOrgUsers(platformCoreUrl, sessionToken)
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.platformCoreUrl, session?.token, retryNonce]);

  const orgId = CONTRACTOR_TO_ORG_ID[contractor];
  const matches = (users || []).filter(
    (u) =>
      u.orgId === orgId &&
      (!roleFilter || u.roles.includes(roleFilter)) &&
      (!moduleTechEmails || moduleTechEmails.includes(String(u.email).toLowerCase())),
  );

  // Still loading, or nothing usable to pick from — free text, same as
  // before this component existed.
  if (users === null || matches.length === 0) {
    return (
      <>
        <input style={s.input} type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        {users !== null && matches.length === 0 && (
          <p style={{ fontSize: 11, color: T.textMuted, margin: "4px 0 0" }}>
            {loadFailed ? (
              <>
                Couldn't load the account directory — typing a name still works, just double-check the spelling.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setUsers(null);
                    setRetryNonce((n) => n + 1);
                  }}
                  style={{ ...s.btn, padding: "1px 7px", fontSize: 11 }}
                >
                  Retry
                </button>
              </>
            ) : (
              `No accounts set up yet for ${contractor || "this contractor"} — typing a name still works, but it won't be linked to a real account.`
            )}
          </p>
        )}
      </>
    );
  }

  return (
    <select style={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      {matches.map((u) => (
        <option key={u.userId} value={u.email}>
          {u.email}
        </option>
      ))}
    </select>
  );
}

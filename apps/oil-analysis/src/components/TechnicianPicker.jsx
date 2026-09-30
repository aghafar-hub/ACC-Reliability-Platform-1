import { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSession } from "../SessionContext";
import * as api from "../api";

const CONTRACTOR_TO_ORG_ID = { RHI: "ORG-RHI", ASEC: "ORG-ASEC" };
const ROLE_TECHNICIAN = "ROLE-TECH";

// Real-account picker for "who is this routine assigned to" — a dropdown of
// actual Technician accounts for the selected contractor, instead of a
// free-text box. A typo in free text used to mean the routine silently
// never showed up for the right person's My Work list, since matching
// there is by exact login email (see frontend/src/pages/MyWork.tsx).
//
// Falls back to the original free-text input whenever the picker can't do
// its job — no Platform Core URL available (a standalone build has none),
// the directory fails to load, or the contractor genuinely has zero
// Technician accounts set up yet — so this never blocks creating or
// assigning a routine, it just makes the common case exact instead of
// typo-prone.
export default function TechnicianPicker({ contractor, value, onChange }) {
  const { T, s } = useTheme();
  const session = useSession();
  const [users, setUsers] = useState(null); // null = still loading, [] = loaded (maybe empty) or unreachable
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const platformCoreUrl = session?.platformCoreUrl;
    const sessionToken = session?.token;
    if (!platformCoreUrl || !sessionToken) {
      setUsers([]);
      return;
    }
    let cancelled = false;
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
  }, [session?.platformCoreUrl, session?.token]);

  const orgId = CONTRACTOR_TO_ORG_ID[contractor];
  const technicians = (users || []).filter((u) => u.orgId === orgId && u.roles.includes(ROLE_TECHNICIAN));

  // Still loading, or nothing usable to pick from — free text, same as
  // before this component existed.
  if (users === null || technicians.length === 0) {
    return (
      <>
        <input
          style={s.input}
          type="text"
          placeholder="Technician or team name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {users !== null && technicians.length === 0 && (
          <p style={{ fontSize: 11, color: T.textMuted, margin: "4px 0 0" }}>
            {loadFailed
              ? "Couldn't load the account directory — typing a name still works, just double-check the spelling."
              : `No Technician accounts set up yet for ${contractor || "this contractor"} — typing a name still works, but it won't show up in their My Work list unless it exactly matches their login email.`}
          </p>
        )}
      </>
    );
  }

  return (
    <select style={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a technician…</option>
      {technicians.map((u) => (
        <option key={u.userId} value={u.email}>
          {u.email}
        </option>
      ))}
    </select>
  );
}

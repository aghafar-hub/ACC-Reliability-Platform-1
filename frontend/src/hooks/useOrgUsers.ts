import { useEffect, useMemo, useState } from 'react';
import { listOrgUsers, type OrgUser } from '../api/platformCore';
import { useAuth } from '../auth/AuthContext';

/** The caller's own org's users (or everyone, for App Admin) — for resolving userIds to emails and for technician pickers. */
export function useOrgUsers() {
  const { sessionToken } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    listOrgUsers(sessionToken)
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const byId = useMemo(() => new Map(users.map((u) => [u.userId, u])), [users]);

  return { users, byId, loading };
}

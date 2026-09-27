import { useCallback, useEffect, useMemo, useState } from 'react';
import { listOrgUsers, type OrgUser } from '../api/platformCore';
import { useAuth } from '../auth/AuthContext';

/** The caller's own org's users (or everyone, for App Admin) — for resolving userIds to emails, technician pickers, and the Accounts admin panel. */
export function useOrgUsers() {
  const { sessionToken } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!sessionToken) return;
    setLoading(true);
    return listOrgUsers(sessionToken)
      .then((rows) => setUsers(rows))
      .finally(() => setLoading(false));
  }, [sessionToken]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionToken) return;
    setLoading(true);
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

  return { users, byId, loading, refetch };
}

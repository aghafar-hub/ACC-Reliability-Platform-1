import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listRoutines, type Routine } from '../../api/oilAnalysis';
import { useAuth } from '../../auth/AuthContext';
import { ROLE } from '../../auth/session';
import { useOrgUsers } from '../../hooks/useOrgUsers';
import './shared.css';

const ROUTINE_CREATOR_ROLES: string[] = [ROLE.CONTRACTOR_ENGINEER, ROLE.MANAGER, ROLE.ADMIN];

export default function RoutinesListPage() {
  const { sessionToken, claims } = useAuth();
  const { byId } = useOrgUsers();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listRoutines(sessionToken)
      .then((rows) => {
        if (!cancelled) setRoutines(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load routines.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const canCreate = claims?.roles.some((r) => ROUTINE_CREATOR_ROLES.includes(r)) ?? false;

  if (loading) return <p>Loading routines…</p>;
  if (error) return <p className="oa-error">{error}</p>;

  return (
    <div>
      <div className="oa-toolbar">
        <span className="oa-count">{routines.length} routines</span>
        {canCreate && (
          <Link className="oa-button" to="new">
            New routine
          </Link>
        )}
      </div>
      {routines.length === 0 ? (
        <p>No routines yet.</p>
      ) : (
        <table className="oa-table">
          <thead>
            <tr>
              <th>Routine</th>
              <th>Assigned to</th>
              <th>Contractor</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {routines.map((r) => (
              <tr key={r.RoutineId}>
                <td>
                  <Link to={r.RoutineId}>{r.RoutineId}</Link>
                </td>
                <td>{byId.get(r.AssignedTo)?.email ?? r.AssignedTo}</td>
                <td>{r.Contractor}</td>
                <td>
                  <span className="oa-badge">{r.Status}</span>
                </td>
                <td>{formatDate(r.CreatedDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

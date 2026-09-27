import { useEffect, useState } from 'react';
import { describeError } from '../../api/client';
import { listLpPoints, type LpPoint } from '../../api/oilAnalysis';
import { useAuth } from '../../auth/AuthContext';
import './shared.css';

export default function LpRegisterPage() {
  const { sessionToken } = useAuth();
  const [points, setPoints] = useState<LpPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLpPoints(sessionToken)
      .then((rows) => {
        if (!cancelled) setPoints(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err, 'Could not load the LP register.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? points.filter((p) =>
        [p.LP_ID, p.Equipment_ID, p.Lubrication_Point, p.Area]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q)),
      )
    : points;

  if (loading) return <p>Loading LP register…</p>;
  if (error) return <p className="oa-error">{error}</p>;

  return (
    <div>
      <div className="oa-toolbar">
        <input
          type="search"
          placeholder="Search by LP_ID, equipment, point, or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="oa-count">
          {filtered.length} of {points.length} points
        </span>
      </div>
      <table className="oa-table">
        <thead>
          <tr>
            <th>LP_ID</th>
            <th>Equipment</th>
            <th>Point</th>
            <th>Area</th>
            <th>Lubricant</th>
            <th>Analysis?</th>
            <th>Contractor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.LP_ID}>
              <td>{p.LP_ID}</td>
              <td>{p.Equipment_ID}</td>
              <td>{p.Lubrication_Point}</td>
              <td>{p.Area}</td>
              <td>{p.Lubricant_Type}</td>
              <td>{p.Oil_Analysis_Required}</td>
              <td>{p.Contractor}</td>
              <td>{p.LP_Status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../../api/client';
import { createRoutine, listLpPoints, type ItemType, type LpPoint } from '../../api/oilAnalysis';
import { useAuth } from '../../auth/AuthContext';
import { ROLE } from '../../auth/session';
import { useOrgUsers } from '../../hooks/useOrgUsers';
import './shared.css';

const CONTRACTOR_CODE_TO_ORG_ID: Record<string, string> = { RHI: 'ORG-RHI', ASEC: 'ORG-ASEC' };
const CONTRACTOR_ORGS = ['ORG-RHI', 'ORG-ASEC'];

type SelectedItem = { lpId: string; label: string; itemType: ItemType };

export default function NewRoutinePage() {
  const { sessionToken, claims } = useAuth();
  const { users } = useOrgUsers();
  const navigate = useNavigate();

  const isAppAdmin = claims?.roles.includes(ROLE.ADMIN) ?? false;
  const [contractorOrgId, setContractorOrgId] = useState(claims?.orgId && CONTRACTOR_ORGS.includes(claims.orgId) ? claims.orgId : CONTRACTOR_ORGS[0]);
  const [assignedTo, setAssignedTo] = useState('');
  const [search, setSearch] = useState('');
  const [points, setPoints] = useState<LpPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
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

  const technicians = useMemo(
    () => users.filter((u) => u.orgId === contractorOrgId && u.roles.includes(ROLE.TECHNICIAN)),
    [users, contractorOrgId],
  );

  const q = search.trim().toLowerCase();
  const candidates = points.filter((p) => {
    if (CONTRACTOR_CODE_TO_ORG_ID[p.Contractor] !== contractorOrgId && p.Contractor !== contractorOrgId) return false;
    if (selected.some((s) => s.lpId === p.LP_ID)) return false;
    if (!q) return true;
    return [p.LP_ID, p.Equipment_ID, p.Lubrication_Point, p.Area].filter(Boolean).some((f) => f!.toLowerCase().includes(q));
  });

  function addPoint(p: LpPoint) {
    setSelected((prev) => [
      ...prev,
      { lpId: p.LP_ID, label: `${p.LP_ID} — ${p.Lubrication_Point}`, itemType: p.Oil_Analysis_Required === 'Yes' ? 'Sample' : 'Change' },
    ]);
  }

  function removePoint(lpId: string) {
    setSelected((prev) => prev.filter((s) => s.lpId !== lpId));
  }

  function setItemType(lpId: string, itemType: ItemType) {
    setSelected((prev) => prev.map((s) => (s.lpId === lpId ? { ...s, itemType } : s)));
  }

  async function handleSubmit() {
    if (!sessionToken) return;
    if (!assignedTo) {
      setError('Choose a technician to assign.');
      return;
    }
    if (selected.length === 0) {
      setError('Add at least one lubrication point.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createRoutine(sessionToken, {
        assignedTo,
        contractorOrgId,
        items: selected.map((s) => ({ lpId: s.lpId, itemType: s.itemType })),
      });
      navigate(`../${result.routineId}`);
    } catch (err) {
      setError(describeError(err, 'Could not create the routine.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h2>New routine</h2>
      {error && <p className="oa-error">{error}</p>}

      <div className="oa-toolbar">
        {isAppAdmin ? (
          <label>
            Contractor{' '}
            <select value={contractorOrgId} onChange={(e) => setContractorOrgId(e.target.value)}>
              {CONTRACTOR_ORGS.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>Contractor: {contractorOrgId}</span>
        )}

        <label>
          Assign to{' '}
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Choose technician…</option>
            {technicians.map((t) => (
              <option key={t.userId} value={t.userId}>
                {t.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>Selected points ({selected.length})</h3>
      {selected.length === 0 ? (
        <p>None yet — search below and add points.</p>
      ) : (
        <table className="oa-table">
          <thead>
            <tr>
              <th>Point</th>
              <th>Item type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {selected.map((s) => (
              <tr key={s.lpId}>
                <td>{s.label}</td>
                <td>
                  <select value={s.itemType} onChange={(e) => setItemType(s.lpId, e.target.value as ItemType)}>
                    <option value="Change">Change</option>
                    <option value="Top-up">Top-up</option>
                    <option value="Sample">Sample</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="oa-button oa-button--secondary" onClick={() => removePoint(s.lpId)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Add points</h3>
      <div className="oa-toolbar">
        <input
          type="search"
          placeholder="Search by LP_ID, equipment, point, or area…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className="oa-table">
        <thead>
          <tr>
            <th>LP_ID</th>
            <th>Point</th>
            <th>Area</th>
            <th>Analysis?</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {candidates.slice(0, 50).map((p) => (
            <tr key={p.LP_ID}>
              <td>{p.LP_ID}</td>
              <td>{p.Lubrication_Point}</td>
              <td>{p.Area}</td>
              <td>{p.Oil_Analysis_Required}</td>
              <td>
                <button type="button" className="oa-button oa-button--secondary" onClick={() => addPoint(p)}>
                  Add
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {candidates.length > 50 && <p className="oa-count">Showing 50 of {candidates.length} — narrow your search.</p>}

      <div className="actions-row">
        <button className="oa-button" type="button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Creating…' : 'Create routine'}
        </button>
      </div>
    </div>
  );
}

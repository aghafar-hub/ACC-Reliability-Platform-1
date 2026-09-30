import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '../api/client';
import {
  getRoutineItems,
  getRoutines,
  submitRoutine,
  submitRoutineItem,
  type Routine,
  type RoutineItem,
} from '../api/oilLubrication';
import { useAuth } from '../auth/AuthContext';
import './MyWork.css';

const OPEN_STATUSES = ['Assigned', 'InProgress'];
const TODAY = () => new Date().toISOString().slice(0, 10);

function RoutineCard({ routine, onOpen }: { routine: Routine; onOpen: () => void }) {
  const overdue = !!routine.dueDate && routine.dueDate < TODAY() && OPEN_STATUSES.includes(routine.status);
  return (
    <button type="button" className="mywork-card" onClick={onOpen}>
      <div className="mywork-card-top">
        <span className="mywork-card-title">{routine.routeName || routine.routineId}</span>
        <span className={overdue ? 'mywork-badge mywork-badge--overdue' : 'mywork-badge'}>
          {overdue ? 'Overdue' : routine.status}
        </span>
      </div>
      <div className="mywork-card-meta">
        {routine.routeType || '—'} · {routine.contractor || '—'}
        {routine.dueDate ? ` · due ${routine.dueDate}` : ''}
      </div>
      <div className="mywork-progress-track">
        <div
          className="mywork-progress-fill"
          style={{ width: routine.itemsTotal ? `${(routine.itemsDone / routine.itemsTotal) * 100}%` : '0%' }}
        />
      </div>
      <div className="mywork-card-count">
        {routine.itemsDone} / {routine.itemsTotal} points done
      </div>
    </button>
  );
}

function ItemRow({
  item,
  locked,
  sessionToken,
  routineId,
  onSaved,
  onError,
}: {
  item: RoutineItem;
  locked: boolean;
  sessionToken: string;
  routineId: string;
  onSaved: (item: RoutineItem) => void;
  onError: (message: string) => void;
}) {
  const [implemented, setImplemented] = useState(item.implemented === 'Yes');
  const [reason, setReason] = useState(item.notImplementedReason || '');
  const [quantity, setQuantity] = useState(item.actualQuantity || '');
  const [sampleTaken, setSampleTaken] = useState(item.sampleTaken === 'Yes');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function markDirty<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await submitRoutineItem(sessionToken, routineId, {
        routineItemId: item.routineItemId,
        implemented,
        notImplementedReason: implemented ? '' : reason,
        actualDate: implemented ? TODAY() : '',
        actualQuantity: quantity,
        sampleTaken,
      });
      setDirty(false);
      onSaved(saved);
    } catch (err) {
      onError(describeError(err, 'Could not save this item.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={implemented ? 'mywork-row mywork-row--done' : reason.trim() ? 'mywork-row mywork-row--warn' : 'mywork-row'}>
      <td className="mywork-td mywork-td-lp">{item.lpId}</td>
      <td className="mywork-td">{item.itemType}</td>
      <td className="mywork-td">
        <select
          className="mywork-select"
          value={implemented ? 'yes' : 'no'}
          disabled={locked}
          onChange={(e) => markDirty(setImplemented)(e.target.value === 'yes')}
        >
          <option value="no">Not done</option>
          <option value="yes">Done</option>
        </select>
      </td>
      <td className="mywork-td">
        {implemented ? (
          <input
            className="mywork-input"
            type="text"
            placeholder="Qty"
            disabled={locked}
            value={quantity}
            onChange={(e) => markDirty(setQuantity)(e.target.value)}
          />
        ) : (
          <input
            className="mywork-input"
            type="text"
            placeholder="Reason not done"
            disabled={locked}
            value={reason}
            onChange={(e) => markDirty(setReason)(e.target.value)}
          />
        )}
      </td>
      <td className="mywork-td mywork-td-center">
        <input type="checkbox" disabled={locked} checked={sampleTaken} onChange={(e) => markDirty(setSampleTaken)(e.target.checked)} />
      </td>
      <td className="mywork-td">
        {!locked && (
          <button type="button" className="mywork-btn" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '…' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}

function RoutineDetail({
  routine,
  sessionToken,
  onBack,
  onSubmitted,
}: {
  routine: Routine;
  sessionToken: string;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getRoutineItems(sessionToken, routine.routineId));
    } catch (err) {
      setError(describeError(err, 'Could not load this routine.'));
    } finally {
      setLoading(false);
    }
  }, [sessionToken, routine.routineId]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = routine.status === 'Assigned' || routine.status === 'InProgress';
  const locked = !canSubmit;

  function handleItemSaved(saved: RoutineItem) {
    setItems((prev) => prev.map((i) => (i.routineItemId === saved.routineItemId ? saved : i)));
  }

  async function handleSubmitRoutine() {
    setSubmitting(true);
    setError(null);
    try {
      await submitRoutine(sessionToken, routine.routineId);
      onSubmitted();
    } catch (err) {
      setError(describeError(err, 'Could not submit this routine.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="mywork-back" onClick={onBack}>
        ← Back to My Work
      </button>
      <h2 className="mywork-detail-title">{routine.routeName || routine.routineId}</h2>
      <p className="mywork-detail-meta">
        {routine.routeType || '—'} · {routine.contractor || '—'}
        {routine.dueDate ? ` · due ${routine.dueDate}` : ''}
      </p>

      {loading && <p className="mywork-empty">Loading…</p>}
      {error && <p className="mywork-error">{error}</p>}

      {!loading && items.length > 0 && (
        <table className="mywork-table">
          <thead>
            <tr>
              <th>LP</th>
              <th>Type</th>
              <th>Status</th>
              <th>Qty / Reason</th>
              <th>Sample</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.routineItemId}
                item={item}
                locked={locked}
                sessionToken={sessionToken}
                routineId={routine.routineId}
                onSaved={handleItemSaved}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      )}

      {canSubmit && !loading && items.length > 0 && (
        <button type="button" className="mywork-btn mywork-btn-primary" onClick={handleSubmitRoutine} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Routine for Review'}
        </button>
      )}
    </div>
  );
}

// The technician-facing (and, for every other role, informational) view of
// routines assigned to the logged-in user — see auth/session.ts'
// isTechnicianOnly and pages/TechnicianShell.tsx for how a Technician-only
// account reaches this as their entire app. Read/write goes straight to
// the Oil Lubrication backend (api/oilLubrication.ts), not through the
// embedded apps/oil-analysis bundle — a Technician's shell never mounts
// that bundle at all (no Sidebar, no other tabs), and this view only needs
// a small slice of what it does (mark items done, submit for review — not
// create/approve, which stay Contractor/ACC Engineer actions elsewhere).
//
// KNOWN LIMITATION: a routine's AssignedTo is still a free-text field in
// apps/oil-analysis' own Assign Technician form (not yet wired to real
// accounts — that's a later increment). This page matches routines by
// comparing AssignedTo to the logged-in user's email, case-insensitively —
// so today, whoever assigns a routine must type the technician's exact
// login email for it to show up here.
export default function MyWork({ showHeading = true }: { showHeading?: boolean }) {
  const { sessionToken, claims } = useAuth();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setError(null);
    try {
      setRoutines(await getRoutines(sessionToken));
    } catch (err) {
      setError(describeError(err, 'Could not load your work.'));
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = useMemo(() => {
    const email = (claims?.email || '').trim().toLowerCase();
    if (!email || !routines) return [];
    return routines.filter((r) => r.assignedTo.trim().toLowerCase() === email);
  }, [routines, claims]);

  const todo = useMemo(
    () =>
      mine
        .filter((r) => OPEN_STATUSES.includes(r.status))
        .sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')),
    [mine],
  );
  const awaiting = useMemo(() => mine.filter((r) => r.status === 'Submitted'), [mine]);

  const selected = selectedId ? mine.find((r) => r.routineId === selectedId) || null : null;

  if (selected && sessionToken) {
    return (
      <div className="mywork">
        <RoutineDetail
          routine={selected}
          sessionToken={sessionToken}
          onBack={() => setSelectedId(null)}
          onSubmitted={() => {
            setSelectedId(null);
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mywork">
      {showHeading && (
        <>
          <h1>My Work</h1>
          <p className="settings-intro">Routines assigned to you.</p>
        </>
      )}
      {error && <p className="mywork-error">{error}</p>}
      {routines === null && !error && <p className="mywork-empty">Loading…</p>}
      {routines !== null && todo.length === 0 && awaiting.length === 0 && (
        <p className="mywork-empty">No work assigned yet — routines assigned to you will show up here.</p>
      )}

      {todo.length > 0 && (
        <div className="mywork-section">
          <p className="mywork-section-title">To do</p>
          <div className="mywork-grid">
            {todo.map((r) => (
              <RoutineCard key={r.routineId} routine={r} onOpen={() => setSelectedId(r.routineId)} />
            ))}
          </div>
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="mywork-section">
          <p className="mywork-section-title">Awaiting approval</p>
          <div className="mywork-grid">
            {awaiting.map((r) => (
              <div key={r.routineId} className="mywork-card mywork-card--static">
                <div className="mywork-card-top">
                  <span className="mywork-card-title">{r.routeName || r.routineId}</span>
                  <span className="mywork-badge">{r.status}</span>
                </div>
                <div className="mywork-card-meta">
                  {r.routeType || '—'} · {r.contractor || '—'}
                  {r.submittedDate ? ` · submitted ${r.submittedDate}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

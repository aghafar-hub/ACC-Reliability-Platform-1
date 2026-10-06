import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { describeError } from '../../api/client';
import {
  addAccComment,
  approveRoutine,
  getRoutine,
  submitRoutine,
  submitRoutineItem,
  type Routine,
  type RoutineItem,
} from '../../api/oilAnalysis';
import { useAuth } from '../../auth/AuthContext';
import { ORG_ACC, ROLE } from '../../auth/session';
import { useOrgUsers } from '../../hooks/useOrgUsers';
import './RoutineDetailPage.css';
import './shared.css';

type ItemDraft = { implemented: boolean; reason: string; date: string; quantity: string };

function draftFor(item: RoutineItem): ItemDraft {
  return {
    implemented: item.Implemented === true,
    reason: item.NotImplementedReason ?? '',
    date: item.ActualDate ? String(item.ActualDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    quantity: item.ActualQuantity != null ? String(item.ActualQuantity) : '',
  };
}

export default function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>();
  const { sessionToken, claims } = useAuth();
  const { byId } = useOrgUsers();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  async function reload() {
    if (!sessionToken || !routineId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getRoutine(sessionToken, routineId);
      setRoutine(result.routine);
      setItems(result.items);
      setDrafts(Object.fromEntries(result.items.map((i) => [i.RoutineItemId, draftFor(i)])));
    } catch (err) {
      setError(describeError(err, 'Could not load this routine.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [sessionToken, routineId]);

  if (loading) return <p>Loading routine…</p>;
  if (error) return <p className="oa-error">{error}</p>;
  if (!routine) return null;

  const roles = claims?.roles ?? [];
  const isAppAdmin = roles.includes(ROLE.ADMIN);
  const isAssignedTechnician = claims?.userId === routine.AssignedTo;
  const isSameContractor = claims?.orgId === routine.Contractor;
  const isAcc = claims?.orgId === ORG_ACC;

  const canEditItems = (isAppAdmin || isAssignedTechnician) && (routine.Status === 'Assigned' || routine.Status === 'InProgress');
  const allItemsSaved = items.length > 0 && items.every((i) => i.Implemented === true || i.Implemented === false);
  const canSubmitRoutine = canEditItems && allItemsSaved;
  const canApprove =
    routine.Status === 'Submitted' &&
    (isAppAdmin || (isSameContractor && (roles.includes(ROLE.CONTRACTOR_ENGINEER) || roles.includes(ROLE.CONTRACTOR_MANAGER) || roles.includes(ROLE.MANAGER))));
  const canComment = isAppAdmin || (isAcc && (roles.includes(ROLE.RELIABILITY_ENGINEER) || roles.includes(ROLE.MANAGER)));

  function updateDraft(itemId: string, patch: Partial<ItemDraft>) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  async function saveItem(item: RoutineItem) {
    if (!sessionToken) return;
    const draft = drafts[item.RoutineItemId];
    if (!draft.implemented && !draft.reason.trim()) {
      setError('A reason is required when marking an item not implemented.');
      return;
    }
    setBusy(item.RoutineItemId);
    setError(null);
    try {
      await submitRoutineItem(sessionToken, item.RoutineItemId, {
        implemented: draft.implemented,
        notImplementedReason: draft.implemented ? undefined : draft.reason.trim(),
        actualDate: draft.date,
        actualQuantity: draft.quantity ? Number(draft.quantity) : undefined,
        sampleTaken: item.ItemType === 'Sample' ? draft.implemented : undefined,
      });
      await reload();
    } catch (err) {
      setError(describeError(err, 'Could not save this item.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmitRoutine() {
    if (!sessionToken || !routineId) return;
    setBusy('routine');
    setError(null);
    try {
      await submitRoutine(sessionToken, routineId);
      await reload();
    } catch (err) {
      setError(describeError(err, 'Could not submit this routine.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (!sessionToken || !routineId) return;
    setBusy('approve');
    setError(null);
    try {
      await approveRoutine(sessionToken, routineId);
      await reload();
    } catch (err) {
      setError(describeError(err, 'Could not approve this routine.'));
    } finally {
      setBusy(null);
    }
  }

  async function handleComment() {
    if (!sessionToken || !routineId || !comment.trim()) return;
    setBusy('comment');
    setError(null);
    try {
      await addAccComment(sessionToken, routineId, comment.trim());
      setComment('');
      await reload();
    } catch (err) {
      setError(describeError(err, 'Could not add the comment.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2>{routine.RoutineId}</h2>
      <dl className="routine-meta">
        <div>
          <dt>Assigned to</dt>
          <dd>{byId.get(routine.AssignedTo)?.email ?? routine.AssignedTo}</dd>
        </div>
        <div>
          <dt>Contractor</dt>
          <dd>{routine.Contractor}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="oa-badge">{routine.Status}</span>
          </dd>
        </div>
        <div>
          <dt>Created by</dt>
          <dd>{byId.get(routine.CreatedBy)?.email ?? routine.CreatedBy}</dd>
        </div>
        {routine.ApprovedBy && (
          <div>
            <dt>Approved by</dt>
            <dd>{byId.get(routine.ApprovedBy)?.email ?? routine.ApprovedBy}</dd>
          </div>
        )}
      </dl>

      {error && <p className="oa-error">{error}</p>}

      <h3>Items</h3>
      {items.map((item) => {
        const draft = drafts[item.RoutineItemId];
        return (
          <div className="item-card" key={item.RoutineItemId}>
            <div className="item-card-header">
              <strong>
                {item.LP_ID} — {item.ItemType}
              </strong>
              <span>{item.RequiredOilType}</span>
            </div>
            {canEditItems ? (
              <div className="item-form">
                <label>
                  Implemented
                  <input
                    type="checkbox"
                    checked={draft.implemented}
                    onChange={(e) => updateDraft(item.RoutineItemId, { implemented: e.target.checked })}
                  />
                </label>
                {draft.implemented ? (
                  <>
                    <label>
                      Date
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => updateDraft(item.RoutineItemId, { date: e.target.value })}
                      />
                    </label>
                    {item.ItemType !== 'Sample' && (
                      <label>
                        Quantity
                        <input
                          type="number"
                          step="0.1"
                          value={draft.quantity}
                          onChange={(e) => updateDraft(item.RoutineItemId, { quantity: e.target.value })}
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <label style={{ flex: 1, minWidth: '200px' }}>
                    Reason not implemented
                    <input
                      type="text"
                      value={draft.reason}
                      onChange={(e) => updateDraft(item.RoutineItemId, { reason: e.target.value })}
                    />
                  </label>
                )}
                <button
                  className="oa-button"
                  type="button"
                  disabled={busy === item.RoutineItemId}
                  onClick={() => saveItem(item)}
                >
                  {busy === item.RoutineItemId ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <p className="item-readonly">
                {item.Implemented === true
                  ? `Implemented on ${item.ActualDate ?? '—'}${item.ActualQuantity ? ` (qty ${item.ActualQuantity})` : ''}`
                  : item.Implemented === false
                    ? `Not implemented — ${item.NotImplementedReason}`
                    : 'Not yet recorded'}
              </p>
            )}
          </div>
        );
      })}

      <div className="actions-row">
        {canSubmitRoutine && (
          <button className="oa-button" type="button" disabled={busy === 'routine'} onClick={handleSubmitRoutine}>
            {busy === 'routine' ? 'Submitting…' : 'Submit routine'}
          </button>
        )}
        {canApprove && (
          <button className="oa-button" type="button" disabled={busy === 'approve'} onClick={handleApprove}>
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        )}
      </div>

      {(routine.ACC_Comment || canComment) && (
        <div className="comment-box">
          <h3>ACC comment</h3>
          {routine.ACC_Comment && (
            <p>
              {routine.ACC_Comment} — <em>{byId.get(routine.ACC_CommentBy ?? '')?.email ?? routine.ACC_CommentBy}</em>
            </p>
          )}
          {canComment && (
            <>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
              <button className="oa-button oa-button--secondary" type="button" disabled={busy === 'comment'} onClick={handleComment}>
                {busy === 'comment' ? 'Saving…' : 'Add comment'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

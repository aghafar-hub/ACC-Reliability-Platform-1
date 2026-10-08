import { useCallback, useEffect, useMemo, useState } from 'react';
import { tabLevel, useModuleAccess } from '../moduleAccess';
import '../components/ModuleAccessNotice.css';
import { describeError } from '../api/client';
import {
  getRoutineItems,
  getOilPlan,
  getRoutines,
  isRouteOverdue,
  isRouteReturned,
  ROUTE_STATUS,
  submitRoutine,
  submitRoutineItem,
  type Routine,
  type RoutineItem,
  type OilPlan,
} from '../api/oilLubrication';
import { useAuth } from '../auth/AuthContext';
import { tapHaptic } from '../haptics';
import WorkQueue from '../components/WorkQueue';
import VibRouteDetail from './VibRouteDetail';
import { fetchMyWork, myWorkModules, type ModuleWork } from '../myWork';
import './MyWork.css';

const OPEN_STATUSES: string[] = [ROUTE_STATUS.ASSIGNED, ROUTE_STATUS.IN_PROGRESS];
const TODAY = () => new Date().toISOString().slice(0, 10);

// Left-border accent color on each card — the status is already named in
// the badge text, but a technician scanning a list of 10+ routines reads
// the colored edge before the label. Mirrors a physical equipment tag's own
// colored status strip rather than decorating for its own sake.
function statusAccentClass(status: string, overdue: boolean): string {
  if (overdue) return 'mywork-card--overdue';
  if (status === ROUTE_STATUS.IN_PROGRESS) return 'mywork-card--inprogress';
  if (status === ROUTE_STATUS.WAITING) return 'mywork-card--submitted';
  return '';
}

// How far along a route is (design D5): a ring read at arm's length —
// "2/6" in the middle, full and green when every point is done.
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 52;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const finished = total > 0 && done >= total;
  return (
    <svg className="mywork-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${total} points done`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--shell-text-muted, #5f6d82) 22%, transparent)" strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={finished ? 'var(--shell-success, #18734a)' : 'var(--shell-accent, #1e5bb8)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x={size / 2} y={size / 2 + 4.5} textAnchor="middle" className={finished ? 'mywork-ring-text mywork-ring-text--done' : 'mywork-ring-text'}>
        {total ? `${done}/${total}` : '—'}
      </text>
    </svg>
  );
}

function RoutineCard({ routine, onOpen }: { routine: Routine; onOpen: () => void }) {
  const overdue = isRouteOverdue(routine);
  const returned = isRouteReturned(routine);
  return (
    <button
      type="button"
      className={`mywork-card tap-scale ${statusAccentClass(routine.status, overdue || returned)}`}
      onClick={onOpen}
    >
      <div className="mywork-card-row">
        <ProgressRing done={routine.itemsDone} total={routine.itemsTotal} />
        <div className="mywork-card-body">
      <div className="mywork-card-top">
        <span className="mywork-card-title">{routine.routeName || routine.routineId}</span>
        <span className="mywork-badges">
          {returned && <span className="mywork-badge mywork-badge--overdue">Returned</span>}
          <span className={overdue ? 'mywork-badge mywork-badge--overdue' : 'mywork-badge'}>
            {overdue ? 'Overdue' : routine.status}
          </span>
        </span>
      </div>
      {returned && (
        <div className="mywork-card-returned">
          {routine.returnReason ? `Fix: ${routine.returnReason}` : 'Returned for correction'}
          <span className="mywork-card-cta">Tap to correct and resubmit →</span>
        </div>
      )}
      <div className="mywork-card-meta">
        {routine.routeType || '—'} · {routine.contractor || '—'}
        {routine.dueDate ? ` · due ${routine.dueDate}` : ''}
      </div>
      <div className="mywork-card-count">
        {routine.itemsDone} / {routine.itemsTotal} points done
      </div>
        </div>
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
  plan,
}: {
  item: RoutineItem;
  locked: boolean;
  sessionToken: string;
  routineId: string;
  onSaved: (item: RoutineItem) => void;
  onError: (message: string) => void;
  plan?: OilPlan;
}) {
  const [implemented, setImplemented] = useState(item.implemented === 'Yes');
  const [oilProductId, setOilProductId] = useState(item.oilUsedProductId || '');
  const allowedOils = plan?.allowed || [];
  const oilChoice = oilProductId || (allowedOils.length === 1 ? allowedOils[0].productId : '');
  const [reason, setReason] = useState(item.notImplementedReason || '');
  const [quantity, setQuantity] = useState(item.actualQuantity || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function markDirty<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  async function handleSave() {
    if (implemented && allowedOils.length > 0 && !oilChoice) {
      onError(`Choose the oil used on ${item.lpId}.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await submitRoutineItem(sessionToken, routineId, {
        routineItemId: item.routineItemId,
        implemented,
        notImplementedReason: implemented ? '' : reason,
        actualDate: implemented ? TODAY() : '',
        actualQuantity: quantity,
        // No separate "Sample taken" box: Done on a Sampling route item
        // already means the sample was taken (same as the Routines page).
        sampleTaken: implemented,
        oilProductId: implemented ? oilChoice : '',
      });
      setDirty(false);
      tapHaptic();
      onSaved(saved);
    } catch (err) {
      onError(describeError(err, 'Could not save this item.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={implemented ? 'mywork-row mywork-row--done' : reason.trim() ? 'mywork-row mywork-row--warn' : 'mywork-row'}>
      {/* data-label feeds each cell's own ::before on the <700px card layout
          (MyWork.css) — the table markup/logic stays exactly as-is, only
          the visual presentation reflows from a row to a stacked card. */}
      <td className="mywork-td mywork-td-lp" data-label="LP">
        <span>{item.lpId}</span>
        {item.oilUsed ? (
          <span className="mywork-oil">Used: {item.oilUsed}</span>
        ) : (
          plan?.use &&
          !locked && (
            <span className="mywork-oil" data-testid="oil-to-use">
              Use: <strong>{plan.use.label}</strong>
              {plan.use.isEquivalent && <em className="mywork-oil-equiv"> approved equivalent</em>}
              {plan.note && <span className="mywork-oil-note">{plan.note}</span>}
            </span>
          )
        )}
      </td>
      <td className="mywork-td" data-label="Type">
        <span>{item.itemType}</span>
      </td>
      <td className="mywork-td" data-label="Status">
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
      <td className="mywork-td" data-label={implemented ? 'Qty' : 'Reason'}>
        {implemented ? (
          <>
            <input
              className="mywork-input"
              type="text"
              placeholder="Qty"
              disabled={locked}
              value={quantity}
              onChange={(e) => markDirty(setQuantity)(e.target.value)}
            />
            {allowedOils.length > 0 && (
              <select
                className="mywork-select mywork-oil-select"
                aria-label={`Oil used on ${item.lpId}`}
                disabled={locked}
                value={oilChoice}
                onChange={(e) => markDirty(setOilProductId)(e.target.value)}
              >
                {allowedOils.length > 1 && <option value="">Oil used…</option>}
                {allowedOils.map((o) => (
                  <option key={o.productId} value={o.productId}>
                    {o.label}
                    {o.isEquivalent ? ' (approved equivalent)' : ''}
                  </option>
                ))}
              </select>
            )}
          </>
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
      <td className="mywork-td mywork-td-save">
        {!locked && (
          <button type="button" className="mywork-btn tap-scale" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? '…' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}

// Replaces a plain "Loading…" string while routines/items are in flight —
// a shape matching the real content (card grid or table rows) reads as
// "this is already here, just filling in" rather than a dead stop, which
// matters more on a flaky plant-floor connection where this can sit for a
// few seconds. Pure CSS pulse (MyWork.css's @keyframes mywork-skeleton-pulse),
// no layout measurement needed.
function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="mywork-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="mywork-card mywork-skeleton-card">
          <div className="mywork-skeleton-bar" style={{ width: '70%', height: 14 }} />
          <div className="mywork-skeleton-bar" style={{ width: '45%', height: 11, marginTop: 10 }} />
          <div className="mywork-skeleton-bar" style={{ width: '100%', height: 6, marginTop: 16 }} />
        </div>
      ))}
    </div>
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

  const canSubmit = OPEN_STATUSES.includes(routine.status);
  const locked = !canSubmit;
  const returned = isRouteReturned(routine);

  // Phase 8: which oil each point gets.
  const [oilPlans, setOilPlans] = useState<Record<string, OilPlan>>({});
  const planType = routine.routeType === 'Oil Change' ? 'Change' : routine.routeType === 'Emergency Top Up' ? 'TopUp' : null;
  const planLps = items.map((i) => i.lpId).join(',');
  useEffect(() => {
    if (!planType || !planLps) return;
    let cancelled = false;
    getOilPlan(sessionToken, planLps.split(','), planType)
      .then((plans) => {
        if (!cancelled) setOilPlans(plans);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionToken, planType, planLps]);

  function handleItemSaved(saved: RoutineItem) {
    setError(null);
    setItems((prev) => prev.map((i) => (i.routineItemId === saved.routineItemId ? saved : i)));
  }

  async function handleSubmitRoutine() {
    setSubmitting(true);
    setError(null);
    try {
      await submitRoutine(sessionToken, routine.routineId);
      tapHaptic();
      onSubmitted();
    } catch (err) {
      setError(describeError(err, 'Could not submit this routine.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="mywork-back tap-scale" onClick={onBack}>
        ← Back to My Work
      </button>
      <h2 className="mywork-detail-title">{routine.routeName || routine.routineId}</h2>
      <p className="mywork-detail-meta">
        {routine.routeType || '—'} · {routine.contractor || '—'}
        {routine.dueDate ? ` · due ${routine.dueDate}` : ''}
      </p>
      {returned && (
        <div className="mywork-returned" role="status">
          <strong>Returned for correction</strong>
          {routine.returnReason ? `: ${routine.returnReason}` : ''}
          {routine.returnedBy ? ` — ${routine.returnedBy}` : ''}
          <div>Correct the points below if needed, then resubmit.</div>
          {canSubmit && !loading && items.length > 0 && (
            <button
              type="button"
              className="mywork-btn mywork-btn-primary tap-scale"
              onClick={handleSubmitRoutine}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Resubmit for approval'}
            </button>
          )}
        </div>
      )}

      {loading && <SkeletonCards count={3} />}
      {error && <p className="mywork-error">{error}</p>}

      {!loading && items.length > 0 && (
        <table className="mywork-table">
          <thead>
            <tr>
              <th>LP</th>
              <th>Type</th>
              <th>Status</th>
              <th>Qty / Reason</th>
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
                plan={oilPlans[item.lpId]}
              />
            ))}
          </tbody>
        </table>
      )}

      {canSubmit && !loading && items.length > 0 && (
        <button
          type="button"
          className="mywork-btn mywork-btn-primary tap-scale"
          onClick={handleSubmitRoutine}
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : returned ? 'Resubmit for approval' : 'Submit for approval'}
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
// Matches routines by comparing AssignedTo to the logged-in user's email,
// case-insensitively — Patch 1 wired apps/oil-analysis' own Assign
// Technician form to a real account picker (TechnicianPicker.jsx), so
// AssignedTo is normally that account's real login email already, not
// free text. It can still fall back to a manually-typed value (the
// picker's own "couldn't load the directory" case), which is the one way
// a routine can silently fail to show up here today: any mismatch —
// a typo, extra whitespace, a different address than the one this account
// actually logs in with — and this filter just finds nothing, with no
// error surfaced anywhere.
export default function MyWork({
  showHeading = true,
  initialRoutineId,
  onInitialRoutineConsumed,
}: {
  showHeading?: boolean;
  initialRoutineId?: string | null;
  onInitialRoutineConsumed?: () => void;
}) {
  const { sessionToken, claims } = useAuth();
  const { access } = useModuleAccess();
  const oilAccess = access['oil-analysis'];
  // Phase 0: My Work is Oil Lubrication's "mywork" tab.
  const canSeeOilWork = tabLevel(oilAccess, 'mywork') !== 'Hidden';
  // Phase 9: the role-based work from every module that provides it.
  const workModules = useMemo(() => myWorkModules(access), [access]);
  const workModuleKey = workModules.map((m) => m.id).join(',');
  const [work, setWork] = useState<ModuleWork[] | null>(null);
  const oilMaintenance = !!oilAccess?.enforced && oilAccess.status === 'Maintenance';
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A vibration route opened from the work queue (checklist in place).
  const [vibRouteId, setVibRouteId] = useState<string | null>(null);

  // Opened from NotificationBell's onOpenRoutine (TechnicianShell) — same
  // "arrived here wanting one specific record" pattern
  // apps/oil-analysis/src/pages/Routines.jsx's own initialRoutineId prop
  // already uses for the exact same notification.
  useEffect(() => {
    if (!initialRoutineId) return;
    setSelectedId(initialRoutineId);
    onInitialRoutineConsumed?.();
  }, [initialRoutineId, onInitialRoutineConsumed]);

  const load = useCallback(async () => {
    if (!sessionToken || !canSeeOilWork) return;
    setError(null);
    try {
      setRoutines(await getRoutines(sessionToken));
    } catch (err) {
      setError(describeError(err, 'Could not load your work.'));
    }
  }, [sessionToken, canSeeOilWork]);

  useEffect(() => {
    load();
  }, [load]);

  const [workVersion, setWorkVersion] = useState(0);
  useEffect(() => {
    if (!sessionToken || !workModuleKey) return;
    let cancelled = false;
    fetchMyWork(sessionToken, workModules).then((w) => {
      if (!cancelled) setWork(w);
    });
    return () => {
      cancelled = true;
    };
    // workModules changes only when workModuleKey does
  }, [sessionToken, workModuleKey, workVersion]);

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
  const awaiting = useMemo(() => mine.filter((r) => r.status === ROUTE_STATUS.WAITING), [mine]);

  const selected = selectedId ? mine.find((r) => r.routineId === selectedId) || null : null;

  if (!canSeeOilWork && workModules.length === 0) {
    return (
      <div className="mywork">
        {showHeading && <h1>My Work</h1>}
        <p className="settings-intro">You don't have any modules with assigned work. Ask the App Owner if this is wrong.</p>
      </div>
    );
  }
  const queueCount = (work || []).reduce((n, m) => n + m.sections.length, 0);
  const routinesLoaded = !canSeeOilWork || routines !== null;

  const maintenanceBanner = oilMaintenance && (
    <div className="module-notice module-notice--maintenance" role="status">
      <strong>Oil Lubrication is being updated.</strong> You can see your work, but you can't submit anything right now.
    </div>
  );

  if (vibRouteId && sessionToken) {
    return (
      <div className="mywork">
        <VibRouteDetail
          routeId={vibRouteId}
          sessionToken={sessionToken}
          onBack={() => {
            setVibRouteId(null);
            setWorkVersion((v) => v + 1);
          }}
          onSubmitted={() => {
            setVibRouteId(null);
            setWorkVersion((v) => v + 1);
          }}
        />
      </div>
    );
  }

  if (selected && sessionToken) {
    return (
      <div className="mywork">
        {maintenanceBanner}
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
          <p className="settings-intro">What's waiting for you, across every module.</p>
        </>
      )}
      {maintenanceBanner}
      {error && <p className="mywork-error">{error}</p>}
      {((canSeeOilWork && routines === null) || (workModules.length > 0 && work === null)) && !error && <SkeletonCards count={4} />}
      {work && queueCount > 0 && (
        <WorkQueue
          work={work}
          showModuleNames={workModules.length > 1}
          onOpen={(moduleId, item, sectionId) => {
            // a technician's own vibration route opens as a checklist right here
            if (moduleId === 'vibration-analysis' && sectionId === 'vib-my-routes' && item.link?.recordId) {
              setVibRouteId(item.link.recordId);
              return true;
            }
            return false;
          }}
        />
      )}
      {routinesLoaded && (work !== null || workModules.length === 0) && queueCount === 0 && todo.length === 0 && awaiting.length === 0 && (
        <p className="mywork-empty">Nothing waiting for you right now — routes assigned to you and work for your role will show up here.</p>
      )}

      {todo.length > 0 && (
        <div className="mywork-section">
          <p className="mywork-section-title">{queueCount > 0 ? 'My routes — to do' : 'To do'}</p>
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
              <div key={r.routineId} className="mywork-card mywork-card--static mywork-card--submitted">
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

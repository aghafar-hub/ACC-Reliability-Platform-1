import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVibRoute, saveVibRouteProgress, submitVibRoute, type VibRoute, type VibRoutePoint } from '../api/vibration';
import { tapHaptic } from '../haptics';

// A technician's vibration route in My Work (workflow "Technician Route
// Execution"): one Done box per VIB point (or a skip reason), a comment per
// machine and for the route, then Submit for the contractor engineer. The
// Done box means the field work is done — readings come with the report.
// A route can be submitted only when every point is done or skipped.
//
// Works with a poor signal: every change is kept on the phone first
// (localStorage, one draft per route) and sent with Save; with no
// connection it waits and sends itself when the phone is back online. If
// the route changed on the server since the draft was started (the
// engineer returned or reassigned it, or it was ticked on another device),
// the draft is kept and the technician chooses: keep mine and save, or use
// the server's.

type PointState = { done: boolean; skip: string };
type Draft = {
  state: Record<string, PointState>;
  eqComments: Record<string, string>;
  routeComment: string;
  base: string; // the server's checklist when the draft started
  savedAt: string;
  pending: boolean; // a save that couldn't be sent yet
  route: VibRoute;
  points: VibRoutePoint[];
};

const draftKey = (routeId: string) => `vibr-draft:${routeId}`;
function readDraft(routeId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(routeId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(routeId: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(routeId), JSON.stringify(d));
    else localStorage.removeItem(draftKey(routeId));
  } catch {
    /* storage full or blocked: the page still works online */
  }
}
// What the server holds, as one comparable string.
function snapshot(route: VibRoute, points: VibRoutePoint[]) {
  return JSON.stringify([route.Status, route.Technician, route['Route comment'] || '', points.map((p) => [p['VIB ID'], p.Done, p['Skip reason'] || '', p['Equipment comment'] || ''])]);
}
const isOffline = (err: unknown) => (typeof navigator !== 'undefined' && navigator.onLine === false) || err instanceof TypeError || /network|failed to fetch|load failed/i.test(String((err as Error)?.message || err));

export default function VibRouteDetail({ routeId, sessionToken, onBack, onSubmitted }: { routeId: string; sessionToken: string; onBack: () => void; onSubmitted: () => void }) {
  const [route, setRoute] = useState<VibRoute | null>(null);
  const [points, setPoints] = useState<VibRoutePoint[]>([]);
  const [state, setState] = useState<Record<string, PointState>>({});
  const [eqComments, setEqComments] = useState<Record<string, string>>({});
  const [routeComment, setRouteComment] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [base, setBase] = useState('');
  const [offline, setOffline] = useState(false); // showing the copy kept on the phone
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draftAt, setDraftAt] = useState('');
  // changed on this screen (not just a draft read back from the phone)
  const editedHere = useRef(false);

  const applyServer = useCallback((r: VibRoute, pts: VibRoutePoint[]) => {
    setRoute(r);
    setPoints(pts);
    setState(Object.fromEntries(pts.map((p) => [p['VIB ID'], { done: p.Done === 'Yes', skip: p['Skip reason'] || '' }])));
    const c: Record<string, string> = {};
    pts.forEach((p) => {
      if (p['Equipment comment']) c[p['Equipment ID']] = p['Equipment comment'];
    });
    setEqComments(c);
    setRouteComment(r['Route comment'] || '');
    setBase(snapshot(r, pts));
    setDirty(false);
  }, []);
  const applyDraft = useCallback((d: Draft) => {
    setState(d.state);
    setEqComments(d.eqComments);
    setRouteComment(d.routeComment);
    setDirty(true);
    setPending(d.pending);
    setDraftAt(d.savedAt);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const draft = readDraft(routeId);
    try {
      const d = await getVibRoute(sessionToken, routeId);
      applyServer(d.route, d.points);
      setOffline(false);
      if (draft) {
        applyDraft(draft);
        setBase(draft.base);
        setConflict(draft.base !== snapshot(d.route, d.points));
      }
    } catch (err) {
      if (draft && isOffline(err)) {
        // no signal: work from the copy on the phone
        setRoute(draft.route);
        setPoints(draft.points);
        setBase(draft.base);
        applyDraft(draft);
        setOffline(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not load this route.');
      }
    }
  }, [sessionToken, routeId, applyServer, applyDraft]);
  useEffect(() => {
    load();
  }, [load]);

  // keep every change on the phone (a draft only read back, and cleared
  // meanwhile by a save on another screen, is not written back)
  useEffect(() => {
    if (!route || !dirty) return;
    if (!editedHere.current && !readDraft(routeId)) return;
    const at = new Date().toISOString();
    writeDraft(routeId, { state, eqComments, routeComment, base, savedAt: at, pending, route, points });
  }, [routeId, route, points, state, eqComments, routeComment, base, dirty, pending]);

  const machines = useMemo(() => {
    const m: Record<string, VibRoutePoint[]> = {};
    points.forEach((p) => (m[p['Equipment ID']] ||= []).push(p));
    return Object.entries(m);
  }, [points]);
  const resolved = Object.values(state).filter((s) => s.done || s.skip.trim()).length;
  const editable = !!route && ['Assigned', 'In Progress', 'Returned'].includes(route.Status);

  function setPoint(vib: string, patch: Partial<PointState>) {
    setState((p) => ({ ...p, [vib]: { ...p[vib], ...patch } }));
    editedHere.current = true;
    setDirty(true);
    setSaved('');
  }

  async function save(force = false): Promise<boolean> {
    if (conflict && !force) {
      setError('This route changed on the server since you started. Choose "Keep my changes" or "Use the server copy" above.');
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      // check the server copy first (another device, or the engineer)
      if (!force) {
        const now = await getVibRoute(sessionToken, routeId);
        if (snapshot(now.route, now.points) !== base) {
          setRoute(now.route);
          setConflict(true);
          setError('This route changed on the server since you started. Choose "Keep my changes" or "Use the server copy" above.');
          return false;
        }
      }
      await saveVibRouteProgress(
        sessionToken,
        routeId,
        Object.entries(state).map(([vibId, s]) => ({ vibId, done: s.done, skipReason: s.done ? '' : s.skip })),
        eqComments,
        routeComment,
      );
      writeDraft(routeId, null);
      editedHere.current = false;
      setDirty(false);
      setPending(false);
      setConflict(false);
      setOffline(false);
      setDraftAt('');
      const fresh = await getVibRoute(sessionToken, routeId).catch(() => null);
      if (fresh) applyServer(fresh.route, fresh.points);
      setSaved('Saved');
      return true;
    } catch (err) {
      if (isOffline(err)) {
        setPending(true);
        setOffline(true);
        setSaved('');
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Could not save.');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  // back online: send what's waiting
  useEffect(() => {
    const on = () => {
      if (pending && !conflict) save();
      else if (offline) load();
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  });

  async function keepMine() {
    setConflict(false);
    setError(null);
    await save(true);
  }
  function useServer() {
    writeDraft(routeId, null);
    editedHere.current = false;
    setConflict(false);
    setPending(false);
    setDraftAt('');
    setError(null);
    load();
  }

  async function submit() {
    if (offline || pending) {
      setError('No connection — save first; you can submit when the phone is back online.');
      return;
    }
    if (dirty && !(await save())) return;
    setBusy(true);
    setError(null);
    try {
      await submitVibRoute(sessionToken, routeId);
      tapHaptic();
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="vib-route-detail">
      <button type="button" className="mywork-back tap-scale" onClick={onBack}>
        ← Back to My Work
      </button>
      <h2 className="mywork-detail-title">{route?.Name || routeId}</h2>
      {route && (
        <p className="mywork-detail-meta">
          Vibration · {route.Type} · {route.Contractor} {route['Report scope']} · planned {route['Planned date']}
          {route.overdue ? ' · overdue' : ''} · {resolved} / {points.length} points
        </p>
      )}
      {route?.Reason && <p className="mywork-detail-meta">Why: {route.Reason}</p>}
      {route?.Status === 'Returned' && (
        <div className="mywork-returned" role="status">
          <strong>Returned for correction</strong>
          <div>{route['Return reason']}</div>
        </div>
      )}
      {(offline || pending) && (
        <div className="vibr-offline" role="status" data-testid="vibr-offline">
          <strong>{pending ? 'Waiting for a connection' : 'No connection'}</strong>
          <div>
            {pending ? 'Your changes are kept on this phone and will be sent when you are back online.' : 'Showing the copy kept on this phone. Changes are kept here until you can save.'}
          </div>
        </div>
      )}
      {!offline && !pending && draftAt && dirty && !conflict && (
        <p className="mywork-detail-meta" data-testid="vibr-draft">Changes kept on this phone since {new Date(draftAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} — not saved yet.</p>
      )}
      {conflict && (
        <div className="mywork-returned" role="alert" data-testid="vibr-conflict">
          <strong>The route changed since you started</strong>
          <div>
            Someone else saved this route{route ? ` (now ${route.Status})` : ''}. Your changes are still on this phone.
          </div>
          <div className="vibr-actions">
            <button type="button" className="mywork-btn" onClick={useServer} disabled={busy} data-testid="vibr-use-server">
              Use the server copy
            </button>
            {editable && (
              <button type="button" className="mywork-btn mywork-btn-primary" onClick={keepMine} disabled={busy} data-testid="vibr-keep-mine">
                Keep my changes
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mywork-error" role="alert">{error}</p>}
      {!route && !error && <p className="mywork-detail-meta">Loading…</p>}
      {machines.map(([eq, pts]) => (
        <section key={eq} className="vibr-machine" data-testid={`vibr-eq-${eq}`}>
          <h3 className="vibr-machine-title">{eq}</h3>
          {pts.map((p) => {
            const s = state[p['VIB ID']] || { done: false, skip: '' };
            return (
              <div key={p['VIB ID']} className={`vibr-point${s.done ? ' vibr-point--done' : s.skip ? ' vibr-point--skip' : ''}`}>
                <label className="vibr-check">
                  <input type="checkbox" checked={s.done} disabled={!editable} onChange={(e) => setPoint(p['VIB ID'], { done: e.target.checked })} data-testid={`vibr-done-${p['VIB ID']}`} />
                  <span>
                    <b>{p.Point}</b>
                    <span className="vibr-vib">{p['VIB ID']}</span>
                  </span>
                </label>
                {!s.done && editable && (
                  <input className="mywork-input vibr-skip" placeholder="Not measured? Say why" value={s.skip} onChange={(e) => setPoint(p['VIB ID'], { skip: e.target.value })} data-testid={`vibr-skip-${p['VIB ID']}`} />
                )}
                {!s.done && !editable && s.skip && <span className="vibr-vib">Skipped: {s.skip}</span>}
              </div>
            );
          })}
          <input
            className="mywork-input"
            placeholder="Comment on this machine (optional)"
            value={eqComments[eq] || ''}
            disabled={!editable}
            onChange={(e) => {
              setEqComments((c) => ({ ...c, [eq]: e.target.value }));
              editedHere.current = true;
              setDirty(true);
            }}
          />
        </section>
      ))}
      {route && (
        <>
          <textarea
            className="mywork-input vibr-route-comment"
            placeholder="Route comment (optional)"
            value={routeComment}
            disabled={!editable}
            onChange={(e) => {
              setRouteComment(e.target.value);
              editedHere.current = true;
              setDirty(true);
            }}
          />
          {editable ? (
            <div className="vibr-actions">
              <button type="button" className="mywork-btn" disabled={busy || !dirty} onClick={() => save()} data-testid="vibr-save">
                {busy ? 'Saving…' : pending ? 'Try again' : saved || 'Save progress'}
              </button>
              <button type="button" className="mywork-btn mywork-btn-primary" disabled={busy || resolved < points.length || offline || pending} onClick={submit} data-testid="vibr-submit">
                {resolved < points.length ? `${points.length - resolved} point(s) left` : 'Submit for engineer review'}
              </button>
            </div>
          ) : (
            <p className="mywork-detail-meta">This route is {route.Status.toLowerCase()}.</p>
          )}
        </>
      )}
    </div>
  );
}

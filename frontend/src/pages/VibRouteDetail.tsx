import { useCallback, useEffect, useMemo, useState } from 'react';
import { getVibRoute, saveVibRouteProgress, submitVibRoute, type VibRoute, type VibRoutePoint } from '../api/vibration';
import { tapHaptic } from '../haptics';

// A technician's vibration route in My Work (workflow "Technician Route
// Execution"): one Done box per VIB point (or a skip reason), a comment per
// machine and for the route, then Submit for the contractor engineer. The
// Done box means the field work is done — readings come with the report.
// A route can be submitted only when every point is done or skipped.

type PointState = { done: boolean; skip: string };

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await getVibRoute(sessionToken, routeId);
      setRoute(d.route);
      setPoints(d.points);
      setState(Object.fromEntries(d.points.map((p) => [p['VIB ID'], { done: p.Done === 'Yes', skip: p['Skip reason'] || '' }])));
      const c: Record<string, string> = {};
      d.points.forEach((p) => {
        if (p['Equipment comment']) c[p['Equipment ID']] = p['Equipment comment'];
      });
      setEqComments(c);
      setRouteComment(d.route['Route comment'] || '');
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this route.');
    }
  }, [sessionToken, routeId]);
  useEffect(() => {
    load();
  }, [load]);

  const machines = useMemo(() => {
    const m: Record<string, VibRoutePoint[]> = {};
    points.forEach((p) => (m[p['Equipment ID']] ||= []).push(p));
    return Object.entries(m);
  }, [points]);
  const resolved = Object.values(state).filter((s) => s.done || s.skip.trim()).length;
  const editable = !!route && ['Assigned', 'In Progress', 'Returned'].includes(route.Status);

  function setPoint(vib: string, patch: Partial<PointState>) {
    setState((p) => ({ ...p, [vib]: { ...p[vib], ...patch } }));
    setDirty(true);
    setSaved('');
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await saveVibRouteProgress(
        sessionToken,
        routeId,
        Object.entries(state).map(([vibId, s]) => ({ vibId, done: s.done, skipReason: s.done ? '' : s.skip })),
        eqComments,
        routeComment,
      );
      setDirty(false);
      setSaved('Saved');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
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
              setDirty(true);
            }}
          />
          {editable ? (
            <div className="vibr-actions">
              <button type="button" className="mywork-btn" disabled={busy || !dirty} onClick={save} data-testid="vibr-save">
                {busy ? 'Saving…' : saved || 'Save progress'}
              </button>
              <button type="button" className="mywork-btn mywork-btn-primary" disabled={busy || resolved < points.length} onClick={submit} data-testid="vibr-submit">
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

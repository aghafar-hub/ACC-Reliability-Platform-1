import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail, useIsRouteEngineerFor } from "../SessionContext";
import * as api from "../api";
import { routineSuggestionReason, todayISO, ROUTE_STATUS, isRouteOverdue, isRouteReturned } from "../parsers";
import ProgressBar from "../components/ProgressBar";
import TechnicianPicker from "../components/TechnicianPicker";
import EditRoutineModal from "../components/EditRoutineModal";

const REASON_COLOR = { resample: "danger", overdue: "warning", missing: "danger", due: "accent" };

function ReasonBadge({ T, reason }) {
  if (!reason) return null;
  const color = T[REASON_COLOR[reason.kind]] || T.accent;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        color,
        background: color + "1c",
        borderRadius: 4,
        padding: "1px 6px",
        marginTop: 2,
        whiteSpace: "nowrap",
      }}
    >
      {reason.label}
    </span>
  );
}

function ItemRow({ item, registryByLp, reasonInfo, locked, webhookUrl, routineId, pushToast, onSaved }) {
  const { T, s } = useTheme();
  const reg = registryByLp[item.lpId];
  // Oil Type/Brand prefers the registry's own live value for this LP — it
  // was never actually captured on the item itself before this pass (see
  // NewRoutine.jsx's own comment on sending requiredOilType), so an older
  // routine's item.requiredOilType is blank and falls back to the registry
  // instead of going blank in the table.
  const requiredOilType = item.requiredOilType || reg?.lubricant || "";
  const requiredOilBrand = reg?.lubricantBrand || "";
  const requiredQty = reg?.lubricantQuantityL || "";
  const [implemented, setImplemented] = useState(item.implemented === "Yes");
  const [reason, setReason] = useState(item.notImplementedReason || "");
  const [quantity, setQuantity] = useState(item.actualQuantity || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Scannable at-a-glance row tint: done is a light green wash, not-done-
  // with-a-reason recorded is amber (deliberate skip, not an oversight),
  // and plain not-done is left neutral.
  const rowTint = implemented ? T.success + "0d" : reason.trim() ? T.warning + "0d" : "transparent";

  function markDirty(setter) {
    return (value) => {
      setter(value);
      setDirty(true);
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await api.submitRoutineItem(webhookUrl, routineId, {
        routineItemId: item.routineItemId,
        implemented,
        notImplementedReason: implemented ? "" : reason,
        actualDate: implemented ? todayISO() : "",
        actualQuantity: quantity,
        // The Sampling checklist's own "Sample Taken?" control was
        // removed entirely (not needed, confirmed directly by the
        // user) — "Done" on a Sampling-route item already means the
        // sample was taken, so this just mirrors that instead of
        // asking the technician to tick a second, redundant box.
        sampleTaken: implemented,
      });
      setDirty(false);
      onSaved(saved);
      pushToast("Item saved.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr style={{ background: rowTint }}>
      <td style={s.td}>
        <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{item.lpId}</div>
        <div style={{ fontSize: 11.5, color: T.textSecondary }}>{reg?.lubricationPoint || reg?.description || "—"}</div>
        <ReasonBadge T={T} reason={reasonInfo} />
      </td>
      <td style={s.td}>{item.itemType}</td>
      <td style={s.td}>
        {requiredOilType ? (
          <>
            <div style={{ fontWeight: 600 }}>{requiredOilType}</div>
            {requiredOilBrand && <div style={{ fontSize: 11, color: T.textSecondary }}>{requiredOilBrand}</div>}
          </>
        ) : (
          <span style={{ color: T.textMuted }}>—</span>
        )}
      </td>
      <td style={s.td}>{requiredQty ? `${requiredQty} L` : <span style={{ color: T.textMuted }}>—</span>}</td>
      <td style={s.td}>
        <select
          style={s.select}
          value={implemented ? "yes" : "no"}
          disabled={locked}
          onChange={(e) => markDirty(setImplemented)(e.target.value === "yes")}
        >
          <option value="no">Not done</option>
          <option value="yes">Done</option>
        </select>
      </td>
      <td style={s.td}>
        {implemented ? (
          <input
            style={{ ...s.input, width: 90 }}
            type="text"
            placeholder="Qty"
            disabled={locked}
            value={quantity}
            onChange={(e) => markDirty(setQuantity)(e.target.value)}
          />
        ) : (
          <input
            style={s.input}
            type="text"
            placeholder="Reason not done"
            disabled={locked}
            value={reason}
            onChange={(e) => markDirty(setReason)(e.target.value)}
          />
        )}
      </td>
      <td style={s.td}>
        {!locked && (
          <button style={s.btn} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "…" : "Save"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function RoutineDetail({ webhookUrl, routineId, equipmentRegistry, samples, actions, oilChanges, pushToast, onDataChanged, onBack, canEdit, isAdmin }) {
  const { T, s } = useTheme();
  const [routine, setRoutine] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState("");
  const sessionEmail = useSessionEmail();
  const [approvedBy, setApprovedBy] = useState("");
  const [commentBy, setCommentBy] = useState("");
  const [working, setWorking] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [editing, setEditing] = useState(false);
  // Phase 1: Return for correction / Reschedule forms.
  const [returnReason, setReturnReason] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const isRouteEngineer = useIsRouteEngineerFor(routine?.contractor || "");

  const itemsDone = items.filter((i) => i.implemented === "Yes").length;

  // Prefills "Reviewed By" from the logged-in user once a session is
  // available — still editable, since the reviewer isn't always the person
  // logged in (e.g. relaying someone else's verbal sign-off).
  useEffect(() => {
    if (sessionEmail && !approvedBy) {
      setApprovedBy(sessionEmail);
      setCommentBy(sessionEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacts to sessionEmail becoming available, not to the user's own edits to approvedBy
  }, [sessionEmail]);

  const registryByLp = {};
  (equipmentRegistry || []).forEach((r) => (registryByLp[r.code] = r));

  // "Why is this here" badge per item — recomputed from live data (not
  // stored at creation time), same helper New Routine uses to build the
  // suggested list.
  const reasonByLp = useMemo(() => {
    const map = {};
    for (const item of items) {
      map[item.lpId] = routineSuggestionReason(item.lpId, routine?.routeType, samples, actions, oilChanges, registryByLp[item.lpId]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registryByLp is rebuilt fresh every render from the same equipmentRegistry prop
  }, [items, routine, samples, actions, oilChanges, equipmentRegistry]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sequential, not Promise.all: Google Apps Script Web Apps don't
      // reliably serve concurrent GET requests to the same deployment (see
      // App.jsx's startup-fetch fix, confirmed live via the Network tab —
      // simultaneous exec?action=... requests came back 404 on their
      // redirect-to-content step). One at a time avoids the same failure
      // mode here.
      // getRoutine (single-row lookup), not getRoutines (full sheet +
      // OA_ROUTINE_ITEMS join for every routine) — "opening the routine
      // from table taking too much time" was this call reading and
      // joining the WHOLE Routines module just to show one row. See
      // api.js's own getRoutine comment.
      const found = await api.getRoutine(webhookUrl, routineId);
      const routineItems = await api.getRoutineItems(webhookUrl, routineId);
      setRoutine(found || null);
      setItems(routineItems);
      if (found) setComment(found.accComment || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, routineId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function updateItemLocal(saved) {
    setItems((prev) => prev.map((i) => (i.routineItemId === saved.routineItemId ? saved : i)));
    // Mirrors submitRoutineItem's own Assigned -> InProgress transition
    // locally, so the header badge doesn't lag a full page refresh behind
    // the backend after the very first item is saved.
    setRoutine((prev) => (prev && prev.status === ROUTE_STATUS.ASSIGNED ? { ...prev, status: ROUTE_STATUS.IN_PROGRESS } : prev));
  }

  async function handleAssign() {
    if (!assignee.trim()) {
      pushToast("Enter a technician or team name.", "error");
      return;
    }
    setWorking(true);
    try {
      const saved = await api.assignRoutineTechnician(webhookUrl, routineId, assignee.trim());
      setRoutine(saved);
      pushToast("Technician assigned.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmitRoutine() {
    setWorking(true);
    try {
      const saved = await api.submitRoutine(webhookUrl, routineId);
      setRoutine(saved);
      pushToast("Route submitted — waiting for the contractor engineer's approval.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  // Approval is the real "this happened" confirmation for a routine — not
  // a technician checking a box, which can still be corrected before ACC
  // signs off. So this is where a completed route's real-world effect
  // finally lands in the actual system-of-record sheets, per routeType:
  // Oil Change routes log a real Oil Change LOG event per completed point
  // (the same write the Equipment page's own "Log Oil Change" button
  // uses); Sampling routes mark that point's Oil Sample Tracker cell
  // "Pending" for the month the sample was taken — overlaySamplesOnTracker
  // (parsers.js) already overwrites "Pending" with the real lab result the
  // moment someone adds that sample via Add Sample, so nothing else has to
  // change it back. Best-effort, like every other cross-sheet side effect
  // in this app (App.jsx's applyOilChangeSideEffect/
  // applySampleTrackerSideEffect): the approval itself already succeeded,
  // so a failure here is its own toast, not a reason to undo it.
  async function applyApprovalSideEffects(approvedRoutine) {
    const doneItems = items.filter((i) => i.implemented === "Yes");
    if (doneItems.length === 0) return;
    const routeType = approvedRoutine.routeType;
    if (routeType !== "Oil Change" && routeType !== "Sampling" && routeType !== "Emergency Top Up") return;

    const results = await Promise.allSettled(
      doneItems.map((item) => {
        const eventDate = item.actualDate || todayISO();
        if (routeType === "Oil Change") {
          return api.logOilChangeEvent(webhookUrl, {
            lpId: item.lpId,
            eventDate,
            doneBy: approvedRoutine.assignedTo,
            contractor: approvedRoutine.contractor,
          });
        }
        if (routeType === "Emergency Top Up") {
          // Patch 18/17: logs to Oil Top Up LOG, not Oil Change LOG — and
          // deducts from Oil Inventory the same way a regular change does
          // (see TopUps.js's own comment). Always exactly one item, per
          // createRoutine's own single-equipment validation.
          return api.logOilTopUp(webhookUrl, {
            lpId: item.lpId,
            eventDate,
            quantityUsed: item.actualQuantity,
            reason: approvedRoutine.reason,
            requestedBy: approvedRoutine.createdBy,
            doneBy: approvedRoutine.assignedTo,
            routineId: approvedRoutine.routineId,
            contractor: approvedRoutine.contractor,
          });
        }
        return api.updateSampleTracker(webhookUrl, { equipmentCode: item.lpId, sampleDate: eventDate, status: "Pending" });
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      const target = routeType === "Oil Change" ? "Oil Change Log" : routeType === "Emergency Top Up" ? "Oil Top Up Log" : "Sample Tracker";
      pushToast(
        `Routine approved, but ${failed.length} of ${doneItems.length} point${doneItems.length !== 1 ? "s" : ""} didn't record to the ${target}: ${failed[0].reason?.message || "unknown error"}`,
        "error"
      );
    }
    if (onDataChanged) {
      try {
        await onDataChanged();
      } catch {
        // best-effort refresh — approval + side effects already happened either way
      }
    }
  }

  async function handleApprove() {
    setWorking(true);
    try {
      const saved = await api.approveRoutine(webhookUrl, routineId, approvedBy.trim());
      setRoutine(saved);
      pushToast("Route confirmed.", "success");
      await applyApprovalSideEffects(saved);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleReturn() {
    const reason = returnReason.trim();
    if (!reason) {
      pushToast("Write why the work is being returned.", "error");
      return;
    }
    setWorking(true);
    try {
      const saved = await api.returnRoutine(webhookUrl, routineId, reason);
      setRoutine(saved);
      setReturnReason("");
      pushToast("Returned to the technician for correction.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleReschedule() {
    if (!newDueDate || !rescheduleReason.trim()) {
      pushToast("Choose the new date and write the reason.", "error");
      return;
    }
    setWorking(true);
    try {
      const saved = await api.rescheduleRoutine(webhookUrl, routineId, newDueDate, rescheduleReason.trim());
      setRoutine(saved);
      setRescheduling(false);
      setNewDueDate("");
      setRescheduleReason("");
      pushToast("Route rescheduled.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    setWorking(true);
    try {
      const saved = await api.addRoutineComment(webhookUrl, routineId, comment.trim(), commentBy.trim());
      setRoutine(saved);
      pushToast("Comment saved.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleEditSave(payload) {
    try {
      const saved = await api.updateRoutine(webhookUrl, routineId, payload);
      setRoutine(saved);
      setEditing(false);
      pushToast("Route updated.", "success");
    } catch (err) {
      pushToast(err.message, "error");
    }
  }

  async function handleSetStatus(status) {
    setWorking(true);
    try {
      const saved = await api.setRoutineStatus(webhookUrl, routineId, status);
      setRoutine(saved);
      pushToast(
        status === "Paused" ? "Route paused." : status === "Cancelled" ? "Route cancelled." : "Route resumed.",
        "success"
      );
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete() {
    setWorking(true);
    try {
      await api.deleteRoutine(webhookUrl, routineId);
      pushToast("Routine and its checklist deleted.", "success");
      onBack();
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <p style={{ color: T.textSecondary }}>Loading routine…</p>;
  if (error) return <p style={{ color: T.danger }}>{error}</p>;
  if (!routine) return <p style={{ color: T.danger }}>Routine not found.</p>;

  const st = routine.status;
  const unassigned = st === ROUTE_STATUS.DRAFT;
  const paused = st === ROUTE_STATUS.PAUSED;
  const cancelled = st === ROUTE_STATUS.CANCELLED;
  const confirmed = st === ROUTE_STATUS.CONFIRMED;
  const waiting = st === ROUTE_STATUS.WAITING;
  // Checklist is open only while the route is with the technician.
  const locked = !(st === ROUTE_STATUS.ASSIGNED || st === ROUTE_STATUS.IN_PROGRESS);
  const canSubmit = st === ROUTE_STATUS.ASSIGNED || st === ROUTE_STATUS.IN_PROGRESS;
  const canReview = waiting && isRouteEngineer;
  const canPause = st === ROUTE_STATUS.ASSIGNED || st === ROUTE_STATUS.IN_PROGRESS;
  const canResume = paused;
  const canCancel = !confirmed && !cancelled;
  const canEditRoute = canEdit && !confirmed && !cancelled && !waiting;
  const canReschedule = isRouteEngineer && !confirmed && !cancelled && !waiting;
  const returned = isRouteReturned(routine);
  const overdue = isRouteOverdue(routine);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>
            {routine.routeName || `Routine — ${routine.assignedTo}`} <span style={s.badge(routine.status)}>{routine.status}</span>
            {returned && <span style={{ ...s.badge("Returned"), marginLeft: 6 }}>Returned</span>}
            {overdue && <span style={{ ...s.badge("Overdue"), marginLeft: 6 }}>Overdue</span>}
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: 0 }}>
            {routine.routeType ? `${routine.routeType} · ` : ""}
            {routine.area ? `${routine.area} · ` : ""}
            {routine.contractor || "—"}
            {routine.assignedTo ? ` · ${routine.assignedTo}` : ""} · created {routine.createdDate || "—"}
            {routine.dueDate ? ` · due ${routine.dueDate}` : ""}
            {routine.submittedDate ? ` · submitted ${routine.submittedDate}` : ""}
            {routine.approvedDate ? ` · confirmed ${routine.approvedDate}${routine.approvedBy ? ` by ${routine.approvedBy}` : ""}` : ""}
          </p>
          {routine.originalDueDate && (
            <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "4px 0 0" }}>
              <i className="ti ti-calendar-repeat" aria-hidden="true" style={{ marginRight: 4 }} />
              Rescheduled from {routine.originalDueDate} to {routine.dueDate}
              {routine.rescheduleReason ? ` — ${routine.rescheduleReason}` : ""}
              {routine.rescheduledBy ? ` (${routine.rescheduledBy}${routine.rescheduledDate ? `, ${routine.rescheduledDate}` : ""})` : ""}
            </p>
          )}
          {/* Reason was already required/captured on create for an
              Emergency Top Up, but had no display surface anywhere after
              — it was write-only until this pass. */}
          {routine.routeType === "Emergency Top Up" && routine.reason && (
            <p style={{ fontSize: 12.5, color: T.warning, margin: "4px 0 0" }}>
              <i className="ti ti-alert-triangle" aria-hidden="true" style={{ marginRight: 4 }} />
              Reason: {routine.reason}
            </p>
          )}
          <div style={{ marginTop: 8 }}>
            <ProgressBar done={itemsDone} total={items.length} width={140} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEditRoute && (
            <button style={s.btn} onClick={() => setEditing(true)}>
              <i className="ti ti-pencil" aria-hidden="true" /> Edit
            </button>
          )}
          {canReschedule && (
            <button style={s.btn} onClick={() => setRescheduling((v) => !v)} disabled={working}>
              <i className="ti ti-calendar-repeat" aria-hidden="true" /> Reschedule
            </button>
          )}
          {canEdit && canPause && (
            <button style={s.btn} onClick={() => handleSetStatus("Paused")} disabled={working}>
              <i className="ti ti-player-pause" aria-hidden="true" /> Pause
            </button>
          )}
          {canEdit && canResume && (
            <button style={s.btn} onClick={() => handleSetStatus("Assigned")} disabled={working}>
              <i className="ti ti-player-play" aria-hidden="true" /> Resume
            </button>
          )}
          {canEdit && canCancel && (
            <button
              style={{ ...s.btn, color: T.danger, borderColor: T.danger }}
              onClick={() => window.confirm("Cancel this route? This can't be undone.") && handleSetStatus("Cancelled")}
              disabled={working}
            >
              <i className="ti ti-ban" aria-hidden="true" /> Cancel
            </button>
          )}
          {isAdmin && (
            <button
              style={{ ...s.btn, color: "#fff", background: T.danger, borderColor: T.danger }}
              onClick={() => window.confirm("Permanently delete this routine and all its checklist items? This cannot be undone.") && handleDelete()}
              disabled={working}
            >
              <i className="ti ti-trash" aria-hidden="true" /> Delete
            </button>
          )}
          <button style={s.btn} onClick={onBack}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Routines
          </button>
        </div>
      </div>

      {editing && (
        <EditRoutineModal
          routine={routine}
          items={items}
          equipmentRegistry={equipmentRegistry}
          onClose={() => setEditing(false)}
          onSave={handleEditSave}
        />
      )}

      {rescheduling && canReschedule && (
        <div style={{ ...s.card, marginBottom: 20, borderColor: T.accent }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Reschedule</p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 10 }}>
            Current due date: {routine.dueDate || "—"}. No approval is needed — the old date, new date and your reason are recorded.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={s.label}>New due date</label>
              <input style={s.input} type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} aria-label="New due date" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={s.label}>Reason</label>
              <input
                style={s.input}
                type="text"
                value={rescheduleReason}
                placeholder="Why the date is moving"
                aria-label="Reschedule reason"
                onChange={(e) => setRescheduleReason(e.target.value)}
              />
            </div>
            <button style={s.btnPrimary} onClick={handleReschedule} disabled={working || !newDueDate || !rescheduleReason.trim()}>
              {working ? "…" : "Save new date"}
            </button>
            <button style={s.btn} onClick={() => setRescheduling(false)} disabled={working}>
              Close
            </button>
          </div>
        </div>
      )}

      {returned && (
        <div style={{ ...s.card, marginBottom: 20, borderColor: T.danger }}>
          <p style={{ fontWeight: 700, marginBottom: 4, color: T.danger }}>
            <i className="ti ti-arrow-back-up" aria-hidden="true" style={{ marginRight: 6 }} />
            Returned for correction
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            "{routine.returnReason}" — {routine.returnedBy || "—"} ({routine.returnedDate || "—"})
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "6px 0 0" }}>Correct the checklist below if needed, then resubmit.</p>
          {canSubmit && (
            <button style={{ ...s.btnPrimary, marginTop: 10 }} onClick={handleSubmitRoutine} disabled={working}>
              {working ? "Submitting…" : "Resubmit for approval"}
            </button>
          )}
        </div>
      )}

      {unassigned && (
        <div style={{ ...s.card, marginBottom: 20, borderColor: T.danger }}>
          <p style={{ fontWeight: 700, marginBottom: 4, color: T.danger }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" style={{ marginRight: 6 }} />
            Draft — no technician assigned yet
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 10 }}>
            Assign a technician to send this route out. It moves to Assigned and the technician is notified.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, maxWidth: 320 }}>
              <label style={s.label}>Assign Technician</label>
              {/* Patch 16: widened to include Contractor Engineers too — see
                  NewRoutine.jsx's own comment on the same change. */}
              <TechnicianPicker contractor={routine.contractor} value={assignee} onChange={setAssignee} roleFilter={null} />
            </div>
            <button style={s.btnPrimary} onClick={handleAssign} disabled={working}>
              {working ? "…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {(paused || cancelled) && (
        <div style={{ ...s.card, marginBottom: 20, borderColor: paused ? T.warning : T.danger }}>
          <p style={{ fontWeight: 700, margin: 0, color: paused ? T.warning : T.danger }}>
            <i className={`ti ${paused ? "ti-player-pause" : "ti-ban"}`} aria-hidden="true" style={{ marginRight: 6 }} />
            {paused ? "This route is paused — resume it to keep working the checklist below." : "This route has been cancelled."}
          </p>
        </div>
      )}

      <div style={{ ...s.card, padding: 0, overflowX: "auto", overflowY: "hidden", marginBottom: 20 }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Point</th>
              <th style={s.th}>Item Type</th>
              <th style={s.th}>Required Oil</th>
              <th style={s.th}>Required Qty</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Qty / Reason</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.routineItemId}
                item={item}
                registryByLp={registryByLp}
                reasonInfo={reasonByLp[item.lpId]}
                locked={locked}
                webhookUrl={webhookUrl}
                routineId={routineId}
                pushToast={pushToast}
                onSaved={updateItemLocal}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canSubmit && (
        <div style={{ marginBottom: 20 }}>
          <button style={s.btnPrimary} onClick={handleSubmitRoutine} disabled={working}>
            {working ? "Submitting…" : returned ? "Resubmit for approval" : "Submit for approval"}
          </button>
        </div>
      )}

      <div style={s.card}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Approval</p>
        {routine.accComment && (
          <p style={{ fontSize: 13, color: T.textPrimary, marginBottom: 10 }}>
            "{routine.accComment}" — {routine.accCommentBy || "—"} ({routine.accCommentDate || "—"})
          </p>
        )}
        {canReview ? (
          <>
            <p style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 0 }}>
              Check the checklist above, then confirm it — or return it to the technician with the reason.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <button style={s.btnPrimary} onClick={handleApprove} disabled={working}>
                {working ? "…" : "Confirm route"}
              </button>
            </div>
            <label style={s.label}>Return for correction — reason</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <input
                style={{ ...s.input, flex: 1, minWidth: 220 }}
                type="text"
                value={returnReason}
                placeholder="What needs correcting"
                aria-label="Return reason"
                onChange={(e) => setReturnReason(e.target.value)}
              />
              <button
                style={{ ...s.btn, color: T.danger, borderColor: T.danger }}
                onClick={handleReturn}
                disabled={working || !returnReason.trim()}
              >
                <i className="ti ti-arrow-back-up" aria-hidden="true" /> Return
              </button>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: T.textSecondary, marginTop: 0 }}>
            {confirmed
              ? `Confirmed${routine.approvedBy ? ` by ${routine.approvedBy}` : ""}.`
              : waiting
                ? `Waiting for ${routine.contractor || "the contractor"}'s Contractor Engineer to confirm or return it.`
                : "Available once the route is submitted."}
          </p>
        )}
        {canEdit && !cancelled && (
          <>
            <label style={s.label}>Comment</label>
            <textarea
              style={{ ...s.input, marginBottom: 10, minHeight: 60, resize: "vertical" }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <label style={s.label}>Comment By</label>
            <input
              style={{ ...s.input, marginBottom: 10 }}
              type="text"
              value={approvedBy}
              onChange={(e) => {
                setApprovedBy(e.target.value);
                setCommentBy(e.target.value);
              }}
            />
            <button style={s.btn} onClick={handleComment} disabled={working || !comment.trim()}>
              Save Comment
            </button>
          </>
        )}
      </div>
    </div>
  );
}

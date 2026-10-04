import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail } from "../SessionContext";
import * as api from "../api";
import { routineSuggestionReason, todayISO } from "../parsers";
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

export default function RoutineDetail({ webhookUrl, routineId, equipmentRegistry, samples, actions, oilChanges, pushToast, onDataChanged, onBack, canEdit }) {
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
      const routines = await api.getRoutines(webhookUrl);
      const routineItems = await api.getRoutineItems(webhookUrl, routineId);
      const found = routines.find((r) => r.routineId === routineId);
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
    setRoutine((prev) => (prev && prev.status === "Assigned" ? { ...prev, status: "InProgress" } : prev));
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
      pushToast("Routine submitted for review.", "success");
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
      pushToast("Routine approved.", "success");
      await applyApprovalSideEffects(saved);
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

  if (loading) return <p style={{ color: T.textSecondary }}>Loading routine…</p>;
  if (error) return <p style={{ color: T.danger }}>{error}</p>;
  if (!routine) return <p style={{ color: T.danger }}>Routine not found.</p>;

  const unassigned = routine.status === "Unassigned";
  const paused = routine.status === "Paused";
  const cancelled = routine.status === "Cancelled";
  const locked = routine.status === "Approved" || cancelled || paused || unassigned;
  const canSubmit = routine.status === "Assigned" || routine.status === "InProgress";
  const canApprove = routine.status === "Submitted";
  const canPause = routine.status === "Assigned" || routine.status === "InProgress";
  const canResume = paused;
  const canCancel = routine.status !== "Approved" && !cancelled;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>
            {routine.routeName || `Routine — ${routine.assignedTo}`} <span style={s.badge(routine.status)}>{routine.status}</span>
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: 0 }}>
            {routine.routeType ? `${routine.routeType} · ` : ""}
            {routine.area ? `${routine.area} · ` : ""}
            {routine.contractor || "—"}
            {routine.assignedTo ? ` · ${routine.assignedTo}` : ""} · created {routine.createdDate || "—"}
            {routine.dueDate ? ` · due ${routine.dueDate}` : ""}
            {routine.submittedDate ? ` · submitted ${routine.submittedDate}` : ""}
            {routine.approvedDate ? ` · approved ${routine.approvedDate}` : ""}
          </p>
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
          {canEdit && !locked && (
            <button style={s.btn} onClick={() => setEditing(true)}>
              <i className="ti ti-pencil" aria-hidden="true" /> Edit
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
          <button style={s.btn} onClick={onBack}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Routines
          </button>
        </div>
      </div>

      {editing && (
        <EditRoutineModal
          routine={routine}
          equipmentRegistry={equipmentRegistry}
          onClose={() => setEditing(false)}
          onSave={handleEditSave}
        />
      )}

      {unassigned && (
        <div style={{ ...s.card, marginBottom: 20, borderColor: T.danger }}>
          <p style={{ fontWeight: 700, marginBottom: 4, color: T.danger }}>
            <i className="ti ti-alert-triangle" aria-hidden="true" style={{ marginRight: 6 }} />
            No technician assigned yet
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 10 }}>
            This route was generated automatically and is waiting for a contractor engineer to assign a technician before it can be
            worked.
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
            {working ? "Submitting…" : "Submit Routine for Review"}
          </button>
        </div>
      )}

      <div style={s.card}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>ACC Review</p>
        {routine.accComment && (
          <p style={{ fontSize: 13, color: T.textPrimary, marginBottom: 10 }}>
            "{routine.accComment}" — {routine.accCommentBy || "—"} ({routine.accCommentDate || "—"})
          </p>
        )}
        {canApprove ? (
          <>
            <label style={s.label}>Comment</label>
            <textarea
              style={{ ...s.input, marginBottom: 10, minHeight: 60, resize: "vertical" }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <label style={s.label}>Reviewed By</label>
            <input
              style={{ ...s.input, marginBottom: 14 }}
              type="text"
              value={approvedBy}
              onChange={(e) => {
                setApprovedBy(e.target.value);
                setCommentBy(e.target.value);
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={s.btn} onClick={handleComment} disabled={working || !comment.trim()}>
                Save Comment
              </button>
              <button style={s.btnPrimary} onClick={handleApprove} disabled={working}>
                {working ? "…" : "Approve Routine"}
              </button>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: T.textSecondary, margin: 0 }}>
            {routine.status === "Approved" ? "This routine has been approved." : "Available once the routine is submitted."}
          </p>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail } from "../SessionContext";
import * as api from "../api";

function ItemRow({ item, registryByLp, locked, webhookUrl, routineId, pushToast, onSaved }) {
  const { T, s } = useTheme();
  const reg = registryByLp[item.lpId];
  const [implemented, setImplemented] = useState(item.implemented === "Yes");
  const [reason, setReason] = useState(item.notImplementedReason || "");
  const [quantity, setQuantity] = useState(item.actualQuantity || "");
  const [sampleTaken, setSampleTaken] = useState(item.sampleTaken === "Yes");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

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
        actualDate: implemented ? new Date().toISOString().slice(0, 10) : "",
        actualQuantity: quantity,
        sampleTaken,
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
    <tr>
      <td style={s.td}>
        <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{item.lpId}</div>
        <div style={{ fontSize: 11.5, color: T.textSecondary }}>{reg?.lubricationPoint || reg?.description || "—"}</div>
      </td>
      <td style={s.td}>{item.itemType}</td>
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
        <input type="checkbox" disabled={locked} checked={sampleTaken} onChange={(e) => markDirty(setSampleTaken)(e.target.checked)} />
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

export default function RoutineDetail({ webhookUrl, routineId, equipmentRegistry, pushToast, onBack }) {
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

  async function handleApprove() {
    setWorking(true);
    try {
      const saved = await api.approveRoutine(webhookUrl, routineId, approvedBy.trim());
      setRoutine(saved);
      pushToast("Routine approved.", "success");
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

  if (loading) return <p style={{ color: T.textSecondary }}>Loading routine…</p>;
  if (error) return <p style={{ color: T.danger }}>{error}</p>;
  if (!routine) return <p style={{ color: T.danger }}>Routine not found.</p>;

  const locked = routine.status === "Approved";
  const canSubmit = routine.status === "Assigned" || routine.status === "InProgress";
  const canApprove = routine.status === "Submitted";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ ...s.sectionTitle, margin: "0 0 4px" }}>
            Routine — {routine.assignedTo} <span style={s.badge(routine.status)}>{routine.status}</span>
          </p>
          <p style={{ fontSize: 12.5, color: T.textSecondary, margin: 0 }}>
            {routine.contractor || "—"} · created {routine.createdDate || "—"}
            {routine.submittedDate ? ` · submitted ${routine.submittedDate}` : ""}
            {routine.approvedDate ? ` · approved ${routine.approvedDate}` : ""}
          </p>
        </div>
        <button style={s.btn} onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to Routines
        </button>
      </div>

      <div style={{ ...s.card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Point</th>
              <th style={s.th}>Item Type</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Qty / Reason</th>
              <th style={s.th}>Sample?</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.routineItemId}
                item={item}
                registryByLp={registryByLp}
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

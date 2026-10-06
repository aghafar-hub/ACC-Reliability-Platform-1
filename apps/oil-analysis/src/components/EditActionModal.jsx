import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSession, useSessionContractor, useIsRouteEngineerFor, useIsAccEngineer } from "../SessionContext";
import { nextAcNo, formatDate, ACTION_STATUS, isActionOverdue, actionAgeDays } from "../parsers";
import { useActionWorkflow } from "../ActionWorkflowContext";
import { toISODate, latestOilChangeFor, autofillFromEquipment } from "../actionAutofill";
import EquipmentSearch from "./EquipmentSearch";
import MultiSelectTags from "./MultiSelectTags";
import TechnicianPicker from "./TechnicianPicker";

// Phase 2: the status picker only moves between these; Closure Requested
// and Closed are reached through the Closure section below.
const STATUS_OPTIONS = [ACTION_STATUS.OPEN, ACTION_STATUS.WAITING];
const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];

// A newly-agreed phrase from this fixed list auto-creates a route for the
// equipment (see handleSave's _autoRouteTriggers) — "newly" meaning it
// wasn't already on the action's own previously-saved Agreed Action, so
// resaving an action that already agreed to change the oil doesn't create
// a fresh route every time. Only fires when a Contractor Engineer is the
// one saving (see isContractorEngineer below) — the route is assigned
// straight to them, matching "the contractor engineer that reviewed the
// action." Oil Change needs no Reason (NewRoutine.jsx's own server-side
// rule only requires one for Emergency Top Up); Top Up is routed as an
// Emergency Top Up specifically so it carries the urgency that phrase
// implies, with its required Reason auto-filled from the Agreed Action
// text itself.
const ROUTE_TRIGGER_PHRASES = [
  { phrase: "Change Oil", routeType: "Oil Change" },
  { phrase: "Top Up the Oil", routeType: "Emergency Top Up" },
];

// Bug-hunt pass: mirrors MultiSelectTags.jsx's own parseChips fix exactly
// (same file, not imported, to avoid pulling a display component into this
// comparison-only helper) — a legacy free-text Agreed Action containing a
// literal comma must parse the SAME way here as it's shown in the form
// itself, or this trigger-detection comparison could disagree with what
// the user actually sees as chips.
function chipsOf(value, options) {
  const raw = String(value || "");
  const segments = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1 || !options || options.length === 0) return segments;
  const known = new Set(options.map((o) => o.toLowerCase()));
  const allKnown = segments.every((seg) => known.has(seg.toLowerCase()));
  return allKnown ? segments : [raw.trim()].filter(Boolean);
}

export default function EditActionModal({
  action,
  isNew,
  allActions,
  samples,
  oilChanges,
  equipmentRegistry,
  actionRegistry,
  onClose,
  onSave,
  onDelete,
}) {
  const { T, s } = useTheme();
  // Patch 16: a logged-in RHI/ASEC account's equipmentRegistry only ever
  // contains that contractor's own equipment (scoped server-side, see
  // Rbac.js's getContractorScope_) — so the free manual Contractor
  // dropdown below was never a real choice for them, just a redundant
  // field that happened to already get overwritten by selectEquipment's
  // autofill. Locking it here matches that reality; an ACC/admin account
  // (scopedContractor === "") still gets the manual dropdown, since an
  // action genuinely can belong to either contractor for them.
  const scopedContractor = useSessionContractor();
  const session = useSession();
  const isContractorEngineer = (session?.claims?.roles || []).includes("ROLE-CENG");
  const deps = { equipmentRegistry, oilChanges, allActions, samples, excludeId: action._id };
  // New actions opened with an equipment code already known (e.g. from
  // inside an Oil Analysis Report) get their dependent fields autofilled
  // immediately; editing an existing action leaves its saved values alone
  // until the user actively re-selects equipment. Action Tracker's own "Add
  // Action" always starts with an empty equipment code, so neither applies.
  //
  // Revision Date, Last Change Date, and Completed Date all render through
  // <input type="date">, which silently shows blank for anything not in
  // ISO format — an existing action's saved date comes in as "26 Mar 2026"
  // (rowToAction's own display format), so it has to be converted here or
  // every one of these fields looks empty the moment you reopen a real,
  // already-saved action. Sample Date is a <select> of literal date-string
  // options instead, so it's deliberately left alone.
  const [form, setForm] = useState(() => {
    const base = { ...action };
    base.revisionDate = toISODate(base.revisionDate);
    // A brand-new action has no revision of its own yet to default to —
    // today's date, still freely editable afterward like every other date
    // field here.
    if (isNew && !base.revisionDate) base.revisionDate = toISODate(new Date());
    base.lastChange = toISODate(base.lastChange);
    base.completedDate = toISODate(base.completedDate);
    if (scopedContractor && !base.contractor) base.contractor = scopedContractor;
    if (isNew && (base.equipmentCode || base.unitId)) {
      const filled = autofillFromEquipment(base.equipmentCode || base.unitId, deps);
      return { ...base, ...filled };
    }
    return base;
  });
  // Bug-hunt pass: this used to return null unconditionally for an
  // EXISTING action (isNew false), with nothing ever re-syncing it
  // afterward unless the user touched "Update Lubrication Point" — which
  // only even appears once a Last Change date is present and isn't marked
  // required. For equipment with more than one lubrication point,
  // handleSave's own oilChangesForEquip.find(o => o._id === lubPointId)
  // then matched nothing, so target stayed undefined and the Oil Change
  // Log entry was silently never created, with no error shown. Defaulting
  // to the latest oil-change point here (same rule isNew/selectEquipment
  // already use) means the selector pre-fills sensibly and a save still
  // targets a real, sane row even if the user never opens the dropdown.
  const [lubPointId, setLubPointId] = useState(() => {
    const code = action.equipmentCode || action.unitId;
    if (!code) return null;
    const latest = latestOilChangeFor(oilChanges, code);
    return latest ? latest._id : null;
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function selectEquipment(code) {
    setForm((f) => ({ ...f, ...autofillFromEquipment(code, deps) }));
    const latest = latestOilChangeFor(oilChanges, code);
    setLubPointId(latest ? latest._id : null);
  }

  const equipCode = form.equipmentCode || form.unitId || "";
  const oilChangesForEquip = (oilChanges || []).filter((o) => o.equipmentCode === equipCode);
  const samplesForEquip = (samples || [])
    .filter((sm) => sm.unitId === equipCode)
    .sort((a, b) => new Date(b.sampledDate) - new Date(a.sampledDate));

  function selectSampleDate(dateStr) {
    const sample = samplesForEquip.find((sm) => sm.sampledDate === dateStr);
    setForm((f) => ({
      ...f,
      sampleDate: dateStr,
      sampleResult: sample ? (sample.reportStatus || "").toUpperCase() : f.sampleResult,
      sampleAnalysis: sample ? (sample.recommendations || []).join("; ") : f.sampleAnalysis,
    }));
  }

  const isClosed = (form.status || "Open") === ACTION_STATUS.CLOSED;
  const isDraft = form.status === ACTION_STATUS.DRAFT;
  const statusLocked = form.status === ACTION_STATUS.CLOSURE_REQUESTED || isClosed;

  function handleSave() {
    const acNo = isNew ? nextAcNo(allActions || []) : form.acNo;
    const payload = {
      ...form,
      acNo,
      equipmentCode: equipCode,
      closingComment: isClosed ? form.closingComment || "" : "",
      _matchCols: isNew ? undefined : form._matchCols || [0, 1],
      _matchValues: isNew ? undefined : form._matchValues || [form.acNo, equipCode],
    };

    // Mirrors the original app: recording a Last Change date on an action
    // also updates that equipment's Oil Change Log row — but only when the
    // date actually moved FORWARD past what's already logged. The old
    // condition here fired on any non-blank Last Change regardless of
    // whether it had changed at all, which meant simply resaving an action
    // that already had a Last Change date appended a fresh, identical Oil
    // Change Log row every single time (the log is append-only, never
    // edited in place — see api.js's logOilChangeEvent). If Last Change is
    // left blank but a linked oil-change record exists, inherit its date
    // instead of writing anything new.
    if (oilChangesForEquip.length > 0) {
      const target = oilChangesForEquip.length === 1 ? oilChangesForEquip[0] : oilChangesForEquip.find((o) => o._id === lubPointId);
      if (form.lastChange && target) {
        const existingDate = target.changeDate ? new Date(target.changeDate) : null;
        const newDate = new Date(form.lastChange);
        if (!isNaN(newDate) && (!existingDate || newDate > existingDate)) {
          payload._oilChangeTarget = target;
        }
      } else if (!form.lastChange && target) {
        payload.lastChange = formatDate(target.changeDate);
      }
    }

    // A newly-agreed "Change Oil"/"Top Up the Oil" (present now, wasn't on
    // the action's own last-saved Agreed Action) auto-creates a route for
    // this equipment — see ROUTE_TRIGGER_PHRASES' own comment above for the
    // full rationale. App.jsx's applyAutoRouteSideEffect is what actually
    // calls api.createRoutine() with this, the same "compute a signal here,
    // execute it after save confirms up in App.jsx" pattern _oilChangeTarget
    // above already uses.
    if (isContractorEngineer) {
      const originalChips = chipsOf(action.agreedAction, actionRegistry);
      const newChips = chipsOf(form.agreedAction, actionRegistry);
      const newlyAdded = ROUTE_TRIGGER_PHRASES.filter(
        ({ phrase }) =>
          newChips.some((c) => c.toLowerCase() === phrase.toLowerCase()) &&
          !originalChips.some((c) => c.toLowerCase() === phrase.toLowerCase())
      );
      if (newlyAdded.length > 0) {
        payload._autoRouteTriggers = newlyAdded.map(({ routeType }) => ({
          routeType,
          equipmentCode: equipCode,
          contractor: form.contractor,
          assignedTo: session.claims.email,
          createdBy: session.claims.email,
          routeName: `${routeType} - ${equipCode}`,
          reason: routeType === "Emergency Top Up" ? `Auto-created from Action ${acNo}: ${form.agreedAction}` : "",
        }));
      }
    }

    onSave(payload);
  }

  const field = (label, key, type = "text") => (
    <div>
      <label style={{ ...s.label, fontSize: 11 }}>{label}</label>
      <input style={{ ...s.input, fontSize: 13 }} type={type} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  const textarea = (label, key) => (
    <div>
      <label style={{ ...s.label, fontSize: 11 }}>{label}</label>
      <textarea
        style={{ ...s.input, fontSize: 13, minHeight: 56, resize: "vertical" }}
        value={form[key] || ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  // Prev. Month Agreed Action is a lookup of history, not an editable
  // field — read-only, same locked-display styling the Contractor field
  // above already uses for a scoped contractor account.
  const lockedTextarea = (label, key) => (
    <div>
      <label style={{ ...s.label, fontSize: 11 }}>{label}</label>
      <div
        style={{
          ...s.input,
          fontSize: 13,
          minHeight: 56,
          background: T.cardSubBg,
          color: T.textSecondary,
          whiteSpace: "pre-wrap",
          overflowY: "auto",
        }}
      >
        {form[key] || "—"}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 760,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.textPrimary }}>{isNew ? "New Action" : "Edit Action"}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textSecondary }}>
              Ac. No. <strong>{isNew ? nextAcNo(allActions || []) : form.acNo}</strong>
              {isNew && <span style={{ marginLeft: 6, color: T.textMuted }}>(auto-generated)</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!isNew && onDelete && (
              <button
                style={{ ...s.btn, color: T.danger, borderColor: T.danger }}
                onClick={() => window.confirm("Delete this action from the sheet?") && onDelete()}
              >
                <i className="ti ti-trash" aria-hidden="true" /> Delete
              </button>
            )}
            <button style={{ ...s.btn, padding: "6px 10px" }} onClick={onClose}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Identification</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Equipment Code</label>
            <EquipmentSearch
              options={equipmentRegistry}
              value={equipCode}
              onChange={selectEquipment}
              placeholder="Search equipment…"
              width="100%"
            />
          </div>
          {field("Description", "description")}
          {field("Oil Type", "oilType")}
          {field("Revision Date", "revisionDate", "date")}
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Sample Date</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.sampleDate || ""}
              onChange={(e) => selectSampleDate(e.target.value)}
            >
              <option value="">Select sample date…</option>
              {samplesForEquip.map((sm) => (
                <option key={sm._id} value={sm.sampledDate}>
                  {sm.sampledDate}
                </option>
              ))}
              {form.sampleDate && !samplesForEquip.some((sm) => sm.sampledDate === form.sampleDate) && (
                <option value={form.sampleDate}>{form.sampleDate}</option>
              )}
            </select>
          </div>
          {field("Sample Result", "sampleResult")}
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Oil Change</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
          <div>
            {field("Last Change Date", "lastChange", "date")}
            <p style={{ fontSize: 10, color: T.textMuted, margin: "3px 0 0", lineHeight: 1.5 }}>
              {form.lastChange
                ? "Will also update this equipment's Oil Change Log entry."
                : oilChangesForEquip.length > 0
                  ? "Leave blank to inherit from Oil Change Log."
                  : "No oil change data for this equipment."}
            </p>
          </div>
          {form.lastChange && oilChangesForEquip.length > 1 && (
            <div>
              <label style={{ ...s.label, fontSize: 11 }}>Update Lubrication Point</label>
              <select
                style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
                value={lubPointId || ""}
                onChange={(e) => setLubPointId(e.target.value)}
              >
                <option value="">— Select point —</option>
                {oilChangesForEquip.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.lubricationPoint} — {o.oilType}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.lastChange && oilChangesForEquip.length === 1 && (
            <div>
              <label style={{ ...s.label, fontSize: 11 }}>Lubrication Point</label>
              <div
                style={{
                  ...s.input,
                  background: T.cardSubBg,
                  color: T.textSecondary,
                  display: "flex",
                  alignItems: "center",
                  minHeight: 34,
                }}
              >
                {oilChangesForEquip[0].lubricationPoint} — {oilChangesForEquip[0].oilType}
              </div>
            </div>
          )}
        </div>

        {isDraft && (
          <div style={{ border: `1px solid ${T.danger}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 12.5 }}>
            <strong style={{ color: T.danger }}>Draft{action.createdByRule ? ` — created automatically (${action.createdByRule})` : ""}.</strong>{" "}
            Add the contractor and ACC recommendations and the Agreed Action, then Save — it becomes Open.
          </div>
        )}
        {isActionOverdue(form) && (
          <div style={{ border: `1px solid ${T.danger}`, borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12.5, color: T.danger }}>
            Overdue — open for {actionAgeDays(form)} days (more than 14).
          </div>
        )}

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Status &amp; Action</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Status</label>
            {isDraft || statusLocked ? (
              <div style={{ ...s.input, fontSize: 13, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>
                {form.status}
              </div>
            ) : (
              <select
                style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
                value={form.status || ACTION_STATUS.OPEN}
                onChange={(e) => set("status", e.target.value)}
                aria-label="Status"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
            {isDraft && <p style={{ fontSize: 10, color: T.textMuted, margin: "3px 0 0" }}>Becomes Open when the Agreed Action is saved</p>}
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Completed Date</label>
            <div style={{ ...s.input, fontSize: 13, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>
              {isClosed ? form.completedDate || "—" : "—"}
            </div>
            {!isClosed && <p style={{ fontSize: 10, color: T.textMuted, margin: "3px 0 0" }}>Set when the action is closed</p>}
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Contractor</label>
            {scopedContractor ? (
              <div style={{ ...s.input, fontSize: 13, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>
                {scopedContractor}
              </div>
            ) : (
              <select
                style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
                value={form.contractor || ""}
                onChange={(e) => set("contractor", e.target.value)}
              >
                <option value="">—</option>
                {CONTRACTOR_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Assigned To</label>
            <TechnicianPicker
              contractor={form.contractor}
              value={form.assignedTo || ""}
              onChange={(v) => set("assignedTo", v)}
              roleFilter={null}
              placeholder="Who owns this action?"
            />
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Analysis &amp; Actions</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
          {textarea("Sample Analysis", "sampleAnalysis")}
          <MultiSelectTags
            label="Contractor Action"
            value={form.contractorAction}
            onChange={(v) => set("contractorAction", v)}
            options={actionRegistry}
          />
          {lockedTextarea("Prev. Month Agreed Action", "prevMonthAgreedAction")}
          <MultiSelectTags label="ACC Action" value={form.accAction} onChange={(v) => set("accAction", v)} options={actionRegistry} />
          <MultiSelectTags label="Agreed Action" value={form.agreedAction} onChange={(v) => set("agreedAction", v)} options={actionRegistry} />
          {isClosed && <div style={{ gridColumn: "1 / -1" }}>{lockedTextarea("Closing Comment", "closingComment")}</div>}
        </div>

        {!isNew && <ClosureSection action={action} onDone={onClose} />}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={s.btn} onClick={onClose}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// Phase 2 — closure: the Contractor Engineer requests it with a comment, an
// ACC Engineer approves (or rejects back to Open with a reason), then the
// Contractor Engineer closes it.
function ClosureSection({ action, onDone }) {
  const { T, s } = useTheme();
  const run = useActionWorkflow();
  const contractor = action.contractor || "";
  const isContractorEngineer = useIsRouteEngineerFor(contractor);
  const isAcc = useIsAccEngineer();
  // Only the closing comment (after ACC approval) starts from the request
  // comment; the request and the ACC decision note always start empty.
  const [text, setText] = useState(
    action.status === ACTION_STATUS.CLOSURE_REQUESTED && action.closureDecision === "Approved" ? action.closureComment || "" : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!run) return null;

  const st = action.status;
  const approved = st === ACTION_STATUS.CLOSURE_REQUESTED && action.closureDecision === "Approved";
  const waitingDecision = st === ACTION_STATUS.CLOSURE_REQUESTED && !approved;
  const rejectedBefore = action.closureDecision === "Rejected" && (st === ACTION_STATUS.OPEN || st === ACTION_STATUS.WAITING);

  async function go(kind, needsText, message) {
    if (needsText && !text.trim()) {
      setError(message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await run(kind, action, text.trim());
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const box = { border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 18, fontSize: 13 };
  const muted = { fontSize: 12, color: T.textSecondary, margin: "4px 0 0" };
  const input = (placeholder, label) => (
    <textarea
      style={{ ...s.input, fontSize: 13, minHeight: 50, resize: "vertical", margin: "8px 0" }}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
    />
  );

  if (st === ACTION_STATUS.DRAFT) return null;
  if (st === ACTION_STATUS.CLOSED) {
    return (
      <div style={box}>
        <strong>Closed</strong>
        {action.closureDecisionBy && <p style={muted}>Closure approved by {action.closureDecisionBy} ({action.closureDecisionDate}).</p>}
      </div>
    );
  }

  return (
    <div style={{ ...box, borderColor: approved ? T.success : waitingDecision ? T.warning : T.border }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: 0 }}>Closure</p>

      {rejectedBefore && (
        <p style={{ ...muted, color: T.danger }}>
          Last closure request was rejected by {action.closureDecisionBy}: {action.closureDecisionNote}
        </p>
      )}

      {(st === ACTION_STATUS.OPEN || st === ACTION_STATUS.WAITING) &&
        (isContractorEngineer ? (
          <>
            <p style={muted}>When the work is done, request closure. An ACC Engineer approves it, then you close it.</p>
            {input("What was done", "Closure comment")}
            <button style={s.btnPrimary} disabled={busy} onClick={() => go("request", true, "Write what was done.")}>
              {busy ? "…" : "Request closure"}
            </button>
          </>
        ) : (
          <p style={muted}>{contractor || "The contractor"}'s Contractor Engineer requests closure when the work is done.</p>
        ))}

      {st === ACTION_STATUS.CLOSURE_REQUESTED && (
        <p style={muted}>
          Requested by {action.closureRequestedBy || "—"} ({action.closureRequestedDate || "—"}): "{action.closureComment}"
        </p>
      )}

      {waitingDecision &&
        (isAcc ? (
          <>
            {input("Note (required to reject)", "Decision note")}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={s.btnPrimary} disabled={busy} onClick={() => go("approve", false)}>
                {busy ? "…" : "Approve closure"}
              </button>
              <button
                style={{ ...s.btn, color: T.danger, borderColor: T.danger }}
                disabled={busy}
                onClick={() => go("reject", true, "Write why the closure is rejected.")}
              >
                Reject
              </button>
            </div>
          </>
        ) : (
          <p style={muted}>Waiting for an ACC Engineer to approve or reject.</p>
        ))}

      {approved && (
        <>
          <p style={{ ...muted, color: T.success }}>
            Approved by {action.closureDecisionBy} ({action.closureDecisionDate}){action.closureDecisionNote ? `: ${action.closureDecisionNote}` : ""}.
          </p>
          {isContractorEngineer ? (
            <>
              {input("Closing comment", "Closing comment")}
              <button style={s.btnPrimary} disabled={busy} onClick={() => go("close", false)}>
                {busy ? "…" : "Close action"}
              </button>
            </>
          ) : (
            <p style={muted}>Waiting for {contractor || "the contractor"}'s Contractor Engineer to close it.</p>
          )}
        </>
      )}

      {error && <p style={{ ...muted, color: T.danger }}>{error}</p>}
    </div>
  );
}

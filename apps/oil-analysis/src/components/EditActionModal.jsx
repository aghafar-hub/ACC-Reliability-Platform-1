import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionContractor, useIsRouteEngineerFor, useIsAccEngineer } from "../SessionContext";
import { nextAcNo, formatDate, sameCalendarDay, normActionStatus, ACTION_STATUS, ACTION_DRAFT_DUE_DAYS, isActionOverdue, actionDaysOverdue, actionDueEnd } from "../parsers";
import { useActionWorkflow } from "../ActionWorkflowContext";
import { toISODate, latestOilChangeFor, autofillFromEquipment, lastAgreedActionFor } from "../actionAutofill";
import EquipmentSearch from "./EquipmentSearch";
import MultiSelectTags from "./MultiSelectTags";
import TechnicianPicker from "./TechnicianPicker";
import ModalShell, { FormSection, StepTrail } from "./ModalShell";

// Phase 2: the status picker only moves between these; Closure Requested
// and Closed are reached through the Closure section below.
const STATUS_OPTIONS = [ACTION_STATUS.OPEN, ACTION_STATUS.WAITING];
const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];

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
    // Phase 2: a new action starts as a Draft due in 7 days (editable).
    if (isNew) {
      base.status = ACTION_STATUS.DRAFT;
      if (!base.dueDate) base.dueDate = toISODate(new Date(Date.now() + ACTION_DRAFT_DUE_DAYS * 86400000));
      if (base.duration === undefined || base.duration === "") base.duration = 0;
    }
    base.completedDate = toISODate(base.completedDate);
    if (scopedContractor && !base.contractor) base.contractor = scopedContractor;
    const code0 = base.equipmentCode || base.unitId;
    if (isNew && code0) {
      const filled = autofillFromEquipment(code0, { ...deps, revisionDate: base.revisionDate });
      return { ...base, ...filled };
    }
    // Last Change always comes from the Oil Change Log, and Last Previous
    // Action from the point's earlier actions — both read-only.
    if (code0) {
      const latest = latestOilChangeFor(oilChanges, code0);
      base.lastChange = latest ? toISODate(latest.changeDate) : toISODate(base.lastChange);
      base.prevMonthAgreedAction = lastAgreedActionFor(allActions, code0, action._id, base.revisionDate) || base.prevMonthAgreedAction || "";
    } else {
      base.lastChange = toISODate(base.lastChange);
    }
    return base;
  });
  // (kept for the oil-change point display below)
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
    setForm((f) => ({ ...f, ...autofillFromEquipment(code, { ...deps, revisionDate: f.revisionDate }) }));
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
  // A closed action is final: shown read-only, nothing can be saved or
  // deleted (the server refuses it too).
  const lockedClosed = !isNew && normActionStatus(action.status) === ACTION_STATUS.CLOSED;
  // One action per lab sample: another action already on this point's
  // sample date blocks saving — the job goes into that action instead.
  const sampleTakenBy = form.sampleDate
    ? (allActions || []).find(
        (a) =>
          (a.equipmentCode || a.unitId) === equipCode &&
          a._id !== action._id &&
          !(a.acNo && a.acNo === action.acNo && !isNew) &&
          a.sampleDate &&
          sameCalendarDay(a.sampleDate, form.sampleDate)
      ) || null
    : null;
  const isDraft = isNew || form.status === ACTION_STATUS.DRAFT;
  // Waiting Stoppage is one-way: it goes on to closure, never back to Open.
  const statusLocked = form.status === ACTION_STATUS.CLOSURE_REQUESTED || isClosed || form.status === ACTION_STATUS.WAITING;
  const actionContractor = form.contractor || equipmentRegistry?.find((r) => r.code === equipCode)?.contractor || "";
  const isContractorEngineerFor = useIsRouteEngineerFor(actionContractor);
  const isAccEngineerHere = useIsAccEngineer();
  const canSubmit = isContractorEngineerFor || isAccEngineerHere;
  const [submitError, setSubmitError] = useState("");

  function missingForSubmit() {
    const missing = [];
    if (!String(form.agreedAction || "").trim()) missing.push("Agreed Action");
    if (!String(form.assignedTo || "").trim()) missing.push("Assigned To");
    if (!form.dueDate) missing.push("Due Date");
    if (form.duration === "" || form.duration == null || Number.isNaN(Number(form.duration)) || Number(form.duration) < 0) missing.push("Duration");
    if (!equipCode) missing.push("Equipment");
    return missing;
  }

  function handleSave(submit = false) {
    if (submit) {
      const missing = missingForSubmit();
      if (missing.length) {
        setSubmitError(`To submit, fill in: ${missing.join(", ")}.`);
        return;
      }
    }
    const acNo = isNew ? nextAcNo(allActions || []) : form.acNo;
    const payload = {
      ...form,
      acNo,
      equipmentCode: equipCode,
      status: submit ? ACTION_STATUS.OPEN : isNew ? ACTION_STATUS.DRAFT : form.status,
      duration: form.duration === "" ? "" : Number(form.duration),
      _submit: submit,
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
    // Last Change comes from the Oil Change Log only (confirmed oil-change
    // routes update it) — never typed here, so saving an action no longer
    // writes Oil Change Log entries.
    const latestChange = latestOilChangeFor(oilChanges, equipCode);
    payload.lastChange = latestChange ? formatDate(latestChange.changeDate) : form.lastChange ? formatDate(form.lastChange) : "";

    // Phase 3: routes are no longer created from here. Once the action is
    // submitted, the server turns Change Oil / Top Up / Sample / Resample in
    // the Agreed Action into saved Suggestions, picked when creating a route.

    onSave(payload);
  }

  const label = (text) => <label style={{ ...s.label, fontSize: 12, fontWeight: 600 }}>{text}</label>;
  const field = (text, key, type = "text") => (
    <div>
      {label(text)}
      <input style={{ ...s.input, fontSize: 13 }} type={type} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  const textarea = (text, key) => (
    <div>
      {label(text)}
      <textarea style={{ ...s.input, fontSize: 13, minHeight: 64, resize: "vertical" }} value={form[key] || ""} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  // Last Previous Action / Closing Comment are history, not inputs.
  const lockedTextarea = (text, key) => (
    <div>
      {label(text)}
      <div
        style={{
          fontSize: 13,
          minHeight: 64,
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px dashed ${T.border}`,
          borderLeft: `3px solid ${T.border2 || T.border}`,
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

  const reg = equipmentRegistry?.find((r) => r.code === equipCode);
  const latestSample = samplesForEquip[0];
  const statusNow = isNew ? ACTION_STATUS.DRAFT : form.status || ACTION_STATUS.OPEN;
  const statusKey = { Draft: "warning", Open: "danger", "Waiting Stoppage": "accent", "Closure Requested": "info", Closed: "success" }[statusNow] || "textSecondary";
  const resultColor = (r) => {
    const v = String(r || "").toUpperCase();
    return v.startsWith("ALERT") || v.startsWith("CRIT") ? T.danger : v.startsWith("CAUT") ? T.warning : v.startsWith("NORM") ? T.success : T.textSecondary;
  };
  const pill = (text, color) => (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: color + "1F", color }}>{text}</span>
  );
  const dueEnd = actionDueEnd(form);
  const grid = (min = 170) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 12 });
  const roStyle = { ...s.input, fontSize: 13, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center", minHeight: 34 };

  const footer = (
    <>
      {!isNew && onDelete && !lockedClosed && (
        <button
          style={{ ...s.btn, color: T.danger, borderColor: T.danger, marginRight: "auto" }}
          onClick={() => window.confirm("Delete this action from the sheet?") && onDelete()}
        >
          <i className="ti ti-trash" aria-hidden="true" /> Delete
        </button>
      )}
      {submitError && <span style={{ fontSize: 12.5, color: T.danger, flexBasis: "100%", textAlign: "right" }}>{submitError}</span>}
      <button style={s.btn} onClick={onClose}>
        {lockedClosed ? "Close" : "Cancel"}
      </button>
      {lockedClosed ? null : sampleTakenBy ? (
        <button style={{ ...s.btnPrimary, opacity: 0.5, cursor: "not-allowed" }} disabled>
          Save
        </button>
      ) : isDraft ? (
        <>
          <button style={s.btn} onClick={() => handleSave(false)}>
            Save as Draft
          </button>
          {canSubmit && (
            <button style={s.btnPrimary} onClick={() => handleSave(true)}>
              Submit
            </button>
          )}
        </>
      ) : (
        <button style={s.btnPrimary} onClick={() => handleSave(false)}>
          Save
        </button>
      )}
    </>
  );

  return (
    <ModalShell
      icon="clipboard-list"
      title={isNew ? "New Action" : lockedClosed ? "Closed Action" : "Edit Action"}
      subtitle={
        <>
          Ac. No. <strong>{isNew ? nextAcNo(allActions || []) : form.acNo}</strong>
          {isNew && <span style={{ marginLeft: 6, color: T.textMuted }}>(auto-generated)</span>}
          {equipCode && <span> · {equipCode}</span>}
        </>
      }
      badge={pill(statusNow, T[statusKey] || T.textSecondary)}
      onClose={onClose}
      footer={footer}
      width={820}
      testid="action-modal"
    >
      <StepTrail steps={[ACTION_STATUS.DRAFT, ACTION_STATUS.OPEN, ACTION_STATUS.WAITING, ACTION_STATUS.CLOSURE_REQUESTED, ACTION_STATUS.CLOSED]} current={statusNow} testid="action-steps" />

      {lockedClosed && (
        <div data-testid="action-closed-lock" style={{ ...s.infoBar, borderColor: T.success, marginBottom: 14, fontSize: 12.5, color: T.textPrimary }}>
          <i className="ti ti-lock" aria-hidden="true" style={{ color: T.success, marginRight: 6 }} />
          This action is closed — it can't be changed or deleted.
        </div>
      )}
      {isDraft && !lockedClosed && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.warning + "14", border: `1px solid ${T.warning}55`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: T.textPrimary }}>
          <i className="ti ti-pencil" aria-hidden="true" style={{ color: T.warning, fontSize: 16, marginTop: 1 }} />
          <span>
            <strong>Draft{action.createdByRule ? ` — created automatically (${action.createdByRule})` : ""}.</strong> Fill in the Agreed Action, Assigned To, Due Date
            and Duration, then press Submit — it becomes Open. Save as Draft keeps your changes without submitting.
          </span>
        </div>
      )}
      {isActionOverdue(form) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: T.danger + "12", border: `1px solid ${T.danger}55`, borderRadius: 10, padding: "9px 12px", marginBottom: 14, fontSize: 12.5, color: T.danger, fontWeight: 600 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          Overdue by {actionDaysOverdue(form)} day{actionDaysOverdue(form) === 1 ? "" : "s"} (due date + duration + 5 days ended{" "}
          {dueEnd?.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}).
        </div>
      )}

      <fieldset disabled={lockedClosed} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <FormSection icon="settings-2" title="Equipment & sample" testid="action-sec-equipment">
          <div style={{ ...grid(200), marginBottom: equipCode ? 12 : 0 }}>
            <div>
              {label("Equipment Code")}
              <EquipmentSearch options={equipmentRegistry} value={equipCode} onChange={selectEquipment} placeholder="Search equipment…" width="100%" />
            </div>
            {field("Revision Date", "revisionDate", "date")}
            <div>
              {label("Sample Date")}
              <select style={{ ...s.input, fontSize: 13, cursor: "pointer" }} value={form.sampleDate || ""} onChange={(e) => selectSampleDate(e.target.value)} aria-label="Sample Date">
                <option value="">Select sample date…</option>
                {samplesForEquip.map((sm) => (
                  <option key={sm._id} value={sm.sampledDate}>
                    {sm.sampledDate}
                    {sm.reportStatus ? ` — ${sm.reportStatus}` : ""}
                  </option>
                ))}
                {form.sampleDate && !samplesForEquip.some((sm) => sm.sampledDate === form.sampleDate) && <option value={form.sampleDate}>{form.sampleDate}</option>}
              </select>
            </div>
          </div>
          {equipCode && (
            <div
              data-testid="action-context"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10, background: T.cardSubBg, borderRadius: 10, padding: "10px 12px" }}
            >
              {[
                ["Description", form.description || reg?.description || "—"],
                ["Oil", form.oilType || reg?.lubricant || "—"],
                ["Sample result", form.sampleResult ? pill(form.sampleResult, resultColor(form.sampleResult)) : latestSample ? <span style={{ color: T.textSecondary }}>pick a sample date</span> : "no samples"],
                [
                  "Last oil change",
                  <span key="lc">
                    {form.lastChange ? formatDate(form.lastChange) : "—"}
                    {oilChangesForEquip.length > 0 && (
                      <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>
                        {(oilChangesForEquip.find((o) => o._id === lubPointId) || oilChangesForEquip[0]).lubricationPoint}
                      </span>
                    )}
                  </span>,
                ],
              ].map(([k, v]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 2, overflowWrap: "anywhere" }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {equipCode && (
            <p style={{ fontSize: 12, color: T.textMuted, margin: "8px 0 0" }}>
              {oilChangesForEquip.length > 0 ? "Last oil change comes from the Oil Change Log (updated when an oil-change route is confirmed)." : "No oil change logged for this equipment yet."}
            </p>
          )}
        </FormSection>

        <FormSection icon="flask" title="Analysis & what to do" testid="action-sec-analysis">
          <div style={{ ...grid(260), marginBottom: 12 }}>
            {textarea("Sample Analysis", "sampleAnalysis")}
            {lockedTextarea("Last Previous Action", "prevMonthAgreedAction")}
          </div>
          <div style={grid(220)}>
            <MultiSelectTags label="Contractor Action" value={form.contractorAction} onChange={(v) => set("contractorAction", v)} options={actionRegistry} />
            <MultiSelectTags label="ACC Action" value={form.accAction} onChange={(v) => set("accAction", v)} options={actionRegistry} />
          </div>
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.accent}55`, background: T.accent + "0D" }}>
            <MultiSelectTags label="Agreed Action" value={form.agreedAction} onChange={(v) => set("agreedAction", v)} options={actionRegistry} />
            <p style={{ fontSize: 12, color: T.textSecondary, margin: "6px 0 0" }}>
              <i className="ti ti-route" aria-hidden="true" /> Change Oil / Top Up / Sample / Resample here become route suggestions once submitted.
            </p>
          </div>
          {isClosed && <div style={{ marginTop: 12 }}>{lockedTextarea("Closing Comment", "closingComment")}</div>}
        </FormSection>

        <FormSection icon="user-check" title="Owner & timing" testid="action-sec-owner">
          <div style={grid(170)}>
            <div>
              {label("Contractor")}
              {scopedContractor ? (
                <div style={roStyle}>{scopedContractor}</div>
              ) : (
                <select style={{ ...s.input, fontSize: 13, cursor: "pointer" }} value={form.contractor || ""} onChange={(e) => set("contractor", e.target.value)} aria-label="Contractor">
                  <option value="">—</option>
                  {CONTRACTOR_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ gridColumn: "span 2", minWidth: 0 }}>
              {label("Assigned To")}
              <TechnicianPicker contractor={form.contractor} value={form.assignedTo || ""} onChange={(v) => set("assignedTo", v)} roleFilter={null} placeholder="Who owns this action?" />
            </div>
            <div>
              {label("Status")}
              {isDraft || statusLocked ? (
                <div style={roStyle}>{form.status}</div>
              ) : (
                <select style={{ ...s.input, fontSize: 13, cursor: "pointer" }} value={form.status || ACTION_STATUS.OPEN} onChange={(e) => set("status", e.target.value)} aria-label="Status">
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              )}
              {isDraft && <p style={{ fontSize: 12, color: T.textMuted, margin: "3px 0 0" }}>Press Submit to make it Open</p>}
            </div>
            <div>
              {label("Due Date")}
              {isDraft ? (
                <input style={{ ...s.input, fontSize: 13 }} type="date" aria-label="Due Date" value={form.dueDate || ""} onChange={(e) => set("dueDate", e.target.value)} />
              ) : (
                <div style={roStyle}>{form.dueDate ? formatDate(form.dueDate) : "—"}</div>
              )}
              {!isDraft && form.originalDueDate && (
                <p style={{ fontSize: 12, color: T.textMuted, margin: "3px 0 0" }}>
                  First due {form.originalDueDate}. Rescheduled{form.rescheduledBy ? ` by ${form.rescheduledBy}` : ""}: {form.rescheduleReason}
                </p>
              )}
            </div>
            <div>
              {label("Duration (days)")}
              {isDraft ? (
                <input style={{ ...s.input, fontSize: 13 }} type="number" min="0" aria-label="Duration (days)" value={form.duration ?? ""} onChange={(e) => set("duration", e.target.value)} />
              ) : (
                <div style={roStyle}>{form.duration === "" || form.duration == null ? "—" : form.duration}</div>
              )}
            </div>
            <div>
              {label("Completed Date")}
              <div style={roStyle}>{isClosed ? form.completedDate || "—" : "—"}</div>
              {!isClosed && <p style={{ fontSize: 12, color: T.textMuted, margin: "3px 0 0" }}>Set when the action is closed</p>}
            </div>
          </div>
          <p style={{ fontSize: 12, color: T.textSecondary, margin: "10px 0 0" }} data-testid="action-overdue-after">
            <i className="ti ti-clock" aria-hidden="true" /> Overdue after Due Date + Duration + 5 days
            {dueEnd ? ` — ${dueEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
          </p>
        </FormSection>

        {!isNew && !isDraft && <RescheduleSection action={action} contractor={actionContractor} onDone={onClose} />}
        {!isNew && <ClosureSection action={action} contractor={actionContractor} onDone={onClose} />}
      </fieldset>

      {sampleTakenBy && !lockedClosed && (
        <div data-testid="action-sample-taken" style={{ ...s.infoBar, borderColor: T.danger, marginBottom: 0, fontSize: 12.5, color: T.textPrimary }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: T.danger, marginRight: 6 }} />
          The sample of {formatDate(form.sampleDate)} already has action <strong>{sampleTakenBy.acNo}</strong> ({sampleTakenBy.status}). One action per sample — add
          this job (filtering, resample, …) to action {sampleTakenBy.acNo} instead.
        </div>
      )}
    </ModalShell>
  );
}

// Phase 2 — closure: the Contractor Engineer requests it with a comment, an
// ACC Engineer approves (or rejects back to Open with a reason), then the
// Contractor Engineer closes it.
function ClosureSection({ action, contractor, onDone }) {
  const { T, s } = useTheme();
  const run = useActionWorkflow();
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

  const box = { background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 13 };
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
      <p style={{ fontSize: 13.5, fontWeight: 700, color: T.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <i className="ti ti-circle-check" aria-hidden="true" style={{ color: T.accent, fontSize: 16 }} /> Closure
      </p>

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

// Phase 2 — after Submit, the due date moves only with a reason (either
// engineer); the first due date and the latest reason are kept.
function RescheduleSection({ action, contractor, onDone }) {
  const { T, s } = useTheme();
  const run = useActionWorkflow();
  const isContractorSide = useIsRouteEngineerFor(contractor);
  const isAccSide = useIsAccEngineer();
  const canReschedule = isContractorSide || isAccSide;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!run || !canReschedule) return null;
  if (action.status !== ACTION_STATUS.OPEN && action.status !== ACTION_STATUS.WAITING) return null;

  async function save() {
    if (!date || !reason.trim()) {
      setError("Choose the new due date and write the reason.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await run("reschedule", action, reason.trim(), date);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 14 }}>
        <button style={s.btn} onClick={() => setOpen(true)}>
          <i className="ti ti-calendar-repeat" aria-hidden="true" /> Reschedule
        </button>
      </div>
    );
  }
  return (
    <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 13 }}>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: T.textPrimary, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <i className="ti ti-calendar-repeat" aria-hidden="true" style={{ color: T.accent, fontSize: 16 }} /> Reschedule
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ ...s.label, fontSize: 12 }}>New due date</label>
          <input style={{ ...s.input, fontSize: 13 }} type="date" aria-label="New due date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ ...s.label, fontSize: 12 }}>Reason</label>
          <input style={{ ...s.input, fontSize: 13 }} aria-label="Reschedule reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button style={s.btnPrimary} disabled={busy} onClick={save}>
          {busy ? "…" : "Save new date"}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: T.danger, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

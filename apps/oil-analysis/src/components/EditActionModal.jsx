import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { nextAcNo, formatDate } from "../parsers";
import { toISODate, latestOilChangeFor, autofillFromEquipment } from "../actionAutofill";
import EquipmentSearch from "./EquipmentSearch";
import MultiSelectTags from "./MultiSelectTags";

const STATUS_OPTIONS = ["Open", "In Progress", "Closed", "Waiting Stoppage"];
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
  saving,
}) {
  const { T, s } = useTheme();
  const deps = { equipmentRegistry, oilChanges, allActions, excludeId: action._id };
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
    base.lastChange = toISODate(base.lastChange);
    base.completedDate = toISODate(base.completedDate);
    if (isNew && (base.equipmentCode || base.unitId)) {
      const filled = autofillFromEquipment(base.equipmentCode || base.unitId, deps);
      return { ...base, ...filled };
    }
    return base;
  });
  const [lubPointId, setLubPointId] = useState(() => {
    if (isNew && (action.equipmentCode || action.unitId)) {
      const latest = latestOilChangeFor(oilChanges, action.equipmentCode || action.unitId);
      return latest ? latest._id : null;
    }
    return null;
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
    setForm((f) => ({ ...f, sampleDate: dateStr, sampleResult: sample ? (sample.reportStatus || "").toUpperCase() : f.sampleResult }));
  }

  const isClosed = (form.status || "Open") === "Closed";

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
    // also updates that equipment's Oil Change Log row. If Last Change is
    // left blank but a linked oil-change record exists, inherit its date
    // instead of writing anything new.
    if (oilChangesForEquip.length > 0) {
      const target = oilChangesForEquip.length === 1 ? oilChangesForEquip[0] : oilChangesForEquip.find((o) => o._id === lubPointId);
      if (form.lastChange && target) {
        payload._oilChangeTarget = target;
      } else if (!form.lastChange && target) {
        payload.lastChange = formatDate(target.changeDate);
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

        <p style={{ fontSize: 12, fontWeight: 700, color: T.accent, margin: "0 0 10px" }}>Status &amp; Action</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Status</label>
            <select
              style={{ ...s.input, fontSize: 13, cursor: "pointer" }}
              value={form.status || "Open"}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Completed Date</label>
            <input
              style={{ ...s.input, fontSize: 13, opacity: isClosed ? 1 : 0.4, cursor: isClosed ? "auto" : "not-allowed" }}
              type="date"
              disabled={!isClosed}
              value={form.completedDate || ""}
              onChange={(e) => set("completedDate", e.target.value)}
            />
            {!isClosed && <p style={{ fontSize: 10, color: T.textMuted, margin: "3px 0 0" }}>Available when status is Closed</p>}
          </div>
          <div>
            <label style={{ ...s.label, fontSize: 11 }}>Contractor</label>
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
          {textarea("Prev. Month Agreed Action", "prevMonthAgreedAction")}
          <MultiSelectTags label="ACC Action" value={form.accAction} onChange={(v) => set("accAction", v)} options={actionRegistry} />
          {textarea("Agreed Action", "agreedAction")}
          {isClosed && <div style={{ gridColumn: "1 / -1" }}>{textarea("Closing Comment", "closingComment")}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button style={s.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

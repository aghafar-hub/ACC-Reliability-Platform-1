import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { ACTION_STATUSES } from "../parsers";
import Modal from "./Modal";

const MACHINE_STATUSES = ["Good", "Acceptable", "Alarm", "Danger"];

// New/Edit Action form — ported from the original's `_m`. Action No is
// assigned by the caller (ActionTracker.jsx, via readLastActionNo /
// local-max fallback) before this modal is ever shown for a new action, so
// the field is always read-only here.
export default function ActionModal({ initial, registryList, contractors, onClose, onSave }) {
  const { T, s } = useTheme();
  const isNew = !(initial && initial.actionNo);
  const [form, setForm] = useState({
    actionNo: "",
    equipmentId: "",
    equipmentName: "",
    line: "",
    readingDate: "",
    triggerType: "RMS",
    triggerPoint: "",
    triggerValue: "",
    machineStatus: "",
    revisionDate: "",
    actionStatus: "Open",
    completionDate: "",
    contractor: "",
    contractorAction: "",
    accAction: "",
    agreedAction: "",
    ...initial,
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal title={isNew ? "New Action" : "Edit Action"} onClose={onClose} width={620}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {!isNew && (
          <div>
            <label style={s.label}>Action No</label>
            <input style={{ ...s.input, opacity: 0.7 }} value={form.actionNo} readOnly />
          </div>
        )}
        <div>
          <label style={s.label}>Equipment</label>
          <select
            style={s.input}
            value={form.equipmentId}
            onChange={(e) => {
              const eq = registryList.find((r) => r.equipmentId === e.target.value) || {};
              set("equipmentId", e.target.value);
              set("equipmentName", eq.equipment || "");
              set("line", eq.line || "");
            }}
          >
            <option value="">Select…</option>
            {registryList.map((eq) => (
              <option key={eq.equipmentId} value={eq.equipmentId}>
                {eq.equipmentId} — {eq.equipment}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Reading Date</label>
          <input type="date" style={s.input} value={form.readingDate || ""} onChange={(e) => set("readingDate", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Trigger Type</label>
          <select style={s.input} value={form.triggerType} onChange={(e) => set("triggerType", e.target.value)}>
            <option value="RMS">RMS</option>
            <option value="SPM">SPM</option>
            <option value="Both">Both</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Trigger Point</label>
          <input style={s.input} value={form.triggerPoint} onChange={(e) => set("triggerPoint", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Trigger Value</label>
          <input style={s.input} value={form.triggerValue} onChange={(e) => set("triggerValue", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Machine Status</label>
          <select style={s.input} value={form.machineStatus} onChange={(e) => set("machineStatus", e.target.value)}>
            <option value="">—</option>
            {MACHINE_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Contractor</label>
          <select style={s.input} value={form.contractor} onChange={(e) => set("contractor", e.target.value)}>
            <option value="">—</option>
            {contractors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Action Status</label>
          <select style={s.input} value={form.actionStatus} onChange={(e) => set("actionStatus", e.target.value)}>
            {ACTION_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={s.label}>Revision Date</label>
          <input type="date" style={s.input} value={form.revisionDate || ""} onChange={(e) => set("revisionDate", e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Completion Date</label>
          <input type="date" style={s.input} value={form.completionDate || ""} onChange={(e) => set("completionDate", e.target.value)} />
        </div>
      </div>
      {[
        ["contractorAction", "Contractor Action"],
        ["accAction", "ACC Action"],
        ["agreedAction", "Agreed Action"],
      ].map(([key, label]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <label style={s.label}>{label}</label>
          <textarea
            style={{ ...s.input, minHeight: 60, resize: "vertical" }}
            value={form[key] || ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <button style={s.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button style={s.btn} onClick={() => onSave(form)}>
          Save Action
        </button>
      </div>
    </Modal>
  );
}

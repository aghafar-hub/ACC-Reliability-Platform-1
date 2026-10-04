import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../ThemeContext";
import { useSessionEmail, useSessionContractor } from "../SessionContext";
import TechnicianPicker from "../components/TechnicianPicker";
import * as api from "../api";
import { newId, suggestedRoutinePoints, SUGGESTION_PRESETS } from "../parsers";

// Only used for the recurring-template path (isRecurring), which has no
// equipment-first contractor derivation — a template is defined by Area/
// Oil Type filters, not a picked equipment list, so there's nothing to
// derive the contractor FROM at creation time. A one-time route's ACC
// flow (see the `contractor`/toggleRow logic below) doesn't use this.
const CONTRACTOR_OPTIONS = ["RHI", "ASEC"];
const ROUTE_TYPES = [
  { id: "Oil Change", icon: "ti-droplet", desc: "Change / top-up" },
  { id: "Sampling", icon: "ti-flask", desc: "Oil analysis sample" },
  // Patch 18: single-equipment only (not a batch like the other two — see
  // the equipment-selection section below, which switches toggleRow to
  // single-select for this type), goes through the same Assign -> Submit
  // -> Approve workflow, always one-time (never recurring) — confirmed
  // directly by the user. Approval logs an Oil Top Up LOG entry (see
  // RoutineDetail.jsx's applyApprovalSideEffects) instead of an Oil
  // Change LOG one.
  { id: "Emergency Top Up", icon: "ti-alert-triangle", desc: "Urgent, single equipment" },
];
const FREQUENCIES = ["One-time", "Weekly", "Monthly", "Quarterly"];

const REASON_COLOR = { resample: "danger", overdue: "warning", missing: "danger", due: "accent" };

function ReasonBadge({ T, reason }) {
  if (!reason) return null;
  const color = T[REASON_COLOR[reason.kind]] || T.accent;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: color + "1c",
        borderRadius: 4,
        padding: "2px 6px",
        marginLeft: 6,
        whiteSpace: "nowrap",
      }}
    >
      {reason.label}
    </span>
  );
}

export default function NewRoutine({ webhookUrl, equipmentRegistry, samples, actions, oilChanges, pushToast, onCreated, onCancel }) {
  const { T, s } = useTheme();
  const createdBy = useSessionEmail();
  // Patch 16: a logged-in RHI/ASEC account can only ever create a routine
  // for its own contractor anyway — every equipment row it sees was
  // already scoped to that contractor server-side (see Rbac.js's
  // getContractorScope_). Locking the field here just makes the UI match
  // that reality instead of offering a choice that would either be a
  // no-op or get silently overridden. "" for an ACC/admin account, which
  // still picks between both via the dropdown below.
  const scopedContractor = useSessionContractor();

  const [routeType, setRouteType] = useState("Sampling");
  const [routeName, setRouteName] = useState("");
  const [frequency, setFrequency] = useState("One-time");
  const [dueDate, setDueDate] = useState("");
  // Grace period (days) after dueDate before a one-time routine counts as
  // Overdue — confirmed directly by the user. Not shown/sent for a
  // recurring template, which has no single due date of its own to apply
  // a grace window to.
  const [duration, setDuration] = useState("");
  // Patch 19: "" for an ACC/unscoped account until they pick their first
  // piece of equipment — see toggleRow/selectAllShown, which derive and
  // lock it from there instead of a manual dropdown.
  const [contractor, setContractor] = useState(scopedContractor || "");
  const [assignedTo, setAssignedTo] = useState("");
  const [area, setArea] = useState("All");
  const [oilType, setOilType] = useState("All");
  const [presetId, setPresetId] = useState("recommended");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{ lpId, label, equipmentId, oilType, suggestionReason? }]
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isEmergencyTopUp = routeType === "Emergency Top Up";
  const isRecurring = !isEmergencyTopUp && frequency !== "One-time";
  const registry = equipmentRegistry || [];

  // Emergency Top Up is always one-time and ad-hoc — never a recurring
  // template. Force the frequency back if someone had Weekly/Monthly/
  // Quarterly selected on a different route type and then switches to
  // this one (the Frequency selector itself is hidden for this type too,
  // see the render below, so this only matters for that switch moment).
  useEffect(() => {
    if (isEmergencyTopUp && frequency !== "One-time") setFrequency("One-time");
  }, [isEmergencyTopUp, frequency]);

  const areaOptions = useMemo(
    () => ["All", ...Array.from(new Set((equipmentRegistry || []).map((r) => r.area).filter(Boolean))).sort()],
    [equipmentRegistry]
  );
  const oilTypeOptions = useMemo(
    () => ["All", ...Array.from(new Set((equipmentRegistry || []).map((r) => r.lubricant).filter(Boolean))).sort()],
    [equipmentRegistry]
  );

  // Every currently-suggested point for this route type + contractor, each
  // tagged with why (see parsers.js's suggestedRoutinePoints). Recomputed
  // whenever the type/contractor changes — the basis for both the preset
  // dropdown (One-time) and the live "due today" preview (Recurring).
  const allSuggested = useMemo(
    () => suggestedRoutinePoints(routeType, contractor, equipmentRegistry, samples, actions, oilChanges),
    [routeType, contractor, equipmentRegistry, samples, actions, oilChanges]
  );

  function toChipRow(r) {
    return {
      lpId: r.code,
      label: `${r.code} — ${r.lubricationPoint || r.description}`,
      equipmentId: r.equipmentId,
      oilType: r.lubricant,
      area: r.area,
      suggestionReason: r.suggestionReason,
    };
  }

  // Applying a suggestion preset replaces the current selection outright
  // (matches the reference: picking a suggestion is an explicit action,
  // not a silent background pre-fill) — only meaningful for a one-time
  // route, since a recurring template doesn't persist a fixed LP list at
  // all (see the recurring-preview note near the bottom of this file).
  function applyPreset(id) {
    setPresetId(id);
    const preset = SUGGESTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setSelected(allSuggested.filter(preset.filter).map(toChipRow));
  }

  // Re-apply the current preset whenever what it would suggest changes
  // (a route type switch) so the list stays in sync instead of showing a
  // stale selection for the wrong type. Patch 19: deliberately does NOT
  // watch `contractor` any more — an ACC/unscoped account no longer has a
  // manual Contractor dropdown to change (see below), so the only way
  // `contractor` changes now is equipment-first derivation from a manual
  // pick, and that pick must never get silently wiped out by a preset
  // re-applying right after it.
  useEffect(() => {
    // Bug-hunt pass: this used to fire unconditionally, including for
    // Emergency Top Up — whose Suggestion dropdown is hidden entirely
    // (see the "Filters & Suggestion" card's own comment above: presets
    // "help build a multi-LP batch route, which doesn't apply here").
    // routineSuggestionReason has no Emergency-Top-Up-specific branch, so
    // it silently fell through to the Sampling rule, which can match many
    // LPs — applyPreset then called setSelected with all of them,
    // bypassing toggleRow's single-select guard entirely. The backend
    // rejects a multi-equipment Emergency Top Up outright, so this
    // surfaced as a confusing, unconnected error on save.
    if (isEmergencyTopUp) return;
    applyPreset(presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a route type swap should reset the pick; re-running on presetId here would fight the dropdown's own onChange
  }, [routeType, equipmentRegistry, samples, actions, oilChanges]);

  // Companion to the guard above: switching INTO Emergency Top Up from a
  // route type that just built a multi-LP selection (Sampling/Oil Change)
  // must clamp it down to at most one — toggleRow's own single-select
  // logic only governs new clicks, not a selection that already existed
  // the moment this type became active.
  useEffect(() => {
    if (isEmergencyTopUp) setSelected((prev) => (prev.length > 1 ? prev.slice(0, 1) : prev));
  }, [isEmergencyTopUp]);

  // Patch 19: an ACC/unscoped account has no manual Contractor dropdown —
  // contractor is derived from whichever equipment they pick first (see
  // toggleRow/selectAllShown below). Once the selection empties back out,
  // unlock it so they can start over with either contractor. A scoped
  // RHI/ASEC account is unaffected: contractor is fixed from mount and
  // this never fires for them.
  useEffect(() => {
    if (!isRecurring && !scopedContractor && selected.length === 0 && contractor) setContractor("");
  }, [isRecurring, scopedContractor, selected.length, contractor]);

  // Recurring templates have no equipment-first pick to derive a
  // contractor from (see CONTRACTOR_OPTIONS' own comment) — an ACC
  // account still gets a real dropdown there, defaulted here the first
  // time they switch into a recurring frequency with nothing set yet.
  useEffect(() => {
    if (isRecurring && !scopedContractor && !contractor) setContractor(CONTRACTOR_OPTIONS[0]);
  }, [isRecurring, scopedContractor, contractor]);

  const q = search.trim().toLowerCase();
  const candidates = registry.filter((r) => {
    // contractor is "" for an ACC account that hasn't picked any equipment
    // yet — show both contractors' equipment until the first pick locks it.
    if (contractor && r.contractor && r.contractor !== contractor) return false;
    if (routeType === "Sampling" && r.oilAnalysisRequired !== "Yes") return false;
    if (area !== "All" && r.area !== area) return false;
    if (oilType !== "All" && r.lubricant !== oilType) return false;
    if (!q) return true;
    return [r.code, r.equipmentId, r.lubricationPoint, r.area].filter(Boolean).some((f) => f.toLowerCase().includes(q));
  });
  const shownCandidates = candidates.slice(0, 200);

  function isSelected(lpId) {
    return selected.some((sel) => sel.lpId === lpId);
  }
  function toggleRow(r) {
    // Emergency Top Up covers exactly one piece of equipment — picking a
    // new row replaces whatever was selected instead of adding to it, and
    // clicking the already-selected row clears it back to none.
    if (isEmergencyTopUp) {
      setSelected((prev) => {
        const deselecting = prev[0]?.lpId === r.code;
        if (!deselecting && !contractor && r.contractor) setContractor(r.contractor);
        return deselecting ? [] : [toChipRow(r)];
      });
      return;
    }
    setSelected((prev) => {
      const adding = !prev.some((sel) => sel.lpId === r.code);
      // Patch 19: an ACC account's first pick locks contractor to that
      // equipment's own contractor — candidates then narrow to just that
      // contractor (see the `candidates` filter above), so there's nothing
      // more to guard here; a second, conflicting-contractor row simply
      // can't appear in the list to click on.
      if (adding && !contractor && r.contractor) setContractor(r.contractor);
      return adding ? [...prev, toChipRow(r)] : prev.filter((sel) => sel.lpId !== r.code);
    });
  }
  function selectAllShown() {
    setSelected((prev) => {
      const have = new Set(prev.map((sel) => sel.lpId));
      const toAdd = shownCandidates.filter((r) => !have.has(r.code));
      // Patch 19: if contractor isn't locked yet (ACC, nothing selected),
      // lock to the first shown candidate's contractor and only add rows
      // that match it — "Select All" must never pull in both contractors
      // at once, same rule a single pick already enforces.
      if (!contractor && toAdd.length > 0 && toAdd[0].contractor) {
        setContractor(toAdd[0].contractor);
        const locked = toAdd[0].contractor;
        return [...prev, ...toAdd.filter((r) => r.contractor === locked).map(toChipRow)];
      }
      return [...prev, ...toAdd.map(toChipRow)];
    });
  }
  function clearSelection() {
    setSelected([]);
  }
  function removePoint(lpId) {
    setSelected((prev) => prev.filter((sel) => sel.lpId !== lpId));
  }

  // Recurring templates don't persist a fixed LP list — every cycle
  // re-computes what's actually due at generation time (see
  // RouteTemplates.js's computeDueLpIds_). This is what that same
  // criteria would catch if it ran today, for the operator's own sanity
  // check before saving the template.
  const recurringPreview = useMemo(() => {
    if (!isRecurring) return [];
    return allSuggested.filter((r) => (area === "All" || r.area === area) && (oilType === "All" || r.lubricant === oilType));
  }, [isRecurring, allSuggested, area, oilType]);

  async function handleCreate() {
    if (!routeName.trim()) {
      pushToast("Enter a route name.", "error");
      return;
    }
    if (!isRecurring) {
      if (!assignedTo.trim()) {
        pushToast("Enter who this route is assigned to.", "error");
        return;
      }
      if (selected.length === 0) {
        pushToast(isEmergencyTopUp ? "Select the equipment that needs the top-up." : "Add at least one lubrication point.", "error");
        return;
      }
      if (isEmergencyTopUp && !reason.trim()) {
        pushToast("Enter a reason for the top-up.", "error");
        return;
      }
    }
    setSubmitting(true);
    try {
      if (isRecurring) {
        const templateId = newId("RTP");
        const saved = await api.createRouteTemplate(webhookUrl, {
          templateId,
          routeName: routeName.trim(),
          routeType,
          contractor,
          area: area === "All" ? "" : area,
          oilType: oilType === "All" ? "" : oilType,
          frequency,
          startDate: dueDate || undefined,
          createdBy,
        });
        pushToast("Recurring route created.", "success");
        onCreated(null, saved.templateId);
      } else {
        const routineId = newId("RT");
        const items = selected.map((sel) => ({ routineItemId: newId("RI"), lpId: sel.lpId, requiredOilType: sel.oilType || "" }));
        // Routines tab improvement pass: a one-time route's Area was never
        // sent at all before (only the recurring-template path had one) —
        // see Routines.js's own Area column comment. Emergency Top Up has
        // no Area filter UI (it's always a single specific piece of
        // equipment), so its area comes straight off that one selected
        // point instead; everything else uses whatever the Area filter was
        // set to when the equipment was picked.
        const routeArea = isEmergencyTopUp ? selected[0]?.area || "" : area === "All" ? "" : area;
        const saved = await api.createRoutine(webhookUrl, {
          routineId,
          routeName: routeName.trim(),
          routeType,
          dueDate: dueDate || undefined,
          duration: duration ? Number(duration) : 0,
          assignedTo: assignedTo.trim(),
          contractor,
          createdBy,
          items,
          reason: isEmergencyTopUp ? reason.trim() : undefined,
          area: routeArea,
        });
        pushToast("Route created.", "success");
        onCreated(saved.routineId, null);
      }
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 860,
          boxShadow: `0 12px 40px ${T.appBg}cc`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <p style={{ ...s.sectionTitle, margin: 0 }}>Create Route</p>
          <button style={s.btn} onClick={onCancel} disabled={submitting}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 22, maxHeight: "78vh", overflowY: "auto" }}>
          <label style={s.label}>Route Type</label>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {ROUTE_TYPES.map((rt) => (
              <button
                key={rt.id}
                onClick={() => setRouteType(rt.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${routeType === rt.id ? T.accent : T.border}`,
                  background: routeType === rt.id ? T.accent + "18" : "transparent",
                  color: routeType === rt.id ? T.accent : T.textSecondary,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <i className={`ti ${rt.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
                <span>
                  {rt.id}
                  <span style={{ display: "block", fontWeight: 400, fontSize: 11, opacity: 0.8 }}>{rt.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Route Name</label>
              <input
                style={s.input}
                type="text"
                placeholder={`e.g. ${area !== "All" ? area : "Area 482"} - Weekly ${routeType} Route`}
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
              />
            </div>
            {!isEmergencyTopUp && (
              <div>
                <label style={s.label}>Frequency</label>
                <select style={s.select} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={s.label}>{isRecurring ? "Starts On" : "Due Date"}</label>
              <input style={s.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {!isRecurring && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={s.label}>Grace Period (days)</label>
                <input
                  style={s.input}
                  type="number"
                  min="0"
                  placeholder="0"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <p style={{ fontSize: 11.5, color: T.textSecondary, margin: "auto 0 0" }}>
                Still counts as On Schedule for this many days past the Due Date before flipping to Overdue.
              </p>
            </div>
          )}

          {/* Emergency Top Up is one equipment, picked straight from the
              search below — Area/Oil Type filtering and a suggestion
              preset exist to help build a multi-LP batch route, which
              doesn't apply here. */}
          {!isEmergencyTopUp && (
            <div style={{ ...s.card, marginBottom: 16 }}>
              <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Filters &amp; Suggestion</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 14 }}>
                <div>
                  <label style={s.label}>Area</label>
                  <select style={s.select} value={area} onChange={(e) => setArea(e.target.value)}>
                    {areaOptions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Oil Type</label>
                  <select style={s.select} value={oilType} onChange={(e) => setOilType(e.target.value)}>
                    {oilTypeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                {!isRecurring && (
                  <div>
                    <label style={s.label}>Suggestion</label>
                    <select style={s.select} value={presetId} onChange={(e) => applyPreset(e.target.value)}>
                      {SUGGESTION_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Contractor</label>
              {scopedContractor || !isRecurring ? (
                contractor ? (
                  <div style={{ ...s.input, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>
                    {contractor}
                  </div>
                ) : (
                  // Patch 19: a one-time route for an ACC/unscoped account
                  // no longer picks a contractor up front — it's derived
                  // from whichever equipment they select first below, and
                  // a routine can't mix both contractors' equipment.
                  <p style={{ ...s.input, background: "transparent", color: T.textMuted, fontStyle: "italic", display: "flex", alignItems: "center", fontSize: 12.5, margin: 0 }}>
                    Set automatically once you pick equipment below
                  </p>
                )
              ) : (
                // Recurring template, ACC/unscoped account — see
                // CONTRACTOR_OPTIONS' own comment for why this one case
                // still needs a real manual dropdown.
                <select style={s.select} value={contractor} onChange={(e) => setContractor(e.target.value)}>
                  {CONTRACTOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {isRecurring ? (
            <div style={s.card}>
              <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>
                {recurringPreview.length} point{recurringPreview.length !== 1 ? "s" : ""} due today, with these filters
              </p>
              <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>
                A recurring route re-checks which points are due every cycle — it doesn't lock in this exact list. This is just a
                preview so you can sanity-check the filters before saving.
              </p>
              {recurringPreview.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  {recurringPreview.map((r) => (
                    <div key={r.code} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border2}`, fontSize: 12.5 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{r.code}</span>
                      {" — "}
                      {r.lubricationPoint || r.description}
                      <ReasonBadge T={T} reason={r.suggestionReason} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Assign Technician</label>
                  {/* Patch 16: widened from the default ROLE-TECH-only filter — a
                      routine can reasonably be assigned to a Contractor Engineer
                      too, not just a literal Technician account, matching Action
                      Tracker's "Assigned To" (EditActionModal.jsx) which already
                      uses roleFilter={null} for the same reason. */}
                  <TechnicianPicker contractor={contractor} value={assignedTo} onChange={setAssignedTo} roleFilter={null} />
                </div>
              </div>

              {isEmergencyTopUp && (
                <div style={{ marginBottom: 16 }}>
                  <label style={s.label}>Reason</label>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="e.g. Leakage, low level, seal issue…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{isEmergencyTopUp ? "Equipment" : "Lubrication Points"}</p>
                <span style={{ fontSize: 12, color: T.textSecondary }}>{candidates.length} LPs available</span>
              </div>
              <input
                style={{ ...s.input, marginBottom: 10 }}
                type="search"
                placeholder="Search by LP ID, Description, Equipment ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 12.5 }}>
                {!isEmergencyTopUp && (
                  <button style={{ ...s.btn, padding: "4px 10px" }} onClick={selectAllShown}>
                    Select All ({shownCandidates.length} shown)
                  </button>
                )}
                <button style={{ ...s.btn, padding: "4px 10px" }} onClick={clearSelection}>
                  Clear Selection
                </button>
              </div>

              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: 32 }}></th>
                      <th style={s.th}>LP ID</th>
                      <th style={s.th}>Description</th>
                      <th style={s.th}>Equipment ID</th>
                      <th style={s.th}>Oil Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownCandidates.map((r) => (
                      <tr key={r.code} style={{ cursor: "pointer" }} onClick={() => toggleRow(r)}>
                        <td style={s.td}>
                          <input type="checkbox" checked={isSelected(r.code)} readOnly />
                        </td>
                        <td style={s.td}>{r.code}</td>
                        <td style={s.td}>{r.lubricationPoint || r.description}</td>
                        <td style={s.td}>{r.equipmentId}</td>
                        <td style={s.td}>{r.lubricant}</td>
                      </tr>
                    ))}
                    {shownCandidates.length === 0 && (
                      <tr>
                        <td style={s.td} colSpan={5}>
                          No matching points.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {candidates.length > shownCandidates.length && (
                <p style={{ fontSize: 11.5, color: T.textMuted, marginTop: -10, marginBottom: 16 }}>
                  Showing {shownCandidates.length} of {candidates.length} — narrow your search to see more.
                </p>
              )}

              <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                {isEmergencyTopUp ? "Selected Equipment" : "Selected Lubrication Points"} ({selected.length})
              </p>
              {selected.length === 0 ? (
                <p style={{ color: T.textSecondary, fontSize: 13 }}>No LPs selected.</p>
              ) : (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                  {selected.map((sel) => (
                    <div
                      key={sel.lpId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom: `1px solid ${T.border2}`,
                        fontSize: 12.5,
                      }}
                    >
                      <div>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{sel.lpId}</span>
                        {"  "}
                        {sel.label.replace(`${sel.lpId} — `, "")}
                        {sel.equipmentId ? ` | ${sel.equipmentId}` : ""}
                        {sel.oilType ? ` | ${sel.oilType}` : ""}
                        <ReasonBadge T={T} reason={sel.suggestionReason} />
                      </div>
                      <button
                        onClick={() => removePoint(sel.lpId)}
                        style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 16 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "16px 22px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <button style={s.btn} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button style={s.btnPrimary} onClick={handleCreate} disabled={submitting}>
            {submitting ? "Creating…" : "Create Route"}
          </button>
        </div>
      </div>
    </div>
  );
}

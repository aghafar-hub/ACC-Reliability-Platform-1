import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../ThemeContext";
import ContractorChips from "../components/ContractorChips";
import { useSessionEmail, useSessionContractor } from "../SessionContext";
import TechnicianPicker from "../components/TechnicianPicker";
import ModalShell, { FormSection } from "../components/ModalShell";
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

const REASON_COLOR = { resample: "danger", overdue: "warning", missing: "danger", due: "accent", action: "info" };

function ReasonBadge({ T, reason }) {
  if (!reason) return null;
  const color = T[REASON_COLOR[reason.kind]] || T.accent;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
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

// initialSuggestion (Phase 3): a saved Suggestion picked on the Suggestions
// tab — the form opens on its route type with just that point selected.
// It may carry `items` (several suggestions of the same route type and
// contractor, ticked together) — then all of their points are selected.
export default function NewRoutine({ webhookUrl, equipmentRegistry, samples, actions, oilChanges, pushToast, onCreated, onCancel, initialSuggestion }) {
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

  const [routeType, setRouteType] = useState(initialSuggestion?.routeType || "Sampling");
  const initialItems = initialSuggestion ? (initialSuggestion.items?.length ? initialSuggestion.items : [initialSuggestion]) : [];
  const [routeName, setRouteName] = useState(
    initialItems.length > 1 ? `${initialItems[0].workType} - ${initialItems.length} points` : initialSuggestion?.lpId ? `${initialSuggestion.workType} - ${initialSuggestion.lpId}` : ""
  );
  const [frequency, setFrequency] = useState("One-time");
  const [dueDate, setDueDate] = useState(() => {
    const dates = initialItems.map((x) => x.requiredDate).filter(Boolean).sort();
    return dates.length ? dates[0].slice(0, 10) : "";
  });
  // Grace period (days) after dueDate before a one-time routine counts as
  // Overdue — confirmed directly by the user. Not shown/sent for a
  // recurring template, which has no single due date of its own to apply
  // a grace window to.
  const [duration, setDuration] = useState("");
  // Patch 19: "" for an ACC/unscoped account until they pick their first
  // piece of equipment — see toggleRow/selectAllShown, which derive and
  // lock it from there instead of a manual dropdown.
  const [contractor, setContractor] = useState(scopedContractor || initialSuggestion?.contractor || "");
  const [assignedTo, setAssignedTo] = useState("");
  const [area, setArea] = useState("All");
  const [oilType, setOilType] = useState("All");
  const [presetId, setPresetId] = useState("recommended");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{ lpId, label, equipmentId, oilType, suggestionReason? }]
  const [reason, setReason] = useState(initialSuggestion?.routeType === "Emergency Top Up" ? initialSuggestion.reason || "" : "");
  // Phase 3: saved Suggestions (from submitted actions) — shown in the same
  // suggestion list as the computed ones, with the action as the reason.
  const [savedSuggestions, setSavedSuggestions] = useState([]);
  const keepInitialPick = useRef(!!initialSuggestion);
  useEffect(() => {
    let alive = true;
    api
      .getSuggestions(webhookUrl)
      .then((list) => alive && setSavedSuggestions(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [webhookUrl]);
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
  const savedByLp = useMemo(() => {
    const map = {};
    for (const sg of savedSuggestions) {
      if (sg.routeType !== routeType) continue;
      if (contractor && sg.contractor && sg.contractor !== contractor) continue;
      map[sg.lpId] = sg;
    }
    return map;
  }, [savedSuggestions, routeType, contractor]);

  const allSuggested = useMemo(() => {
    const byLp = new Map(suggestedRoutinePoints(routeType, contractor, equipmentRegistry, samples, actions, oilChanges).map((r) => [r.code, r]));
    for (const sg of Object.values(savedByLp)) {
      const reg = (equipmentRegistry || []).find((r) => r.code === sg.lpId);
      if (!reg) continue;
      byLp.set(sg.lpId, { ...reg, suggestionReason: { kind: "action", label: sg.reason }, suggestionId: sg.suggestionId });
    }
    return [...byLp.values()];
  }, [routeType, contractor, equipmentRegistry, samples, actions, oilChanges, savedByLp]);

  function toChipRow(r) {
    const saved = savedByLp[r.code];
    return {
      lpId: r.code,
      label: `${r.code} — ${r.lubricationPoint || r.description}`,
      equipmentId: r.equipmentId,
      oilType: r.lubricant,
      area: r.area,
      suggestionReason: saved ? { kind: "action", label: saved.reason } : r.suggestionReason,
      suggestionId: saved ? saved.suggestionId : r.suggestionId,
    };
  }

  // Opened from the Suggestions tab: start with just those points picked.
  useEffect(() => {
    if (!initialItems.length) return;
    const picks = initialItems
      .map((sg) => {
        const reg = (equipmentRegistry || []).find((r) => r.code === sg.lpId);
        if (!reg) return null;
        return {
          lpId: reg.code,
          label: `${reg.code} — ${reg.lubricationPoint || reg.description}`,
          equipmentId: reg.equipmentId,
          oilType: reg.lubricant,
          area: reg.area,
          suggestionReason: { kind: "action", label: sg.reason },
          suggestionId: sg.suggestionId,
        };
      })
      .filter(Boolean);
    setSelected(picks.filter((p, i) => picks.findIndex((x) => x.lpId === p.lpId) === i));
    // Patch 19: the contractor comes from the picked equipment.
    const firstReg = (equipmentRegistry || []).find((r) => r.code === initialItems[0].lpId);
    if (!contractor && (firstReg?.contractor || initialItems[0].contractor)) setContractor(firstReg?.contractor || initialItems[0].contractor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when opened from a suggestion
  }, []);

  // Applying a suggestion preset replaces the current selection outright
  // (matches the reference: picking a suggestion is an explicit action,
  // not a silent background pre-fill) — only meaningful for a one-time
  // route, since a recurring template doesn't persist a fixed LP list at
  // all (see the recurring-preview note near the bottom of this file).
  function applyPreset(id) {
    keepInitialPick.current = false;
    setPresetId(id);
    const preset = SUGGESTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    // The recommendation follows the Area / Oil Type filters too.
    setSelected(
      allSuggested
        .filter(preset.filter)
        .filter((r) => (area === "All" || r.area === area) && (oilType === "All" || r.lubricant === oilType))
        .map(toChipRow)
    );
  }

  // Area / Oil Type changed: narrow the recommendation to match (unless the
  // route was opened from picked suggestions, which stay as they are).
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    if (isEmergencyTopUp || isRecurring || keepInitialPick.current) return;
    applyPreset(presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a filter change should re-run this
  }, [area, oilType]);

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
    if (keepInitialPick.current) return; // opened from a suggestion — keep that pick
    applyPreset(presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a route type swap should reset the pick; re-running on presetId here would fight the dropdown's own onChange
  }, [routeType, equipmentRegistry, samples, actions, oilChanges]);

  // Companion to the guard above: switching INTO Emergency Top Up from a
  // route type that just built a multi-LP selection (Sampling/Oil Change)
  // must clamp it down to at most one — toggleRow's own single-select
  // logic only governs new clicks, not a selection that already existed
  // the moment this type became active.
  useEffect(() => {
    if (isEmergencyTopUp) setSelected((prev) => (keepInitialPick.current ? prev.slice(0, 1) : []));
  }, [isEmergencyTopUp]);

  // Each route type starts with its own clean filters — an Area or Oil Type
  // picked for a Sampling route must not carry over to Oil Change or Top Up
  // (Top Up doesn't even show those filters).
  const lastType = useRef(routeType);
  useEffect(() => {
    if (lastType.current === routeType) return;
    lastType.current = routeType;
    setArea("All");
    setOilType("All");
    setSearch("");
  }, [routeType]);

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
    if (!isEmergencyTopUp && area !== "All" && r.area !== area) return false;
    if (!isEmergencyTopUp && oilType !== "All" && r.lubricant !== oilType) return false;
    if (!q) return true;
    return [r.code, r.equipmentId, r.lubricationPoint, r.description, r.area, r.lubricant].filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
  });
  const shownCandidates = candidates.slice(0, 200);

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
      // Phase 1: no technician yet saves the route as a Draft.
      if (!assignedTo.trim() && !window.confirm("No technician chosen — save this route as a Draft and assign it later?")) {
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
        const items = selected.map((sel) => ({
          routineItemId: newId("RI"),
          lpId: sel.lpId,
          requiredOilType: sel.oilType || "",
          suggestionId: sel.suggestionId || "", // Phase 3: marks that saved Suggestion "Converted"
        }));
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
        pushToast(
          saved.status === "Draft"
            ? "Route saved as Draft — assign a technician to send it out."
            : !scopedContractor && contractor
              ? `Route sent to the technician. ${contractor}'s engineer has been informed.`
              : "Route created and sent to the technician.",
          "success"
        );
        onCreated(saved.routineId, null);
      }
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const typeInfo = ROUTE_TYPES.find((rt) => rt.id === routeType);
  const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 14 });
  const label = (text) => <label style={{ ...s.label, fontSize: 12, fontWeight: 600 }}>{text}</label>;
  const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: T.accent };
  const selectedIds = new Set(selected.map((x) => x.lpId));
  const suggestedIds = new Set(allSuggested.map((r) => r.code));
  const reasonOf = (r) => savedByLp[r.code] ? { kind: "action", label: savedByLp[r.code].reason } : allSuggested.find((x) => x.code === r.code)?.suggestionReason;

  const footer = (
    <>
      <span style={{ marginRight: "auto", fontSize: 12.5, color: T.textSecondary }} data-testid="route-summary">
        {isRecurring
          ? `${frequency} · ${contractor || "—"} · ${recurringPreview.length} point${recurringPreview.length === 1 ? "" : "s"} due today`
          : `${selected.length} point${selected.length === 1 ? "" : "s"}${contractor ? ` · ${contractor}` : ""}${dueDate ? ` · due ${dueDate}` : ""}${assignedTo ? "" : " · no technician yet (Draft)"}`}
      </span>
      <button style={s.btn} onClick={onCancel} disabled={submitting}>
        Cancel
      </button>
      <button style={s.btnPrimary} onClick={handleCreate} disabled={submitting}>
        {submitting ? "Creating…" : "Create Route"}
      </button>
    </>
  );

  return (
    <ModalShell icon="route" title="Create Route" subtitle={typeInfo ? `${typeInfo.id} — ${typeInfo.desc}` : ""} onClose={submitting ? () => {} : onCancel} footer={footer} width={1000} testid="route-modal">
      <FormSection icon="category" title="Route type" testid="route-sec-type">
        <div style={grid(200)}>
          {ROUTE_TYPES.map((rt) => {
            const on = routeType === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                aria-pressed={on}
                onClick={() => { keepInitialPick.current = false; setRouteType(rt.id); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${on ? T.accent : T.border}`,
                  background: on ? T.accent + "14" : T.cardBg,
                  color: T.textPrimary,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: on ? T.accent : T.cardSubBg, color: on ? "#fff" : T.textSecondary, fontSize: 18, flexShrink: 0 }}>
                  <i className={`ti ${rt.icon}`} aria-hidden="true" />
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: on ? T.accent : T.textPrimary }}>{rt.id}</span>
                  <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>{rt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </FormSection>

      <FormSection icon="clipboard-text" title="Details" testid="route-sec-details">
        <div style={grid(190)}>
          <div style={{ gridColumn: "span 2", minWidth: 0 }}>
            {label("Route Name")}
            <input
              style={s.input}
              type="text"
              aria-label="Route Name"
              placeholder={`e.g. ${area !== "All" ? area : "Area 482"} - Weekly ${routeType} Route`}
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
          </div>
          {!isEmergencyTopUp && (
            <div>
              {label("Frequency")}
              <select style={s.select} value={frequency} onChange={(e) => setFrequency(e.target.value)} aria-label="Frequency">
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            {label(isRecurring ? "Starts On" : "Due Date")}
            <input style={s.input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={isRecurring ? "Starts On" : "Due Date"} />
          </div>
          {!isRecurring && (
            <div>
              {label("Grace Period (days)")}
              <input style={s.input} type="number" min="0" placeholder="0" value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Grace Period (days)" />
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>Days after the due date before it counts as overdue.</div>
            </div>
          )}
          <div>
            {label("Contractor")}
            {scopedContractor || !isRecurring ? (
              contractor ? (
                <div style={{ ...s.input, background: T.cardSubBg, color: T.textSecondary, display: "flex", alignItems: "center" }}>{contractor}</div>
              ) : (
                // Patch 19: a one-time route for an ACC/unscoped account
                // takes its contractor from the first equipment picked.
                <div style={{ ...s.input, background: "transparent", color: T.textMuted, fontStyle: "italic", display: "flex", alignItems: "center", fontSize: 12.5 }}>
                  Set by the first point you pick
                </div>
              )
            ) : (
              <ContractorChips value={contractor} onChange={setContractor} options={CONTRACTOR_OPTIONS} allLabel={null} testid="nr-contractor" />
            )}
          </div>
          {!isRecurring && (
            <div style={{ gridColumn: "span 2", minWidth: 0 }}>
              {label("Assign Technician")}
              {/* Patch 16: any role, not only ROLE-TECH (same as an action's Assigned To). */}
              <TechnicianPicker contractor={contractor} value={assignedTo} onChange={setAssignedTo} roleFilter={null} />
            </div>
          )}
          {isEmergencyTopUp && (
            <div style={{ gridColumn: "1 / -1" }}>
              {label("Reason")}
              <input style={s.input} type="text" aria-label="Reason" placeholder="e.g. Leakage, low level, seal issue…" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        icon="map-pin"
        title={isRecurring ? "Which points it covers" : isEmergencyTopUp ? "Equipment" : "Lubrication points"}
        hint={isRecurring ? "worked out again every cycle" : `${candidates.length} available`}
        testid="route-sec-points"
      >
        {!isEmergencyTopUp && (
          <div style={{ ...grid(160), marginBottom: 12 }}>
            <div>
              {label("Area")}
              <select style={s.select} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
                {areaOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {label("Oil Type")}
              <select style={s.select} value={oilType} onChange={(e) => setOilType(e.target.value)} aria-label="Oil Type">
                {oilTypeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            {!isRecurring && (
              <div>
                {label("Suggestion")}
                <select style={s.select} value={presetId} onChange={(e) => applyPreset(e.target.value)} aria-label="Suggestion">
                  {SUGGESTION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {isRecurring ? (
          <div data-testid="route-recurring-preview">
            <p style={{ fontSize: 12.5, color: T.textSecondary, margin: "0 0 8px" }}>
              <strong style={{ color: T.textPrimary }}>
                {recurringPreview.length} point{recurringPreview.length !== 1 ? "s" : ""} due today
              </strong>{" "}
              with these filters. A recurring route re-checks which points are due every cycle — this is only a preview.
            </p>
            {recurringPreview.length > 0 && (
              <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
                {recurringPreview.map((r) => (
                  <div key={r.code} style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border2}`, fontSize: 12.5 }}>
                    <span style={mono}>{r.code}</span> — {r.lubricationPoint || r.description}
                    <ReasonBadge T={T} reason={r.suggestionReason} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14, alignItems: "start" }}>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }} data-testid="route-available">
              <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, background: T.cardSubBg }}>
                <input
                  style={{ ...s.input, marginBottom: 8 }}
                  type="search"
                  placeholder="Search by LP ID, Description, Equipment ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search points"
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  {!isEmergencyTopUp && (
                    <button style={{ ...s.btn, padding: "4px 10px", fontSize: 12.5 }} onClick={selectAllShown}>
                      Select All ({shownCandidates.length} shown)
                    </button>
                  )}
                  <span style={{ color: T.textSecondary }}>
                    <span style={{ color: T.accent }}>●</span> = suggested
                  </span>
                </div>
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {shownCandidates.map((r) => {
                  const on = selectedIds.has(r.code);
                  const why = reasonOf(r);
                  return (
                    <label
                      key={r.code}
                      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderBottom: `1px solid ${T.border2}`, cursor: "pointer", background: on ? T.accent + "0F" : "transparent" }}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleRow(r)} style={{ marginTop: 3 }} aria-label={`Pick ${r.code}`} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {suggestedIds.has(r.code) && <span style={{ color: T.accent, fontSize: 10 }} aria-label="suggested">●</span>}
                          <span style={{ ...mono, fontSize: 12.5 }}>{r.code}</span>
                          {why && <ReasonBadge T={T} reason={why} />}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: T.textSecondary }}>
                          {r.lubricationPoint || r.description}
                          {r.lubricant ? ` · ${r.lubricant}` : ""}
                          {r.area ? ` · ${r.area}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {shownCandidates.length === 0 && <p style={{ padding: 12, margin: 0, color: T.textSecondary, fontSize: 12.5 }}>No matching points.</p>}
              </div>
              {candidates.length > shownCandidates.length && (
                <p style={{ fontSize: 12, color: T.textMuted, margin: 0, padding: "6px 12px", borderTop: `1px solid ${T.border}` }}>
                  Showing {shownCandidates.length} of {candidates.length} — narrow your search to see more.
                </p>
              )}
            </div>

            <div style={{ border: `1.5px solid ${selected.length ? T.accent : T.border}`, borderRadius: 10, overflow: "hidden" }} data-testid="route-selected">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: selected.length ? T.accent + "12" : T.cardSubBg, borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {isEmergencyTopUp ? "Selected Equipment" : "Selected Lubrication Points"} ({selected.length})
                </span>
                <button style={{ ...s.btn, padding: "4px 10px", fontSize: 12.5 }} onClick={clearSelection} disabled={!selected.length}>
                  Clear Selection
                </button>
              </div>
              {selected.length === 0 ? (
                <p style={{ color: T.textSecondary, fontSize: 12.5, margin: 0, padding: 14 }}>No LPs selected. Tick points on the left{isEmergencyTopUp ? "" : " or pick a Suggestion"}.</p>
              ) : (
                <div style={{ maxHeight: 392, overflowY: "auto" }}>
                  {selected.map((sel) => (
                    <div key={sel.lpId} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${T.border2}`, fontSize: 12.5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={mono}>{sel.lpId}</span>
                        <ReasonBadge T={T} reason={sel.suggestionReason} />
                        <div style={{ fontSize: 12, color: T.textSecondary }}>
                          {sel.label.replace(`${sel.lpId} — `, "")}
                          {sel.equipmentId ? ` · ${sel.equipmentId}` : ""}
                          {sel.oilType ? ` · ${sel.oilType}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePoint(sel.lpId)}
                        aria-label={`Remove ${sel.lpId}`}
                        style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.textSecondary, cursor: "pointer", width: 26, height: 26, flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </FormSection>
    </ModalShell>
  );
}

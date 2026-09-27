// Threshold resolution, status banding, and status-color/label helpers —
// ported from the original bundle's `Ql`, `ft`, `tu`, `ut`, `hn`, `Rr`,
// `Lr`, `Is`, `nu`, `jd`, `zs`, `vr`/`vm` functions. This is the app's one
// shared "what color/word does this number mean" module; every page reads
// statuses through here rather than re-deriving thresholds itself.

// Fallback thresholds used only when neither the Equipment Register nor a
// local per-equipment override has a value — the original bundle's `Ql`.
export const DEFAULT_THRESHOLDS = {
  rms: { good: 2.8, acceptable: 7.1, alarm: 18 },
  spm: { normal: 20, caution: 35 },
};

// VIB Point Map lookup key — shared by App.jsx (building the map from
// vibPoints) and every page that looks a vibId up by equipment+point+family,
// so the two sides can never drift out of sync with each other.
export function vibPointKey(equipmentId, point, family) {
  return `${equipmentId}|${point}|${family}`;
}

// Severity ranking shared by RMS-style ("Good"/"Acceptable"/"Alarm"/"Danger")
// and SPM-style ("Normal"/"Caution") status words, so the two vocabularies
// can be compared directly (Normal ties with Good, Caution ties with
// Acceptable). Anything unrecognized ranks 0 (lowest).
export const SEVERITY_RANK = { Good: 1, Normal: 1, Acceptable: 2, Caution: 2, Alarm: 3, Danger: 4 };

// Returns whichever of two status words is more severe (ties keep `a`) —
// used to roll up an equipment's overall status across all of its RMS and
// SPM reading points.
export function worseStatus(a, b) {
  return (SEVERITY_RANK[a] || 0) >= (SEVERITY_RANK[b] || 0) ? a : b;
}

// Resolves the effective RMS/SPM alarm thresholds for one equipment.
//
// Precedence (matches the original exactly): if the Equipment Register has
// an entry for this equipment, its rmsGood/rmsAcceptable/rmsAlarm (or
// spmNormal/spmCaution/spmAlarm) values ALWAYS win — even over a value the
// user set on the Limits Settings page. The local per-equipment override
// (`thresholdsMap`, persisted under localStorage key vib_thresholds_v3) is
// only consulted when the register has no entry at all for that side (RMS
// or SPM independently). Register-less equipment falls back further to
// DEFAULT_THRESHOLDS.
//
// This means Limits Settings' "Save Limits" only has a visible effect for
// equipment that isn't in the RMS/SPM Equipment Register sheet — for
// registered equipment, editing limits from Equipment Register's own Edit
// modal (which calls updateRegisterLimits) is what actually changes the
// bands used everywhere else. Reproduced as found, not smoothed over.
export function resolveThresholds(thresholdsOverrides, equipmentId, rmsRegisterMap, spmRegisterMap) {
  const rmsReg = rmsRegisterMap && rmsRegisterMap[equipmentId];
  const spmReg = spmRegisterMap && spmRegisterMap[equipmentId];
  const localOverride = (thresholdsOverrides && thresholdsOverrides[equipmentId]) || {};
  return {
    rms: rmsReg
      ? { good: rmsReg.rmsGood, acceptable: rmsReg.rmsAcceptable, alarm: rmsReg.rmsAlarm }
      : { ...DEFAULT_THRESHOLDS.rms, ...(localOverride.rms || {}) },
    spm: spmReg
      ? { normal: spmReg.spmNormal, caution: spmReg.spmCaution, alarm: spmReg.spmAlarm }
      : { ...DEFAULT_THRESHOLDS.spm, ...(localOverride.spm || {}) },
  };
}

// RMS (mm/s) banding — 4 bands: Good < Acceptable < Alarm < Danger.
export function rmsStatus(value, thresholds) {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  const t = (thresholds && thresholds.rms) || DEFAULT_THRESHOLDS.rms;
  if (n < t.good) return "Good";
  if (n < t.acceptable) return "Acceptable";
  if (n < t.alarm) return "Alarm";
  return "Danger";
}

// SPM (dBsv) banding — only 3 bands: Normal < Caution < Danger. Note there
// is no distinct "Alarm" band for SPM in the original (the Equipment
// Register and Limits Settings both collect an `spmAlarm` limit, but
// rmsStatus-style code never reads it for banding a reading — anything at
// or above `caution` is simply "Danger"). Reproduced as found.
export function spmStatus(value, thresholds) {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  const t = (thresholds && thresholds.spm) || DEFAULT_THRESHOLDS.spm;
  if (n < t.normal) return "Normal";
  if (n < t.caution) return "Caution";
  return "Danger";
}

// Color-key (into the active theme) for an RMS-style status. RMS's own
// "Danger" band renders as `purple`, distinct from `danger` (red) — this is
// intentional in the original: it keeps "past the alarm limit" visually
// distinguishable from "Alarm" itself.
export function rmsColorKey(status) {
  return { Good: "success", Acceptable: "warning", Alarm: "danger", Danger: "purple" }[status] || "info";
}

// Color-key for an SPM-style status. Unlike rmsColorKey, SPM's "Danger"
// maps to plain `danger` (red), not `purple` — the two vocabularies are
// intentionally colored differently even though rmsToSpmStatus() below
// aligns their *words* for ranking purposes.
export function spmColorKey(status) {
  return { Normal: "success", Caution: "warning", Danger: "danger" }[status] || "info";
}

// Maps an SPM-vocabulary status onto the RMS-vocabulary word with the same
// severity rank (Normal->Good, Caution->Acceptable, Danger->Alarm) so an
// equipment's RMS and SPM readings can be combined into one overall status
// via worseStatus()/SEVERITY_RANK.
export function spmToRmsStatus(status) {
  return { Normal: "Good", Caution: "Acceptable", Danger: "Alarm" }[status] || status;
}

// Color-key covering the combined status vocabulary used on the Action
// Tracker and Generate-Monthly-Actions preview (both RMS words and SPM's
// "Normal"/"Caution" show up there interchangeably).
export function combinedColorKey(status) {
  return (
    { Good: "success", Normal: "success", Acceptable: "warning", Caution: "warning", Alarm: "danger", Danger: "purple" }[status] || "info"
  );
}

// ── Compliance Tracker's free-text month/status cells ──────────────────
// The Compliance Tracker sheet's per-month cells hold loosely-formatted
// text (sometimes "YES"/"NO", sometimes a status word, sometimes an
// observation comment) rather than a fixed enum — these three functions
// classify that text the same way the original does.

// Coarsely classifies a raw compliance cell into one of: Normal, Alert,
// Missing, Alarm, Danger, Caution, Other. An empty/blank value classifies
// as "Alert" (not "Missing") — most call sites special-case blank
// separately before reaching here, but the Dashboard's sidebar badge count
// (equipment with no compliance "last" value) calls this directly, so a
// blank "last" status does count as an Alert equipment. Reproduced as
// found, not smoothed over.
export function classifyComplianceStatus(raw) {
  if (!raw || raw === "") return "Alert";
  const t = String(raw).trim().toLowerCase();
  if (t === "yes" || t === "normal" || t === "good") return "Normal";
  if (t === "missing") return "Missing";
  if (t === "no") return "Alert";
  if (t === "alarm") return "Alarm";
  if (t === "danger") return "Danger";
  if (t.includes("caution") || t.includes("observation") || t.includes("under") || t.includes("comment")) return "Caution";
  return "Other";
}

// Color for a raw compliance cell (dots on the Compliance Tracker timeline,
// the header status pill). Blank renders a fixed dark gray (`#555555`) and
// "Missing" a fixed dark red (`#8B0000`) — both hardcoded in the original
// rather than pulled from the active theme, so they're reproduced as literal
// hex here too (unlike every other status color in this app, which comes
// from the theme).
export function complianceColor(T, raw) {
  if (!raw || raw === "") return "#555555";
  const cls = classifyComplianceStatus(raw);
  if (cls === "Normal") return T.success;
  if (cls === "Alarm") return T.danger;
  if (cls === "Danger") return T.purple || "#A78BFA";
  if (cls === "Caution") return T.warning;
  if (cls === "Missing") return "#8B0000";
  if (cls === "Alert") return T.danger;
  return T.warning; // "Other"
}

// Single-letter chip label for a raw compliance cell (Y/M/N/A/D/C/O).
export function complianceLetter(raw) {
  if (!raw || raw === "") return "M";
  const cls = classifyComplianceStatus(raw);
  return { Normal: "Y", Missing: "M", Alert: "N", Alarm: "A", Danger: "D", Caution: "C" }[cls] || "O";
}

// ── Dashboard join ──────────────────────────────────────────────────────
// Builds one entry per equipment that has at least one Last RMS or Last SPM
// row, combining its most severe reading status, a colorKey for the status
// pill, and the "driven by" chips shown on the expanded card (which
// point/type readings are responsible for the equipment's overall status).
// Ported from the original's `Sm()`.
export function buildDashboardEntries(lastRms, lastSpm, registryMap, rmsRegisterMap, spmRegisterMap, thresholdsOverrides) {
  const entries = new Map();
  const getOrCreate = (equipmentId) => {
    if (!entries.has(equipmentId)) {
      const reg = registryMap[equipmentId] || {};
      entries.set(equipmentId, {
        equipmentId,
        equipment: reg.equipment || "",
        line: reg.line || "",
        eqType: reg.eqType || "",
        status: null,
        colorKey: "info",
        drivenBy: [],
        rmsPoints: [],
        spmPoints: [],
      });
    }
    return entries.get(equipmentId);
  };

  lastRms.forEach((r) => {
    if (!r.equipmentId) return;
    const entry = getOrCreate(r.equipmentId);
    const thresholds = resolveThresholds(thresholdsOverrides, r.equipmentId, rmsRegisterMap, spmRegisterMap);
    const status = rmsStatus(r.maxVel, thresholds);
    const colorKey = rmsColorKey(status);
    entry.rmsPoints.push({
      type: "RMS",
      point: r.point,
      date: r.date,
      value: r.maxVel,
      axial: r.axial,
      gear: r.gear,
      horizontal: r.horizontal,
      vertical: r.vertical,
      status,
      colorKey,
      unit: "mm/s",
    });
    if (!entry.status || (SEVERITY_RANK[status] || 0) > (SEVERITY_RANK[entry.status] || 0)) {
      entry.status = status;
      entry.colorKey = colorKey;
    }
  });

  lastSpm.forEach((r) => {
    if (!r.equipmentId) return;
    const entry = getOrCreate(r.equipmentId);
    const thresholds = resolveThresholds(thresholdsOverrides, r.equipmentId, rmsRegisterMap, spmRegisterMap);
    const status = spmStatus(r.hdm, thresholds);
    const colorKey = spmColorKey(status);
    entry.spmPoints.push({
      type: "SPM",
      point: r.point,
      date: r.date,
      value: r.hdm,
      hdm: r.hdm,
      hdc: r.hdc,
      gs: r.gs,
      spmType: r.spmType,
      status,
      colorKey,
      unit: "dBsv",
    });
    const combined = spmToRmsStatus(status);
    if (!entry.status || (SEVERITY_RANK[combined] || 0) > (SEVERITY_RANK[entry.status] || 0)) {
      entry.status = combined;
      entry.colorKey = rmsColorKey(combined);
    }
  });

  entries.forEach((entry) => {
    if (!entry.status) return;
    const overall = entry.status;
    [...entry.rmsPoints, ...entry.spmPoints].forEach((point) => {
      const pointStatus = point.type === "SPM" ? spmToRmsStatus(point.status) : point.status;
      if (pointStatus === overall) entry.drivenBy.push({ type: point.type, point: point.point, colorKey: point.colorKey });
    });
  });

  return entries;
}

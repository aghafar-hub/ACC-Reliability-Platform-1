// Shared lookups for the redesigned pages: which report scope an equipment
// belongs to, its limits, and the VIB IDs of a scope. Mirrors the backend's
// vlMasterData_/vlScopeOf_ (VibrationLog.js) so both sides agree.
import { band } from "./levels";

export const SCOPES = ["Line 1", "Line 2", "Cement Mills"];
export const RMS_DEFAULT = [2.8, 7.1, 18];
export const SPM_DEFAULT = [20, 35, 50];
export const DUE_DAYS = 45;

export function scopeOf(contractor, line) {
  if (contractor === "ASEC") return "Cement Mills";
  const l = String(line || "").replace(/\s+/g, "").toLowerCase();
  if (l === "line1") return "Line 1";
  if (l === "line2") return "Line 2";
  if (l === "cm1" || l === "cm2") return "Cement Mills";
  return "";
}

// equipmentId → { id, name, line, contractor, scope, rms:[a,b,c], spm:[a,b,c], gs, vibLimits, interval, status, points:[vibPoint] }
// `limits` (getVibLimits) adds the App Owner's own limits, interval and
// Active / Inactive on top of the Registers (backend Limits.js).
export function buildEquipment(vibPoints, rmsRegister, spmRegister, limits) {
  const eq = {};
  const get = (id) => (eq[id] ||= { id, name: "", line: "", contractor: "", scope: "", rms: null, spm: null, points: [] });
  rmsRegister.forEach((r) => {
    const x = get(r.equipmentId);
    x.name ||= r.equipment;
    x.line ||= r.line;
    x.rms = [r.rmsGood, r.rmsAcceptable, r.rmsAlarm];
  });
  spmRegister.forEach((r) => {
    const x = get(r.equipmentId);
    x.name ||= r.equipment;
    x.line ||= r.line;
    x.spm = [r.spmNormal, r.spmCaution, r.spmAlarm];
  });
  vibPoints.forEach((p) => {
    if (!p.vibId || String(p.status).toLowerCase() === "inactive") return;
    const x = get(p.equipmentId);
    x.contractor ||= p.contractor;
    x.points.push(p);
  });
  const lim = Object.fromEntries((limits?.equipment || []).map((e) => [e.equipmentId, e]));
  Object.values(eq).forEach((x) => {
    const l = lim[x.id];
    if (l) {
      x.rms = l.rms || x.rms;
      x.spm = l.spm || x.spm;
      x.gs = l.gs || null;
      x.interval = l.interval;
      x.status = l.status;
    }
    x.vibLimits = {};
    x.points.forEach((p) => {
      if (limits?.vibLimits?.[p.vibId]) x.vibLimits[p.vibId] = limits.vibLimits[p.vibId];
    });
    x.scope = scopeOf(x.contractor, x.line);
    x.points.sort((a, b) => a.positionCode.localeCompare(b.positionCode) || familyOrder(a.family) - familyOrder(b.family) || a.vibId.localeCompare(b.vibId));
  });
  return eq;
}

export function familyOrder(f) {
  return { RMS: 0, SPM: 1, Gs: 2 }[f] ?? 3;
}

// What a VIB ID takes: RMS → which of H/V/A, SPM → HDm/HDc, Gs → G's.
export function fieldsFor(point) {
  if (point.family === "SPM") return ["hdm", "hdc"];
  if (point.family === "Gs") return ["g"];
  const c = String(point.readingColumns || "").toLowerCase();
  const f = [];
  if (c.includes("horiz")) f.push("h");
  if (c.includes("vert")) f.push("v");
  if (c.includes("axial")) f.push("a");
  return f.length ? f : ["h", "v", "a"];
}

// System status of one reading against the equipment's limits.
// Same order as the backend: VIB ID limit > equipment limit > Register > default.
export function limitsFor(point, eqInfo) {
  const own = eqInfo?.vibLimits?.[point.vibId];
  if (own) return own;
  if (point.family === "RMS") return eqInfo?.rms || RMS_DEFAULT;
  if (point.family === "SPM") return eqInfo?.spm || SPM_DEFAULT;
  return eqInfo?.gs || null;
}
export function systemStatus(point, eqInfo, r) {
  const lim = limitsFor(point, eqInfo);
  if (point.family === "RMS") {
    const vals = [r.h, r.v, r.a].map((x) => parseFloat(x)).filter((n) => !isNaN(n));
    return vals.length ? band(Math.max(...vals), lim) : "";
  }
  if (point.family === "SPM") return band(r.hdm, lim);
  const has = r.g !== "" && r.g != null && !isNaN(parseFloat(r.g));
  return has ? (lim ? band(r.g, lim) : "No limits") : "";
}

export function monthLabel(m) {
  if (!m) return "";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function shortDate(d) {
  if (!d) return "";
  const x = new Date(d + "T00:00:00");
  return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function monthEnd(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function reportId(month, contractor, scope) {
  return `VL-${month}-${contractor}-${{ "Line 1": "L1", "Line 2": "L2", "Cement Mills": "CM" }[scope]}`;
}

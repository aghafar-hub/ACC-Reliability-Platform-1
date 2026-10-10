import { useEffect, useMemo, useState } from "react";

// The platform's official area names (Settings → Equipment & IDs → Areas),
// handed over by the shell (frontend/src/areas.ts → window.__accAreas and
// the "acc-areas" event). Same file in Oil and Vibration. Display only: the
// sheets keep their own names.
//
// resolve(raw, equipmentId, hint) → { area, line }:
//  1. a machine on the platform equipment list takes its place from there;
//  2. else the module's own name, looked up in the official list; a name
//     standing for areas on two lines (Raw Meal) is decided by `hint` (the
//     machine's line, e.g. "Line1");
//  3. else the name as it is.
// Standalone (no shell): every name as it is.

const key = (s) => String(s || "").toLowerCase().replace(/[\s#._\-/]+/g, "");
const idKey = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

export function makeResolver(list) {
  const names = new Map();
  (list?.areas || []).forEach((x) => {
    const r = x.kind === "Line" ? { area: "", line: x.name } : { area: x.name, line: x.line };
    [x.name, ...(x.aliases || [])].forEach((n) => {
      const k = key(n);
      if (!names.has(k)) names.set(k, []);
      if (!names.get(k).some((y) => y.area === r.area && y.line === r.line)) names.get(k).push(r);
    });
  });
  const byName = (raw, hintLine) => {
    const c = names.get(key(raw)) || [];
    if (c.length === 1) return c[0];
    if (c.length > 1) return c.find((x) => x.line === hintLine) || null;
    return null;
  };
  const machines = list?.machines || {};
  return (raw, id, hint) => {
    const onList = id && machines[idKey(id)];
    if (onList) {
      const [plant, main] = onList.split("|");
      const line = (main && byName(main)?.line) || "";
      const p = plant && byName(plant, line);
      if (p) return p;
      if (line) return { area: "", line };
    }
    const hintLine = hint ? byName(hint)?.line || "" : "";
    return byName(raw, hintLine) || { area: raw || "", line: hintLine };
  };
}

// The label a machine shows: its area, else its line.
export const areaText = (r) => r.area || r.line || "";

export function useAreaNames() {
  const [list, setList] = useState(() => (typeof window !== "undefined" && window.__accAreas) || null);
  useEffect(() => {
    const on = () => setList(window.__accAreas || null);
    window.addEventListener("acc-areas", on);
    on();
    return () => window.removeEventListener("acc-areas", on);
  }, []);
  return useMemo(() => makeResolver(list), [list]);
}

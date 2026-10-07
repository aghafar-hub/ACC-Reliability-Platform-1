import type { NavRecord } from "./embeddedNav";
import { canOpenModule, canSave, useModuleAccess } from "./moduleAccess";

// The field entries offered by the phone's ＋ button (BottomNav) and by the
// installed app's shortcuts (/quick/:key, see QuickLink) — the same list,
// filtered by what this person may save (Module Access).
export const OIL = "oil-analysis";
export const VIB = "vibration-analysis";
export const OIL_ROUTE = "/oil-lubrication";
export const VIB_ROUTE = "/vibration-analysis";

export type QuickItem = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  moduleId: string;
  route: string;
  page: string;
  record?: NavRecord;
};

export function useQuickActions(): QuickItem[] {
  const { access } = useModuleAccess();
  const oil = canOpenModule(access[OIL]);
  const vib = canOpenModule(access[VIB]);
  return [
    oil &&
      canSave(access[OIL], "routines") && {
        key: "topup",
        label: "Emergency top-up",
        hint: "Start a top-up route now",
        icon: "droplet",
        moduleId: OIL,
        route: OIL_ROUTE,
        page: "routines",
        record: {
          newRoute: {
            lpId: "",
            routeType: "Emergency Top Up",
            workType: "Top Up",
            contractor: "",
            reason: "",
          },
        },
      },
    oil &&
      canSave(access[OIL], "routines") && {
        key: "route",
        label: "New route",
        hint: "Oil change, sampling, top-up…",
        icon: "route",
        moduleId: OIL,
        route: OIL_ROUTE,
        page: "routines",
        record: {
          newRoute: {
            lpId: "",
            routeType: "Sampling",
            workType: "Sampling",
            contractor: "",
            reason: "",
          },
        },
      },
    oil &&
      canSave(access[OIL], "upload") && {
        key: "report",
        label: "Add lab report",
        hint: "Import the lab PDF or type it in",
        icon: "flask",
        moduleId: OIL,
        route: OIL_ROUTE,
        page: "upload",
      },
    vib &&
      canSave(access[VIB], "newreading") && {
        key: "reading",
        label: "New vibration reading",
        hint: "Record a measurement",
        icon: "graphs",
        moduleId: VIB,
        route: VIB_ROUTE,
        page: "newreading",
      },
  ].filter(Boolean) as QuickItem[];
}

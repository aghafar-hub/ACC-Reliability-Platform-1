// Vibration Analysis's settings for ModuleAccess.js (the shared, identical-
// in-every-module file). Tab ids match frontend/src/navigation.ts's
// VIBRATION_SUB_TABS, plus "settings" (this module's own Settings page).

var MA_ALL_VIB_TABS = [
  "dashboard", "registry", "graphs", "newreading", "actions",
  "compliance", "equipreg", "limits", "settings",
];

var MA_CONFIG = {
  moduleId: "vibration-analysis",
  moduleName: "Vibration Analysis",
  peopleSheet: "VIB_MODULE_PEOPLE",
  tabAccessSheet: "VIB_TAB_ACCESS",
  tabs: MA_ALL_VIB_TABS,

  roles: [
    { id: "ROLE-TECH", label: "Technician" },
    { id: "ROLE-CENG", label: "Contractor Engineer" },
    { id: "ROLE-RENG", label: "ACC Engineer" },
    { id: "ROLE-MGR", label: "Manager" },
  ],

  // Matches what each role could do before Phase 0: technician-only
  // accounts never saw this module (they only get the My Work screen).
  defaultRoleLevels: {
    "ROLE-TECH": { "*": "Hidden" },
    "ROLE-CENG": { "*": "Edit" },
    "ROLE-RENG": { "*": "Edit" },
    "ROLE-MGR": { "*": "Edit" },
  },

  orgToContractor: { "ORG-RHI": "RHI", "ORG-ASEC": "ASEC" },

  readRules: {
    test: "open",
    getMyAccess: "open",
    getModuleAccessConfig: "admin",
    readActions: ["actions", "dashboard"],
    readLastActionNo: ["actions"],
  },

  sectionTabs: {
    rms: ["graphs", "registry", "dashboard", "newreading"],
    spm: ["graphs", "registry", "dashboard", "newreading"],
    compliance: ["compliance", "dashboard", "newreading"],
    lastRms: ["dashboard", "registry", "newreading", "graphs", "compliance"],
    lastSpm: ["dashboard", "registry", "newreading", "graphs", "compliance"],
    actions: ["actions", "dashboard"],
  },

  writeRules: {
    append: maVibGenericSheetTabs_,
    updateRow: maVibGenericSheetTabs_,
    deleteRow: maVibGenericSheetTabs_,
    upsertLastRMS: ["newreading", "registry"],
    upsertLastSPM: ["newreading", "registry"],
    deleteLastRMS: ["newreading", "registry"],
    deleteLastSPM: ["newreading", "registry"],
    updateCompliance: ["compliance", "newreading"],
    markMissingCompliance: ["compliance"],
    updateRegisterLimits: ["limits", "equipreg"],
    backfillLastReadings: ["settings"],
    appendAction: ["actions"],
    updateAction: ["actions"],
    deleteAction: ["actions"],
    sendActionEmail: ["actions"],
    saveConfig: ["settings"],
    maSetStatus: "admin",
    maAddPeople: "admin",
    maRemovePerson: "admin",
    maSetTabLevel: "admin",
  },
};

// This backend's writes arrive through doGet as well as doPost, so the
// router needs to know which actions are writes (everything else is a read).
var VIB_WRITE_ACTIONS = Object.keys(MA_CONFIG.writeRules);

function maVibGenericSheetTabs_(data) {
  switch (data.sheet) {
    case SHEET_RMS:
    case SHEET_SPM: return ["newreading", "registry"];
    case SHEET_RMS_REG:
    case SHEET_SPM_REG: return ["equipreg", "limits"];
    case SHEET_COMPLIANCE: return ["compliance"];
    case SHEET_ACTIONS: return ["actions"];
    default: return "admin";
  }
}

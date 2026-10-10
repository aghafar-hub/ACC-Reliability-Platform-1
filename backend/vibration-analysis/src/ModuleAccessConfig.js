// Vibration Analysis's settings for ModuleAccess.js (the shared, identical-
// in-every-module file). Tab ids match frontend/src/navigation.ts's
// VIBRATION_SUB_TABS, plus "settings" (this module's own Settings page).

var MA_ALL_VIB_TABS = [
  "dashboard", "log", "equipment", "trends", "routes", "newreading", "actions", "mywork",
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
    { id: "ROLE-MGR", label: "ACC Manager" },
    { id: "ROLE-CMGR", label: "Contractor Manager" },
    // Sees what the App Owner allows, never edits (capped at View in ModuleAccess.js).
    { id: "ROLE-VIEW", label: "Visitor" },
  ],

  // Matches what each role could do before Phase 0: technician-only
  // accounts never saw this module (they only get the My Work screen).
  defaultRoleLevels: {
    // Technicians only see My Work (their vibration routes open there).
    "ROLE-TECH": { mywork: "Edit", "*": "Hidden" },
    "ROLE-CENG": { "*": "Edit" },
    "ROLE-RENG": { "*": "Edit" },
    "ROLE-MGR": { "*": "Edit" },
    "ROLE-CMGR": { "*": "Edit" },
    "ROLE-VIEW": { settings: "Hidden", "*": "View" },
  },

  orgToContractor: { "ORG-RHI": "RHI", "ORG-ASEC": "ASEC" },

  readRules: {
    getIdCheck: "settings:equipment-ids",
    getModuleSettings: "settings:vibration-analysis",
    test: "open",
    getMyAccess: "open",
    getModuleAccessConfig: "settings:module-access",
    readActions: ["actions", "dashboard"],
    readLastActionNo: ["actions"],
    getVibLog: ["log", "dashboard"],
    getVibReport: ["log", "dashboard", "equipment"],
    getVibEquipmentHistory: ["equipment", "log", "dashboard", "trends"],
    getVibActions: ["actions", "dashboard", "equipment"],
    getVibRoutes: ["routes", "mywork", "dashboard"],
    getVibRoute: ["routes", "mywork"],
    getMyWork: ["mywork"],
    getVibDashboard: ["dashboard"],
    // a person reads only their own notices (session email) — technicians too
    getVibNotifications: "open",
    getVibActionHistory: ["actions"],
    getVibLimits: ["limits", "equipment", "newreading", "log", "dashboard"],
    getVibEquipmentSummary: ["equipment", "dashboard", "newreading", "trends"],
    getVibTracker: ["compliance", "equipment", "dashboard", "log"],
  },

  sectionTabs: {
    rms: ["trends", "equipment", "dashboard", "newreading"],
    spm: ["trends", "equipment", "dashboard", "newreading"],
    compliance: ["compliance", "dashboard", "newreading"],
    lastRms: ["dashboard", "equipment", "newreading", "trends", "compliance"],
    lastSpm: ["dashboard", "equipment", "newreading", "trends", "compliance"],
    actions: ["actions", "dashboard"],
  },

  writeRules: {
    markIdCheck: "admin",
    saveModuleSettings: "settings:vibration-analysis",
    append: maVibGenericSheetTabs_,
    updateRow: maVibGenericSheetTabs_,
    deleteRow: maVibGenericSheetTabs_,
    upsertLastRMS: ["newreading", "equipment"],
    upsertLastSPM: ["newreading", "equipment"],
    deleteLastRMS: ["newreading", "equipment"],
    deleteLastSPM: ["newreading", "equipment"],
    updateCompliance: ["compliance", "newreading"],
    markMissingCompliance: ["compliance"],
    updateRegisterLimits: ["limits", "equipreg"],
    backfillLastReadings: ["settings"],
    appendAction: ["actions"],
    updateAction: ["actions"],
    deleteAction: ["actions"],
    sendActionEmail: ["actions"],
    saveConfig: ["settings"],
    saveVibReport: ["log"],
    saveVibEntries: ["log"],
    vibReportTransition: ["log"],
    saveVibReadings: ["newreading", "equipment"],
    saveVibLimits: ["limits"],
    saveVibAction: ["actions"],
    vibActionTransition: ["actions"],
    createVibRoute: ["routes"],
    saveVibRouteProgress: ["routes", "mywork"],
    vibRouteTransition: ["routes", "mywork"],
    dismissVibSuggestion: ["routes"],
    markVibNotificationsRead: "open",
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
    case SHEET_SPM: return ["newreading", "equipment"];
    case SHEET_RMS_REG:
    case SHEET_SPM_REG: return ["equipreg", "limits"];
    case SHEET_COMPLIANCE: return ["compliance"];
    case SHEET_ACTIONS: return ["actions"];
    default: return "admin";
  }
}

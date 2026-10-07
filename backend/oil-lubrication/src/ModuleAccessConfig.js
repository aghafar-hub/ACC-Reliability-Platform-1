// Oil Lubrication's settings for ModuleAccess.js (the shared, identical-in-
// every-module file). Tab ids match frontend/src/navigation.ts's
// OIL_SUB_TABS, plus "mywork" (the oil part of the shell's My Work page)
// and "settings" (this module's own Settings page).

var MA_ALL_OIL_TABS = [
  "dashboard", "equipment", "routines", "oilreport", "upload", "actions",
  "oilchange", "tracker", "inventory", "reports", "activity", "settings", "mywork", "team",
];

// Tabs whose data every part of the app leans on (equipment names, LP ids)
// — any visible tab is enough to read these.
var MA_ANY_OIL_TAB = MA_ALL_OIL_TABS;

var MA_CONFIG = {
  moduleId: "oil-analysis",
  moduleName: "Oil Lubrication",
  peopleSheet: "OL_MODULE_PEOPLE",
  tabAccessSheet: "OL_TAB_ACCESS",
  tabs: MA_ALL_OIL_TABS,

  roles: [
    { id: "ROLE-TECH", label: "Technician" },
    { id: "ROLE-CENG", label: "Contractor Engineer" },
    { id: "ROLE-RENG", label: "ACC Engineer" },
    { id: "ROLE-MGR", label: "ACC Manager" },
    { id: "ROLE-CMGR", label: "Contractor Manager" },
    // Sees what the App Owner allows, never edits (capped at View in ModuleAccess.js).
    { id: "ROLE-VIEW", label: "Visitor" },
  ],

  // Starting point when the module's access sheet is first created: matches
  // what each role could already see and do before Phase 0 (technician-only
  // accounts only ever saw My Work).
  defaultRoleLevels: {
    "ROLE-TECH": { mywork: "Edit", "*": "Hidden" },
    "ROLE-CENG": { "*": "Edit" },
    "ROLE-RENG": { "*": "Edit" },
    "ROLE-MGR": { "*": "Edit" },
    "ROLE-CMGR": { "*": "Edit" },
    "ROLE-VIEW": { mywork: "Hidden", settings: "Hidden", "*": "View" },
  },

  orgToContractor: { "ORG-RHI": "RHI", "ORG-ASEC": "ASEC" },

  // GET action → "open" (anyone, even not logged in), "admin", "member"
  // (any member), or a list of tabs (View on any one of them is enough).
  // Not listed = "member".
  readRules: {
    test: "open",
    getMyAccess: "open",
    getInAppNotifications: "open",
    getModuleAccessConfig: "admin",
    getDashboard: ["dashboard"],
    getActions: ["actions", "dashboard", "equipment", "reports"],
    getOilChanges: ["oilchange", "equipment", "dashboard", "routines", "reports", "inventory"],
    getOilChangesForLp: ["oilchange", "equipment", "dashboard", "routines", "reports", "inventory"],
    getTopUpsForLp: ["oilchange", "equipment", "dashboard", "routines", "reports", "inventory"],
    getAllTopUps: ["oilchange", "equipment", "dashboard", "routines", "reports", "inventory"],
    getRecentSamples: ["oilreport", "tracker", "dashboard", "equipment", "reports", "upload"],
    getRoutines: ["routines", "mywork", "dashboard", "equipment"],
    getRoutine: ["routines", "mywork", "dashboard", "equipment"],
    getRoutineItems: ["routines", "mywork", "dashboard", "equipment"],
    getRouteTemplates: ["routines", "dashboard", "reports"],
    getSuggestions: ["routines", "actions"],
    getTeamWorkload: ["team"],
    getOilPlan: ["routines", "mywork", "inventory"],
    getMyWork: ["mywork"],
    getRoutesForLp: ["equipment", "routines"],
    getRoutinesOverview: ["routines", "dashboard", "reports"],
    getRoutineCompletionTrend: ["routines", "dashboard", "reports"],
    getOilInventory: ["inventory", "dashboard", "reports"],
    getOilInventoryMovements: ["inventory", "dashboard", "reports"],
    getAllOilInventoryMovements: ["inventory", "dashboard", "reports"],
    getOilInventoryForecast: ["inventory", "dashboard", "reports"],
    getOilInventoryConsumption: ["inventory", "dashboard", "reports"],
    getAuditTrail: ["activity", "equipment", "routines", "inventory"],
  },

  // Sections of the start-up bundle (readAll / getStartupBundle /
  // getChanges) → tabs that show them. A section is only emptied when every
  // one of its tabs is Hidden for that person.
  sectionTabs: {
    samples: ["dashboard", "equipment", "oilreport", "upload", "tracker", "reports"],
    actions: ["dashboard", "equipment", "actions", "reports", "oilreport"],
    oilChanges: ["dashboard", "equipment", "oilchange", "reports", "routines", "inventory"],
    tracker: ["dashboard", "tracker", "reports", "routines", "equipment"],
    equipment: MA_ANY_OIL_TAB,
    actionPhrases: ["actions", "settings", "upload", "oilreport"],
  },

  // POST action → "open", "admin", a list of tabs (Edit on any one of them
  // is enough), or a function of the request returning one of those.
  // Not listed = any member, outside Maintenance.
  writeRules: {
    markNotificationRead: "open",
    markAllNotificationsRead: "open",
    append: maOilGenericSheetTabs_,
    updateRow: maOilGenericSheetTabs_,
    deleteRow: maOilGenericSheetTabs_,
    updateSampleTracker: ["tracker", "upload", "oilreport", "routines"],
    createRoutine: ["routines", "actions"],
    updateRoutine: ["routines"],
    setRoutineStatus: ["routines"],
    assignRoutineTechnician: ["routines"],
    approveRoutine: ["routines"],
    returnRoutine: ["routines"],
    requestActionClosure: ["actions"],
    decideActionClosure: ["actions"],
    closeAction: ["actions"],
    rescheduleAction: ["actions"],
    validateLabReport: ["oilreport", "upload", "tracker"],
    setProductLowStockLevel: ["inventory"],
    setOilEquivalent: ["inventory"],
    returnLabReport: ["oilreport", "upload", "tracker"],
    fillLabInfo: ["upload"],
    rescheduleRoutine: ["routines"],
    addRoutineComment: ["routines", "mywork"],
    submitRoutineItem: ["routines", "mywork"],
    submitRoutine: ["routines", "mywork"],
    createRouteTemplate: ["routines"],
    setRouteTemplateStatus: ["routines"],
    deleteRouteTemplate: ["routines"],
    addOilProduct: ["inventory"],
    updateOilProduct: ["inventory"],
    logOilMovement: ["inventory"],
    logOilChangeEvent: ["oilchange", "routines"],
    logOilTopUp: ["oilchange", "routines"],
    deleteRoutine: "admin",
    updateNotificationSettings: "admin",
    setModuleResponsibility: "admin",
    maSetStatus: "admin",
    maAddPeople: "admin",
    maRemovePerson: "admin",
    maSetTabLevel: "admin",
  },
};

function maOilGenericSheetTabs_(data) {
  switch (data.sheet) {
    case "Data_Entry": return ["upload", "oilreport", "tracker"];
    case "Action Tracker": return ["actions", "oilreport", "upload", "equipment"];
    case "OL_ACTION_PHRASES": return ["settings", "actions"];
    case "Equipment Registry": return ["equipment", "settings"];
    default: return "admin";
  }
}

// One-time import (first use only — see maEnsureSetup_): the people this
// module already sent alerts to, from the two lists Phase 0 replaces.
//   OL_NOTIFY_REVIEWERS        Contractor | Email                       (ACC row = ACC reviewer)
//   OL_MODULE_RESPONSIBILITIES Module | Contractor | Role | Email | DisplayName
function maImportLegacyPeople_() {
  var out = [];
  (maReadRows_("OL_NOTIFY_REVIEWERS") || []).forEach(function (r) {
    var contractor = String(r[0] || "").trim();
    var email = String(r[1] || "").trim();
    if (!email) return;
    if (contractor === "ACC") out.push({ email: email, contractor: "ACC", responsibility: MA_RESP.ACC });
    else if (contractor) out.push({ email: email, contractor: contractor, responsibility: MA_RESP.CONTRACTOR });
  });
  (maReadRows_("OL_MODULE_RESPONSIBILITIES") || []).forEach(function (r) {
    var role = String(r[2] || "").trim();
    var email = String(r[3] || "").trim();
    if (!email || role !== "Contractor Engineer") return;
    out.push({ email: email, displayName: String(r[4] || "").trim(), contractor: String(r[1] || "").trim(), responsibility: MA_RESP.CONTRACTOR });
  });
  return out;
}

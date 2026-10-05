// ─── Sheet names ────────────────────────────────────────────────────────
var SHEET_RMS           = '📥 RMS DATA';
var SHEET_SPM            = '📥 SPM DATA';
var SHEET_COMPLIANCE     = '📋 Compliance Tracker';
var SHEET_RMS_REG        = '⚙ RMS Register';
var SHEET_SPM_REG        = '⚙ SPM Register';
var SHEET_LAST_RMS       = '📋 Last RMS Reading';
var SHEET_LAST_SPM       = '📋 Last SPM Reading';
var SHEET_ACTIONS        = '📋 Action Tracker';
var SHEET_CONFIG         = 'Configuration';
var SHEET_VIB_REGISTRY   = 'VIB ID Registry'; // see VibRegistry.js

// ─── Header/data row config (1-based) ──────────────────────────────────
var SHEET_CFG = {};
SHEET_CFG[SHEET_RMS]          = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_SPM]          = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_COMPLIANCE]   = { headerRow: 3, dataStartRow: 4 };
SHEET_CFG[SHEET_RMS_REG]      = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_SPM_REG]      = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_LAST_RMS]     = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_LAST_SPM]     = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_ACTIONS]      = { headerRow: 5, dataStartRow: 6 };
SHEET_CFG[SHEET_CONFIG]       = { headerRow: 1, dataStartRow: 2 };
SHEET_CFG[SHEET_VIB_REGISTRY] = { headerRow: 1, dataStartRow: 2 };

function dataStartRowFor(sn) { var c=SHEET_CFG[sn]; return c?c.dataStartRow:2; }
function headerRowFor(sn)    { var c=SHEET_CFG[sn]; return c?c.headerRow:1; }

// ─── Action Tracker column headers (row 5) ─────────────────────────────
var ACTION_HEADERS = [
  'Action No','Equipment ID','Equipment Name','Line','Reading Date',
  'Trigger Type','Trigger Point','Trigger Value','Machine Status',
  'Revision Date','Action Status','Completion Date','Contractor',
  'Contractor Action','ACC Action','Agreed Action'
];

// ─── Severity ordering ──────────────────────────────────────────────────
// Shared by every "roll several readings up to one overall status" spot
// (Last Reading upserts, backfill, Dashboard aggregation on the client).
var STATUS_ORDER = { 'Good':1,'Normal':1,'Acceptable':2,'Caution':2,'Alarm':3,'Danger':4 };
function worstStatus(a, b) {
  return (STATUS_ORDER[a]||0) >= (STATUS_ORDER[b]||0) ? a : b;
}

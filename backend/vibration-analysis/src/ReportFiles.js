// ─── The contractor's own report file, kept with its Vibration Log report ──
// Uploaded when a report is imported (PDF or Word), stored in this script's
// Drive folder (never shared: people get it through the app, like Oil's lab
// PDFs) and listed on the report page for download.

var SHEET_VFILES = 'Vibration Report Files';
var VFILE_HEADERS = ['File key', 'Report ID', 'File name', 'Type', 'Size (KB)', 'Uploaded by', 'Uploaded at'];
var VFILE_FOLDER_PROP = 'VIB_REPORT_FOLDER_ID';
var VFILE_KEY_RE = /^VRF-[A-Za-z0-9-]{8,60}$/;
var VFILE_MAX_BYTES = 25 * 1024 * 1024;
var VFILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

function vfFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(VFILE_FOLDER_PROP);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder('Vibration - contractor reports (app)');
  props.setProperty(VFILE_FOLDER_PROP, folder.getId());
  return folder;
}

function vfDriveFile_(key) {
  var it = vfFolder_().getFilesByName(key);
  return it.hasNext() ? it.next() : null;
}

// The report's kept files: [{ key, name, type, sizeKb, by, at }]
function vfList_(ss, reportId) {
  return vlRead_(ss, SHEET_VFILES).rows.filter(function (r) { return r['Report ID'] === reportId; }).map(function (r) {
    return { key: r['File key'], name: r['File name'], type: r['Type'], sizeKb: r['Size (KB)'], by: r['Uploaded by'], at: String(r['Uploaded at'] || '') };
  });
}

// params: { reportId, fileKey: "VRF-<uuid>", fileName, base64 }. The same
// file name uploaded again to the report replaces the earlier copy.
function handleSaveVibReportFile(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var id = String(params.reportId || '');
  var rep = vlFindReport_(ss, id).rep;
  if (!rep) return { status: 'error', error: 'Report not found: ' + id };
  if (me.contractor && rep['Contractor'] !== me.contractor) return { status: 'error', error: 'This report belongs to another contractor.' };
  var wf = String(rep['Workflow status'] || '');
  if (!me.acc && wf !== 'Draft' && wf !== 'Returned') return { status: 'error', error: 'The report file can only be added while the report is a Draft or Returned.' };
  var key = String(params.fileKey || '').trim();
  if (!VFILE_KEY_RE.test(key)) return { status: 'error', error: 'Invalid report file key.' };
  var name = String(params.fileName || '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 150);
  var ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  ext = ext ? ext.toLowerCase() : '';
  if (!VFILE_TYPES[ext]) return { status: 'error', error: 'Only PDF or Word files can be kept with the report.' };
  var b64 = String(params.base64 || '');
  if (!b64) return { status: 'error', error: 'No file received.' };
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > VFILE_MAX_BYTES) return { status: 'error', error: 'The file is too large (over 25 MB).' };
  var head = String.fromCharCode(bytes[0] & 255, bytes[1] & 255, bytes[2] & 255, bytes[3] & 255);
  if (ext === 'pdf' && head !== '%PDF') return { status: 'error', error: name + ' is not a PDF.' };
  if (ext === 'docx' && head.slice(0, 2) !== 'PK') return { status: 'error', error: name + ' is not a Word (.docx) file.' };

  var folder = vfFolder_();
  var t = vlEnsure_(ss, SHEET_VFILES, VFILE_HEADERS);
  // same name again on this report: the new copy replaces the old one
  vlRead_(ss, SHEET_VFILES).rows.filter(function (r) { return r['Report ID'] === id && r['File name'] === name; })
    .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) {
      var old = vfDriveFile_(r['File key']);
      if (old) old.setTrashed(true);
      t.sheet.deleteRow(r._row);
    });
  if (!vfDriveFile_(key)) {
    var file = folder.createFile(Utilities.newBlob(bytes, VFILE_TYPES[ext], key));
    file.setDescription(name);
  }
  t.sheet.appendRow(vlRowFrom_(t.headers, {
    'File key': key, 'Report ID': id, 'File name': name, 'Type': ext.toUpperCase(),
    'Size (KB)': Math.round(bytes.length / 1024), 'Uploaded by': me.email, 'Uploaded at': vlNowIso_(),
  }));
  if (typeof VL_READ_MEMO !== 'undefined' && VL_READ_MEMO) delete VL_READ_MEMO[SHEET_VFILES];
  vlAudit_(ss, me.email, 'Report file kept', id, name);
  return { status: 'ok', reportId: id, files: vfList_(ss, id) };
}

// GET getVibReportFile: one kept file (base64) of a report this person can see.
function handleGetVibReportFile(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var id = String(params.reportId || '');
  var key = String(params.fileKey || '');
  var rep = vlFindReport_(ss, id).rep;
  if (!rep) return { status: 'error', error: 'Report not found: ' + id };
  if (me.contractor && rep['Contractor'] !== me.contractor) return { status: 'error', error: 'This report belongs to another contractor.' };
  var row = vfList_(ss, id).filter(function (f) { return f.key === key; })[0];
  if (!row) return { status: 'error', error: 'This file is not kept with the report.' };
  var file = vfDriveFile_(key);
  if (!file) return { status: 'error', error: 'The file is missing from the app\'s Drive folder.' };
  var ext = String(row.name.match(/\.([a-z0-9]+)$/i) ? row.name.match(/\.([a-z0-9]+)$/i)[1] : 'pdf').toLowerCase();
  return { status: 'ok', fileName: row.name, mime: VFILE_TYPES[ext] || 'application/octet-stream', base64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

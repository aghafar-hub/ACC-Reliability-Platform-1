/**
 * Nightly backup of the databases (audit I-03). Run from the Apps Script
 * editor only — not reachable from the web app.
 *
 *   1. Script Property BACKUP_SPREADSHEET_IDS: the IDs of the spreadsheets to
 *      copy, separated by commas (Platform Core, Oil, Vibration). Without it
 *      only the Platform Core spreadsheet is copied.
 *   2. Run installBackupTrigger once: a copy is made every night around 02:00.
 *      runBackupNow makes one at once.
 *
 * Copies go into the Drive folder "ACC Reliability — backups" of the account
 * that runs this (made on first use, shared with nobody). Copies older than
 * BACKUP_KEEP_DAYS are moved to the Drive bin. How to restore:
 * docs/backup-and-restore.md.
 */

var BACKUP_FOLDER_PROP = 'BACKUP_FOLDER_ID';
var BACKUP_KEEP_DAYS = 14;

function backupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(BACKUP_FOLDER_PROP);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  var folder = DriveApp.createFolder('ACC Reliability — backups');
  props.setProperty(BACKUP_FOLDER_PROP, folder.getId());
  return folder;
}

function backupSpreadsheetIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('BACKUP_SPREADSHEET_IDS') || getSpreadsheetId_();
  return String(raw).split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

function runBackupNow() {
  var folder = backupFolder_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd HHmm');
  var done = [];
  backupSpreadsheetIds_().forEach(function (id) {
    try {
      var file = DriveApp.getFileById(id);
      file.makeCopy(file.getName() + ' — backup ' + stamp, folder);
      done.push(file.getName());
    } catch (e) {
      done.push('FAILED ' + id + ': ' + e.message);
    }
  });
  // old copies to the bin (still restorable from there for 30 days)
  var cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getDateCreated().getTime() < cutoff && / — backup \d{4}-\d{2}-\d{2}/.test(f.getName())) f.setTrashed(true);
  }
  Logger.log('Backup ' + stamp + ': ' + done.join(' | '));
  return done;
}

function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runBackupNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runBackupNow').timeBased().everyDays(1).atHour(2).create();
  Logger.log('Nightly backup installed (about 02:00). Copies go to the Drive folder "ACC Reliability — backups".');
}

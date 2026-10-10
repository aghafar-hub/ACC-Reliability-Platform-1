// ─── Action Tracker — READ ──────────────────────────────────────────────
function handleReadActions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {status:'ok', actions: readActionsRaw(ss)};
}

function readActionsRaw(ss) {
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return [];
  var cfg       = SHEET_CFG[SHEET_ACTIONS];
  var dataStart = cfg.dataStartRow; // row 6
  var lastRow   = sheet.getLastRow();
  var lastCol   = Math.max(sheet.getLastColumn(), ACTION_HEADERS.length);
  if (lastRow < dataStart) return [];

  var tz   = Session.getScriptTimeZone() || 'UTC';
  var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues();
  var out  = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    var obj = {};
    for (var h = 0; h < ACTION_HEADERS.length; h++) {
      var val = row[h];
      if (val instanceof Date) val = Utilities.formatDate(val, tz, "yyyy-MM-dd'T'HH:mm:ss");
      obj[ACTION_HEADERS[h]] = val;
    }
    obj._rowNum = dataStart + i;
    out.push(obj);
  }
  return out;
}

// Returns the highest action number currently in the sheet (e.g. "V-006")
// so the app can generate the next number fresh from the sheet.
function handleReadLastActionNo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'ok', lastNo:'V-000', nextNo:'V-001'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS); // row 6
  var lastRow   = sheet.getLastRow();
  var maxNum    = 0;

  if (lastRow >= dataStart) {
    var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var val = String(data[i][0]||'').trim();
      var m   = val.match(/^V-(\d+)$/i);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }

  var nextNum  = maxNum + 1;
  var lastNoStr = 'V-' + String(maxNum).padStart(3, '0');
  var nextNoStr = 'V-' + String(nextNum).padStart(3, '0');
  return {status:'ok', lastNo: lastNoStr, nextNo: nextNoStr, maxNum: maxNum};
}

// ─── Action Tracker — APPEND ────────────────────────────────────────────
// Always appends after the last occupied row (row 6+ data start)
function handleAppendAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);

  // Auto-create sheet with headers if missing
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACTIONS);
    // Rows 1-4 blank, row 5 = headers
    sheet.getRange(5, 1, 1, ACTION_HEADERS.length).setValues([ACTION_HEADERS]);
  }

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) actionNo = generateActionNo(sheet);

  var row = buildActionRow(params, actionNo);
  // appendRow always adds after last row — correct behaviour
  sheet.appendRow(row);
  return {status:'ok', action:'appendAction', actionNo:actionNo, rowNum:sheet.getLastRow()};
}

// ─── Action Tracker — UPDATE ────────────────────────────────────────────
function handleUpdateAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'error', error:'Action Tracker sheet not found'};

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) return {status:'error', error:'Action No required for update'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var idx = findRowIndex(sheet, [0], [actionNo], dataStart);
  if (idx===-1) return {status:'error', error:'Action not found: '+actionNo};

  var row = buildActionRow(params, actionNo);
  sheet.getRange(idx, 1, 1, row.length).setValues([row]);
  return {status:'ok', action:'updateAction', actionNo:actionNo, rowNum:idx};
}

// ─── Action Tracker — DELETE ────────────────────────────────────────────
function handleDeleteAction(params) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ACTIONS);
  if (!sheet) return {status:'error', error:'Action Tracker sheet not found'};

  var actionNo = String(params['Action No']||'').trim();
  if (!actionNo) return {status:'error', error:'Action No required for delete'};

  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var idx = findRowIndex(sheet, [0], [actionNo], dataStart);
  if (idx===-1) return {status:'error', error:'Action not found: '+actionNo};

  sheet.deleteRow(idx);
  return {status:'ok', action:'deleteAction', actionNo:actionNo};
}

// ─── Action Tracker — SEND EMAIL ────────────────────────────────────────
// params: recipients (JSON array), plus either one action's fields or an
// `actions` JSON array of several, formatted as one combined report email.
function handleSendActionEmail(params) {
  try {
    var recipients = JSON.parse(params.recipients || '[]');
    if (!recipients || recipients.length === 0) return {status:'error', error:'No recipients'};

    // Support single action OR array of actions
    var actionsArr = [];
    if (params.actions) {
      actionsArr = JSON.parse(params.actions);
    } else {
      // Single action (legacy)
      actionsArr = [{
        actionNo:       params['Action No']      || params.actionNo      || '',
        equipmentId:    params['Equipment ID']   || params.equipmentId   || '',
        equipmentName:  params['Equipment Name'] || params.equipmentName || '',
        line:           params['Line']           || params.line          || '',
        readingDate:    params['Reading Date']   || params.readingDate   || '',
        triggerType:    params['Trigger Type']   || params.triggerType   || '',
        triggerPoint:   params['Trigger Point']  || params.triggerPoint  || '',
        triggerValue:   params['Trigger Value']  || params.triggerValue  || '',
        machineStatus:  params['Machine Status'] || params.machineStatus || '',
        revisionDate:   params['Revision Date']  || params.revisionDate  || '',
        actionStatus:   params['Action Status']  || params.actionStatus  || '',
        contractor:     params['Contractor']     || params.contractor    || '',
        agreedAction:   params['Agreed Action']  || params.agreedAction  || '',
        accAction:      params['ACC Action']     || params.accAction     || '',
      }];
    }

    var filterDesc = params.filterDesc || '';
    var subject = 'Vibration Action Tracker Report' + (filterDesc ? ' — ' + filterDesc : '') + ' | Arabian Cement';

    var body = 'Dear Team,\n\n';
    body += 'Please find below the vibration action items' + (filterDesc ? ' filtered by: ' + filterDesc : '') + ':\n\n';
    body += '══════════════════════════════════════════════\n';

    for (var i = 0; i < actionsArr.length; i++) {
      var a = actionsArr[i];
      body += 'ACTION ' + (i + 1) + ' of ' + actionsArr.length + '\n';
      body += '──────────────────────────────────────\n';
      body += 'Action No       : ' + (a.actionNo||'')       + '\n';
      body += 'Equipment ID    : ' + (a.equipmentId||'')    + '\n';
      body += 'Equipment Name  : ' + (a.equipmentName||'')  + '\n';
      body += 'Line            : ' + (a.line||'')           + '\n';
      body += 'Reading Date    : ' + (a.readingDate||'')    + '\n';
      body += 'Machine Status  : ' + (a.machineStatus||'')  + '\n';
      body += 'Trigger Type    : ' + (a.triggerType||'')    + '\n';
      body += 'Trigger Point   : ' + (a.triggerPoint||'')   + '\n';
      body += 'Trigger Value   : ' + (a.triggerValue||'')   + '\n';
      body += 'Agreed Action   : ' + (a.agreedAction||'')   + '\n';
      body += 'ACC Action      : ' + (a.accAction||'')      + '\n';
      body += 'Contractor      : ' + (a.contractor||'')     + '\n';
      body += 'Revision Date   : ' + (a.revisionDate||'')   + '\n';
      body += 'Action Status   : ' + (a.actionStatus||'')   + '\n';
      body += '\n';
    }

    body += '══════════════════════════════════════════════\n\n';
    body += 'Total Actions: ' + actionsArr.length + '\n\n';
    body += 'Authorized by: aghafar@arabiancementcompany.com\n';
    body += 'Arabian Cement Company — Condition Monitoring Department\n';
    body += 'Generated automatically by Vibration & Condition Monitoring System';

    for (var r = 0; r < recipients.length; r++) {
      var email = String(recipients[r]).trim();
      if (email) msSendMail_({ to: email, subject: subject, body: body });
    }

    return {status:'ok', action:'sendActionEmail', sent:recipients.length, count:actionsArr.length};
  } catch(err) {
    return {status:'error', error:String(err)};
  }
}

// ─── generateActionNo ───────────────────────────────────────────────────
function generateActionNo(sheet) {
  var dataStart = dataStartRowFor(SHEET_ACTIONS);
  var lastRow   = sheet.getLastRow();
  var maxNum    = 0;
  if (lastRow >= dataStart) {
    var data = sheet.getRange(dataStart, 1, lastRow - dataStart + 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var val = String(data[i][0]||'').trim();
      var m   = val.match(/^V-(\d+)$/i);
      if (m) { var n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    }
  }
  return 'V-' + String(maxNum + 1).padStart(3, '0');
}

// ─── buildActionRow ─────────────────────────────────────────────────────
function buildActionRow(params, actionNo) {
  return [
    actionNo,
    params['Equipment ID']     || params.equipmentId     || '',
    params['Equipment Name']   || params.equipmentName   || '',
    params['Line']             || params.line            || '',
    params['Reading Date']     || params.readingDate     || '',
    params['Trigger Type']     || params.triggerType     || '',
    params['Trigger Point']    || params.triggerPoint    || '',
    params['Trigger Value']    || params.triggerValue    || '',
    params['Machine Status']   || params.machineStatus   || '',
    params['Revision Date']    || params.revisionDate    || '',
    params['Action Status']    || params.actionStatus    || 'Open',
    params['Completion Date']  || params.completionDate  || '',
    params['Contractor']       || params.contractor      || '',
    params['Contractor Action']|| params.contractorAction|| '',
    params['ACC Action']       || params.accAction       || '',
    params['Agreed Action']    || params.agreedAction    || '',
  ];
}

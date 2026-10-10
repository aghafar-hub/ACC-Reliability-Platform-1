// ─── In-app notifications (the platform's bell) ──────────────────────────
// The same moments Vibration already emails about (report sent / approved /
// returned, findings → actions, action steps, route assigned / submitted /
// returned / confirmed / cancelled) also land in the bell at the top of the
// platform. One row per person, so each has their own read / unread state.
// A person only ever reads or marks their own rows (email from the session).
//
// Link page: 'log' / 'actions' / 'routes' open that Vibration page (with the
// record); 'mywork-route' opens the technician checklist in My Work.

var SHEET_VNOTIF = 'Vibration Notifications';
var VNOTIF_HEADERS = ['Notification ID', 'Recipient', 'Type', 'Message', 'Contractor', 'Link page', 'Link record', 'Created at', 'Read', 'Read at'];

function vnAdd_(ss, emails, type, message, contractor, linkPage, linkRecord, me) {
  try {
    var mine = String((me && me.email) || '').toLowerCase();
    var list = [];
    (emails || []).forEach(function (e) {
      e = String(e || '').trim().toLowerCase();
      if (e && e !== mine && list.indexOf(e) === -1) list.push(e);
    });
    if (!list.length) return;
    var t = vlEnsure_(ss, SHEET_VNOTIF, VNOTIF_HEADERS);
    var now = vlNowIso_();
    var rows = list.map(function (e) {
      return vlRowFrom_(t.headers, { 'Notification ID': 'VN-' + Utilities.getUuid(), 'Recipient': e, 'Type': type, 'Message': message,
        'Contractor': contractor || '', 'Link page': linkPage || '', 'Link record': linkRecord || '', 'Created at': now, 'Read': 'No', 'Read at': '' });
    });
    t.sheet.getRange(t.sheet.getLastRow() + 1, 1, rows.length, t.headers.length).setValues(rows);
  } catch (e) { /* a notification never breaks the step that raised it */ }
}

function handleGetVibNotifications(params, session) {
  var email = String((session && session.email) || '').toLowerCase();
  if (!email) return { status: 'ok', notifications: [], unreadCount: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var limit = Math.max(1, Math.min(100, parseInt(params.limit, 10) || 30));
  var mine = vlRead_(ss, SHEET_VNOTIF).rows.filter(function (r) { return String(r['Recipient']).toLowerCase() === email; });
  var unread = mine.filter(function (r) { return r['Read'] !== 'Yes'; }).length;
  var list = mine.reverse().slice(0, limit).map(function (r) {
    return { notificationId: r['Notification ID'], type: r['Type'], message: r['Message'], contractor: r['Contractor'],
      linkPage: r['Link page'], linkRecordId: r['Link record'], createdDate: String(r['Created at']), read: r['Read'] === 'Yes' };
  });
  return { status: 'ok', notifications: list, unreadCount: unread };
}

// params: { notificationId } — or { all: true } for every unread row of the caller
function handleMarkVibNotificationsRead(params, session) {
  var email = String((session && session.email) || '').toLowerCase();
  if (!email) return { status: 'error', error: 'Sign in first.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var t = vlRead_(ss, SHEET_VNOTIF);
  var all = params.all === true || params.all === 'true';
  var id = String(params.notificationId || '');
  var now = vlNowIso_();
  var n = 0;
  t.rows.forEach(function (r) {
    if (String(r['Recipient']).toLowerCase() !== email || r['Read'] === 'Yes') return;
    if (!all && r['Notification ID'] !== id) return;
    r['Read'] = 'Yes'; r['Read at'] = now;
    t.sheet.getRange(r._row, 1, 1, t.headers.length).setValues([vlRowFrom_(t.headers, r)]);
    n++;
  });
  return { status: 'ok', marked: n };
}

// ModuleAccess.js calls this for delegation notices (started / ended):
// bell + email. Opens My Work.
function maNotify_(emails, subject, body, contractor) {
  vnAdd_(SpreadsheetApp.getActiveSpreadsheet(), emails, 'delegation', subject, contractor, 'mywork', '', null);
  try { msSendMail_({ to: emails.join(','), subject: subject, body: body + '\n\nOpen the ACC Reliability Platform → My Work.' }, 'platform:delegation'); } catch (e) {}
}

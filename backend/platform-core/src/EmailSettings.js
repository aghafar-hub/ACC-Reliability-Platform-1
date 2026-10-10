/**
 * Email & notifications (Settings → Email & notifications, App Owner only).
 *
 * One platform sender address sends for every module. Everything is OFF
 * until the App Owner adds that address and switches "Send emails" on; the
 * bell in the app is not affected. Who receives an email comes from Module
 * Access (responsible engineers, managers, technicians).
 *
 * EMAIL_SETTINGS (made on the first save): Key | Value | Updated_By | Updated_At
 *   senderEmail, senderName, enabled (TRUE/FALSE), digestTime (HH:MM),
 *   event:<module>:<event> = '', 'email', 'digest' or 'email,digest'
 *
 * Modules ask emailAllowed_(module, event) before sending (later step);
 * until then nothing here sends anything.
 */

var EM_SHEET = 'EMAIL_SETTINGS';
var EM_MODULES = [
  { id: 'oil-analysis', name: 'Oil', events: [
    { key: 'routeAssigned', label: 'Route assigned / returned', to: 'to the technician and contractor engineer' },
    { key: 'routeApproval', label: 'Route waiting for approval', to: 'to the ACC responsible engineer' },
    { key: 'labAlert', label: 'Lab report in Alert', to: 'to ACC + contractor responsible engineers' },
    { key: 'actionOverdue', label: 'Action overdue', to: 'to the owner and their manager' },
    { key: 'closureRequested', label: 'Closure requested', to: 'to the ACC responsible engineer' },
    { key: 'lowStock', label: 'Oil low in stock', to: 'to the contractor engineer' },
  ] },
  { id: 'vibration-analysis', name: 'Vibration', events: [
    { key: 'routeAssigned', label: 'Route assigned / returned', to: 'to the technician and contractor engineer' },
    { key: 'routeApproval', label: 'Route waiting for approval', to: 'to the ACC responsible engineer' },
    { key: 'readingAlert', label: 'Reading above the alarm limit', to: 'to ACC + contractor responsible engineers' },
    { key: 'reportDue', label: 'Report not written in 45 days', to: 'to the contractor responsible engineer' },
    { key: 'actionOverdue', label: 'Action overdue', to: 'to the owner and their manager' },
    { key: 'closureRequested', label: 'Closure requested', to: 'to the ACC responsible engineer' },
  ] },
  { id: 'platform', name: 'Platform', events: [
    { key: 'delegation', label: 'Delegation started / ended', to: 'to both people' },
    { key: 'idCheck', label: 'Equipment IDs not matching', to: 'to the App Owner' },
    { key: 'newAccount', label: 'New account / password reset', to: 'to that person' },
  ] },
];
var EM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emRead_() {
  var out = { senderEmail: '', senderName: 'ACC Reliability Platform', enabled: false, digestTime: '07:00', events: {}, changed: {} };
  EM_MODULES.forEach(function (m) {
    out.events[m.id] = {};
    m.events.forEach(function (e) { out.events[m.id][e.key] = { email: false, digest: false }; });
  });
  try {
    var sh = SpreadsheetApp.openById(getSpreadsheetId_()).getSheetByName(EM_SHEET);
    if (!sh) return out;
    readSheetAsObjects_(sh).forEach(function (r) {
      var k = String(r.Key || '').trim(), v = String(r.Value === undefined ? '' : r.Value).trim();
      var stamp = { by: String(r.Updated_By || ''), at: r.Updated_At instanceof Date ? r.Updated_At.toISOString() : String(r.Updated_At || '') };
      if (k === 'senderEmail' || k === 'senderName' || k === 'digestTime') { out[k] = v; out.changed[k] = stamp; }
      else if (k === 'enabled') { out.enabled = v.toUpperCase() === 'TRUE'; out.changed.enabled = stamp; }
      else if (k.indexOf('event:') === 0) {
        var parts = k.split(':');
        var ev = (out.events[parts[1]] || {})[parts[2]];
        if (ev) { ev.email = /email/.test(v); ev.digest = /digest/.test(v); out.changed.events = stamp; }
      }
    });
  } catch (e) { /* defaults */ }
  return out;
}

/** App Owner: the settings and the event list. */
function getEmailSettings_(session) {
  requireAppAdmin_(session.userId);
  var s = emRead_();
  s.modules = EM_MODULES;
  return s;
}

/**
 * App Owner. body.part: 'sender' { senderEmail, senderName } | 'switch' { enabled }
 * | 'events' { events: { module: { event: { email, digest } } }, digestTime }
 */
function saveEmailSettings_(session, body) {
  requireAppAdmin_(session.userId);
  var by = session.email || session.userId;
  var part = String(body.part || '');
  return withLock_(function () {
    var before = emRead_();
    var set = {};
    var details;
    if (part === 'sender') {
      var email = String(body.senderEmail || '').trim().toLowerCase();
      if (email && !EM_EMAIL_RE.test(email)) throw new Error('"' + email + '" is not an email address.');
      var name = String(body.senderName || '').trim() || 'ACC Reliability Platform';
      set.senderEmail = email;
      set.senderName = name;
      if (!email) set.enabled = 'FALSE'; // no sender → nothing can be sent
      details = 'Sender: ' + (before.senderEmail || 'not set') + ' → ' + (email || 'not set') + (name !== before.senderName ? '; name: ' + name : '');
    } else if (part === 'switch') {
      var on = body.enabled === true || String(body.enabled).toUpperCase() === 'TRUE';
      if (on && !before.senderEmail) throw new Error('Add the platform sender address first.');
      set.enabled = on ? 'TRUE' : 'FALSE';
      details = 'Send emails: ' + (before.enabled ? 'On' : 'Off') + ' → ' + (on ? 'On' : 'Off');
    } else if (part === 'events') {
      var t = String(body.digestTime || '07:00').trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('Digest time must look like 07:00.');
      set.digestTime = t;
      var changes = [];
      EM_MODULES.forEach(function (m) {
        m.events.forEach(function (e) {
          var x = ((body.events || {})[m.id] || {})[e.key] || {};
          var v = [x.email ? 'email' : '', x.digest ? 'digest' : ''].filter(String).join(',');
          set['event:' + m.id + ':' + e.key] = v;
          var b = before.events[m.id][e.key];
          var bv = [b.email ? 'email' : '', b.digest ? 'digest' : ''].filter(String).join(',');
          if (bv !== v) changes.push(m.name + ' · ' + e.label + ': ' + (bv || 'off') + ' → ' + (v || 'off'));
        });
      });
      if (t !== before.digestTime) changes.push('Digest time: ' + before.digestTime + ' → ' + t);
      details = changes.join('; ');
    } else {
      throw new Error('Unknown part: ' + part);
    }
    emWrite_(set, by);
    if (details) platformLog_(by, 'Email & notifications', part === 'events' ? 'What is sent' : part === 'sender' ? 'Platform sender' : 'Send emails', 'Changed', details);
    return getEmailSettings_(session);
  });
}

function emWrite_(set, by) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sh = ss.getSheetByName(EM_SHEET);
  if (!sh) {
    sh = ss.insertSheet(EM_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['Key', 'Value', 'Updated_By', 'Updated_At']]);
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  var keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  var now = new Date();
  Object.keys(set).forEach(function (k) {
    var i = keys.indexOf(k);
    var row = [k, set[k], by, now];
    if (i === -1) { sh.appendRow(row); keys.push(k); }
    else sh.getRange(i + 2, 1, 1, 4).setValues([row]);
  });
}

/** For senders (later): is this email allowed now? kind: 'email' | 'digest' */
function emailAllowed_(moduleId, eventKey, kind) {
  var s = emRead_();
  if (!s.enabled || !s.senderEmail) return false;
  var e = (s.events[moduleId] || {})[eventKey];
  return !!(e && e[kind || 'email']);
}

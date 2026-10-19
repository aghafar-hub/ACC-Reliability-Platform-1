// ─── Comments on actions ───────────────────────────────────────────────────
// Anyone who can see an action can add a comment to it (Visitors read only).
// Each comment keeps who wrote it (name, organisation, role) and when, so
// the thread shows every person's comments apart. The author (or the Admin)
// can delete their own comment; it is kept in the sheet, marked Deleted.
// The people on the action (owner, creator, earlier commenters) get an
// in-app notice. Same file in the Oil and Vibration backends; only the glue
// at the bottom differs.

var ACM_HEADERS = ['Comment ID', 'Action key', 'Author email', 'Author name', 'Organisation', 'Role', 'Comment', 'Created at', 'Deleted'];
var ACM_MAX = 2000;
var ACM_ROLE = { 'ROLE-ADMIN': 'Admin', 'ROLE-MGR': 'ACC Manager', 'ROLE-RENG': 'ACC Engineer', 'ROLE-CMGR': 'Contractor Manager', 'ROLE-CENG': 'Contractor Engineer', 'ROLE-TECH': 'Technician', 'ROLE-VIEW': 'Visitor' };

function acmSheet_(ss) {
  var sh = ss.getSheetByName(ACM_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ACM_SHEET);
    sh.getRange(1, 1, 1, ACM_HEADERS.length).setValues([ACM_HEADERS]);
  }
  return sh;
}

function acmRows_(ss) {
  var sh = ss.getSheetByName(ACM_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(1, 1, sh.getLastRow(), ACM_HEADERS.length).getValues();
  var head = vals[0].map(function (h) { return String(h || '').trim(); });
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = vals[i][j]; });
    if (!String(o['Comment ID'] || '')) continue;
    out.push(o);
  }
  return out;
}

function acmOut_(r, me) {
  var at = r['Created at'];
  return {
    id: String(r['Comment ID']), key: String(r['Action key']), email: String(r['Author email'] || ''),
    name: String(r['Author name'] || '') || String(r['Author email'] || '').split('@')[0],
    org: String(r['Organisation'] || ''), role: String(r['Role'] || ''), text: String(r['Comment'] || ''),
    at: at instanceof Date ? at.toISOString() : String(at || ''),
    mine: !!me && String(r['Author email'] || '').toLowerCase() === String(me || '').toLowerCase(),
  };
}

// The thread of one action, oldest first (deleted ones left out).
function acmList_(ss, key, myEmail) {
  return acmRows_(ss).filter(function (r) { return String(r['Action key']) === key && String(r['Deleted'] || '') !== 'Yes'; })
    .map(function (r) { return acmOut_(r, myEmail); })
    .sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
}

// { actionKey: number of comments } for the action cards.
function acmCounts_(ss) {
  var c = {};
  acmRows_(ss).forEach(function (r) {
    if (String(r['Deleted'] || '') === 'Yes') return;
    var k = String(r['Action key']);
    c[k] = (c[k] || 0) + 1;
  });
  return c;
}

function acmIsVisitor_(session) {
  var roles = (session && session.roles) || [];
  return roles.length > 0 && roles.every(function (r) { return r === 'ROLE-VIEW'; });
}

function acmAuthorName_(email) {
  try {
    var p = maLoadConfig_().people.filter(function (x) { return String(x.email).toLowerCase() === String(email).toLowerCase(); })[0];
    if (p && p.displayName) return p.displayName;
  } catch (e) {}
  return String(email || '').split('@')[0];
}

// params: { actionKey, text } → { status, comments }
function acmAdd_(ss, session, params) {
  var key = String(params.actionKey || '').trim();
  var text = String(params.text || '').replace(/\r\n/g, '\n').trim();
  if (!session || !session.email) return { status: 'error', error: 'Sign in to comment.' };
  if (acmIsVisitor_(session)) return { status: 'error', error: 'Visitors can read comments but not add them.' };
  if (!text) return { status: 'error', error: 'Write the comment first.' };
  if (text.length > ACM_MAX) return { status: 'error', error: 'The comment is too long (' + ACM_MAX + ' characters at most).' };
  var act = acmAction_(ss, key);
  if (!act) return { status: 'error', error: 'Action not found: ' + key };
  var mine = acmOrg_(session);
  if (mine !== 'ACC' && act.contractor && act.contractor !== mine) return { status: 'error', error: 'This action belongs to another contractor.' };
  var roles = session.roles || [];
  var role = roles.map(function (r) { return ACM_ROLE[r]; }).filter(Boolean)[0] || '';
  var id = 'CM-' + Utilities.getUuid().slice(0, 8);
  var now = new Date().toISOString();
  var name = acmAuthorName_(session.email);
  acmSheet_(ss).appendRow([id, key, session.email, name, mine, role, text, now, '']);
  // tell the people on this action (not the author)
  try {
    var to = {};
    (act.people || []).concat(acmList_(ss, key).map(function (c) { return c.email; })).forEach(function (e) {
      e = String(e || '').trim().toLowerCase();
      if (e && e.indexOf('@') > 0 && e !== String(session.email).toLowerCase()) to[e] = true;
    });
    var who = Object.keys(to);
    if (who.length) acmNotify_(ss, who, name + ' commented on ' + act.label + ': ' + (text.length > 120 ? text.slice(0, 117) + '…' : text), act.contractor, key, session);
  } catch (e) {}
  return { status: 'ok', comments: acmList_(ss, key, session.email) };
}

// params: { commentId } — the author or the Admin.
function acmDelete_(ss, session, params) {
  var id = String(params.commentId || '').trim();
  var r = acmRows_(ss).filter(function (x) { return String(x['Comment ID']) === id; })[0];
  if (!r) return { status: 'error', error: 'Comment not found.' };
  var own = session && String(r['Author email']).toLowerCase() === String(session.email || '').toLowerCase();
  if (!own && !(session && maIsAdmin_(session))) return { status: 'error', error: 'Only the person who wrote a comment can delete it.' };
  acmSheet_(ss).getRange(r._row, ACM_HEADERS.indexOf('Deleted') + 1).setValue('Yes');
  return { status: 'ok', comments: acmList_(ss, String(r['Action key']), session && session.email) };
}

// ─── Vibration glue ────────────────────────────────────────────────────────
// A Vibration action is its Action ID.
var ACM_SHEET = 'Vibration Action Comments';

function acmAction_(ss, key) {
  var r = vaFind_(ss, String(key || '').trim());
  if (!r) return null;
  return {
    contractor: String(r['Contractor'] || ''),
    label: r['Action ID'] + ' (' + r['Equipment ID'] + ')',
    people: [r['Owner'], r['Created by'], r['Closure requested by'], r['Closed by']],
  };
}

function acmOrg_(session) {
  return vlActor_(session).contractor || 'ACC';
}

function acmNotify_(ss, emails, message, contractor, key, session) {
  vnAdd_(ss, emails, 'Comment', message, contractor, 'actions', key, vlActor_(session));
}

// GET getVibActionComments: { actionId } → the thread.
function handleGetVibActionComments(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = vlActor_(session);
  var key = String(params.actionId || '').trim();
  var act = acmAction_(ss, key);
  if (!act) return { status: 'ok', comments: [] };
  if (me.contractor && act.contractor !== me.contractor) return { status: 'error', error: 'This action belongs to another contractor.' };
  return { status: 'ok', comments: acmList_(ss, key, me.email), canComment: !acmIsVisitor_(session) };
}

// POST addVibActionComment { actionId, text } / deleteVibActionComment { commentId }
function handleAddVibActionComment(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (session && maCheckRead_(session, 'getVibActions')) return { status: 'error', error: 'You do not have access to Vibration actions.' };
  var r = acmAdd_(ss, session, { actionKey: params.actionId, text: params.text });
  if (r.status === 'ok') vlAudit_(ss, session && session.email, 'Comment added', String(params.actionId || ''), String(params.text || '').slice(0, 200));
  return r;
}
function handleDeleteVibActionComment(params, session) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = acmDelete_(ss, session, params);
  if (r.status === 'ok') vlAudit_(ss, session && session.email, 'Comment deleted', String(params.commentId || ''), '');
  return r;
}

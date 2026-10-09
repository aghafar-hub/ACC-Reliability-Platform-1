// ─── Read cache (speed) ─────────────────────────────────────────────────────
// The heavy reads (dashboard, tracker, equipment, log…) read thousands of
// rows each time. Their answers are kept in the script cache, gzipped, until
// anything changes:
//   - every write through this app bumps the data version (Code.js);
//   - a hand edit in the spreadsheet bumps it too (onEdit, Triggers.js);
//   - "Sync" in the app asks with fresh=1 and skips the cache;
//   - the key carries today's date, so due / overdue states never go stale
//     overnight, and an entry lives VC_TTL seconds at most.
// The key also carries who is asking: the same answer is shared by everyone
// with the same contractor and approval rights (VC_GROUP), and kept per
// person where the answer is personal (VC_PERSONAL).
//
// Inside one request each sheet is read once (VL_READ_MEMO in vlRead_).

var VC_GROUP = ['getVibDashboard', 'getVibEquipmentSummary', 'getVibTracker', 'getVibLog', 'getVibLimits', 'getVibReport', 'getVibEquipmentHistory'];
var VC_PERSONAL = ['getStartupBundle', 'getVibActions', 'getVibRoutes', 'getVibActionHistory', 'getMyWork'];
var VC_TTL = 6 * 3600;
var VC_CHUNK = 90000;
var VC_VERSION_KEY = 'VIB_DATA_VERSION';
var VL_READ_MEMO = null;

function vcVersion_() {
  try { return PropertiesService.getScriptProperties().getProperty(VC_VERSION_KEY) || '0'; } catch (e) { return '0'; }
}

// Something changed: every cached answer is out of date.
function vcBump_() {
  try { PropertiesService.getScriptProperties().setProperty(VC_VERSION_KEY, Date.now() + '.' + Math.floor(Math.random() * 1e6)); } catch (e) {}
}

function vcKey_(action, params, session) {
  var personal = VC_PERSONAL.indexOf(action) !== -1;
  var who;
  if (personal) {
    who = session ? String(session.email || '').toLowerCase() : 'anon';
  } else {
    var me = vlActor_(session);
    who = [me.contractor || 'ACC', me.acc ? 1 : 0, me.canApprove ? 1 : 0, session && maIsAdmin_(session) ? 1 : 0].join('');
  }
  var p = [];
  Object.keys(params).sort().forEach(function (k) {
    if (k === 'sessionToken' || k === 'callback' || k === 'action' || k === 'fresh' || k === 'secret' || k === '_') return;
    p.push(k + '=' + params[k]);
  });
  var key = ['vc', vcVersion_(), peSig_(), vlToday_(), action, who, p.join('&')].join('|');
  return key.length > 240 ? key.slice(0, 200) + '#' + key.length + key.slice(-30) : key;
}

function vcGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var head = cache.get(key);
    if (!head) return null;
    var n = parseInt(head, 10);
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '#' + i);
    var parts = cache.getAll(keys);
    var b64 = '';
    for (var j = 0; j < n; j++) {
      if (parts[keys[j]] == null) return null;
      b64 += parts[keys[j]];
    }
    var json = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString();
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function vcPut_(key, result) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result), 'application/json')).getBytes());
    var parts = {};
    var n = Math.ceil(b64.length / VC_CHUNK);
    if (n > 40) return; // too big to be worth it
    for (var i = 0; i < n; i++) parts[key + '#' + i] = b64.slice(i * VC_CHUNK, (i + 1) * VC_CHUNK);
    var cache = CacheService.getScriptCache();
    cache.putAll(parts, VC_TTL);
    cache.put(key, String(n), VC_TTL);
  } catch (e) {}
}

// Wraps one read: from the cache when it can, otherwise worked out (each
// sheet read once) and kept.
function vcRead_(action, params, session, run) {
  var cacheable = VC_GROUP.indexOf(action) !== -1 || VC_PERSONAL.indexOf(action) !== -1;
  var key = cacheable ? vcKey_(action, params, session) : '';
  if (cacheable && String(params.fresh || '') !== '1') {
    var hit = vcGet_(key);
    if (hit) return hit;
  }
  VL_READ_MEMO = {};
  try {
    var result = run();
    if (cacheable && result && !result.error && result.status !== 'error') vcPut_(key, result);
    return result;
  } finally {
    VL_READ_MEMO = null;
  }
}

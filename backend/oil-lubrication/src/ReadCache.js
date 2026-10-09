// ─── Read cache (speed) ─────────────────────────────────────────────────────
// The reads pages and My Work make (routes, inventory, top-ups, My Work…)
// read whole sheets each time. Their answers are kept in the script cache,
// gzipped, per person, until anything changes:
//   - every POST (all writes) bumps the data version (Code.js doPost);
//   - a delegation bumps it (doGet, self actions);
//   - a hand edit in the spreadsheet bumps it (onEdit, SheetTriggers.js);
//   - the key carries today's date, and an entry lives RC_TTL seconds at
//     most (the daily jobs write without going through doPost);
//   - fresh=1 skips it.
// getChanges / getStartupBundle / readAll are not cached: the app's own sync
// already keeps that data on the device.

var RC_ACTIONS = ['getMyWork', 'getRoutines', 'getRoutinesOverview', 'getRouteTemplates', 'getSuggestions', 'getTeamWorkload',
  'getRoutineCompletionTrend', 'getOilInventory', 'getAllOilInventoryMovements', 'getOilInventoryForecast',
  'getOilInventoryConsumption', 'getAllTopUps', 'getDashboardSettings', 'getDashboard'];
var RC_TTL = 30 * 60;
var RC_CHUNK = 90000;
var RC_VERSION_KEY = 'OIL_DATA_VERSION';

function rcVersion_() {
  try { return PropertiesService.getScriptProperties().getProperty(RC_VERSION_KEY) || '0'; } catch (e) { return '0'; }
}

function rcBump_() {
  try { PropertiesService.getScriptProperties().setProperty(RC_VERSION_KEY, Date.now() + "." + Math.floor(Math.random() * 1e6)); } catch (e) {}
}

// '' when this read isn't cached.
function rcKey_(action, params, session) {
  if (RC_ACTIONS.indexOf(action) === -1) return '';
  var who = session ? String(session.email || '').toLowerCase() : 'anon';
  var p = [];
  Object.keys(params).sort().forEach(function (k) {
    if (['sessionToken', 'callback', 'action', 'fresh', 'secret', '_'].indexOf(k) !== -1) return;
    p.push(k + '=' + params[k]);
  });
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
  var key = ['rc', rcVersion_(), peSig_(), today, action, who, p.join('&')].join('|');
  return key.length > 240 ? key.slice(0, 200) + '#' + key.length + key.slice(-30) : key;
}

function rcGet_(key) {
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
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString());
  } catch (e) {
    return null;
  }
}

function rcPut_(key, result) {
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result), 'application/json')).getBytes());
    var n = Math.ceil(b64.length / RC_CHUNK);
    if (n > 40) return;
    var parts = {};
    for (var i = 0; i < n; i++) parts[key + '#' + i] = b64.slice(i * RC_CHUNK, (i + 1) * RC_CHUNK);
    var cache = CacheService.getScriptCache();
    cache.putAll(parts, RC_TTL);
    cache.put(key, String(n), RC_TTL);
  } catch (e) {}
}

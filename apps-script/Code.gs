/* =============================================================================
 * TUG//LAB — apps-script/Code.gs
 * Google Sheets receiver for TUG//LAB result uploads.
 *
 * Deploy (no install needed):
 *   1. Create a Google Sheet named "TUG Lab Data".
 *   2. Extensions -> Apps Script. Delete any code, paste THIS file.
 *   3. Deploy -> New deployment -> type "Web app".
 *      Execute as: Me.  Who has access: Anyone.
 *   4. Copy the /exec Web app URL into js/config.js -> CONFIG.sheets.webhookUrl.
 *   5. Re-deploy a NEW VERSION whenever you change this script.
 *
 * Writes tabs: Sessions, Steps, Events, (Frames if sent). Columns are matched by
 * NAME against the existing header row; unknown columns are appended. A
 * session_id already present in Sessions is ignored (returns status "duplicate").
 * String cells beginning with = + - @ are prefixed with ' to block formula
 * injection.
 * ========================================================================== */

var SCHEMA_VERSION = '1.0';

function doGet(e) {
  return json_({ status: 'active', service: 'tug-lab', schema: SCHEMA_VERSION });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ status: 'error', error: 'busy' });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var summary = body.summary || {};
    var sessionId = summary.session_id;
    if (!sessionId) return json_({ status: 'error', error: 'missing session_id' });

    // duplicate check against Sessions
    var sessions = getOrCreateSheet_(ss, 'Sessions');
    if (sessionIdExists_(sessions, sessionId)) {
      return json_({ status: 'duplicate', session_id: sessionId });
    }

    var rows = {};
    rows.Sessions = appendRow_(sessions, summary);
    rows.Steps = appendRows_(getOrCreateSheet_(ss, 'Steps'), body.steps || []);
    rows.Events = appendRows_(getOrCreateSheet_(ss, 'Events'), body.events || []);
    if (body.frames && body.frames.length) {
      rows.Frames = appendRows_(getOrCreateSheet_(ss, 'Frames'), body.frames);
    }
    return json_({ status: 'ok', rows: rows });
  } catch (err) {
    return json_({ status: 'error', error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function headerOf_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(function (h) { return h !== ''; });
}

function ensureColumns_(sh, keys) {
  var header = headerOf_(sh);
  var missing = [];
  keys.forEach(function (k) { if (header.indexOf(k) < 0) missing.push(k); });
  if (header.length === 0) {
    sh.getRange(1, 1, 1, keys.length).setValues([keys]);
    return keys.slice();
  }
  if (missing.length) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    header = header.concat(missing);
  }
  return header;
}

function sessionIdExists_(sh, sessionId) {
  var header = headerOf_(sh);
  var col = header.indexOf('session_id');
  if (col < 0 || sh.getLastRow() < 2) return false;
  var ids = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(sessionId)) return true;
  return false;
}

function sanitize_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function appendRow_(sh, obj) {
  var keys = Object.keys(obj);
  var header = ensureColumns_(sh, keys);
  var row = header.map(function (h) { return sanitize_(obj[h]); });
  sh.appendRow(row);
  return 1;
}

function appendRows_(sh, arr) {
  if (!arr || !arr.length) return 0;
  // union of keys across rows (plus existing header)
  var keySet = {};
  arr.forEach(function (o) { Object.keys(o).forEach(function (k) { keySet[k] = true; }); });
  var header = ensureColumns_(sh, Object.keys(keySet));
  var startRow = sh.getLastRow() + 1;
  var BATCH = 500;
  var written = 0;
  for (var i = 0; i < arr.length; i += BATCH) {
    var slice = arr.slice(i, i + BATCH);
    var values = slice.map(function (o) {
      return header.map(function (h) { return sanitize_(o[h]); });
    });
    sh.getRange(startRow + i, 1, values.length, header.length).setValues(values);
    written += values.length;
  }
  return written;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

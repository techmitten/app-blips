// Google Sheets as a small shared database for the sites AppBlips builds
// (Settings → Extensions → Google Sheets). No AppBlips server is involved:
//  - The user pastes SHEETS_SCRIPT into their own Google Sheet (Extensions →
//    Apps Script) and deploys it as a web app that runs as them and that
//    anyone can call. They paste its /exec URL into AppBlips.
//  - The AI only writes calls to window.SheetDB. Like the Pollinations helper,
//    it is added at preview/export time and never stored in `files`, so the
//    request code (and its CORS workaround) is always this exact code and the
//    URL never sits in the project's source.
//
// Each of the user's sites shares their one Sheet: a table is a tab, named
// after the site by the AI (the directive in prompts.js), and its header row
// holds the columns. Visitors can only add rows and read them; nothing is
// changed, removed or moderated (the owner never needs to open the Sheet).
// Columns whose names start with "_" are kept for the owner and never
// returned.

// A deployed web app's URL. Google Workspace accounts get the /a/macros/<domain>/
// form. Test deployments end in /dev and only work for their owner, so they
// don't count.
export const SHEETS_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]{1,253}|macros)\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
export const isSheetsScriptUrl = (url) => typeof url === 'string' && SHEETS_URL_RE.test(url.trim());

// Bumped when SHEETS_SCRIPT changes in a way the helper depends on; the
// script reports it on 'ping' so Settings can ask the user to update it.
export const SHEETS_SCRIPT_VERSION = 1;

// The Apps Script the user pastes into their Sheet. Plain ES5-style JS so it
// also runs in the tests (testing/testSheets.js) with a mocked Google API.
export const SHEETS_SCRIPT = `// AppBlips Google Sheets database (version ${SHEETS_SCRIPT_VERSION}).
// In your Google Sheet, open the Extensions menu > Apps Script, replace what is there with all of this, and press Ctrl+S (Cmd+S on a Mac).
// Then click Deploy > New deployment > Web app, set "Execute as" to Me and
// "Who has access" to Anyone, click Deploy, and copy the Web app URL into AppBlips.
//
// That's all: you don't need to open this Sheet again. Your sites save to it and
// show what's in it. Visitors can only ADD entries and READ them. Details whose
// names start with _ (like _email) are never shown to visitors.
// The script only uses tabs it created (they start with "id" and "created"
// columns); any other tab is never shown or changed.

var VERSION = ${SHEETS_SCRIPT_VERSION};
var MAX_TABLES = 50;          // tabs in this Sheet
var MAX_COLUMNS = 30;         // columns in one table
var MAX_TEXT = 5000;          // characters in one cell
var MAX_ROWS_PER_READ = 500;
var WRITES_PER_MINUTE = 60;   // across all your sites, to slow down spam
var RESERVED = ['id', 'created'];

function doGet() {
  return reply({ ok: true, version: VERSION });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: 'bad-request' }); }
  if (!req || typeof req !== 'object') return reply({ ok: false, error: 'bad-request' });
  try {
    if (req.action === 'ping') return reply({ ok: true, version: VERSION });
    var name = tableName(req.table);
    if (!name) return reply({ ok: false, error: 'bad-table' });
    if (req.action === 'list') return reply({ ok: true, rows: listRows(name, req) });
    if (req.action === 'count') return reply(countRows(name, req.column));
    if (req.action === 'add') return reply(addRow(name, req));
    return reply({ ok: false, error: 'bad-action' });
  } catch (err) {
    return reply({ ok: false, error: 'failed' });
  }
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// Sheet names can't hold [ ] * ? / \\ : (they become spaces) or start or end
// with an apostrophe.
function tableName(value) {
  if (typeof value !== 'string') return '';
  var name = value.replace(/[\\[\\]*?\\/\\\\:]/g, ' ').replace(/\\s+/g, ' ').replace(/^'+|'+$/g, '').trim();
  return name.length > 0 && name.length <= 60 ? name : '';
}

function fieldName(value) {
  if (typeof value !== 'string') return '';
  var name = value.trim();
  return name.length > 0 && name.length <= 60 && RESERVED.indexOf(name) < 0 ? name : '';
}

function isPrivate(header) {
  return header === '' || header.charAt(0) === '_';
}

// Text that starts like a formula is stored as text, so a visitor can't make
// the Sheet run one.
function cell(value) {
  if (typeof value === 'number') return isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return '';
  var text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  text = text.slice(0, MAX_TEXT);
  return /^[=+\\-@]/.test(text) ? "'" + text : text;
}

function headersOf(sheet) {
  var width = sheet.getLastColumn();
  if (width < 1) return [];
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
}

// Only tabs this script made (they have id and created columns) are tables.
// Any other tab you add to this Sheet stays private: visitors can't read it,
// even if they guess its name, and can't add to it.
function isTable(headers) {
  return headers.indexOf('id') >= 0 && headers.indexOf('created') >= 0;
}

// The table's rows, without private columns.
function readRows(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  if (!isTable(headers)) return [];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (isPrivate(headers[c])) continue;
      var v = values[r][c];
      row[headers[c]] = v instanceof Date ? v.toISOString() : v;
      if (v !== '' && v !== null) empty = false;
    }
    if (!empty) rows.push(row);
  }
  return rows;
}

function isEmpty(value) {
  return value === '' || value === null || value === undefined;
}

// Newest first by default. Empty values always go last.
function listRows(name, req) {
  var rows = readRows(name);
  var by = typeof req.sortBy === 'string' && req.sortBy && !isPrivate(req.sortBy) ? req.sortBy : 'created';
  var asc = req.order === 'asc';
  rows.sort(function (a, b) {
    var x = a[by], y = b[by];
    if (isEmpty(x) || isEmpty(y)) return isEmpty(x) === isEmpty(y) ? 0 : isEmpty(x) ? 1 : -1;
    var d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return asc ? d : -d;
  });
  var limit = Math.floor(Number(req.limit));
  if (!(limit >= 1)) limit = 100;
  return rows.slice(0, Math.min(limit, MAX_ROWS_PER_READ));
}

function countRows(name, column) {
  var rows = readRows(name);
  var result = { ok: true, total: rows.length };
  if (typeof column === 'string' && column && !isPrivate(column)) {
    var counts = {};
    rows.forEach(function (row) {
      var key = row[column] === undefined || row[column] === null ? '' : String(row[column]);
      counts[key] = (counts[key] || 0) + 1;
    });
    result.counts = counts;
  }
  return result;
}

// Few writes per minute across all sites, counted while the lock is held.
function allowWrite() {
  var cache = CacheService.getScriptCache();
  var key = 'writes-' + Math.floor(Date.now() / 60000);
  var used = Number(cache.get(key)) || 0;
  if (used >= WRITES_PER_MINUTE) return false;
  cache.put(key, String(used + 1), 120);
  return true;
}

function addRow(name, req) {
  var input = req.row;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'bad-row' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    if (!allowWrite()) return { ok: false, error: 'busy' };
    var book = SpreadsheetApp.getActive();
    var sheet = book.getSheetByName(name);
    if (!sheet) {
      if (book.getSheets().length >= MAX_TABLES) return { ok: false, error: 'full' };
      sheet = book.insertSheet(name);
      sheet.setFrozenRows(1);
    }
    var headers = headersOf(sheet);
    // A tab of your own (not empty, not made by this script) is left alone.
    if (sheet.getLastRow() > 0 && !isTable(headers)) return { ok: false, error: 'bad-table' };
    var before = headers.length;
    ['id', 'created'].forEach(function (h) {
      if (headers.indexOf(h) < 0) headers.push(h);
    });
    var fields = {};
    Object.keys(input).forEach(function (key) {
      var field = fieldName(key);
      if (!field) return;
      if (headers.indexOf(field) < 0) {
        if (headers.length >= MAX_COLUMNS) return;
        headers.push(field);
      }
      fields[field] = cell(input[key]);
    });
    if (headers.length !== before) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }
    var id = Utilities.getUuid();
    var row = headers.map(function (h) {
      if (h === 'id') return id;
      if (h === 'created') return new Date();
      return Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '';
    });
    var at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, 1, row.length).setValues([row]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}
`;

// Calls the AI writes (see the Google Sheets directive in prompts.js).
const USES_HELPER_RE = /\bSheetDB\s*\.\s*(?:table|isSetUp)\b/;
export const usesSheetsHelper = (html) => typeof html === 'string' && USES_HELPER_RE.test(html);

// Friendly messages for the script's error codes, shown by the site.
const MESSAGES = {
  'not-set-up': 'Saving isn’t set up for this site yet.',
  offline: 'Couldn’t connect. Check your internet connection and try again.',
  busy: 'Lots of people are sending things right now. Try again in a minute.',
  full: 'This site can’t save anything new right now.',
  'bad-row': 'That couldn’t be saved. Check what you entered and try again.',
  failed: 'Something went wrong. Try again in a moment.',
};

// `url` is '' when the connector is off: every call then fails with the
// not-set-up message, so a page built with it still loads.
const helperSource = (url) => `<script data-appblips-sheets>
window.SheetDB = (function () {
  var URL = ${JSON.stringify(url || '')};
  var MESSAGES = ${JSON.stringify(MESSAGES)};
  function fail(code) { var err = new Error(MESSAGES[code] || MESSAGES.failed); err.code = MESSAGES[code] ? code : 'failed'; return err; }
  // text/plain keeps this a "simple" request: Apps Script can't answer the
  // CORS preflight that application/json would trigger.
  async function call(body) {
    if (!URL) throw fail('not-set-up');
    var res;
    try { res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
    catch (e) { throw fail('offline'); }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data || data.ok !== true) throw fail(data && data.error);
    return data;
  }
  function table(name) {
    return {
      add: function (row) {
        return call({ action: 'add', table: name, row: row || {} })
          .then(function (data) { return { id: data.id }; });
      },
      list: function (opts) {
        opts = opts || {};
        return call({ action: 'list', table: name, sortBy: opts.sortBy, order: opts.order, limit: opts.limit })
          .then(function (data) { return data.rows || []; });
      },
      count: function (column) {
        return call({ action: 'count', table: name, column: column })
          .then(function (data) { return column ? data.counts || {} : data.total || 0; });
      }
    };
  }
  return { table: table, isSetUp: function () { return Boolean(URL); } };
})();
</script>`;

// Adds the helper at the top of <head> (before the app's own scripts) when
// the page calls it. `url` is getSheetsScriptUrl() from connectors.js.
export const injectSheetsHelper = (html, url = '') => {
  if (!usesSheetsHelper(html)) return html;
  const script = helperSource(isSheetsScriptUrl(url) ? url.trim() : '');
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + script + html.slice(head.index + head[0].length);
  const doc = /<html\b[^>]*>/i.exec(html);
  if (doc) return html.slice(0, doc.index + doc[0].length) + script + html.slice(doc.index + doc[0].length);
  return script + html;
};

// Settings' "Test connection": asks the deployed script for its version.
// { ok: true, version } or { ok: false, reason: 'unreachable' | 'not-script' }.
export const pingSheetsScript = async (url, fetchImpl = fetch) => {
  let res;
  try {
    res = await fetchImpl(url.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }) });
  } catch { return { ok: false, reason: 'unreachable' }; }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!data || data.ok !== true || typeof data.version !== 'number') return { ok: false, reason: 'not-script' };
  return { ok: true, version: data.version };
};

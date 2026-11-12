// Run: node testing/testSheets.js
// Google Sheets connector (lib/sheetsHelper.js): the Apps Script users deploy,
// run against a fake Sheet, and the SheetDB helper pages get, talking to it
// through a fake fetch, end to end.
import assert from 'node:assert/strict';
import vm from 'node:vm';

const data = new Map();
globalThis.window = { localStorage: {
  get length() { return data.size; },
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => { data.set(k, String(v)); },
} };

const {
  SHEETS_SCRIPT, SHEETS_SCRIPT_VERSION, isSheetsScriptUrl, usesSheetsHelper, injectSheetsHelper, pingSheetsScript,
} = await import('../src/lib/sheetsHelper.js');
const { saveConnectors, connectorStatus, getActiveConnectors, getSheetsScriptUrl } = await import('../src/lib/connectors.js');
const { buildHtmlSystemPrompt, buildAskConnectorNote } = await import('../src/lib/prompts.js');

const URL_OK = 'https://script.google.com/macros/s/AKfycbx1234567890abcdefghijKLMNOP/exec';

// --- URLs -----------------------------------------------------------------
assert.ok(isSheetsScriptUrl(URL_OK));
assert.ok(isSheetsScriptUrl(`  ${URL_OK}\n`));
assert.ok(isSheetsScriptUrl('https://script.google.com/a/macros/example.com/s/AKfycbx1234567890abcdefghijKLMNOP/exec'));
for (const bad of ['', URL_OK.replace('/exec', '/dev'), URL_OK.replace('https', 'http'), `${URL_OK}?x=1`,
  'https://script.google.com.evil.com/macros/s/AKfycbx1234567890abcdefghijKLMNOP/exec', 'https://docs.google.com/spreadsheets/d/abc/edit', null]) {
  assert.equal(isSheetsScriptUrl(bad), false, String(bad));
}

// --- Connector state ------------------------------------------------------
saveConnectors({ sheets: { enabled: true, key: 'nope' } });
assert.equal(connectorStatus('sheets'), 'needs-key');
assert.equal(getSheetsScriptUrl(), '');
saveConnectors({ sheets: { enabled: true, key: ` ${URL_OK} ` } });
assert.equal(connectorStatus('sheets'), 'connected');
assert.equal(getSheetsScriptUrl(), URL_OK);
assert.deepEqual(getActiveConnectors(), [{ id: 'sheets', key: URL_OK }]);
saveConnectors({ sheets: { enabled: false, key: URL_OK } });
assert.equal(getSheetsScriptUrl(), '');

// --- Prompt ---------------------------------------------------------------
const active = [{ id: 'sheets', key: URL_OK }];
for (const mode of ['website', 'app', 'game']) {
  const prompt = buildHtmlSystemPrompt(mode, active);
  assert.match(prompt, /SheetDB\.table/, mode);
  assert.ok(!prompt.includes(URL_OK), `${mode}: the URL reaches pages through the helper, not the AI`);
}
assert.match(buildHtmlSystemPrompt('game', active), /shared online leaderboard/);
assert.doesNotMatch(buildHtmlSystemPrompt('website', active), /shared online leaderboard/);
assert.match(buildAskConnectorNote(active, 'website'), /Google Sheets/);

// --- Helper injection -----------------------------------------------------
const PAGE = '<!DOCTYPE html><html><head><title>x</title></head><body><script>SheetDB.table("A RSVPs").add({})</script></body></html>';
assert.equal(usesSheetsHelper('<p>no calls</p>'), false);
assert.equal(injectSheetsHelper('<p>no calls</p>', URL_OK), '<p>no calls</p>');
const injected = injectSheetsHelper(PAGE, URL_OK);
assert.ok(injected.indexOf('data-appblips-sheets') < injected.indexOf('<title>'), 'helper goes first in <head>');
assert.ok(injected.includes(JSON.stringify(URL_OK)));
assert.ok(!injectSheetsHelper(PAGE, 'https://evil.example/exec').includes('evil'), 'only a valid URL is written in');

// --- A fake Google: Sheet, ContentService, Lock, Cache, Utilities -----------
function fakeGoogle() {
  const sheets = [{ name: 'Sheet1', cells: [] }];
  let uuid = 0;
  const checkboxes = [];
  const sheetApi = (sheet) => ({
    getLastRow: () => sheet.cells.length,
    getLastColumn: () => Math.max(0, ...sheet.cells.map((r) => r.length)),
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => {
      const width = Math.max(0, ...sheet.cells.map((r) => r.length));
      return sheet.cells.map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? '' : r[i])));
    } }),
    getRange: (row, col, rows = 1, cols = 1) => ({
      getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => sheet.cells[row - 1 + r]?.[col - 1 + c] ?? '')),
      setValues(values) {
        values.forEach((vals, r) => {
          sheet.cells[row - 1 + r] ||= [];
          vals.forEach((v, c) => { sheet.cells[row - 1 + r][col - 1 + c] = v; });
        });
        return this;
      },
      setFontWeight() { return this; },
      insertCheckboxes() { checkboxes.push([sheet.name, row, col]); return this; },
    }),
  });
  let cache = new Map();
  const google = {
    sheets, checkboxes,
    SpreadsheetApp: { getActive: () => ({
      getSheetByName: (name) => { const s = sheets.find((x) => x.name === name); return s ? sheetApi(s) : null; },
      getSheets: () => sheets.map(sheetApi),
      insertSheet: (name) => { const s = { name, cells: [] }; sheets.push(s); return sheetApi(s); },
    }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    Utilities: { getUuid: () => `id-${++uuid}` },
    resetCache: () => { cache = new Map(); },
  };
  const context = vm.createContext({ ...google, JSON, Math, Date, Number, String, Object, Array, isFinite });
  vm.runInContext(SHEETS_SCRIPT, context);
  google.post = (body) => JSON.parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  google.get = () => JSON.parse(context.doGet().text);
  return google;
}

// --- The script on its own --------------------------------------------------
{
  const g = fakeGoogle();
  assert.deepEqual(g.get(), { ok: true, version: SHEETS_SCRIPT_VERSION });
  assert.deepEqual(g.post({ action: 'ping' }), { ok: true, version: SHEETS_SCRIPT_VERSION });
  assert.deepEqual(g.post('not json'), { ok: false, error: 'bad-request' });
  assert.deepEqual(g.post({ action: 'list', table: '' }), { ok: false, error: 'bad-table' });
  assert.deepEqual(g.post({ action: 'list', table: 'x'.repeat(61) }), { ok: false, error: 'bad-table' });
  assert.deepEqual(g.post({ action: 'drop', table: 'A' }), { ok: false, error: 'bad-action' });
  assert.deepEqual(g.post({ action: 'list', table: 'Missing' }), { ok: true, rows: [] });
  assert.deepEqual(g.post({ action: 'add', table: 'A', row: [1] }), { ok: false, error: 'bad-row' });

  // Adds create the tab and its headers; reserved fields can't be set by visitors;
  // formulas are stored as text; private columns are never read back.
  const added = g.post({ action: 'add', table: 'Bistro Reviews', row: { name: 'Ana', stars: 5, _email: 'a@x.com', id: 'mine', note: '=IMPORTXML("x")' } });
  assert.deepEqual(added, { ok: true, id: 'id-1' });
  const tab = g.sheets.find((s) => s.name === 'Bistro Reviews');
  assert.deepEqual(tab.cells[0], ['id', 'created', 'name', 'stars', '_email', 'note']);
  assert.equal(tab.cells[1][0], 'id-1');
  assert.equal(tab.cells[1][5], '\'=IMPORTXML("x")');
  const [row] = g.post({ action: 'list', table: 'Bistro Reviews' }).rows;
  assert.equal(row.name, 'Ana');
  assert.equal(row._email, undefined);
  assert.equal(typeof row.created, 'string');

  // Sheet-name characters are stripped, so 'Bistro/Reviews' is the same tab.
  g.post({ action: 'add', table: 'Bistro/Reviews', row: { name: 'Bo', stars: 3 } });
  assert.equal(g.post({ action: 'count', table: 'Bistro Reviews' }).total, 2);

  // Sorting: by a column, empty values last, private columns ignored.
  g.post({ action: 'add', table: 'Bistro Reviews', row: { name: 'Cy' } });
  const byStars = g.post({ action: 'list', table: 'Bistro Reviews', sortBy: 'stars', order: 'desc' }).rows.map((r) => r.name);
  assert.deepEqual(byStars, ['Ana', 'Bo', 'Cy']);
  assert.deepEqual(g.post({ action: 'list', table: 'Bistro Reviews', sortBy: 'stars', order: 'asc', limit: 2 }).rows.map((r) => r.name), ['Bo', 'Ana']);
  assert.deepEqual(g.post({ action: 'count', table: 'Bistro Reviews', column: 'stars' }).counts, { 5: 1, 3: 1, '': 1 });
  assert.equal(g.post({ action: 'count', table: 'Bistro Reviews', column: '_email' }).counts, undefined);

  // No moderation: a leftover flag from a page is ignored, rows show at once,
  // and no approval column or checkbox is made.
  assert.deepEqual(g.post({ action: 'add', table: 'Votes', moderated: true, row: { choice: 'A' } }), { ok: true, id: 'id-4' });
  assert.deepEqual(g.sheets.find((s) => s.name === 'Votes').cells[0], ['id', 'created', 'choice']);
  assert.deepEqual(g.checkboxes, []);
  assert.equal(g.post({ action: 'count', table: 'Votes' }).total, 1);

  // A tab the owner made themselves is never read or written, even by name.
  g.sheets.push({ name: 'My private notes', cells: [['name', 'phone'], ['Mum', '555-0100']] });
  assert.deepEqual(g.post({ action: 'list', table: 'My private notes' }), { ok: true, rows: [] });
  assert.equal(g.post({ action: 'count', table: 'My private notes' }).total, 0);
  assert.deepEqual(g.post({ action: 'add', table: 'My private notes', row: { name: 'x' } }), { ok: false, error: 'bad-table' });
  assert.equal(g.sheets.find((s) => s.name === 'My private notes').cells.length, 2);
  // An empty tab (like the Sheet's own Sheet1) can become a table.
  assert.equal(g.post({ action: 'add', table: 'Sheet1', row: { a: 1 } }).ok, true);

  // Limits: columns per table, tabs per Sheet, writes per minute.
  const wide = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i]));
  g.post({ action: 'add', table: 'Wide', row: wide });
  assert.equal(g.sheets.find((s) => s.name === 'Wide').cells[0].length, 30);
  g.resetCache();
  for (let i = g.sheets.length; i < 50; i++) g.post({ action: 'add', table: `T${i}`, row: { a: 1 } });
  assert.deepEqual(g.post({ action: 'add', table: 'One too many', row: { a: 1 } }), { ok: false, error: 'full' });
  g.resetCache();
  for (let i = 0; i < 60; i++) assert.equal(g.post({ action: 'add', table: 'Wide', row: { f0: 1 } }).ok, true);
  assert.deepEqual(g.post({ action: 'add', table: 'Wide', row: { f0: 1 } }), { ok: false, error: 'busy' });
}

// --- End to end: the page helper calling the script ------------------------
{
  const g = fakeGoogle();
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, init });
    const text = JSON.stringify(g.post(init.body));
    return { json: async () => JSON.parse(text) };
  };
  const helper = /<script data-appblips-sheets>([\s\S]*?)<\/script>/.exec(injectSheetsHelper(PAGE, URL_OK))[1];
  const page = vm.createContext({ window: {}, fetch: fakeFetch, JSON, Promise, Error, Boolean });
  vm.runInContext(helper, page);
  const { SheetDB } = page.window;
  assert.equal(SheetDB.isSetUp(), true);

  const rsvps = SheetDB.table('Lisa Wedding RSVPs');
  assert.deepEqual({ ...(await rsvps.add({ name: 'Ana', guests: 2 })) }, { id: 'id-1' });
  await rsvps.add({ name: 'Bo', guests: 1 });
  assert.equal(await rsvps.count(), 2);
  assert.deepEqual((await rsvps.list({ sortBy: 'guests', order: 'desc' })).map((r) => r.name), ['Ana', 'Bo']);
  assert.equal(requests[0].url, URL_OK);
  assert.equal(requests[0].init.headers['Content-Type'], 'text/plain;charset=utf-8', 'no CORS preflight');


  // Errors come back as friendly messages with a code.
  await assert.rejects(SheetDB.table('').add({}), (err) => err.code === 'failed' && /Something went wrong/.test(err.message));
  const offline = vm.createContext({ window: {}, fetch: async () => { throw new TypeError('Failed to fetch'); }, JSON, Promise, Error, Boolean });
  vm.runInContext(helper, offline);
  await assert.rejects(offline.window.SheetDB.table('A').list(), (err) => err.code === 'offline');

  // Connector off: the page still loads and calls explain saving isn't set up.
  const off = vm.createContext({ window: {}, fetch: fakeFetch, JSON, Promise, Error, Boolean });
  vm.runInContext(/<script data-appblips-sheets>([\s\S]*?)<\/script>/.exec(injectSheetsHelper(PAGE, ''))[1], off);
  assert.equal(off.window.SheetDB.isSetUp(), false);
  await assert.rejects(off.window.SheetDB.table('A').add({}), (err) => err.code === 'not-set-up');

  // Settings' connection test.
  assert.deepEqual(await pingSheetsScript(URL_OK, fakeFetch), { ok: true, version: SHEETS_SCRIPT_VERSION });
  assert.deepEqual(await pingSheetsScript(URL_OK, async () => { throw new TypeError('x'); }), { ok: false, reason: 'unreachable' });
  assert.deepEqual(await pingSheetsScript(URL_OK, async () => ({ json: async () => { throw new SyntaxError('html'); } })), { ok: false, reason: 'not-script' });
}

console.log('testSheets: ok');

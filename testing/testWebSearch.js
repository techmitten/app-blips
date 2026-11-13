// The AI's web_search tool (src/lib/webSearch.js): argument handling, the
// per-request budget, untrusted-content labelling, and what a rejected key
// does to the connector. Searches are stubbed. Run: node testing/testWebSearch.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

// A tiny localStorage, installed before connectors.js reads it.
const data = new Map();
globalThis.window = { localStorage: {
  get length() { return data.size; },
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => { data.set(k, String(v)); },
} };

const { saveConnectors, connectorStatus } = await import('../src/lib/connectors.js');
const {
  WEB_SEARCH_TOOL, UNTRUSTED_NOTE, createWebSearchBudget, executeWebSearch, formatWebResearch, isWebSearchCall, isWebSearchEnabled,
  PROVIDER_WEB_SEARCH_TOOL, WEB_FETCH_TOOL, executeWebFetch, isWebToolCall, researchPage,
} = await import('../src/lib/webSearch.js');

const toolCall = (args) => ({ id: 'c1', type: 'function', function: { name: 'web_search', arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const RESULT = { title: 'Blue Door Café', url: 'https://bluedoor.example/', content: 'Open 8am to 4pm.' };

test('the tool is a strict function tool with every property required', () => {
  const { name, parameters, strict } = WEB_SEARCH_TOOL.function;
  assert.equal(name, 'web_search');
  assert.equal(strict, true);
  assert.deepEqual(parameters.required.sort(), Object.keys(parameters.properties).sort());
  assert.equal(isWebSearchCall(toolCall({})), true);
  assert.equal(isWebSearchCall({ function: { name: 'view_code' } }), false);
});

test('enabled only while the connector is on with a saved key', () => {
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '' } });
  assert.equal(isWebSearchEnabled(), false);
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  assert.equal(isWebSearchEnabled(), true);
  saveConnectors({ tavily: { enabled: false, key: '', keyHint: '0e1f' } });
  assert.equal(isWebSearchEnabled(), false);
});

test('a search passes clean arguments and labels the results as untrusted', async () => {
  const calls = [];
  const search = async (args) => { calls.push(args); return { results: [RESULT] }; };
  const result = await executeWebSearch(toolCall({ query: '  blue door café ', topic: 'news', time_range: 'week' }), createWebSearchBudget(), { search });
  assert.deepEqual(calls[0], { query: 'blue door café', topic: 'news', time_range: 'week' });
  assert.equal(result.success, true);
  assert.equal(result.note, UNTRUSTED_NOTE);
  assert.deepEqual(result.results, [RESULT]);

  await executeWebSearch(toolCall({ query: 'x', topic: 'finance', time_range: 'decade' }), createWebSearchBudget(), { search });
  assert.deepEqual(calls[1], { query: 'x', topic: 'general', time_range: null });
});

test('bad arguments are reported back without searching', async () => {
  let searched = 0;
  const search = async () => { searched++; return { results: [] }; };
  assert.equal((await executeWebSearch(toolCall('{"query": "cut off'), createWebSearchBudget(), { search })).success, false);
  assert.equal((await executeWebSearch(toolCall({ query: '  ' }), createWebSearchBudget(), { search })).success, false);
  assert.equal(searched, 0);
});

test('the budget caps searches per request', async () => {
  let searched = 0;
  const search = async () => { searched++; return { results: [] }; };
  const budget = createWebSearchBudget(2);
  for (let i = 0; i < 4; i++) await executeWebSearch(toolCall({ query: `q${i}` }), budget, { search });
  assert.equal(searched, 2);
  const over = await executeWebSearch(toolCall({ query: 'more' }), budget, { search });
  assert.equal(over.success, false);
  assert.match(over.error, /limit/);
});

test('a rejected key marks the connector as needing a key and stops searching', async () => {
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  const budget = createWebSearchBudget();
  const result = await executeWebSearch(toolCall({ query: 'x' }), budget, { search: async () => ({ error: 'Tavily didn’t accept your API key.', signedOut: true }) });
  assert.equal(result.success, false);
  assert.match(result.error, /Continue without searching/);
  assert.equal(budget.left, 0);
  assert.equal(connectorStatus('tavily'), 'needs-key');

  // Other errors (busy, out of credits) leave the key alone.
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  await executeWebSearch(toolCall({ query: 'x' }), createWebSearchBudget(), { search: async () => ({ error: 'Tavily is busy.' }) });
  assert.equal(connectorStatus('tavily'), 'connected');
});

test('research findings become one capped, labelled block', () => {
  assert.equal(formatWebResearch([]), '');
  assert.equal(formatWebResearch([{ query: 'x', results: [] }]), '');
  const block = formatWebResearch([{ query: 'blue door café', results: [{ ...RESULT, published_date: '2026-10-01' }] }]);
  assert.match(block, /^WEB RESEARCH/);
  assert.ok(block.includes(UNTRUSTED_NOTE));
  assert.match(block, /Search: blue door café\n- Blue Door Café \(https:\/\/bluedoor\.example\/\) \[2026-10-01\]: Open 8am to 4pm\./);
  const huge = formatWebResearch([{ query: 'x', results: Array.from({ length: 50 }, (_, i) => ({ title: `t${i}`, url: `https://e.example/${i}`, content: 'z'.repeat(1200) })) }]);
  assert.ok(huge.length < 6600);
});

// ---- One prompt's web tools ----------------------------------------------
const { startWebSearch } = await import('../src/lib/webSearch.js');

test('the session is Tavily when connected and nothing otherwise', () => {
  saveConnectors({ tavily: { enabled: false, key: '', keyHint: '' } });
  assert.equal(startWebSearch(), null);
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  const web = startWebSearch();
  assert.equal(web.kind, 'tavily');
  assert.deepEqual(web.tools(), [WEB_SEARCH_TOOL]);
});

// ---- Web search through the AI provider (the globe) ----

const fetchCall = (args) => ({ id: 'c2', type: 'function', function: { name: 'web_fetch', arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const OFFERED = { available: true, paidBy: 'own', enabled: true, fetch: true, searches: 5 };
const tavilyOff = { tavily: { enabled: false, key: '', keyHint: '' } };
const tavilyOn = { tavily: { enabled: true, key: '', keyHint: '0e1f' } };

test('the provider tools are strict function tools', () => {
  for (const tool of [PROVIDER_WEB_SEARCH_TOOL, WEB_FETCH_TOOL]) {
    const { parameters, strict } = tool.function;
    assert.equal(strict, true);
    assert.deepEqual(parameters.required.sort(), Object.keys(parameters.properties).sort());
  }
  assert.equal(isWebToolCall(fetchCall({})), true);
  assert.equal(isWebToolCall(toolCall({})), true);
  assert.equal(isWebToolCall({ function: { name: 'view_code' } }), false);
});

test('the session is DeepSeek only when it is offered and Tavily is not connected', () => {
  assert.equal(startWebSearch({ connectors: tavilyOff, provider: { available: false } }), null);
  assert.equal(startWebSearch({ connectors: tavilyOff, provider: OFFERED }).kind, 'provider');
  // Offered, but the globe is off.
  assert.equal(startWebSearch({ connectors: tavilyOff, provider: { ...OFFERED, enabled: false } }), null);
  assert.equal(startWebSearch({ connectors: tavilyOn, provider: OFFERED }).kind, 'tavily');
  const session = startWebSearch({ connectors: tavilyOff, provider: OFFERED });
  assert.deepEqual(session.tools().map((t) => t.function.name), ['web_search', 'web_fetch']);
  assert.match(session.guidance, /web_fetch/);
  assert.match(session.researchPrompt, /DONE/);
});

test('DeepSeek searches and page reads have separate budgets', async () => {
  const searched = [];
  const read = [];
  const session = startWebSearch({
    connectors: tavilyOff, provider: OFFERED, searches: 1,
    searchImpl: async (args) => { searched.push(args); return { query: args.query, results: [RESULT] }; },
    fetchImpl: async (args) => { read.push(args); return { url: args.url, title: 'Menu', content: '# Menu' }; },
  });
  const found = await session.execute(toolCall({ query: `café ${'x'.repeat(200)}` }));
  assert.equal(found.success, true);
  assert.equal(searched[0].query.length, 128);
  assert.equal((await session.execute(toolCall({ query: 'again' }))).success, false);
  assert.deepEqual(session.tools().map((t) => t.function.name), ['web_fetch']);

  const page = await session.execute(fetchCall({ url: ' https://bluedoor.example/menu ' }));
  assert.deepEqual(read[0], { url: 'https://bluedoor.example/menu' });
  assert.equal(page.note, UNTRUSTED_NOTE);
  assert.equal(page.content, '# Menu');
  assert.equal(session.canCall(), true);
  await session.execute(fetchCall({ url: 'https://a.example/' }));
  await session.execute(fetchCall({ url: 'https://b.example/' }));
  assert.equal(session.canCall(), false);
  assert.equal((await session.execute(fetchCall({ url: 'https://c.example/' }))).success, false);
  assert.equal(read.length, 3);
});

test('a page read needs a full web address and reports failures', async () => {
  let read = 0;
  const fetchPage = async () => { read++; return { error: 'That page couldn’t be read.' }; };
  assert.equal((await executeWebFetch(fetchCall({ url: 'bluedoor.example' }), createWebSearchBudget(), { fetchPage })).success, false);
  assert.equal((await executeWebFetch(fetchCall('{"url": "cut'), createWebSearchBudget(), { fetchPage })).success, false);
  assert.equal(read, 0);
  const failed = await executeWebFetch(fetchCall({ url: 'https://bluedoor.example/' }), createWebSearchBudget(), { fetchPage });
  assert.equal(failed.success, false);
  assert.match(failed.error, /couldn’t be read/);
});

test('an answer that rules out later calls stops both DeepSeek tools', async () => {
  const session = startWebSearch({
    connectors: tavilyOff, provider: OFFERED,
    searchImpl: async () => ({ error: 'DeepSeek rejected the API key in Settings → AI.', stop: true }),
    fetchImpl: async () => ({ url: 'x', title: '', content: 'x' }),
  });
  const result = await session.execute(toolCall({ query: 'x' }));
  assert.equal(result.success, false);
  assert.equal(session.canCall(), false);
  assert.deepEqual(session.tools(), []);
});

test('a page read during research becomes a research entry', () => {
  const entry = researchPage({ url: 'https://bluedoor.example/menu', title: 'Menu', content: `Soup\n\n${'y'.repeat(9000)}` });
  assert.equal(entry.query, 'Page: https://bluedoor.example/menu');
  assert.equal(entry.results[0].content.length, 4000);
  assert.match(formatWebResearch([entry]), /Menu \(https:\/\/bluedoor\.example\/menu\)/);
});

test('a provider without page reading gets web_search only, with its own search budget', async () => {
  let searched = 0;
  const session = startWebSearch({
    connectors: tavilyOff, provider: { available: true, enabled: true, fetch: false, searches: 3 },
    searchImpl: async ({ query }) => { searched++; return { query, answer: 'Open 8am to 4pm.', results: [RESULT] }; },
  });
  assert.deepEqual(session.tools().map((t) => t.function.name), ['web_search']);
  assert.doesNotMatch(session.guidance, /web_fetch/);
  assert.match(session.guidance, /at most 3 searches for this request/);
  const found = await session.execute(toolCall({ query: 'blue door café hours' }));
  assert.equal(found.answer, 'Open 8am to 4pm.');
  await session.execute(toolCall({ query: 'b' }));
  await session.execute(toolCall({ query: 'c' }));
  assert.equal((await session.execute(toolCall({ query: 'd' }))).success, false);
  assert.equal(searched, 3);
  // The research step's smaller budget never exceeds what the provider allows.
  const research = startWebSearch({ connectors: tavilyOff, searches: 10, provider: { available: true, enabled: true, fetch: false, searches: 3 } });
  assert.match(research.researchPrompt, /at most 3 specific searches/);
});

test('a search report becomes part of the research block', () => {
  assert.match(formatWebResearch([{ query: 'hours', answer: 'Open\n8am to 4pm.', results: [] }]), /Found: Open 8am to 4pm\./);
});

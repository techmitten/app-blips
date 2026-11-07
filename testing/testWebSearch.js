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

// ---- Plan web search (one prompt, switched on by the user) -------------------
const { startWebSearch, executeWebFetch, isWebFetchCall, researchPage, WEB_FETCH_TOOL, PLAN_WEB_SEARCH_TOOL } = await import('../src/lib/webSearch.js');
const { searchPlan, fetchPlan, setPlanWebSearch, getPlanWebSearch, subscribePlanWebSearch } = await import('../src/lib/planWeb.js');
const { setAuthTokenGetter } = await import('../src/lib/authToken.js');

const call = (name, args, id = 'p1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const PLAN = { uses: 1, searches: 3, fetches: 3 };

test('plan tools are strict, with every property required', () => {
  for (const tool of [PLAN_WEB_SEARCH_TOOL, WEB_FETCH_TOOL]) {
    const { parameters, strict } = tool.function;
    assert.equal(strict, true);
    assert.deepEqual(parameters.required.sort(), Object.keys(parameters.properties).sort());
  }
  assert.equal(PLAN_WEB_SEARCH_TOOL.function.name, 'web_search');
  assert.equal(/tavily/i.test(PLAN_WEB_SEARCH_TOOL.function.description), false);
  assert.equal(isWebFetchCall(call('web_fetch', {})), true);
});

test('a plan session has its own search and page-read budgets', async () => {
  saveConnectors({ tavily: { enabled: false, key: '', keyHint: '' } });
  const searched = [];
  const fetched = [];
  const web = startWebSearch({
    plan: PLAN,
    searchImpl: async (args) => { searched.push(args.query); return { charged: 1, results: [RESULT] }; },
    fetchImpl: async ({ url }) => { fetched.push(url); return { charged: 1, url, title: 'Menu', content: '# Menu' }; },
  });
  assert.equal(web.kind, 'plan');
  assert.match(web.guidance, /at most 3 searches and 3 page reads/);
  assert.deepEqual(web.tools().map((t) => t.function.name), ['web_search', 'web_fetch']);
  for (let i = 0; i < 3; i++) assert.equal((await web.execute(call('web_search', { query: `q${i}` }))).success, true);
  assert.deepEqual(web.tools().map((t) => t.function.name), ['web_fetch'], 'search drops out when its budget is spent');
  const over = await web.execute(call('web_search', { query: 'q4' }));
  assert.equal(over.success, false);
  assert.equal(searched.length, 3);
  const page = await web.execute(call('web_fetch', { url: 'https://bluedoor.example/menu' }));
  assert.deepEqual(page, { success: true, url: 'https://bluedoor.example/menu', title: 'Menu', note: UNTRUSTED_NOTE, content: '# Menu' });
  assert.equal((await web.execute(call('web_fetch', { url: 'ftp://x' }))).success, false, 'only web addresses');
  assert.equal(fetched.length, 1, 'a bad address costs nothing');
  assert.equal(web.charged, 4);
  await web.execute(call('web_fetch', { url: 'https://a.example/' }));
  await web.execute(call('web_fetch', { url: 'https://b.example/' }));
  assert.deepEqual(web.tools(), []);
  assert.equal(web.canCall(), false);
  assert.match((await web.execute(call('web_fetch', { url: 'https://c.example/' }))).error, /limit/);
});

test('running out of uses stops both tools for the rest of the prompt', async () => {
  const web = startWebSearch({
    plan: PLAN,
    searchImpl: async () => ({ error: 'No uses left for web search in this 5-hour window.', stop: true }),
    fetchImpl: async () => { throw new Error('must not be called'); },
  });
  const result = await web.execute(call('web_search', { query: 'x' }));
  assert.equal(result.success, false);
  assert.match(result.error, /No uses left/);
  assert.equal(web.canCall(), false);
  assert.deepEqual(web.tools(), []);
});

test('without the plan, the session is Tavily when connected and nothing otherwise', () => {
  saveConnectors({ tavily: { enabled: false, key: '', keyHint: '' } });
  assert.equal(startWebSearch(), null);
  saveConnectors({ tavily: { enabled: true, key: '', keyHint: '0e1f' } });
  const web = startWebSearch();
  assert.equal(web.kind, 'tavily');
  assert.deepEqual(web.tools(), [WEB_SEARCH_TOOL]);
  // Switched on, the plan wins over a connected Tavily.
  assert.equal(startWebSearch({ plan: PLAN }).kind, 'plan');
});

test('a page read in the research step is cut short for the build request', () => {
  const entry = researchPage({ url: 'https://e.example/', title: 'E', content: `a\n\n${'b'.repeat(9000)}` });
  assert.equal(entry.query, 'Page: https://e.example/');
  assert.ok(entry.results[0].content.length <= 4000);
  assert.ok(!entry.results[0].content.includes('\n'));
  assert.match(formatWebResearch([entry], 16000), /Page: https:\/\/e\.example\//);
});

test('executeWebFetch rejects broken arguments without spending', async () => {
  const budget = createWebSearchBudget(1);
  const result = await executeWebFetch({ id: 'x', function: { name: 'web_fetch', arguments: '{bad' } }, budget, { fetchPage: async () => assert.fail('no call') });
  assert.equal(result.success, false);
  assert.equal(budget.left, 1);
});

test('planWeb calls /api/web with the session token and maps the answers', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  try {
    setAuthTokenGetter(null);
    assert.deepEqual(await searchPlan({ query: 'x' }), { error: 'Sign in again to search the web.', stop: true });
    setAuthTokenGetter(async () => 'tok_123');
    globalThis.fetch = async (path, init) => {
      seen.push({ path, auth: init.headers.authorization, body: JSON.parse(init.body) });
      if (path === '/api/web/search') {
        return new Response(JSON.stringify({ query: 'x', charged: 1, results: [{ title: 'T', url: 'https://t.example/', summary: 'Sum', date: '2026-01-01', site_name: 'T site' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'No uses left for web search in this 5-hour window.', code: 'web_search_limit' }), { status: 429 });
    };
    assert.deepEqual(await searchPlan({ query: 'x' }), {
      charged: 1,
      results: [{ title: 'T', url: 'https://t.example/', content: 'Sum', site_name: 'T site', published_date: '2026-01-01' }],
    });
    const limited = await fetchPlan({ url: 'https://t.example/' });
    assert.equal(limited.stop, true);
    assert.match(limited.error, /No uses left/);
    assert.deepEqual(seen.map((s) => [s.path, s.auth]), [['/api/web/search', 'Bearer tok_123'], ['/api/web/fetch', 'Bearer tok_123']]);
    assert.deepEqual(seen[1].body, { url: 'https://t.example/' });
  } finally {
    globalThis.fetch = realFetch;
    setAuthTokenGetter(null);
  }
});

test('the button is offered only while /me says so', () => {
  let changes = 0;
  const unsubscribe = subscribePlanWebSearch(() => { changes += 1; });
  setPlanWebSearch({ uses: 1, searches: 3, fetches: 3 });
  assert.deepEqual(getPlanWebSearch(), PLAN);
  setPlanWebSearch({ uses: 1, searches: 3, fetches: 3 });
  assert.equal(changes, 1, 'the same answer again changes nothing');
  setPlanWebSearch(null);
  assert.equal(getPlanWebSearch(), null);
  assert.equal(changes, 2);
  unsubscribe();
});

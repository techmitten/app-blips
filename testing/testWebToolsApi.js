// DeepSeek web search for the AI (electron/server/webToolsApi.js) against a
// stubbed DeepSeek: which key pays, what reaches the page, what is counted
// against the Free option. No network. Run: node --test testing/testWebToolsApi.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleWebToolsApi, webSearchProvider, SEARCH_FEE_TOKENS } from '../electron/server/webToolsApi.js';

const WEB_CALL_TOKENS = SEARCH_FEE_TOKENS.deepseek;
import { withSavedProvider } from '../electron/server/savedProvider.js';
import { createFreeLimits } from '../electron/server/freeLimits.js';

const ORIGIN = 'http://localhost:5175';
const OWN_KEY = 'sk-own-0123456789';
const ENV_KEY = 'sk-env-0123456789';
const ENV = { OPENAI_LLM_PROVIDER: 'deepseek', OPENAI_API_KEY: ENV_KEY, OPENAI_LLM_MODEL: 'deepseek-chat' };
const OWN = { id: 'deepseek', model: 'deepseek-chat', apiKey: OWN_KEY };

const request = (path, body = {}, { method = 'POST', origin = ORIGIN } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A stub DeepSeek that records what it was sent.
const deepseek = (answer) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, key: init.headers.authorization, body: JSON.parse(init.body) });
    return typeof answer === 'function' ? answer(url) : answer;
  };
  return { calls, fetch };
};

const call = async (path, body, env, options = {}) => {
  const response = await handleWebToolsApi(request(path, body, options.request), env, options);
  return { status: response.status, body: await response.json() };
};

const RESULTS = { results: [
  { title: 'Blue Door Café', url: 'https://bluedoor.example/', snippet: 'short', summary: 'Open 8am\n to 4pm.', date: '2026-06-01T00:00:00+00:00', site_icon: 'https://bluedoor.example/i.ico', rerank_score: 2.4 },
  { title: 'Bad', url: 'javascript:alert(1)', summary: 'nope' },
  { title: 'Long', url: 'http://long.example/page', snippet: 'y'.repeat(5000) },
] };

test('the provider that pays: the user\'s own, else the environment provider on its own endpoint', async () => {
  const key = async (env, payload) => {
    const { provider, own } = await webSearchProvider(env, payload);
    return { key: provider?.apiKey || '', id: provider?.id || '', own };
  };
  assert.deepEqual(await key(ENV, { user_provider: OWN }), { key: OWN_KEY, id: 'deepseek', own: true });
  assert.deepEqual(await key(ENV, {}), { key: ENV_KEY, id: 'deepseek', own: false });
  assert.deepEqual(await key({}, {}), { key: '', id: '', own: false });
  // Another provider chosen in Settings → AI searches with its own key, never the host's.
  assert.deepEqual(await key(ENV, { user_provider: { id: 'openai', model: 'gpt-5', apiKey: 'sk-proj-x' } }), { key: 'sk-proj-x', id: 'openai', own: true });
  // A saved provider whose key is missing.
  assert.equal((await key(ENV, { user_provider: { id: 'deepseek', model: 'deepseek-chat', apiKey: '' } })).key, '');
  // The environment provider behind another endpoint gets nothing; another
  // provider on its own endpoint does.
  assert.equal((await key({ ...ENV, OPENAI_BASE_URL: 'https://proxy.example/v1' }, {})).key, '');
  assert.equal((await key({ OPENAI_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-proj-x', OPENAI_LLM_MODEL: 'gpt-5' }, {})).id, 'openai');
});

test('status says whether search is offered and who pays, without calling DeepSeek', async () => {
  const stub = deepseek(jsonResponse({}));
  assert.deepEqual((await call('/api/web/status', { user_provider: OWN }, {}, stub)).body, { available: true, paidBy: 'own', provider: 'deepseek', fetch: true, searches: 5 });
  assert.deepEqual((await call('/api/web/status', {}, ENV, stub)).body, { available: true, paidBy: 'free', provider: 'deepseek', fetch: true, searches: 5 });
  assert.deepEqual((await call('/api/web/status', { user_provider: { id: 'gemini', model: 'gemini-3-pro', apiKey: 'AIza-x' } }, {}, stub)).body, { available: true, paidBy: 'own', provider: 'gemini', fetch: false, searches: 3 });
  assert.deepEqual((await call('/api/web/status', {}, {}, stub)).body, { available: false, paidBy: '', provider: '', fetch: false, searches: 0 });
  // An environment provider with no model named is offered without looking one up.
  assert.equal((await call('/api/web/status', {}, { OPENAI_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-proj-x' }, stub)).body.provider, 'openai');
  assert.equal(stub.calls.length, 0);
});

test('a search goes to DeepSeek with the paying key and comes back cleaned', async () => {
  const stub = deepseek(() => jsonResponse(RESULTS));
  const { status, body } = await call('/api/web/search', { query: '  blue   door café ', user_provider: OWN }, ENV, stub);
  assert.equal(status, 200);
  assert.equal(stub.calls[0].url, 'https://api.deepseek.com/v1/tools/search');
  assert.equal(stub.calls[0].key, `Bearer ${OWN_KEY}`);
  assert.deepEqual(stub.calls[0].body, { query: 'blue door café', count: 5, need_content: false });
  assert.equal(body.query, 'blue door café');
  assert.deepEqual(body.results[0], { title: 'Blue Door Café', url: 'https://bluedoor.example/', content: 'Open 8am to 4pm.', published_date: '2026-06-01T00:00:00+00:00' });
  assert.equal(body.results.length, 2);
  assert.equal(body.results[1].content.length, 800);
  assert.equal(JSON.stringify(body).includes(OWN_KEY), false);

  await call('/api/web/search', { query: 'x' }, ENV, stub);
  assert.equal(stub.calls[1].key, `Bearer ${ENV_KEY}`);
});

test('a page is read as Markdown and long pages are cut short', async () => {
  const stub = deepseek(() => jsonResponse({ title: 'Menu', content: `# Menu\r\n\n\n\nSoup\n${'x'.repeat(20000)}` }));
  const { status, body } = await call('/api/web/fetch', { url: 'https://bluedoor.example/menu', user_provider: OWN }, {}, stub);
  assert.equal(status, 200);
  assert.deepEqual(stub.calls[0].body, { url: 'https://bluedoor.example/menu' });
  assert.equal(body.title, 'Menu');
  assert.equal(body.truncated, true);
  assert.ok(body.content.startsWith('# Menu\n\nSoup\n'));
  assert.equal(body.content.length, 12001);
});

test('bad requests cost nothing', async () => {
  const stub = deepseek(jsonResponse(RESULTS));
  assert.equal((await call('/api/web/search', { query: '   ', user_provider: OWN }, {}, stub)).status, 400);
  for (const url of ['notes.txt', 'javascript:alert(1)', 'https://user:pass@site.example/', 'ftp://site.example/']) {
    assert.equal((await call('/api/web/fetch', { url, user_provider: OWN }, {}, stub)).status, 400, url);
  }
  assert.equal((await call('/api/web/search', { query: 'x' }, {}, stub)).status, 409);
  assert.equal((await call('/api/web/search', { query: 'x', user_provider: OWN }, {}, { ...stub, request: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/api/web/search', {}, {}, { ...stub, request: { method: 'GET' } })).status, 405);
  assert.equal((await call('/api/web/other', {}, ENV, stub)).status, 404);
  assert.equal(stub.calls.length, 0);
});

test('DeepSeek errors become plain messages, and a bad key or empty balance stops the prompt', async () => {
  const own = (status, path = '/api/web/search', body = { query: 'x' }) => call(path, { ...body, user_provider: OWN }, {}, deepseek(() => jsonResponse({ error: { message: 'secret detail' } }, status)));
  const rejected = await own(401);
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.stop, true);
  assert.match(rejected.body.error, /Settings → AI/);
  // A bad query on DeepSeek doesn't stop later searches.
  assert.equal((await own(400)).body.stop, undefined);
  const broke = await own(402);
  assert.equal(broke.body.stop, true);
  assert.match(broke.body.error, /balance/);
  assert.equal((await own(429)).status, 503);
  assert.equal((await own(500)).body.stop, undefined);
  assert.equal((await own(404, '/api/web/fetch', { url: 'https://gone.example/' })).status, 422);
  // The host's key: nothing the visitor can fix, and no detail leaks.
  const hosts = await call('/api/web/search', { query: 'x' }, ENV, deepseek(() => jsonResponse({ error: { message: 'secret detail' } }, 401)));
  assert.equal(hosts.status, 503);
  assert.equal(hosts.body.stop, true);
  assert.equal(JSON.stringify(hosts.body).includes('secret'), false);
  // DeepSeek unreachable.
  const down = await call('/api/web/search', { query: 'x', user_provider: OWN }, {}, { fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(down.status, 502);
});

test('the Free option counts billed calls against the visitor, the user\'s own key never', async () => {
  const freeLimits = createFreeLimits({ APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: String(WEB_CALL_TOKENS * 2), APPBLIPS_FREE_REQUESTS_PER_HOUR: '100' });
  const found = deepseek(() => jsonResponse(RESULTS));
  const empty = deepseek(() => jsonResponse({ results: [] }));
  const free = (stub) => call('/api/web/search', { query: 'x' }, ENV, { ...stub, freeLimits, visitor: 'v1' });
  // An empty search isn't billed by DeepSeek, so it uses no allowance.
  assert.equal((await free(empty)).status, 200);
  assert.equal((await free(found)).status, 200);
  assert.equal((await free(found)).status, 200);
  const refused = await free(found);
  assert.equal(refused.status, 429);
  assert.equal(refused.body.source, 'free-limit');
  assert.equal(refused.body.stop, true);
  assert.equal(found.calls.length, 2);
  // Another visitor, and the same visitor with their own key, still search.
  assert.equal((await call('/api/web/search', { query: 'x' }, ENV, { ...found, freeLimits, visitor: 'v2' })).status, 200);
  assert.equal((await call('/api/web/search', { query: 'x', user_provider: OWN }, ENV, { ...found, freeLimits, visitor: 'v1' })).status, 200);
});

test('the saved key is attached the way /api/chat does it', async () => {
  const stub = deepseek(() => jsonResponse(RESULTS));
  // Browser version: the page names the provider, the server adds its key.
  const browser = await withSavedProvider(request('/api/web/search', { query: 'x', user_provider: { id: 'deepseek', model: 'deepseek-chat' } }), { keyFor: (id) => (id === 'deepseek' ? OWN_KEY : '') });
  assert.equal((await handleWebToolsApi(browser, {}, stub)).status, 200);
  assert.equal(stub.calls[0].key, `Bearer ${OWN_KEY}`);
  // Desktop: the page sends nothing, the saved provider is the active one.
  const desktop = await withSavedProvider(request('/api/web/status', {}), { keyFor: () => '', active: () => OWN });
  assert.equal((await (await handleWebToolsApi(desktop, {}, stub)).json()).paidBy, 'own');
  const other = await withSavedProvider(request('/api/web/status', {}), { keyFor: () => '', active: () => ({ id: 'openai', model: 'gpt-5', apiKey: 'sk-proj-x' }) });
  // Another saved provider is used, never the host's DeepSeek.
  assert.equal((await (await handleWebToolsApi(other, ENV, stub)).json()).provider, 'openai');
});

// ---- The other providers: each one's own search API, with the user's key ----

const user = (id, model, apiKey = 'key-123') => ({ user_provider: { id, model, apiKey } });
const search = async (provider, answer, extra = {}) => {
  const stub = deepseek(answer);
  const result = await call('/api/web/search', { query: 'blue door café hours', ...provider }, {}, { ...stub, ...extra });
  return { ...result, calls: stub.calls };
};

test('OpenAI and xAI search through the Responses API with the same model', async () => {
  const reply = jsonResponse({
    output: [
      { type: 'web_search_call', id: 'ws_1', status: 'completed' },
      { type: 'message', content: [{ type: 'output_text', text: 'Open 8am to 4pm, Tuesday to Sunday.', annotations: [
        { type: 'url_citation', url: 'https://bluedoor.example/', title: 'Blue Door Café', start_index: 0, end_index: 5 },
        { type: 'url_citation', url: 'https://bluedoor.example/', title: 'Blue Door Café (again)' },
        { type: 'url_citation', url: 'javascript:alert(1)', title: 'Bad' },
      ] }] },
    ],
    usage: { input_tokens: 900, output_tokens: 100, total_tokens: 1000 },
  });
  const openai = await search(user('openai', 'gpt-5.5', 'sk-proj-abc'), () => reply.clone());
  assert.equal(openai.status, 200);
  assert.equal(openai.calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(openai.calls[0].key, 'Bearer sk-proj-abc');
  assert.equal(openai.calls[0].body.model, 'gpt-5.5');
  assert.deepEqual(openai.calls[0].body.tools, [{ type: 'web_search' }]);
  assert.match(openai.calls[0].body.input, /blue door café hours/);
  assert.equal(openai.body.answer, 'Open 8am to 4pm, Tuesday to Sunday.');
  assert.deepEqual(openai.body.results, [{ title: 'Blue Door Café', url: 'https://bluedoor.example/', content: '' }]);

  const xai = await search(user('xai', 'grok-4.7', 'xai-abc'), () => reply.clone());
  assert.equal(xai.calls[0].url, 'https://api.x.ai/v1/responses');
  assert.equal(xai.body.answer, 'Open 8am to 4pm, Tuesday to Sunday.');
});

test('Gemini searches with Google Search grounding on its native API', async () => {
  const gemini = await search(user('gemini', 'models/gemini-3-pro', 'AIza-abc'), () => jsonResponse({
    candidates: [{
      content: { parts: [{ text: 'Open 8am ' }, { text: 'to 4pm.' }] },
      groundingMetadata: { webSearchQueries: ['blue door café hours'], groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'bluedoor.example' } }] },
    }],
    usageMetadata: { totalTokenCount: 800 },
  }));
  assert.equal(gemini.status, 200);
  assert.equal(gemini.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent');
  assert.deepEqual(gemini.calls[0].body.tools, [{ google_search: {} }]);
  assert.equal(gemini.body.answer, 'Open 8am to 4pm.');
  assert.equal(gemini.body.results[0].title, 'bluedoor.example');
});

test('OpenRouter searches with its web plugin on the same model', async () => {
  const router = await search(user('openrouter', 'anthropic/claude-sonnet-5', 'sk-or-abc'), () => jsonResponse({
    choices: [{ message: { content: 'Open 8am to 4pm.', annotations: [{ type: 'url_citation', url_citation: { url: 'https://bluedoor.example/', title: 'Blue Door Café', content: 'Hours: 8 to 4' } }] } }],
    usage: { prompt_tokens: 700, completion_tokens: 50 },
  }));
  assert.equal(router.calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(router.calls[0].body.plugins, [{ id: 'web', max_results: 5 }]);
  assert.equal(router.calls[0].body.model, 'anthropic/claude-sonnet-5');
  assert.equal(router.body.answer, 'Open 8am to 4pm.');
  assert.equal(router.body.results[0].content, 'Hours: 8 to 4');
});

test('Anthropic searches with Claude\'s web_search server tool', async () => {
  const claude = await search(user('anthropic', 'claude-sonnet-5', 'sk-ant-abc'), () => jsonResponse({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'end_turn',
    content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'blue door café hours' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://bluedoor.example/', title: 'Blue Door Café', encrypted_content: 'x', page_age: 'June 1, 2026' }] },
      { type: 'text', text: 'Open 8am to 4pm.' },
    ],
    usage: { input_tokens: 2000, output_tokens: 60, server_tool_use: { web_search_requests: 1 } },
  }));
  assert.equal(claude.status, 200);
  assert.equal(claude.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(claude.calls[0].body.tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }]);
  assert.equal(claude.body.answer, 'Open 8am to 4pm.');
  assert.deepEqual(claude.body.results, [{ title: 'Blue Door Café', url: 'https://bluedoor.example/', content: '', published_date: 'June 1, 2026' }]);
});

test('a model without search stops the prompt with a hint, and pages are DeepSeek only', async () => {
  const unsupported = await search(user('openai', 'gpt-3.5-turbo'), () => jsonResponse({ error: { message: 'web_search not supported' } }, 400));
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.stop, true);
  assert.match(unsupported.body.error, /gpt-3\.5-turbo/);
  const claudeKey = await search(user('anthropic', 'claude-sonnet-5'), () => jsonResponse({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 401));
  assert.equal(claudeKey.body.stop, true);
  const page = await call('/api/web/fetch', { url: 'https://bluedoor.example/', ...user('openai', 'gpt-5.5') }, {}, deepseek(jsonResponse({})));
  assert.equal(page.status, 409);
});

test('on the Free option a provider search counts its tokens plus its search fee', async () => {
  const ended = [];
  const freeLimits = { begin: () => ({ end: (tokens) => ended.push(tokens) }) };
  const env = { OPENAI_LLM_PROVIDER: 'gemini', OPENAI_API_KEY: 'AIza-host', OPENAI_LLM_MODEL: 'gemini-3-pro' };
  const stub = deepseek(() => jsonResponse({ candidates: [{ content: { parts: [{ text: 'x' }] }, groundingMetadata: { webSearchQueries: ['q'] } }], usageMetadata: { totalTokenCount: 800 } }));
  assert.equal((await call('/api/web/search', { query: 'q' }, env, { ...stub, freeLimits, visitor: 'v' })).status, 200);
  assert.equal(ended[0], 800 + 20_000);
});

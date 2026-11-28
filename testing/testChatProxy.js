import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleChatProxy, smallerOutputLimit } from '../electron/server/chatProxy.js';

const env = {};
// Every request runs on the user's own provider (Settings → AI).
const own = { id: 'deepseek', apiKey: 'test-key', model: 'test-model' };
const editTool = {
  type: 'function',
  function: {
    name: 'apply_surgical_edits',
    parameters: { type: 'object', properties: {} },
  },
};
const namedChoice = { type: 'function', function: { name: 'apply_surgical_edits' } };

async function captureRequest(t, payload, settings = {}) {
  const mergedEnv = { ...env, ...settings };
  const expectedUrl = 'https://api.deepseek.com/chat/completions';
  let upstreamBody;
  const responseBody = 'data: {"choices":[{"delta":{"content":"Done"}}]}\n\ndata: [DONE]\n\n';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, expectedUrl);
    upstreamBody = JSON.parse(options.body);
    return new Response(responseBody, { headers: { 'content-type': 'text/event-stream' } });
  });
  const response = await handleChatProxy(new Request('https://app.example/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Change the background' }], user_provider: own, ...payload }),
  }), mergedEnv);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(await response.text(), responseBody);
  return upstreamBody;
}

// DeepSeek thinking supports tools with auto/none choices. Forced choices
// must be relaxed while preserving thinking and the offered tools.
for (const effort of ['low', 'medium', 'high']) {
  for (const choice of ['required', namedChoice]) {
    test(`reasoning ${effort} relaxes ${JSON.stringify(choice)} and drops temperature`, async (t) => {
      const body = await captureRequest(t, { tools: [editTool], tool_choice: choice, stream: true, reasoning_effort: effort, temperature: 0 });
      assert.equal(body.tool_choice, 'auto');
      assert.deepEqual(body.thinking, { type: 'enabled' });
      assert.equal(body.reasoning_effort, effort);
      assert.equal(Object.hasOwn(body, 'temperature'), false);
      assert.deepEqual(body.tools, [editTool]);
      assert.equal(body.stream, true);
    });
  }
}

for (const effort of [undefined, false, 'none', 'off', 'disabled']) {
  test(`disabled reasoning ${effort} sends effort none and keeps forced tools`, async (t) => {
    const body = await captureRequest(t, { tools: [editTool], tool_choice: namedChoice, reasoning_effort: effort });
    assert.deepEqual(body.tool_choice, namedChoice);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.reasoning_effort, undefined);
  });
}

for (const choice of ['auto', 'none', undefined]) {
  test(`reasoning preserves unforced tool choice ${choice}`, async (t) => {
    const body = await captureRequest(t, { tools: [editTool], tool_choice: choice, reasoning_effort: 'high' });
    assert.equal(body.tool_choice, choice);
  });
}

test('initial generation keeps reasoning without adding tool choice', async (t) => {
  const body = await captureRequest(t, { stream: true, reasoning_effort: 'high' });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(Object.hasOwn(body, 'tool_choice'), false);
  assert.equal(Object.hasOwn(body, 'tools'), false);
});

// --- Provider selection (electron/server/providers.js) ---------------------

test('streaming requests ask for usage', async (t) => {
  const body = await captureRequest(t, { stream: true, reasoning_effort: 'low' });
  assert.deepEqual(body.stream_options, { include_usage: true });
});

const noLlmEnv = {};

async function runWith(t, settings, payload = {}) {
  let upstream;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    upstream = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const response = await handleChatProxy(new Request('https://app.example/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own, ...payload }),
  }), { ...noLlmEnv, ...settings });
  return { response, upstream };
}

test('output limits come from Settings requests', async (t) => {
  for (const ask of [false, true]) {
    // Builds default to 64K; Ask keeps the provider's own default.
    const expected = ask ? undefined : 64000;
    const defaultLimit = await runWith(t, {}, { ask });
    assert.equal(defaultLimit.upstream.body.max_tokens, expected);
    const custom = await runWith(t, {}, { ask, max_tokens: 12000 });
    assert.equal(custom.upstream.body.max_tokens, 12000);
    const reset = await runWith(t, {}, { ask, max_tokens: null });
    assert.equal(reset.upstream.body.max_tokens, expected);
  }
});

test('providers get the 64K build default; Ask does not', async (t) => {
  for (const id of ['openai', 'openrouter', 'gemini', 'deepseek']) {
    const field = id === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    for (const ask of [false, true]) {
      const payload = { ask, user_provider: { id, apiKey: 'test-key', model: 'test-model' } };
      const defaultLimit = await runWith(t, {}, payload);
      assert.equal(defaultLimit.response.status, 200);
      assert.equal(defaultLimit.upstream.body[field], ask ? undefined : 64000);
      const custom = await runWith(t, {}, { ...payload, max_tokens: 12345 });
      assert.equal(custom.upstream.body[field], 12345);
    }
  }
});

test('smallerOutputLimit reads the allowed limit from provider errors', () => {
  // DeepSeek, Anthropic model cap, OpenAI, Anthropic context overflow.
  assert.equal(smallerOutputLimit('Invalid max_tokens value, the valid range of max_tokens is [1, 8192]', 64000), 8192);
  assert.equal(smallerOutputLimit('max_tokens: 64000 > 32000, which is the maximum allowed number of output tokens for claude-opus-4-1-20250805', 64000), 32000);
  assert.equal(smallerOutputLimit('This model supports at most 16,384 completion tokens.', 64000), 16384);
  assert.equal(smallerOutputLimit('input length and `max_tokens` exceed context limit: 150000 + 64000 > 200000, decrease input length or `max_tokens` and try again', 64000), 50000);
  // No room left after the input, or nothing left to halve.
  assert.equal(smallerOutputLimit('input length and `max_tokens` exceed context limit: 199500 + 64000 > 200000', 64000), null);
  assert.equal(smallerOutputLimit('max_tokens too large', 1500), null);
});

test('a provider that rejects the default limit gets the request again with a smaller one', async (t) => {
  const bodies = [];
  const reject = (status, error) => Response.json({ error: { message: error } }, { status });
  const run = async (payload, firstReply, rejections = 1) => {
    bodies.length = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      bodies.push(JSON.parse(options.body));
      return bodies.length <= rejections ? firstReply() : new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    });
    return handleChatProxy(new Request('https://app.example/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'openai', apiKey: 'k', model: 'gpt-4o' }, ...payload }),
    }), noLlmEnv);
  };
  const retried = await run({}, () => reject(400, 'max_tokens is too large: 64000. This model supports at most 16384 completion tokens.'));
  assert.equal(retried.status, 200);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].max_completion_tokens, 64000);
  assert.equal(bodies[1].max_completion_tokens, 16384);
  assert.equal(bodies[1].max_tokens, undefined);
  // Without a number in the error, the limit halves, a few times at most.
  const halved = await run({}, () => reject(400, 'max_tokens too large for this model'), 2);
  assert.equal(halved.status, 200);
  assert.deepEqual(bodies.map((b) => b.max_completion_tokens), [64000, 32000, 16000]);
  const exhausted = await run({}, () => reject(400, 'max_tokens too large for this model'), 99);
  assert.equal(exhausted.status, 400);
  assert.equal(bodies.length, 4);
  // A limit the user chose is never silently dropped, and other 400s pass through.
  const custom = await run({ max_tokens: 99999 }, () => reject(400, 'max_tokens is too large'));
  assert.equal(custom.status, 400);
  assert.equal(bodies.length, 1);
  const unrelated = await run({}, () => reject(400, 'Invalid model'));
  assert.equal(unrelated.status, 400);
  assert.equal(bodies.length, 1);
});

test('invalid output limits are rejected before contacting a provider', async (t) => {
  for (const max_tokens of [0, -1, 1.5, '2000', true, {}, Number.MAX_SAFE_INTEGER + 1]) {
    const { response, upstream } = await runWith(t, {}, { max_tokens });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /positive whole number/);
    assert.equal(upstream, undefined);
  }
});

// --- User-supplied provider (Settings → AI) --------------------------------

const userProvider = { id: 'openrouter', apiKey: 'user-key', model: '~anthropic/claude-sonnet-latest' };

test('a user provider is sent to its preset endpoint', async (t) => {
  const { response, upstream } = await runWith(t, {}, { user_provider: userProvider, reasoning_effort: 'low' });
  assert.equal(response.status, 200);
  assert.equal(upstream.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(upstream.headers.Authorization, 'Bearer user-key');
  assert.equal(upstream.body.model, '~anthropic/claude-sonnet-latest');
  assert.equal(Object.hasOwn(upstream.body, 'thinking'), false);
  assert.equal(upstream.body.reasoning_effort, 'low');
  assert.equal(Object.hasOwn(upstream.body, 'user_provider'), false);
});

test('without a user provider the request is refused, whatever the env says', async (t) => {
  const envProvider = { OPENAI_API_KEY: 'env-key', OPENAI_LLM_MODEL: 'env-model', OPENAI_BASE_URL: 'https://llm.example/v1' };
  const { response, upstream } = await runWith(t, envProvider, { user_provider: undefined });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Settings → AI/);
  assert.equal(upstream, undefined);
});

test('incomplete user provider settings are a 400, not a config error', async (t) => {
  const { response, upstream } = await runWith(t, {}, { user_provider: { ...userProvider, apiKey: '' } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /API key is empty/);
  assert.equal(upstream, undefined);
});

test('a provider rejecting the user key is not reported as a 401', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"bad key"}', { status: 401 }));
  const response = await handleChatProxy(new Request('https://app.example/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: userProvider }),
  }), noLlmEnv);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /OpenRouter rejected the API key/);
});

// Self-hosted mode has no sign-in, so browser requests from other sites
// (including text/plain "simple" POSTs that skip CORS preflight, and
// sandboxed apps with Origin "null") must not reach the provider.
test('self-hosted refuses browser requests from other origins before calling the provider', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('provider must not be called');
  });
  const send = (origin, settings = {}, url = 'http://localhost:5175/api/chat') => handleChatProxy(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own }),
  }), { ...env, ...settings });

  for (const origin of ['https://evil.example', 'null', 'http://localhost:5176', 'https://localhost:5175']) {
    const response = await send(origin);
    assert.equal(response.status, 403, origin);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('self-hosted accepts its own origin, listed origins, the desktop scheme and no-origin clients', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const send = (origin, settings = {}, url = 'http://localhost:5175/api/chat') => handleChatProxy(new Request(url, {
    method: 'POST',
    headers: origin ? { origin } : {},
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own }),
  }), { ...env, ...settings });

  assert.equal((await send('http://localhost:5175')).status, 200);
  assert.equal((await send(null)).status, 200);
  assert.equal((await send('https://proxy.example', { APPBLIPS_CHAT_ALLOWED_ORIGINS: 'https://other.example, https://proxy.example' })).status, 200);
  assert.equal((await send('appblips://app', {}, 'appblips://app/api/chat')).status, 200);
});

// A provider's own 429 (e.g. a low balance or concurrency limit) is passed
// to the user with its reason, marked as coming from the provider.
test('provider 429 reaches self-hosted users with the provider reason', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ error: { code: '1113', message: 'Insufficient balance or no resource package.' } }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30' } },
  ));
  const response = await handleChatProxy(new Request('http://localhost:5175/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own }),
  }), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '30');
  const body = await response.json();
  assert.equal(body.source, 'provider');
  assert.match(body.error, /turned the request down: Insufficient balance or no resource package\./);
});

// Self-hosted users spend their own key, so the builder proxy does not
// throttle them; only the provider's own limits apply.
test('builder requests are not rate limited', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const send = (settings) => handleChatProxy(new Request('http://localhost:5175/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own }),
  }), { ...env, ...settings });
  for (let i = 0; i < 5; i++) assert.equal((await send({})).status, 200, `request ${i + 1}`);
});


// --- Upstream timeouts, client cancellation and relayed headers ----------

test('a provider that never answers is given up on; a cancelled client cancels the upstream call', async (t) => {
  let upstreamSignal;
  t.mock.method(globalThis, 'fetch', (url, options) => new Promise((_resolve, reject) => {
    upstreamSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  }));
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own });
  const slow = await handleChatProxy(new Request('https://app.example/api/chat', { method: 'POST', body }), env, { connectTimeoutMs: 20 });
  assert.equal(slow.status, 502);
  assert.match((await slow.json()).error, /Couldn't reach DeepSeek/);

  const client = new AbortController();
  const pending = handleChatProxy(new Request('https://app.example/api/chat', { method: 'POST', body, signal: client.signal }), env);
  await new Promise((resolve) => setTimeout(resolve, 5));
  client.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, 499);
  assert.equal(upstreamSignal.aborted, true);
});

test('only the headers the app reads are relayed from the provider', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('data: [DONE]\n\n', {
    headers: {
      'content-type': 'text/event-stream',
      'set-cookie': '__cf_bm=abc; Path=/',
      'access-control-allow-origin': 'https://provider.example',
      'x-ratelimit-remaining-requests': '9',
      'x-request-id': 'req_1',
      'content-encoding': 'gzip',
    },
  }));
  const response = await handleChatProxy(new Request('https://app.example/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: own }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(response.headers.get('x-ratelimit-remaining-requests'), '9');
  assert.equal(response.headers.get('x-request-id'), 'req_1');
  for (const name of ['set-cookie', 'access-control-allow-origin', 'content-encoding']) assert.equal(response.headers.get(name), null, name);
});

test('temperature is 0.0', async (t) => {
  const { upstream } = await runWith(t, {}, { user_provider: { id: 'openrouter', apiKey: 'u', model: 'x' } });
  assert.equal(upstream.body.temperature, 0);
});


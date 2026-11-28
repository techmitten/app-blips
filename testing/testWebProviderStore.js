import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webProviderStore } from '../src/lib/desktop.js';
import { installBrowserKeyStorage } from '../src/lib/browserKeys.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';
import { handleProviderApi } from '../electron/server/providerApi.js';
import { createBrowserKeys, decodeKeyState } from '../electron/server/browserKeys.js';
import { withSavedProvider } from '../electron/server/savedProvider.js';

const ORIGIN = 'http://localhost:5175';
const KEY_SLOT = 'appblips-key-provider';

// A plain in-memory store, for calling the handler directly.
const memoryKeys = () => {
  let state = { id: '', key: '' };
  return {
    keyFor: (id) => (id && id === state.id ? state.key : ''),
    describe: () => ({ id: state.id, hasKey: Boolean(state.key) }),
    async save(id, key) { state = { id, key }; },
    async clear() { state = { id: '', key: '' }; },
  };
};

// The browser version end to end: the page's store and lib/browserKeys.js
// over a fake localStorage, its /api calls answered by the real handlers
// through browserKeys.js as server.js wires them. `upstream` stands in for
// the provider. One `server` can be shared by several `browsers`.
const createServer = () => {
  const withKeys = createBrowserKeys();
  const env = {};
  return async (url, options = {}) => {
    const request = new Request(ORIGIN + url, { ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), origin: ORIGIN } });
    if (url === '/api/chat') return withKeys('provider', request, async (keys) => handleChatProxy(await withSavedProvider(request, keys), env));
    return withKeys('provider', request, (keys) => handleProviderApi(request, env, keys));
  };
};

async function setup(t, { legacy = null, server = createServer() } = {}) {
  const values = new Map(legacy ? [['appblips-web-provider', JSON.stringify(legacy)]] : []);
  const saved = { window: globalThis.window, location: globalThis.location, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const ctx = { values, upstream: null, server };
  ctx.savedKey = () => decodeKeyState(values.get(KEY_SLOT));
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.location = new URL(`${ORIGIN}/`);
  globalThis.window = globalThis;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url instanceof Request ? url.url : url).replace(ORIGIN, '');
    if (path.startsWith('/api/')) return server(path, options);
    return ctx.upstream(url, options);
  };
  installBrowserKeyStorage();
  t.after(() => Object.assign(globalThis, saved));
  return ctx;
}

const writeProvider = (ctx, info) => ctx.values.set('appblips-web-provider', JSON.stringify(info));

const chat = (provider) => fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...(provider ? { user_provider: provider } : {}), messages: [{ role: 'user', content: 'Reply OK' }], ask: true }),
});

test('a saved key stays in the browser and is attached to chat requests', async (t) => {
  const ctx = await setup(t);
  const info = await webProviderStore.set({ enabled: true, id: 'openrouter', model: 'saved-model', apiKey: 'saved-test-key' });
  assert.equal(info.hasKey, true);
  assert.equal(info.apiKey, undefined);
  assert.doesNotMatch(ctx.values.get('appblips-web-provider'), /saved-test-key/);
  assert.deepEqual(ctx.savedKey(), { id: 'openrouter', key: 'saved-test-key' });

  // The page sends no key, for the saved provider or a draft.
  const draft = { id: 'openrouter', model: 'draft-model', apiKey: '' };
  assert.deepEqual(webProviderStore.forRequest(), { id: 'openrouter', model: 'saved-model' });
  assert.equal(webProviderStore.forRequest(draft).apiKey, '');

  const seen = [];
  ctx.upstream = async (_url, options) => {
    seen.push({ auth: options.headers.Authorization, model: JSON.parse(options.body).model });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  };
  assert.equal((await chat(webProviderStore.forRequest())).status, 200);
  assert.equal((await chat(webProviderStore.forRequest(draft))).status, 200);
  assert.equal((await chat({ ...draft, apiKey: 'replacement-key' })).status, 200);
  assert.deepEqual(seen, [
    { auth: 'Bearer saved-test-key', model: 'saved-model' },
    { auth: 'Bearer saved-test-key', model: 'draft-model' },
    { auth: 'Bearer replacement-key', model: 'draft-model' },
  ]);

  // Saving again without typing a key keeps it; another provider never gets it.
  assert.equal((await webProviderStore.set({ enabled: true, id: 'openrouter', model: 'other-model', apiKey: '' })).hasKey, true);
  assert.deepEqual(ctx.savedKey(), { id: 'openrouter', key: 'saved-test-key' });
  await assert.rejects(webProviderStore.set({ enabled: true, id: 'gemini', model: 'g', apiKey: '' }), /key is empty/);

  await webProviderStore.clear();
  assert.equal(ctx.values.has(KEY_SLOT), false);
  assert.equal(webProviderStore.forRequest(), null);
  assert.equal((await webProviderStore.get()).hasKey, false);
});

test('a key saved by an older version moves to the new browser slot', async (t) => {
  const ctx = await setup(t, { legacy: { enabled: true, id: 'gemini', model: 'm', apiKey: 'legacy-key', baseUrl: '', onboardingComplete: true } });
  const info = await webProviderStore.get();
  assert.equal(info.hasKey, true);
  assert.equal(info.model, 'm');
  assert.deepEqual(ctx.savedKey(), { id: 'gemini', key: 'legacy-key' });
  assert.doesNotMatch(ctx.values.get('appblips-web-provider'), /legacy-key/);
  assert.equal(JSON.parse(ctx.values.get('appblips-web-provider')).onboardingComplete, true);
});

test('other sites cannot use or change the saved key', async () => {
  const ctx = { keys: memoryKeys() };
  await ctx.keys.save('openai', 'secret');
  for (const origin of ['https://evil.example', 'null']) {
    for (const [method, path, body] of [['GET', '/api/provider'], ['DELETE', '/api/provider'], ['PUT', '/api/provider', { id: 'openai', apiKey: 'x' }], ['POST', '/api/provider/models', { id: 'openai' }]]) {
      const response = await handleProviderApi(new Request(ORIGIN + path, {
        method,
        headers: { origin, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }), {}, ctx.keys);
      assert.equal(response.status, 403, `${origin} ${method} ${path}`);
    }
  }
  assert.equal(ctx.keys.keyFor('openai'), 'secret');
  // No endpoint ever returns the key itself.
  const described = await (await handleProviderApi(new Request(ORIGIN + '/api/provider', { headers: { origin: ORIGIN } }), {}, ctx.keys)).text();
  assert.doesNotMatch(described, /secret/);
});

test('one shared server never hands a key to another browser', async (t) => {
  const server = createServer();
  const first = await setup(t, { server });
  await webProviderStore.set({ enabled: true, id: 'openrouter', model: 'm', apiKey: 'first-key' });
  assert.deepEqual(first.savedKey(), { id: 'openrouter', key: 'first-key' });

  // A second visitor: their own storage and session, the same server.
  const second = await setup(t, { server });
  writeProvider(second, { enabled: true, id: 'openrouter', model: 'm' });
  assert.equal((await webProviderStore.get()).hasKey, false);
  let auth = null;
  second.upstream = async (_url, options) => {
    auth = options.headers.Authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  };
  const response = await chat(webProviderStore.forRequest());
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /key is empty/);
  assert.equal(auth, null);
});

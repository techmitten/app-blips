// src/lib/browserKeys.js + browserDirect.js: in the browser version, own-key
// requests (AI provider, Tavily, Pixabay) are answered inside the page and go
// straight to the provider, so the key never reaches AppBlips' server. Free
// requests, Surge and Pollinations still go to the server. Runs in node with
// a stand-in window and an in-memory localStorage.
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { encodeKeyState, decodeKeyState, KEY_HEADER } from '../electron/server/browserKeys.js';

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
};
globalThis.window = globalThis;
globalThis.location = new URL('https://app.example/');

const ORIGIN = 'https://app.example';
const SERVER_SETTINGS = { id: '', hasKey: false, envConfigured: true };
let serverSettings = SERVER_SETTINGS;
// Every request the page's own fetch makes: to AppBlips' server (same origin)
// or straight to a provider.
let seen = [];
let providerReply = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const request = new Request(input instanceof Request ? input : new URL(String(input), location.href).href, init);
  const body = request.method === 'GET' ? '' : await request.clone().text();
  seen.push({ url: request.url, method: request.method, headers: request.headers, body });
  if (request.url === `${ORIGIN}/api/provider`) return Response.json(serverSettings);
  if (request.url.startsWith(ORIGIN)) return Response.json({ answeredBy: 'server' });
  return providerReply(request, body);
};

const { installBrowserKeyStorage } = await import('../src/lib/browserKeys.js');
installBrowserKeyStorage();

const OPENAI_KEY = 'sk-proj-test-0123456789abcdef';
const saveProviderKey = (id, key) => stored.set('appblips-key-provider', encodeKeyState({ id, key }));
const toServer = () => seen.filter((r) => r.url.startsWith(ORIGIN));
const toProviders = () => seen.filter((r) => !r.url.startsWith(ORIGIN));
const sentKeyToServer = () => toServer().some((r) => r.headers.has(KEY_HEADER) || r.body.includes(OPENAI_KEY));

beforeEach(() => {
  stored.clear();
  seen = [];
  serverSettings = SERVER_SETTINGS;
  providerReply = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
});

test('an own-key chat goes straight to the provider with the saved key, never to the server', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  providerReply = () => Response.json({ choices: [{ message: { content: 'hello' } }] });
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'openai', model: 'gpt-4o' } }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, 'hello');
  const [call] = toProviders();
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.headers.get('authorization'), `Bearer ${OPENAI_KEY}`);
  assert.equal(sentKeyToServer(), false);
});

test('a Free chat (no user_provider) goes to the server without any key', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal((await response.json()).answeredBy, 'server');
  assert.equal(toProviders().length, 0);
  assert.equal(sentKeyToServer(), false);
});

test('the host output limit is applied to own-key chats', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  serverSettings = { ...SERVER_SETTINGS, maxOutputTokensFixed: true, maxOutputTokens: 1234 };
  // Settings → AI reads the server's settings first, as the app does.
  await fetch('/api/provider');
  await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'openai', model: 'gpt-4o' } }),
  });
  const sent = JSON.parse(toProviders()[0].body);
  assert.equal(sent.max_completion_tokens ?? sent.max_tokens, 1234);
});

test('GET /api/provider merges the server settings with this browser\'s key status', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  const info = await (await fetch('/api/provider')).json();
  assert.equal(info.envConfigured, true);
  assert.equal(info.id, 'openai');
  assert.equal(info.hasKey, true);
  assert.equal(sentKeyToServer(), false);
});

test('saving and clearing a key stays in this browser, in the encoding older versions used', async () => {
  const put = await fetch('/api/provider', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'openai', model: 'gpt-4o', apiKey: OPENAI_KEY, enabled: true }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(decodeKeyState(stored.get('appblips-key-provider')), { id: 'openai', key: OPENAI_KEY });
  assert.equal(toServer().length, 0);
  await fetch('/api/provider', { method: 'DELETE' });
  assert.equal(stored.has('appblips-key-provider'), false);
  assert.equal(toServer().length, 0);
});

test('listing models calls the provider directly', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  providerReply = () => Response.json({ data: [{ id: 'gpt-4o' }] });
  const response = await fetch('/api/provider/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'openai' }),
  });
  assert.equal(response.status, 200);
  assert.equal(toProviders()[0].url, 'https://api.openai.com/v1/models');
  assert.equal(toProviders()[0].headers.get('authorization'), `Bearer ${OPENAI_KEY}`);
  assert.equal(toServer().length, 0);
});

test('an unreachable provider gives a message pointing at the key and credit', async () => {
  saveProviderKey('openai', OPENAI_KEY);
  // What a browser reports when a reply lacks CORS headers (OpenAI's errors).
  providerReply = () => { throw new TypeError('Failed to fetch'); };
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'openai', model: 'gpt-4o' } }),
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Couldn't reach OpenAI\. .*API key and credit in Settings → AI/);
});

test('Tavily searches go straight to Tavily with the saved key', async () => {
  const key = 'tvly-dev-0a1b2c3d4e5f6a7b8c9d0e1f';
  stored.set('appblips-key-tavily', encodeKeyState({ id: key.slice(-4), key }));
  providerReply = () => Response.json({ results: [] });
  await fetch('/api/tavily/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'opening hours' }),
  });
  assert.equal(toProviders()[0].url, 'https://api.tavily.com/search');
  assert.equal(toServer().length, 0);
});

test('Surge still goes to the server with its saved sign-in', async () => {
  stored.set('appblips-key-surge', encodeKeyState({ id: 'me@example.com', key: 'surge-token' }));
  await fetch('/api/surge');
  const [call] = toServer();
  assert.equal(call.url, `${ORIGIN}/api/surge`);
  assert.equal(call.headers.get(KEY_HEADER), stored.get('appblips-key-surge'));
});

test('an own-key Anthropic chat goes straight to Anthropic with the browser-access header', async () => {
  const key = 'sk-ant-api03-test-0123456789abcdef';
  saveProviderKey('anthropic', key);
  providerReply = () => Response.json({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5',
    content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
  });
  await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'anthropic', model: 'claude-sonnet-4-5' } }),
  });
  const [call] = toProviders();
  assert.equal(new URL(call.url).origin, 'https://api.anthropic.com');
  assert.equal(call.headers.get('x-api-key'), key);
  assert.equal(call.headers.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.equal(toServer().filter((r) => r.url !== `${ORIGIN}/api/provider`).length, 0);
  assert.equal(toServer().some((r) => r.body.includes(key) || r.headers.has(KEY_HEADER)), false);
});

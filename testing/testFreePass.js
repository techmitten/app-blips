import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFreePasses, FREE_PASS_ERROR } from '../electron/server/freePass.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';
import { handleWebToolsApi } from '../electron/server/webToolsApi.js';

const KEYS = { TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key' };

test('off unless both Turnstile keys are set, with a warning for half a setup', () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);
  assert.equal(createFreePasses({}, { warn }), null);
  assert.equal(warnings.length, 0);
  assert.equal(createFreePasses({ TURNSTILE_SITE_KEY: 'x' }, { warn }), null);
  assert.equal(createFreePasses({ TURNSTILE_SECRET_KEY: 'x' }, { warn }), null);
  assert.equal(warnings.length, 2);
  assert.equal(createFreePasses(KEYS).siteKey, 'site-key');
});

test('a pass works for its visitor until it expires, and can’t be forged or shared', () => {
  let clock = 1_000_000;
  const passes = createFreePasses(KEYS, { now: () => clock });
  const { pass, expiresAt } = passes.issue('203.0.113.7');
  assert.equal(expiresAt, clock + 3_600_000);
  assert.equal(passes.check(pass, '203.0.113.7'), true);
  // Another address, a changed expiry, a changed signature, junk.
  assert.equal(passes.check(pass, '198.51.100.9'), false);
  const [expires, signature] = pass.split('.');
  assert.equal(passes.check(`${Number(expires) + 1000}.${signature}`, '203.0.113.7'), false);
  assert.equal(passes.check(`${expires}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`, '203.0.113.7'), false);
  assert.equal(passes.check('', '203.0.113.7'), false);
  assert.equal(passes.check(undefined, '203.0.113.7'), false);
  // Another server (a different signing key) doesn't accept it.
  assert.equal(createFreePasses(KEYS).check(pass, '203.0.113.7'), false);
  // But one with the same APPBLIPS_FREE_PASS_SECRET does.
  const shared = { ...KEYS, APPBLIPS_FREE_PASS_SECRET: 'same' };
  const a = createFreePasses(shared, { now: () => clock });
  const b = createFreePasses(shared, { now: () => clock });
  assert.equal(b.check(a.issue('v').pass, 'v'), true);
  // Expired.
  clock += 3_600_001;
  assert.equal(passes.check(pass, '203.0.113.7'), false);
});

const passRequest = (body, method = 'POST') => new Request('https://app.example/api/free-pass', {
  method,
  headers: { 'content-type': 'application/json' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

test('/api/free-pass trades a genuine Turnstile answer for a pass', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const verified = [];
  const fetch = async (url, options) => {
    verified.push({ url, form: Object.fromEntries(options.body) });
    return Response.json({ success: options.body.get('response') === 'good' });
  };
  const passes = createFreePasses(KEYS, { fetch });

  const ok = await passes.handle(passRequest({ token: 'good' }), { visitor: 'v', ip: '203.0.113.7' });
  assert.equal(ok.status, 200);
  const { pass } = await ok.json();
  assert.equal(passes.check(pass, 'v'), true);
  assert.equal(verified[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.deepEqual(verified[0].form, { secret: 'secret-key', response: 'good', remoteip: '203.0.113.7' });

  assert.equal((await passes.handle(passRequest({ token: 'bad' }), { visitor: 'v', ip: '' })).status, 403);
  assert.equal((await passes.handle(passRequest({}), { visitor: 'v', ip: '' })).status, 400);
  assert.equal((await passes.handle(passRequest(null, 'GET'), { visitor: 'v', ip: '' })).status, 405);
  assert.equal(verified.length, 2, 'nothing is sent to Cloudflare without a token');
});

test('TURNSTILE_VERIFY_URL sends the confirmation through a relay instead', async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    return Response.json({ success: true });
  };
  const relayed = createFreePasses({ ...KEYS, TURNSTILE_VERIFY_URL: 'https://verify.example.com' }, { fetch });
  assert.equal((await relayed.handle(passRequest({ token: 't' }), { visitor: 'v', ip: '' })).status, 200);
  assert.deepEqual(urls, ['https://verify.example.com']);
  // Not https: ignored, with a warning.
  const warnings = [];
  const plain = createFreePasses({ ...KEYS, TURNSTILE_VERIFY_URL: 'http://verify.example.com' }, { fetch, warn: (m) => warnings.push(m) });
  await plain.handle(passRequest({ token: 't' }), { visitor: 'v', ip: '' });
  assert.equal(urls[1], 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(warnings.length, 1);
});

test('/api/free-pass says so when Cloudflare can’t be reached', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const passes = createFreePasses(KEYS, { fetch: async () => { throw new Error('offline'); } });
  const response = await passes.handle(passRequest({ token: 'good' }), { visitor: 'v', ip: '' });
  assert.equal(response.status, 502);
});

// --- The Free option needs the pass; the visitor's own key never does ---------

const ENV = { OPENAI_API_KEY: 'k', OPENAI_LLM_MODEL: 'm', OPENAI_LLM_PROVIDER: 'deepseek' };
const chat = (body, options) => handleChatProxy(new Request('https://app.example/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], ...body }),
}), ENV, options);

test('/api/chat: Free needs a pass when the server asks for one', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));

  const refused = await chat({}, { freePass: { ok: false, siteKey: 'site-key' } });
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: FREE_PASS_ERROR, source: 'free-pass', siteKey: 'site-key' });
  assert.equal(upstream.mock.callCount(), 0, 'the server’s key isn’t spent');

  const allowed = await chat({}, { freePass: { ok: true, siteKey: 'site-key' } });
  assert.equal(allowed.status, 200);
  await allowed.text();

  const own = await chat({ user_provider: { id: 'openrouter', apiKey: 'mine', model: 'x' } }, { freePass: { ok: false, siteKey: 'site-key' } });
  assert.equal(own.status, 200);
  await own.text();

  // No check configured (the desktop app, Docker): as before.
  const unchecked = await chat({});
  assert.equal(unchecked.status, 200);
  await unchecked.text();
});

test('/api/web: Free searches need a pass; status and the visitor’s own key don’t', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ results: [{ title: 't', url: 'https://example.com', content: 'c' }] });
  };
  const web = (path, body, freePass) => handleWebToolsApi(new Request(`http://localhost:5175${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { ...ENV, OPENAI_LLM_MODEL: 'deepseek-chat' }, { fetch, freePass });
  const noPass = { ok: false, siteKey: 'site-key' };

  const status = await web('/api/web/status', {}, noPass);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).paidBy, 'free');

  const refused = await web('/api/web/search', { query: 'x' }, noPass);
  assert.equal(refused.status, 403);
  const body = await refused.json();
  assert.equal(body.source, 'free-pass');
  assert.equal(body.stop, true);
  assert.equal(calls.length, 0);

  const own = await web('/api/web/search', { query: 'x', user_provider: { id: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-own-0123456789' } }, noPass);
  assert.equal(own.status, 200);
  assert.equal((await web('/api/web/search', { query: 'x' }, { ok: true, siteKey: 'site-key' })).status, 200);
});

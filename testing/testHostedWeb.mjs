// Run with: node testing/testHostedWeb.mjs
// Plan web search (electron/server/hosted/webTools.js) without network calls:
// Clerk's JWKS and DeepSeek's Search/Fetch APIs are faked, the store is an
// in-memory node:sqlite one. Checks sign-in and plan gating, that each call
// DeepSeek bills is charged one use and every other outcome is given back,
// the usage limit, input checks before any charge, result cleaning, where the
// server's key goes, and what /api/billing/me tells the app.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signJwt } from 'node:crypto';
import { openStore } from '../electron/server/hosted/store.js';
import { handleWebTools, webSearchAvailable } from '../electron/server/hosted/webTools.js';
import { handleBilling } from '../electron/server/hosted/billing.js';
import { PLANS, MAX_WEB_FETCHES, MAX_WEB_SEARCHES, WEB_CALL_USES } from '../electron/server/hosted/plans.js';

const env = {
  VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('clerk.test$').toString('base64')}`,
  POLAR_ACCESS_TOKEN: 'polar_oat_placeholder',
  OPENAI_API_KEY: 'sk-deepseek-server-key',
  OPENAI_LLM_MODEL: 'deepseek-flash',
};

// ---- fake Clerk JWKS ---------------------------------------------------------
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url) === 'https://clerk.test/.well-known/jwks.json') return jsonResponse({ keys: [publicJwk] });
  throw new Error(`Unexpected global fetch in test: ${url}`);
};
const b64url = (value) => Buffer.from(value).toString('base64url');
const makeToken = (sub) => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }));
  const payload = b64url(JSON.stringify({ iss: 'https://clerk.test', sub, iat: now, nbf: now - 5, exp: now + 3600 }));
  return `${header}.${payload}.${b64url(signJwt('sha256', Buffer.from(`${header}.${payload}`), privateKey))}`;
};

// ---- fake DeepSeek -----------------------------------------------------------
// Each test sets `nextAnswer` (a function of the parsed body, or a thrown error).
const calls = [];
let nextAnswer = null;
const deepseek = async (url, init = {}) => {
  const body = JSON.parse(init.body);
  calls.push({ url: String(url), auth: init.headers?.authorization, body });
  assert.ok(init.signal, 'every DeepSeek call has a timeout signal');
  return nextAnswer(body);
};

const store = openStore(':memory:');
const call = (kind, body, { user = 'user_web', headers = {}, method = 'POST', envOverride = env } = {}) => handleWebTools(new Request(`http://localhost/api/web/${kind}`, {
  method,
  headers: {
    'content-type': 'application/json',
    ...(user ? { authorization: `Bearer ${makeToken(user)}` } : {}),
    ...headers,
  },
  ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
}), envOverride, store, { fetch: deepseek });
const used = async (user = 'user_web') => {
  const response = await handleBilling(new Request('http://localhost/api/billing/me', {
    headers: { authorization: `Bearer ${makeToken(user)}` },
  }), env, store);
  return (await response.json()).usage.used;
};
const me = async (user, envOverride = env) => (await handleBilling(new Request('http://localhost/api/billing/me', {
  headers: { authorization: `Bearer ${makeToken(user)}` },
}), envOverride, store)).json();

try {
  store.saveAccount({ userId: 'user_web', plan: 'basic', active: true });
  store.saveAccount({ userId: 'user_lapsed', plan: 'basic', active: false });

  // ---- the costs the app is told match the plan ----------------------------
  assert.equal(WEB_CALL_USES, 1);
  assert.deepEqual(MAX_WEB_SEARCHES + MAX_WEB_FETCHES, 6);
  assert.equal(webSearchAvailable(env), true);
  assert.deepEqual((await me('user_web')).webSearch, { uses: 1, searches: 3, fetches: 3 });
  assert.equal((await me('user_lapsed')).webSearch, null, 'no plan, no web search');
  // A server whose AI isn't DeepSeek's own API can't pay for Search/Fetch.
  const otherHost = { ...env, OPENAI_BASE_URL: 'https://example.com/v1' };
  assert.equal(webSearchAvailable(otherHost), false);
  assert.equal((await me('user_web', otherHost)).webSearch, null);
  let res = await call('search', { query: 'x' }, { envOverride: otherHost });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);

  // ---- gating --------------------------------------------------------------
  res = await call('search', { query: 'pizza near me' }, { user: null });
  assert.equal(res.status, 401);
  res = await call('search', { query: 'pizza near me' }, { user: 'user_lapsed' });
  assert.equal(res.status, 402);
  res = await call('search', { query: 'pizza' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  res = await call('search', null, { method: 'GET' });
  assert.equal(res.status, 405);
  res = await call('other', { query: 'x' });
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0, 'nothing reached DeepSeek');
  assert.equal(await used(), 0);

  // ---- bad input is refused before any charge -------------------------------
  for (const url of ['ftp://example.com/file', 'https://user:pass@example.com/', 'javascript:alert(1)', `https://example.com/${'a'.repeat(8200)}`, 'not a url']) {
    res = await call('fetch', { url });
    assert.equal(res.status, 400, url.slice(0, 40));
  }
  res = await call('search', { query: '   ' });
  assert.equal(res.status, 400);
  res = await call('search', '{broken');
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
  assert.equal(await used(), 0);

  // ---- a billed search costs one use ----------------------------------------
  nextAnswer = () => jsonResponse({
    results: [
      { title: 'Luigi’s Pizza', url: 'https://luigis.example/', summary: 'S'.repeat(2000), snippet: 'short', site_name: 'Luigi', date: '2026-06-01T00:00:00+00:00', rerank_score: 2, authority: 3 },
      { title: 'Bad', url: 'javascript:alert(1)', summary: 'x' },
      { title: 'No summary', url: 'http://plain.example/page', snippet: 'Only a snippet' },
    ],
  });
  res = await call('search', { query: `  best   pizza ${'q'.repeat(200)}` });
  assert.equal(res.status, 200);
  let data = await res.json();
  assert.equal(data.charged, 1);
  assert.equal(data.results.length, 2, 'results without a web address are dropped');
  assert.equal(data.results[0].summary.length, 800);
  assert.equal(data.results[0].site_name, 'Luigi');
  assert.equal(data.results[1].summary, 'Only a snippet');
  assert.equal('rerank_score' in data.results[0], false, 'only the fields the app uses');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/v1/tools/search');
  assert.equal(calls[0].auth, 'Bearer sk-deepseek-server-key');
  assert.equal(calls[0].body.query.length, 128, 'the query is cut to DeepSeek\'s limit');
  assert.equal(calls[0].body.query.startsWith('best pizza'), true);
  assert.equal(calls[0].body.count, 5);
  assert.equal(calls[0].body.need_content, false);
  assert.equal('localization' in calls[0].body, false, 'the user\'s IP is never sent');
  assert.equal(await used(), 1);

  // ---- calls DeepSeek doesn't bill are given back ---------------------------
  nextAnswer = () => jsonResponse({ results: [] });
  res = await call('search', { query: 'nothing matches this' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).charged, 0);
  assert.equal(await used(), 1, 'an empty search is free');

  nextAnswer = () => jsonResponse({ error: { message: 'no content' } }, 404);
  res = await call('fetch', { url: 'https://luigis.example/menu' });
  assert.equal(res.status, 422);
  assert.equal(await used(), 1, 'a page that can\'t be read is free');

  nextAnswer = () => jsonResponse({ error: { message: 'Insufficient Balance' } }, 402);
  res = await call('search', { query: 'pizza' });
  assert.equal(res.status, 503);
  data = await res.json();
  assert.equal(data.error.includes('Balance'), false, 'DeepSeek\'s own message stays on the server');
  assert.equal(await used(), 1);

  nextAnswer = () => jsonResponse({}, 500);
  res = await call('search', { query: 'pizza' });
  assert.equal(res.status, 503);
  nextAnswer = () => jsonResponse({}, 429);
  res = await call('search', { query: 'pizza' });
  assert.equal(res.status, 503);
  nextAnswer = () => { throw new DOMException('timed out', 'TimeoutError'); };
  res = await call('fetch', { url: 'https://slow.example/' });
  assert.equal(res.status, 504);
  nextAnswer = () => new Response('not json', { status: 200 });
  res = await call('search', { query: 'pizza' });
  assert.equal(res.status, 502);
  nextAnswer = () => jsonResponse({ title: 'Empty', content: '   ' });
  res = await call('fetch', { url: 'https://empty.example/' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).charged, 0);
  assert.equal(await used(), 1, 'none of those were charged');

  // ---- a billed page read costs one use; long pages are cut -----------------
  nextAnswer = (body) => jsonResponse({ title: 'Menu', content: `# Menu\r\n\r\n\r\n\r\n${'m'.repeat(20_000)}`, echo: body.url });
  res = await call('fetch', { url: 'https://luigis.example/menu' });
  assert.equal(res.status, 200);
  data = await res.json();
  assert.equal(data.charged, 1);
  assert.equal(data.title, 'Menu');
  assert.equal(data.url, 'https://luigis.example/menu');
  assert.equal(data.truncated, true);
  assert.equal(data.content.startsWith('# Menu\n\nm'), true, 'line endings and blank runs are tidied');
  assert.ok(data.content.length <= 12_001);
  assert.equal(calls.at(-1).url, 'https://api.deepseek.com/v1/tools/fetch');
  assert.deepEqual(calls.at(-1).body, { url: 'https://luigis.example/menu' });
  assert.equal(await used(), 2);

  // ---- the usage limit -------------------------------------------------------
  const limit = PLANS.basic.windowBuilds;
  const windowMs = PLANS.basic.windowHours * 60 * 60 * 1000;
  assert.equal(store.chargeUses('user_web', { uses: limit - 2, limit, windowMs }).allowed, true);
  assert.equal(await used(), limit);
  const before = calls.length;
  nextAnswer = () => jsonResponse({ results: [{ title: 't', url: 'https://x.example/', summary: 's' }] });
  res = await call('search', { query: 'one more' });
  assert.equal(res.status, 429);
  data = await res.json();
  assert.equal(data.code, 'web_search_limit');
  assert.match(data.error, /No uses left for web search/);
  assert.ok(res.headers.get('retry-after'));
  assert.equal(calls.length, before, 'DeepSeek is never called without a use to pay for it');
  assert.equal(await used(), limit);

  console.log('Hosted web search checks passed: gating, charging one use per billed call, refunds, the limit, input checks, result cleaning, key handling and /me.');
} finally {
  globalThis.fetch = realFetch;
  store.close();
}

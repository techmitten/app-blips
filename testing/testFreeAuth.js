// Free AI sign-in on a public server (electron/server/freeAuth.js): tokens
// are real RS256 JWTs signed with a key made here and checked by
// @clerk/backend's own verifyToken, as on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { checkFreeSignIn, freeSignInConfig, freeSignInStatus, SIGN_IN_REQUIRED } from '../electron/server/freeAuth.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';
import { createFreeLimits } from '../electron/server/freeLimits.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const ORIGIN = 'https://app.example';
const CLERK = { CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk', CLERK_JWT_KEY: PEM };

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const jwt = (claims = {}, key = privateKey) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${b64url({ sub: 'user_123', azp: ORIGIN, iat: now, nbf: now - 5, exp: now + 60, iss: 'https://clerk.app.example', ...claims })}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key).toString('base64url');
  return `${body}.${signature}`;
};
const request = (token, url = `${ORIGIN}/api/chat`) => new Request(url, {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
});

test('sign-in is only asked for when both Clerk keys are set, and can be turned off', () => {
  assert.equal(freeSignInConfig({}), null);
  assert.equal(freeSignInConfig({ CLERK_PUBLISHABLE_KEY: CLERK.CLERK_PUBLISHABLE_KEY }), null);
  assert.equal(freeSignInConfig({ ...CLERK, CLERK_PUBLISHABLE_KEY: 'not-a-key' }), null);
  assert.equal(freeSignInConfig({ ...CLERK, APPBLIPS_FREE_SIGN_IN: 'off' }), null);
  assert.ok(freeSignInConfig(CLERK));
  // A PEM stored on one line with literal \n still works.
  assert.equal(freeSignInConfig({ ...CLERK, CLERK_JWT_KEY: PEM.replace(/\n/g, '\\n') }).jwtKey, PEM);
  // The page only ever learns the publishable key.
  assert.deepEqual(freeSignInStatus(CLERK), { freeSignIn: { publishableKey: CLERK.CLERK_PUBLISHABLE_KEY } });
  assert.deepEqual(freeSignInStatus({}), {});
});

test('a valid token for this site names the user; anything else is refused', async () => {
  assert.deepEqual(await checkFreeSignIn(request(null), {}), { user: null }, 'no sign-in needed without keys');
  assert.deepEqual(await checkFreeSignIn(request(jwt()), CLERK), { user: 'user_123' });
  const refused = { refused: SIGN_IN_REQUIRED };
  assert.deepEqual(await checkFreeSignIn(request(null), CLERK), refused, 'no token');
  assert.deepEqual(await checkFreeSignIn(request('not-a-jwt'), CLERK), refused, 'garbage');
  assert.deepEqual(await checkFreeSignIn(request(jwt({}, other.privateKey)), CLERK), refused, 'signed by another key');
  const past = Math.floor(Date.now() / 1000) - 3600;
  assert.deepEqual(await checkFreeSignIn(request(jwt({ iat: past - 60, nbf: past - 60, exp: past })), CLERK), refused, 'expired');
  assert.deepEqual(await checkFreeSignIn(request(jwt({ azp: 'https://evil.example' })), CLERK), refused, 'issued to another site');
  // Another origin is accepted only when listed.
  const elsewhere = jwt({ azp: 'https://other.example' });
  assert.deepEqual(await checkFreeSignIn(request(elsewhere), { ...CLERK, APPBLIPS_CHAT_ALLOWED_ORIGINS: 'https://other.example' }), { user: 'user_123' });
});

test('Free AI without a sign-in gets a 401; the user’s own key needs none; users are counted by account', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('data: {"choices":[],"usage":{"total_tokens":5}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const env = { OPENAI_API_KEY: 'k', OPENAI_LLM_MODEL: 'm', OPENAI_LLM_PROVIDER: 'deepseek', ...CLERK };
  const freeLimits = createFreeLimits({ APPBLIPS_FREE_REQUESTS_PER_HOUR: '1', APPBLIPS_FREE_MESSAGES_PER_MINUTE: '0', APPBLIPS_FREE_MESSAGE_GAP_SECONDS: '0' });
  const checkSignIn = (r) => checkFreeSignIn(r, env);
  const options = { freeLimits, visitor: '203.0.113.9', checkSignIn };

  const anonymous = await handleChatProxy(request(null), env, options);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { error: SIGN_IN_REQUIRED, source: 'free-sign-in', stop: true });

  // Signed in: allowed, and counted against the account, not the address.
  assert.equal((await handleChatProxy(request(jwt()), env, options)).status, 200);
  assert.equal((await handleChatProxy(request(jwt()), env, options)).status, 429, 'the same account hit its hourly limit');
  const otherUser = await handleChatProxy(request(jwt({ sub: 'user_456' })), env, options);
  assert.equal(otherUser.status, 200, 'another account from the same address is unaffected');

  // The visitor's own provider never needs a sign-in.
  const own = new Request(`${ORIGIN}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], user_provider: { id: 'openai', model: 'gpt-x', apiKey: 'sk-own' } }),
  });
  assert.equal((await handleChatProxy(own, env, options)).status, 200);
});

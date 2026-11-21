import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOnboardingApi } from '../worker/onboardingApi.js';

function makeMockDb(rows) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              rows.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('OPTIONS /api/onboarding returns CORS preflight headers', async () => {
  const req = new Request('https://web.appblips.com/api/onboarding', { method: 'OPTIONS' });
  const res = await handleOnboardingApi(req, {}, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
});

test('POST /api/onboarding stores response in D1 and forwards to Google Sheets webhook', async () => {
  const dbRows = [];
  const pending = [];
  const originalFetch = globalThis.fetch;
  const webhookCalls = [];
  globalThis.fetch = async (url, init) => {
    webhookCalls.push({ url, body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  try {
    const req = new Request('https://web.appblips.com/api/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 'user-123',
        platform: 'desktop',
        goal: 'web-app',
        role: 'founder',
        experience: 'some',
      }),
    });
    const env = {
      DB: makeMockDb(dbRows),
      ONBOARDING_SHEETS_WEBHOOK_URL: 'https://script.google.com/macros/s/test/exec',
      ONBOARDING_SHEETS_SECRET: 'top-secret',
    };
    const ctx = { waitUntil: (promise) => pending.push(promise) };

    const res = await handleOnboardingApi(req, env, ctx);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(dbRows.length, 1);
    assert.equal(dbRows[0].args[0], 'user-123');
    assert.equal(dbRows[0].args[1], 'desktop');
    assert.equal(dbRows[0].args[2], 'web-app');
    assert.equal(dbRows[0].args[3], 'founder');
    assert.equal(dbRows[0].args[4], 'some');

    await Promise.all(pending);
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0].url, 'https://script.google.com/macros/s/test/exec');
    assert.equal(webhookCalls[0].body.secret, 'top-secret');
    assert.equal(webhookCalls[0].body.goal, 'web-app');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST /api/onboarding rejects empty survey submissions', async () => {
  const req = new Request('https://web.appblips.com/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'user-123', platform: 'web' }),
  });
  const res = await handleOnboardingApi(req, { DB: makeMockDb([]) }, {});
  assert.equal(res.status, 400);
});

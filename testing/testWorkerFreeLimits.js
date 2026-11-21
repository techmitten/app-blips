// The Cloudflare Worker's Free option counts (worker/freeLimitsStore.js), run
// against an in-memory stand-in for the Durable Object's storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFreeLimitsStore, UNAVAILABLE } from '../worker/freeLimitsStore.js';
import { handleFreeUsageAdminApi } from '../worker/freeUsageAdminApi.js';

// The parts of the Durable Object storage API the store uses.
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    async list() { return new Map([...data].map(([k, v]) => [k, structuredClone(v)])); },
    async put(keyOrEntries, value) {
      if (typeof keyOrEntries === 'string') data.set(keyOrEntries, structuredClone(value));
      else for (const [k, v] of Object.entries(keyOrEntries)) data.set(k, structuredClone(v));
    },
    async delete(keys) { for (const k of [].concat(keys)) data.delete(k); },
  };
};

const ENV = {};
// Rate limits are fixed in production; tests change them through `rates`.
const RATES = { messagesPerMinute: 0, messageGapSeconds: 0, concurrent: 0 };

test('counts survive a restart of the Durable Object', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const env = { ...ENV, APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1000' };
  const rates = { ...RATES, requestsPerHour: 2 };
  const first = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const a = await first.begin('v1');
  assert.ok(a.ticket);
  await first.end(a.ticket, 'v1', 400);

  // A new object (after eviction) reads the saved counts.
  const second = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const b = await second.begin('v1');
  assert.ok(b.ticket, 'second request of the hour');
  const refused = await second.begin('v1');
  assert.match(refused.refused.error, /2 requests an hour/);
  // The first object's ticket is gone after the restart; its tokens still count.
  await second.end(b.ticket, 'v1', 700);
  clock += 3_600_000;
  const third = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  assert.match((await third.begin('v1')).refused.error, /today’s Free AI allowance/);
  assert.ok((await third.begin('v2')).ticket, 'another visitor is unaffected');
});

test('a ticket lost in a restart still counts its tokens', async () => {
  const clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const env = { ...ENV, APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '100' };
  const before = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  const { ticket } = await before.begin('v1');
  const after = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  await after.end(ticket, 'v1', 150);
  assert.match((await after.begin('v1')).refused.error, /today’s Free AI allowance/);
});

test('entries with nothing left to limit are deleted when the object starts', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const first = createFreeLimitsStore(ENV, storage, { now: () => clock, rates: RATES });
  await first.end((await first.begin('old')).ticket, 'old', 5);
  await first.allowUnsplash('old');
  assert.ok(storage.data.has('v:old') && storage.data.has('u:old'));
  clock += 26 * 3_600_000; // the next day, well past the hour
  const later = createFreeLimitsStore(ENV, storage, { now: () => clock, rates: RATES });
  await later.begin('new');
  assert.equal(storage.data.has('v:old'), false);
  assert.equal(storage.data.has('u:old'), false);
  assert.ok(storage.data.has('v:new'));
});

test('if the counts can’t be read or saved, Free AI is refused', async () => {
  const broken = {
    async list() { throw new Error('storage unavailable'); },
    async put() { throw new Error('storage unavailable'); },
    async delete() {},
  };
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const store = createFreeLimitsStore(ENV, broken, { rates: RATES });
    assert.deepEqual((await store.begin('v1')).refused, { error: UNAVAILABLE, retryAfter: 60 });
    const unwritable = createFreeLimitsStore(ENV, { ...memoryStorage(), put: broken.put }, { rates: RATES });
    assert.equal((await unwritable.begin('v1')).refused.error, UNAVAILABLE);
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 2);
});

test('Unsplash searches are limited per visitor per hour, across restarts', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const store = createFreeLimitsStore(ENV, storage, { now: () => clock, unsplashPerHour: 2, rates: RATES });
  assert.equal(await store.allowUnsplash('v1'), true);
  assert.equal(await store.allowUnsplash('v1'), true);
  const restarted = createFreeLimitsStore(ENV, storage, { now: () => clock, unsplashPerHour: 2, rates: RATES });
  assert.equal(await restarted.allowUnsplash('v1'), false);
  assert.equal(await restarted.allowUnsplash('v2'), true);
  clock += 3_600_000;
  assert.equal(await restarted.allowUnsplash('v1'), true);
});

test('snapshot returns live daily usage sorted by tokens used and survives restarts', async () => {
  const clock = Date.UTC(2026, 10, 17, 10, 30, 0);
  const storage = memoryStorage();
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1000',
    APPBLIPS_FREE_TOKENS_PER_DAY: '5000',
  };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });

  await store.end((await store.begin('user:low')).ticket, 'user:low', 200);
  await store.end((await store.begin('user:mid')).ticket, 'user:mid', 600);
  await store.end((await store.begin('user:high')).ticket, 'user:high', 850);
  await store.end((await store.begin('user:max')).ticket, 'user:max', 1000);

  // Read from a fresh store instance to prove it loads from storage.
  const fresh = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  const snap = await fresh.snapshot();

  assert.equal(snap.day, '2026-11-17');
  assert.equal(snap.resetsAt, '2026-11-18T00:00:00.000Z');
  assert.deepEqual(snap.site, {
    tokens: 2650,
    limit: 5000,
    remaining: 2350,
    pct: 53,
    hitLimit: false,
  });
  assert.deepEqual(snap.summary, {
    activeVisitors: 4,
    atLimit: 1,
    nearLimit80: 1,
    nearLimit50: 1,
    flaggedVisitors: 0,
    blockedVisitors: 0,
    refusalsToday: 0,
  });
  assert.deepEqual(
    snap.visitors.map((v) => [v.visitor, v.tokens, v.pct, v.hitLimit]),
    [
      ['user:max', 1000, 100, true],
      ['user:high', 850, 85, false],
      ['user:mid', 600, 60, false],
      ['user:low', 200, 20, false],
    ],
  );

  // Filter to users at >= 80% and limit to 1 result; summary still reflects all visitors.
  const filtered = await fresh.snapshot({ minPct: 80, limit: 1 });
  assert.equal(filtered.summary.activeVisitors, 4);
  assert.deepEqual(filtered.visitors.map((v) => v.visitor), ['user:max']);
});

test('admin free-usage endpoint enforces method, secret config, and Bearer auth', async () => {
  const storage = memoryStorage();
  const clock = Date.UTC(2026, 10, 17, 10);
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1000',
    APPBLIPS_ADMIN_TOKEN: 'super-secret-token',
  };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  await store.end((await store.begin('user:a')).ticket, 'user:a', 900);
  await store.end((await store.begin('user:b')).ticket, 'user:b', 100);

  const call = (req, customEnv = env) => handleFreeUsageAdminApi(req, customEnv, (opts) => store.snapshot(opts));

  // Method check
  const postRes = await call(new Request('https://web.appblips.com/api/admin/free-usage', { method: 'POST' }));
  assert.equal(postRes.status, 405);

  // Missing secret configuration
  const unconfigured = await call(
    new Request('https://web.appblips.com/api/admin/free-usage'),
    { ...env, APPBLIPS_ADMIN_TOKEN: '' },
  );
  assert.equal(unconfigured.status, 503);

  // Missing or wrong Bearer token
  const noAuth = await call(new Request('https://web.appblips.com/api/admin/free-usage'));
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.headers.get('www-authenticate'), 'Bearer');

  const wrongAuth = await call(new Request('https://web.appblips.com/api/admin/free-usage', {
    headers: { authorization: 'Bearer wrong-token' },
  }));
  assert.equal(wrongAuth.status, 401);

  // Valid Bearer token with query filters
  const ok = await call(new Request('https://web.appblips.com/api/admin/free-usage?minPct=80&limit=5', {
    headers: { authorization: 'Bearer super-secret-token' },
  }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await ok.json();
  assert.equal(body.enabled, true);
  assert.equal(body.summary.activeVisitors, 2);
  assert.equal(body.summary.nearLimit80, 1);
  assert.deepEqual(body.visitors.map((v) => v.visitor), ['user:a']);
});

test('admin free-usage endpoint supports Clerk admin allow-list (APPBLIPS_ADMIN_USER_IDS)', async () => {
  const storage = memoryStorage();
  const clock = Date.UTC(2026, 10, 17, 10);
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1000',
    APPBLIPS_ADMIN_USER_IDS: 'user_admin_1, user_admin_2',
  };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  await store.end((await store.begin('user:user_regular')).ticket, 'user:user_regular', 820);

  const fakeCheckSignIn = async (req) => {
    const auth = req.headers.get('authorization') || '';
    if (auth === 'Bearer jwt-admin') return { user: 'user_admin_1' };
    if (auth === 'Bearer jwt-other') return { user: 'user_regular' };
    return { refused: 'Sign in required.' };
  };

  const call = (req) => handleFreeUsageAdminApi(req, env, (opts) => store.snapshot(opts), { checkSignIn: fakeCheckSignIn });

  // Signed-in non-admin gets 403 Forbidden
  const forbidden = await call(new Request('https://web.appblips.com/api/admin/free-usage', {
    headers: { authorization: 'Bearer jwt-other' },
  }));
  assert.equal(forbidden.status, 403);

  // Invalid JWT gets 401 Unauthorized
  const unauth = await call(new Request('https://web.appblips.com/api/admin/free-usage', {
    headers: { authorization: 'Bearer jwt-expired' },
  }));
  assert.equal(unauth.status, 401);

  // Allow-listed Clerk admin gets 200 with usage snapshot
  const allowed = await call(new Request('https://web.appblips.com/api/admin/free-usage', {
    headers: { authorization: 'Bearer jwt-admin' },
  }));
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.summary.nearLimit80, 1);
  assert.deepEqual(body.visitors.map((v) => v.visitor), ['user:user_regular']);
});

test('abuse detection flags hammering and admin can block, unblock, and pause Free AI across restarts', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '10000',
    APPBLIPS_ADMIN_TOKEN: 'admin-secret',
  };
  const rates = { messagesPerMinute: 1, messageGapSeconds: 0, requestsPerHour: 50, concurrent: 0 };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates });

  // Visitor triggers 5 rapid-fire rate-limit refusals -> flagged as high risk,
  // but NOT auto-blocked while Automated Abuse Blocking is OFF (default).
  const first = await store.begin('user:bot');
  assert.ok(first.ticket);
  await store.end(first.ticket, 'user:bot', 100);
  for (let i = 0; i < 5; i += 1) {
    const r = await store.begin('user:bot');
    assert.ok(r.refused);
  }

  const snap = await store.snapshot({ flaggedOnly: true });
  assert.equal(snap.policy.autoBlockAbuse, false);
  assert.equal(snap.summary.blockedVisitors, 0);
  assert.equal(snap.summary.flaggedVisitors, 1);
  assert.equal(snap.summary.refusalsToday, 5);
  assert.equal(snap.visitors[0].visitor, 'user:bot');
  assert.equal(snap.visitors[0].riskLevel, 'high');
  assert.equal(snap.visitors[0].blocked, null);
  assert.ok(snap.visitors[0].abuseFlags.includes('repeated_rate_limit'));
  assert.equal(snap.recentEvents.length, 5);

  const authHeaders = {
    authorization: 'Bearer admin-secret',
    'content-type': 'application/json',
  };

  // Admin blocks the bot for 2 hours via API
  const blockRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/block', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ visitor: 'user:bot', durationHours: 2, reason: 'Bot hammering' }),
    }),
    env,
    store,
  );
  assert.equal(blockRes.status, 200);

  // Even after Durable Object restart and past the minute window, the bot stays blocked
  clock += 120_000;
  const restarted = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const blockedAttempt = await restarted.begin('user:bot');
  assert.match(blockedAttempt.refused.error, /restricted/);
  // Other visitors are unaffected
  const normal = await restarted.begin('user:good');
  assert.ok(normal.ticket);
  await restarted.end(normal.ticket, 'user:good', 50);

  // Admin unblocks the bot -> access restored
  const unblockRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/unblock', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ visitor: 'user:bot' }),
    }),
    env,
    restarted,
  );
  assert.equal(unblockRes.status, 200);
  const unblockedAttempt = await restarted.begin('user:bot');
  assert.ok(unblockedAttempt.ticket);
  await restarted.end(unblockedAttempt.ticket, 'user:bot', 50);

  // Admin activates global Free AI kill switch -> blocks everyone across restarts
  const pauseRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/pause', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ paused: true, reason: 'Traffic spike' }),
    }),
    env,
    restarted,
  );
  assert.equal(pauseRes.status, 200);

  const afterPauseRestart = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const pausedAttempt = await afterPauseRestart.begin('user:anyone');
  assert.match(pausedAttempt.refused.error, /temporarily paused: Traffic spike/);

  // Admin resumes Free AI -> requests succeed again
  const resumeRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/pause', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ paused: false }),
    }),
    env,
    afterPauseRestart,
  );
  assert.equal(resumeRes.status, 200);
  const resumedAttempt = await afterPauseRestart.begin('user:anyone');
  assert.ok(resumedAttempt.ticket);
});

test('automated abuse blocking only auto-blocks once admin activates it, and persists across restarts', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '10000',
    APPBLIPS_ADMIN_TOKEN: 'admin-secret',
  };
  const rates = { messagesPerMinute: 1, messageGapSeconds: 0, requestsPerHour: 50, concurrent: 0 };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates });

  const authHeaders = {
    authorization: 'Bearer admin-secret',
    'content-type': 'application/json',
  };

  // Activate automated abuse blocking (2h blocks)
  const enableRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/mode', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ autoBlockAbuse: true, autoBlockHours: 2 }),
    }),
    env,
    store,
  );
  assert.equal(enableRes.status, 200);

  // Survives restart
  const restarted = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const first = await restarted.begin('user:spammer');
  assert.ok(first.ticket);
  await restarted.end(first.ticket, 'user:spammer', 50);

  // 5 rate-limit refusals trigger an automatic block
  for (let i = 0; i < 5; i += 1) {
    assert.ok((await restarted.begin('user:spammer')).refused);
  }

  // Advance past the 1-minute window; spammer is still blocked by the 2h auto-block
  clock += 120_000;
  const afterBlockRestart = createFreeLimitsStore(env, storage, { now: () => clock, rates });
  const blockedRes = await afterBlockRestart.begin('user:spammer');
  assert.match(blockedRes.refused.error, /restricted/);

  const snap = await afterBlockRestart.snapshot();
  assert.equal(snap.policy.autoBlockAbuse, true);
  assert.equal(snap.policy.autoBlockHours, 2);
  assert.equal(snap.summary.blockedVisitors, 1);
  assert.ok(snap.recentEvents.some((e) => e.type === 'auto_block' && e.visitor === 'user:spammer'));

  // Turning automated mode back OFF preserves manual control for future users
  const disableRes = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/mode', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ autoBlockAbuse: false }),
    }),
    env,
    afterBlockRestart,
  );
  assert.equal(disableRes.status, 200);
  const snapOff = await afterBlockRestart.snapshot();
  assert.equal(snapOff.policy.autoBlockAbuse, false);
});

test('admin AI chat injects live usage data and never deducts from Free AI limits or gets paused', async () => {
  const clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const env = {
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1000',
    APPBLIPS_FREE_TOKENS_PER_DAY: '1000',
    APPBLIPS_ADMIN_TOKEN: 'admin-secret',
  };
  const store = createFreeLimitsStore(env, storage, { now: () => clock, rates: RATES });
  // Max out site & pause Free AI to prove admin chat is completely unrestricted
  await store.end((await store.begin('user:heavy')).ticket, 'user:heavy', 1000);
  await store.setPaused(true, 'Testing');

  let captured = null;
  const fakeChatProxy = async (proxyReq, _env, opts) => {
    captured = { body: await proxyReq.json(), opts };
    return Response.json({
      model: 'deepseek-chat',
      choices: [{ message: { role: 'assistant', content: 'user:heavy hit 100% of their daily cap.' } }],
    });
  };

  // Unauthenticated request is rejected
  const denied = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Any abuse?' }] }),
    }),
    env,
    store,
    { chatProxy: fakeChatProxy },
  );
  assert.equal(denied.status, 401);

  // Authorized admin chat succeeds even while site is paused & at 100% cap
  const res = await handleFreeUsageAdminApi(
    new Request('https://web.appblips.com/api/admin/free-usage/chat', {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Is any abuse happening?' }] }),
    }),
    env,
    store,
    { chatProxy: fakeChatProxy },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /user:heavy/);
  assert.equal(captured.opts.freeLimits, null);
  assert.equal(captured.opts.checkSignIn, null);
  assert.equal(captured.body.messages[0].role, 'system');
  assert.match(captured.body.messages[0].content, /user:heavy/);

  // Site token count is untouched (still 1000)
  const snapAfter = await store.snapshot();
  assert.equal(snapAfter.site.tokens, 1000);
});

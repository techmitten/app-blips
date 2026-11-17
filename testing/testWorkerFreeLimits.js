// The Cloudflare Worker's Free option counts (worker/freeLimitsStore.js), run
// against an in-memory stand-in for the Durable Object's storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFreeLimitsStore, UNAVAILABLE } from '../worker/freeLimitsStore.js';

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

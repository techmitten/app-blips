// The Cloudflare Worker's per-visitor Unsplash search counts
// (worker/unsplashLimitsStore.js), run against an in-memory stand-in for the
// Durable Object's storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnsplashLimitsStore } from '../worker/unsplashLimitsStore.js';

// The parts of the Durable Object storage API the store uses.
const memoryStorage = () => {
  const data = new Map();
  return {
    data,
    async list() { return new Map([...data].map(([k, v]) => [k, structuredClone(v)])); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(keys) { for (const k of [].concat(keys)) data.delete(k); },
  };
};

test('Unsplash searches are limited per visitor per hour, across restarts', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  const store = createUnsplashLimitsStore(storage, { now: () => clock, perHour: 2 });
  assert.equal(await store.allow('v1'), true);
  assert.equal(await store.allow('v1'), true);
  const restarted = createUnsplashLimitsStore(storage, { now: () => clock, perHour: 2 });
  assert.equal(await restarted.allow('v1'), false);
  assert.equal(await restarted.allow('v2'), true);
  clock += 3_600_000;
  assert.equal(await restarted.allow('v1'), true);
});

test('a restart deletes counts whose hour is over, and anything else stored', async () => {
  let clock = Date.UTC(2026, 10, 17, 10);
  const storage = memoryStorage();
  await createUnsplashLimitsStore(storage, { now: () => clock, perHour: 2 }).allow('old');
  storage.data.set('stray', { start: clock });
  clock += 3_600_000;
  await createUnsplashLimitsStore(storage, { now: () => clock, perHour: 2 }).allow('new');
  assert.deepEqual([...storage.data.keys()], ['u:new']);
});

test('no limit when perHour is 0', async () => {
  const store = createUnsplashLimitsStore(memoryStorage(), { perHour: 0 });
  for (let i = 0; i < 5; i += 1) assert.equal(await store.allow('v1'), true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnapUpdateCheck } from '../electron/snapUpdates.js';
import { CHECK_INTERVAL_MS } from '../src/lib/updates.js';

const entry = (version, { architecture = 'amd64', track = 'latest', risk = 'stable' } = {}) => ({
  version, channel: { architecture, track, risk },
});
const response = (entries) => new Response(JSON.stringify({ 'channel-map': entries }));

test('Snap notifications use only a newer stable release for this architecture and track', async () => {
  const check = createSnapUpdateCheck({ arch: 'x64', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.snapcraft.io/v2/snaps/info/appblips');
    assert.equal(options.headers['Snap-Device-Series'], '16');
    assert.equal(options.headers['Snap-Device-Architecture'], 'amd64');
    return response([
      entry('9.0.0', { risk: 'candidate' }), entry('8.0.0', { architecture: 'arm64' }),
      entry('7.0.0', { track: 'preview' }), entry('0.2.0'),
    ]);
  } });
  assert.deepEqual(await check({ current: '0.1.0' }), { version: '0.2.0', url: 'snap://appblips', snap: true });
  assert.equal(await check({ current: '0.2.0' }), null);
  assert.equal(await check({ current: '0.3.0' }), null);
});

test('no stable release or invalid versions produce no notification', async () => {
  for (const entries of [[], [entry('1.0.0', { risk: 'candidate' })], [entry('garbage')]]) {
    const check = createSnapUpdateCheck({ arch: 'x64', fetchImpl: async () => response(entries) });
    assert.equal(await check({ current: '0.1.0' }), null);
  }
});

test('Snap checks cache for an hour, force refresh, and retry failures', async () => {
  let time = 100;
  let calls = 0;
  let fail = false;
  const check = createSnapUpdateCheck({ arch: 'x64', now: () => time, fetchImpl: async () => {
    calls++;
    return fail ? new Response('', { status: 503 }) : response([entry('0.2.0')]);
  } });
  await check({ current: '0.1.0' });
  await check({ current: '0.1.0' });
  assert.equal(calls, 1);
  await check({ current: '0.1.0', force: true });
  assert.equal(calls, 2);
  time += CHECK_INTERVAL_MS;
  fail = true;
  await assert.rejects(check({ current: '0.1.0' }), /503/);
  fail = false;
  assert.ok(await check({ current: '0.1.0' }));
  assert.equal(calls, 4);
});

test('Snap network and malformed response errors are surfaced', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response('{}')]) {
    await assert.rejects(createSnapUpdateCheck({ fetchImpl })({ current: '0.1.0' }));
  }
});

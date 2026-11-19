// Unsent prompt kept across a Free AI sign-in that leaves the page
// (src/lib/signInHandoff.js) and the session start that follows it
// (beginAppSession in src/lib/config.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

const makeStore = () => {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
};
const local = makeStore();
const session = makeStore();
globalThis.window = { localStorage: local, sessionStorage: session };

const { savePromptForSignIn, clearPromptForSignIn, takePromptForSignIn } = await import('../src/lib/signInHandoff.js');
const { beginAppSession, START_FRESH_KEY } = await import('../src/lib/config.js');

test('a saved prompt is restored once, then removed from storage', () => {
  savePromptForSignIn({ prompt: 'a bakery website', studioMode: 'website', projectId: null });
  const first = takePromptForSignIn();
  assert.deepEqual(first, { prompt: 'a bakery website', studioMode: 'website', projectId: null });
  assert.equal(local.map.size, 0);
  // Same value for the rest of the page load (StrictMode double init).
  assert.equal(takePromptForSignIn(), first);
});

test('clearPromptForSignIn drops a saved prompt', () => {
  savePromptForSignIn({ prompt: 'x', studioMode: 'app' });
  clearPromptForSignIn();
  assert.equal(local.map.size, 0);
});

test('returning from sign-in is not a cold start and keeps the open project', () => {
  local.map.clear();
  session.map.clear();
  assert.equal(beginAppSession({ returningFromSignIn: true }), false);
  assert.equal(local.getItem(START_FRESH_KEY), null);
  session.map.clear();
  assert.equal(beginAppSession(), true);
  assert.equal(local.getItem(START_FRESH_KEY), 'true');
});

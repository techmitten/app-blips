import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBrowserKeys, decodeKeyState, encodeKeyState, KEY_HEADER, KEY_SET_HEADER, KEY_CLEARED, SESSION_HEADER,
} from '../electron/server/browserKeys.js';

const request = (headers = {}) => new Request('http://localhost/api/x', { headers });
const SESSION = 'abcdef0123456789abcdef0123456789';

test('the store holds what the request sent, and changes come back in a header', async () => {
  const withKeys = createBrowserKeys();
  const sent = encodeKeyState({ id: 'openai', key: 'k1' });
  const unchanged = await withKeys('provider', request({ [KEY_HEADER]: sent }), (keys) => {
    assert.equal(keys.keyFor('openai'), 'k1');
    assert.equal(keys.keyFor('gemini'), '');
    return new Response('ok');
  });
  assert.equal(unchanged.headers.get(KEY_SET_HEADER), null);

  const saved = await withKeys('provider', request({ [KEY_HEADER]: sent }), async (keys) => {
    await keys.save('gemini', 'k2');
    return Response.json({});
  });
  assert.deepEqual(decodeKeyState(saved.headers.get(KEY_SET_HEADER)), { id: 'gemini', key: 'k2' });

  const cleared = await withKeys('provider', request({ [KEY_HEADER]: sent }), async (keys) => {
    await keys.clear();
    return Response.json({});
  });
  assert.equal(cleared.headers.get(KEY_SET_HEADER), KEY_CLEARED);
});

test('nothing carries over between requests: no header, no key', async () => {
  const withKeys = createBrowserKeys();
  await withKeys('provider', request({ [SESSION_HEADER]: SESSION }), async (keys) => { await keys.save('openai', 'secret'); return new Response(''); });
  for (const headers of [{}, { [SESSION_HEADER]: SESSION }]) {
    await withKeys('provider', request(headers), (keys) => {
      assert.equal(keys.describe().hasKey, false);
      return new Response('');
    });
  }
});

test('a browser keeps the same store object across requests (pending sign-ins)', async () => {
  const withKeys = createBrowserKeys({ maxSessions: 2 });
  const seen = [];
  const grab = (session, slot = 'pollinations') => withKeys(slot, request({ [SESSION_HEADER]: session }), (keys) => { seen.push(keys); return new Response(''); });
  await grab(SESSION);
  await grab(SESSION);
  await grab(SESSION, 'surge');
  await grab('x'); // not a valid id: a fresh store
  await grab('x');
  assert.equal(seen[0], seen[1]);
  assert.notEqual(seen[0], seen[2]);
  assert.notEqual(seen[3], seen[4]);
});

test('malformed key headers count as nothing saved', () => {
  for (const value of [null, '', 'not base64!', Buffer.from('{"id":1}').toString('base64'), 'a'.repeat(9000)]) {
    assert.deepEqual(decodeKeyState(value), { id: '', key: '' });
  }
});

test('the Node request conversion keeps the key and session headers', async () => {
  const { toFetchRequest } = await import('../electron/server/nodeHttp.js');
  const { Readable } = await import('node:stream');
  const req = Object.assign(Readable.from([]), {
    method: 'GET',
    url: '/api/provider',
    headers: { host: 'localhost', origin: 'http://localhost', [KEY_HEADER]: 'abc', [SESSION_HEADER]: SESSION },
  });
  const request = await toFetchRequest(req);
  assert.equal(request.headers.get(KEY_HEADER), 'abc');
  assert.equal(request.headers.get(SESSION_HEADER), SESSION);
});

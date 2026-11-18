// Clerk webhook handler (electron/server/clerkWebhook.js): verifies real
// Svix signatures with @clerk/backend/webhooks and syncs users to Resend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleClerkWebhook } from '../electron/server/clerkWebhook.js';

const SECRET_BYTES = Buffer.from('test-clerk-webhook-signing-secret');
const SIGNING_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const ENV = {
  CLERK_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
  RESEND_API_KEY: 're_test_123',
  RESEND_AUDIENCE_ID: 'aud_123',
};

function signedRequest(payload, { secretBytes = SECRET_BYTES, headers = {} } = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const id = 'msg_test_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Request('https://appblips.com/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${sig}`,
      ...headers,
    },
    body,
  });
}

test('rejects non-POST requests and unconfigured environments', async () => {
  const get = await handleClerkWebhook(new Request('https://appblips.com/api/webhooks/clerk'), ENV);
  assert.equal(get.status, 405);

  const noSecret = await handleClerkWebhook(signedRequest({ type: 'user.created', data: {} }), { RESEND_API_KEY: 're_1' });
  assert.equal(noSecret.status, 503);

  const noResend = await handleClerkWebhook(signedRequest({ type: 'user.created', data: {} }), { CLERK_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET });
  assert.equal(noResend.status, 503);
});

test('rejects missing or invalid Svix signatures', async () => {
  const unsigned = new Request('https://appblips.com/api/webhooks/clerk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'user.created', data: {} }),
  });
  assert.equal((await handleClerkWebhook(unsigned, ENV)).status, 400);

  const wrongKey = signedRequest({ type: 'user.created', data: {} }, { secretBytes: Buffer.from('wrong-secret') });
  assert.equal((await handleClerkWebhook(wrongKey, ENV)).status, 400);
});

test('adds newly created Clerk users to the configured Resend audience', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    return Response.json({ id: 'contact_1', object: 'contact' }, { status: 201 });
  });

  const req = signedRequest({
    type: 'user.created',
    data: {
      id: 'user_1',
      primary_email_address_id: 'email_2',
      email_addresses: [
        { id: 'email_1', email_address: 'secondary@example.com' },
        { id: 'email_2', email_address: 'primary@example.com' },
      ],
      first_name: 'Ada',
      last_name: 'Lovelace',
    },
  });

  const res = await handleClerkWebhook(req, ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, event: 'user.created', contactId: 'contact_1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/audiences/aud_123/contacts');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.authorization, 'Bearer re_test_123');
  assert.deepEqual(calls[0].body, {
    email: 'primary@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    unsubscribed: false,
  });
});

test('omits unsubscribed on user.updated and ignores non-user events', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ id: 'contact_1' }, { status: 200 });
  });

  const updated = await handleClerkWebhook(signedRequest({
    type: 'user.updated',
    data: {
      primary_email_address_id: 'email_1',
      email_addresses: [{ id: 'email_1', email_address: 'ada@example.com' }],
      first_name: 'Ada',
      last_name: null,
    },
  }), ENV);
  assert.equal(updated.status, 200);
  assert.deepEqual(calls[0].body, { email: 'ada@example.com', first_name: 'Ada' });

  const ignored = await handleClerkWebhook(signedRequest({ type: 'session.created', data: {} }), ENV);
  assert.equal(ignored.status, 200);
  assert.deepEqual(await ignored.json(), { ok: true, ignored: 'session.created' });
  assert.equal(calls.length, 1);
});

test('resolves and caches the first Resend audience when RESEND_AUDIENCE_ID is unset', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    if (url.endsWith('/audiences')) {
      return Response.json({ data: [{ id: 'aud_default', name: 'General' }] });
    }
    return Response.json({ id: 'contact_2' }, { status: 201 });
  });

  const envWithoutAudience = {
    CLERK_WEBHOOK_SIGNING_SECRET: SIGNING_SECRET,
    RESEND_API_KEY: 're_test_auto',
  };
  const payload = {
    type: 'user.created',
    data: {
      email_addresses: [{ id: 'email_1', email_address: 'first@example.com' }],
    },
  };

  assert.equal((await handleClerkWebhook(signedRequest(payload), envWithoutAudience)).status, 200);
  assert.equal((await handleClerkWebhook(signedRequest(payload), envWithoutAudience)).status, 200);
  assert.deepEqual(urls, [
    'https://api.resend.com/audiences',
    'https://api.resend.com/audiences/aud_default/contacts',
    'https://api.resend.com/audiences/aud_default/contacts',
  ]);
});

test('skips users without email addresses and surfaces Resend errors as 502', async (t) => {
  let fetched = false;
  t.mock.method(globalThis, 'fetch', async () => {
    fetched = true;
    return Response.json({ message: 'upstream error' }, { status: 500 });
  });

  const noEmail = await handleClerkWebhook(signedRequest({
    type: 'user.created',
    data: { email_addresses: [] },
  }), ENV);
  assert.equal(noEmail.status, 200);
  assert.deepEqual(await noEmail.json(), { ok: true, skipped: 'no-email' });
  assert.equal(fetched, false);

  const failed = await handleClerkWebhook(signedRequest({
    type: 'user.created',
    data: { email_addresses: [{ id: 'email_1', email_address: 'fail@example.com' }] },
  }), ENV);
  assert.equal(failed.status, 502);
});

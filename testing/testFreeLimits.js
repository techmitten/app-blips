import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, visitorKey, createFreeLimits, meterResponse, freeLimitsEnabled } from '../electron/server/freeLimits.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';

// --- Client IP ----------------------------------------------------------------

// The message limits have their own tests; these turn them off so a test can send requests back to back.
const NO_MESSAGE_LIMITS = { APPBLIPS_FREE_MESSAGES_PER_MINUTE: '0', APPBLIPS_FREE_MESSAGE_GAP_SECONDS: '0' };

test('the visitor is the address that reached the platform, not what the visitor wrote', () => {
  // Direct to the platform: its edge appends the real address; internal hops are private.
  assert.equal(clientIp('203.0.113.7', '10.0.0.5'), '203.0.113.7');
  assert.equal(clientIp('1.2.3.4, 203.0.113.7, 10.1.2.3', '10.0.0.5'), '203.0.113.7');
  // Through Cloudflare: the entry before Cloudflare's address is the visitor.
  assert.equal(clientIp('6.6.6.6, 198.51.100.9, 172.70.1.1', '10.0.0.5'), '198.51.100.9');
  // No proxy at all: the socket's peer.
  assert.equal(clientIp('', '::ffff:198.51.100.20'), '198.51.100.20');
  assert.equal(clientIp('garbage, 203.0.113.7:4431', '10.0.0.5'), '203.0.113.7');
});

test('IPv6 visitors are counted per /64', () => {
  assert.equal(visitorKey('2001:db8:1:2:aaaa::1'), visitorKey('2001:db8:1:2:bbbb::9'));
  assert.notEqual(visitorKey('2001:db8:1:2::1'), visitorKey('2001:db8:1:3::1'));
  assert.equal(visitorKey('203.0.113.7'), '203.0.113.7');
});

test('limits are on unless APPBLIPS_FREE_LIMITS turns them off', () => {
  assert.equal(freeLimitsEnabled({}), true);
  assert.equal(freeLimitsEnabled({ APPBLIPS_FREE_LIMITS: 'off' }), false);
});

// --- Limiter ----------------------------------------------------------------------

test('hourly requests, concurrency, and daily tokens per visitor and site-wide', () => {
  let clock = Date.UTC(2026, 10, 12, 10);
  const limits = createFreeLimits({
    ...NO_MESSAGE_LIMITS,
    APPBLIPS_FREE_REQUESTS_PER_HOUR: '3',
    APPBLIPS_FREE_CONCURRENT: '2',
    APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY: '1,000',
    APPBLIPS_FREE_TOKENS_PER_DAY: '1500',
  }, { now: () => clock });

  const a1 = limits.begin('a');
  const a2 = limits.begin('a');
  assert.match(limits.begin('a').refused.error, /other requests/);
  a1.end(400);
  a2.end(700);
  // 1,100 tokens: over a's daily allowance, though it has a request left this hour.
  assert.match(limits.begin('a').refused.error, /today’s Free AI allowance/);

  const b1 = limits.begin('b');
  b1.end(500);
  // 1,600 site-wide: everyone is stopped.
  const refused = limits.begin('c').refused;
  assert.match(refused.error, /for everyone/);
  assert.equal(refused.retryAfter, 14 * 3600);

  // A new UTC day starts afresh.
  clock = Date.UTC(2026, 10, 13, 0, 1);
  const next = limits.begin('a');
  assert.equal(next.refused, undefined);
  next.end(10);
});

test('the hourly limit names how long to wait', () => {
  let clock = 0;
  const limits = createFreeLimits({ ...NO_MESSAGE_LIMITS, APPBLIPS_FREE_REQUESTS_PER_HOUR: '1' }, { now: () => clock });
  limits.begin('a').end(1);
  clock = 20 * 60_000;
  const { refused } = limits.begin('a');
  assert.match(refused.error, /1 requests an hour. Try again in about 40 min/);
  clock = 61 * 60_000;
  assert.equal(limits.begin('a').refused, undefined);
});

test('the AI’s turns of one chat message count as one message', () => {
  let clock = 0;
  const limits = createFreeLimits({ APPBLIPS_FREE_MESSAGES_PER_MINUTE: '2', APPBLIPS_FREE_MESSAGE_GAP_SECONDS: '0', APPBLIPS_FREE_CONCURRENT: '0', APPBLIPS_FREE_REQUESTS_PER_HOUR: '0' }, { now: () => clock });
  // Twenty turns of one message are fine.
  for (let i = 0; i < 20; i += 1) assert.equal(limits.begin('a', 'message-one-id').refused, undefined);
  assert.equal(limits.begin('a', 'message-two-id').refused, undefined);
  clock = 10_000;
  // A third message within the minute waits, whatever the AI is doing with the others.
  const { refused } = limits.begin('a', 'message-three');
  assert.match(refused.error, /sending messages too quickly. Wait 50s/);
  assert.equal(refused.retryAfter, 50);
  assert.equal(limits.begin('a', 'message-one-id').refused, undefined);
  assert.equal(limits.begin('b', 'message-three').refused, undefined);
  clock = 61_000;
  assert.equal(limits.begin('a', 'message-three').refused, undefined);
});

test('messages need a gap between them; a request without an id is its own message', () => {
  let clock = 0;
  const limits = createFreeLimits({ APPBLIPS_FREE_MESSAGES_PER_MINUTE: '0', APPBLIPS_FREE_CONCURRENT: '0', APPBLIPS_FREE_REQUESTS_PER_HOUR: '0' }, { now: () => clock });
  assert.equal(limits.begin('a').refused, undefined);
  clock = 1000;
  assert.match(limits.begin('a').refused.error, /Wait 2s/);
  assert.match(limits.begin('a', 'not valid!').refused.error, /Wait 2s/);
  clock = 3000;
  assert.equal(limits.begin('a').refused, undefined);
});

test('one message id can’t be reused forever', () => {
  let clock = 0;
  const limits = createFreeLimits({ APPBLIPS_FREE_MESSAGES_PER_MINUTE: '1', APPBLIPS_FREE_MESSAGE_GAP_SECONDS: '0', APPBLIPS_FREE_CONCURRENT: '0', APPBLIPS_FREE_REQUESTS_PER_HOUR: '0' }, { now: () => clock });
  for (let i = 0; i < 60; i += 1) assert.equal(limits.begin('a', 'reused-id-1234').refused, undefined);
  // The 61st counts as a new message, and the minute already holds one.
  assert.match(limits.begin('a', 'reused-id-1234').refused.error, /too quickly/);
  // Nor does an old id last: after half an hour it is a new message again.
  clock = 31 * 60_000;
  assert.equal(limits.begin('a', 'reused-id-1234').refused, undefined);
});

// --- Metering -----------------------------------------------------------------------

const streamOf = (...parts) => new Response(new ReadableStream({
  start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  },
}));

test('a stream is passed through unchanged and its reported usage is counted', async () => {
  let counted = null;
  const body = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: {"choices":[],"usage":{"prompt_tokens":120,', '"completion_tokens":30,"total_tokens":150}}\n\ndata: [DONE]\n\n'];
  const metered = meterResponse(streamOf(...body), { sentChars: 999, done: (n) => { counted = n; } });
  assert.equal(await metered.text(), body.join(''));
  assert.equal(counted, 150);
});

test('a JSON reply counts its usage; without usage the size is estimated', async () => {
  let counted = null;
  await meterResponse(streamOf(JSON.stringify({ choices: [], usage: { input_tokens: 10, output_tokens: 5 } })), { done: (n) => { counted = n; } }).text();
  assert.equal(counted, 15);
  await meterResponse(streamOf('x'.repeat(400)), { sentChars: 400, done: (n) => { counted = n; } }).text();
  assert.equal(counted, 200);
});

test('a cancelled stream still ends the request', async () => {
  let counted = null;
  const metered = meterResponse(new Response(new ReadableStream({ pull() {} })), { sentChars: 40, done: (n) => { counted = n; } });
  await metered.body.cancel();
  assert.equal(counted, 10);
});

// --- Proxy ----------------------------------------------------------------------------

const env = { OPENAI_API_KEY: 'k', OPENAI_LLM_MODEL: 'm', OPENAI_LLM_PROVIDER: 'deepseek' };
const send = (body, options) => handleChatProxy(new Request('https://app.example/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], ...body }),
}), env, options);

test('the Free option is limited and capped; the visitor’s own key is not', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('data: {"choices":[],"usage":{"total_tokens":5}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const freeLimits = createFreeLimits({ ...NO_MESSAGE_LIMITS, APPBLIPS_FREE_REQUESTS_PER_HOUR: '1', APPBLIPS_FREE_MAX_OUTPUT_TOKENS: '1000' });

  const first = await send({ max_tokens: 50000 }, { freeLimits, visitor: 'v' });
  assert.equal(first.status, 200);
  await first.text();
  assert.equal(sent[0].max_tokens, 1000);

  const second = await send({}, { freeLimits, visitor: 'v' });
  assert.equal(second.status, 429);
  const refusal = await second.json();
  assert.equal(refusal.source, 'free-limit');
  assert.match(refusal.error, /Settings → AI/);
  assert.ok(Number(second.headers.get('retry-after')) > 0);

  const own = await send({ user_provider: { id: 'openrouter', apiKey: 'mine', model: 'x' }, max_tokens: 50000 }, { freeLimits, visitor: 'v' });
  assert.equal(own.status, 200);
  assert.equal(sent.at(-1).max_tokens, 50000);
});

test('by default the Free option keeps the 64k build limit and the user’s own setting', async (t) => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const freeLimits = createFreeLimits(NO_MESSAGE_LIMITS);
  assert.equal(freeLimits.limits.maxOutputTokens, 0);
  await (await send({}, { freeLimits, visitor: 'd' })).text();
  await (await send({ max_tokens: 90000 }, { freeLimits, visitor: 'd' })).text();
  assert.deepEqual(sent.map((b) => b.max_tokens), [64000, 90000]);
});

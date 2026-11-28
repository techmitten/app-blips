// Run: node testing/testTokenUsage.js
// Providers report token counts on the last stream chunk (often one with no
// choices) or on a non-streamed reply; requestModelText records them so the
// Build pane's header can show what the current chat has used.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const savedFetch = globalThis.fetch;
try {
  const { requestModelText } = await server.ssrLoadModule('/src/lib/llm.js');
  const {
    startUsageMeter, normalizeUsage, formatTokenCount, trackRequest, getLiveUsage, estimateRequestTokens,
    recordUsage, setChatUsageBase, sessionUsageFromVersions, normalizeChatUsage, emptyUsage,
    onUsageCorrection, addUsageDelta,
  } = await server.ssrLoadModule('/src/lib/tokenUsage.js');
  const { lookupGenerationUsage, usageFromGeneration } = await import('../electron/server/generationUsage.js');
  const { handleChatProxy } = await import('../electron/server/chatProxy.js');
  const { searchUsageOf } = await import('../electron/server/webToolsApi.js');
  // Live updates are batched for a moment; wait one batch out.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));
  const totals = (fields) => ({ ...emptyUsage(), ...fields });

  let responses = [];
  const sse = (chunks) => new Response(
    [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  globalThis.fetch = async (url, init) => {
    const next = responses.shift();
    assert.ok(next, 'unexpected API request');
    return next(url, init);
  };
  const messages = [{ role: 'user', content: 'hi' }];
  const stream = (signal = null) => requestModelText({ messages, onChunk: () => {}, retry: false, signal });

  setChatUsageBase(emptyUsage(), 'chat-1');

  // Usage on a chunk with an empty choices array (OpenAI) and on one with no
  // choices key at all; text still parses, and both requests are summed.
  let meter = startUsageMeter();
  responses = [
    () => sse([
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 1000 } } },
    ]),
    () => sse([
      { choices: [{ delta: { content: 'Again' }, finish_reason: 'stop' }] },
      { usage: { prompt_tokens: 800, completion_tokens: 50 } },
    ]),
  ];
  assert.equal((await stream()).content, 'Hello');
  assert.equal((await stream()).content, 'Again');
  const firstTurn = totals({ input: 2000, cached: 1000, output: 350, calls: 2, reported: 2 });
  assert.deepEqual(meter.stop(), firstTurn);
  assert.deepEqual(meter.stop(), firstTurn, 'stop() is repeatable');
  await settle();
  // The finished turn joins the chat's total, once (with 0.1x cache-read weighting).
  assert.equal(getLiveUsage().total, 1450);
  assert.equal(getLiveUsage().running, false);
  assert.deepEqual(getLiveUsage().lastTurn, firstTurn);

  // A request after stop() isn't counted.
  responses = [() => sse([{ choices: [], usage: { prompt_tokens: 5, completion_tokens: 5 } }])];
  await stream();
  assert.deepEqual(meter.stop(), firstTurn);
  await settle();
  assert.equal(getLiveUsage().total, 1450);

  // Non-streamed reply with usage; a reply without usage keeps an estimate.
  meter = startUsageMeter();
  responses = [
    () => Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 2 } }),
    () => sse([{ choices: [{ delta: { content: 'local' }, finish_reason: 'stop' }] }]),
  ];
  await requestModelText({ messages, retry: false });
  await stream();
  let turn = meter.stop();
  assert.deepEqual({ ...turn, estimated: 0 }, totals({ input: 40, output: 2, calls: 2, reported: 1 }));
  assert.ok(turn.estimated > 0, 'an unreported request keeps its estimate');
  await settle();
  assert.equal(getLiveUsage().estimating, true, 'a partly estimated total is marked');

  // Live counter (request JSON / 4 chars per token; {"messages":""} is 15
  // chars): an estimate while a request runs, swapped for the reported
  // counts when it finishes, on top of the chat so far.
  setChatUsageBase(totals({ input: 1000, output: 100, calls: 1, reported: 1 }), 'chat-2');
  meter = startUsageMeter();
  let live = trackRequest({ messages: 'x'.repeat(385) });
  live.streamed(40);
  await settle();
  assert.equal(getLiveUsage().running, true);
  assert.equal(getLiveUsage().estimated, 110);
  assert.equal(getLiveUsage().total, 1210);
  live.finish({ prompt_tokens: 120, completion_tokens: 9 });
  await settle();
  assert.equal(getLiveUsage().total, 1229);
  assert.equal(getLiveUsage().estimating, false);
  // A request the provider refused is dropped; one stopped part-way after it
  // started answering is billed, so it keeps its estimate.
  live = trackRequest({ messages: 'x'.repeat(4000) });
  live.cancel();
  live.finish({ prompt_tokens: 999, completion_tokens: 999 });
  live = trackRequest({ messages: 'x'.repeat(25) });
  live.streamed(8);
  live.cancel({ billed: true });
  // A provider web search reports its own counts.
  recordUsage({ prompt_tokens: 300, completion_tokens: 30, total_tokens: 330 });
  turn = meter.stop();
  assert.deepEqual(turn, totals({ input: 420, output: 39, estimated: 12, calls: 3, reported: 2, stopped: 1 }));
  await settle();
  assert.equal(getLiveUsage().total, 1100 + 420 + 39 + 12);

  // A cancelled request through requestModelText: accepted and streaming, so
  // billed; its estimate stays.
  meter = startUsageMeter();
  const controller = new AbortController();
  responses = [() => new Response(new ReadableStream({
    // Like a real fetch, aborting ends the body stream with an AbortError.
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(400) } }] })}\n\n`));
      controller.signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
      setTimeout(() => controller.abort(), 50);
    },
  }), { headers: { 'content-type': 'text/event-stream' } })];
  await assert.rejects(stream(controller.signal), { name: 'AbortError' });
  turn = meter.stop();
  assert.equal(turn.calls, 1);
  assert.ok(turn.estimated >= 100, String(turn.estimated));
  // Refused by the provider (a 4xx): never billed, never counted.
  meter = startUsageMeter();
  responses = [() => Response.json({ error: 'bad request' }, { status: 400 })];
  await assert.rejects(stream());
  assert.deepEqual(meter.stop(), emptyUsage());

  // A stream that streams for a moment and is then stopped (aborted).
  const stoppedStream = (controller, chunks) => () => new Response(new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')));
      setTimeout(() => controller.abort(), 50);
    },
  }), { headers: { 'content-type': 'text/event-stream' } });

  // Claude reports its input as it starts (anthropic.js input_usage): a
  // request stopped part-way keeps that exactly, and only the output (400
  // streamed characters) is estimated.
  meter = startUsageMeter();
  const claudeStop = new AbortController();
  responses = [stoppedStream(claudeStop, [
    { choices: [{ index: 0, delta: {} }], input_usage: { prompt_tokens: 5000, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 4000, cache_write_tokens: 500 } } },
    { choices: [{ index: 0, delta: { reasoning_content: 'y'.repeat(200) } }] },
    { choices: [{ index: 0, delta: { content: 'x'.repeat(200) } }] },
  ])];
  await assert.rejects(stream(claudeStop.signal), { name: 'AbortError' });
  assert.deepEqual(meter.stop(), totals({ input: 5000, cached: 4000, cacheWrite: 500, estimated: 100, calls: 1, stopped: 1 }));

  // OpenRouter: a stopped request's final counts are looked up by its
  // generation id afterwards, and replace the estimate in the chat's total
  // even though the turn has ended; App's ledger gets the same correction.
  setChatUsageBase(totals({ input: 100, output: 10, calls: 1, reported: 1 }), 'chat-or');
  meter = startUsageMeter();
  const orStop = new AbortController();
  let lookupBody = null;
  let looked;
  const lookedUp = new Promise((resolve) => { looked = resolve; });
  responses = [
    stoppedStream(orStop, [{ id: 'gen-abc123', choices: [{ index: 0, delta: { content: 'x'.repeat(400) } }] }]),
    (url, init) => {
      lookupBody = JSON.parse(init.body);
      looked();
      return Response.json({ usage: { prompt_tokens: 3000, completion_tokens: 700, total_tokens: 3700, prompt_tokens_details: { cached_tokens: 1000 } } });
    },
  ];
  const corrections = [];
  const stopListening = onUsageCorrection((key, delta) => corrections.push({ key, delta }));
  const orProvider = { id: 'openrouter', model: 'openai/gpt-5', apiKey: 'sk-or-test' };
  await assert.rejects(requestModelText({ messages, onChunk: () => {}, retry: false, signal: orStop.signal, userProvider: orProvider }), { name: 'AbortError' });
  turn = meter.stop();
  assert.equal(turn.stopped, 1);
  assert.equal(turn.estimated > 0, true);
  await lookedUp;
  await settle();
  stopListening();
  assert.equal(lookupBody.usage_lookup, 'gen-abc123');
  assert.equal(lookupBody.messages, undefined, 'the lookup is not a chat request');
  const corrected = getLiveUsage();
  assert.deepEqual({ ...corrected, total: undefined, running: undefined, estimating: undefined, lastTurn: undefined }, {
    ...totals({ input: 3100, cached: 1000, output: 710, calls: 2, reported: 2 }),
    total: undefined, running: undefined, estimating: undefined, lastTurn: undefined,
  });
  assert.deepEqual(corrected.lastTurn, totals({ input: 3000, cached: 1000, output: 700, calls: 1, reported: 1 }));
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].key, 'chat-or');
  assert.deepEqual(addUsageDelta(totals({ input: 100, output: 10, calls: 1, reported: 1, estimated: turn.estimated, stopped: 1 }), corrections[0].delta), totals({ input: 3100, cached: 1000, output: 710, calls: 1, reported: 2 }));

  // A lookup that finds nothing leaves the estimate in place.
  meter = startUsageMeter();
  live = trackRequest({ messages: 'x'.repeat(40) });
  live.cancel({ billed: true, lookup: async () => null });
  await settle();
  assert.equal(meter.stop().stopped, 1);

  // The lookup itself (generationUsage.js): own OpenRouter keys only, and it
  // waits out the moment before a generation is listed.
  const orResolved = { id: 'openrouter', apiKey: 'sk-or-test', baseUrl: 'https://openrouter.ai/api/v1' };
  const generation = { native_tokens_prompt: 3000, native_tokens_completion: 700, native_tokens_reasoning: 500, native_tokens_cached: 1000, tokens_prompt: 2900, tokens_completion: 690 };
  const calls = [];
  const found = await lookupGenerationUsage('gen-abc123', orResolved, {
    delays: [0],
    fetchImpl: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      return calls.length === 1 ? new Response('not found', { status: 404 }) : Response.json({ data: generation });
    },
  });
  assert.deepEqual(await found.json(), { usage: { prompt_tokens: 3000, completion_tokens: 700, total_tokens: 3700, prompt_tokens_details: { cached_tokens: 1000 } } });
  assert.deepEqual(calls.map((c) => c.url), ['https://openrouter.ai/api/v1/generation?id=gen-abc123', 'https://openrouter.ai/api/v1/generation?id=gen-abc123']);
  assert.equal(calls[0].auth, 'Bearer sk-or-test');
  const neverListed = await lookupGenerationUsage('gen-abc123', orResolved, { delays: [0], fetchImpl: async () => new Response('', { status: 404 }) });
  assert.deepEqual(await neverListed.json(), { usage: null });
  assert.equal((await lookupGenerationUsage('gen-abc123', { ...orResolved, id: 'openai' })).status, 400);
  assert.equal((await lookupGenerationUsage('../../keys', orResolved)).status, 400);
  // Reasoning is a floor on the output, and normalized counts stand in when
  // the native ones are missing.
  assert.equal(usageFromGeneration({ native_tokens_prompt: 10, native_tokens_completion: 5, native_tokens_reasoning: 40 }).completion_tokens, 40);
  assert.equal(usageFromGeneration({ tokens_prompt: 10, tokens_completion: 5 }).prompt_tokens, 10);
  assert.equal(usageFromGeneration({ cancelled: true }), null);

  // Through /api/chat (chatProxy.js), with no model call.
  responses = [(url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/generation?id=gen-xyz');
    assert.equal(init.headers.Authorization, 'Bearer sk-or-test');
    return Response.json({ data: generation });
  }];
  const proxied = await handleChatProxy(new Request('http://127.0.0.1/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usage_lookup: 'gen-xyz', user_provider: orProvider }),
  }), {});
  assert.equal(proxied.status, 200);
  assert.equal((await proxied.json()).usage.prompt_tokens, 3000);

  // Another chat opened while a turn is still running: the turn lets go of
  // the header and never adds to the new chat.
  setChatUsageBase(emptyUsage(), 'chat-3');
  meter = startUsageMeter();
  recordUsage({ prompt_tokens: 50, completion_tokens: 5 });
  setChatUsageBase(totals({ input: 7, calls: 1, reported: 1 }), 'chat-4');
  await settle();
  assert.equal(getLiveUsage().running, false);
  assert.equal(getLiveUsage().total, 7);
  assert.equal(meter.stop().input, 50);
  await settle();
  assert.equal(getLiveUsage().total, 7);
  assert.equal(getLiveUsage().lastTurn, null, 'a different chat starts without a last turn');

  // An attached image counts as a flat amount, not its base64 length.
  const withImage = estimateRequestTokens({ messages: [{ content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(100_000)}` } }] }] });
  assert.ok(withImage > 1000 && withImage < 1100, String(withImage));

  // Each provider's usage shape.
  assert.equal(normalizeUsage(undefined), null);
  assert.equal(normalizeUsage({}), null);
  assert.deepEqual(normalizeUsage({ prompt_tokens: 10 }), { input: 10, cached: 0, cacheWrite: 0, output: 0 });
  // OpenAI: thinking is inside completion_tokens.
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens_details: { reasoning_tokens: 400 } }), { input: 1000, cached: 800, cacheWrite: 0, output: 500 });
  // Gemini and xAI: thinking only in total_tokens.
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1600 }), { input: 1000, cached: 0, cacheWrite: 0, output: 600 });
  // DeepSeek: cache hits under their own name.
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, prompt_cache_hit_tokens: 900, prompt_cache_miss_tokens: 100 }), { input: 1000, cached: 900, cacheWrite: 0, output: 10 });
  // Claude (anthropic.js) and OpenRouter: cache writes too.
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020, prompt_tokens_details: { cached_tokens: 600, cache_write_tokens: 300 } }), { input: 1000, cached: 600, cacheWrite: 300, output: 20 });

  // Web search usage (webToolsApi.js) in the chat shape, per provider.
  const fromSearch = (usage) => normalizeUsage(searchUsageOf(usage));
  assert.deepEqual(fromSearch({ promptTokenCount: 100, toolUsePromptTokenCount: 900, candidatesTokenCount: 50, thoughtsTokenCount: 200, totalTokenCount: 1250 }), { input: 1000, cached: 0, cacheWrite: 0, output: 250 });
  assert.deepEqual(fromSearch({ input_tokens: 700, output_tokens: 80, total_tokens: 900, input_tokens_details: { cached_tokens: 100 } }), { input: 700, cached: 100, cacheWrite: 0, output: 200 });
  assert.deepEqual(fromSearch({ input_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 60 }), { input: 500, cached: 0, cacheWrite: 0, output: 60 });
  assert.deepEqual(fromSearch({ prompt_tokens: 10, completion_tokens: 5 }), { input: 10, cached: 0, cacheWrite: 0, output: 5 });
  assert.equal(searchUsageOf(null), null);

  // Chats from before the ledger: summed from their versions' usage.
  const versions = [
    { sessionId: 'a', usage: { input: 10, output: 1, calls: 1, reported: 1 } },
    { sessionId: 'b', usage: { input: 99, output: 9, calls: 1, reported: 1 } },
    { sessionId: 'a' },
    { sessionId: 'a', usage: { input: 20, output: 2, cached: 5, calls: 2, reported: 2 } },
  ];
  assert.deepEqual(sessionUsageFromVersions(versions, 'a'), totals({ input: 30, output: 3, cached: 5, calls: 3, reported: 3 }));
  assert.deepEqual(normalizeChatUsage({ a: { input: '12', output: -3, junk: 1 }, '': {} }), { a: totals({ input: 12 }) });
  assert.deepEqual(normalizeChatUsage(null), {});

  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(842), '842');
  assert.equal(formatTokenCount(1000), '1k');
  assert.equal(formatTokenCount(12_380), '12.4k');
  assert.equal(formatTokenCount(250_000), '250k');
  assert.equal(formatTokenCount(999_999), '1M');
  assert.equal(formatTokenCount(1_234_567), '1.2M');

  console.log('testTokenUsage: ok');
} finally {
  globalThis.fetch = savedFetch;
  await server.close();
}

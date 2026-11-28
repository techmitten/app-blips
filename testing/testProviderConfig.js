import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyProviderSettings, resolveUserProvider,
  USER_PROVIDER_IDS, USER_PROVIDER_OPTIONS,
} from '../electron/server/providers.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';

// --- No provider ------------------------------------------------------------

test('a request without a provider of the user\'s own says to choose one', async () => {
  const response = await handleChatProxy(new Request('https://app.example/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  }), { OPENAI_API_KEY: 'sk-proj-ignored' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Settings → AI/);
});

// --- User-supplied provider (Settings → AI) --------------------------------

test('resolveUserProvider accepts each preset and uses the preset endpoint', () => {
  for (const { id, baseUrl } of USER_PROVIDER_OPTIONS) {
    const p = resolveUserProvider({ id, apiKey: 'k', model: 'any/model' });
    assert.equal(p.error, undefined);
    assert.notEqual(p.baseUrl, 'https://evil.invalid');
    assert.equal(p.baseUrl, baseUrl);
  }
  assert.ok(!USER_PROVIDER_IDS.includes('openai-compatible'));
});

test('self-hosted OpenRouter choices allow dynamic models', () => {
  assert.deepEqual(USER_PROVIDER_IDS, ['anthropic', 'openai', 'gemini', 'xai', 'deepseek', 'openrouter']);
  assert.equal(resolveUserProvider({
    id: 'openrouter', apiKey: 'sk-or-test', model: 'arbitrary/model',
  }).baseUrl, 'https://openrouter.ai/api/v1');
});

test('OpenRouter gets its compatible reasoning shape without DeepSeek fields', () => {
  const provider = resolveUserProvider({
    id: 'openrouter', apiKey: 'sk-or-test', model: 'anthropic/claude-3-haiku',
  });
  const enabled = { temperature: 0 };
  applyProviderSettings(enabled, provider, { effort: 'high' });
  assert.equal(enabled.reasoning_effort, 'high');
  assert.equal(Object.hasOwn(enabled, 'thinking'), false);
  assert.equal(Object.hasOwn(enabled, 'temperature'), false);

  const disabled = { temperature: 0.2 };
  applyProviderSettings(disabled, provider, { effort: 'none' });
  assert.deepEqual(disabled, { temperature: 0.2 });
});

test('resolveUserProvider rejects bad input', () => {
  const bad = [
    null, 'x', [],
    { id: 'openai-compatible', apiKey: 'k', model: 'm' },
    { id: 'nope', apiKey: 'k', model: 'm' },
    { id: 'openai', apiKey: '', model: 'm' },
    { id: 'openai', apiKey: 'a b', model: 'm' },
    { id: 'openai', apiKey: 'k'.repeat(513), model: 'm' },
    { id: 'openai', apiKey: 'k', model: '' },
    { id: 'openai', apiKey: 'k', model: 'm'.repeat(201) },
  ];
  for (const input of bad) assert.ok(resolveUserProvider(input).error, JSON.stringify(input));
});

test('LM Studio and Ollama are no longer offered', () => {
  for (const id of ['lmstudio', 'ollama']) assert.ok(resolveUserProvider({ id, model: 'local-coder' }).error);
});

test('Gemini uses the official endpoint and compatible reasoning settings', async (t) => {
  const provider = resolveUserProvider({ id: 'gemini', apiKey: 'google-key', model: 'gemini-test', baseUrl: 'https://evil.invalid' });
  assert.equal(provider.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.ok(resolveUserProvider({ id: 'gemini', model: 'gemini-test' }).error);
  const body = { temperature: 0, tool_choice: 'required', stream_options: { include_usage: true } };
  applyProviderSettings(body, provider, { effort: 'high' });
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.temperature, undefined);
  assert.equal(body.thinking, undefined);
  assert.equal(body.tool_choice, 'required');
  const off = {};
  applyProviderSettings(off, provider, { effort: 'none' });
  assert.equal(off.reasoning_effort, undefined);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${provider.baseUrl}/chat/completions`);
    assert.equal(options.headers.Authorization, 'Bearer google-key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gemini-test');
    assert.equal(payload.reasoning_effort, 'high');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const response = await handleChatProxy(new Request('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify({ user_provider: { id: 'gemini', apiKey: 'google-key', model: 'gemini-test' }, messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'high' }),
  }), {});
  assert.equal(response.status, 200);
});

test('user-selected DeepSeek uses its official API and thinking settings', async (t) => {
  assert.ok(resolveUserProvider({ id: 'deepseek', model: 'deepseek-test' }).error);
  const provider = resolveUserProvider({ id: 'deepseek', apiKey: 'ds-user-key', model: 'deepseek-test', baseUrl: 'https://evil.invalid' });
  assert.equal(provider.baseUrl, 'https://api.deepseek.com');
  const body = { temperature: 0 };
  applyProviderSettings(body, provider, { effort: 'high' });
  assert.deepEqual(body, { thinking: { type: 'enabled' }, reasoning_effort: 'high' });
  const off = {};
  applyProviderSettings(off, provider, { effort: 'none' });
  assert.deepEqual(off, { thinking: { type: 'disabled' } });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer ds-user-key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'deepseek-test');
    assert.deepEqual(payload.thinking, { type: 'enabled' });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const response = await handleChatProxy(new Request('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify({ user_provider: { id: 'deepseek', apiKey: 'ds-user-key', model: 'deepseek-test' }, messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'high' }),
  }), {});
  assert.equal(response.status, 200);
});

test('DeepSeek thinking retains edit tools and relaxes forced choices only while reasoning is enabled', () => {
  const provider = resolveUserProvider({ id: 'deepseek', apiKey: 'ds-user-key', model: 'deepseek-v4-pro' });
  const tools = [{ type: 'function', function: { name: 'apply_file_changes' } }];
  for (const choice of ['required', { type: 'function', function: { name: 'apply_file_changes' } }, 'auto', 'none', undefined]) {
    for (const effort of ['low', 'medium', 'high', 'none']) {
      const body = { tools, ...(choice ? { tool_choice: choice } : {}) };
      applyProviderSettings(body, provider, { effort });
      assert.equal(body.thinking.type, effort === 'none' ? 'disabled' : 'enabled');
      assert.equal(body.reasoning_effort, effort === 'none' ? undefined : effort);
      assert.deepEqual(body.tools, tools);
      assert.deepEqual(body.tool_choice, effort === 'none' || choice === 'none' || choice === undefined ? choice : 'auto');
    }
  }
});

test('OpenAI adapts token limits and model-specific reasoning parameters', () => {
  for (const model of ['gpt-5-mini', 'o3-mini', 'gpt-4.1']) {
    const provider = resolveUserProvider({ id: 'openai', apiKey: 'openai-key', model, baseUrl: 'https://evil.invalid' });
    assert.equal(provider.baseUrl, 'https://api.openai.com/v1');
    for (const effort of ['high', 'none']) {
      const body = { model, temperature: 0.2, max_tokens: 4096, tool_choice: 'required', stream_options: { include_usage: true } };
      applyProviderSettings(body, provider, { effort });
      assert.equal(body.max_tokens, undefined);
      assert.equal(body.max_completion_tokens, 4096);
      assert.equal(body.thinking, undefined);
      // Off: models that can't turn reasoning off get their lowest level.
      const lowest = { 'gpt-5-mini': 'minimal', 'o3-mini': 'low' }[model];
      assert.equal(body.reasoning_effort, model === 'gpt-4.1' ? undefined : effort === 'none' ? lowest : 'high');
      if (model !== 'gpt-4.1') assert.equal(body.temperature, undefined);
      assert.equal(body.tool_choice, 'required');
      assert.deepEqual(body.stream_options, { include_usage: true });
    }
  }
});

test('user-selected OpenAI sends its key and model to the official endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer openai-user-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5-mini');
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.reasoning_effort, 'high');
    assert.equal(body.temperature, undefined);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  const response = await handleChatProxy(new Request('http://localhost/api/chat', {
    method: 'POST', body: JSON.stringify({ user_provider: { id: 'openai', apiKey: 'openai-user-key', model: 'gpt-5-mini' }, messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'high', max_tokens: 4096 }),
  }), {});
  assert.equal(response.status, 200);
});

test('uncensored OpenRouter models are refused', async () => {
  const { resolveUserProvider: resolve, isOpenRouter, isUncensoredModel } = await import('../electron/server/providers.js');
  assert.match(resolve({ id: 'openrouter', apiKey: 'k', model: 'cognitivecomputations/dolphin-mistral-24b-venice-edition' }).error, /Uncensored/);
  assert.match(resolve({ id: 'openrouter', apiKey: 'k', model: 'x/model-ABLITERATED' }).error, /Uncensored/);
  assert.equal(resolve({ id: 'openrouter', apiKey: 'k', model: 'anthropic/claude-opus-5.5' }).error, undefined);
  assert.ok(isOpenRouter({ id: 'deepseek', baseUrl: 'https://openrouter.ai/api/v1' }));
  assert.ok(!isOpenRouter({ id: 'deepseek', baseUrl: 'https://api.deepseek.com' }));
  assert.ok(isUncensoredModel('venice/uncensored'));
});

test('xAI: OpenAI-compatible endpoint, reasoning_effort only where the Grok model takes it', () => {
  const xai = resolveUserProvider({ id: 'xai', apiKey: 'xai-k', model: 'grok-4.3' });
  assert.equal(xai.baseUrl, 'https://api.x.ai/v1');
  const send = (model, effort) => {
    const body = { model, reasoning_effort: 'stale' };
    applyProviderSettings(body, { ...xai, model }, { effort });
    return body.reasoning_effort;
  };
  assert.equal(send('grok-4.3', 'high'), 'high');
  assert.equal(send('grok-3-mini', 'medium'), 'high');
  assert.equal(send('grok-4', 'high'), undefined);
  assert.equal(send('grok-4.20-0309-reasoning', 'high'), undefined);
  // Reasoning is always on for Grok 4.3, so Off becomes its lowest level.
  assert.equal(send('grok-4.3', 'none'), 'low');
});

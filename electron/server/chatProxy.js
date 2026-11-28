// LLM proxy handler. Written with only Fetch API primitives (Request /
// Response / fetch) so the same code runs unmodified in the desktop app
// (electron/main.js answers /api/* in-process via protocol.handle) and as Vite
// dev-server middleware for local UI work -- one implementation, no drift.
// Anthropic is the exception to the plain fetch: anthropic.js calls it through
// the official SDK and hands back an OpenAI-shaped Response.
//
// The renderer only ever talks to this app's own origin at POST /api/chat.
// Every request runs on the user's own provider from Settings → AI: the host
// attaches the saved one (withSavedProvider), or the renderer sends its own
// `user_provider`. There is no server-side provider.

import { lookupGenerationUsage } from './generationUsage.js';
import { resolveUserProvider, applyProviderSettings, providerLabel, DEFAULT_BUILD_MAX_TOKENS } from './providers.js';
import { relayUpstream } from './relay.js';
import { callAnthropic } from './anthropic.js';

export const DEFAULT_TEMPERATURE = 0;

const toChatCompletionsUrl = (baseUrl) => {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
};

const badRequest = (error, status = 400) => new Response(JSON.stringify({ error }), {
  status,
  headers: { 'content-type': 'application/json' },
});

// The user's own provider (Settings → AI). Returns { provider } or
// { response } (an error to send back).
const pickProvider = (payload) => {
  if (payload?.user_provider == null) return { response: badRequest('Choose an AI provider and add your API key in Settings → AI.') };
  const provider = resolveUserProvider(payload.user_provider);
  if (provider.error) return { response: badRequest(`Your AI provider settings are incomplete: ${provider.error}`) };
  return { provider };
};

// A single-user install has no sign-in, so a browser may call /api/chat only
// from AppBlips' own page. Browsers label every cross-site POST with Origin --
// including "simple" text/plain requests that skip the CORS preflight, which
// any web page, or a sandboxed generated app (Origin "null"), could otherwise
// send to spend the configured key without reading the reply. A request with
// no Origin is not a browser on another site (curl, a local script) and still
// passes. Own origin is built from protocol + host rather than URL.origin,
// which is "null" for the desktop app's appblips:// scheme.
export const isForeignOrigin = (request, env) => {
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  let own = '';
  try {
    const url = new URL(request.url);
    own = `${url.protocol}//${url.host}`;
  } catch { /* invalid request URL: nothing matches */ }
  if (own && origin === own) return false;
  const allowed = String(env.APPBLIPS_CHAT_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  return !allowed.includes(origin);
};

// The human-readable part of an upstream error body (OpenAI-style
// { error: { message } }, or a plain string), capped for display.
const upstreamErrorMessage = async (upstream) => {
  let text = '';
  try {
    text = await upstream.text();
  } catch (err) {
    console.warn('[proxy] could not read the upstream error body:', err);
    return '';
  }
  let message = text;
  try {
    const body = JSON.parse(text);
    const err = body?.error ?? body;
    message = typeof err === 'string' ? err : err?.message || body?.message || text;
  } catch { /* not JSON: use the text */ }
  return String(message).replace(/\s+/g, ' ').trim().slice(0, 300);
};

// A smaller output limit to retry with after a provider rejected `current`,
// or null when no useful limit is left. Dropping the limit instead would fall
// back to the provider's own default, often a few thousand tokens, which cuts
// a whole app off halfway: the problem DEFAULT_BUILD_MAX_TOKENS exists for.
const MIN_RETRY_LIMIT = 1024;
const OUTPUT_LIMIT_ERROR = /max_(?:completion_)?tokens|max(?:imum)?[ _-]?output|output[ _-]?tokens/i;
export const smallerOutputLimit = (detail, current) => {
  const text = String(detail).replace(/(\d),(?=\d{3}\b)/g, '$1');
  // "input + max_tokens > context" (Anthropic): the room left after the input.
  const sum = text.match(/(\d+)\s*\+\s*(\d+)\s*>\s*(\d+)/);
  if (sum && Number(sum[2]) === current) {
    const room = Number(sum[3]) - Number(sum[1]);
    return room >= MIN_RETRY_LIMIT && room < current ? room : null;
  }
  // Most providers name their maximum ("at most 16384", "range [1, 8192]");
  // otherwise halve.
  const named = (text.match(/\b\d+\b/g) || []).map(Number).filter((n) => n >= MIN_RETRY_LIMIT && n < current);
  const next = named.length ? Math.max(...named) : Math.floor(current / 2);
  return next >= MIN_RETRY_LIMIT ? next : null;
};

// A provider rejecting the user's own key is reported as a bad request that
// names Settings → AI, not passed through as the provider's 401.
const rejectedUserKey = (provider) => badRequest(`${providerLabel(provider.id)} rejected the API key in Settings → AI.`);

// How long the provider has to start answering (headers, not the whole
// reply, which streams for minutes). Without it a provider that never
// answers holds the request open for good.
export const UPSTREAM_CONNECT_MS = 120_000;

export async function handleChatProxy(request, env, { connectTimeoutMs = UPSTREAM_CONNECT_MS } = {}) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (isForeignOrigin(request, env)) {
    return new Response(JSON.stringify({ error: 'Requests from other sites are not allowed.' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return badRequest('Invalid JSON body.');
  }

  // Settings → AI may supply an output limit. Without one, builds get
  // DEFAULT_BUILD_MAX_TOKENS and Ask uses the provider's default.
  const maxTokens = payload?.max_tokens;
  if (maxTokens != null && (!Number.isSafeInteger(maxTokens) || maxTokens <= 0)) {
    return badRequest('The output token limit must be a positive whole number. Change it in Settings → AI.');
  }

  const picked = pickProvider(payload);
  if (picked.response) return picked.response;
  const { provider } = picked;

  // The final counts of an OpenRouter request stopped part-way, for the
  // token counter (generationUsage.js). Not a chat request: no model call.
  if (payload && typeof payload === 'object' && 'usage_lookup' in payload) {
    return lookupGenerationUsage(payload.usage_lookup, provider, { signal: request.signal });
  }

  return forward(request, payload, provider, maxTokens, connectTimeoutMs);
}

// Sends the request to `provider` and returns its answer, or an error.
async function forward(request, payload, provider, maxTokens, connectTimeoutMs) {
  const url = toChatCompletionsUrl(provider.baseUrl);
  const apiKey = provider.apiKey;
  const { model } = provider;

  const { messages, tools, tool_choice, stream, reasoning_effort } = payload;

  // 0.0 everywhere (desktop, browser, Docker, Android); reasoning models,
  // which reject a temperature, have it removed (providers.js).
  const bodyObj = {
    model,
    stream: !!stream,
    messages,
    temperature: DEFAULT_TEMPERATURE,
  };

  if (bodyObj.stream) {
    bodyObj.stream_options = { include_usage: true };
  }

  // Anthropic requires a limit, so its Ask requests get the default here too,
  // where a rejection can be retried.
  const defaultLimit = maxTokens == null && (payload.ask !== true || provider.id === 'anthropic');
  if (maxTokens != null) bodyObj.max_tokens = maxTokens;
  else if (defaultLimit) bodyObj.max_tokens = DEFAULT_BUILD_MAX_TOKENS;

  if (tools) bodyObj.tools = tools;
  if (tool_choice) bodyObj.tool_choice = tool_choice;

  // Reasoning is a per-user setting sent by the client ('none' when omitted).
  // applyProviderSettings writes it in the configured provider's format (see
  // providers.js), drops stream_options where unsupported, and relaxes forced
  // tool choices the provider would reject -- the refinement loop already
  // nudges the model if 'auto' returns no tool call.
  // The message ID keys prompt caching: every request of one build shares it.
  const cacheKey = request.headers?.get?.('x-appblips-message') || '';
  applyProviderSettings(bodyObj, provider, { effort: reasoning_effort ?? 'none', cacheKey });

  // The client going away (request.signal) cancels the upstream call at any
  // point; the connect timer only runs until the provider's headers arrive.
  // (The Anthropic SDK has its own timeout, anthropic.js.)
  const send = async (body) => {
    if (provider.id === 'anthropic') return callAnthropic(body, provider);
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(new Error(`${providerLabel(provider.id)} did not answer within ${Math.round(connectTimeoutMs / 1000)} s.`)), connectTimeoutMs);
    const onClientGone = () => control.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', onClientGone, { once: true });
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: control.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let upstream;
  try {
    upstream = await send(bodyObj);
    // An older or smaller model may reject the default limit as above its
    // maximum, or a large input may leave less room than it in the context
    // window. The user didn't ask for that number, so retry with the largest
    // limit the error allows (a few tries at most).
    const limitField = Object.hasOwn(bodyObj, 'max_completion_tokens') ? 'max_completion_tokens' : 'max_tokens';
    let limit = bodyObj[limitField];
    for (let tries = 0; defaultLimit && upstream.status === 400 && tries < 3; tries++) {
      const detail = await upstream.clone().text().catch(() => '');
      const next = OUTPUT_LIMIT_ERROR.test(detail) ? smallerOutputLimit(detail, limit) : null;
      if (next == null) break;
      upstream.body?.cancel().catch(() => {});
      limit = next;
      upstream = await send({ ...bodyObj, [limitField]: limit });
    }
  } catch (err) {
    // The client cancelled: nobody is waiting for an answer.
    if (request.signal?.aborted) return new Response(null, { status: 499 });
    console.error(`[proxy] could not reach ${provider.id} (${model}):`, err);
    // In the browser version an own-key request goes straight from the page
    // to the provider, and some providers (OpenAI) send their error replies
    // without CORS headers, so a rejected key or a lack of credit looks like
    // a network failure here.
    const error = `Couldn't reach ${providerLabel(provider.id)}. Check your internet connection, then check your API key and credit in Settings → AI.`;
    return new Response(JSON.stringify({ error }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Anthropic errors are logged in anthropic.js, with the reason.
  if (!upstream.ok && provider.id !== 'anthropic') console.warn(`[proxy] ${provider.id} (${model}) answered HTTP ${upstream.status}`);

  if (upstream.status === 401 || upstream.status === 403) {
    upstream.body?.cancel().catch(() => {});
    return rejectedUserKey(provider);
  }

  // A provider's own 429 (low balance, a per-account concurrency cap, an
  // overloaded model) passes through with the provider's reason, marked as
  // such.
  if (upstream.status === 429) {
    const detail = await upstreamErrorMessage(upstream);
    const retryAfter = upstream.headers.get('retry-after');
    return new Response(JSON.stringify({
      error: `${providerLabel(provider.id)} turned the request down${detail ? `: ${detail}` : '.'}`,
      source: 'provider',
    }), {
      status: 429,
      headers: { 'content-type': 'application/json', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
    });
  }

  return relayUpstream(upstream);
}

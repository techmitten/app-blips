// LLM proxy handler. Written with only Fetch API primitives (Request /
// Response / fetch) so the same code runs unmodified in the desktop app
// (electron/main.js answers /api/* in-process via protocol.handle) and as Vite
// dev-server middleware for local UI work -- one implementation, no drift.
// Anthropic is the exception to the plain fetch: anthropic.js calls it through
// the official SDK and hands back an OpenAI-shaped Response.
//
// The point of this proxy: the real base URL / API key / model / tuning knobs
// live only in server-side env vars (OPENAI_*, no VITE_ prefix), so they never
// reach the client bundle. The renderer only ever talks to this app's own
// origin at POST /api/chat.
//
// Single-user hosts (the desktop app, Android, a local server.js) attach the
// provider saved in Settings → AI themselves (withSavedProvider); the renderer
// may also send its own `user_provider`. Anything else uses the env provider.

import { resolveProvider, resolveUserProvider, applyProviderSettings, providerLabel, llmEnv, isOpenRouter, isUncensoredModel, UNCENSORED_ERROR, DEFAULT_BUILD_MAX_TOKENS } from './providers.js';
import { relayUpstream } from './relay.js';
import { callAnthropic } from './anthropic.js';
import { defaultModel } from './defaultModel.js';
import { meterResponse } from './freeLimits.js';

const toChatCompletionsUrl = (baseUrl) => {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
};

const badRequest = (error, status = 400) => new Response(JSON.stringify({ error }), {
  status,
  headers: { 'content-type': 'application/json' },
});

// Misconfiguration is the operator's problem, and the operator is also the
// user of a single-user install, so they get the exact fix.
const configError = (env, detail) => new Response(
  JSON.stringify({ error: `AppBlips isn't set up yet. ${detail} Or set your own provider in Settings → AI.` }),
  { status: 500, headers: { 'content-type': 'application/json' } },
);

// The provider for this request: the user's own (Settings → AI) when the
// client sent one, otherwise the env provider. Returns { provider } or
// { response } (an error to send back).
const pickProvider = async (env, payload) => {
  if (payload?.user_provider != null) {
    const provider = resolveUserProvider(payload.user_provider);
    if (provider.error) return { response: badRequest(`Your AI provider settings are incomplete: ${provider.error}`) };
    return { provider };
  }
  const provider = resolveProvider(env, 'APPBLIPS_LLM');
  if (provider.error) return { response: configError(env, provider.error) };
  if (provider.missing.length) {
    return {
      response: configError(
        env,
        `Missing configuration: ${provider.missing.join(', ')}. Add ${provider.missing.length > 1 ? 'them' : 'it'} to your .env (or your host's environment variables) and restart.`,
      ),
    };
  }
  if (provider.autoModel) {
    try {
      provider.model = await defaultModel(provider);
    } catch (err) {
      return { response: configError(env, err.message) };
    }
  }
  if (isOpenRouter(provider) && isUncensoredModel(provider.model)) return { response: configError(env, UNCENSORED_ERROR) };
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

const hasImageContent = (messages) => Array.isArray(messages) && messages.some(
  (m) => Array.isArray(m?.content) && m.content.some((part) => part?.type === 'image_url'),
);

// The configured model, or a role-specific one: OPENAI_LLM_VISION_MODEL for
// requests carrying an image. Never applied to the user's own provider, whose
// model is theirs to choose.
const routeModel = (env, provider, payload) => {
  if (provider.userSupplied) return provider.model;
  if (hasImageContent(payload.messages)) return llmEnv(env, 'VISION_MODEL') || provider.model;
  return provider.model;
};

// How long the provider has to start answering (headers, not the whole
// reply, which streams for minutes). Without it a provider that never
// answers holds the request open for good.
export const UPSTREAM_CONNECT_MS = 120_000;

// `freeLimits` (freeLimits.js) limits requests answered with the env
// provider (the Free option) per `visitor`; server.js passes both.
export async function handleChatProxy(request, env, { connectTimeoutMs = UPSTREAM_CONNECT_MS, freeLimits = null, visitor = '' } = {}) {
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
  // DEFAULT_BUILD_MAX_TOKENS and Ask uses the provider's default; environment
  // caps are no longer read.
  const maxTokens = payload?.max_tokens;
  if (maxTokens != null && (!Number.isSafeInteger(maxTokens) || maxTokens <= 0)) {
    return badRequest('The output token limit must be a positive whole number. Change it in Settings → AI.');
  }

  const picked = await pickProvider(env, payload);
  if (picked.response) return picked.response;
  const { provider } = picked;

  // The Free option: counted per visitor, and its output capped.
  let ticket = null;
  if (freeLimits && !provider.userSupplied) {
    const started = freeLimits.begin(visitor);
    if (started.refused) {
      const { error, retryAfter } = started.refused;
      return new Response(JSON.stringify({ error, source: 'free-limit' }), {
        status: 429,
        headers: { 'content-type': 'application/json', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
      });
    }
    ticket = started;
  }
  try {
    const response = await forward(request, env, payload, provider, maxTokens, connectTimeoutMs, ticket ? freeLimits.limits.maxOutputTokens : 0);
    if (!ticket) return response;
    // An error (or a cancelled request) is passed on as it is and counts
    // toward the hourly limit only.
    if (!response.ok) {
      ticket.end(0);
      return response;
    }
    const sentChars = JSON.stringify(payload.messages ?? '').length + JSON.stringify(payload.tools ?? '').length;
    return meterResponse(response, { sentChars, done: (tokens) => ticket.end(tokens) });
  } catch (err) {
    ticket?.end(0);
    throw err;
  }
}

// Sends the request to `provider` and returns its answer, or an error.
async function forward(request, env, payload, provider, maxTokens, connectTimeoutMs, outputCap) {
  const url = toChatCompletionsUrl(provider.baseUrl);
  const apiKey = provider.apiKey;
  const model = routeModel(env, provider, payload);

  const { messages, tools, tool_choice, stream, reasoning_effort, auto_fix } = payload;

  let temperature = 0.2;
  if (auto_fix === true) {
    // Error auto-fix requests (runtime or syntax) must be deterministic, so
    // pin temperature to 0.0 regardless of OPENAI_LLM_TEMPERATURE.
    temperature = 0;
  } else if (llmEnv(env, 'TEMPERATURE') !== '') {
    const parsedTemperature = parseFloat(llmEnv(env, 'TEMPERATURE'));
    if (!isNaN(parsedTemperature)) temperature = parsedTemperature;
  }

  const bodyObj = {
    model,
    stream: !!stream,
    messages,
    temperature,
  };

  if (bodyObj.stream) {
    bodyObj.stream_options = { include_usage: true };
  }

  // Anthropic requires a limit, so its Ask requests get the default here too,
  // where a rejection can be retried.
  const defaultLimit = maxTokens == null && (payload.ask !== true || provider.id === 'anthropic');
  if (maxTokens != null) bodyObj.max_tokens = maxTokens;
  else if (defaultLimit) bodyObj.max_tokens = DEFAULT_BUILD_MAX_TOKENS;
  // The Free option's per-request cap (freeLimits.js) wins over both.
  if (outputCap) bodyObj.max_tokens = Math.min(bodyObj.max_tokens ?? outputCap, outputCap);

  if (tools) bodyObj.tools = tools;
  if (tool_choice) bodyObj.tool_choice = tool_choice;

  // Reasoning is a per-user setting sent by the client ('none' when omitted).
  // applyProviderSettings writes it in the configured provider's format (see
  // providers.js), drops stream_options where unsupported, and relaxes forced
  // tool choices the provider would reject -- the refinement loop already
  // nudges the model if 'auto' returns no tool call.
  applyProviderSettings(bodyObj, provider, { effort: reasoning_effort ?? 'none' });

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
    return new Response(JSON.stringify({ error: `Failed to reach LLM endpoint: ${err.message}` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Anthropic errors are logged in anthropic.js, with the reason.
  if (!upstream.ok && provider.id !== 'anthropic') console.warn(`[proxy] ${provider.id} (${model}) answered HTTP ${upstream.status}`);

  if (provider.userSupplied && (upstream.status === 401 || upstream.status === 403)) {
    upstream.body?.cancel().catch(() => {});
    return rejectedUserKey(provider);
  }

  // A provider's own 429 (low balance, a per-account concurrency cap, an
  // overloaded model) passes through with the provider's reason, marked as
  // such, rather than looking like this proxy's own limit.
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

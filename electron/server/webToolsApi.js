// /api/web/*: web search (and, on DeepSeek, page reading) for the AI build
// agent, through the search of the AI provider in use, paid by the same key
// that writes the project:
//   - the user's own provider from Settings → AI, or
//   - the host's environment provider (the Free option).
// Each provider's own search API is used, and only on its own endpoint (a
// custom base URL gets nothing):
//   deepseek    Search and Fetch APIs (api.deepseek.com/v1/tools)
//   anthropic   Messages API with the web_search server tool
//   openai      Responses API with the web_search tool
//   xai         Responses API with the web_search tool
//   gemini      generateContent with Google Search grounding
//   openrouter  Chat Completions with the web plugin
// The build model only ever sees one client tool, web_search (plus web_fetch
// on DeepSeek), so it works the same with every provider; the providers'
// own server-side tools can't sit next to the build's function tools on the
// Chat Completions endpoint most of them are reached through. Apart from
// DeepSeek, a search is a short call to the same model with the provider's
// search switched on, which answers with the facts it found and their sources.
//
// The request reaches this handler the way /api/chat does: withSavedProvider
// has already attached the saved key as `user_provider`, so the key never
// passes through the page, and it only goes to that provider's own host.
// Used by every host (electron/main.js, server.js, the Vite dev server,
// android.js), so Fetch primitives only, like chatProxy.js (Anthropic through
// its SDK, as in anthropic.js).
//
// On the Free option the host pays, so each call also counts against the
// visitor's free allowance (freeLimits.js): the tokens it used plus a weight
// for the provider's search fee.
//
//   POST /api/web/status             -> { available, paidBy: 'own' | 'free' | '', provider, fetch, searches }
//   POST /api/web/search  { query }  -> { query, answer?, results: [{ title, url, content, published_date? }] } | { error }
//   POST /api/web/fetch   { url }    -> { url, title, content, truncated? } | { error }   (DeepSeek only)
// An error may carry `stop: true`: no later call in this prompt can work
// (bad key, no balance, a model without search, free allowance used up).
import Anthropic from '@anthropic-ai/sdk';
import { isForeignOrigin } from './chatProxy.js';
import { resolveProvider, resolveUserProvider, providerLabel } from './providers.js';
import { defaultModel } from './defaultModel.js';

const DEEPSEEK_TOOLS = 'https://api.deepseek.com/v1/tools';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
// Each provider's own endpoint, as in providers.js. Search is offered only
// when the provider in use points there, so a key never goes elsewhere.
const PRESET_HOSTS = {
  deepseek: 'api.deepseek.com',
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  xai: 'api.x.ai',
  gemini: 'generativelanguage.googleapis.com',
  openrouter: 'openrouter.ai',
};
const TIMEOUT_MS = 20_000;
// A provider that searches and then writes an answer needs longer.
const ANSWER_TIMEOUT_MS = 60_000;
const MAX_QUERY = 128; // DeepSeek's own limit, kept for every provider
const MAX_URL = 8192; // DeepSeek's own limit
const SEARCH_RESULTS = 5;
const MAX_SOURCES = 8;
const MAX_SUMMARY = 800;
const MAX_ANSWER = 3000;
const ANSWER_MAX_TOKENS = 1500;
const MAX_PAGE_CHARS = 12_000;
// Searches the build model may make per request: DeepSeek's are a fraction
// of a cent; the others are a model call plus the provider's search fee
// (about $0.01 to $0.014 each).
const SEARCHES = { deepseek: 5 };
const DEFAULT_SEARCHES = 3;
// What one billed call weighs against the Free option's daily token
// allowance, on top of the tokens it used: roughly its search fee in tokens.
// Estimates, not prices.
export const SEARCH_FEE_TOKENS = { deepseek: 2500 };
const DEFAULT_SEARCH_FEE_TOKENS = 20_000;

const UNAVAILABLE = 'Web search is unavailable right now.';
const BUSY = 'Web search is busy right now. Try again in a moment.';
const NOT_OFFERED = 'Web search isn’t available with this AI provider.';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

const onPresetHost = (provider) => {
  try {
    return Boolean(PRESET_HOSTS[provider.id]) && new URL(provider.baseUrl).hostname === PRESET_HOSTS[provider.id];
  } catch {
    return false;
  }
};

// The provider that pays for this request's searches: -> { provider, own },
// provider null when web search isn't offered. Mirrors chatProxy's
// pickProvider: a `user_provider` (Settings → AI) wins, and the environment
// provider is used only when there is none.
// `lookupModel: false` skips picking a model for an environment provider
// that names none (no network), which only the status check wants.
export const webSearchProvider = async (env, payload, { fetchImpl = globalThis.fetch, lookupModel = true } = {}) => {
  if (payload?.user_provider != null) {
    const provider = resolveUserProvider(payload.user_provider);
    return { provider: !provider.error && onPresetHost(provider) ? provider : null, own: true };
  }
  const provider = resolveProvider(env, 'APPBLIPS_LLM', { quiet: true });
  if (provider.error || provider.missing.length || !onPresetHost(provider)) return { provider: null, own: false };
  if (lookupModel && provider.autoModel && provider.id !== 'deepseek') {
    try {
      provider.model = await defaultModel(provider, { fetchImpl });
    } catch {
      return { provider: null, own: false };
    }
  }
  return { provider, own: false };
};

const oneLine = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Only plain web addresses, never javascript: or data: ones, since the AI may
// put a result's address into a page.
export function webUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

// A source as a search result, in the same shape the Tavily search returns.
const source = ({ url, title, content = '', date = '' }) => {
  const clean = webUrl(url);
  if (!clean) return null;
  const published = oneLine(date, 40);
  return {
    title: oneLine(title, 200),
    url: clean,
    content: oneLine(content, MAX_SUMMARY),
    ...(published ? { published_date: published } : {}),
  };
};

const uniqueSources = (list) => {
  const seen = new Set();
  return list.map(source).filter((item) => item && !seen.has(item.url) && seen.add(item.url)).slice(0, MAX_SOURCES);
};

// Page Markdown for the model: kept multi-line, blank-line runs squeezed.
const pageText = (value) => {
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  return text.length > MAX_PAGE_CHARS ? { content: `${text.slice(0, MAX_PAGE_CHARS)}…`, truncated: true } : { content: text };
};

const answerText = (value) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_ANSWER) : '');

const callSignal = (request, ms) => {
  const timeout = AbortSignal.timeout(ms);
  return request.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([request.signal, timeout]) : timeout;
};

// An HTTP error from a provider as { status, error, stop? }. The user can fix
// their own key or model; the host's is the host's to fix.
const providerError = (status, provider, own, kind = 'search') => {
  const label = providerLabel(provider.id);
  if (status === 429) return { status: 503, error: BUSY };
  if (kind === 'fetch' && (status === 403 || status === 404)) return { status: 422, error: 'That page couldn’t be read. Try a different result.' };
  if (status === 401 || status === 403 || status === 402) {
    if (!own) {
      console.error(`[web] ${label} ${kind} refused the server's key (${status}).`);
      return { status: 503, error: UNAVAILABLE, stop: true };
    }
    return status === 402
      ? { status: 402, stop: true, error: `Your ${label} account has no balance left for web search.` }
      : { status: 401, stop: true, error: `${label} rejected the API key in Settings → AI, or the key can’t use web search.` };
  }
  if (status === 400 || status === 404) {
    if (provider.id === 'deepseek') {
      return { status: 400, error: kind === 'fetch' ? 'That address can’t be read.' : 'The search couldn’t run with that query. Try different words.' };
    }
    // Most often the model in use has no web search.
    return { status: 400, stop: true, error: `Web search didn’t work with ${label}’s ${provider.model || 'model'}. Try another model in Settings → AI.` };
  }
  return { status: 503, error: UNAVAILABLE };
};

// One JSON POST: -> { body } or { status, error, stop? }. Never throws.
async function postJson(url, headers, body, request, fetchImpl, { provider, own, kind = 'search', ms = TIMEOUT_MS }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: callSignal(request, ms),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { status: timedOut ? 504 : 502, error: timedOut ? 'The web search took too long.' : UNAVAILABLE };
  }
  if (!response.ok) {
    response.body?.cancel().catch(() => {});
    return providerError(response.status, provider, own, kind);
  }
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === 'object') return { body: parsed };
  } catch { /* fall through */ }
  return { status: 502, error: UNAVAILABLE };
}

// What the search model is asked, for every provider that answers in prose.
const searchPrompt = (query) => `Search the web for: ${query}

Report the facts you find that answer this, in plain text of at most about 200 words, and say which source each fact comes from. Only report what the search results say; if they don't answer it, say so. No markdown headings, no follow-up questions.`;

const tokensOf = (usage) => {
  const total = Number(usage?.total_tokens ?? usage?.totalTokenCount);
  if (Number.isFinite(total) && total > 0) return total;
  const sum = Number(usage?.input_tokens || usage?.prompt_tokens || usage?.promptTokenCount || 0)
    + Number(usage?.output_tokens || usage?.completion_tokens || usage?.candidatesTokenCount || 0);
  return sum > 0 ? sum : 0;
};

// ---- Each provider's search: -> { billed, tokens, body } or { status, error, stop? } ----

async function searchDeepSeek(query, { provider, own }, request, fetchImpl) {
  const result = await postJson(`${DEEPSEEK_TOOLS}/search`, { authorization: `Bearer ${provider.apiKey}` },
    { query, count: SEARCH_RESULTS, need_content: false }, request, fetchImpl, { provider, own });
  if (result.error) return result;
  const raw = Array.isArray(result.body.results) ? result.body.results : [];
  const results = raw.map((r) => source({ url: r?.url, title: r?.title, content: r?.summary || r?.snippet, date: r?.date })).filter(Boolean).slice(0, SEARCH_RESULTS);
  // DeepSeek bills a search only when its results array isn't empty.
  return { billed: raw.length > 0, tokens: 0, body: { query, results } };
}

// OpenAI and xAI: the Responses API with the web_search tool.
async function searchResponses(query, { provider, own }, request, fetchImpl) {
  const base = provider.id === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
  const result = await postJson(`${base}/responses`, { authorization: `Bearer ${provider.apiKey}` }, {
    model: provider.model,
    input: searchPrompt(query),
    tools: [{ type: 'web_search' }],
    max_output_tokens: ANSWER_MAX_TOKENS,
    store: false,
  }, request, fetchImpl, { provider, own, ms: ANSWER_TIMEOUT_MS });
  if (result.error) return result;
  const parts = (Array.isArray(result.body.output) ? result.body.output : [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text');
  const answer = answerText(typeof result.body.output_text === 'string' && result.body.output_text
    ? result.body.output_text
    : parts.map((part) => part.text || '').join('\n'));
  const cited = parts.flatMap((part) => (Array.isArray(part.annotations) ? part.annotations : []))
    .filter((note) => note?.type === 'url_citation')
    .map((note) => ({ url: note.url, title: note.title }));
  const searched = (result.body.output || []).some((item) => item?.type === 'web_search_call');
  return { billed: searched, tokens: tokensOf(result.body.usage), body: { query, answer, results: uniqueSources(cited) } };
}

async function searchGemini(query, { provider, own }, request, fetchImpl) {
  const model = String(provider.model).replace(/^models\//, '');
  const result = await postJson(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': provider.apiKey }, {
    contents: [{ role: 'user', parts: [{ text: searchPrompt(query) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: ANSWER_MAX_TOKENS },
  }, request, fetchImpl, { provider, own, ms: ANSWER_TIMEOUT_MS });
  if (result.error) return result;
  const candidate = result.body.candidates?.[0] || {};
  const answer = answerText((candidate.content?.parts || []).map((part) => part?.text || '').join(''));
  const meta = candidate.groundingMetadata || {};
  const chunks = (Array.isArray(meta.groundingChunks) ? meta.groundingChunks : []).map((chunk) => ({ url: chunk?.web?.uri, title: chunk?.web?.title }));
  const searched = (meta.webSearchQueries?.length || 0) > 0 || chunks.length > 0;
  return { billed: searched, tokens: tokensOf(result.body.usageMetadata), body: { query, answer, results: uniqueSources(chunks) } };
}

async function searchOpenRouter(query, { provider, own }, request, fetchImpl) {
  const result = await postJson('https://openrouter.ai/api/v1/chat/completions', {
    authorization: `Bearer ${provider.apiKey}`,
    'http-referer': 'https://appblips.com',
    'x-title': 'AppBlips',
  }, {
    model: provider.model,
    messages: [{ role: 'user', content: searchPrompt(query) }],
    plugins: [{ id: 'web', max_results: SEARCH_RESULTS }],
    max_tokens: ANSWER_MAX_TOKENS,
  }, request, fetchImpl, { provider, own, ms: ANSWER_TIMEOUT_MS });
  if (result.error) return result;
  const message = result.body.choices?.[0]?.message || {};
  const cited = (Array.isArray(message.annotations) ? message.annotations : [])
    .filter((note) => note?.type === 'url_citation')
    .map((note) => ({ url: note.url_citation?.url, title: note.url_citation?.title, content: note.url_citation?.content }));
  return { billed: true, tokens: tokensOf(result.body.usage), body: { query, answer: answerText(message.content), results: uniqueSources(cited) } };
}

async function searchAnthropic(query, { provider, own }, request, fetchImpl) {
  const client = new Anthropic({
    apiKey: provider.apiKey,
    authToken: null,
    baseURL: provider.baseUrl,
    maxRetries: 0,
    fetch: fetchImpl,
    dangerouslyAllowBrowser: true,
  });
  let message;
  try {
    message = await client.messages.create({
      model: provider.model,
      max_tokens: ANSWER_MAX_TOKENS,
      messages: [{ role: 'user', content: searchPrompt(query) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }, { signal: callSignal(request, ANSWER_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status) return providerError(err.status, provider, own);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError' || err instanceof Anthropic.APIConnectionTimeoutError;
    return { status: timedOut ? 504 : 502, error: timedOut ? 'The web search took too long.' : UNAVAILABLE };
  }
  const content = Array.isArray(message.content) ? message.content : [];
  const answer = answerText(content.filter((block) => block.type === 'text').map((block) => block.text).join(''));
  const found = content
    .filter((block) => block.type === 'web_search_tool_result' && Array.isArray(block.content))
    .flatMap((block) => block.content)
    .map((item) => ({ url: item?.url, title: item?.title, date: item?.page_age }));
  const searches = Number(message.usage?.server_tool_use?.web_search_requests) || 0;
  return { billed: searches > 0, tokens: tokensOf(message.usage), body: { query, answer, results: uniqueSources(found) } };
}

const SEARCH = {
  deepseek: searchDeepSeek,
  anthropic: searchAnthropic,
  openai: searchResponses,
  xai: searchResponses,
  gemini: searchGemini,
  openrouter: searchOpenRouter,
};

async function fetchDeepSeekPage(url, { provider, own }, request, fetchImpl) {
  const result = await postJson(`${DEEPSEEK_TOOLS}/fetch`, { authorization: `Bearer ${provider.apiKey}` }, { url }, request, fetchImpl, { provider, own, kind: 'fetch' });
  if (result.error) return result;
  const page = pageText(result.body.content);
  // DeepSeek bills a fetch only when it returns page content.
  return { billed: Boolean(page.content), tokens: 0, body: { url, title: oneLine(result.body.title, 200), ...page } };
}

// Checked before anything is counted or sent, so a bad request costs nothing.
const validate = (kind, payload) => (kind === 'search'
  ? (oneLine(payload.query, MAX_QUERY) ? '' : 'The search needs some words to look for.')
  : (webUrl(typeof payload.url === 'string' ? payload.url.trim() : '') ? '' : 'web_fetch needs a full http:// or https:// address, without a username or password.'));

const KINDS = { '/api/web/status': 'status', '/api/web/search': 'search', '/api/web/fetch': 'fetch' };

// `request` has been through withSavedProvider. `freeLimits` (freeLimits.js)
// limits calls paid by the environment provider per `visitor`; server.js
// passes both.
export async function handleWebToolsApi(request, env, { fetch: fetchImpl = globalThis.fetch, freeLimits = null, visitor = '' } = {}) {
  const kind = KINDS[new URL(request.url).pathname.replace(/\/+$/, '')];
  if (!kind) return json(404, { error: 'Not found.' });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  // Only AppBlips' own page may spend the key. A JSON body also forces a
  // CORS preflight, which other sites can't pass.
  if (isForeignOrigin(request, env)) return json(403, { error: 'Requests from other sites are not allowed.' });
  if (!(request.headers.get('content-type') || '').includes('application/json')) return json(415, { error: 'Send JSON.' });
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { error: 'Invalid JSON body.' });

  const paying = await webSearchProvider(env, payload, { fetchImpl, lookupModel: kind !== 'status' });
  const { provider, own } = paying;
  if (kind === 'status') {
    return json(200, provider
      ? { available: true, paidBy: own ? 'own' : 'free', provider: provider.id, fetch: provider.id === 'deepseek', searches: SEARCHES[provider.id] ?? DEFAULT_SEARCHES }
      : { available: false, paidBy: '', provider: '', fetch: false, searches: 0 });
  }
  if (!provider) return json(409, { error: NOT_OFFERED, stop: true });
  if (kind === 'fetch' && provider.id !== 'deepseek') return json(409, { error: 'Reading pages isn’t available with this AI provider.', stop: true });

  const invalid = validate(kind, payload);
  if (invalid) return json(400, { error: invalid });

  // The Free option: counted per visitor like an AI request.
  let ticket = null;
  if (freeLimits && !own) {
    const started = freeLimits.begin(visitor);
    if (started.refused) {
      const { error, retryAfter } = started.refused;
      return json(429, { error, source: 'free-limit', stop: true }, retryAfter ? { 'retry-after': String(retryAfter) } : {});
    }
    ticket = started;
  }

  let outcome;
  try {
    outcome = kind === 'search'
      ? await SEARCH[provider.id](oneLine(payload.query, MAX_QUERY), paying, request, fetchImpl)
      : await fetchDeepSeekPage(webUrl(payload.url.trim()), paying, request, fetchImpl);
  } catch (err) {
    console.error(`[web] ${provider.id} ${kind} failed:`, err?.message || err);
    outcome = { status: 502, error: UNAVAILABLE };
  }
  const fee = outcome.billed ? (SEARCH_FEE_TOKENS[provider.id] ?? DEFAULT_SEARCH_FEE_TOKENS) : 0;
  ticket?.end((outcome.tokens || 0) + fee);
  if (outcome.error) return json(outcome.status, { error: outcome.error, ...(outcome.stop ? { stop: true } : {}) });
  return json(200, outcome.body);
}

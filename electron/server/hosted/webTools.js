// Plan web search: POST /api/web/search and /api/web/fetch, hosted only.
// When a plan user switches on "Search the web" for a prompt, the AI's
// web_search and web_fetch tools (src/lib/webSearch.js) call these, and they
// call DeepSeek's Search and Fetch APIs with the server's DeepSeek key.
//
// Each call that DeepSeek bills is charged to the user's usage window
// (plans.js WEB_CALL_USES, buildWindow.js CHARGE_USES_SQL). The use is taken
// before the call, so two calls at once can't both slip past the limit, and
// given back when DeepSeek doesn't bill it: an error, a timeout, a search
// with no results or a page with no content.
//
// Written with Fetch primitives only (Request in, Response out) like
// chatProxy.js, so the Worker, server.js and the Vite dev server share it.

import { isForeignOrigin } from '../chatProxy.js';
import { resolveProvider } from '../providers.js';
import { authenticatePlan, waitUntil } from './chat.js';
import { REQUESTS_PER_USE } from './buildWindow.js';
import { WEB_CALL_USES } from './plans.js';

// Fixed, never taken from the environment: the server's provider key goes
// only to DeepSeek's own host.
const DEEPSEEK_TOOLS = 'https://api.deepseek.com/v1/tools';
const DEEPSEEK_HOST = 'api.deepseek.com';
const TIMEOUT_MS = 20_000;
const MAX_QUERY = 128; // DeepSeek's own limit
const MAX_URL = 8192; // DeepSeek's own limit
const SEARCH_RESULTS = 5;
const MAX_SUMMARY = 800;
const MAX_PAGE_CHARS = 12_000;

const UNAVAILABLE = 'Web search is unavailable right now. Try again later.';
const BUSY = 'Web search is busy right now. Try again in a moment.';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

// The DeepSeek key, when the server's provider is DeepSeek itself (its key is
// what pays for Search and Fetch). '' otherwise.
const deepseekKey = (env) => {
  const provider = resolveProvider(env, 'APPBLIPS_LLM', { quiet: true });
  if (provider.error || provider.id !== 'deepseek' || !provider.apiKey) return '';
  try {
    if (new URL(provider.baseUrl).hostname !== DEEPSEEK_HOST) return '';
  } catch {
    return '';
  }
  return provider.apiKey;
};

// Whether this server can offer plan web search (billing.js /me tells the app).
export const webSearchAvailable = (env) => Boolean(deepseekKey(env));

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

const cleanResult = (result) => {
  const url = webUrl(result?.url);
  if (!url) return null;
  const site = oneLine(result.site_name, 100);
  const date = oneLine(result.date, 40);
  return {
    title: oneLine(result.title, 200),
    url,
    summary: oneLine(result.summary || result.snippet, MAX_SUMMARY),
    ...(site ? { site_name: site } : {}),
    ...(date ? { date } : {}),
  };
};

// Page Markdown for the model: kept multi-line, blank-line runs squeezed.
const pageText = (value) => {
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  return text.length > MAX_PAGE_CHARS ? { content: `${text.slice(0, MAX_PAGE_CHARS)}…`, truncated: true } : { content: text };
};

const callSignal = (request) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return request.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([request.signal, timeout]) : timeout;
};

// One DeepSeek call: -> { body } or { status, error }. Never throws.
async function callDeepSeek(kind, key, body, request, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${DEEPSEEK_TOOLS}/${kind}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: callSignal(request),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { status: timedOut ? 504 : 502, error: timedOut ? 'The web search took too long. Try again.' : UNAVAILABLE };
  }
  if (!response.ok) {
    response.body?.cancel().catch(() => {});
    if (response.status === 429) return { status: 503, error: BUSY };
    // Fetch: blocked by DeepSeek's policy, or no usable content at that address.
    if (kind === 'fetch' && (response.status === 403 || response.status === 404)) {
      return { status: 422, error: 'That page couldn’t be read. Try a different result.' };
    }
    if (response.status === 400) {
      return { status: 400, error: kind === 'fetch' ? 'That address can’t be read.' : 'The search couldn’t run with that query. Try different words.' };
    }
    // 401/402 (the server's key or balance) and 5xx: nothing the user can fix.
    if (response.status === 401 || response.status === 402) console.error(`[web] DeepSeek ${kind} refused the server's key (${response.status}).`);
    return { status: 503, error: UNAVAILABLE };
  }
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === 'object') return { body: parsed };
  } catch { /* fall through */ }
  return { status: 502, error: UNAVAILABLE };
}

// Search: -> { results } with at least one result (billed), or an error.
async function runSearch(payload, key, request, fetchImpl) {
  const query = oneLine(payload?.query, MAX_QUERY);
  if (!query) return { status: 400, error: 'The search needs some words to look for.' };
  const result = await callDeepSeek('search', key, { query, count: SEARCH_RESULTS, need_content: false }, request, fetchImpl);
  if (result.error) return result;
  const raw = Array.isArray(result.body.results) ? result.body.results : [];
  // DeepSeek bills a search only when its results array isn't empty.
  return { billed: raw.length > 0, body: { query, results: raw.map(cleanResult).filter(Boolean).slice(0, SEARCH_RESULTS) } };
}

// Fetch: -> { title, url, content } (billed when there's content), or an error.
async function runFetch(payload, key, request, fetchImpl) {
  const url = webUrl(typeof payload?.url === 'string' ? payload.url.trim() : '');
  if (!url) return { status: 400, error: 'web_fetch needs a full http:// or https:// address, without a username or password.' };
  const result = await callDeepSeek('fetch', key, { url }, request, fetchImpl);
  if (result.error) return result;
  const page = pageText(result.body.content);
  return { billed: Boolean(page.content), body: { url, title: oneLine(result.body.title, 200), ...page } };
}

// Checks what can be checked for free before taking a use, so a bad request
// never costs anything.
const validate = (kind, payload) => (kind === 'search'
  ? (oneLine(payload?.query, MAX_QUERY) ? '' : 'The search needs some words to look for.')
  : (webUrl(typeof payload?.url === 'string' ? payload.url.trim() : '') ? '' : 'web_fetch needs a full http:// or https:// address, without a username or password.'));

export async function handleWebTools(request, env, store, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const { pathname } = new URL(request.url);
  const kind = pathname === '/api/web/search' ? 'search' : pathname === '/api/web/fetch' ? 'fetch' : '';
  if (!kind) return json(404, { error: 'Not found.' });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (isForeignOrigin(request, env)) return json(403, { error: 'Requests from other sites are not allowed.' });

  const checked = await authenticatePlan(request, env, store);
  if (checked.response) return checked.response;
  const { userId, plan } = checked;

  const key = deepseekKey(env);
  if (!key || !plan.windowBuilds || !plan.windowHours) return json(503, { error: UNAVAILABLE, code: 'web_search_unavailable' });

  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json(415, { error: 'Send JSON.' });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { error: 'Invalid JSON body.' });
  const invalid = validate(kind, payload);
  if (invalid) return json(400, { error: invalid });

  const windowMs = plan.windowHours * 60 * 60 * 1000;
  const charge = await store.chargeUses(userId, {
    uses: WEB_CALL_USES,
    limit: plan.windowBuilds,
    requestLimit: plan.windowBuilds * REQUESTS_PER_USE,
    windowMs,
  });
  if (!charge.allowed) {
    const { minutes, wait } = waitUntil(charge.resetAt);
    return json(429, {
      error: `No uses left for web search in this ${plan.windowHours}-hour window. You can search again in ${wait}.`,
      code: 'web_search_limit',
      resetAt: new Date(charge.resetAt).toISOString(),
    }, { 'retry-after': String(minutes * 60) });
  }

  let outcome;
  try {
    outcome = kind === 'search'
      ? await runSearch(payload, key, request, fetchImpl)
      : await runFetch(payload, key, request, fetchImpl);
  } catch {
    outcome = { status: 502, error: UNAVAILABLE };
  }

  // Not billed by DeepSeek: not charged either.
  if (!outcome.billed) {
    await Promise.resolve(store.refundUses(userId, { uses: WEB_CALL_USES, start: charge.start })).catch(() => {});
  }
  if (outcome.error) return json(outcome.status, { error: outcome.error });
  return json(200, { ...outcome.body, charged: outcome.billed ? WEB_CALL_USES : 0 });
}

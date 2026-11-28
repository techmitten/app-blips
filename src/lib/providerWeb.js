// Web search through the AI provider in use, page side of /api/web
// (electron/server/webToolsApi.js). While the AI runs on a provider's own API
// (the user's key in Settings → AI), the build agent can get web_search (and web_fetch on DeepSeek), answered with that
// provider's own search and paid for by the same key (webSearch.js
// startWebSearch). The same fetch works in every host: the desktop app
// answers it in-process, server.js and the Vite dev server over HTTP,
// android.js inside the page. The key never reaches the page.
//
// Whether it is offered depends on the provider in use, which only the server
// knows for sure. The app asks when it starts and whenever the provider
// changes (hooks/useProviderWeb.js); the answer, with that provider's
// tool in Settings → Tools (connectors.js providerSearchEnabled),
// decides whether the globe under the chat box is shown, and is kept here for startWebSearch, so a
// build makes no extra request. The user switches it on with the globe
// (config.js loadWebSearch, off by default). If the answer is ever out of
// date, the server still refuses a search the provider in use doesn't allow,
// and the AI carries on without searching.
import { isDesktop, webProviderStore } from './desktop.js';
import { loadWebSearch } from './config.js';
import { providerSearchEnabled } from './connectors.js';
import { messageHeaders } from './messageId.js';
import { recordUsage } from './tokenUsage.js';

// The browser version names the provider in use (without its key), as it does
// for /api/chat; the desktop app's main process knows it already.
const withProvider = (body) => {
  const provider = isDesktop ? null : webProviderStore.forRequest();
  return provider ? { ...body, user_provider: provider } : body;
};

async function call(path, body, { signal = null } = {}) {
  let response;
  const sent = withProvider(body);
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...messageHeaders() },
      body: JSON.stringify(sent),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    return { error: 'Couldn’t reach AppBlips’ web search. Try again.' };
  }
  try {
    const answer = await response.json();
    // A search runs the model with its search on: its tokens count toward
    // the chat's total. The counts stay out of what the build model is sent.
    if (answer && typeof answer === 'object' && answer.usage) {
      recordUsage(answer.usage);
      delete answer.usage;
    }
    return answer;
  } catch {
    return { error: `Web search failed (error ${response.status}).` };
  }
}

const NONE = { available: false, provider: '', fetch: false, searches: 0 };
let status = NONE;

const listeners = new Set();
export const subscribeProviderWeb = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Asks the server whether web search is offered for the provider in use
// right now. Never throws; any failure means "not offered". When two are
// in flight, the later one wins.
let asked = 0;
export async function refreshProviderWeb() {
  const mine = ++asked;
  let next = NONE;
  try {
    const answer = await call('/api/web/status', {});
    if (answer?.available === true) {
      next = {
        available: true,
        provider: typeof answer.provider === 'string' ? answer.provider : '',
        fetch: answer.fetch === true,
        searches: Number.isInteger(answer.searches) && answer.searches > 0 ? Math.min(answer.searches, 10) : 3,
      };
    }
  } catch { /* not offered */ }
  if (mine === asked && JSON.stringify(next) !== JSON.stringify(status)) {
    status = next;
    for (const listener of listeners) listener();
  }
  return status;
}

// The last answer, { available, provider, fetch, searches }; a stable
// object between answers, for useSyncExternalStore.
export const providerWebAvailability = () => status;

// What startWebSearch uses: offered by the server, its extension on in
// Settings → Tools, and switched on with the globe.
export const providerWebStatus = () => ({ ...status, enabled: loadWebSearch() && providerSearchEnabled(status.provider) });

// -> { query, answer?, results: [{ title, url, content, published_date? }] } | { error, stop? }
export const searchProviderWeb = ({ query }, options) => call('/api/web/search', { query }, options);
// DeepSeek only. -> { url, title, content, truncated? } | { error, stop? }
export const fetchProviderWeb = ({ url }, options) => call('/api/web/fetch', { url }, options);

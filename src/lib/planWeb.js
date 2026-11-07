// Plan web search, page side of /api/web (electron/server/hosted/webTools.js).
// A signed-in plan user can switch on "Search the web" for one prompt; the AI
// then gets web_search and web_fetch (webSearch.js startWebSearch), and each
// call comes here. The server runs DeepSeek's Search and Fetch with its own
// key and charges each billed call to the plan's usage window.
//
// Also holds whether the button is offered at all: /api/billing/me says so
// (`webSearch`, set only for an active plan on a server that can search), and
// billing.js fetchBillingMe passes every answer it gets on to here.
import { getAuthToken } from './authToken.js';

let available = null; // { uses, searches, fetches } or null
const listeners = new Set();

export const getPlanWebSearch = () => available;

export function setPlanWebSearch(info) {
  const next = info && typeof info === 'object'
    ? {
      uses: Number(info.uses) || 1,
      searches: Math.max(0, Number(info.searches) || 0),
      fetches: Math.max(0, Number(info.fetches) || 0),
    }
    : null;
  if (JSON.stringify(next) === JSON.stringify(available)) return;
  available = next;
  listeners.forEach((listener) => listener());
}

export const subscribePlanWebSearch = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

async function call(path, body, signal) {
  const token = await getAuthToken();
  if (!token) return { error: 'Sign in again to search the web.', stop: true };
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: signal || undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { error: 'Couldn’t reach AppBlips’ web search. Check your internet connection.' };
  }
  let data = null;
  try {
    data = await response.json();
  } catch { /* handled below */ }
  if (response.ok && data && typeof data === 'object') return data;
  const error = (data && typeof data.error === 'string' && data.error) || `Web search failed (error ${response.status}).`;
  // Out of uses, signed out or no plan: no later call in this prompt can work.
  const stop = data?.code === 'web_search_limit' || data?.code === 'web_search_unavailable' || [401, 402].includes(response.status);
  return { error, ...(stop ? { stop: true } : {}) };
}

// -> { results: [{ title, url, content, published_date? }], charged } | { error, stop? }
// Results come back in the Tavily connector's shape so the same tool
// executor and research formatting serve both.
export async function searchPlan({ query }, { signal } = {}) {
  const data = await call('/api/web/search', { query }, signal);
  if (data.error) return data;
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    charged: Number(data.charged) || 0,
    results: results.map((r) => ({
      title: r.title || '',
      url: r.url,
      content: r.summary || '',
      ...(r.site_name ? { site_name: r.site_name } : {}),
      ...(r.date ? { published_date: r.date } : {}),
    })),
  };
}

// -> { url, title, content, truncated?, charged } | { error, stop? }
export async function fetchPlan({ url }, { signal } = {}) {
  const data = await call('/api/web/fetch', { url }, signal);
  if (data.error) return data;
  return {
    charged: Number(data.charged) || 0,
    url: data.url || url,
    title: data.title || '',
    content: typeof data.content === 'string' ? data.content : '',
    ...(data.truncated ? { truncated: true } : {}),
  };
}

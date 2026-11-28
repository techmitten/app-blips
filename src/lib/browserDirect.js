// The browser version's own-key requests, answered inside the page so the
// user's keys go straight from this browser to the service they belong to and
// never reach AppBlips' server. Loaded on first use by browserKeys.js, so the
// desktop app and Android never fetch this chunk.
//
// The handlers are the same Fetch-only ones server.js, electron/main.js and
// android.js use (one implementation, no drift); here they run with the page's
// own fetch. Every AI provider preset, Tavily and Pixabay answer CORS for any
// origin. What still goes to AppBlips' server: Surge and Pollinations, whose
// APIs don't allow browser requests, and chat or web search requests without
// a provider (the server says to choose one).
//
// Keys stay where browserKeys.js has always kept them (localStorage, the same
// encoding the server used), so keys saved by earlier versions keep working.

import { handleChatProxy } from '../../electron/server/chatProxy.js';
import { handleProviderApi } from '../../electron/server/providerApi.js';
import { handleWebToolsApi } from '../../electron/server/webToolsApi.js';
import { handleTavilyApi } from '../../electron/server/tavilyApi.js';
import { handlePixabayApi } from '../../electron/server/pixabayApi.js';
import { withSavedProvider } from '../../electron/server/savedProvider.js';
import { logError } from './errorLog.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// { id, key } <-> the base64 JSON browserKeys.js stores (electron/server/browserKeys.js encodeKeyState).
const decode = (value) => {
  if (!value) return { id: '', key: '' };
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0))));
    if (typeof parsed?.id === 'string' && typeof parsed.key === 'string') return { id: parsed.id, key: parsed.key };
  } catch { /* unreadable: treated as nothing saved */ }
  return { id: '', key: '' };
};
const encode = (state) => {
  const bytes = new TextEncoder().encode(JSON.stringify({ id: state.id, key: state.key }));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

// browserKeys.js's store interface (keyFor/describe sync, save/clear async)
// over one localStorage slot. One object per slot for the page's lifetime, so
// per-store state in the handlers (Pixabay's search cache) survives.
const createLocalStore = (read, write) => ({
  keyFor: (id) => {
    const state = decode(read());
    return id && id === state.id ? state.key : '';
  },
  describe: () => {
    const state = decode(read());
    return { id: state.id, hasKey: Boolean(state.key) };
  },
  async save(id, key) { write(encode({ id, key })); },
  async clear() { write(null); },
});

// True when a JSON body names the user's own provider (`user_provider`).
const usesOwnProvider = (text) => {
  try {
    const body = JSON.parse(text);
    return body != null && typeof body === 'object' && body.user_provider != null;
  } catch {
    return false;
  }
};

// Pixabay's handler follows redirects by hand so a server never fetches
// anything off pixabay.com. A browser can't read manual redirects, and has no
// such risk, so it follows them itself.
const pageFetch = (fetchImpl) => (input, init = {}) => fetchImpl(input, init.redirect === 'manual' ? { ...init, redirect: 'follow' } : init);

// -> handle(slot, request) returning a Response, or null when the request
// should go to AppBlips' server as before (Surge, Pollinations…).
// `read(slot)` / `write(slot, value)` are browserKeys.js's storage.
export function createDirectApi({ fetchImpl, read, write }) {
  const stores = new Map();
  const storeFor = (slot) => {
    if (!stores.has(slot)) stores.set(slot, createLocalStore(() => read(slot), (value) => write(slot, value)));
    return stores.get(slot);
  };
  const direct = pageFetch(fetchImpl);

  return async function handle(slot, request) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    if (slot === 'tavily') return handleTavilyApi(request, {}, storeFor(slot), { fetch: direct });
    if (slot === 'pixabay') return handlePixabayApi(request, {}, storeFor(slot), { fetch: direct });
    if (slot !== 'provider') return null;

    const keys = storeFor('provider');
    if (path === '/api/provider' || path.startsWith('/api/provider/')) return handleProviderApi(request, {}, keys);

    // Chat and web search: only the user's own provider runs here.
    if (request.method !== 'POST') return null;
    const text = await request.clone().text();
    if (!usesOwnProvider(text)) return null;
    if (path === '/api/chat') return handleChatProxy(await withSavedProvider(request, keys), {});
    if (path.startsWith('/api/web')) return handleWebToolsApi(await withSavedProvider(request, keys), {}, { fetch: direct });
    return null;
  };
}

// Runs handle() like a real fetch: a Stop aborts a pending read, and
// cancelling the body stops the provider generating (and billing) the rest.
export async function respond(handle, slot, request) {
  if (request.signal.aborted) throw request.signal.reason;
  let response;
  try {
    response = await handle(slot, request);
  } catch (err) {
    logError(`[browser] ${new URL(request.url).pathname} failed`, err);
    return json({ error: 'Internal error.' }, 500);
  }
  if (!response || !response.body) return response;
  const { readable, writable } = new TransformStream();
  response.body.pipeTo(writable, { signal: request.signal }).catch(() => {});
  return new Response(readable, { status: response.status, statusText: response.statusText, headers: response.headers });
}

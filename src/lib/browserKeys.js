// The browser version's saved keys (server.js, Docker,
// `npm run dev`): the AI provider key, the Surge sign-in, and the
// Pollinations, Pixabay and Tavily keys are kept in this browser's
// localStorage, never on the server, so a server shared by many people never
// hands one person's key to another. The AI provider, Tavily and Pixabay keys
// never leave the browser at all: those requests are answered inside the page
// (browserDirect.js), straight to the provider. Surge and Pollinations don't
// allow browser requests, so their requests carry the key to the server
// (electron/server/browserKeys.js), which answers with any new or cleared one,
// stored here. The desktop app (OS keychain) and the Android app
// (Keystore) don't use this.
//
// localStorage can be read by scripts on AppBlips' own origin. The apps
// AppBlips builds run in sandboxed frames without that origin, so they can't.

const KEY_HEADER = 'x-appblips-key';
const KEY_SET_HEADER = 'x-appblips-key-set';
const SESSION_HEADER = 'x-appblips-session';
const KEY_CLEARED = 'none';
const STORAGE_PREFIX = 'appblips-key-';
const SESSION_KEY = 'appblips-key-session';

// Which saved key each /api path uses.
const SLOTS = [
  ['/api/chat', 'provider'],
  ['/api/provider', 'provider'],
  // DeepSeek web search is paid by the AI provider's key (webToolsApi.js).
  ['/api/web', 'provider'],
  ['/api/surge', 'surge'],
  ['/api/pollinations', 'pollinations'],
  ['/api/pixabay', 'pixabay'],
  ['/api/tavily', 'tavily'],
];

// Used only where storage is blocked (some private windows): keys then last
// until the page closes.
const memory = new Map();
const read = (name) => {
  try { return localStorage.getItem(name); } catch { return memory.get(name) ?? null; }
};
const write = (name, value) => {
  if (value === null) memory.delete(name);
  else memory.set(name, value);
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch { /* blocked: kept in memory */ }
};

const slotFor = (url) => {
  if (url.origin !== window.location.origin) return null;
  const match = SLOTS.find(([path]) => url.pathname === path || url.pathname.startsWith(`${path}/`));
  return match ? match[1] : null;
};

// One random id per browser, so the server can keep a sign-in that is still
// in progress (Pollinations) apart from everyone else's.
const sessionId = () => {
  let id = read(SESSION_KEY);
  if (!id) {
    // getRandomValues, unlike randomUUID, also works on plain http (a LAN address).
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    write(SESSION_KEY, id);
  }
  return id;
};

// Slots whose keys never leave this browser: their requests are answered
// inside the page (browserDirect.js), straight to the provider. Chat and web
// search requests without a provider of the user's own still go to the
// server (which says to choose one), without any key.
const DIRECT_SLOTS = new Set(['provider', 'tavily', 'pixabay']);
let directApi = null;

// Tiny local decoder for GET /api/provider so startup never has to load
// browserDirect.js (and @anthropic-ai/sdk) just to read { id, hasKey }.
const describeStoredKey = (slot) => {
  const value = read(STORAGE_PREFIX + slot);
  if (!value) return { id: '', hasKey: false };
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0))));
    if (typeof parsed?.id === 'string' && typeof parsed?.key === 'string') {
      return { id: parsed.id, hasKey: Boolean(parsed.key) };
    }
  } catch { /* unreadable: treated as nothing saved */ }
  return { id: '', hasKey: false };
};

export function installBrowserKeyStorage() {
  const originalFetch = window.fetch.bind(window);
  const loadDirectApi = () => {
    directApi ??= import('./browserDirect.js').then((m) => ({
      respond: m.respond,
      handle: m.createDirectApi({
        fetchImpl: originalFetch,
        read: (slot) => read(STORAGE_PREFIX + slot),
        write: (slot, value) => write(STORAGE_PREFIX + slot, value),
      }),
    }));
    return directApi;
  };

  window.fetch = async (input, init) => {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), window.location.href); }
    catch { return originalFetch(input, init); }
    const slot = slotFor(url);
    if (!slot) return originalFetch(input, init);

    if (DIRECT_SLOTS.has(slot)) {
      const request = new Request(input instanceof Request ? input : url, init);
      const path = url.pathname.replace(/\/+$/, '');
      if (slot === 'provider' && path === '/api/provider' && request.method === 'GET') {
        return new Response(JSON.stringify(describeStoredKey('provider')), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      if (slot === 'provider' && (path === '/api/chat' || path.startsWith('/api/web'))) {
        const isOwn = request.method === 'POST' && await request.clone().text().then((text) => {
          try {
            const body = JSON.parse(text);
            return body != null && typeof body === 'object' && body.user_provider != null;
          } catch { return false; }
        }).catch(() => false);
        if (!isOwn) {
          const headers = new Headers(request.headers);
          headers.delete(KEY_HEADER);
          headers.set(SESSION_HEADER, sessionId());
          return originalFetch(new Request(request, { headers }));
        }
      }
      const { respond, handle } = await loadDirectApi();
      const response = await respond(handle, slot, request);
      if (response) return response;
      // No provider of the user's own: the server answers, with no key.
      const headers = new Headers(request.headers);
      headers.delete(KEY_HEADER);
      headers.set(SESSION_HEADER, sessionId());
      return originalFetch(new Request(request, { headers }));
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SESSION_HEADER, sessionId());
    const saved = read(STORAGE_PREFIX + slot);
    if (saved) headers.set(KEY_HEADER, saved);
    else headers.delete(KEY_HEADER);

    const response = await originalFetch(input, { ...init, headers });
    const update = response.headers.get(KEY_SET_HEADER);
    if (update) write(STORAGE_PREFIX + slot, update === KEY_CLEARED ? null : update);
    return response;
  };
}

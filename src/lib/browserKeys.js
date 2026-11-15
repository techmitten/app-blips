// The browser version's saved keys (server.js, Docker, a Hugging Face Space,
// `npm run dev`): the AI provider key, the Surge sign-in, and the
// Pollinations, Pixabay and Tavily keys are kept in this browser's
// localStorage, never on the server, so a server shared by many people never
// hands one person's key to another. Each /api request carries its key; the
// server (electron/server/browserKeys.js) answers with any new or cleared one,
// which is stored here. The desktop app (OS keychain) and the Android app
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

export function installBrowserKeyStorage() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), window.location.href); }
    catch { return originalFetch(input, init); }
    const slot = slotFor(url);
    if (!slot) return originalFetch(input, init);

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

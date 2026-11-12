// Saved keys for the browser version (server.js and the Vite dev server):
// the AI provider key, the Surge sign-in, the Pollinations key, the Pixabay
// and Tavily keys. They live in each visitor's own browser (localStorage,
// src/lib/browserKeys.js), not on the server, so one server can serve many
// people, like a public Hugging Face Space, without anyone's key reaching
// anyone else. The desktop app keeps its keys in the OS keychain instead and
// the Android app in its Keystore; neither uses this.
//
// Each request carries its slot's saved value in KEY_HEADER. The handlers
// (providerApi.js, surgeApi.js, …) see the same { keyFor, describe, save,
// clear } store they get everywhere else; anything they save or clear comes
// back in KEY_SET_HEADER for the page to store, and nothing is written here.
//
// Pollinations' pending sign-in and Pixabay's search cache are kept per
// store object, so each browser gets a stable one, found by the random id
// the page sends in SESSION_HEADER. A request without one gets a fresh store.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
export const KEY_HEADER = 'x-appblips-key';
export const KEY_SET_HEADER = 'x-appblips-key-set';
export const SESSION_HEADER = 'x-appblips-session';
// KEY_SET_HEADER's value when the key was cleared. Not an empty header,
// which some proxies drop.
export const KEY_CLEARED = 'none';

const MAX_VALUE_LENGTH = 8192;
const SESSION_ID = /^[A-Za-z0-9-]{16,64}$/;

// { id, key } from a header value (base64 of the JSON), or an empty state.
export const decodeKeyState = (value) => {
  if (typeof value !== 'string' || !value || value.length > MAX_VALUE_LENGTH) return { id: '', key: '' };
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (typeof parsed?.id === 'string' && typeof parsed.key === 'string') return { id: parsed.id, key: parsed.key };
  } catch { /* not ours: treated as nothing saved */ }
  return { id: '', key: '' };
};
export const encodeKeyState = (state) => Buffer.from(JSON.stringify({ id: state.id, key: state.key }), 'utf8').toString('base64');

const createStore = () => {
  let state = { id: '', key: '' };
  return {
    load(next) { state = next; },
    current: () => state,
    keyFor: (id) => (id && id === state.id ? state.key : ''),
    describe: () => ({ id: state.id, hasKey: Boolean(state.key) }),
    async save(id, key) { state = { id, key }; },
    async clear() { state = { id: '', key: '' }; },
  };
};

// Returns run(slot, request, handler): calls handler(store) with the store
// for this browser and slot, loaded from the request, and returns its
// Response with KEY_SET_HEADER added when the saved value changed.
export function createBrowserKeys({ maxSessions = 5000 } = {}) {
  const stores = new Map();
  const storeFor = (slot, session) => {
    if (!SESSION_ID.test(session || '')) return createStore();
    const id = `${slot}\n${session}`;
    let store = stores.get(id);
    if (store) stores.delete(id);
    else store = createStore();
    // Most recently used last; the oldest go first past the cap.
    stores.set(id, store);
    while (stores.size > maxSessions) stores.delete(stores.keys().next().value);
    return store;
  };

  return async function run(slot, request, handler) {
    const store = storeFor(slot, request.headers.get(SESSION_HEADER));
    const sent = decodeKeyState(request.headers.get(KEY_HEADER));
    store.load(sent);
    const response = await handler(store);
    const after = store.current();
    if (after.id === sent.id && after.key === sent.key) return response;
    const headers = new Headers(response.headers);
    headers.set(KEY_SET_HEADER, after.key ? encodeKeyState(after) : KEY_CLEARED);
    headers.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

// Files where older versions of the browser version kept these keys on the
// server (in APPBLIPS_DATA_DIR, else ~/.appblips), and the sign-in token of
// the removed AI Credits. Deleted at startup: on a shared server they were
// whoever saved last's, and nothing reads them any more.
const LEGACY_KEY_FILES = ['provider-key.json', 'surge-token.json', 'pollinations-key.json', 'pixabay-key.json', 'tavily-key.json', 'credits-key.json'];
export const removeLegacyKeyFiles = (env = process.env) => Promise.all(LEGACY_KEY_FILES.map(
  (name) => rm(join(env.APPBLIPS_DATA_DIR || join(homedir(), '.appblips'), name), { force: true }).catch(() => {}),
));

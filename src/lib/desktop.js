import { logError, logWarn } from './errorLog.js';
import { USER_PROVIDER_IDS } from '../../electron/server/providers.js';
import { createIdbProjectBackend, indexedDbAvailable } from './idbProjectStore.js';

// Project storage. In the desktop app, electron/preload.cjs exposes
// window.appblipsDesktop and project data lives on disk; in the browser
// version it lives in IndexedDB (idbProjectStore.js), which holds far more
// than localStorage. Where neither is available (tests, a browser without
// IndexedDB) projectsStorage.js and previewStorage.js use localStorage.
//
// The storage helpers callers already use (projectsStorage.js,
// previewStorage.js) are synchronous, so main.jsx awaits initProjectStore()
// once before rendering and reads are served from this in-memory copy. Writes
// update the copy at once and go to the backend in the background, only for
// the rows that actually changed. A failed write is logged and reported to
// onDesktopStorageError listeners (App shows a notice); a row whose write
// failed is sent again with the next write.

const bridge = typeof window !== 'undefined' ? window.appblipsDesktop || null : null;

export const isDesktop = Boolean(bridge);
export const desktopBridge = bridge;

// { list, save(row), delete(id), saveAppData(id, map | null) }.
const desktopBackend = bridge && {
  list: () => bridge.projects.list(),
  save: (row) => bridge.projects.save(row),
  delete: (id) => bridge.projects.delete(id),
  saveAppData: (id, map) => bridge.appData.save(id, map),
};
let backend = desktopBackend || (typeof window !== 'undefined' && indexedDbAvailable() ? createIdbProjectBackend() : null);
// Whether projects are served from the in-memory copy below. Turned off if
// IndexedDB can't be opened, so the browser version falls back to localStorage.
export const usesProjectStore = () => Boolean(backend);

// Saves still on their way, so a reset can wait for them (flushProjectStore).
const pending = new Set();
const track = (promise) => {
  pending.add(promise);
  promise.finally(() => pending.delete(promise)).catch(() => {});
  return promise;
};
export const flushProjectStore = () => Promise.allSettled([...pending]);

// Settings → Reset in the browser version: waits for pending saves, then
// deletes the projects database. (The desktop app keeps its folder.)
export async function clearBrowserProjectStore() {
  await flushProjectStore();
  if (isDesktop || !backend?.clearAll) return;
  try {
    await backend.clearAll();
  } catch (err) {
    logError('Could not delete the projects database during reset', err);
  }
}

// Serialized copies, so reads hand out fresh objects (like JSON.parse of
// localStorage did) and change detection is a string compare.
let rowJson = new Map(); // project id -> JSON of the row
const appDataJson = new Map(); // project id -> JSON of the generated app's storage map

// The latest failure stays until dismissed, so a listener that subscribes
// later (or remounts) still sees it.
const errorListeners = new Set();
let lastError = null;

export const onDesktopStorageError = (listener) => {
  errorListeners.add(listener);
  listener(lastError);
  return () => errorListeners.delete(listener);
};

export const dismissDesktopStorageError = () => {
  lastError = null;
  errorListeners.forEach((listener) => listener(null));
};

// An IPC rejection's message without Electron's "Error invoking remote
// method ..." prefix or a trailing period.
export const ipcErrorMessage = (err) => String(err?.message || err || '')
  .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  .replace(/\.$/, '');

const report = (what) => (err) => {
  logError(`${what} failed`, err);
  reportStorageError(isDesktop
    ? `${what} failed: ${ipcErrorMessage(err)}. Your latest changes may not be saved to disk; check that the projects folder (Settings → Data) is writable.`
    : `${what} failed: ${ipcErrorMessage(err) || 'the browser refused to save it'}. The browser's storage may be full: export your projects from Settings → Data before leaving the page.`);
};

// Shows `message` in the storage notice (DesktopStorageNotice.jsx) until it
// is dismissed. The browser version uses it too, for a full localStorage.
export const reportStorageError = (message) => {
  lastError = message;
  errorListeners.forEach((listener) => listener(lastError));
};

export async function initProjectStore() {
  if (!backend) return;
  try {
    const { projects, orphanAppData } = await backend.list();
    for (const { row, appData } of projects) {
      rowJson.set(row.id, JSON.stringify(row));
      if (appData) appDataJson.set(row.id, JSON.stringify(appData));
    }
    for (const [id, map] of Object.entries(orphanAppData || {})) appDataJson.set(id, JSON.stringify(map));
  } catch (err) {
    if (isDesktop) {
      report('Loading your projects')(err);
      return;
    }
    // IndexedDB refused (some private windows): keep using localStorage.
    logWarn('Could not open IndexedDB for projects, keeping them in localStorage', err);
    backend = null;
  }
}

export const readDesktopRows = () => [...rowJson.values()].map((json) => JSON.parse(json));

// rowJson holds what is on disk; inFlight what is on its way there. A write
// that fails is in neither, so the next writeDesktopRows sends it again.
const inFlight = new Map(); // project id -> JSON being saved

export function writeDesktopRows(rows) {
  const next = new Map();
  for (const row of rows) next.set(row.id, JSON.stringify(row));
  for (const [id, json] of next) {
    if (rowJson.get(id) === json || inFlight.get(id) === json) continue;
    inFlight.set(id, json);
    track(backend.save(JSON.parse(json))).then(
      () => { rowJson.set(id, json); },
      report('Saving a project'),
    ).finally(() => { if (inFlight.get(id) === json) inFlight.delete(id); });
  }
  for (const id of [...rowJson.keys(), ...inFlight.keys()]) {
    if (next.has(id)) continue;
    rowJson.delete(id);
    inFlight.delete(id);
    track(backend.delete(id)).catch(report('Deleting a project'));
  }
}

// A Storage-like view over the generated apps' data for previewStorage.js,
// whose keys are `${prefix}${projectId}`.
export function createAppDataStorage(prefix) {
  const idOf = (key) => (typeof key === 'string' && key.startsWith(prefix) ? key.slice(prefix.length) : null);
  const keys = () => [...appDataJson.keys()].map((id) => prefix + id);
  return {
    get length() { return appDataJson.size; },
    key: (index) => keys()[index] ?? null,
    getItem(key) {
      const id = idOf(key);
      return id === null ? null : appDataJson.get(id) ?? null;
    },
    setItem(key, value) {
      const id = idOf(key);
      if (id === null || appDataJson.get(id) === value) return;
      appDataJson.set(id, value);
      track(backend.saveAppData(id, JSON.parse(value))).catch(report("Saving an app's data"));
    },
    removeItem(key) {
      const id = idOf(key);
      if (id === null || !appDataJson.has(id)) return;
      appDataJson.delete(id);
      track(backend.saveAppData(id, null)).catch(report("Clearing an app's data"));
    },
  };
}

// The browser version's Settings → AI (npm run dev, server.js, Docker). The
// choice of provider and model is kept in this origin's localStorage. The API
// key goes through AppBlips' server (/api/provider, providerApi.js), which
// checks it and hands it back for lib/browserKeys.js to keep in this browser;
// that attaches it to each /api request, so the server never stores it and a
// shared server never mixes up visitors' keys. Code here only learns `hasKey`.
const WEB_PROVIDER_KEY = 'appblips-web-provider';

const readWebProvider = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(WEB_PROVIDER_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    // A provider AppBlips no longer offers (LM Studio, Ollama) counts as not
    // set, so Settings → AI asks for a new one.
    if (saved.id && !USER_PROVIDER_IDS.includes(saved.id)) return saved.onboardingComplete ? { enabled: false, onboardingComplete: true } : {};
    // Only local servers had a URL.
    delete saved.baseUrl;
    delete saved.local;
    return saved;
  } catch (err) {
    // Not the error itself: a JSON SyntaxError's message can quote the saved data.
    if (err?.name === 'SyntaxError') logWarn('Saved AI provider settings are not valid JSON, treating them as not set');
    return {};
  }
};

const writeWebProvider = (info) => {
  // A key is never written here.
  const rest = { ...info };
  delete rest.apiKey;
  delete rest.hasKey;
  localStorage.setItem(WEB_PROVIDER_KEY, JSON.stringify(rest));
};

const providerRequest = async (path, method = 'GET', body = undefined) => {
  const response = await fetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  let data = null;
  try { data = await response.json(); } catch { /* not JSON: reported below */ }
  if (!response.ok) throw new Error(data?.error || `AppBlips' server could not save the AI settings (HTTP ${response.status}).`);
  return data;
};

// Versions before this one kept the key in localStorage. Hand it to the
// server once and remove it from the browser; until that succeeds it stays
// where it was, so a failed move never loses the key.
let legacyKeyMove = null;
const moveLegacyKey = () => {
  if (legacyKeyMove) return legacyKeyMove;
  const saved = readWebProvider();
  if (typeof saved.apiKey !== 'string') return Promise.resolve();
  legacyKeyMove = (saved.apiKey.trim() && saved.id
    ? providerRequest('/api/provider', 'PUT', { id: saved.id, apiKey: saved.apiKey })
    : Promise.resolve()
  ).then(
    () => writeWebProvider(readWebProvider()),
    (err) => {
      legacyKeyMove = null;
      logWarn('Could not move the saved API key to AppBlips\' server, keeping it in the browser for now', err);
    },
  );
  return legacyKeyMove;
};

export const webProviderStore = {
  // The provider for an outgoing /api/chat request, without a key: the server
  // attaches the saved one (withSavedProvider). A draft from "Test connection"
  // goes as given, with its typed key or an empty one meaning "the saved key".
  forRequest(input = null) {
    if (input) return input;
    const { enabled, id, model } = readWebProvider();
    if (!enabled || !id || !model) return null;
    return { id, model };
  },
  async listModels(input) {
    await moveLegacyKey();
    return providerRequest('/api/provider/models', 'POST', input);
  },
  async get() {
    await moveLegacyKey();
    const info = readWebProvider();
    // A legacy key the move couldn't hand over yet.
    delete info.apiKey;
    let server = { id: '', hasKey: false };
    try { server = await providerRequest('/api/provider'); }
    catch (err) { logWarn('Could not ask AppBlips\' server for the saved API key', err); }
    return {
      enabled: false,
      ...info,
      hasKey: Boolean(info.id && server.id === info.id && server.hasKey),
      // The server's environment variables (OPENAI_API_KEY…) provide AI when
      // nothing is saved here, so onboarding doesn't ask for a key.
      envConfigured: server.envConfigured === true,
      ...(server.envProvider ? { envProvider: server.envProvider } : {}),
    };
  },
  async set(info) {
    const previous = readWebProvider();
    // "Skip for now" in onboarding: remember it without saving a provider.
    // With enabled: false (the Free option) the saved provider is also
    // switched off, keeping its key for later.
    if (info.onboardingComplete === true && info.id === undefined) {
      writeWebProvider({ enabled: false, ...previous, ...(info.enabled === false ? { enabled: false } : {}), onboardingComplete: true });
      return this.get();
    }
    await moveLegacyKey();
    // The server checks the settings (with the saved key when none is typed)
    // and keeps the key; only the rest is saved here.
    await providerRequest('/api/provider', 'PUT', info);
    writeWebProvider({
      ...info,
      onboardingComplete: Boolean(previous.onboardingComplete || info.enabled),
    });
    return this.get();
  },
  async clear({ resetOnboarding = false } = {}) {
    // Keep the onboarding flag, as the desktop store does, so clearing a
    // provider doesn't replay setup (unless this is Settings → Reset).
    const previous = readWebProvider();
    await providerRequest('/api/provider', 'DELETE');
    if (previous.onboardingComplete && !resetOnboarding) writeWebProvider({ enabled: false, onboardingComplete: true });
    else localStorage.removeItem(WEB_PROVIDER_KEY);
    return {};
  }
};

const providerStore = bridge?.provider || webProviderStore;

// The Free choice in onboarding and Settings → AI: offered when the host's
// environment variables (OPENAI_API_KEY…) supply AI, so nobody needs a key of
// their own. Choosing it switches the saved provider off (enabled: false),
// which sends requests to that environment provider.
export const FREE_PROVIDER_ID = 'free';
export const FREE_PROVIDER_LABEL = 'Free (no key needed)';
const providerListeners = new Set();
const notifyProviderChange = (result) => {
  for (const listener of providerListeners) listener();
  return result;
};

// Called after the saved provider changes (Settings → AI, onboarding,
// Reset), so things that depend on it, like the reasoning levels, refresh.
export const onProviderChange = (listener) => {
  providerListeners.add(listener);
  return () => providerListeners.delete(listener);
};

export const providerApi = {
  get: () => providerStore.get(),
  set: (info) => providerStore.set(info).then(notifyProviderChange),
  clear: (options) => providerStore.clear(options).then(notifyProviderChange),
  listModels: (input) => providerStore.listModels(input),
};
export const chooseFreeProvider = () => providerApi.set({ enabled: false, onboardingComplete: true });

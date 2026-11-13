// /api/unsplash/*: the built-in photo library. The AI build agent searches
// Unsplash for real photos (src/lib/unsplash.js, the find_photos tool) instead
// of recalling image addresses from memory. The host's own Unsplash app key
// (UNSPLASH_ACCESS_KEY) signs every request, so nobody using AppBlips needs
// an Unsplash account; it stays on the server and is only sent to
// api.unsplash.com. Without it the library is simply unavailable.
//
// Unsplash's API guidelines, which this follows:
//   - photos are shown from Unsplash's own image URLs (`urls.raw` plus size
//     parameters, keeping `ixid`), never copied;
//   - every photo shown is credited to its photographer and Unsplash, with
//     links carrying utm_source=appblips&utm_medium=referral (prompts.js tells
//     the AI how; `credit` here gives it the exact names and links);
//   - when a build starts using a photo, its download is reported
//     (POST /api/unsplash/track -> GET /photos/:id/download).
// A demo key allows 50 API requests an hour, a production key 1,000, shared by
// everyone on this server, so searches are cached for an hour and each
// visitor gets a share (`perVisitor`, server.js).
//
//   POST /api/unsplash/status               -> { available }
//   POST /api/unsplash/search { query, orientation? } -> { query, results: [...] } | { error, stop? }
//   POST /api/unsplash/track  { ids: [...] } -> { tracked }
// Fetch primitives only, like the other handlers.
import { isForeignOrigin } from './chatProxy.js';

const API = 'https://api.unsplash.com';
const UTM = 'utm_source=appblips&utm_medium=referral';
const TIMEOUT_MS = 15_000;
const MAX_QUERY = 100;
const PER_PAGE = 6;
const ORIENTATIONS = new Set(['landscape', 'portrait', 'squarish']);
// Unsplash ids: letters, digits, - and _.
const PHOTO_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const MAX_TRACK = 30;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_SIZE = 500;
const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_SEARCHES_PER_VISITOR_HOUR = 30;

const BUSY = 'The photo library has had too many searches this hour. Try again later.';
const UNAVAILABLE = 'The photo library is unavailable right now.';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

export const unsplashKey = (env) => String(env?.UNSPLASH_ACCESS_KEY ?? '').trim();

const oneLine = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// An https address on one of Unsplash's own hosts, or ''.
const unsplashUrl = (value, hosts) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
};

const withUtm = (url) => `${url.origin}${url.pathname}?${UTM}`;

// One photo as the AI gets it. `url` is the photo at 1600px wide, ready for an
// <img src> or CSS background; only its w= and h= may be changed.
export const toPhoto = (photo) => {
  const raw = unsplashUrl(photo?.urls?.raw, ['images.unsplash.com', 'plus.unsplash.com']);
  const profile = unsplashUrl(photo?.user?.links?.html, ['unsplash.com']);
  if (!raw || !PHOTO_ID_RE.test(String(photo?.id || ''))) return null;
  // Premium (Unsplash+) photos need a licence of their own.
  if (raw.hostname === 'plus.unsplash.com' || photo.premium === true) return null;
  const sep = raw.search ? '&' : '?';
  const photographer = oneLine(photo.user?.name, 80) || 'an Unsplash photographer';
  return {
    id: photo.id,
    url: `${raw.href}${sep}auto=format&fit=crop&w=1600&q=80`,
    width: Number(photo.width) || null,
    height: Number(photo.height) || null,
    color: /^#[0-9a-f]{6}$/i.test(photo.color || '') ? photo.color : null,
    description: oneLine(photo.alt_description || photo.description, 200),
    photographer,
    photographerUrl: profile ? withUtm(profile) : `https://unsplash.com/?${UTM}`,
    unsplashUrl: `https://unsplash.com/?${UTM}`,
  };
};

const callSignal = (request) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return request.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([request.signal, timeout]) : timeout;
};

async function apiGet(key, path, request, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1', accept: 'application/json' },
      signal: callSignal(request),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { status: timedOut ? 504 : 502, error: timedOut ? 'The photo search took too long.' : UNAVAILABLE };
  }
  if (!response.ok) {
    response.body?.cancel().catch(() => {});
    // Unsplash answers 403 "Rate Limit Exceeded" once the hour's requests
    // are used up.
    if (response.status === 403 || response.status === 429) return { status: 503, error: BUSY, stop: true };
    if (response.status === 401) {
      console.error('[unsplash] Unsplash refused UNSPLASH_ACCESS_KEY (401).');
      return { status: 503, error: UNAVAILABLE, stop: true };
    }
    return { status: 502, error: UNAVAILABLE };
  }
  try {
    return { body: await response.json() };
  } catch {
    return { status: 502, error: UNAVAILABLE };
  }
}

// One handler per server: the search cache and the per-visitor counts live in
// it. `perVisitor`: searches each visitor may make an hour (0 = no limit).
export function createUnsplashApi({ fetch: fetchImpl = globalThis.fetch, now = Date.now, perVisitor = DEFAULT_SEARCHES_PER_VISITOR_HOUR } = {}) {
  const cache = new Map();
  const visitors = new Map();

  const cached = (key) => {
    const hit = cache.get(key);
    if (!hit || now() - hit.at > CACHE_MS) return null;
    return hit.results;
  };
  const remember = (key, results) => {
    cache.delete(key);
    cache.set(key, { at: now(), results });
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  };
  const allowVisitor = (visitor) => {
    if (!perVisitor) return true;
    const id = visitor || 'unknown';
    let entry = visitors.get(id);
    if (!entry || now() - entry.start >= HOUR_MS) entry = { start: now(), count: 0 };
    if (entry.count >= perVisitor) return false;
    entry.count += 1;
    visitors.delete(id);
    visitors.set(id, entry);
    while (visitors.size > 10_000) visitors.delete(visitors.keys().next().value);
    return true;
  };

  return async function handleUnsplashApi(request, env, { visitor = '' } = {}) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (!['/api/unsplash/status', '/api/unsplash/search', '/api/unsplash/track'].includes(path)) return json(404, { error: 'Not found.' });
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    // Only AppBlips' own page may spend the shared key.
    if (isForeignOrigin(request, env)) return json(403, { error: 'Requests from other sites are not allowed.' });
    let payload = {};
    try {
      payload = await request.json();
    } catch { /* status needs no body */ }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};

    const key = unsplashKey(env);
    if (path === '/api/unsplash/status') return json(200, { available: Boolean(key) });
    if (!key) return json(409, { error: 'The photo library isn’t set up on this server.', stop: true });

    if (path === '/api/unsplash/track') {
      const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : []).filter((id) => typeof id === 'string' && PHOTO_ID_RE.test(id)))].slice(0, MAX_TRACK);
      const done = await Promise.all(ids.map(async (id) => !(await apiGet(key, `/photos/${encodeURIComponent(id)}/download`, request, fetchImpl)).error));
      return json(200, { tracked: done.filter(Boolean).length });
    }

    const query = oneLine(payload.query, MAX_QUERY);
    if (!query) return json(400, { error: 'The photo search needs some words to look for.' });
    const orientation = ORIENTATIONS.has(payload.orientation) ? payload.orientation : '';
    const cacheKey = `${query.toLowerCase()}\n${orientation}`;
    const hit = cached(cacheKey);
    if (hit) return json(200, { query, results: hit });
    if (!allowVisitor(visitor)) return json(429, { error: 'You’ve made a lot of photo searches this hour. Try again later.', stop: true });

    const params = new URLSearchParams({ query, per_page: String(PER_PAGE), content_filter: 'high', ...(orientation ? { orientation } : {}) });
    const result = await apiGet(key, `/search/photos?${params}`, request, fetchImpl);
    if (result.error) return json(result.status, { error: result.error, ...(result.stop ? { stop: true } : {}) });
    const results = (Array.isArray(result.body?.results) ? result.body.results : []).map(toPhoto).filter(Boolean);
    remember(cacheKey, results);
    return json(200, { query, results });
  };
}

// The desktop and Android apps hold no Unsplash key. Unless one is set in
// their environment, they send photo searches to AppBlips' hosted server
// (web.appblips.com, the browser version, whose server has the key), so the
// key stays in one place and can be changed without a release. Called from
// the app's own process, so the request carries no Origin and passes that
// server's other-site check; that server's cache and per-visitor limits
// apply. APPBLIPS_PHOTO_LIBRARY_URL points elsewhere ('off' turns it off).
export const DEFAULT_PHOTO_LIBRARY_URL = 'https://web.appblips.com';
const FORWARD_TIMEOUT_MS = 20_000;

export const photoLibraryUrl = (env) => {
  const value = String(env?.APPBLIPS_PHOTO_LIBRARY_URL ?? '').trim();
  if (/^off$/i.test(value)) return '';
  try {
    const url = new URL(value || DEFAULT_PHOTO_LIBRARY_URL);
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
};

// Answers /api/unsplash/* in an app: with its own key when the environment
// has one (`local`, a createUnsplashApi handler), otherwise by forwarding to
// the hosted server. Any failure there reads as "no photo library".
export function createAppUnsplashApi({ fetch: fetchImpl = globalThis.fetch } = {}) {
  const local = createUnsplashApi({ fetch: fetchImpl, perVisitor: 0 });
  return async function handleAppUnsplashApi(request, env) {
    if (unsplashKey(env)) return local(request, env);
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (!['/api/unsplash/status', '/api/unsplash/search', '/api/unsplash/track'].includes(path)) return json(404, { error: 'Not found.' });
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    if (isForeignOrigin(request, env)) return json(403, { error: 'Requests from other sites are not allowed.' });
    const base = photoLibraryUrl(env);
    const unavailable = () => (path === '/api/unsplash/status'
      ? json(200, { available: false })
      : json(503, { error: UNAVAILABLE, stop: true }));
    if (!base) return unavailable();
    let body = '{}';
    try { body = (await request.text()) || '{}'; } catch { /* empty body */ }
    const timeout = AbortSignal.timeout(FORWARD_TIMEOUT_MS);
    const signal = request.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([request.signal, timeout]) : timeout;
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        signal,
      });
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return unavailable();
      return json(response.status, parsed);
    } catch {
      return unavailable();
    }
  };
}

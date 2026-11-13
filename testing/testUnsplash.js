// The built-in photo library: the server handler (electron/server/unsplashApi.js)
// against a stubbed Unsplash, and the page side (src/lib/unsplash.js).
// No network. Run: node --test testing/testUnsplash.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppUnsplashApi, createUnsplashApi, photoLibraryUrl, toPhoto } from '../electron/server/unsplashApi.js';
import {
  FIND_PHOTOS_TOOL, executeFindPhotos, formatPhotoPicks, startPhotoSearch, trackUsedPhotos,
} from '../src/lib/unsplash.js';
import { PHOTO_LIBRARY_PROMPT, buildHtmlSystemPrompt } from '../src/lib/prompts.js';

const ORIGIN = 'http://localhost:5175';
const ENV = { UNSPLASH_ACCESS_KEY: 'access-key-123' };
const PHOTO = {
  id: 'IYjXGUpJH74', width: 6000, height: 4000, color: '#c0c0c0', alt_description: 'a bakery filled with lots of baked goods',
  urls: { raw: 'https://images.unsplash.com/photo-1711672284661-bd70e38f31b2?ixid=abc&ixlib=rb-4.1.0' },
  user: { name: 'Elisha Terada', links: { html: 'https://unsplash.com/@elishaterada' } },
};

const request = (path, body = {}, { origin = ORIGIN, method = 'POST' } = {}) => new Request(`${ORIGIN}${path}`, {
  method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const stub = (answer) => {
  const calls = [];
  return { calls, fetch: async (url, init) => { calls.push({ url, auth: init.headers.authorization }); return typeof answer === 'function' ? answer(url) : answer; } };
};
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('a photo keeps its ixid, gets a size, and carries credit links with utm parameters', () => {
  const photo = toPhoto(PHOTO);
  assert.equal(photo.url, 'https://images.unsplash.com/photo-1711672284661-bd70e38f31b2?ixid=abc&ixlib=rb-4.1.0&auto=format&fit=crop&w=1600&q=80');
  assert.equal(photo.photographerUrl, 'https://unsplash.com/@elishaterada?utm_source=appblips&utm_medium=referral');
  assert.equal(photo.unsplashUrl, 'https://unsplash.com/?utm_source=appblips&utm_medium=referral');
  assert.equal(photo.description, 'a bakery filled with lots of baked goods');
  // Premium photos and addresses off Unsplash's hosts are dropped.
  assert.equal(toPhoto({ ...PHOTO, premium: true }), null);
  assert.equal(toPhoto({ ...PHOTO, urls: { raw: 'https://evil.example/x.jpg' } }), null);
  assert.equal(toPhoto({ ...PHOTO, id: '../me' }), null);
});

test('search signs with the server key, caches for an hour, and never shows the key', async () => {
  let clock = 0;
  const unsplash = stub(() => ok({ results: [PHOTO] }));
  const handle = createUnsplashApi({ fetch: unsplash.fetch, now: () => clock });
  const res = await handle(request('/api/unsplash/search', { query: '  bakery   counter ', orientation: 'landscape' }), ENV);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.results.length, 1);
  assert.equal(unsplash.calls[0].auth, 'Client-ID access-key-123');
  assert.match(unsplash.calls[0].url, /^https:\/\/api\.unsplash\.com\/search\/photos\?query=bakery\+counter&per_page=6&content_filter=high&orientation=landscape$/);
  assert.equal(JSON.stringify(body).includes('access-key-123'), false);
  await handle(request('/api/unsplash/search', { query: 'Bakery counter', orientation: 'landscape' }), ENV);
  assert.equal(unsplash.calls.length, 1, 'cached');
  clock += 61 * 60 * 1000;
  await handle(request('/api/unsplash/search', { query: 'bakery counter', orientation: 'landscape' }), ENV);
  assert.equal(unsplash.calls.length, 2, 'cache expired');
});

test('no key, another site, a used-up hour and a per-visitor share are all refused', async () => {
  const unsplash = stub(() => ok({ results: [PHOTO] }));
  const handle = createUnsplashApi({ fetch: unsplash.fetch, perVisitor: 2 });
  assert.deepEqual(await (await handle(request('/api/unsplash/status'), {})).json(), { available: false });
  assert.deepEqual(await (await handle(request('/api/unsplash/status'), ENV)).json(), { available: true });
  assert.equal((await handle(request('/api/unsplash/search', { query: 'x' }), {})).status, 409);
  assert.equal((await handle(request('/api/unsplash/search', { query: 'x' }, { origin: 'https://evil.example' }), ENV)).status, 403);
  assert.equal((await handle(request('/api/unsplash/search', { query: ' ' }), ENV)).status, 400);
  assert.equal((await handle(request('/api/unsplash/search', { query: 'a' }), ENV, { visitor: 'v' })).status, 200);
  assert.equal((await handle(request('/api/unsplash/search', { query: 'b' }), ENV, { visitor: 'v' })).status, 200);
  const third = await handle(request('/api/unsplash/search', { query: 'c' }), ENV, { visitor: 'v' });
  assert.equal(third.status, 429);
  assert.equal((await third.json()).stop, true);
  const limited = createUnsplashApi({ fetch: async () => new Response('Rate Limit Exceeded', { status: 403 }) });
  const busy = await (await limited(request('/api/unsplash/search', { query: 'x' }), ENV)).json();
  assert.equal(busy.stop, true);
  assert.match(busy.error, /this hour/);
});

test('used photos have their downloads reported, by id only', async () => {
  const unsplash = stub(() => ok({ url: 'x' }));
  const handle = createUnsplashApi({ fetch: unsplash.fetch });
  const res = await handle(request('/api/unsplash/track', { ids: ['IYjXGUpJH74', 'IYjXGUpJH74', '../../me', 5] }), ENV);
  assert.deepEqual(await res.json(), { tracked: 1 });
  assert.deepEqual(unsplash.calls.map((c) => c.url), ['https://api.unsplash.com/photos/IYjXGUpJH74/download']);
});

test('find_photos is a strict tool with a budget, and a stop ends the searches', async () => {
  const { parameters, strict } = FIND_PHOTOS_TOOL.function;
  assert.equal(strict, true);
  assert.deepEqual(parameters.required.sort(), Object.keys(parameters.properties).sort());
  assert.equal(startPhotoSearch({ isAvailable: false }), null);
  const photo = toPhoto(PHOTO);
  const searched = [];
  const session = startPhotoSearch({ isAvailable: true, searches: 2, search: async (args) => { searched.push(args); return { results: [photo] }; } });
  const call = (args) => ({ id: 'c', function: { name: 'find_photos', arguments: JSON.stringify(args) } });
  const found = await session.execute(call({ query: 'bakery', orientation: 'landscape' }));
  assert.equal(found.photos[0].url, photo.url);
  assert.deepEqual(searched[0], { query: 'bakery', orientation: 'landscape' });
  await session.execute(call({ query: 'bread', orientation: null }));
  assert.deepEqual(searched[1], { query: 'bread' });
  assert.equal(session.canCall(), false);
  assert.equal((await session.execute(call({ query: 'more', orientation: null }))).success, false);
  const budget = { left: 5 };
  const stopped = await executeFindPhotos(call({ query: 'x', orientation: null }), budget, { search: async () => ({ error: 'busy', stop: true }) });
  assert.equal(stopped.success, false);
  assert.equal(budget.left, 0);
});

test('photos found before a build become a PHOTOS block with their credits', () => {
  const block = formatPhotoPicks([{ query: 'bakery', photos: [toPhoto(PHOTO)] }, { query: 'none', photos: [] }]);
  assert.match(block, /^PHOTOS/);
  assert.match(block, /For "bakery":/);
  assert.match(block, /Photo by Elisha Terada \[https:\/\/unsplash\.com\/@elishaterada\?utm_source=appblips&utm_medium=referral\]/);
  assert.doesNotMatch(block, /"none"/);
  assert.equal(formatPhotoPicks([]), '');
});

test('only photos this session handed out, new in the build, are reported', async () => {
  const photo = toPhoto(PHOTO);
  await executeFindPhotos({ function: { name: 'find_photos', arguments: '{"query":"bakery","orientation":null}' } }, { left: 1 }, { search: async () => ({ results: [photo] }) });
  const resized = photo.url.replace('w=1600', 'w=800').replace(/&/g, '&amp;');
  const reported = [];
  const track = async (ids) => { reported.push(ids); return { tracked: ids.length }; };
  assert.equal(await trackUsedPhotos({}, { 'index.html': `<img src="${resized}"><img src="https://images.unsplash.com/photo-999?w=10">` }, { track }), 1);
  assert.deepEqual(reported, [['IYjXGUpJH74']]);
  assert.equal(await trackUsedPhotos({ 'index.html': `<img src="${photo.url}">` }, { 'index.html': `<img src="${photo.url}">` }, { track }), 0);
});

test('the system prompt gets the photo library rules except in games', () => {
  assert.ok(buildHtmlSystemPrompt('website', [], [], true).includes(PHOTO_LIBRARY_PROMPT));
  assert.ok(buildHtmlSystemPrompt('app', [], [], true).includes(PHOTO_LIBRARY_PROMPT));
  assert.ok(!buildHtmlSystemPrompt('game', [], [], true).includes(PHOTO_LIBRARY_PROMPT));
  assert.ok(!buildHtmlSystemPrompt('website', [], [], false).includes(PHOTO_LIBRARY_PROMPT));
});

test('the desktop and Android apps forward to the hosted server unless they have a key', async () => {
  assert.equal(photoLibraryUrl({}), 'https://web.appblips.com');
  assert.equal(photoLibraryUrl({ APPBLIPS_PHOTO_LIBRARY_URL: 'https://my.example/path' }), 'https://my.example');
  assert.equal(photoLibraryUrl({ APPBLIPS_PHOTO_LIBRARY_URL: 'off' }), '');
  assert.equal(photoLibraryUrl({ APPBLIPS_PHOTO_LIBRARY_URL: 'http://plain.example' }), '');

  const sent = [];
  const hosted = async (url, init) => { sent.push({ url, init }); return ok({ query: 'bakery', results: [toPhoto(PHOTO)] }); };
  const app = createAppUnsplashApi({ fetch: hosted });
  const res = await app(request('/api/unsplash/search', { query: 'bakery' }, { origin: 'appblips://app' }), { APPBLIPS_CHAT_ALLOWED_ORIGINS: 'appblips://app' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).results.length, 1);
  assert.equal(sent[0].url, 'https://web.appblips.com/api/unsplash/search');
  assert.equal(JSON.parse(sent[0].init.body).query, 'bakery');
  // No Origin goes along (the app's own process), so the hosted server's
  // other-site check lets it through.
  assert.equal(sent[0].init.headers.origin, undefined);

  // The hosted server unreachable, or turned off: no photo library.
  const down = createAppUnsplashApi({ fetch: async () => { throw new TypeError('offline'); } });
  assert.deepEqual(await (await down(request('/api/unsplash/status'), {})).json(), { available: false });
  assert.equal((await down(request('/api/unsplash/search', { query: 'x' }), {})).status, 503);
  assert.deepEqual(await (await app(request('/api/unsplash/status'), { APPBLIPS_PHOTO_LIBRARY_URL: 'off' })).json(), { available: false });

  // With a key of its own, the app searches Unsplash itself.
  const unsplash = stub(() => ok({ results: [PHOTO] }));
  const own = createAppUnsplashApi({ fetch: unsplash.fetch });
  assert.equal((await own(request('/api/unsplash/search', { query: 'x' }), ENV)).status, 200);
  assert.match(unsplash.calls[0].url, /^https:\/\/api\.unsplash\.com\//);
});

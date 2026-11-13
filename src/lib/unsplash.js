// The built-in photo library, page side of /api/unsplash
// (electron/server/unsplashApi.js). When the server has an Unsplash key, the
// build agent gets a find_photos tool and picks real photos from Unsplash
// instead of writing image addresses from memory. Searches go through the
// server, which signs them with the host's key; nobody using AppBlips needs
// an Unsplash account.
//
// Whether it is available is asked once when the app starts
// (refreshPhotoLibrary) and kept here, so a build makes no extra request.
// Photos the AI was given are remembered for this session, so a build that
// starts using one can report its download (trackUsedPhotos), as Unsplash's
// guidelines require. Framework-free so it can be tested with plain node.
import { invalidArgumentsError } from './edits.js';
import { logWarn } from './errorLog.js';

export const FIND_PHOTOS_TOOL_NAME = 'find_photos';
export const MAX_PHOTO_SEARCHES_PER_REQUEST = 6;
// Before a first build: enough for a hero and a few sections.
export const MAX_PHOTO_SEARCHES_BEFORE_BUILD = 4;

async function call(path, body, { signal = null } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    return { error: 'Couldn’t reach AppBlips’ photo library. Try again.' };
  }
  try {
    return await response.json();
  } catch {
    return { error: `The photo search failed (error ${response.status}).` };
  }
}

let available = false;
export const photoLibraryAvailable = () => available;
export async function refreshPhotoLibrary() {
  try {
    available = (await call('/api/unsplash/status', {}))?.available === true;
  } catch {
    available = false;
  }
  return available;
}

// The images.unsplash.com path of every photo handed to the AI this session,
// to its Unsplash id.
const given = new Map();
const pathOf = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'images.unsplash.com' ? parsed.pathname : '';
  } catch {
    return '';
  }
};

export const FIND_PHOTOS_TOOL = {
  type: 'function',
  function: {
    name: FIND_PHOTOS_TOOL_NAME,
    description: 'Searches the built-in photo library (Unsplash) and returns up to 6 real photos, each with a ready-to-use url, its size, a description and the photographer to credit. Use it for every photograph the page shows. Search with a few plain English words describing the picture, like "bakery counter with bread" or "team meeting in bright office".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the photo should show, in a few plain English words.' },
        orientation: { type: ['string', 'null'], enum: ['landscape', 'portrait', 'squarish', null], description: 'The shape the spot needs: landscape for heroes and banners, portrait for tall cards, squarish for avatars and tiles. Null for any.' },
      },
      required: ['query', 'orientation'],
      additionalProperties: false,
    },
    strict: true,
  },
};

export const isFindPhotosCall = (toolCall) => toolCall?.function?.name === FIND_PHOTOS_TOOL_NAME;

const searchPhotos = (args, options) => call('/api/unsplash/search', args, options);

// Runs one find_photos call. -> the JSON-able result for the tool message.
// Never throws, except when the prompt was cancelled.
export async function executeFindPhotos(toolCall, budget, { search = searchPhotos, signal = null } = {}) {
  let args;
  try {
    args = JSON.parse(toolCall.function?.arguments || '{}');
  } catch (err) {
    logWarn(`find_photos arguments were not valid JSON, reported back to the model. Model sent: ${String(toolCall.function?.arguments ?? '').slice(0, 300)}`, err);
    return { success: false, error: invalidArgumentsError(err) };
  }
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  if (!query) return { success: false, error: 'query must be a few words describing the photo.' };
  if (budget.left <= 0) {
    return { success: false, error: 'The photo search limit for this request has been reached. Use the photos you already found, or a gradient or illustration instead.' };
  }
  budget.left--;
  const orientation = ['landscape', 'portrait', 'squarish'].includes(args.orientation) ? args.orientation : null;
  const response = await search({ query, ...(orientation ? { orientation } : {}) }, { signal });
  if (response?.error) {
    if (response.stop) budget.left = 0;
    return { success: false, error: `Photo search failed: ${response.error} Use a gradient or illustration for this spot instead.` };
  }
  const photos = (Array.isArray(response?.results) ? response.results : []).filter((photo) => typeof photo?.url === 'string');
  for (const photo of photos) {
    const path = pathOf(photo.url);
    if (path && typeof photo.id === 'string') given.set(path, photo.id);
  }
  if (!photos.length) return { success: true, query, photos: [], note: 'No photos matched. Try other words, or use a gradient or illustration.' };
  return { success: true, query, photos };
}

// The photo library for one prompt, or null when this server has none.
// -> { tools(), isCall, execute(toolCall), canCall() }
export function startPhotoSearch({ searches = MAX_PHOTO_SEARCHES_PER_REQUEST, signal = null, search, isAvailable = photoLibraryAvailable() } = {}) {
  if (!isAvailable) return null;
  const budget = { left: searches };
  return {
    tools: () => (budget.left > 0 ? [FIND_PHOTOS_TOOL] : []),
    canCall: () => budget.left > 0,
    isCall: isFindPhotosCall,
    execute: (toolCall) => executeFindPhotos(toolCall, budget, { signal, ...(search ? { search } : {}) }),
  };
}

// The photos found before a first build, as a block for the build request, or ''.
export const formatPhotoPicks = (found) => {
  const lines = found.filter(({ photos }) => photos.length).map(({ query, photos }) => [
    `For "${query}":`,
    ...photos.map((p) => `- ${p.url} (${p.width && p.height ? `${p.width}x${p.height}, ` : ''}${p.description || 'no description'}; credit: Photo by ${p.photographer} [${p.photographerUrl}] on Unsplash [${p.unsplashUrl}])`),
  ].join('\n'));
  if (!lines.length) return '';
  return `PHOTOS (found in the photo library for this request; use these addresses exactly as written, and credit each one you use as the PHOTO LIBRARY rules say):\n${lines.join('\n\n')}`;
};

// Reports the download of every library photo `after` uses that `before`
// didn't, as Unsplash's guidelines ask. Fire and forget: never throws.
export async function trackUsedPhotos(before = {}, after = {}, { track = (ids) => call('/api/unsplash/track', { ids }) } = {}) {
  const used = (files) => {
    const ids = new Set();
    for (const text of Object.values(files || {})) {
      if (typeof text !== 'string') continue;
      for (const [url] of text.matchAll(/https:\/\/images\.unsplash\.com\/[^\s"'`()<>\\]+/g)) {
        const id = given.get(pathOf(url.replace(/&amp;/g, '&')));
        if (id) ids.add(id);
      }
    }
    return ids;
  };
  const old = used(before);
  const ids = [...used(after)].filter((id) => !old.has(id));
  if (!ids.length) return 0;
  try {
    return (await track(ids))?.tracked ?? 0;
  } catch (err) {
    logWarn('Could not report the photos this build used to Unsplash', err);
    return 0;
  }
}

// Stock photos the AI wrote from memory. The website prompt points it at
// images.unsplash.com, but it can't look photos up, so some addresses it
// writes don't exist and show as broken images. After a build, each new one
// is loaded once here and the reply says how many failed (llm.js).
// Framework-free; `load` can be replaced so it runs under plain node.

const STOCK_PHOTO_URL_RE = /https:\/\/images\.unsplash\.com\/[^\s"'`()<>\\]+/g;
const LOAD_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const MAX_CHECKED = 60;

const urlsIn = (files) => {
  const urls = new Set();
  for (const text of Object.values(files || {})) {
    if (typeof text !== 'string') continue;
    for (const [url] of text.matchAll(STOCK_PHOTO_URL_RE)) urls.add(url.replace(/&amp;/g, '&'));
  }
  return urls;
};

// Stock photo addresses in `after` that `before` didn't have.
export const findNewStockPhotos = (before, after) => {
  const old = urlsIn(before);
  return [...urlsIn(after)].filter((url) => !old.has(url)).slice(0, MAX_CHECKED);
};

// True when the image loads. Resolves, never rejects.
const loadInBrowser = (url) => new Promise((resolve) => {
  const image = new Image();
  const timer = setTimeout(() => { image.src = ''; resolve(false); }, LOAD_TIMEOUT_MS);
  const done = (ok) => { clearTimeout(timer); resolve(ok); };
  image.onload = () => done(image.naturalWidth > 0);
  image.onerror = () => done(false);
  image.referrerPolicy = 'no-referrer';
  image.src = url;
});

// -> the addresses that didn't load. Empty when images can't be loaded here
// (no DOM) or the device is offline, since then nothing can be told.
export async function findBrokenStockPhotos(urls, { load, signal } = {}) {
  const loader = load || (typeof Image === 'undefined' ? null : loadInBrowser);
  if (!loader || !urls.length) return [];
  if (!load && typeof navigator !== 'undefined' && navigator.onLine === false) return [];
  const broken = [];
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++];
      let ok = false;
      try { ok = await loader(url); } catch { ok = false; }
      if (!ok) broken.push(url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  // All of them failing is far more likely a blocked or failing network than
  // every photo being wrong, unless there was only one.
  if (urls.length > 1 && broken.length === urls.length) return [];
  return urls.filter((url) => broken.includes(url));
}

export const brokenStockPhotosNote = (broken) => {
  if (!broken.length) return '';
  const many = broken.length > 1;
  return `Note: ${many ? `${broken.length} photos` : 'a photo'} I picked for this build didn't load, so ${many ? 'those spots show' : 'that spot shows'} without a picture. Ask me to replace ${many ? 'them' : 'it'}, or add your own photos in My images and tell me where to use them.`;
};

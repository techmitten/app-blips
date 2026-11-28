// Per-visitor limits on the Unsplash searches paid with the server's key
// (unsplashApi.js), for the Cloudflare Worker. A Worker's memory isn't shared
// between requests and doesn't last, so the counts live in one Durable Object
// (worker/unsplashLimitsObject.js), which keeps them in memory and saves each
// change to its storage, so a restart of the object doesn't reset them.
//
// Plain JavaScript over a storage object with the Durable Object storage API's
// list / put / delete, so testing/testWorkerUnsplashLimits.js can run it in Node.
import { DEFAULT_SEARCHES_PER_VISITOR_HOUR } from '../electron/server/unsplashApi.js';

const UNSPLASH = 'u:';
const HOUR_MS = 3_600_000;
const DELETE_BATCH = 128; // the most keys one storage.delete() takes

export function createUnsplashLimitsStore(storage, { now = Date.now, perHour = DEFAULT_SEARCHES_PER_VISITOR_HOUR } = {}) {
  const counts = new Map(); // visitor -> { start, count }

  // Saved counts, read once per start of the object. Entries whose hour is
  // over are deleted.
  let loading = null;
  const load = () => {
    loading ??= (async () => {
      const saved = await storage.list();
      const stale = [];
      for (const [key, value] of saved) {
        if (!key.startsWith(UNSPLASH) || now() - Number(value?.start) >= HOUR_MS) stale.push(key);
        else counts.set(key.slice(UNSPLASH.length), value);
      }
      for (let i = 0; i < stale.length; i += DELETE_BATCH) await storage.delete(stale.slice(i, i + DELETE_BATCH));
    })().catch((err) => {
      loading = null;
      throw err;
    });
    return loading;
  };

  return {
    // Whether `visitor` may make another Unsplash search this hour.
    async allow(visitor) {
      if (!perHour) return true;
      await load();
      const id = visitor || 'unknown';
      let entry = counts.get(id);
      if (!entry || now() - entry.start >= HOUR_MS) entry = { start: now(), count: 0 };
      if (entry.count >= perHour) return false;
      entry.count += 1;
      counts.set(id, entry);
      await storage.put(`${UNSPLASH}${id}`, entry);
      return true;
    },
  };
}

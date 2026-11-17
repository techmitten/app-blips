// The Free option's limits (electron/server/freeLimits.js) for the Cloudflare
// Worker. A Worker's memory isn't shared between requests and doesn't last, so
// the counts live in one Durable Object (worker/freeLimitsObject.js), which
// keeps them in memory and saves each change to its storage, so a restart of
// the object doesn't reset anyone's allowance. Also counts the per-visitor
// Unsplash searches paid with the server's key (unsplashApi.js).
//
// Plain JavaScript over a storage object with the Durable Object storage API's
// list / put / delete, so testing/testWorkerFreeLimits.js can run it in Node.
import { createFreeLimits } from '../electron/server/freeLimits.js';
import { DEFAULT_SEARCHES_PER_VISITOR_HOUR } from '../electron/server/unsplashApi.js';

const VISITOR = 'v:';
const UNSPLASH = 'u:';
const SITE = 'site';
const HOUR_MS = 3_600_000;
const DELETE_BATCH = 128; // the most keys one storage.delete() takes

export const UNAVAILABLE = 'Free AI isn’t available right now. Try again in a few minutes. You can keep building with your own API key in Settings → AI.';

const today = (now) => new Date(now).toISOString().slice(0, 10);

// `rates` replaces fixed rate limits, for tests only (freeLimits.js).
export function createFreeLimitsStore(env, storage, { now = Date.now, unsplashPerHour = DEFAULT_SEARCHES_PER_VISITOR_HOUR, rates = {} } = {}) {
  const limiter = createFreeLimits(env, { now, rates });
  const unsplash = new Map(); // visitor -> { start, count }
  const tickets = new Map(); // id -> { ticket, visitor }
  let nextTicket = 1;

  // Saved counts, read once per start of the object. Entries with nothing
  // left to limit (an earlier day, and their hour over) are deleted.
  let loading = null;
  const load = () => {
    loading ??= (async () => {
      const saved = await storage.list();
      const day = today(now());
      const visitors = [];
      const stale = [];
      for (const [key, value] of saved) {
        if (key.startsWith(VISITOR)) {
          if (value?.day !== day && now() - Number(value?.hourStart) >= HOUR_MS) stale.push(key);
          else visitors.push([key.slice(VISITOR.length), value]);
        } else if (key.startsWith(UNSPLASH)) {
          if (now() - Number(value?.start) >= HOUR_MS) stale.push(key);
          else unsplash.set(key.slice(UNSPLASH.length), value);
        }
      }
      limiter.restore({ site: saved.get(SITE), visitors });
      for (let i = 0; i < stale.length; i += DELETE_BATCH) await storage.delete(stale.slice(i, i + DELETE_BATCH));
    })().catch((err) => {
      loading = null;
      throw err;
    });
    return loading;
  };

  const save = (visitor) => storage.put({
    [`${VISITOR}${visitor}`]: limiter.exportVisitor(visitor),
    [SITE]: limiter.exportSite(),
  });

  return {
    limits: limiter.limits,

    // { refused } or { ticket } to pass to end(). If the counts can't be read
    // or saved, the request is refused: Free AI never runs unlimited.
    async begin(visitor, messageId = '') {
      try {
        await load();
      } catch (err) {
        console.error('[free-limits] could not read the saved counts:', err);
        return { refused: { error: UNAVAILABLE, retryAfter: 60 } };
      }
      const started = limiter.begin(visitor, messageId);
      if (started.refused) return started;
      try {
        await save(visitor);
      } catch (err) {
        console.error('[free-limits] could not save the counts:', err);
        started.end(0);
        return { refused: { error: UNAVAILABLE, retryAfter: 60 } };
      }
      const id = nextTicket++;
      tickets.set(id, { ticket: started, visitor });
      return { ticket: id };
    },

    // The request is over and used `tokens`. A ticket from before a restart
    // is gone; its tokens are still counted.
    async end(id, visitor, tokens) {
      await load();
      const held = tickets.get(id);
      tickets.delete(id);
      if (held) held.ticket.end(tokens);
      else limiter.addTokens(visitor, tokens);
      await save(visitor);
    },

    // Whether `visitor` may make another Unsplash search this hour.
    async allowUnsplash(visitor) {
      if (!unsplashPerHour) return true;
      await load();
      const id = visitor || 'unknown';
      let entry = unsplash.get(id);
      if (!entry || now() - entry.start >= HOUR_MS) entry = { start: now(), count: 0 };
      if (entry.count >= unsplashPerHour) return false;
      entry.count += 1;
      unsplash.set(id, entry);
      await storage.put(`${UNSPLASH}${id}`, entry);
      return true;
    },
  };
}

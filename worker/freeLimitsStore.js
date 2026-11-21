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
const BLOCK = 'b:';
const SITE = 'site';
const PAUSE = 'pause';
const POLICY = 'policy';
const EVENTS = 'events';
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
      const blocked = [];
      const stale = [];
      for (const [key, value] of saved) {
        if (key.startsWith(VISITOR)) {
          if (value?.day !== day && now() - Number(value?.hourStart) >= HOUR_MS) stale.push(key);
          else visitors.push([key.slice(VISITOR.length), value]);
        } else if (key.startsWith(UNSPLASH)) {
          if (now() - Number(value?.start) >= HOUR_MS) stale.push(key);
          else unsplash.set(key.slice(UNSPLASH.length), value);
        } else if (key.startsWith(BLOCK)) {
          if (value?.expiresAt != null && Number(value.expiresAt) <= now()) stale.push(key);
          else blocked.push([key.slice(BLOCK.length), value]);
        }
      }
      limiter.restore({
        site: saved.get(SITE),
        visitors,
        blocked,
        pause: saved.get(PAUSE),
        policy: saved.get(POLICY),
        events: saved.get(EVENTS),
      });
      for (let i = 0; i < stale.length; i += DELETE_BATCH) await storage.delete(stale.slice(i, i + DELETE_BATCH));
    })().catch((err) => {
      loading = null;
      throw err;
    });
    return loading;
  };

  const save = (visitor, { includeEvents = false } = {}) => {
    const entries = {
      [`${VISITOR}${visitor}`]: limiter.exportVisitor(visitor),
      [SITE]: limiter.exportSite(),
    };
    if (includeEvents) entries[EVENTS] = limiter.exportEvents();
    return storage.put(entries);
  };

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
      if (started.refused) {
        // Persist refusal counts, abuse events, and any newly triggered auto-block.
        const entries = {
          [`${VISITOR}${visitor}`]: limiter.exportVisitor(visitor),
          [SITE]: limiter.exportSite(),
          [EVENTS]: limiter.exportEvents(),
        };
        const block = limiter.exportBlock(visitor);
        if (block) entries[`${BLOCK}${visitor}`] = block;
        await storage.put(entries).catch(() => {});
        return started;
      }
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

    // Live daily usage & abuse snapshot for the admin dashboard (worker/freeUsageAdminApi.js).
    async snapshot({ limit = 100, minPct = 0, flaggedOnly = false } = {}) {
      await load();
      const data = limiter.snapshot();
      const maxVisitors = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
      const pctFloor = Number.isFinite(Number(minPct)) && Number(minPct) > 0 ? Number(minPct) : 0;
      let filtered = data.visitors;
      if (flaggedOnly) {
        filtered = filtered.filter((v) => v.riskLevel !== 'none');
      } else if (pctFloor > 0) {
        filtered = filtered.filter((v) => v.pct != null && v.pct >= pctFloor);
      }
      return {
        ...data,
        visitors: filtered.slice(0, maxVisitors),
      };
    },

    async blockVisitor(visitor, options = {}) {
      await load();
      const id = String(visitor || '').trim();
      if (!id) return null;
      const entry = limiter.blockVisitor(id, options);
      await storage.put({
        [`${BLOCK}${id}`]: entry,
        [EVENTS]: limiter.exportEvents(),
      });
      return entry;
    },

    async unblockVisitor(visitor) {
      await load();
      const id = String(visitor || '').trim();
      const removed = limiter.unblockVisitor(id);
      await storage.delete(`${BLOCK}${id}`);
      await storage.put({ [EVENTS]: limiter.exportEvents() });
      return removed;
    },

    async setPaused(paused, reason = '') {
      await load();
      const next = limiter.setPaused(paused, reason);
      await storage.put({
        [PAUSE]: next,
        [EVENTS]: limiter.exportEvents(),
      });
      return next;
    },

    async setPolicy(options = {}) {
      await load();
      const next = limiter.setPolicy(options);
      await storage.put({
        [POLICY]: next,
        [EVENTS]: limiter.exportEvents(),
      });
      return next;
    },
  };
}

// Limits on the Free option: requests answered with the server's own
// provider (OPENAI_API_KEY), on a server many people can reach.
// Requests with the visitor's own key are never limited. server.js and the
// Cloudflare Worker turn this on; set APPBLIPS_FREE_LIMITS=off for a server
// only you use. In server.js the counts live in memory, so a restart clears
// them (the Worker saves them); the provider's own spending cap stays the
// hard ceiling.
//
// Rate limits (RATE_LIMITS) are fixed protection against rapid-fire use and
// can't be changed: per visitor, 6 chat messages a minute, 3 s between
// messages, 120 AI requests an hour and 4 at once.
//
// Usage caps are off unless set:
//   APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY  per visitor, UTC day
//   APPBLIPS_FREE_TOKENS_PER_DAY         everyone together, UTC day
//   APPBLIPS_FREE_MAX_OUTPUT_TOKENS      per request (blank keeps the app's
//                                        64k default, or the user's setting)
// A visitor is an IP address (an IPv6 /64, since one connection usually holds
// a whole /64), or the signed-in account when Free AI needs a sign-in
// (freeAuth.js).

export const RATE_LIMITS = Object.freeze({
  messagesPerMinute: 6,
  messageGapSeconds: 3,
  requestsPerHour: 120,
  concurrent: 4,
});
const USAGE_CAPS = {
  tokensPerIpPerDay: 'APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY',
  tokensPerDay: 'APPBLIPS_FREE_TOKENS_PER_DAY',
  maxOutputTokens: 'APPBLIPS_FREE_MAX_OUTPUT_TOKENS',
};
const MINUTE_MS = 60_000;
// One chat message makes many requests (the AI's turns, tool calls, repairs),
// and the page tags them all with the message's id. Requests with an id seen
// recently are part of that message and not counted again, up to a cap each,
// so a script can't ride one id forever.
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MESSAGE_TTL_MS = 30 * 60_000;
const MAX_REQUESTS_PER_MESSAGE = 60;
const MAX_MESSAGES_TRACKED = 50;
const HOUR_MS = 3_600_000;
const MAX_VISITORS = 50_000;
const MAX_EVENTS = 50;

// The fixed rate limits (`rates` replaces some, for tests only) and the usage
// caps from `env`, 0 meaning none. A blank, 0 or unreadable cap is no cap.
const readLimits = (env, rates = {}) => {
  const limits = { ...RATE_LIMITS, ...rates };
  for (const [field, name] of Object.entries(USAGE_CAPS)) {
    const value = Number(String(env?.[name] ?? '').replace(/[,_\s]/g, ''));
    limits[field] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  return limits;
};

export const freeLimitsEnabled = (env) => !/^(off|false|0|no)$/i.test(String(env?.APPBLIPS_FREE_LIMITS ?? '').trim());

// ---- Client IP -------------------------------------------------------------
// Proxies append the address that connected to them to X-Forwarded-For, so the
// right end of the list is trustworthy and the left end is whatever the
// visitor wrote. Walking from the right past private addresses (the hosting
// platform's internal hops) gives the address that reached the platform. When
// that is Cloudflare (web.appblips.com is proxied by it), the entry Cloudflare
// added just before it is the visitor.

const v4ToInt = (ip) => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
};
const v6ToBigInt = (ip) => {
  if (!/^[0-9a-f:]+$/i.test(ip) || (ip.match(/::/g) || []).length > 1) return null;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g, 16)), 0n);
};
const inCidr = (ip, cidr) => {
  const [base, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  if (base.includes(':')) {
    const a = v6ToBigInt(ip);
    const b = v6ToBigInt(base);
    if (a == null || b == null) return false;
    const shift = BigInt(128 - bits);
    return a >> shift === b >> shift;
  }
  const a = v4ToInt(ip);
  const b = v4ToInt(base);
  if (a == null || b == null) return false;
  const shift = 32 - bits;
  return Math.floor(a / 2 ** shift) === Math.floor(b / 2 ** shift);
};

const PRIVATE = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '0.0.0.0/8',
  '::1/128', 'fc00::/7', 'fe80::/10', '::/128',
];
// https://www.cloudflare.com/ips/ (stable for years).
const CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const clean = (ip) => {
  let value = String(ip || '').trim().toLowerCase();
  if (value.startsWith('[')) value = value.slice(1, value.indexOf(']'));
  if (value.startsWith('::ffff:') && value.includes('.')) value = value.slice(7);
  // An IPv4 address with a port.
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.split(':')[0];
  return v4ToInt(value) != null || v6ToBigInt(value) != null ? value : '';
};
const isPrivate = (ip) => PRIVATE.some((cidr) => inCidr(ip, cidr));
const isCloudflare = (ip) => CLOUDFLARE.some((cidr) => inCidr(ip, cidr));

// The visitor's address from X-Forwarded-For and the socket's peer.
export const clientIp = (forwardedFor, peer) => {
  const chain = [...String(forwardedFor || '').split(','), peer].map(clean).filter(Boolean);
  let i = chain.length - 1;
  while (i > 0 && isPrivate(chain[i])) i -= 1;
  if (i > 0 && isCloudflare(chain[i])) i -= 1;
  return chain[i] || '';
};

// The key a visitor is counted under: the address, or its /64 for IPv6.
export const visitorKey = (ip) => {
  const n = ip && ip.includes(':') ? v6ToBigInt(ip) : null;
  return n == null ? ip || 'unknown' : `${(n >> 64n).toString(16)}::/64`;
};

// ---- Usage -----------------------------------------------------------------

// Tokens a finished response used: the provider's usage totals (the last
// stream chunk, or the JSON body), else an estimate of about 4 characters a
// token over what was sent and received. Cached input reads (Anthropic's
// cache_read_input_tokens or OpenAI-style prompt_tokens_details.cached_tokens)
// are weighted at 0.1 (10%), matching Anthropic's cache-read billing rate.
const nonNeg = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const usageTokens = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  const cacheRead = nonNeg(usage.cache_read_input_tokens ?? usage.prompt_tokens_details?.cached_tokens);
  const weightedCacheRead = Math.ceil(cacheRead * 0.1);
  const total = nonNeg(usage.total_tokens);
  if (total > 0) {
    // OpenAI-compatible totals (including anthropic.js usageOf) already include
    // cached input tokens at 100%; replace that full weight with 10%.
    const adjusted = total - Math.min(total, cacheRead) + weightedCacheRead;
    return adjusted > 0 ? adjusted : null;
  }
  if ('prompt_tokens' in usage || 'completion_tokens' in usage) {
    const prompt = nonNeg(usage.prompt_tokens);
    const completion = nonNeg(usage.completion_tokens);
    const adjusted = (prompt - Math.min(prompt, cacheRead)) + weightedCacheRead + completion;
    return adjusted > 0 ? adjusted : null;
  }
  const effective = nonNeg(usage.input_tokens)
    + nonNeg(usage.cache_creation_input_tokens)
    + weightedCacheRead
    + nonNeg(usage.output_tokens);
  return effective > 0 ? effective : null;
};

// Wraps a response so `done(tokens)` runs once, when its body ends, fails or
// is cancelled. The body passes through unchanged.
export const meterResponse = (response, { sentChars = 0, done }) => {
  let finished = false;
  let receivedChars = 0;
  let reported = null;
  let pending = '';
  let whole = '';
  const decoder = new TextDecoder();
  const readLine = (line) => {
    const text = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
    if (!text.includes('"usage"')) return;
    try { reported = usageTokens(JSON.parse(text).usage) ?? reported; } catch { /* partial or not JSON */ }
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    if (pending) readLine(pending);
    if (reported == null && whole) readLine(whole);
    done(reported ?? Math.ceil((sentChars + receivedChars) / 4));
  };
  if (!response.body) {
    finish();
    return response;
  }
  const meter = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      const text = decoder.decode(chunk, { stream: true });
      receivedChars += text.length;
      // A non-streamed reply is one JSON body; keep it (bounded) to read at the end.
      if (whole.length < 4_000_000) whole += text;
      const lines = (pending + text).split('\n');
      pending = lines.pop();
      for (const line of lines) readLine(line);
    },
    flush: finish,
  });
  const body = response.body.pipeThrough(meter);
  // A client that goes away cancels the stream without a flush.
  const reader = body.getReader();
  const relayed = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done: ended } = await reader.read();
        if (ended) {
          finish();
          controller.close();
        } else controller.enqueue(value);
      } catch (err) {
        finish();
        controller.error(err);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(relayed, { status: response.status, statusText: response.statusText, headers: response.headers });
};

// ---- Limiter ---------------------------------------------------------------

const today = (now) => new Date(now).toISOString().slice(0, 10);

const refusal = (error, retryAfterSeconds = null) => ({ refused: { error, retryAfter: retryAfterSeconds } });

// Returns { limits, begin(visitor) } where begin gives { refused } or
// { end(tokens) } to call once when the request is over. The other methods
// let a host that can't keep this object in memory (the Cloudflare Worker's
// Durable Object, worker/freeLimitsStore.js) save and restore the counts.
export function createFreeLimits(env, { now = Date.now, rates = {} } = {}) {
  const limits = readLimits(env, rates);
  const visitors = new Map();
  const blocked = new Map(); // key -> { blockedAt, expiresAt, reason }
  let pause = { paused: false, pausedAt: null, reason: '' };
  // Automated abuse blocking is OFF by default so the admin has full manual
  // control until they explicitly activate it from the dashboard.
  let policy = { autoBlockAbuse: false, autoBlockHours: 24, updatedAt: null };
  let events = []; // newest first, bounded to MAX_EVENTS
  let site = { day: today(now()), tokens: 0 };

  const recordEvent = (visitor, type, detail = '') => {
    events.unshift({
      at: new Date(now()).toISOString(),
      visitor,
      type,
      detail,
    });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  };

  const activeBlock = (key) => {
    const entry = blocked.get(key);
    if (!entry) return null;
    if (entry.expiresAt != null && entry.expiresAt <= now()) {
      blocked.delete(key);
      return null;
    }
    return entry;
  };

  const visitorFor = (key) => {
    const day = today(now());
    if (site.day !== day) site = { day, tokens: 0 };
    let visitor = visitors.get(key);
    if (!visitor) {
      if (visitors.size >= MAX_VISITORS) {
        // Drop idle visitors from earlier days first, then the oldest.
        for (const [k, v] of visitors) if (v.day !== day && !v.inFlight) visitors.delete(k);
        if (visitors.size >= MAX_VISITORS) visitors.delete(visitors.keys().next().value);
      }
      visitor = {
        day,
        tokens: 0,
        hourStart: now(),
        hourCount: 0,
        minuteStart: now(),
        minuteCount: 0,
        lastMessageAt: null,
        messages: new Map(),
        inFlight: 0,
        refusals: 0,
        rateLimitRefusals: 0,
        lastRefusalAt: null,
        lastRefusalReason: '',
        lastIp: '',
        ips: [],
      };
      visitors.set(key, visitor);
    }
    if (visitor.day !== day) {
      Object.assign(visitor, {
        day,
        tokens: 0,
        refusals: 0,
        rateLimitRefusals: 0,
        lastRefusalAt: null,
        lastRefusalReason: '',
        ips: [],
      });
    }
    if (now() - visitor.hourStart >= HOUR_MS) Object.assign(visitor, { hourStart: now(), hourCount: 0 });
    if (now() - visitor.minuteStart >= MINUTE_MS) Object.assign(visitor, { minuteStart: now(), minuteCount: 0 });
    return visitor;
  };

  const secondsToMidnight = () => {
    const t = now();
    const d = new Date(t);
    return Math.max(60, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t) / 1000));
  };
  const OWN_KEY = 'You can keep building with your own API key in Settings → AI.';

  const failVisitor = (key, visitor, reasonCode, detail, message, retryAfterSeconds, isRateLimit = false) => {
    visitor.refusals = (visitor.refusals || 0) + 1;
    if (isRateLimit) visitor.rateLimitRefusals = (visitor.rateLimitRefusals || 0) + 1;
    visitor.lastRefusalAt = now();
    visitor.lastRefusalReason = reasonCode;
    recordEvent(key, reasonCode, detail);
    // Only auto-block abusive visitors when the admin has explicitly turned on
    // Automated Abuse Blocking mode. Existing rate limits / token caps still
    // work normally either way.
    if (
      policy.autoBlockAbuse
      && reasonCode !== 'blocked'
      && !activeBlock(key)
      && (visitor.rateLimitRefusals >= 5 || (reasonCode === 'user_token_cap' && visitor.refusals >= 5))
    ) {
      const t = now();
      const hours = Number(policy.autoBlockHours) > 0 ? Number(policy.autoBlockHours) : 24;
      const reason = visitor.rateLimitRefusals >= 5
        ? `Auto-blocked after ${visitor.rateLimitRefusals} rate-limit refusals`
        : `Auto-blocked after ${visitor.refusals} post-cap attempts`;
      blocked.set(key, { blockedAt: t, expiresAt: t + Math.round(hours * HOUR_MS), reason });
      recordEvent(key, 'auto_block', `${reason} (${hours}h)`);
    }
    return refusal(message, retryAfterSeconds);
  };

  return {
    limits,
    // One visitor's counts, and the site-wide ones, as plain JSON.
    exportVisitor(key) {
      const v = visitors.get(key);
      if (!v) return null;
      const {
        day, tokens, hourStart, hourCount, minuteStart, minuteCount, lastMessageAt, messages,
        refusals = 0, rateLimitRefusals = 0, lastRefusalAt = null, lastRefusalReason = '',
        lastIp = '', ips = [],
      } = v;
      return {
        day,
        tokens,
        hourStart,
        hourCount,
        minuteStart,
        minuteCount,
        lastMessageAt,
        messages: [...messages],
        refusals,
        rateLimitRefusals,
        lastRefusalAt,
        lastRefusalReason,
        lastIp,
        ips: Array.isArray(ips) ? [...ips] : [],
      };
    },
    exportSite: () => ({ ...site }),
    exportBlock: (key) => {
      const b = activeBlock(key);
      return b ? { ...b } : null;
    },
    exportPause: () => ({ ...pause }),
    exportPolicy: () => ({ ...policy }),
    exportEvents: () => events.slice(0, MAX_EVENTS),
    setPolicy({ autoBlockAbuse, autoBlockHours } = {}) {
      const nextEnabled = Boolean(autoBlockAbuse);
      const nextHours = Number.isFinite(Number(autoBlockHours)) && Number(autoBlockHours) > 0
        ? Math.min(24 * 30, Math.floor(Number(autoBlockHours)))
        : policy.autoBlockHours;
      policy = { autoBlockAbuse: nextEnabled, autoBlockHours: nextHours, updatedAt: now() };
      recordEvent(
        'site',
        nextEnabled ? 'admin_auto_on' : 'admin_auto_off',
        nextEnabled
          ? `Automated abuse blocking enabled (${nextHours}h blocks)`
          : 'Automated abuse blocking disabled (manual control)',
      );
      return { ...policy };
    },
    blockVisitor(key, { durationHours = 24, reason = '' } = {}) {
      const id = String(key || '').trim();
      if (!id) return null;
      const t = now();
      const hours = Number(durationHours);
      const expiresAt = Number.isFinite(hours) && hours > 0 ? t + Math.round(hours * HOUR_MS) : null;
      const cleanReason = String(reason || '').trim().slice(0, 200);
      const entry = { blockedAt: t, expiresAt, reason: cleanReason };
      blocked.set(id, entry);
      recordEvent(id, 'admin_block', cleanReason || (expiresAt ? `Blocked for ${hours}h` : 'Blocked indefinitely'));
      return { ...entry };
    },
    unblockVisitor(key) {
      const id = String(key || '').trim();
      const existed = blocked.delete(id);
      if (existed) recordEvent(id, 'admin_unblock', 'Unblocked by admin');
      return existed;
    },
    setPaused(isPaused, reason = '') {
      const next = Boolean(isPaused);
      const cleanReason = String(reason || '').trim().slice(0, 200);
      pause = {
        paused: next,
        pausedAt: next ? now() : null,
        reason: next ? cleanReason : '',
      };
      recordEvent('site', next ? 'admin_pause' : 'admin_resume', cleanReason || (next ? 'Free AI paused by admin' : 'Free AI resumed by admin'));
      return { ...pause };
    },
    // Live daily usage & abuse snapshot for operator monitoring, sorted by tokens used.
    snapshot() {
      const t = now();
      const day = today(t);
      const d = new Date(t);
      const resetsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
      const roundPct = (ratio) => Math.round(ratio * 1000) / 10;
      const siteTokens = site.day === day ? site.tokens : 0;

      // Prune expired blocks and collect active ones.
      const blockedList = [];
      for (const [key] of blocked) {
        const b = activeBlock(key);
        if (b) {
          blockedList.push({
            visitor: key,
            blockedAt: new Date(b.blockedAt).toISOString(),
            expiresAt: b.expiresAt != null ? new Date(b.expiresAt).toISOString() : null,
            reason: b.reason || '',
          });
        }
      }
      blockedList.sort((a, b) => Date.parse(b.blockedAt) - Date.parse(a.blockedAt));

      const list = [];
      let atLimit = 0;
      let nearLimit80 = 0;
      let nearLimit50 = 0;
      let flaggedVisitors = 0;
      let refusalsToday = 0;

      for (const [key, v] of visitors) {
        const tokens = v.day === day ? v.tokens : 0;
        const refusals = v.day === day ? (v.refusals || 0) : 0;
        const rateLimitRefusals = v.day === day ? (v.rateLimitRefusals || 0) : 0;
        const hourRequests = t - v.hourStart < HOUR_MS ? v.hourCount : 0;
        const block = activeBlock(key);
        if (tokens === 0 && hourRequests === 0 && v.inFlight === 0 && refusals === 0 && !block) continue;

        const pct = limits.tokensPerIpPerDay ? roundPct(tokens / limits.tokensPerIpPerDay) : null;
        const hitLimit = Boolean(limits.tokensPerIpPerDay && tokens >= limits.tokensPerIpPerDay);
        if (hitLimit) atLimit += 1;
        else if (pct != null && pct >= 80) nearLimit80 += 1;
        else if (pct != null && pct >= 50) nearLimit50 += 1;
        refusalsToday += refusals;

        // Abuse detection heuristics
        const abuseFlags = [];
        if (block) abuseFlags.push('blocked');
        if (rateLimitRefusals >= 5) abuseFlags.push('repeated_rate_limit');
        else if (rateLimitRefusals >= 2) abuseFlags.push('rate_limit_hits');
        if (limits.requestsPerHour && hourRequests >= Math.floor(limits.requestsPerHour * 0.8)) {
          abuseFlags.push('high_request_rate');
        } else if (limits.requestsPerHour && hourRequests >= Math.floor(limits.requestsPerHour * 0.5)) {
          abuseFlags.push('elevated_request_rate');
        }
        if (hitLimit && refusals >= 2) abuseFlags.push('post_cap_hammering');

        let riskLevel = 'none';
        if (block) riskLevel = 'blocked';
        else if (rateLimitRefusals >= 5 || abuseFlags.includes('high_request_rate') || abuseFlags.includes('post_cap_hammering')) {
          riskLevel = 'high';
        } else if (rateLimitRefusals >= 2 || abuseFlags.includes('elevated_request_rate')) {
          riskLevel = 'medium';
        }
        if (riskLevel === 'high' || riskLevel === 'medium') flaggedVisitors += 1;

        list.push({
          visitor: key,
          lastIp: v.lastIp || '',
          ips: Array.isArray(v.ips) ? [...v.ips] : [],
          tokens,
          remaining: limits.tokensPerIpPerDay ? Math.max(0, limits.tokensPerIpPerDay - tokens) : null,
          pct,
          hitLimit,
          hourRequests,
          inFlight: v.inFlight,
          refusals,
          rateLimitRefusals,
          lastRefusalReason: v.day === day ? (v.lastRefusalReason || '') : '',
          abuseFlags,
          riskLevel,
          blocked: block ? {
            blockedAt: new Date(block.blockedAt).toISOString(),
            expiresAt: block.expiresAt != null ? new Date(block.expiresAt).toISOString() : null,
            reason: block.reason || '',
          } : null,
          lastActiveAt: v.lastMessageAt != null ? new Date(v.lastMessageAt).toISOString() : null,
        });
      }
      list.sort((a, b) => b.tokens - a.tokens || b.refusals - a.refusals || b.hourRequests - a.hourRequests || a.visitor.localeCompare(b.visitor));
      return {
        day,
        resetsAt,
        pause: {
          paused: pause.paused,
          pausedAt: pause.pausedAt != null ? new Date(pause.pausedAt).toISOString() : null,
          reason: pause.reason || '',
        },
        policy: {
          autoBlockAbuse: policy.autoBlockAbuse,
          autoBlockHours: policy.autoBlockHours,
          updatedAt: policy.updatedAt != null ? new Date(policy.updatedAt).toISOString() : null,
        },
        limits: {
          tokensPerIpPerDay: limits.tokensPerIpPerDay,
          tokensPerDay: limits.tokensPerDay,
          requestsPerHour: limits.requestsPerHour,
          maxOutputTokens: limits.maxOutputTokens,
        },
        site: {
          tokens: siteTokens,
          limit: limits.tokensPerDay,
          remaining: limits.tokensPerDay ? Math.max(0, limits.tokensPerDay - siteTokens) : null,
          pct: limits.tokensPerDay ? roundPct(siteTokens / limits.tokensPerDay) : null,
          hitLimit: Boolean(limits.tokensPerDay && siteTokens >= limits.tokensPerDay),
        },
        summary: {
          activeVisitors: list.length,
          atLimit,
          nearLimit80,
          nearLimit50,
          flaggedVisitors,
          blockedVisitors: blockedList.length,
          refusalsToday,
        },
        blocked: blockedList,
        recentEvents: events.slice(0, MAX_EVENTS),
        visitors: list,
      };
    },
    // Puts saved counts back. Nothing is in flight after a restart.
    restore({ site: savedSite = null, visitors: saved = [], blocked: savedBlocked = [], pause: savedPause = null, policy: savedPolicy = null, events: savedEvents = [] } = {}) {
      if (savedSite && typeof savedSite.day === 'string') site = { day: savedSite.day, tokens: Number(savedSite.tokens) || 0 };
      for (const [key, v] of saved) {
        if (!v || typeof v !== 'object') continue;
        visitors.set(key, {
          ...v,
          refusals: Number(v.refusals) || 0,
          rateLimitRefusals: Number(v.rateLimitRefusals) || 0,
          lastRefusalAt: v.lastRefusalAt ?? null,
          lastRefusalReason: String(v.lastRefusalReason || ''),
          lastIp: String(v.lastIp || ''),
          ips: Array.isArray(v.ips) ? v.ips.filter((x) => typeof x === 'string' && x).slice(0, 10) : [],
          messages: new Map(Array.isArray(v.messages) ? v.messages : []),
          inFlight: 0,
        });
      }
      for (const [key, b] of savedBlocked) {
        if (!b || typeof b !== 'object') continue;
        if (b.expiresAt != null && b.expiresAt <= now()) continue;
        blocked.set(key, { blockedAt: Number(b.blockedAt) || now(), expiresAt: b.expiresAt ?? null, reason: String(b.reason || '') });
      }
      if (savedPause && typeof savedPause === 'object') {
        pause = {
          paused: Boolean(savedPause.paused),
          pausedAt: savedPause.pausedAt ?? null,
          reason: String(savedPause.reason || ''),
        };
      }
      if (savedPolicy && typeof savedPolicy === 'object' && typeof savedPolicy.autoBlockAbuse === 'boolean') {
        policy = {
          autoBlockAbuse: savedPolicy.autoBlockAbuse,
          autoBlockHours: Number.isFinite(Number(savedPolicy.autoBlockHours)) && Number(savedPolicy.autoBlockHours) > 0
            ? Number(savedPolicy.autoBlockHours)
            : 24,
          updatedAt: savedPolicy.updatedAt ?? null,
        };
      }
      if (Array.isArray(savedEvents)) {
        events = savedEvents.slice(0, MAX_EVENTS);
      }
    },
    // Tokens of a request whose ticket was lost (its host restarted mid-request).
    addTokens(key, tokens) {
      const used = Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
      visitorFor(key).tokens += used;
      site.tokens += used;
    },
    begin(key, messageId = '', ip = '') {
      const visitor = visitorFor(key);
      const cleanIp = String(ip || '').trim().slice(0, 64);
      if (cleanIp && cleanIp !== 'unknown') {
        visitor.lastIp = cleanIp;
        visitor.ips = [cleanIp, ...(visitor.ips || []).filter((x) => x !== cleanIp)].slice(0, 10);
      }
      if (pause.paused) {
        const msg = pause.reason
          ? `Free AI is temporarily paused: ${pause.reason} ${OWN_KEY}`
          : `Free AI is temporarily paused. ${OWN_KEY}`;
        return refusal(msg, 300);
      }
      const block = activeBlock(key);
      if (block) {
        const wait = block.expiresAt != null ? Math.max(60, Math.ceil((block.expiresAt - now()) / 1000)) : 3600;
        return failVisitor(
          key,
          visitor,
          'blocked',
          block.reason || 'Blocked visitor attempted request',
          `Free AI access is restricted for this account. ${OWN_KEY}`,
          wait,
        );
      }
      if (limits.tokensPerDay && site.tokens >= limits.tokensPerDay) {
        return failVisitor(
          key,
          visitor,
          'site_token_cap',
          'Site-wide daily token cap reached',
          `Free AI has used up today’s allowance for everyone. It resets at midnight UTC. ${OWN_KEY}`,
          secondsToMidnight(),
        );
      }
      if (limits.tokensPerIpPerDay && visitor.tokens >= limits.tokensPerIpPerDay) {
        return failVisitor(
          key,
          visitor,
          'user_token_cap',
          'User daily token cap reached',
          `You’ve used today’s Free AI allowance. It resets at midnight UTC. ${OWN_KEY}`,
          secondsToMidnight(),
        );
      }
      if (limits.requestsPerHour && visitor.hourCount >= limits.requestsPerHour) {
        const wait = Math.max(1, Math.ceil((visitor.hourStart + HOUR_MS - now()) / 1000));
        return failVisitor(
          key,
          visitor,
          'hourly_rate_limit',
          `Exceeded ${limits.requestsPerHour} req/hour`,
          `You’ve reached the Free AI limit of ${limits.requestsPerHour} requests an hour. Try again in about ${Math.ceil(wait / 60)} min. ${OWN_KEY}`,
          wait,
          true,
        );
      }
      // Another request of a message already counted is free of the message limits.
      const id = MESSAGE_ID_RE.test(String(messageId)) ? String(messageId) : '';
      const known = id ? visitor.messages.get(id) : null;
      const continues = known && now() - known.at < MESSAGE_TTL_MS && known.requests < MAX_REQUESTS_PER_MESSAGE;
      if (!continues) {
        if (limits.messageGapSeconds && visitor.lastMessageAt != null && now() - visitor.lastMessageAt < limits.messageGapSeconds * 1000) {
          const wait = Math.max(1, Math.ceil((visitor.lastMessageAt + limits.messageGapSeconds * 1000 - now()) / 1000));
          return failVisitor(
            key,
            visitor,
            'message_gap',
            `Sent messages faster than ${limits.messageGapSeconds}s gap`,
            `You’re sending messages too quickly. Wait ${wait}s and try again.`,
            wait,
            true,
          );
        }
        if (limits.messagesPerMinute && visitor.minuteCount >= limits.messagesPerMinute) {
          const wait = Math.max(1, Math.ceil((visitor.minuteStart + MINUTE_MS - now()) / 1000));
          return failVisitor(
            key,
            visitor,
            'minute_rate_limit',
            `Exceeded ${limits.messagesPerMinute} messages/min`,
            `You’re sending messages too quickly. Wait ${wait}s and try again.`,
            wait,
            true,
          );
        }
      }
      if (limits.concurrent && visitor.inFlight >= limits.concurrent) {
        return failVisitor(
          key,
          visitor,
          'concurrency_limit',
          `Exceeded ${limits.concurrent} concurrent requests`,
          'Free AI is still answering your other requests. Try again when they finish.',
          5,
          true,
        );
      }
      visitor.hourCount += 1;
      if (continues) {
        known.requests += 1;
      } else {
        visitor.minuteCount += 1;
        visitor.lastMessageAt = now();
        if (id) {
          visitor.messages.delete(id);
          visitor.messages.set(id, { at: now(), requests: 1 });
          if (visitor.messages.size > MAX_MESSAGES_TRACKED) visitor.messages.delete(visitor.messages.keys().next().value);
        }
      }
      visitor.inFlight += 1;
      let ended = false;
      return {
        end(tokens) {
          if (ended) return;
          ended = true;
          visitor.inFlight = Math.max(0, visitor.inFlight - 1);
          const used = Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
          // Usage reported after midnight counts toward the new day.
          visitorFor(key).tokens += used;
          site.tokens += used;
        },
      };
    },
  };
}

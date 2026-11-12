// Limits on the Free option: requests answered with the server's own
// provider (OPENAI_API_KEY), on a server many people can reach, like a
// Hugging Face Space. Requests with the visitor's own key are never limited.
// server.js turns this on; set APPBLIPS_FREE_LIMITS=off for a server only you
// use. The counts live in memory, so a restart clears them; the provider's
// own spending cap stays the hard ceiling.
//
//   APPBLIPS_FREE_REQUESTS_PER_HOUR      per visitor              (default 120)
//   APPBLIPS_FREE_CONCURRENT             per visitor, at once     (default 4)
//   APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY  per visitor, UTC day     (default 2,000,000)
//   APPBLIPS_FREE_TOKENS_PER_DAY         everyone together        (default 30,000,000)
//   APPBLIPS_FREE_MAX_OUTPUT_TOKENS      per request              (default none: the
//                                        app's 64k default, or the user's setting)
// 0 turns one limit off. A visitor is an IP address (an IPv6 /64, since one
// connection usually holds a whole /64).

const DEFAULTS = {
  requestsPerHour: ['APPBLIPS_FREE_REQUESTS_PER_HOUR', 120],
  concurrent: ['APPBLIPS_FREE_CONCURRENT', 4],
  tokensPerIpPerDay: ['APPBLIPS_FREE_TOKENS_PER_IP_PER_DAY', 2_000_000],
  tokensPerDay: ['APPBLIPS_FREE_TOKENS_PER_DAY', 30_000_000],
  maxOutputTokens: ['APPBLIPS_FREE_MAX_OUTPUT_TOKENS', 0],
};
const HOUR_MS = 3_600_000;
const MAX_VISITORS = 50_000;

const readLimits = (env) => {
  const limits = {};
  for (const [field, [name, fallback]] of Object.entries(DEFAULTS)) {
    const raw = String(env?.[name] ?? '').replace(/[,_\s]/g, '');
    const value = raw === '' ? fallback : Number(raw);
    limits[field] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
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
// token over what was sent and received.
const usageTokens = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  const total = Number(usage.total_tokens);
  if (Number.isFinite(total) && total > 0) return total;
  const sum = Number(usage.prompt_tokens || usage.input_tokens || 0) + Number(usage.completion_tokens || usage.output_tokens || 0);
  return sum > 0 ? sum : null;
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
// { end(tokens) } to call once when the request is over.
export function createFreeLimits(env, { now = Date.now } = {}) {
  const limits = readLimits(env);
  const visitors = new Map();
  let site = { day: today(now()), tokens: 0 };

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
      visitor = { day, tokens: 0, hourStart: now(), hourCount: 0, inFlight: 0 };
      visitors.set(key, visitor);
    }
    if (visitor.day !== day) Object.assign(visitor, { day, tokens: 0 });
    if (now() - visitor.hourStart >= HOUR_MS) Object.assign(visitor, { hourStart: now(), hourCount: 0 });
    return visitor;
  };

  const secondsToMidnight = () => {
    const t = now();
    const d = new Date(t);
    return Math.max(60, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t) / 1000));
  };
  const OWN_KEY = 'You can keep building with your own API key in Settings → AI.';

  return {
    limits,
    begin(key) {
      const visitor = visitorFor(key);
      if (limits.tokensPerDay && site.tokens >= limits.tokensPerDay) {
        return refusal(`Free AI has used up today’s allowance for everyone. It resets at midnight UTC. ${OWN_KEY}`, secondsToMidnight());
      }
      if (limits.tokensPerIpPerDay && visitor.tokens >= limits.tokensPerIpPerDay) {
        return refusal(`You’ve used today’s Free AI allowance. It resets at midnight UTC. ${OWN_KEY}`, secondsToMidnight());
      }
      if (limits.requestsPerHour && visitor.hourCount >= limits.requestsPerHour) {
        const wait = Math.max(1, Math.ceil((visitor.hourStart + HOUR_MS - now()) / 1000));
        return refusal(`You’ve reached the Free AI limit of ${limits.requestsPerHour} requests an hour. Try again in about ${Math.ceil(wait / 60)} min. ${OWN_KEY}`, wait);
      }
      if (limits.concurrent && visitor.inFlight >= limits.concurrent) {
        return refusal('Free AI is still answering your other requests. Try again when they finish.', 5);
      }
      visitor.hourCount += 1;
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

// Secret- and account-protected admin API (/api/admin/free-usage*) for the
// Cloudflare Worker's visual Free AI Usage & Abuse Dashboard (/admin/usage).
//
// Access is granted when EITHER of these is configured on the Worker:
//   APPBLIPS_ADMIN_USER_IDS  Comma-separated Clerk user IDs (e.g. user_2abc…)
//                            allowed to view and control the dashboard after
//                            signing in with Google/GitHub.
//   APPBLIPS_ADMIN_TOKEN     Optional standalone Bearer secret (set via
//                            `npx wrangler secret put APPBLIPS_ADMIN_TOKEN`).
//
// Endpoints:
//   GET  /api/admin/free-usage          Live usage, abuse flags, blocks & recent events
//   POST /api/admin/free-usage/block    { visitor, durationHours, reason }
//   POST /api/admin/free-usage/unblock  { visitor }
//   POST /api/admin/free-usage/pause    { paused, reason }
//   POST /api/admin/free-usage/mode     { autoBlockAbuse, autoBlockHours }
//   POST /api/admin/free-usage/chat     { messages } — unmetered admin AI assistant
import { createHash, timingSafeEqual } from 'node:crypto';
import { freeLimitsEnabled } from '../electron/server/freeLimits.js';
import { checkFreeSignIn } from '../electron/server/freeAuth.js';
import { handleChatProxy } from '../electron/server/chatProxy.js';

const NO_STORE_JSON = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...NO_STORE_JSON, ...extraHeaders },
});

const sha256 = (value) => createHash('sha256').update(String(value)).digest();

const secretsMatch = (provided, expected) => {
  if (!provided || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
};

const parseAdminUserIds = (env) => new Set(
  String(env?.APPBLIPS_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

async function authorizeAdmin(request, env, checkSignIn) {
  const expectedToken = String(env?.APPBLIPS_ADMIN_TOKEN ?? '').trim();
  const adminUserIds = parseAdminUserIds(env);
  if (!expectedToken && adminUserIds.size === 0) {
    return json(503, { error: 'Admin dashboard is not configured. Set APPBLIPS_ADMIN_USER_IDS or APPBLIPS_ADMIN_TOKEN.' });
  }

  const auth = request.headers.get('authorization') || '';
  const providedToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!providedToken) {
    return json(401, { error: 'Sign in required.' }, { 'www-authenticate': 'Bearer' });
  }

  if (expectedToken && secretsMatch(providedToken, expectedToken)) {
    return null;
  }

  if (adminUserIds.size > 0) {
    const signedIn = await checkSignIn(request, env);
    if (signedIn?.user) {
      if (adminUserIds.has(signedIn.user)) return null;
      return json(403, { error: 'Your signed-in account does not have admin access.' });
    }
  }

  return json(401, { error: 'Unauthorized.' }, { 'www-authenticate': 'Bearer' });
}

// `actions` can be either a Durable Object stub / store object ({ snapshot,
// blockVisitor, unblockVisitor, setPaused, setPolicy }) or (for backwards
// compatibility with simple callers) a function `(options) => snapshot`.
const normalizeActions = (actions) => (typeof actions === 'function' ? { snapshot: actions } : actions);

function buildAdminSystemPrompt(snapshot, limitsEnabled) {
  const compactSnapshot = {
    freeLimitsEnabled: limitsEnabled,
    day: snapshot.day,
    resetsAt: snapshot.resetsAt,
    pause: snapshot.pause,
    policy: snapshot.policy,
    limits: snapshot.limits,
    site: snapshot.site,
    summary: snapshot.summary,
    blocked: (snapshot.blocked || []).slice(0, 25),
    topUsers: (snapshot.visitors || []).slice(0, 40),
    recentEvents: (snapshot.recentEvents || []).slice(0, 30),
  };
  return [
    'You are the built-in AI assistant inside the AppBlips Free AI Admin Dashboard.',
    'Your job is to help the site owner understand the dashboard, interpret live token usage, and spot potential API abuse in plain, beginner-friendly English.',
    '',
    'Important AppBlips context:',
    '- Free AI uses the server owner’s own AI key. Users with their own API key in Settings -> AI are never tracked or limited here.',
    '- Daily token counts reset automatically at 00:00 UTC. Raising a cap in Cloudflare unblocks affected users immediately.',
    '- Normal multi-turn app builds resend the project context on each edit, so a single normal user can legitimately use several million tokens in a day (roughly ~30M tokens is ~$1 on DeepSeek with prompt caching). High token usage alone does NOT automatically mean abuse.',
    '- Strong signs of abuse include: repeated rate-limit hits (5+ refusals), hammering requests after already hitting 100% of the daily cap, very high hourly request rates (near 120/hr), or many rapid-fire attempts.',
    '- In Manual Only mode (default), the admin system only flags suspicious users and NEVER auto-blocks them. Automated mode auto-blocks users who hit 5+ rate-limit or post-cap refusals.',
    '- Controls on this page: "Block" (blocks one account/IP for 1h/24h/7d/permanent), "Pause Free AI" (emergency site-wide kill switch; own-key users unaffected), and "Abuse Blocking Mode" (Manual Only vs Automated).',
    '',
    'Guidelines:',
    '- Be concise, clear, and easy to scan (short paragraphs or brief bullet points).',
    '- Base every answer strictly on the live dashboard data below. Cite specific numbers, percentages, and user IDs when relevant.',
    '- If there is no sign of abuse, reassure the owner clearly.',
    '',
    'LIVE DASHBOARD DATA (JSON):',
    JSON.stringify(compactSnapshot),
  ].join('\n');
}

function sanitizeChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const cleaned = [];
  for (const item of raw.slice(-20)) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : '';
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, 4000) : '';
    if (role && content) cleaned.push({ role, content });
  }
  return cleaned;
}

const CLERK_API_BASE = 'https://api.clerk.com/v1';
const CLERK_CACHE_TTL_MS = 10 * 60_000;
const CLERK_CACHE_MAX = 2000;
const clerkUserCache = new Map(); // userId -> { email, name, at }

const pickClerkEmail = (user) => {
  const list = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
  const primary = list.find((e) => e?.id === user?.primary_email_address_id) || list[0];
  return typeof primary?.email_address === 'string' ? primary.email_address.trim() : '';
};

const pickClerkName = (user) => {
  const full = [user?.first_name, user?.last_name]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return full || (typeof user?.username === 'string' ? user.username.trim() : '');
};

async function lookupClerkProfiles(visitorKeys, env, fetchImpl = fetch) {
  const secretKey = String(env?.CLERK_SECRET_KEY ?? '').trim();
  const profiles = new Map();
  if (!secretKey) return { enabled: false, profiles };

  const now = Date.now();
  const missing = [];
  const seen = new Set();
  for (const key of visitorKeys) {
    if (typeof key !== 'string' || !key.startsWith('user:')) continue;
    const userId = key.slice(5).trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const cached = clerkUserCache.get(userId);
    if (cached && now - cached.at < CLERK_CACHE_TTL_MS) {
      profiles.set(userId, { email: cached.email, name: cached.name });
    } else {
      missing.push(userId);
    }
  }

  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const params = new URLSearchParams({ limit: '100' });
    for (const id of batch) params.append('user_id', id);
    try {
      const res = await fetchImpl(`${CLERK_API_BASE}/users?${params.toString()}`, {
        headers: { authorization: `Bearer ${secretKey}` },
      });
      if (!res.ok) {
        console.warn('[free-limits] Clerk user lookup returned HTTP', res.status);
        continue;
      }
      const payload = await res.json().catch(() => null);
      const users = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      for (const user of users) {
        if (typeof user?.id !== 'string' || !user.id) continue;
        const entry = { email: pickClerkEmail(user), name: pickClerkName(user) };
        profiles.set(user.id, entry);
        if (clerkUserCache.size >= CLERK_CACHE_MAX) {
          clerkUserCache.delete(clerkUserCache.keys().next().value);
        }
        clerkUserCache.set(user.id, { ...entry, at: now });
      }
    } catch (err) {
      console.warn('[free-limits] Clerk user lookup failed:', err?.message || err);
    }
  }

  return { enabled: true, profiles };
}

async function enrichSnapshotWithEmails(snapshot, env, fetchImpl) {
  const keys = [
    ...(snapshot.visitors || []).map((v) => v.visitor),
    ...(snapshot.blocked || []).map((b) => b.visitor),
    ...(snapshot.recentEvents || []).map((e) => e.visitor),
  ];
  const { enabled, profiles } = await lookupClerkProfiles(keys, env, fetchImpl);
  const profileFor = (visitor) => (typeof visitor === 'string' && visitor.startsWith('user:')
    ? profiles.get(visitor.slice(5)) || null
    : null);

  return {
    ...snapshot,
    emailLookupEnabled: enabled,
    visitors: (snapshot.visitors || []).map((v) => {
      const p = profileFor(v.visitor);
      return p ? { ...v, email: p.email, name: p.name } : v;
    }),
    blocked: (snapshot.blocked || []).map((b) => {
      const p = profileFor(b.visitor);
      return p ? { ...b, email: p.email, name: p.name } : b;
    }),
    recentEvents: (snapshot.recentEvents || []).map((e) => {
      const p = profileFor(e.visitor);
      return p ? { ...e, email: p.email, name: p.name } : e;
    }),
  };
}

export async function handleFreeUsageAdminApi(request, env, actionsOrSnapshot, { checkSignIn = checkFreeSignIn, chatProxy = handleChatProxy, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const actions = normalizeActions(actionsOrSnapshot);

  if (path === '/api/admin/free-usage') {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    const denied = await authorizeAdmin(request, env, checkSignIn);
    if (denied) return denied;

    const rawLimit = url.searchParams.get('limit');
    const rawMinPct = url.searchParams.get('minPct');
    const flaggedOnly = url.searchParams.get('flagged') === '1' || url.searchParams.get('flagged') === 'true';
    const limit = rawLimit !== null ? Math.max(1, Math.min(500, Math.floor(Number(rawLimit) || 100))) : 100;
    const minPct = rawMinPct !== null && Number.isFinite(Number(rawMinPct))
      ? Math.max(0, Math.min(100, Number(rawMinPct)))
      : 0;

    try {
      const raw = await actions.snapshot({ limit, minPct, flaggedOnly });
      const data = await enrichSnapshotWithEmails(raw, env, fetchImpl);
      return json(200, {
        enabled: freeLimitsEnabled(env),
        ...data,
      });
    } catch (err) {
      console.error('[free-limits] could not read usage snapshot:', err);
      return json(503, { error: 'Free limits counter could not be reached.' });
    }
  }

  if (
    path === '/api/admin/free-usage/block'
    || path === '/api/admin/free-usage/unblock'
    || path === '/api/admin/free-usage/pause'
    || path === '/api/admin/free-usage/mode'
    || path === '/api/admin/free-usage/chat'
  ) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    const denied = await authorizeAdmin(request, env, checkSignIn);
    if (denied) return denied;

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Invalid JSON body.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(400, { error: 'Expected a JSON object.' });
    }

    try {
      if (path === '/api/admin/free-usage/block') {
        const visitor = String(body.visitor || '').trim();
        if (!visitor || visitor.length > 128) {
          return json(400, { error: 'A valid visitor ID or IP is required.' });
        }
        const durationHours = body.durationHours === null || body.durationHours === 0
          ? 0
          : Math.max(1, Math.min(24 * 365, Number(body.durationHours) || 24));
        const reason = String(body.reason || '').trim().slice(0, 200);
        const entry = await actions.blockVisitor(visitor, { durationHours, reason });
        return json(200, { ok: true, visitor, block: entry });
      }

      if (path === '/api/admin/free-usage/unblock') {
        const visitor = String(body.visitor || '').trim();
        if (!visitor) return json(400, { error: 'A visitor ID or IP is required.' });
        const removed = await actions.unblockVisitor(visitor);
        return json(200, { ok: true, visitor, removed });
      }

      if (path === '/api/admin/free-usage/pause') {
        const paused = Boolean(body.paused);
        const reason = String(body.reason || '').trim().slice(0, 200);
        const state = await actions.setPaused(paused, reason);
        return json(200, { ok: true, pause: state });
      }

      if (path === '/api/admin/free-usage/mode') {
        const autoBlockAbuse = Boolean(body.autoBlockAbuse);
        const autoBlockHours = body.autoBlockHours != null ? Number(body.autoBlockHours) : undefined;
        const policy = await actions.setPolicy({ autoBlockAbuse, autoBlockHours });
        return json(200, { ok: true, policy });
      }

      if (path === '/api/admin/free-usage/chat') {
        const userMessages = sanitizeChatMessages(body.messages);
        if (userMessages.length === 0 || userMessages[userMessages.length - 1].role !== 'user') {
          return json(400, { error: 'Please enter a question to ask the assistant.' });
        }
        const rawSnapshot = await actions.snapshot({ limit: 50 });
        const liveSnapshot = await enrichSnapshotWithEmails(rawSnapshot, env, fetchImpl);
        const systemPrompt = buildAdminSystemPrompt(liveSnapshot, freeLimitsEnabled(env));
        const proxyPayload = {
          messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
          stream: false,
          ask: true,
          max_tokens: 1500,
          reasoning_effort: 'none',
        };
        const proxyRequest = new Request('https://admin.internal/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(proxyPayload),
          signal: request.signal,
        });
        // Uses the same server-configured Free AI provider, with freeLimits and
        // checkSignIn omitted so admin chats never deduct usage or get limited.
        const upstream = await chatProxy(proxyRequest, env, {
          freeLimits: null,
          checkSignIn: null,
          freeImages: false,
        });
        const upstreamBody = await upstream.json().catch(() => null);
        if (!upstream.ok) {
          return json(upstream.status >= 400 ? upstream.status : 502, {
            error: upstreamBody?.error || 'The AI assistant could not answer right now.',
          });
        }
        const reply = String(upstreamBody?.choices?.[0]?.message?.content ?? '').trim();
        if (!reply) {
          return json(502, { error: 'The AI returned an empty response.' });
        }
        return json(200, {
          reply,
          model: upstreamBody?.model || '',
          generatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('[free-limits] admin action failed:', err);
      return json(503, { error: 'Free limits counter could not be reached.' });
    }
  }

  return json(404, { error: 'Not found.' });
}

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
import { createHash, timingSafeEqual } from 'node:crypto';
import { freeLimitsEnabled } from '../electron/server/freeLimits.js';
import { checkFreeSignIn } from '../electron/server/freeAuth.js';

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
// blockVisitor, unblockVisitor, setPaused }) or (for backwards compatibility
// with simple callers) a function `(options) => snapshot`.
const normalizeActions = (actions) => (typeof actions === 'function' ? { snapshot: actions } : actions);

export async function handleFreeUsageAdminApi(request, env, actionsOrSnapshot, { checkSignIn = checkFreeSignIn } = {}) {
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
      const data = await actions.snapshot({ limit, minPct, flaggedOnly });
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
    } catch (err) {
      console.error('[free-limits] admin action failed:', err);
      return json(503, { error: 'Free limits counter could not be reached.' });
    }
  }

  return json(404, { error: 'Not found.' });
}

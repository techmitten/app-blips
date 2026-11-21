// The browser version of AppBlips on Cloudflare Workers: the same /api/*
// handlers as server.js (the desktop app and Docker are unchanged), with the
// built client (dist/) served as static assets by Cloudflare before this runs
// (wrangler.jsonc). Settings come from the Worker's variables and secrets.
//
// Differences from server.js:
// - The visitor's address is CF-Connecting-IP, set by Cloudflare itself.
// - The Free option's counts, and the per-visitor Unsplash searches, live in
//   one Durable Object (worker/freeLimitsObject.js), since a Worker's memory
//   doesn't last between requests. If it can't be reached, Free AI refuses.
// - No Host allow-list: Cloudflare only routes this Worker's own addresses.
// - The SEO scan has no DNS check (no resolver here); its name check stays,
//   and a Worker can't reach private networks anyway.
import { handleChatProxy } from '../electron/server/chatProxy.js';
import { createBrowserKeys } from '../electron/server/browserKeys.js';
import { createFreeLimits, freeLimitsEnabled, visitorKey } from '../electron/server/freeLimits.js';
import { handleProviderApi } from '../electron/server/providerApi.js';
import { handleSurgeApi } from '../electron/server/surgeApi.js';
import { handlePollinationsApi } from '../electron/server/pollinationsApi.js';
import { handlePixabayApi } from '../electron/server/pixabayApi.js';
import { handleTavilyApi } from '../electron/server/tavilyApi.js';
import { handleWebToolsApi } from '../electron/server/webToolsApi.js';
import { createUnsplashApi } from '../electron/server/unsplashApi.js';
import { handleSeoScanApi } from '../electron/server/seoScanApi.js';
import { withSavedProvider } from '../electron/server/savedProvider.js';
import { SECURITY_HEADERS } from '../electron/server/staticFiles.js';
import { MAX_CHAT_BODY_BYTES, MAX_BODY_BYTES } from '../electron/server/nodeHttp.js';
import { UNAVAILABLE } from './freeLimitsStore.js';
import { checkFreeSignIn } from '../electron/server/freeAuth.js';
import { handleClerkWebhook } from '../electron/server/clerkWebhook.js';

export { FreeLimits } from './freeLimitsObject.js';

const MESSAGE_HEADER = 'x-appblips-message';
const withKeys = createBrowserKeys();

const limiterStub = (env) => env.FREE_LIMITS.get(env.FREE_LIMITS.idFromName('site'));

// The freeLimits object chatProxy.js and webToolsApi.js expect, backed by the
// Durable Object. end() runs after the response has gone, so waitUntil keeps
// the Worker alive until the count is saved.
function freeLimitsFor(env, ctx) {
  if (!freeLimitsEnabled(env)) return null;
  const stub = limiterStub(env);
  return {
    limits: createFreeLimits(env).limits,
    async begin(visitor, messageId) {
      let started;
      try {
        started = await stub.begin(visitor, messageId);
      } catch (err) {
        console.error('[free-limits] the counter could not be reached:', err);
        return { refused: { error: UNAVAILABLE, retryAfter: 60 } };
      }
      if (started.refused) return started;
      let ended = false;
      return {
        end(tokens) {
          if (ended) return;
          ended = true;
          ctx.waitUntil(stub.end(started.ticket, visitor, tokens).catch((err) => {
            console.error('[free-limits] could not record usage:', err);
          }));
        },
      };
    },
  };
}

const unsplashApis = new WeakMap();
// Searches paid with this server's Unsplash key are counted per visitor in
// the Durable Object; the search cache stays per instance (losing it is fine).
const unsplashApiFor = (env) => {
  if (!unsplashApis.has(env.FREE_LIMITS)) {
    unsplashApis.set(env.FREE_LIMITS, createUnsplashApi({
      allowVisitor: async (visitor) => {
        try {
          return await limiterStub(env).allowUnsplash(visitor);
        } catch (err) {
          console.error('[free-limits] the counter could not be reached:', err);
          return false;
        }
      },
    }));
  }
  return unsplashApis.get(env.FREE_LIMITS);
};

const text = (status, body, headers = {}) => new Response(body, {
  status,
  headers: { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', ...headers },
});

const withSecurityHeaders = (response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const tooLarge = (request, limit) => Number(request.headers.get('content-length')) > limit;

const startsWithPath = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

async function handleApi(request, env, ctx, path) {
  const visitor = visitorKey(request.headers.get('cf-connecting-ip') || '');
  const messageId = request.headers.get(MESSAGE_HEADER) || '';
  // With Clerk keys set, Free AI needs a Google or GitHub sign-in (freeAuth.js).
  const checkSignIn = (req) => checkFreeSignIn(req, env);

  if (path === '/api/chat') {
    if (request.method !== 'POST') return text(405, 'Method not allowed');
    if (tooLarge(request, MAX_CHAT_BODY_BYTES)) return Response.json({ error: 'The request is too large.' }, { status: 413 });
    const freeLimits = freeLimitsFor(env, ctx);
    return withKeys('provider', request, async (keys) => handleChatProxy(await withSavedProvider(request, keys), env, { freeLimits, visitor, messageId, checkSignIn, freeImages: false }));
  }
  if (tooLarge(request, MAX_BODY_BYTES)) return Response.json({ error: 'The request is too large.' }, { status: 413 });
  if (startsWithPath(path, '/api/provider')) return withKeys('provider', request, (keys) => handleProviderApi(request, env, keys));
  if (startsWithPath(path, '/api/surge')) return withKeys('surge', request, (keys) => handleSurgeApi(request, env, keys));
  if (startsWithPath(path, '/api/pollinations')) return withKeys('pollinations', request, (keys) => handlePollinationsApi(request, env, keys));
  if (startsWithPath(path, '/api/pixabay')) return withKeys('pixabay', request, (keys) => handlePixabayApi(request, env, keys));
  if (startsWithPath(path, '/api/tavily')) return withKeys('tavily', request, (keys) => handleTavilyApi(request, env, keys));
  if (path.startsWith('/api/web/')) {
    const freeLimits = freeLimitsFor(env, ctx);
    return withKeys('provider', request, async (keys) => handleWebToolsApi(await withSavedProvider(request, keys), env, { freeLimits, visitor, messageId, checkSignIn, freeSearch: false }));
  }
  if (path.startsWith('/api/unsplash/')) return unsplashApiFor(env)(request, env, { visitor });
  if (path === '/api/seo/scan') return handleSeoScanApi(request, env);
  if (path === '/api/webhooks/clerk') return handleClerkWebhook(request, env);
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    try {
      const response = path.startsWith('/api/') ? await handleApi(request, env, ctx, path) : null;
      // Anything else (an unknown /api/ path included) is the app, as in server.js.
      return withSecurityHeaders(response ?? await env.ASSETS.fetch(request));
    } catch (err) {
      console.error('[worker] request failed:', path, err);
      return text(500, 'Internal error.');
    }
  },
};

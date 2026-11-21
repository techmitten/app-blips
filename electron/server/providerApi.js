// /api/provider/*: checks the Settings → AI key and lists models with it.
// The browser version runs this inside the page (src/lib/browserDirect.js),
// so the key stays in the visitor's browser; server.js and the Vite dev
// server answer only GET (the server's own settings), plus any request
// from an older page. The app's own code only learns `hasKey`. Fetch
// primitives only, like chatProxy.js. The desktop app answers the same
// questions over IPC instead (electron/main.js).
//
//   GET    /api/provider          -> { id, hasKey, envConfigured, envProvider?, freeSignIn?, maxOutputTokensFixed?, maxOutputTokens? }
//   PUT    /api/provider          -> save { id, model, apiKey, enabled }
//   DELETE /api/provider          -> forget the key
//   POST   /api/provider/models   -> [{ id, label }] for { id, apiKey? }
import { isForeignOrigin } from './chatProxy.js';
import { resolveUserProvider, envProviderStatus, fixedMaxOutputTokens } from './providers.js';
import { freeSignInStatus } from './freeSignInConfig.js';
import { listProviderModels } from './providerModels.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// resolveUserProvider's limit; checked here too because a disabled provider
// is saved without resolving it.
const MAX_KEY_LENGTH = 512;

export async function handleProviderApi(request, env, keys) {
  // Only AppBlips' own page may change or use the key. A JSON body also
  // forces a CORS preflight, which other sites can't pass.
  if (isForeignOrigin(request, env)) return json({ error: 'Not allowed.' }, 403);
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const readBody = async () => {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return null;
    try {
      const body = await request.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  };

  if (path === '/api/provider') {
    // envConfigured: the host's environment variables (OPENAI_API_KEY…)
    // already provide AI, so the page needn't ask for a key.
    // freeSignIn: Free AI needs a Clerk sign-in here (freeAuth.js).
    // maxOutputTokensFixed: the host sets the output limit
    // (APPBLIPS_MAX_OUTPUT_TOKENS), so Settings → AI doesn't offer one.
    if (request.method === 'GET') {
      return json({
        ...keys.describe(),
        ...envProviderStatus(env),
        ...freeSignInStatus(env),
        // The number too: the browser version applies it to own-key requests,
        // which it sends straight to the provider (src/lib/browserDirect.js).
        ...(fixedMaxOutputTokens(env) ? { maxOutputTokensFixed: true, maxOutputTokens: fixedMaxOutputTokens(env) } : {}),
      });
    }
    if (request.method === 'DELETE') {
      await keys.clear();
      return json(keys.describe());
    }
    if (request.method === 'PUT') {
      const info = await readBody();
      if (!info) return json({ error: 'Invalid provider settings.' }, 400);
      const id = typeof info.id === 'string' ? info.id : '';
      const typed = typeof info.apiKey === 'string' ? info.apiKey.trim() : '';
      if (typed.length > MAX_KEY_LENGTH) return json({ error: 'The API key is not valid.' }, 400);
      // An empty key keeps the saved one, unless the provider changes.
      const apiKey = typed || keys.keyFor(id);
      if (info.enabled === true) {
        const resolved = resolveUserProvider({ ...info, apiKey });
        if (resolved.error) return json({ error: resolved.error }, 400);
      }
      if (apiKey) await keys.save(id, apiKey);
      else await keys.clear();
      return json(keys.describe());
    }
    return json({ error: 'Method not allowed.' }, 405);
  }

  if (path === '/api/provider/models') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const input = await readBody();
    if (!input) return json({ error: 'Invalid provider settings.' }, 400);
    const typed = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    try {
      const models = await listProviderModels({ ...input, apiKey: typed || keys.keyFor(input.id) });
      return json(models);
    } catch (err) {
      return json({ error: err?.message || 'Could not load models.' }, 400);
    }
  }

  return json({ error: 'Not found.' }, 404);
}
